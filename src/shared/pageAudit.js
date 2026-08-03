// Accessibility and SEO checks over a page's own content.
//
// Worth doing here rather than deferring to Lighthouse: this system owns the
// entire render pipeline, so it knows the theme colours, the heading
// structure and every image's alt text before the page is ever published.
// That means problems can be caught while the author is still looking at the
// block that caused them, and named in terms of that block.
//
// Every check returns { id, level, title, detail, sectionId? }. `level` is
// 'error' (will actually hurt someone or rank badly), 'warning' (usually
// wrong, occasionally deliberate) or 'info'. Nothing here blocks publishing —
// an author who knows better should be able to overrule a heuristic.

const text = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const imgTags = (html) => String(html || '').match(/<img\b[^>]*>/gi) || [];
const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag || '');
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
};
const hasAttr = (tag, name) => new RegExp(`\\b${name}\\s*=`, 'i').test(tag || '');

// ---------------------------------------------------------------------------
// Colour contrast (WCAG 2.1 relative luminance)
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const channel = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function contrastRatio(a, b) {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);
  if (!c1 || !c2) return null;
  const l = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  const [hi, lo] = [l(c1), l(c2)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkImages(page, issues) {
  for (const section of page.content || []) {
    for (const tag of imgTags(section.html)) {
      // A decorative image is marked with alt="" — present but empty. A
      // MISSING alt attribute is the actual problem: a screen reader then
      // announces the filename, which is noise at best.
      if (!hasAttr(tag, 'alt')) {
        issues.push({
          id: 'img-alt-missing', level: 'error', sectionId: section.id,
          title: 'Image has no alt text',
          detail: `In "${section.name || 'a block'}". Describe it for screen readers, or set the alt to empty if it's purely decorative.`,
        });
      }
    }
  }
}

function checkHeadings(page, issues) {
  const levels = [];
  for (const section of page.content || []) {
    for (const m of String(section.html || '').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
      levels.push({ level: Number(m[1]), text: text(m[2]), sectionId: section.id, sectionName: section.name });
    }
  }
  const h1s = levels.filter((h) => h.level === 1);
  if (h1s.length === 0 && levels.length > 0) {
    issues.push({
      id: 'h1-missing', level: 'warning',
      title: 'No main heading',
      detail: 'A page should have one H1 saying what it is about. Search engines and screen readers both lean on it.',
    });
  }
  if (h1s.length > 1) {
    issues.push({
      id: 'h1-multiple', level: 'warning',
      title: `${h1s.length} main headings`,
      detail: 'Only one H1 per page — the rest should step down to H2 or H3 so the page has a clear outline.',
    });
  }
  // A jump from H2 straight to H4 breaks the outline screen readers navigate by.
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i].level - levels[i - 1].level > 1) {
      issues.push({
        id: 'heading-skip', level: 'warning', sectionId: levels[i].sectionId,
        title: `Heading level jumps from H${levels[i - 1].level} to H${levels[i].level}`,
        detail: `In "${levels[i].sectionName || 'a block'}". Screen readers navigate by this outline, so skipping a level hides structure.`,
      });
      break;
    }
  }
}

function checkLinks(page, issues) {
  const vague = new Set(['click here', 'here', 'read more', 'more', 'link', 'this']);
  for (const section of page.content || []) {
    for (const m of String(section.html || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const label = text(m[2]).toLowerCase();
      if (!label && !attr(m[1], 'aria-label')) {
        issues.push({
          id: 'link-empty', level: 'error', sectionId: section.id,
          title: 'Link with no text',
          detail: `In "${section.name || 'a block'}". A screen reader announces the URL instead, which is unusable.`,
        });
      } else if (vague.has(label)) {
        issues.push({
          id: 'link-vague', level: 'warning', sectionId: section.id,
          title: `Link labelled "${text(m[2])}"`,
          detail: 'People who navigate by tabbing through links hear the label alone. Say where it goes.',
        });
      }
      // target=_blank without rel=noopener hands the new tab a reference back.
      if (/_blank/i.test(attr(m[1], 'target')) && !/noopener/i.test(attr(m[1], 'rel'))) {
        issues.push({
          id: 'link-noopener', level: 'warning', sectionId: section.id,
          title: 'Link opens a new tab without rel="noopener"',
          detail: 'The opened page gets a reference back to yours. Add rel="noopener".',
        });
      }
    }
  }
}

function checkSeo(page, issues, { globalSettings } = {}) {
  const title = page.seo?.title || page.name || '';
  const description = page.seo?.description || '';

  if (!page.seo?.title) {
    issues.push({
      id: 'seo-title-missing', level: 'warning',
      title: 'No SEO title',
      detail: `Search results will use the page name ("${page.name}"). Set a title written for searchers.`,
    });
  } else if (title.length > 60) {
    issues.push({
      id: 'seo-title-long', level: 'info',
      title: `SEO title is ${title.length} characters`,
      detail: 'Google usually truncates around 60. The important words should come first.',
    });
  }

  if (!description) {
    issues.push({
      id: 'seo-description-missing', level: 'warning',
      title: 'No meta description',
      detail: 'Without one the search snippet is scraped from the page, which is rarely the pitch you would choose.',
    });
  } else if (description.length > 160) {
    issues.push({
      id: 'seo-description-long', level: 'info',
      title: `Meta description is ${description.length} characters`,
      detail: 'Usually truncated around 160.',
    });
  }

  if (!page.seo?.ogImage && !globalSettings?.defaultOgImage) {
    issues.push({
      id: 'seo-og-image', level: 'info',
      title: 'No social sharing image',
      detail: 'Links to this page will share as plain text on social platforms and in chat apps.',
    });
  }

  const words = (page.content || []).reduce((n, s) => n + text(s.html).split(' ').filter(Boolean).length, 0);
  if (words > 0 && words < 50) {
    issues.push({
      id: 'seo-thin', level: 'info',
      title: `Only about ${words} words of content`,
      detail: 'Thin pages rarely rank. This is fine for a landing page, worth knowing for anything else.',
    });
  }
}

function checkTheme(issues, globalSettings) {
  const theme = globalSettings?.theme;
  if (!theme?.bg || !theme?.text) return;
  const ratio = contrastRatio(theme.text, theme.bg);
  if (ratio === null) return;
  if (ratio < 4.5) {
    issues.push({
      id: 'contrast-body', level: ratio < 3 ? 'error' : 'warning',
      title: `Body text contrast is ${ratio.toFixed(1)}:1`,
      detail: `WCAG asks for 4.5:1 on normal text. Adjust the text or background colour in Design settings.`,
    });
  }
  if (theme.link && theme.bg) {
    const linkRatio = contrastRatio(theme.link, theme.bg);
    if (linkRatio !== null && linkRatio < 4.5) {
      issues.push({
        id: 'contrast-link', level: 'warning',
        title: `Link colour contrast is ${linkRatio.toFixed(1)}:1`,
        detail: 'Links are the most-clicked text on the page and should clear 4.5:1.',
      });
    }
  }
}

/**
 * Audit one page. `globalSettings` is optional — theme contrast and the
 * default social image are only checked when it's supplied.
 *
 * Returns { issues, counts, score } where score is 0–100: a blunt headline
 * number so an author can tell at a glance whether anything needs attention.
 */
export function auditPage(page, globalSettings) {
  const issues = [];
  if (!page || page.editorMode === 'full-html') {
    // A hand-written document is the author's own markup end to end; auditing
    // its structure here would mean re-parsing a full document and reporting
    // on decisions deliberately taken outside the block system.
    return { issues, counts: { error: 0, warning: 0, info: 0 }, score: 100, skipped: 'full-code' };
  }

  checkImages(page, issues);
  checkHeadings(page, issues);
  checkLinks(page, issues);
  checkSeo(page, issues, { globalSettings });
  checkTheme(issues, globalSettings);

  const counts = {
    error: issues.filter((i) => i.level === 'error').length,
    warning: issues.filter((i) => i.level === 'warning').length,
    info: issues.filter((i) => i.level === 'info').length,
  };
  const score = Math.max(0, 100 - counts.error * 15 - counts.warning * 7 - counts.info * 2);
  return { issues, counts, score };
}
