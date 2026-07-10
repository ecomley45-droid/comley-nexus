// Feed block — server-side rendering. The block renderer (blockRenderers.js)
// emits only a no-JS placeholder:
//   <div class="nx-social-feed" data-platform="ig" data-limit="6" data-heading="…"></div>
// which survives the content sanitizer (class + data-* are allowed) and, more
// importantly, the strict public-page CSP (no client script, no third-party
// embed). At serve time we swap each placeholder for real, escaped HTML built
// from the workspace's connected account for that platform — exactly the
// "server-fetch, render static HTML" recipe the Product block established.
//
// Fetches are cached briefly in-process so a busy page doesn't hammer the
// platform API (or, in prod, swap this Map for Upstash which is already a
// dependency).

import { resolveAdapter } from './adapters/index.js';
import * as accounts from './accounts.js';
import { platformLabel, isPlatform } from './platforms.js';

const PLACEHOLDER_RE = /<div\b[^>]*class="[^"]*\bnx-social-feed\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi;
const attr = (tag, name) => (tag.match(new RegExp(`data-${name}="([^"]*)"`, 'i')) || [])[1] || '';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // `${orgId}:${platform}:${limit}` -> { at, items }

async function loadFeed(orgId, platform, limit) {
  const key = `${orgId}:${platform}:${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;
  const account = await accounts.firstForPlatform(orgId, platform);
  if (!account) return null; // signals "not connected" so we can render a hint
  const adapter = resolveAdapter(platform);
  if (typeof adapter.fetchFeed !== 'function') return [];
  const items = await adapter.fetchFeed({ account, limit });
  cache.set(key, { at: Date.now(), items });
  return items;
}

function renderFeed(platform, heading, items) {
  const cards = items.map((p) => `<a class="nx-sf-item" href="${esc(p.url || '#')}"${p.url ? ' target="_blank" rel="noopener noreferrer"' : ''}>
  ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" />` : ''}
  ${p.text ? `<p>${esc(String(p.text).slice(0, 140))}</p>` : ''}
</a>`).join('\n');
  return `<div class="nx-social-feed nx-sf-rendered">
${heading ? `<h3 class="nx-sf-heading">${esc(heading)}</h3>` : ''}
<style>
.nx-social-feed { max-width: 1080px; margin: 0 auto; padding: 24px; }
.nx-sf-heading { text-align: center; margin: 0 0 16px; }
.nx-sf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.nx-sf-item { display: block; text-decoration: none; color: inherit; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; overflow: hidden; background: #fff; }
.nx-sf-item img { width: 100%; aspect-ratio: 1/1; object-fit: cover; display: block; }
.nx-sf-item p { font-size: 13px; line-height: 1.4; margin: 0; padding: 10px 12px; }
.nx-sf-empty { text-align: center; color: #64748b; font-size: 14px; padding: 24px; }
</style>
<div class="nx-sf-grid">${cards}</div>
</div>`;
}

// Replace every feed placeholder in a rendered page. Best-effort: a failing
// platform call or an unconnected account degrades to a small inline note
// rather than breaking the page.
export async function injectSocialFeeds(html, orgId) {
  if (!html || !orgId || !PLACEHOLDER_RE.test(html)) return html;
  PLACEHOLDER_RE.lastIndex = 0;
  const matches = html.match(PLACEHOLDER_RE) || [];
  let out = html;
  for (const tag of matches) {
    const platform = attr(tag, 'platform');
    const limit = Math.min(12, Math.max(1, Number(attr(tag, 'limit')) || 6));
    const heading = attr(tag, 'heading');
    let replacement;
    try {
      if (!isPlatform(platform)) throw new Error('unknown platform');
      const items = await loadFeed(orgId, platform, limit);
      if (items === null) {
        replacement = `<div class="nx-social-feed"><p class="nx-sf-empty">No ${esc(platformLabel(platform))} account connected yet.</p></div>`;
      } else if (items.length === 0) {
        replacement = `<div class="nx-social-feed"><p class="nx-sf-empty">No posts to show yet.</p></div>`;
      } else {
        replacement = renderFeed(platform, heading, items);
      }
    } catch (e) {
      console.error('[social/feed] inject failed:', e.message);
      replacement = `<div class="nx-social-feed"></div>`;
    }
    out = out.replace(tag, replacement);
  }
  return out;
}
