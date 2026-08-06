// The virtual-tour hosts a Virtual Tour block is allowed to embed.
//
// A hosted 3D/360 tour (Matterport and the like) is shown by iframing the
// provider's own player, exactly as the Video Embed block iframes YouTube.
// That means two things have to agree, or the frame silently fails to load:
//
//   1. the CSP frame-src on the published page must list the provider's host
//   2. the renderer must only emit an iframe pointing at one of those hosts
//
// So both read this one list. `tourFrameSrc()` builds the CSP fragment;
// `parseTourInput()` validates and canonicalises what an agent pasted.
//
// Every provider here is a real-estate tour host whose share/embed URL loads
// in an iframe. Anything not listed is refused with an explanation rather than
// rendered as a frame the browser will just block.

export const TOUR_PROVIDERS = [
  {
    id: 'matterport', label: 'Matterport',
    hosts: ['my.matterport.com'],
    // The dominant real-estate 3D tour. Its share URL is already embeddable.
    example: 'https://my.matterport.com/show/?m=SxQL3iGyoDo',
  },
  {
    id: 'kuula', label: 'Kuula',
    hosts: ['kuula.co'],
    example: 'https://kuula.co/share/collection/…',
  },
  {
    id: 'cloudpano', label: 'CloudPano',
    hosts: ['app.cloudpano.com', 'app.cloudpano.io'],
    example: 'https://app.cloudpano.com/tours/…',
  },
  {
    id: 'momento360', label: 'Momento360',
    hosts: ['momento360.com'],
    example: 'https://momento360.com/e/u/…',
  },
  {
    id: 'iguide', label: 'iGuide',
    hosts: ['youriguide.com'], wildcard: ['youriguide.com'],
    example: 'https://youriguide.com/…',
  },
  {
    id: 'panoee', label: 'Panoee',
    hosts: ['tour.panoee.com'], wildcard: ['panoee.com', 'panoee.net'],
    example: 'https://tour.panoee.com/…',
  },
];

// Every host token for the CSP frame-src, exact hosts plus wildcard bases.
export function tourFrameSrc() {
  const tokens = new Set();
  for (const p of TOUR_PROVIDERS) {
    for (const h of p.hosts) tokens.add(`https://${h}`);
    for (const w of p.wildcard || []) tokens.add(`https://*.${w}`);
  }
  return [...tokens].join(' ');
}

function providerForHost(host) {
  const h = String(host || '').toLowerCase();
  return TOUR_PROVIDERS.find((p) =>
    p.hosts.includes(h) || (p.wildcard || []).some((w) => h === w || h.endsWith(`.${w}`)));
}

// Pull a URL out of whatever the agent pasted: a bare URL, a full share link,
// or the entire `<iframe src="…">` snippet that a provider's "Embed" button
// hands you. The snippet case matters -- it is the thing people actually copy.
function extractUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const fromIframe = raw.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
  if (fromIframe) return fromIframe[1].trim();
  // A bare Matterport model id ("SxQL3iGyoDo") is common enough to accept.
  if (/^[\w-]{6,32}$/.test(raw)) return `https://my.matterport.com/show/?m=${raw}`;
  return raw;
}

/**
 * Validate and canonicalise a pasted tour reference.
 *
 * Returns { ok, url, provider } on success, or { ok:false, reason } — 'empty'
 * when nothing was entered, 'unsupported' when the host isn't one we embed, so
 * the block can say which of the two it is.
 */
export function parseTourInput(input) {
  const extracted = extractUrl(input);
  if (!extracted) return { ok: false, reason: 'empty' };

  let parsed;
  try { parsed = new URL(extracted); } catch { return { ok: false, reason: 'unsupported' }; }
  // Only https is embeddable under the page CSP, and it is the only scheme any
  // of these providers serve.
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'unsupported' };

  const provider = providerForHost(parsed.hostname);
  if (!provider) return { ok: false, reason: 'unsupported' };

  return { ok: true, url: parsed.toString(), provider: provider.id };
}

// A readable list for the editor hint and the block's "unsupported" message,
// so the two never drift from what's actually allowed.
export const TOUR_PROVIDER_NAMES = TOUR_PROVIDERS.map((p) => p.label).join(', ');
