// Shared with PagesListPage and DashboardPage's Quick Start tile so "create
// a new blank page" is defined exactly once.

import { buildConvertedPage } from './pageModes.js';

// A full-code page that starts empty is a blank textarea with no hint of
// what shape the answer takes, so new coded pages open on a valid skeleton.
const STARTER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>New page</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <h1>Hello</h1>
</body>
</html>`;

export function blankPage(mode = 'blocks') {
  const id = 'page-' + Date.now();
  return {
    id,
    name: 'Untitled page',
    slug: 'untitled-' + Date.now().toString(36),
    parentId: null,
    content: [],
    // 'blocks' (default) uses `content` above; 'full-html' bypasses it
    // entirely in favor of `fullHtml`, a complete raw document (see
    // compilePageHtml's fork in src/shared/compilePage.js). Both fields
    // always persist regardless of mode -- switching back and forth never
    // discards either representation. The mode is chosen up front (the
    // "New page" menu); changing your mind later goes through Convert,
    // which produces a separate DRAFT copy rather than rewriting the page
    // in place -- see pageModes.js.
    editorMode: mode === 'full-html' ? 'full-html' : 'blocks',
    fullHtml: mode === 'full-html' ? STARTER_HTML : '',
    seo: { title: '', description: '', ogImage: '' },
    status: 'draft',
    scheduledPublishAt: null,
    analytics: { headSnippet: '', bodySnippet: '' },
    // Inherits site-global header/footer by default. Toggle off or provide
    // an override string in the Page Editor's Layout panel to break out.
    layout: {
      useGlobalHeader: true,
      useGlobalFooter: true,
      headerOverride: '',
      footerOverride: '',
    },
  };
}

// pages/setPages/save/navigate/base are passed in rather than imported so
// callers keep using their own usePagesStore()/useNavigate() instances and
// their org-scoped nav base (e.g. "/admin").
export async function createPage(pages, setPages, save, navigate, base = '/admin', mode = 'blocks') {
  const newPage = blankPage(mode);
  const nextPages = [...pages, newPage];
  setPages(nextPages);
  await save(nextPages);
  navigate(`${base}/pages/${newPage.id}`);
  return newPage;
}

// Convert a page between No-code and Full code. Deliberately additive: the
// source page is left exactly as it is (still published, still serving) and
// the converted result is appended as a new DRAFT page, which is then
// opened in the editor.
export async function convertPage(page, pages, setPages, save, navigate, base, targetMode, context) {
  const converted = buildConvertedPage(page, pages, targetMode, context);
  const nextPages = [...pages, converted];
  setPages(nextPages);
  await save(nextPages);
  navigate(`${base}/pages/${converted.id}`);
  return converted;
}
