// Property listings: the tags field type, the entry -> listing mapping, and
// the five blocks that render from it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD_TYPES, OPTION_TYPES, normalizeFields, normalizeEntryData,
  missingRequired, fillPlaceholders,
} from '../src/shared/collectionFields.js';
import {
  LISTING_PRESET, LISTING_FIELDS, ALL_FEATURES, STATUS_OPTIONS,
  toListing, toListings, priceLabel, localityOf, facetsOf,
} from '../src/shared/listingsMap.js';
import { applyCollectionToListingBlock, applyEntryToSections } from '../src/shared/collectionsMap.js';
import { renderBlock } from '../src/cms/lib/pasteIn/blockRenderers.js';

const collection = {
  ...LISTING_PRESET,
  fields: normalizeFields(LISTING_FIELDS),
  detailEnabled: true,
  detailBase: 'listings',
};
const entry = (slug, data) => ({
  slug, status: 'published', data: normalizeEntryData(data, collection.fields),
});

const OAK = entry('12-oak', {
  address: '12 Oak Street', price: 385000, status: 'For sale', property_type: 'House',
  beds: 4, baths: 2.5, sqft: 2410, city: 'Greenville', state: 'SC', zip: '29601',
  lat: 34.8526, lng: -82.394, features: ['Pool', 'Fireplace', 'Two-car garage'], mls: '1523441',
});
const PINE = entry('88-pine', {
  address: '88 Pine Ave', price: 2400, status: 'For rent', property_type: 'Condo',
  beds: 2, baths: 1, city: 'Greer', state: 'SC', features: ['Pets allowed'],
});
const ASH = entry('2-ash', {
  address: '2 Ash Way', status: 'Coming soon', property_type: 'Townhouse', beds: 3,
});

// ------------------------------------------------------------- tags field

test('tags is a real field type and keeps only values the field declares', () => {
  assert.ok(FIELD_TYPES.tags, 'the whole feature-filter idea rests on this type existing');
  assert.ok(OPTION_TYPES.has('tags') && OPTION_TYPES.has('select'));

  const [field] = normalizeFields([{ key: 'f', label: 'F', type: 'tags', options: ['Pool', 'HOA'] }]);
  assert.deepEqual(field.options, ['Pool', 'HOA']);

  const keep = (v) => normalizeEntryData({ f: v }, [field]).f;
  // A value outside the option list would be invisible to a filter panel
  // built from that list, so it is dropped rather than stored.
  assert.deepEqual(keep(['Pool', 'Nope', 'HOA']), ['Pool', 'HOA']);
  assert.deepEqual(keep('Pool, HOA'), ['Pool', 'HOA'], 'a comma string from an import still works');
  assert.deepEqual(keep(['Pool', 'Pool']), ['Pool'], 'deduped');
  assert.deepEqual(keep(undefined), []);
});

test('a required tags field is missing until something is ticked', () => {
  const fields = normalizeFields([{ key: 'f', label: 'Features', type: 'tags', options: ['Pool'], required: true }]);
  assert.deepEqual(missingRequired({ f: [] }, fields), ['Features']);
  assert.deepEqual(missingRequired({ f: ['Pool'] }, fields), []);
});

test('a tags value reads as a list in a placeholder, not as [object Object]', () => {
  assert.equal(fillPlaceholders('Has: {{features}}', { features: ['Pool', 'HOA'] }), 'Has: Pool, HOA');
});

// ---------------------------------------------------------- entry mapping

test('the preset gives every key the mapper looks for', () => {
  const listing = toListing(OAK, collection);
  assert.equal(listing.address, '12 Oak Street');
  assert.equal(listing.price, 385000);
  assert.equal(listing.beds, 4);
  assert.equal(listing.baths, 2.5);
  assert.equal(listing.status, 'For sale');
  assert.deepEqual(listing.features, ['Pool', 'Fireplace', 'Two-car garage']);
  assert.equal(listing.href, '/listings/12-oak', 'cards link to the detail page for free');
  assert.equal(localityOf(listing), 'Greenville, SC 29601');
});

test('a value nobody entered stays absent instead of becoming zero', () => {
  // Number(null) and Number('') are both 0, and 0 is a legitimate price,
  // bedroom count and latitude — so an unguarded coercion silently invents
  // data. This put an unpriced listing first in "price: low to high" and
  // printed "0 sqft" on cards.
  const l = toListing(ASH, collection);
  assert.equal(l.price, null);
  assert.equal(l.sqft, null);
  assert.equal(l.lat, null);
  assert.equal(l.beds, 3, 'a value that IS entered still comes through');
  assert.equal(priceLabel(l), 'Price on request');
});

test('rent is labelled per month, because $2,400 and $2,400/mo are not the same offer', () => {
  assert.equal(priceLabel(toListing(PINE, collection)), '$2,400/mo');
  assert.equal(priceLabel(toListing(OAK, collection)), '$385,000');
});

test('an unknown status is dropped rather than rendered as a badge', () => {
  const odd = entry('x', { address: 'X', price: 1 });
  odd.data.status = 'Haunted';
  assert.equal(toListing(odd, collection).status, '');
  for (const s of STATUS_OPTIONS) {
    const e = entry('y', { address: 'Y', price: 1, status: s });
    assert.equal(toListing(e, collection).status, s, `${s} must survive normalisation`);
  }
});

test('a hand-built collection is reachable through an explicit mapping', () => {
  const custom = {
    fields: normalizeFields([
      { key: 'street', label: 'Street', type: 'text' },
      { key: 'asking', label: 'Asking', type: 'number' },
    ]),
  };
  const e = { slug: 'a', data: { street: '9 Kent Rd', asking: 250000 } };
  const l = toListing(e, custom, { address: 'street', price: 'asking' });
  assert.equal(l.address, '9 Kent Rd');
  assert.equal(l.price, 250000);
});

test('facets describe what the listings actually contain, not the whole vocabulary', () => {
  const f = facetsOf(toListings(collection, [OAK, PINE, ASH]));
  assert.deepEqual(f.statuses, ['For sale', 'For rent', 'Coming soon']);
  assert.deepEqual(f.propertyTypes, ['House', 'Condo', 'Townhouse']);
  assert.ok(f.features.includes('Pool'));
  assert.ok(!f.features.includes('Tennis courts'),
    'offering a filter that matches nothing is a dead end for the visitor');
  assert.equal(f.minPrice, 2400);
  assert.equal(f.maxPrice, 385000);
  assert.ok(ALL_FEATURES.length > 40, 'the vocabulary is meant to be broad');
});

// -------------------------------------------------------------- rendering

test('listing cards carry price, stats, badge and a link', () => {
  const fields = applyCollectionToListingBlock({}, collection, [OAK]);
  const html = renderBlock('listing-cards', fields);
  assert.ok(html.includes('$385,000'));
  assert.ok(html.includes('href="/listings/12-oak"'));
  assert.ok(html.includes('4</b> bd') && html.includes('2,410</b> sqft'));
  assert.ok(/data-tone="sale"/.test(html));
});

test('a card omits stats nobody entered rather than printing zeroes', () => {
  const html = renderBlock('listing-cards', applyCollectionToListingBlock({}, collection, [ASH]));
  assert.ok(html.includes('Price on request'));
  assert.ok(!/>0<\/b>/.test(html) && !html.includes('0 sqft'));
});

test('an empty collection says so instead of rendering an empty grid', () => {
  const html = renderBlock('listing-cards', { listings: [], emptyText: 'Nothing yet.' });
  assert.ok(html.includes('Nothing yet.'));
});

test('search ships every listing in the markup with its filter data', () => {
  const fields = applyCollectionToListingBlock({}, collection, [OAK, PINE, ASH]);
  const html = renderBlock('listing-search', fields);
  // Results are in the HTML, not fetched — so they work with JS off and are
  // visible to crawlers.
  assert.equal((html.match(/data-hit\n?\s/g) || html.match(/<div class="ls-hit" data-hit/g) || []).length, 3);
  assert.ok(html.includes('data-features="Pool|Fireplace|Two-car garage"'));
  assert.ok(html.includes('data-price="385000"'));
  assert.ok(html.includes('data-price=""'), 'an unpriced listing carries an empty bound, not 0');
  assert.ok(html.includes('12 oak street'), 'the search index is lowercased for matching');
});

test('search only offers filters that match something', () => {
  const html = renderBlock('listing-search', applyCollectionToListingBlock({}, collection, [OAK]));
  assert.ok(html.includes('value="Pool"'));
  assert.ok(!html.includes('value="Tennis courts"'));
  assert.ok(!html.includes('value="For rent"'), 'no rentals here, so no rental filter');
});

test('the map is tiles and attribution, never a third-party script', () => {
  const html = renderBlock('listing-search', applyCollectionToListingBlock({}, collection, [OAK]));
  assert.ok(html.includes('tile.openstreetmap.org'), 'plain <img> tiles are what strict CSP allows');
  assert.ok(html.includes('openstreetmap.org/copyright'), 'ODbL requires attribution');
  assert.ok(!/<script[^>]+src=/.test(html), 'an external map library would be blocked by script-src');
});

test('a listing with no coordinates gets an explanation, not an empty grey box', () => {
  const html = renderBlock('listing-search', applyCollectionToListingBlock({}, collection, [ASH]));
  assert.ok(html.includes('latitude and longitude'));
});

test('the map can be turned off', () => {
  const on = applyCollectionToListingBlock({}, collection, [OAK]);
  assert.ok(renderBlock('listing-search', on).includes('<div class="ls-map"'));
  assert.ok(!renderBlock('listing-search', { ...on, showMap: false }).includes('<div class="ls-map"'));
});

test('detail blocks are re-rendered from the entry, not string-substituted', () => {
  const sections = [
    { id: 'a', blockType: 'listing-hero', fields: {}, html: '<i>stale</i>' },
    { id: 'b', blockType: 'listing-facts', fields: { headings: ['Property details'] }, html: '<i>stale</i>' },
    { id: 'c', blockType: 'listing-features', fields: {}, html: '<i>stale</i>' },
    { id: 'd', blockType: 'content', fields: {}, html: '<p>At {{address}}</p>' },
  ];
  const out = applyEntryToSections(sections, OAK, collection);
  assert.ok(!out[0].html.includes('stale'));
  assert.ok(out[0].html.includes('$385,000') && out[0].html.includes('12 Oak Street'));
  assert.ok(out[1].html.includes('MLS #') && out[1].html.includes('1523441'));
  assert.ok(out[2].html.includes('Pool') && out[2].html.includes('Systems &amp; parking'));
  // An ordinary block still gets placeholder substitution.
  assert.equal(out[3].html, '<p>At 12 Oak Street</p>');
});

test('the features block disappears when a listing has none tagged', () => {
  assert.equal(renderBlock('listing-features', { listing: { features: [] } }), '');
  const out = applyEntryToSections(
    [{ id: 'c', blockType: 'listing-features', fields: {}, html: '<i>stale</i>' }], ASH, collection,
  );
  assert.equal(out[0].html, '', 'better an absent section than an empty heading');
});

test('the photo grid adapts to how many photos there are', () => {
  for (const n of [1, 2, 3, 4, 5, 9]) {
    const gallery = Array.from({ length: n }, (_, i) => `/p${i}.jpg`);
    const html = renderBlock('listing-hero', { listing: { gallery, image: gallery[0], features: [] } });
    const shown = Math.min(n, 5);
    assert.equal(/<div class="lh-shots" data-n="(\d+)"/.exec(html)[1], String(shown));
    assert.equal((html.match(/<img /g) || []).length, shown);
  }
  assert.ok(renderBlock('listing-hero', { listing: { features: [] } }).includes('No photos'));
});

test('authored listing content is escaped everywhere it renders', () => {
  const nasty = entry('x', {
    address: '"><script>steal()</script>', city: '"><img onerror=y>', price: 1, mls: '"><b>x</b>',
  });
  const one = toListing(nasty, collection);
  for (const html of [
    renderBlock('listing-cards', { listings: [one] }),
    renderBlock('listing-search', { listings: [one], facets: {} }),
    renderBlock('listing-hero', { listing: one }),
    renderBlock('listing-facts', { listing: one }),
  ]) {
    assert.ok(!html.includes('<script>steal()'), 'script tag survived');
    assert.ok(!html.includes('<img onerror'), 'img handler survived');
    assert.ok(!html.includes('"><b>x</b>'), 'attribute break survived');
  }
});
