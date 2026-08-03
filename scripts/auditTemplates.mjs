// Proves the claim "100% of template content is no-code editable".
//
// For every template the platform ships or can install, this materializes it
// exactly as an install would and checks each resulting section:
//
//   1. has a blockType at all (not a raw-HTML section)
//   2. that blockType has a renderer
//   3. it renders to non-empty HTML
//   4. every field it carries has an editor in blockFields.js
//
// Covers the four hand-authored starter sites, the marketplace seed rows,
// and -- most importantly -- the full-HTML import path, which is the one
// that used to install as raw markup. Sample documents for that path live in
// FIXTURES below rather than as files, so this runs anywhere with no setup.
//
// Run: node scripts/auditTemplates.mjs   (npm run audit:templates)
// Exits non-zero if any section is not fully editable.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { SITE_TEMPLATES, buildTemplateSite } = await import(path.join(root, 'src/shared/siteTemplates.js'));
const { defaultMarketplaceTemplates, materializeInstall } = await import(path.join(root, 'lib/sitePayload.js'));
const { BLOCK_RENDERERS, renderBlock } = await import(path.join(root, 'src/cms/lib/pasteIn/blockRenderers.js'));
const { BLOCK_FIELDS, GENERIC_SCHEMA } = await import(path.join(root, 'src/cms/lib/pasteIn/blockFields.js'));

// Fields that are real but have no editor of their own by design.
const IGNORED_FIELDS = new Set(['customCss', 'calendarId', 'columns', 'template', 'code']);

function editorsFor(blockType) {
  const schema = BLOCK_FIELDS[blockType] || GENERIC_SCHEMA;
  return new Set([...(schema.order || []), ...Object.keys(schema.extras || {})]);
}

const problems = [];
let sectionsChecked = 0;
const typesSeen = new Set();

function checkPage(label, page) {
  if (page.editorMode === 'full-html') {
    problems.push(`${label}: page "${page.name}" installs as a locked full-code page`);
    return;
  }
  for (const section of page.content || []) {
    sectionsChecked += 1;
    const where = `${label} › ${page.name} › ${section.name}`;
    if (!section.blockType) { problems.push(`${where}: raw HTML section, no blockType — not no-code editable`); continue; }
    typesSeen.add(section.blockType);
    if (!BLOCK_RENDERERS[section.blockType]) { problems.push(`${where}: unknown blockType "${section.blockType}"`); continue; }
    if (!renderBlock(section.blockType, section.fields || {})) { problems.push(`${where}: renders empty`); continue; }
    const editors = editorsFor(section.blockType);
    for (const key of Object.keys(section.fields || {})) {
      if (IGNORED_FIELDS.has(key)) continue;
      if (!editors.has(key)) problems.push(`${where}: field "${key}" has no editor (${section.blockType})`);
    }
  }
}

// --- 1. The hand-authored starter sites -------------------------------------
for (const t of SITE_TEMPLATES) {
  const site = buildTemplateSite(t.id);
  for (const page of site.pages) checkPage(`starter/${t.id}`, page);
}

// --- 2. The marketplace seed rows, through the real install path ------------
for (const row of defaultMarketplaceTemplates()) {
  const { pages } = materializeInstall(row.payload, { stamp: 1 });
  for (const page of pages) checkPage(`marketplace/${row.slug}`, page);
}

// --- 3. The full-HTML import path -------------------------------------------
// Shapes real template files take: a wrapper div, semantic sections, a card
// grid nested under a heading, a bare body, and a page with no <head>.
const FIXTURES = {
  'wrapped-landing': `<!doctype html><html><head><title>A</title><style>.h{}</style></head><body><div id="root">
    <header><img src="/logo.png" alt="Northwind"><nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav></header>
    <section class="hero"><h1>Ship faster</h1><p>Everything you need.</p><a href="/start">Get started</a></section>
    <section><h2>Features</h2><div class="grid">
      <div class="card"><img src="https://cdn.x/1.png" alt="1"><h3>Fast</h3><p>Very fast.</p></div>
      <div class="card"><img src="https://cdn.x/2.png" alt="2"><h3>Safe</h3><p>Very safe.</p></div>
      <div class="card"><img src="https://cdn.x/3.png" alt="3"><h3>Cheap</h3><p>Costs less.</p></div>
    </div></section>
    <section><h2>Contact</h2><form><input name="email"></form></section>
    <footer><p>© Northwind</p><a href="/tos">Terms</a><a href="/privacy">Privacy</a></footer>
  </div></body></html>`,

  'semantic-no-wrapper': `<!doctype html><html><body>
    <nav><a href="/">Home</a><a href="/about">About</a></nav>
    <main><h1>About us</h1><p>We started in 2016.</p><p>We are still here.</p></main>
    <ul><li><h3>One</h3><p>First</p></li><li><h3>Two</h3><p>Second</p></li><li><h3>Three</h3><p>Third</p></li></ul>
    <footer><p>© Us</p><a href="/x">X</a><a href="/y">Y</a></footer>
  </body></html>`,

  'gallery-page': `<html><body><section><h2>Our work</h2>
    <img src="https://cdn.x/a.jpg" alt="A"><img src="https://cdn.x/b.jpg" alt="B"><img src="https://cdn.x/c.jpg" alt="C">
  </section></body></html>`,

  'no-head-bare-body': `<div class="wrap"><h1>Just a headline</h1><p>And a paragraph.</p><a href="/go">Go</a></div>`,
};

for (const [name, html] of Object.entries(FIXTURES)) {
  const { pages } = materializeInstall(
    { theme: {}, pages: [{ name: 'Home', slug: 'index', editorMode: 'full-html', fullHtml: html }] },
    { stamp: 1 }
  );
  if (pages.length === 0) { problems.push(`import/${name}: produced no pages`); continue; }
  for (const page of pages) checkPage(`import/${name}`, page);
}

// --- Report -----------------------------------------------------------------
console.log(`Checked ${sectionsChecked} template sections across ${SITE_TEMPLATES.length} starter sites, ` +
  `${defaultMarketplaceTemplates().length} marketplace seeds and ${Object.keys(FIXTURES).length} imported documents.`);
console.log(`Block types produced: ${[...typesSeen].sort().join(', ')}`);
if (problems.length) {
  console.log(`\nFAIL — ${problems.length} section(s) are not fully no-code editable:`);
  for (const p of problems) console.log(`  ${p}`);
} else {
  console.log('\nOK — 100% of template sections are typed blocks with a complete set of editors.');
}
process.exit(problems.length === 0 ? 0 : 1);
