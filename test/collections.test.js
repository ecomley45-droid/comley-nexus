// Collections are the first place a workspace defines its own data shape, so
// the normalizers are the contract: what a field can be, what an entry can
// hold, and how entries become the items a block already knows how to draw.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD_TYPES, normalizeFields, normalizeEntryData, missingRequired,
  slugify, keyify, guessRole, fillPlaceholders,
} from '../src/shared/collectionFields.js';
import {
  entriesToItems, applyCollectionToBlock, applyEntryToSections, COLLECTION_LAYOUTS,
} from '../src/shared/collectionsMap.js';
import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';

const FIELDS = normalizeFields([
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'summary', label: 'Summary', type: 'textarea' },
  { key: 'cover', label: 'Cover', type: 'image' },
  { key: 'category', label: 'Category', type: 'select', options: ['Retail', 'Health'] },
  { key: 'published_on', label: 'Published', type: 'date' },
  { key: 'featured', label: 'Featured', type: 'boolean' },
]);

const collection = (over = {}) => ({ name: 'Case Studies', slug: 'case-studies', fields: FIELDS, ...over });

test('field keys are sanitised and deduped', () => {
  const fields = normalizeFields([
    { label: 'Job Title!', type: 'text' },
    { label: 'Job Title!', type: 'text' },   // duplicate key
    { key: '9lives', label: 'Nine', type: 'text' },
    { key: 'ok', label: 'Ok', type: 'nonsense' },
    null, 'nope',
  ]);
  assert.deepEqual(fields.map((f) => f.key), ['job_title', 'f9lives', 'ok']);
  assert.equal(fields.at(-1).type, 'text', 'an unknown type falls back rather than being dropped');
});

test('select fields keep only their declared options', () => {
  const [field] = normalizeFields([{ key: 'c', label: 'C', type: 'select', options: ['A', 'B', '', 'A'] }]);
  assert.deepEqual(field.options, ['A', 'B', 'A']);
  assert.equal(normalizeEntryData({ c: 'Z' }, [field]).c, '', 'a value outside the list is refused');
  assert.equal(normalizeEntryData({ c: 'B' }, [field]).c, 'B');
});

test('entry data is coerced by type, and unknown keys are dropped', () => {
  const data = normalizeEntryData({
    title: 'A study', summary: 'Long text', cover: 'https://cdn/x.png',
    category: 'Retail', published_on: '2026-03-14', featured: 'true',
    strayKey: 'should vanish',
  }, FIELDS);
  assert.equal(data.title, 'A study');
  assert.equal(data.featured, true);
  assert.equal(data.published_on, '2026-03-14');
  assert.ok(!('strayKey' in data), 'a removed field must not linger invisibly in the row');
});

test('a bad date coerces to empty rather than Invalid Date', () => {
  assert.equal(normalizeEntryData({ published_on: 'not a date' }, FIELDS).published_on, '');
});

test('required fields are reported by label, not key', () => {
  assert.deepEqual(missingRequired({ title: '' }, FIELDS), ['Title']);
  assert.deepEqual(missingRequired({ title: 'x' }, FIELDS), []);
});

test('slugify and keyify produce safe, stable identifiers', () => {
  assert.equal(slugify('Case Studies!'), 'case-studies');
  assert.equal(slugify('   '), '');
  assert.equal(slugify('', 'fallback'), 'fallback');
  assert.equal(keyify('Job Title'), 'job_title');
  assert.equal(keyify('2026 Revenue'), 'f2026_revenue', 'a key cannot start with a digit');
});

test('roles are guessed by name first, then by type', () => {
  assert.equal(guessRole(FIELDS, 'title'), 'title');
  assert.equal(guessRole(FIELDS, 'image'), 'cover');
  assert.equal(guessRole(FIELDS, 'body'), 'summary');

  const odd = normalizeFields([{ key: 'naam', label: 'Naam', type: 'text' }, { key: 'plaatje', label: 'Plaatje', type: 'image' }]);
  assert.equal(guessRole(odd, 'title'), 'naam', 'an oddly-named collection still resolves by type');
  assert.equal(guessRole(odd, 'image'), 'plaatje');
  assert.equal(guessRole(odd, 'link'), null);
});

const ENTRIES = [
  { slug: 'a', data: { title: 'Alpha', summary: 'First', cover: 'https://cdn/a.png', category: 'Retail', featured: true } },
  { slug: 'b', data: { title: 'Beta', summary: 'Second', cover: 'https://cdn/b.png', category: 'Health', featured: false } },
];

test('entries map onto the standard item shape', () => {
  const items = entriesToItems(collection(), ENTRIES);
  assert.equal(items.length, 2);
  assert.equal(items[0].heading, 'Alpha');
  assert.equal(items[0].body, 'First');
  assert.equal(items[0].image, 'https://cdn/a.png');
});

test('entries link to their detail page when the collection publishes one', () => {
  const withDetail = collection({ detailEnabled: true, detailBase: 'case-studies' });
  assert.equal(entriesToItems(withDetail, ENTRIES)[0].link, '/case-studies/a');
  assert.equal(entriesToItems(collection(), ENTRIES)[0].link, '', 'no detail pages means no link');
});

test('an explicit mapping overrides the guess', () => {
  const items = entriesToItems(collection(), ENTRIES, { mapping: { title: 'category' } });
  assert.equal(items[0].heading, 'Retail');
});

test('limit caps the entries rendered', () => {
  assert.equal(entriesToItems(collection(), ENTRIES, { limit: 1 }).length, 1);
  assert.equal(entriesToItems(collection(), ENTRIES, { limit: 0 }).length, 2, '0 means no limit');
});

test('every layout maps to a real block that renders', () => {
  for (const [key, layout] of Object.entries(COLLECTION_LAYOUTS)) {
    const { blockType, fields } = applyCollectionToBlock({ layout: key, headings: ['Work'] }, collection(), ENTRIES);
    assert.equal(blockType, layout.blockType);
    const html = renderBlock(blockType, fields);
    assert.ok(html, `${key} rendered nothing`);
    assert.ok(html.includes('Alpha') || html.includes('cdn/a.png'), `${key} lost the entry content`);
  }
});

test('the gallery layout fills images, not items', () => {
  const { fields } = applyCollectionToBlock({ layout: 'gallery' }, collection(), ENTRIES);
  assert.equal(fields.images.length, 2);
  assert.ok(!fields.items);
});

test('an unknown layout falls back rather than rendering nothing', () => {
  const { blockType } = applyCollectionToBlock({ layout: 'wat' }, collection(), ENTRIES);
  assert.equal(blockType, COLLECTION_LAYOUTS.cards.blockType);
});

test('the block keeps its own heading and copy', () => {
  const { fields } = applyCollectionToBlock({ layout: 'cards', headings: ['Our work'], text: ['Intro.'] }, collection(), ENTRIES);
  assert.deepEqual(fields.headings, ['Our work']);
  assert.deepEqual(fields.text, ['Intro.']);
});

test('detail pages fill placeholders and never leave one visible', () => {
  const sections = [{ id: 's1', html: '<h1>{{title}}</h1><p>{{summary}}</p><span>{{nonexistent}}</span>' }];
  const [out] = applyEntryToSections(sections, ENTRIES[0]);
  assert.ok(out.html.includes('<h1>Alpha</h1>'));
  assert.ok(out.html.includes('<p>First</p>'));
  assert.ok(!out.html.includes('{{'), 'an unresolved placeholder on a live page is worse than nothing');
});

test('placeholder filling tolerates spacing, case and falsy values', () => {
  assert.equal(fillPlaceholders('{{ Title }}', { title: 'X' }), 'X');
  assert.equal(fillPlaceholders('{{featured}}', { featured: false }), '');
  assert.equal(fillPlaceholders('{{count}}', { count: 0 }), '0', 'zero is a value, not an absence');
  assert.equal(fillPlaceholders('no tokens', {}), 'no tokens');
});

test('the field vocabulary stays a closed set', () => {
  for (const type of Object.keys(FIELD_TYPES)) {
    const [f] = normalizeFields([{ key: 'x', label: 'X', type }]);
    assert.equal(f.type, type, `${type} should survive normalisation`);
    assert.doesNotThrow(() => normalizeEntryData({ x: 'value' }, [f]), `${type} has no coercion`);
  }
});
