// On-site search over a workspace's own published pages.
//
// Deliberately not a search service. A hosted small-business site is tens of
// pages, not millions of documents, so the whole corpus fits in memory and a
// scored substring match answers in under a millisecond — adding Elastic or
// Pinecone here would be infrastructure to run, pay for and keep in sync for
// a problem that doesn't exist at this size. If a site ever outgrows this,
// the interface (buildSearchIndex + searchIndex) is the seam to swap behind.
//
// Only published pages are indexed, and only their live content — a draft
// must not become findable through search when it isn't reachable by URL.

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'it', 'for', 'on', 'with', 'at', 'by']);

const plain = (html) => String(html || '')
  .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&[a-z#0-9]+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const tokenize = (s) => String(s || '')
  .toLowerCase()
  .split(/[^a-z0-9']+/)
  .filter((t) => t.length > 1 && !STOP.has(t));

/**
 * Build the searchable corpus from a site's pages.
 *
 * `localizedPageFor` lets the caller supply the per-language version of each
 * page, so a multilingual site indexes each language separately and a
 * Spanish search doesn't return English results.
 */
export function buildSearchIndex(pages, { locale = '', localizedPageFor = (p) => p, pathFor } = {}) {
  return (pages || [])
    .filter((p) => p.status === 'published')
    .map((raw) => {
      const page = localizedPageFor(raw);
      const body = (page.content || []).map((s) => plain(s.html)).join(' ');
      const title = page.name || '';
      const description = page.seo?.description || '';
      return {
        id: page.id,
        title,
        description,
        path: pathFor ? pathFor(raw) : '',
        locale,
        // A short excerpt is all a result card needs; keeping the whole body
        // would balloon a cached index for no benefit.
        excerpt: (description || body).slice(0, 240),
        haystack: `${title} ${description} ${body}`.toLowerCase(),
        titleTokens: new Set(tokenize(title)),
      };
    });
}

/**
 * Score and rank. A term in the title counts for much more than one buried in
 * body copy — on a small site, "the page called Pricing" is almost always
 * what someone typing "pricing" wants.
 */
export function searchIndex(index, query, { limit = 10 } = {}) {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  return (index || [])
    .map((doc) => {
      let score = 0;
      let matched = 0;
      for (const term of terms) {
        const inTitle = doc.titleTokens.has(term);
        const occurrences = doc.haystack.split(term).length - 1;
        if (inTitle) score += 10;
        if (occurrences > 0) { matched += 1; score += Math.min(occurrences, 5); }
      }
      // Every term has to appear somewhere: "opening hours sunday" shouldn't
      // match a page that only says "opening".
      if (matched < terms.length) return null;
      return { ...doc, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map(({ haystack, titleTokens, ...rest }) => rest);
}

/** Wrap the matched terms in <mark> for the results list. Escapes first. */
export function highlight(text, query) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const terms = tokenize(query);
  let out = esc(text);
  for (const term of terms) {
    // The term came through tokenize, so it's [a-z0-9'] only and safe in a
    // pattern; escaping the apostrophe keeps it literal regardless.
    out = out.replace(new RegExp(`(${term.replace(/'/g, "\\'")})`, 'gi'), '<mark>$1</mark>');
  }
  return out;
}
