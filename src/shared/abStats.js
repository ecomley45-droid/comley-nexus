// Turns raw A/B impression/click counts into an answer.
//
// The editor already showed "Impressions: 812 · Clicks: 41" per variant,
// which is data, not a decision — nothing told you whether 4.9% vs 3.8% was
// a real difference or noise, so an experiment could run forever without
// ever concluding.
//
// This is a two-proportion z-test against the first variant as control. It's
// the standard test for a conversion-rate comparison and needs no
// dependencies. Deliberately conservative: it reports "not enough data yet"
// far more often than it declares a winner, because the expensive mistake
// here is shipping a losing variant on a coin-flip.

// Minimum impressions per variant before a verdict is offered at all. Below
// this the normal approximation behind the z-test isn't trustworthy, no
// matter what the arithmetic says.
export const MIN_IMPRESSIONS = 100;

// Two-sided z at 95% confidence.
const Z_95 = 1.96;

// Abramowitz & Stegun 7.1.26 — good to ~1e-7, which is far past what a
// conversion test needs, and avoids pulling in a stats library.
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

const twoSidedP = (z) => 1 - erf(Math.abs(z) / Math.SQRT2);

const rateOf = (v) => (v.impressions > 0 ? v.clicks / v.impressions : 0);

/**
 * Compare one variant against the control.
 * Returns { rate, lift, z, p, significant, enoughData }.
 */
export function compareVariant(control, variant) {
  const n1 = control.impressions || 0;
  const n2 = variant.impressions || 0;
  const p1 = rateOf(control);
  const p2 = rateOf(variant);
  const enoughData = n1 >= MIN_IMPRESSIONS && n2 >= MIN_IMPRESSIONS;

  // Pooled proportion, the standard form for testing "are these the same?"
  const pooled = (n1 + n2) > 0 ? ((control.clicks || 0) + (variant.clicks || 0)) / (n1 + n2) : 0;
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / Math.max(n1, 1) + 1 / Math.max(n2, 1)));
  const z = se > 0 ? (p2 - p1) / se : 0;
  const p = se > 0 ? twoSidedP(z) : 1;

  return {
    rate: p2,
    lift: p1 > 0 ? (p2 - p1) / p1 : 0,
    z,
    p,
    enoughData,
    significant: enoughData && Math.abs(z) >= Z_95,
  };
}

/**
 * Read a whole experiment.
 *
 * `variants` are the section's variants in order; the first is the control.
 * `stats` is the `{ [variantId]: { impressions, clicks } }` shape the
 * existing /api/ab-stats endpoint already returns.
 *
 * Returns per-variant results plus an overall verdict, with `leader` set only
 * when a variant is BOTH significantly different and better — a significant
 * loser is a result too, but it isn't something to promote.
 */
export function readExperiment(variants, stats = {}) {
  if (!Array.isArray(variants) || variants.length === 0) return { results: [], verdict: null, leader: null };

  const counts = variants.map((v) => ({
    id: v.id,
    name: v.name || v.id,
    impressions: stats[v.id]?.impressions || 0,
    clicks: stats[v.id]?.clicks || 0,
  }));
  const control = counts[0];

  const results = counts.map((c, i) => ({
    ...c,
    isControl: i === 0,
    ...(i === 0
      ? { rate: rateOf(c), lift: 0, p: 1, z: 0, significant: false, enoughData: c.impressions >= MIN_IMPRESSIONS }
      : compareVariant(control, c)),
  }));

  const totalImpressions = counts.reduce((sum, c) => sum + c.impressions, 0);
  const underpowered = results.filter((r) => !r.enoughData);

  // The best significant improvement, if there is one. Compared against the
  // control's COMPUTED rate (results[0]) rather than the raw count object,
  // which has no rate on it.
  const controlRate = results[0].rate;
  const leader = results
    .filter((r) => !r.isControl && r.significant && r.rate > controlRate)
    .sort((a, b) => b.rate - a.rate)[0] || null;

  let verdict;
  if (totalImpressions === 0) {
    verdict = { state: 'idle', message: 'No traffic recorded yet.' };
  } else if (underpowered.length > 0) {
    const needed = Math.max(...results.map((r) => MIN_IMPRESSIONS - r.impressions));
    verdict = {
      state: 'collecting',
      message: `Still collecting — about ${needed} more view${needed === 1 ? '' : 's'} needed on the quietest variant before this can be called.`,
    };
  } else if (leader) {
    verdict = {
      state: 'winner',
      message: `"${leader.name}" is ahead by ${(leader.lift * 100).toFixed(0)}% and the difference is unlikely to be chance (p ≈ ${leader.p.toFixed(3)}).`,
    };
  } else {
    verdict = {
      state: 'no-difference',
      message: 'No clear difference — the variants are performing about the same. Either is a safe choice.',
    };
  }

  return { results, verdict, leader };
}

export const formatRate = (rate) => `${(rate * 100).toFixed(1)}%`;
