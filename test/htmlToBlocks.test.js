// The HTML scanner and classifier run on untrusted, arbitrarily-shaped
// template files, server-side, with no DOM. The failure mode that matters
// most is silent content loss, so most of these assert that something
// survives rather than that it lands in a particular block.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topLevelElements, bodyOf, headOf, splitHtmlIntoSections } from '../src/shared/htmlSections.js';
import { htmlToTypedBlocks, textOf } from '../src/shared/htmlToBlocks.js';
import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';

test('scanner: raw-text elements cannot be broken by their own contents', () => {
  const chunks = topLevelElements(`<script>if (a < b) { document.write("</div>") }</script><p>after</p>`);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].tag, 'script');
  assert.equal(chunks[1].tag, 'p');
});

test('scanner: void and self-closing elements do not unbalance depth', () => {
  const chunks = topLevelElements('<img src="a.png"><br><input type="text"/><p>x</p>');
  assert.deepEqual(chunks.map((c) => c.tag), ['img', 'br', 'input', 'p']);
});

test('scanner: bare < and > in text are data, not markup', () => {
  const chunks = topLevelElements('<p>a < b and 5 > 3</p><p>next</p>');
  assert.equal(chunks.length, 2);
});

test('scanner: an unclosed element still yields its content', () => {
  const chunks = topLevelElements('<div><p>orphan</p>');
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].html.includes('orphan'), 'malformed markup must not silently vanish');
});

test('body/head extraction copes with a missing skeleton', () => {
  assert.equal(bodyOf('<p>bare</p>'), '<p>bare</p>');
  assert.equal(headOf('<p>bare</p>'), '');
  assert.ok(bodyOf('<html><body class="x"><p>hi</p></body></html>').includes('<p>hi</p>'));
});

test('splitting carries stylesheets over and descends single-child wrappers', () => {
  const doc = `<html><head><style>a{}</style><link rel="stylesheet" href="/a.css"><script src="/x.js"></script></head>
    <body><div id="root"><header><h1>Site</h1></header><section><h2>Two</h2></section></div></body></html>`;
  const sections = splitHtmlIntoSections(doc, { makeId: (i) => `s${i}` });
  assert.equal(sections[0].name, 'Page styles');
  assert.ok(sections[0].html.includes('<style>a{}</style>'));
  assert.ok(sections[0].html.includes('a.css'));
  assert.ok(!sections[0].html.includes('x.js'), 'a head <script> is not a stylesheet');
  assert.deepEqual(sections.slice(1).map((s) => s.name), ['Site', 'Two'], 'named from their own headings');
});

test('textOf decodes entities and ignores script/style bodies', () => {
  assert.equal(textOf('<p>Tom &amp; Jerry &mdash; &#39;hi&#39;</p>'), "Tom & Jerry — 'hi'");
  assert.equal(textOf('<style>.a{content:"x"}</style><p>only this</p>'), 'only this');
});

const LANDING = `<!doctype html><html><head><style>.h{}</style></head><body><div id="root">
  <header><img src="/logo.png" alt="Northwind"><nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav></header>
  <section class="hero"><h1>Ship faster</h1><p>Everything you need.</p><a href="/start">Get started</a></section>
  <section><h2>Features</h2><p>Here is what you get.</p><div class="grid">
    <div class="card"><img src="https://cdn.x/1.png" alt="1"><h3>Fast</h3><p>Very fast.</p></div>
    <div class="card"><img src="https://cdn.x/2.png" alt="2"><h3>Safe</h3><p>Very safe.</p></div>
    <div class="card"><img src="https://cdn.x/3.png" alt="3"><h3>Cheap</h3><p>Costs less.</p></div>
  </div></section>
  <footer><p>© Northwind</p><a href="/tos">Terms</a><a href="/privacy">Privacy</a></footer>
</div></body></html>`;

test('classifier: semantic regions and a nested card grid are recognised', () => {
  const blocks = htmlToTypedBlocks(LANDING);
  const types = blocks.map((b) => b.blockType);
  assert.ok(types.includes('header'));
  assert.ok(types.includes('hero'));
  assert.ok(types.includes('card-grid'), 'cards nested under a wrapper must still be found');
  assert.ok(types.includes('footer'));
});

test('classifier: a header with no heading recovers its name from the logo alt', () => {
  const header = htmlToTypedBlocks(LANDING).find((b) => b.blockType === 'header');
  assert.deepEqual(header.fields.headings, ['Northwind']);
});

test('classifier: card content lands in items, not duplicated as section headings', () => {
  const grid = htmlToTypedBlocks(LANDING).find((b) => b.blockType === 'card-grid');
  assert.equal(grid.fields.items.length, 3);
  assert.equal(grid.fields.items[0].heading, 'Fast');
  assert.equal(grid.fields.items[0].body, 'Very fast.');
  assert.ok(!(grid.fields.headings || []).includes('Fast'), 'a card title must not also render as a section heading');
});

test("classifier: a collection's intro text becomes its own block rather than being lost", () => {
  const blocks = htmlToTypedBlocks(LANDING);
  const intro = blocks.find((b) => b.blockType === 'feature' && b.fields.text?.includes('Here is what you get.'));
  assert.ok(intro, 'card-grid renders no free paragraphs, so the intro needs a block of its own');
  assert.ok(blocks.indexOf(intro) < blocks.findIndex((b) => b.blockType === 'card-grid'), 'and it comes first');
});

test('classifier: relative image paths become placeholders, absolute ones survive', () => {
  const blocks = htmlToTypedBlocks(LANDING);
  const grid = blocks.find((b) => b.blockType === 'card-grid');
  assert.ok(grid.fields.items[0].image.startsWith('https://cdn.x/'), 'a real CDN image is kept');

  const rel = htmlToTypedBlocks('<body><section><h2>G</h2><img src="images/a.jpg" alt="Local"><img src="images/b.jpg" alt="B"></section></body>');
  const imgs = rel.flatMap((b) => b.fields.images || []);
  assert.ok(imgs.every((i) => i.src.startsWith('https://placehold.co/')), 'relative paths would 404 against the CMS origin');
});

test('every classified block renders and carries a known type', () => {
  for (const doc of [LANDING, '<div><h1>Just this</h1><p>and this</p></div>', '<body><ul><li><h3>a</h3></li><li><h3>b</h3></li></ul></body>']) {
    for (const b of htmlToTypedBlocks(doc)) {
      assert.ok(b.blockType, 'every block must be typed');
      assert.ok(renderBlock(b.blockType, b.fields), `${b.blockType} rendered empty`);
    }
  }
});

test('empty and junk input degrade quietly', () => {
  assert.deepEqual(htmlToTypedBlocks(''), []);
  assert.deepEqual(htmlToTypedBlocks('   '), []);
  assert.deepEqual(htmlToTypedBlocks('<html><body></body></html>'), []);
  assert.ok(Array.isArray(htmlToTypedBlocks('<<<>>>not really html')));
});

test('a very long document is capped without dropping content', () => {
  const many = Array.from({ length: 60 }, (_, i) => `<section><h2>S${i}</h2><p>body ${i}</p></section>`).join('');
  const blocks = htmlToTypedBlocks(`<body>${many}</body>`);
  assert.ok(blocks.length <= 42, 'the layer list stays usable');
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('S59'), 'the tail is folded into a final block, never discarded');
});
