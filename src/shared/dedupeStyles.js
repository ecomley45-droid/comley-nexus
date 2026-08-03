// Hoists repeated block stylesheets out of the body and into one <style> in
// the head.
//
// Every renderer inlines its own `<style>` with the block's rules. That's the
// right design — a block is self-contained, and a renderer change ships
// instantly with no stored CSS to migrate — but it means a page with eight
// card grids sent the same ~800 bytes of CSS eight times.
//
// The rule here is narrow on purpose: a `<style>` block whose exact text
// appears MORE THAN ONCE is removed from the body and emitted once in the
// head. A stylesheet that appears exactly once stays precisely where it was.
// That matters because CSS is order-dependent — moving a one-off block's
// rules earlier could change which declaration wins. Only exact duplicates
// move, and since they're identical, collapsing them to a single earlier
// copy can't change the cascade for anything except a block that was
// deliberately relying on being re-declared after a later rule, which no
// renderer does.

const STYLE_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

/**
 * @param {string} html  concatenated section markup
 * @returns {{ html: string, css: string }}
 *   `html` with duplicate <style> blocks removed, and the CSS to put in the
 *   head (empty string when nothing repeated).
 */
export function extractSharedStyles(html) {
  const source = String(html || '');
  if (!source) return { html: source, css: '' };

  // Count identical style bodies.
  const counts = new Map();
  let m;
  STYLE_RE.lastIndex = 0;
  while ((m = STYLE_RE.exec(source))) {
    const body = m[1];
    if (!body.trim()) continue;
    counts.set(body, (counts.get(body) || 0) + 1);
  }

  const repeated = [...counts.entries()].filter(([, n]) => n > 1).map(([body]) => body);
  if (repeated.length === 0) return { html: source, css: '' };

  const hoisted = new Set(repeated);
  // Emit in first-appearance order so the head stylesheet reads in the same
  // order the page uses these blocks — and so output is deterministic.
  const order = [];
  STYLE_RE.lastIndex = 0;
  while ((m = STYLE_RE.exec(source))) {
    if (hoisted.has(m[1]) && !order.includes(m[1])) order.push(m[1]);
  }

  const stripped = source.replace(STYLE_RE, (full, body) => (hoisted.has(body) ? '' : full));
  return { html: stripped, css: order.join('\n') };
}
