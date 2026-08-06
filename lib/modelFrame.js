// The sandboxed document that renders a 3D model.
//
// A published page runs a strict CSP: script-src is 'self' plus hashed
// inline, connect-src is 'self'. That blocks the normal way anyone adds 3D to
// the web -- a <script> pulling three.js or <model-viewer> off a CDN -- and it
// blocks the viewer from fetching a .glb that lives on the storage origin. So
// the model does not run on the page. It runs in here, a single-purpose
// same-origin document with its own tuned CSP, embedded in an <iframe>. The
// page's own policy never loosens: it only gains frame-src 'self', exactly as
// it already allows YouTube through frame-src for the Video Embed block.
//
// The frame is served from the SAME host as the page it sits on -- the iframe
// src is relative ("/_nexus/model-frame"), so on a custom domain it resolves
// to that domain, and both the frame and the vendored library load
// same-origin. That is what makes script-src 'self' and frame-ancestors
// 'self' hold without a per-tenant allowlist.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

// The origin our media actually comes from, derived from the same env the
// storage client uses. Public bucket URLs are <origin>/storage/v1/object/...
export function mediaOrigin() {
  try { return new URL(process.env.SUPABASE_URL).origin; } catch { return ''; }
}

// A model/poster/AR URL is acceptable only if we host it: our storage origin,
// or a same-origin relative path (dev, and self-hosted media). Anything else
// -- another origin, a data: or javascript: URI -- is refused. The frame's
// connect-src would block a foreign fetch anyway; this refuses it earlier and
// keeps the endpoint from rendering arbitrary URLs someone crafted by hand.
export function isAllowedMediaUrl(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  if (u.startsWith('/') && !u.startsWith('//')) return true;
  const origin = mediaOrigin();
  return Boolean(origin) && u.startsWith(`${origin}/`);
}

// The frame's own Content-Security-Policy.
//
//   script-src 'self' 'wasm-unsafe-eval'  the vendored library, plus the WASM
//                                         Draco/Basis decoders it runs
//   worker-src blob:                      it decodes off the main thread
//   connect-src ... gstatic.com           it fetches the .glb from storage and
//                                         the decoders from gstatic
//   frame-ancestors 'self'                only our own pages may embed it
//   default-src 'none'                    everything not named is denied
export function modelFrameCsp() {
  const origin = mediaOrigin();
  return [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${origin}`.trim(),
    `connect-src 'self' blob: ${origin} https://www.gstatic.com`.trim(),
    "worker-src blob:",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Build the frame document from validated query params.
 *
 * Returns { ok, html }. A missing or foreign `src` is `ok: false` with an
 * explanatory body rather than a blank frame -- the block above it would
 * otherwise look broken with nothing to say why.
 */
export function renderModelFrame(params = {}) {
  const src = String(params.src || '');
  if (!isAllowedMediaUrl(src)) {
    return {
      ok: false,
      html: frameShell('<p style="font:14px system-ui;color:#555;text-align:center;padding:24px">This 3D model could not be loaded.</p>'),
    };
  }
  const poster = isAllowedMediaUrl(params.poster) ? params.poster : '';
  const ios = isAllowedMediaUrl(params.ios) ? params.ios : '';
  const alt = String(params.alt || '3D model');
  const bg = HEX.test(String(params.bg)) ? params.bg : 'transparent';

  const attrs = [
    `src="${esc(src)}"`,
    `alt="${esc(alt)}"`,
    // Orbit/zoom is the whole point of embedding a model rather than a photo.
    params.interact !== '0' ? 'camera-controls touch-action="pan-y"' : '',
    params.rotate === '1' ? 'auto-rotate rotation-per-second="18deg"' : '',
    // A poster means the heavy WebGL context is not created until someone
    // interacts, so a 3D block never silently taxes a page's load.
    poster ? `poster="${esc(poster)}" reveal="interaction"` : 'reveal="auto"',
    'loading="lazy"',
    'shadow-intensity="1"',
    'environment-image="neutral"',
    params.ar === '1' ? 'ar ar-modes="webxr scene-viewer quick-look"' : '',
    params.ar === '1' && ios ? `ios-src="${esc(ios)}"` : '',
  ].filter(Boolean).join(' ');

  const arButton = params.ar === '1'
    ? '<button slot="ar-button" class="ar-btn">View in your space</button>'
    : '';

  return {
    ok: true,
    html: frameShell(`
<style>
  model-viewer { width:100%; height:100%; background:${bg === 'transparent' ? 'transparent' : esc(bg)}; --poster-color:transparent; }
  .ar-btn { position:absolute; bottom:16px; left:50%; transform:translateX(-50%);
    background:#111; color:#fff; border:0; border-radius:999px; padding:11px 18px;
    font:600 14px system-ui,sans-serif; cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,.3); }
  .progress { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    font:13px system-ui,sans-serif; color:#8a8a8a; }
  model-viewer[loaded] .progress, model-viewer.loaded .progress { display:none; }
</style>
<model-viewer ${attrs}>
  ${arButton}
  <div class="progress" slot="poster">Loading 3D…</div>
</model-viewer>`),
  };
}

function frameShell(body) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;height:100%;overflow:hidden}body{position:relative}</style>
<script type="module" src="/_nexus/model-viewer.js"></script>
</head><body>${body}</body></html>`;
}
