// Client-side platform display metadata: label + a brand-ish chip color used
// for the account pills, dashboard breakdown, and composer toggles. The
// authoritative posting constraints come from the server
// (getSocialPlatforms); this is purely presentational.

export const PLATFORM_META = {
  ig: { label: 'Instagram', short: 'IG', color: '#E1306C' },
  fb: { label: 'Facebook', short: 'FB', color: '#1877F2' },
  x: { label: 'X', short: 'X', color: '#71767B' },
  li: { label: 'LinkedIn', short: 'in', color: '#0A66C2' },
  tt: { label: 'TikTok', short: 'TT', color: '#25F4EE' },
};

export const PLATFORM_ORDER = ['ig', 'fb', 'x', 'li', 'tt'];

export const platformMeta = (id) => PLATFORM_META[id] || { label: id, short: id?.slice(0, 2).toUpperCase(), color: '#888' };
