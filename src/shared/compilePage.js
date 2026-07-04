// Server-side page compiler used by server.js's dynamic routing and the
// static export route. Pages are stored as an ordered list of sections
// (each with raw `html`), optionally A/B-tested via `abVariants`.

// Walks a page's parentId chain to build its full nested slug path, e.g.
// a page "contact" whose parent is "about" (whose parent is root) becomes
// "about/contact".
export function getFullPath(page, pages) {
  const segments = [];
  let current = page;
  const seen = new Set();
  while (current) {
    if (seen.has(current.id)) break; // guard against corrupt cyclic parentId data
    seen.add(current.id);
    if (current.slug && current.slug !== 'index') segments.unshift(current.slug);
    current = current.parentId ? pages.find(p => p.id === current.parentId) : null;
  }
  return segments.join('/');
}

// Weighted-random pick among a section's A/B variants. Falls back to a
// uniform pick if no variant declares a weight.
export function pickWeightedVariant(variants) {
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 1), 0);
  let roll = Math.random() * totalWeight;
  for (const variant of variants) {
    roll -= variant.weight || 1;
    if (roll <= 0) return variant;
  }
  return variants[variants.length - 1];
}

const escapeHtml = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

// Renders one page to a full HTML document: theme CSS variables from global
// settings, each section's html (swapped for its chosen A/B variant's html
// when present), and any per-page/global analytics snippets.
// Resolves the header/footer HTML that should wrap the page's own sections.
// Precedence: per-page override (non-empty string) > global content (if the
// page opts in via layout flags — default is opt-in) > empty string.
export function resolveGlobalContent(page, globalSettings) {
  const layout = page?.layout || {};
  const globals = globalSettings?.globals || {};

  const pickHtml = (which) => {
    const flagKey = which === 'header' ? 'useGlobalHeader' : 'useGlobalFooter';
    const overrideKey = which === 'header' ? 'headerOverride' : 'footerOverride';
    const override = layout[overrideKey];
    if (typeof override === 'string' && override.trim() !== '') return override;
    if (layout[flagKey] === false) return '';
    return globals[which]?.html || '';
  };

  return { headerHtml: pickHtml('header'), footerHtml: pickHtml('footer') };
}

export function compilePageHtml(page, pages, library, globalSettings, abChoices = {}) {
  const theme = globalSettings?.theme || {};
  const { headerHtml, footerHtml } = resolveGlobalContent(page, globalSettings);
  const sectionsHtml = (page.content || [])
    .map((section) => {
      if (Array.isArray(section.abVariants) && section.abVariants.length > 0) {
        const chosenId = abChoices[section.id];
        const variant = section.abVariants.find(v => v.id === chosenId) || section.abVariants[0];
        return `<section data-section-id="${section.id}" data-variant-id="${variant.id}">${variant.html || ''}</section>`;
      }
      return `<section data-section-id="${section.id}">${section.html || ''}</section>`;
    })
    .join('\n');

  const seo = page.seo || {};
  const globalAnalytics = globalSettings?.analytics || {};
  const pageAnalytics = page.analytics || {};

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(seo.title || page.name || globalSettings?.siteName || 'Untitled Page')}</title>
${seo.description ? `<meta name="description" content="${escapeHtml(seo.description)}" />` : ''}
${seo.ogImage ? `<meta property="og:image" content="${escapeHtml(seo.ogImage)}" />` : ''}
<style>
:root {
  --color-primary: ${theme.primary || '#6366f1'};
  --color-secondary: ${theme.secondary || '#d946ef'};
  --color-bg: ${theme.bg || '#070a13'};
  --color-text: ${theme.text || '#e2e8f0'};
}
body { background: var(--color-bg); color: var(--color-text); font-family: system-ui, sans-serif; margin: 0; }
</style>
${globalAnalytics.headSnippet || ''}
${pageAnalytics.headSnippet || ''}
</head>
<body>
${headerHtml ? `<header data-global="header">${headerHtml}</header>` : ''}
${sectionsHtml}
${footerHtml ? `<footer data-global="footer">${footerHtml}</footer>` : ''}
${globalAnalytics.bodySnippet || ''}
${pageAnalytics.bodySnippet || ''}
</body>
</html>`;
}
