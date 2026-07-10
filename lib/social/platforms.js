// Canonical platform metadata, shared by the server adapters and (via the
// /api/social/platforms route) the composer's per-network validation. The
// `constraints` here are what the composer checks BEFORE submit so a user
// never discovers a 280-char limit by way of a failed publish.
//
// Figures are current-as-of-build planning values -- confirm against each
// platform's live developer docs before relying on them in production.

export const PLATFORMS = {
  ig: {
    id: 'ig',
    label: 'Instagram',
    // IG publishing requires an image/video -- text-only isn't a valid post.
    constraints: { maxChars: 2200, requiresMedia: true, maxMedia: 10, video: true },
  },
  fb: {
    id: 'fb',
    label: 'Facebook',
    constraints: { maxChars: 63206, requiresMedia: false, maxMedia: 10, video: true },
  },
  x: {
    id: 'x',
    label: 'X',
    constraints: { maxChars: 280, requiresMedia: false, maxMedia: 4, video: true },
  },
  li: {
    id: 'li',
    label: 'LinkedIn',
    constraints: { maxChars: 3000, requiresMedia: false, maxMedia: 9, video: true },
  },
  tt: {
    id: 'tt',
    label: 'TikTok',
    // TikTok is video-first; the Content Posting API has no text-only post.
    constraints: { maxChars: 2200, requiresMedia: true, maxMedia: 1, video: true, videoOnly: true },
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS);

export const isPlatform = (id) => Object.prototype.hasOwnProperty.call(PLATFORMS, id);

export const platformLabel = (id) => PLATFORMS[id]?.label || id;

// Validate one target's effective text/media against a platform's rules.
// Returns an array of human-readable problems (empty = ok) so the composer
// can list them inline.
export function validateForPlatform(platformId, { text = '', media = [] } = {}) {
  const c = PLATFORMS[platformId]?.constraints;
  if (!c) return [`Unknown platform "${platformId}"`];
  const problems = [];
  if (c.maxChars && text.length > c.maxChars) {
    problems.push(`${platformLabel(platformId)}: ${text.length} characters is over the ${c.maxChars} limit`);
  }
  if (c.requiresMedia && media.length === 0) {
    problems.push(`${platformLabel(platformId)} needs ${c.videoOnly ? 'a video' : 'at least one image or video'}`);
  }
  if (c.maxMedia && media.length > c.maxMedia) {
    problems.push(`${platformLabel(platformId)} allows at most ${c.maxMedia} media item${c.maxMedia === 1 ? '' : 's'}`);
  }
  return problems;
}
