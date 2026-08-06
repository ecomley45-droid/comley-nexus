// The Virtual Tour block embeds a hosted tour, validated against the same
// provider list that builds the page CSP — so an iframe is only ever emitted
// for a host the browser is allowed to load.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';
import { parseTourInput, tourFrameSrc, TOUR_PROVIDERS } from '../src/shared/tourProviders.js';

// --------------------------------------------------------------- parsing

test('a Matterport share link is accepted as-is', () => {
  const r = parseTourInput('https://my.matterport.com/show/?m=SxQL3iGyoDo');
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'matterport');
  assert.ok(r.url.includes('m=SxQL3iGyoDo'));
});

test('a bare Matterport model id becomes a show URL', () => {
  const r = parseTourInput('SxQL3iGyoDo');
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://my.matterport.com/show/?m=SxQL3iGyoDo');
});

test('the URL is pulled out of a pasted <iframe> embed snippet', () => {
  // This is the thing agents actually copy — the provider's "Embed" button.
  const r = parseTourInput('<iframe width="600" height="400" src="https://kuula.co/share/abc123" frameborder="0"></iframe>');
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'kuula');
  assert.equal(r.url, 'https://kuula.co/share/abc123');
});

test('a provider subdomain is matched by its wildcard', () => {
  const r = parseTourInput('https://unbranded.youriguide.com/tour/123');
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'iguide');
});

test('a host we do not embed is refused, distinctly from empty', () => {
  assert.deepEqual(parseTourInput(''), { ok: false, reason: 'empty' });
  assert.deepEqual(parseTourInput('   '), { ok: false, reason: 'empty' });
  assert.equal(parseTourInput('https://evil.test/tour').reason, 'unsupported');
  // A look-alike host must not slip through a naive "contains" check.
  assert.equal(parseTourInput('https://my.matterport.com.evil.test/x').reason, 'unsupported');
  assert.equal(parseTourInput('https://notmatterport.com/x').reason, 'unsupported');
});

test('a non-https tour is refused — the page CSP could not frame it anyway', () => {
  assert.equal(parseTourInput('http://my.matterport.com/show/?m=x').reason, 'unsupported');
  assert.equal(parseTourInput('javascript:steal()').reason, 'unsupported');
});

// ---------------------------------------------------- CSP / renderer accord

test('every embeddable provider host is in the CSP frame-src', () => {
  const csp = tourFrameSrc();
  for (const p of TOUR_PROVIDERS) {
    for (const h of p.hosts) {
      assert.ok(csp.includes(`https://${h}`), `${h} is embeddable but missing from frame-src`);
    }
    for (const w of p.wildcard || []) {
      assert.ok(csp.includes(`https://*.${w}`), `*.${w} missing from frame-src`);
    }
  }
});

test('the renderer only ever emits an iframe to an allowed host', () => {
  // The invariant that keeps the block honest: if parseTourInput would reject
  // it, no iframe is produced — so the renderer can never emit a frame the CSP
  // then blocks, which would look broken to the visitor.
  for (const bad of ['https://evil.test/x', 'not a url', '', 'ftp://x/y']) {
    assert.ok(!renderBlock('virtual-tour', { tourUrl: bad }).includes('<iframe'), `emitted a frame for ${bad}`);
  }
  const ok = renderBlock('virtual-tour', { tourUrl: 'https://my.matterport.com/show/?m=abc' });
  assert.ok(ok.includes('<iframe') && ok.includes('my.matterport.com'));
});

// ----------------------------------------------------------- the block

test('an empty block explains what to paste; a bad one says it is unsupported', () => {
  assert.ok(renderBlock('virtual-tour', {}).includes('Paste a virtual tour link'));
  assert.ok(renderBlock('virtual-tour', { tourUrl: 'https://evil.test/x' }).includes('we can embed'));
});

test('a tour iframe carries the motion permissions a 360/VR tour needs', () => {
  const html = renderBlock('virtual-tour', { tourUrl: 'https://my.matterport.com/show/?m=abc', height: 640 });
  assert.ok(html.includes('allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen; vr"'));
  assert.ok(html.includes('allowfullscreen'));
  assert.ok(html.includes('height:640px'));
  assert.ok(html.includes('loading="lazy"'));
});

test('height is clamped', () => {
  for (const [given, want] of [[50, 280], [520, 520], [9999, 900], [undefined, 520]]) {
    assert.ok(renderBlock('virtual-tour', { tourUrl: 'https://kuula.co/share/x', height: given }).includes(`height:${want}px`));
  }
});

test('heading, intro and caption render and are escaped', () => {
  const html = renderBlock('virtual-tour', {
    tourUrl: 'https://kuula.co/share/x',
    headings: ['"><script>a()</script>'], text: ['"><script>b()</script>'], caption: '"><img onerror=c>',
  });
  assert.ok(!html.includes('<script>a()') && !html.includes('<script>b()') && !html.includes('<img onerror'));
});
