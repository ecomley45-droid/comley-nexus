// Form fields, A/B significance, and stylesheet hoisting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFormFields, formFieldsFor, DEFAULT_FORM_FIELDS, FORM_FIELD_TYPES } from '../src/shared/formFields.js';
import { readExperiment, compareVariant, MIN_IMPRESSIONS, formatRate } from '../src/shared/abStats.js';
import { extractSharedStyles } from '../src/shared/dedupeStyles.js';
import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';
import { compilePageHtml } from '../src/shared/compilePage.js';
import { buildThemeStyleBlock, webfontHref } from '../src/shared/theme.js';
import { contrastRatio } from '../src/shared/pageAudit.js';
import { defaultMarketplaceTemplates, materializeInstall } from '../lib/sitePayload.js';

// ---------------------------------------------------------------- form fields

test('a form with no field list renders exactly what it always did', () => {
  const html = renderBlock('form', { headings: ['Contact'], buttonLabel: 'Send' });
  for (const name of ['name', 'email', 'message']) {
    assert.ok(html.includes(`name="${name}"`), `the classic ${name} field must survive`);
  }
  assert.deepEqual(formFieldsFor({}), DEFAULT_FORM_FIELDS);
  assert.deepEqual(formFieldsFor({ formFields: [] }), DEFAULT_FORM_FIELDS);
});

test('field names are sanitised, deduped, and cannot collide with internals', () => {
  const fields = normalizeFormFields([
    { label: 'Full Name!', type: 'text' },
    { label: 'Full Name!', type: 'text' },
    { name: '_hp', label: 'Sneaky', type: 'text' },
    { name: '_form', label: 'Sneakier', type: 'text' },
    { name: '2026', label: 'Year', type: 'number' },
  ]);
  assert.deepEqual(fields.map((f) => f.name), ['full_name', 'f2026'],
    'the honeypot and form-name keys are reserved');
});

test('every field type renders a usable control', () => {
  for (const type of Object.keys(FORM_FIELD_TYPES)) {
    const html = renderBlock('form', {
      formFields: [{ name: 'x', label: 'X', type, options: ['A', 'B'] }],
    });
    assert.ok(/<(input|textarea|select)\b/.test(html), `${type} rendered no control`);
    assert.ok(html.includes('name="x"'), `${type} lost its field name`);
  }
});

test('required and options survive to the markup', () => {
  const html = renderBlock('form', {
    formFields: [
      { name: 'svc', label: 'Service', type: 'select', options: ['Lunch', 'Dinner'], required: true },
      { name: 'ok', label: 'I agree', type: 'checkbox', required: true },
    ],
  });
  assert.ok(html.includes('<option value="Lunch">'));
  assert.ok(html.includes('<option value="Dinner">'));
  assert.equal((html.match(/required/g) || []).length, 2);
});

test("the form's heading names it in the submissions inbox", () => {
  const html = renderBlock('form', { headings: ['Book a table'] });
  assert.ok(html.includes('name="_form" value="Book a table"'),
    'several forms on one site are indistinguishable without this');
});

test('form field labels and options are escaped', () => {
  const html = renderBlock('form', {
    formFields: [{ name: 'x', label: '"><script>steal()</script>', type: 'select', options: ['"><script>x</script>'] }],
  });
  assert.ok(!html.includes('<script>steal()'));
  assert.ok(!html.includes('<script>x</script>'));
});

// ------------------------------------------------------------------ A/B stats

const variants = [{ id: 'a', name: 'Control' }, { id: 'b', name: 'Variant B' }];

test('an experiment with no traffic says so rather than guessing', () => {
  const { verdict, leader } = readExperiment(variants, {});
  assert.equal(verdict.state, 'idle');
  assert.equal(leader, null);
});

test('a thin sample is reported as still collecting, never as a winner', () => {
  const { verdict, leader } = readExperiment(variants, {
    a: { impressions: 20, clicks: 1 },
    b: { impressions: 20, clicks: 6 },   // 30% vs 5% — huge, but 20 views
  });
  assert.equal(verdict.state, 'collecting');
  assert.equal(leader, null, 'calling this a win is exactly the expensive mistake');
  assert.ok(/more view/.test(verdict.message));
});

test('a large, clear difference is called', () => {
  const { verdict, leader, results } = readExperiment(variants, {
    a: { impressions: 5000, clicks: 250 },   // 5%
    b: { impressions: 5000, clicks: 400 },   // 8%
  });
  assert.equal(verdict.state, 'winner');
  assert.equal(leader.id, 'b');
  assert.ok(results[1].significant);
  assert.ok(results[1].lift > 0.5);
});

test('equal performance is reported as no difference, not a coin-flip winner', () => {
  const { verdict, leader } = readExperiment(variants, {
    a: { impressions: 5000, clicks: 250 },
    b: { impressions: 5000, clicks: 252 },
  });
  assert.equal(verdict.state, 'no-difference');
  assert.equal(leader, null);
});

test('a significantly WORSE variant is never offered for promotion', () => {
  const { leader, results } = readExperiment(variants, {
    a: { impressions: 5000, clicks: 400 },
    b: { impressions: 5000, clicks: 200 },
  });
  assert.ok(results[1].significant, 'the drop is real…');
  assert.equal(leader, null, '…but a loser is not something to ship');
});

test('the significance threshold is a real sample, and zero-division is safe', () => {
  assert.ok(MIN_IMPRESSIONS >= 100);
  const r = compareVariant({ impressions: 0, clicks: 0 }, { impressions: 0, clicks: 0 });
  assert.equal(r.significant, false);
  assert.ok(Number.isFinite(r.z) && Number.isFinite(r.p));
  assert.equal(formatRate(0.0834), '8.3%');
});

// -------------------------------------------------------------- style hoisting

test('identical block stylesheets are hoisted once', () => {
  const block = '<style>.a{color:red}</style><div>x</div>';
  const { html, css } = extractSharedStyles(block + block + block);
  assert.equal(css, '.a{color:red}');
  assert.ok(!html.includes('<style>'), 'every duplicate copy leaves the body');
  assert.equal((html.match(/<div>x<\/div>/g) || []).length, 3, 'content is untouched');
});

test('a stylesheet used once is left exactly where it was', () => {
  const source = '<style>.only{color:red}</style><div>x</div><style>.other{color:blue}</style>';
  const { html, css } = extractSharedStyles(source);
  assert.equal(css, '', 'moving a one-off block’s rules could change which declaration wins');
  assert.equal(html, source);
});

test('hoisting preserves first-appearance order and is deterministic', () => {
  const src = '<style>.b{}</style><style>.a{}</style><style>.b{}</style><style>.a{}</style>';
  const { css } = extractSharedStyles(src);
  assert.equal(css, '.b{}\n.a{}');
  assert.equal(extractSharedStyles(src).css, css);
});

test('empty and style-free input is a no-op', () => {
  assert.deepEqual(extractSharedStyles(''), { html: '', css: '' });
  assert.deepEqual(extractSharedStyles('<p>hi</p>'), { html: '<p>hi</p>', css: '' });
});

test('a repeated block ships its CSS once on a real page', () => {
  const fields = { headings: ['H'], items: [{ heading: 'a', body: 'b' }] };
  const content = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, html: renderBlock('card-grid', fields) }));
  const page = { id: 'p', name: 'X', slug: '', content, seo: {}, analytics: {}, layout: {} };
  const out = compilePageHtml(page, [page], [], {});
  assert.equal((out.match(/\.nx-item \{/g) || []).length, 1, 'the shared rules should appear once, not eight times');
  assert.equal((out.match(/data-section-id/g) || []).length, 8, 'all eight blocks still render');
});

// ------------------------------------------------------- realtor template set

test('the lead form gates on JS and still submits without it', () => {
  const html = renderBlock('lead-form', {
    headings: ['Home search preferences'],
    items: [{ heading: 'What brings you here?', meta: 'single', body: 'Buying, Selling', image: 'intent' }],
  });
  assert.ok(html.includes('action="/api/public/forms"'), 'responses must land in the Forms inbox');
  assert.ok(html.includes('name="_hp"'), 'honeypot');
  assert.ok(html.includes('name="intent"'), 'answers post under the authored field name');
  // Contact fields keep `required` for the no-JS path…
  assert.ok(/name="email"[^>]*required/.test(html) || /required[^>]*name="email"/.test(html));
  // …and JS strips it, because a hidden required control blocks submit
  // entirely, which silently broke the Continue button.
  assert.ok(html.includes("removeAttribute('required')"));
});

test('lead form escapes authored content', () => {
  const html = renderBlock('lead-form', {
    headings: ['"><script>steal()</script>'],
    items: [{ heading: '"><script>x</script>', meta: 'single', body: '"><script>y</script>', image: 'q' }],
  });
  assert.ok(!html.includes('<script>steal()'));
  assert.ok(!html.includes('<script>x</script>'));
});

test('on-accent text is chosen by contrast, not brightness', () => {
  // The contract is "pick whichever of black/white reads better on this
  // accent" — not "always clear 4.5:1", which no black/white choice can
  // guarantee for an arbitrary colour (the platform's own indigo tops out at
  // 4.47:1 either way). A mid-tone accent is where the old brightness guess
  // went wrong: brass scored just under its threshold and took white at
  // 3.04:1 when black gives 6.22:1.
  for (const accent of ['#C08A2E', '#6366f1', '#4E6E62', '#EDEEE9', '#12201F']) {
    const css = buildThemeStyleBlock({ accent });
    const on = /--on-accent: (\S+);/.exec(css)[1];
    const chosen = contrastRatio(on, accent);
    const other = contrastRatio(on === '#111111' ? '#ffffff' : '#111111', accent);
    assert.ok(chosen >= other, `${accent} chose ${on} at ${chosen.toFixed(2)} over the better ${other.toFixed(2)}`);
  }
  // Brass is the specific case the old rule got backwards.
  const brass = /--on-accent: (\S+);/.exec(buildThemeStyleBlock({ accent: '#C08A2E' }))[1];
  assert.equal(brass, '#111111');
  assert.ok(contrastRatio(brass, '#C08A2E') > 4.5);
});

test('a dark accent is lightened for dark sections, a light one is left alone', () => {
  const onDark = (t) => /--accent-on-dark: (\S+);/.exec(buildThemeStyleBlock(t))[1];

  // The case that prompted this: KW red is legible on paper and not on slate.
  const kw = { primary: '#1A1B24', bg: '#F2F3F7', accent: '#CE011F' };
  assert.ok(contrastRatio('#CE011F', kw.primary) < 3, 'the raw accent really is unreadable there');
  assert.ok(contrastRatio(onDark(kw), kw.primary) >= 4.5, 'the derived one has to clear small-text contrast');

  // It measures against the theme's own dark surface, not a fixed near-black —
  // a value can clear 4.5 on #111 and still fail on #1A1B24.
  for (const primary of ['#1A1B24', '#12201F', '#0B1533', '#262836']) {
    const v = onDark({ primary, bg: '#ffffff', accent: '#CE011F' });
    assert.ok(contrastRatio(v, primary) >= 4.5, `${primary} got ${v}`);
  }

  // An accent that already reads on dark is returned untouched, so themes
  // that predate this variable render exactly as they did.
  assert.equal(onDark({ primary: '#12201F', bg: '#EDEEE9', accent: '#C08A2E' }), '#c08a2e');

  // A light primary is not a dark surface, so it falls back to near-black.
  assert.ok(contrastRatio(onDark({ primary: '#F2F3F7', bg: '#fff', accent: '#CE011F' }), '#111111') >= 4.5);
});

test('the video hero takes its kicker from the dark-safe accent', () => {
  const html = renderBlock('hero-video', { eyebrow: 'Greenville', headings: ['X'] });
  assert.ok(html.includes('color:var(--accent-on-dark, var(--color-accent))'),
    'the hero is always dark, so the raw accent is the wrong variable there');
});

test('a theme with web fonts asks for them once, device fonts ask for nothing', () => {
  const href = webfontHref({ fontFamily: 'sourceserif', fontDisplay: 'grotesk', fontMono: 'plexmono' });
  assert.equal(href.split('family=').length - 1, 3, 'one request covering all three roles');
  assert.ok(href.includes('display=swap'), 'text must paint in the fallback rather than hang invisible');
  assert.equal(webfontHref({ fontFamily: 'system' }), '');
  assert.equal(webfontHref({}), '');
});

// ------------------------------------------------------------ page furniture

test('the video hero fills the screen without a video, and never ships an empty one', () => {
  const html = renderBlock('hero-video', {
    eyebrow: 'Greenville',
    headings: ['A headline worth the whole screen.'],
    text: ['One line about what you do.'],
    links: [{ href: '/start', label: 'Get started' }],
  });
  assert.ok(html.includes('min-height:100svh'), 'a hero that is not full height is just a banner');
  assert.ok(html.includes('<div class="hv-fallback">'), 'no video and no poster still needs something to look at');
  assert.ok(!/<video/.test(html), 'the video is mounted by script, so it costs nothing until it exists');
  assert.ok(!html.includes('data-src="'), 'no video URL means no lazy-mount attribute either');
});

test('a hero video is skipped on metered connections and for reduced motion', () => {
  const html = renderBlock('hero-video', { videoUrl: 'https://cdn.example/h.mp4', headings: ['X'] });
  assert.ok(html.includes('data-src="https://cdn.example/h.mp4"'));
  assert.ok(html.includes('conn.saveData'), 'a 6MB autoplay loop on a capped plan is a real cost to someone');
  assert.ok(html.includes('prefers-reduced-motion'));
  assert.ok(html.includes("v.muted = true"), 'an autoplaying hero with sound is never what was wanted');
});

test('a hero poster replaces the gradient and both are escaped', () => {
  const html = renderBlock('hero-video', {
    images: [{ src: '/a.jpg', alt: '"><script>x</script>' }],
    headings: ['"><script>steal()</script>'],
    eyebrow: '"><img onerror=y>',
  });
  assert.ok(html.includes('src="/a.jpg"'));
  assert.ok(!html.includes('<div class="hv-fallback">'), 'a poster is the fallback');
  assert.ok(!html.includes('<script>steal()'));
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(!html.includes('<img onerror'));
});

test('the sticky bar renders nothing with nothing to say', () => {
  assert.equal(renderBlock('sticky-cta', {}), '');
  assert.equal(renderBlock('sticky-cta', { links: [] }), '');
});

test('the sticky bar is a phone affordance and retracts over its own target', () => {
  const html = renderBlock('sticky-cta', {
    links: [{ href: '/start', label: 'Start' }, { href: 'tel:1', label: 'Call' }],
    buttonLabel: '#search',
  });
  assert.ok(/@media \(min-width:1040px\)\{ \.sk\{ display:none \}/.test(html),
    'on desktop the nav is already visible — a permanent bar is lost space');
  assert.ok(html.includes('data-until="#search"'));
  assert.ok(html.includes('IntersectionObserver'));
  assert.ok(html.includes('safe-area-inset-bottom'), 'it sits where the home indicator is');
  // A bad selector from the editor must not take the page down with it.
  assert.ok(html.includes('try {') && html.includes('catch(e) { return; }'));
  assert.ok(!renderBlock('sticky-cta', { links: [{ href: '/x', label: 'X' }] }).includes('data-until="'),
    'no target means no observer at all');
});

test('the progress bar stays a hairline and stays out of the a11y tree', () => {
  // 0 and '' mean "nothing entered", not "a zero-height bar", so they take the
  // default. Only a real number outside the range gets clamped.
  for (const [limit, px] of [[0, 2], ['', 2], [2, 2], ['4', 4], [40, 8], [-3, 1]]) {
    const html = renderBlock('scroll-progress', { limit });
    assert.ok(html.includes(`height:${px}px`), `limit ${JSON.stringify(limit)} should clamp to ${px}px`);
  }
  assert.ok(renderBlock('scroll-progress', {}).includes('aria-hidden="true"'),
    'it carries no information a screen reader needs');
});

test('the realtor template installs with every link resolving to a real page', () => {
  const row = defaultMarketplaceTemplates().find((t) => t.slug === 'realtor');
  assert.ok(row, 'template should be in the seeded marketplace');
  const { pages, theme } = materializeInstall(row.payload, { stamp: 1 });

  assert.deepEqual(pages.map((p) => p.slug),
    ['index', 'homes', 'listing', 'start', 'black-book', 'portal', 'about', 'notes']);
  assert.equal(theme.fontDisplay, 'grotesk', 'font roles must survive payload validation');

  // The Keller Williams palette, read off kw.com. Every text pair the theme
  // itself controls has to clear 4.5:1 — the red is the one that needs
  // watching, since it only works on light ground.
  assert.equal(theme.accent, '#CE011F');
  for (const [name, fg, bg] of [
    ['text on page', theme.text, theme.bg],
    ['muted on page', theme.muted, theme.bg],
    ['link on page', theme.link, theme.bg],
    ['accent on page', theme.accent, theme.bg],
    ['white on primary', '#ffffff', theme.primary],
    ['white on accent', '#ffffff', theme.accent],
  ]) {
    assert.ok(contrastRatio(fg, bg) >= 4.5, `${name}: ${fg} on ${bg} is ${contrastRatio(fg, bg).toFixed(2)}`);
  }

  const known = new Set(pages.map((p) => (p.slug === 'index' ? '/' : `/${p.slug}`)));
  const broken = [];
  for (const page of pages) {
    for (const section of page.content) {
      assert.ok(section.blockType && section.html, `${page.slug}/${section.name} did not render`);
      const hrefs = [
        ...(section.fields.links || []).map((l) => l.href),
        ...(section.fields.items || []).map((i) => i.link),
      ];
      for (const href of hrefs) {
        if (href && href.startsWith('/') && !known.has(href)) broken.push(`${page.slug} -> ${href}`);
      }
    }
  }
  assert.deepEqual(broken, [], 'a template whose own nav 404s is worse than no template');
});

test('the realtor template puts its furniture where it belongs', () => {
  const row = defaultMarketplaceTemplates().find((t) => t.slug === 'realtor');
  const { pages } = materializeInstall(row.payload, { stamp: 1 });
  const typesOf = (slug) => pages.find((p) => p.slug === slug).content.map((s) => s.blockType);

  assert.equal(typesOf('index')[0], 'scroll-progress', 'the progress bar has to be first to sit on top');
  assert.ok(typesOf('index').includes('hero-video'));

  for (const slug of ['index', 'black-book', 'portal', 'about', 'notes']) {
    assert.ok(typesOf(slug).includes('sticky-cta'), `${slug} needs a thumb-reachable CTA`);
  }
  assert.ok(!typesOf('start').includes('sticky-cta'),
    'the form is the whole page on /start — a bar pointing at it would cover it');
});
