// The streaming generator reports progress read from the model's own output,
// never a timer — so a message can't claim something that hasn't happened.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSite } from '../lib/aiSiteGen.js';

// A stand-in Anthropic stream: emits the given text as content_block_delta
// frames, split so a JSON token can straddle two network reads — which is
// exactly the case a naive line parser gets wrong.
function fakeAnthropic(text, { chunkSize = 17, ok = true } = {}) {
  return async () => ({
    ok,
    body: (async function* () {
      const enc = new TextEncoder();
      for (let i = 0; i < text.length; i += chunkSize) {
        const delta = text.slice(i, i + chunkSize);
        const frame = { type: 'content_block_delta', delta: { type: 'text_delta', text: delta } };
        yield enc.encode(`event: content_block_delta\ndata: ${JSON.stringify(frame)}\n\n`);
      }
      yield enc.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    })(),
  });
}

const SITE = JSON.stringify({
  theme: { primary: '#123456', bg: '#ffffff', text: '#111111' },
  pages: [
    { name: 'Home', slug: 'index', sections: [{ name: 'Hero', blockType: 'hero', fields: { headings: ['Hi'] } }] },
    { name: 'About', slug: 'about', sections: [{ name: 'Story', blockType: 'content', fields: { text: ['x'] } }] },
    { name: 'Contact', slug: 'contact', sections: [{ name: 'Form', blockType: 'form', fields: { headings: ['Contact'] } }] },
  ],
});

async function run(text, opts) {
  const realFetch = globalThis.fetch;
  const realKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  globalThis.fetch = fakeAnthropic(text, opts);
  const events = [];
  try {
    const result = await generateSite('A bakery in Austin that ships cookies.', (p) => events.push(p));
    return { result, events };
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = realKey;
  }
}

test('progress is emitted in order, one event per page written', async () => {
  const { result, events } = await run(SITE);
  const phases = events.map((e) => e.phase);
  assert.equal(phases[0], 'thinking');
  assert.ok(phases.includes('theme'), 'the theme lands before any page');
  assert.equal(phases.filter((p) => p === 'page').length, 3, 'one per page in the output');
  assert.equal(phases[phases.length - 1], 'checking');
  assert.ok(phases.indexOf('theme') < phases.indexOf('page'), 'order has to match what actually arrives');
  assert.equal(result.pages.length, 3);
});

test('a page event names the page it is writing', async () => {
  const { events } = await run(SITE);
  const messages = events.filter((e) => e.phase === 'page').map((e) => e.message);
  assert.ok(messages[0].includes('Home'), `expected the first page's name, got ${messages[0]}`);
  assert.ok(messages.some((m) => m.includes('About')));
  assert.ok(messages.some((m) => m.includes('Contact')));
});

test('a token split across two reads is still parsed', async () => {
  // One byte at a time is the pathological case for any buffered parser.
  const { result, events } = await run(SITE, { chunkSize: 1 });
  assert.equal(result.pages.length, 3);
  assert.equal(events.filter((e) => e.phase === 'page').length, 3);
});

test('progress never runs ahead of the output', async () => {
  const { events } = await run(SITE, { chunkSize: 3 });
  // Page N is only ever announced after page N-1.
  const pageNumbers = events.filter((e) => e.phase === 'page').map((e) => e.page);
  assert.deepEqual(pageNumbers, [1, 2, 3], 'a page count must only ever climb by one');
});

test('the callback is optional — the non-streaming path still works', async () => {
  const realFetch = globalThis.fetch;
  const realKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  globalThis.fetch = fakeAnthropic(SITE);
  try {
    const out = await generateSite('A bakery in Austin that ships cookies.');
    assert.equal(out.pages.length, 3);
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = realKey;
  }
});

test('unusable output fails with a message worth showing a user', async () => {
  await assert.rejects(() => run('not json at all'), /unusable response/i);
});
