// The 3D Model block and its sandboxed frame.
//
// The security-relevant claims live in the frame (lib/modelFrame.js): it runs
// with its own CSP, refuses to render a URL we don't host, and never emits the
// AR-executing or foreign-fetching pieces it isn't asked for.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';
import { mediaOrigin, isAllowedMediaUrl, modelFrameCsp, renderModelFrame } from '../lib/modelFrame.js';

const ORIGIN = 'https://proj.supabase.co';
const GLB = `${ORIGIN}/storage/v1/object/public/media/chair.glb`;

// mediaOrigin reads SUPABASE_URL; set it around each test that needs it.
function withEnv(fn) {
  const prev = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = ORIGIN;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prev;
  }
}

// --------------------------------------------------------------- the block

test('the block is empty until a model is chosen', () => {
  const html = renderBlock('model-3d', { headings: ['See it in 3D'] });
  assert.ok(html.includes('Add a 3D model'));
  assert.ok(!html.includes('<iframe'), 'no frame without a file');
});

test('a chosen model becomes a sandboxed iframe carrying its options', () => {
  const html = renderBlock('model-3d', {
    modelUrl: GLB, rotate: true, ar: true, alt: 'A lounge chair', height: 520, headings: ['Our chair'],
  });
  const src = /src="([^"]*model-frame[^"]*)"/.exec(html)[1];
  // Params are URL-encoded and the whole attribute HTML-escaped (&amp;).
  const params = new URLSearchParams(src.split('?')[1].replace(/&amp;/g, '&'));
  assert.equal(params.get('src'), GLB);
  assert.equal(params.get('rotate'), '1');
  assert.equal(params.get('ar'), '1');
  assert.equal(params.get('alt'), 'A lounge chair');
  // xr-spatial-tracking is what lets AR run inside the frame; without it WebXR
  // is blocked there and "view in your space" silently does nothing.
  assert.ok(html.includes('allow="xr-spatial-tracking; fullscreen"'));
  assert.ok(html.includes('height:520px'));
});

test('height is clamped to something a page can hold', () => {
  for (const [given, want] of [[100, 240], [480, 480], [5000, 900], [undefined, 480]]) {
    assert.ok(renderBlock('model-3d', { modelUrl: GLB, height: given }).includes(`height:${want}px`));
  }
});

test('authored fields cannot break out of the iframe attributes', () => {
  const html = renderBlock('model-3d', {
    modelUrl: GLB, alt: '"><script>steal()</script>', caption: '"><img onerror=x>', headings: ['"><b>y</b>'],
  });
  assert.ok(!html.includes('<script>steal()'));
  assert.ok(!html.includes('<img onerror'));
  assert.ok(!html.includes('<b>y</b>'));
});

// --------------------------------------------------------------- the frame

test('only URLs we host are accepted', () => withEnv(() => {
  assert.equal(mediaOrigin(), ORIGIN);
  assert.ok(isAllowedMediaUrl(GLB), 'our storage origin');
  assert.ok(isAllowedMediaUrl('/media/local.glb'), 'a same-origin relative path');
  assert.ok(!isAllowedMediaUrl('https://evil.test/x.glb'), 'a foreign origin');
  assert.ok(!isAllowedMediaUrl('//evil.test/x.glb'), 'protocol-relative is foreign');
  assert.ok(!isAllowedMediaUrl('javascript:steal()'), 'a script URL');
  assert.ok(!isAllowedMediaUrl(''), 'nothing');
}));

test('the frame CSP is locked down to exactly what a viewer needs', () => withEnv(() => {
  const csp = modelFrameCsp();
  assert.ok(csp.includes("default-src 'none'"), 'deny by default');
  assert.ok(csp.includes("script-src 'self' 'wasm-unsafe-eval'"), 'self + wasm decoders, nothing else');
  assert.ok(csp.includes("frame-ancestors 'self'"), 'only our own pages may embed it');
  assert.ok(csp.includes(ORIGIN), 'the model is fetched from storage');
  assert.ok(csp.includes('https://www.gstatic.com'), 'draco/basis decoders');
  assert.ok(!csp.includes("'unsafe-eval'") || csp.includes("'wasm-unsafe-eval'"),
    'wasm-unsafe-eval is not the same door as unsafe-eval');
}));

test('a foreign model is refused with an explanation, not a blank frame', () => withEnv(() => {
  const { ok, html } = renderModelFrame({ src: 'https://evil.test/x.glb' });
  assert.equal(ok, false);
  assert.ok(html.includes('could not be loaded'));
  assert.ok(!html.includes('<model-viewer'), 'nothing is rendered for a URL we reject');
}));

test('AR and its iOS file only appear when AR is asked for', () => withEnv(() => {
  const off = renderModelFrame({ src: GLB, ios: `${ORIGIN}/x.usdz` }).html;
  assert.ok(!off.includes(' ar '), 'no ar attribute when off');
  assert.ok(!off.includes('ar-modes'), 'no ar-modes when off');
  assert.ok(!off.includes('ios-src'), 'no iOS file wired when AR is off');

  const on = renderModelFrame({ src: GLB, ar: '1', ios: `${ORIGIN}/x.usdz` }).html;
  assert.ok(on.includes(' ar '), 'ar attribute present');
  assert.ok(on.includes('ar-modes="webxr scene-viewer quick-look"'));
  assert.ok(on.includes('ios-src='), 'iOS Quick Look needs its own usdz');
  assert.ok(on.includes('View in your space'), 'a labelled AR button');
}));

test('a poster defers the heavy viewer until interaction', () => withEnv(() => {
  const withPoster = renderModelFrame({ src: GLB, poster: `${ORIGIN}/p.webp` }).html;
  assert.ok(withPoster.includes('reveal="interaction"'), 'WebGL context waits for a tap');
  assert.ok(withPoster.includes('poster='));
  const without = renderModelFrame({ src: GLB }).html;
  assert.ok(without.includes('reveal="auto"'));
}));

test('a foreign poster or iOS file is dropped, not trusted', () => withEnv(() => {
  const html = renderModelFrame({ src: GLB, ar: '1', poster: 'https://evil.test/p.jpg', ios: 'https://evil.test/x.usdz' }).html;
  assert.ok(!html.includes('evil.test'), 'every URL in the frame is host-checked, not just the model');
}));

test('the background colour only accepts a hex value', () => withEnv(() => {
  assert.ok(renderModelFrame({ src: GLB, bg: '#f2f3f7' }).html.includes('#f2f3f7'));
  const injected = renderModelFrame({ src: GLB, bg: 'red;}</style><script>x()</script>' }).html;
  assert.ok(!injected.includes('<script>x()'), 'a non-hex bg is ignored');
}));
