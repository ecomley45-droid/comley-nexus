// Form fields, A/B significance, and stylesheet hoisting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFormFields, formFieldsFor, DEFAULT_FORM_FIELDS, FORM_FIELD_TYPES } from '../src/shared/formFields.js';
import { readExperiment, compareVariant, MIN_IMPRESSIONS, formatRate } from '../src/shared/abStats.js';
import { extractSharedStyles } from '../src/shared/dedupeStyles.js';
import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';
import { compilePageHtml } from '../src/shared/compilePage.js';

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
