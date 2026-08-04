// Property listings on top of the generic collection machinery.
//
// A listing is just a collection entry, so it inherits entry validation,
// draft/published status, detail-page routing and the media library for free.
// What it needs on top is a *known shape*: a card can't show "3 bd · 2 ba ·
// 1,840 sqft" from a bag of arbitrary jsonb keys, and a price filter can't
// work unless something guarantees which key holds the price.
//
// So this module owns two things:
//
//   LISTING_FIELDS   the preset a "Property listings" collection is created
//                    with, which is what makes the zero-config path work.
//   toListing()      entry -> the flat shape every listing block renders from,
//                    with a `mapping` escape hatch for a collection that was
//                    built by hand with different key names.
//
// Deliberately not a new table. Listings differ from case studies by their
// fields, not by their storage, and a parallel table would mean re-solving
// drafts, slugs, org scoping and detail pages a second time.

import { guessRole } from './collectionFields.js';

// The statuses a listing can be in. `label` is what renders on the badge;
// `tone` picks the badge colour without hardcoding a palette in the renderer.
export const LISTING_STATUSES = {
  'For sale': { tone: 'sale' },
  'For rent': { tone: 'rent' },
  'Foreclosure': { tone: 'alert' },
  'Coming soon': { tone: 'soon' },
  'Pending': { tone: 'soon' },
  'Under contract': { tone: 'soon' },
  'Sold': { tone: 'done' },
  'Off market': { tone: 'done' },
};

export const STATUS_OPTIONS = Object.keys(LISTING_STATUSES);

export const PROPERTY_TYPES = [
  'House', 'Condo', 'Townhouse', 'Multi-family', 'Land', 'Mobile', 'Commercial',
];

// The amenity vocabulary. Grouped because a flat list of forty checkboxes is
// unusable in a filter panel, and because the groups are how people actually
// think about narrowing a search.
export const FEATURE_GROUPS = [
  {
    label: 'Outdoor',
    options: ['Pool', 'Hot tub', 'Fenced yard', 'Deck', 'Patio', 'Porch', 'Screened porch',
      'Outdoor kitchen', 'Fire pit', 'Waterfront', 'Water view', 'Mountain view', 'Corner lot', 'Cul-de-sac'],
  },
  {
    label: 'Interior',
    options: ['Fireplace', 'Hardwood floors', 'Updated kitchen', 'Granite counters', 'Quartz counters',
      'Stainless appliances', 'Kitchen island', 'Walk-in closet', 'Primary on main', 'Open floor plan',
      'Vaulted ceilings', 'Finished basement', 'Bonus room', 'Home office', 'Laundry room'],
  },
  {
    label: 'Systems & parking',
    options: ['Garage', 'Two-car garage', 'Carport', 'RV parking', 'Central air', 'New HVAC', 'New roof',
      'Solar panels', 'Generator', 'Well water', 'Septic', 'EV charger'],
  },
  {
    label: 'Community',
    options: ['HOA', 'No HOA', 'Gated', 'Clubhouse', 'Community pool', 'Tennis courts', 'Golf course',
      'Playground', 'Walking trails', 'Age restricted', 'New construction'],
  },
  {
    label: 'Good to know',
    options: ['Move-in ready', 'Needs work', 'Investment property', 'Rental income', 'Pets allowed',
      'Furnished', 'Accessible', 'Single story', 'Cash only', 'Price reduced'],
  },
];

export const ALL_FEATURES = FEATURE_GROUPS.flatMap((g) => g.options);

/**
 * The field set a "Property listings" collection is created with.
 *
 * Key names are the ones toListing() looks for, so a collection made from
 * this preset needs no mapping at all. Only address and price are required —
 * an agent adding a coming-soon listing shouldn't be blocked on square
 * footage they don't have yet.
 */
export const LISTING_FIELDS = [
  { key: 'address', label: 'Address', type: 'text', required: true, help: 'Street address — this is the listing title.' },
  { key: 'price', label: 'Price', type: 'number', required: true, help: 'Sale price, or monthly rent for rentals.' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  { key: 'property_type', label: 'Property type', type: 'select', options: PROPERTY_TYPES },
  { key: 'beds', label: 'Bedrooms', type: 'number' },
  { key: 'baths', label: 'Bathrooms', type: 'number', help: 'Halves are fine — 2.5.' },
  { key: 'sqft', label: 'Square feet', type: 'number' },
  { key: 'lot_size', label: 'Lot size', type: 'text', help: 'e.g. 0.34 acres' },
  { key: 'year_built', label: 'Year built', type: 'number' },
  { key: 'image', label: 'Main photo', type: 'image' },
  { key: 'gallery', label: 'More photos', type: 'textarea', help: 'One image URL per line.' },
  { key: 'city', label: 'City', type: 'text' },
  { key: 'state', label: 'State', type: 'text' },
  { key: 'zip', label: 'ZIP', type: 'text' },
  { key: 'lat', label: 'Latitude', type: 'number', help: 'Needed to place it on the map.' },
  { key: 'lng', label: 'Longitude', type: 'number' },
  { key: 'features', label: 'Features', type: 'tags', options: ALL_FEATURES },
  { key: 'hoa_fee', label: 'HOA fee', type: 'number', help: 'Monthly, if any.' },
  { key: 'mls', label: 'MLS #', type: 'text' },
  { key: 'listed_on', label: 'Listed on', type: 'date' },
  { key: 'tax_year', label: 'Annual property tax', type: 'number', help: 'Used to estimate the monthly payment.' },
  {
    key: 'price_history', label: 'Price history', type: 'textarea',
    help: 'One event per line: 2026-06-02 | Listed | 385000',
  },
  {
    key: 'schools', label: 'Nearby schools', type: 'textarea',
    help: 'One per line: Greenville High | 7 | 1.2 mi | 9-12',
  },
  { key: 'description', label: 'Description', type: 'richtext' },
];

export const LISTING_PRESET = {
  name: 'Property listings',
  slug: 'listings',
  description: 'Homes for sale, rent, or foreclosure — with photos, features, and a map location.',
  fields: LISTING_FIELDS,
  detailEnabled: true,
  detailBase: 'listings',
};

// Number(null) and Number('') are both 0, and 0 is a perfectly good price,
// bedroom count or latitude — so an unguarded Number() turns "not entered"
// into a real zero. That put an unpriced listing at the top of "price: low to
// high" and printed "0 bd" on cards for homes whose bedroom count nobody had
// filled in yet. Absent has to stay absent all the way to the renderer.
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Look up a listing role in the entry, honouring an explicit mapping first. */
function keyFor(role, fields, mapping) {
  if (mapping?.[role]) return mapping[role];
  if (fields.some((f) => f.key === role)) return role;
  // Only the roles a card genuinely can't do without are worth guessing at;
  // guessing which number field is "baths" would be worse than showing nothing.
  if (role === 'address') return guessRole(fields, 'title');
  if (role === 'image') return guessRole(fields, 'image');
  if (role === 'description') return guessRole(fields, 'body');
  return null;
}

/**
 * Flatten one entry into the shape every listing block renders from.
 *
 * Missing values come back as null rather than 0 or '' so a card can tell
 * "studio" from "bedroom count not entered" and leave the slot out entirely.
 */
export function toListing(entry, collection, mapping = {}) {
  const fields = collection?.fields || [];
  const data = entry?.data || {};
  const at = (role) => {
    const key = keyFor(role, fields, mapping);
    return key ? data[key] : undefined;
  };

  const statusRaw = String(at('status') || '').trim();
  const status = LISTING_STATUSES[statusRaw] ? statusRaw : '';
  const features = Array.isArray(at('features')) ? at('features') : [];
  const gallery = String(at('gallery') || '')
    .split(/[\n,]/).map((s) => s.trim()).filter(Boolean).slice(0, 40);
  const image = String(at('image') || '') || gallery[0] || '';

  const href = collection?.detailEnabled && collection.detailBase
    ? `/${collection.detailBase}/${entry.slug}`
    : '';

  // Pipe-delimited lines rather than nested jsonb: a price history and a
  // school list are small, ordered, and edited as a block. A repeating-group
  // editor for two fields nobody fills in more than five times is more
  // machinery than the problem needs, and this pastes cleanly out of a sheet.
  const lines = (raw, arity) => String(raw || '')
    .split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split('|').map((c) => c.trim()))
    .filter((c) => c.length >= 2)
    .map((c) => c.slice(0, arity))
    .slice(0, 40);

  return {
    slug: entry?.slug || '',
    href,
    address: String(at('address') || ''),
    city: String(at('city') || ''),
    state: String(at('state') || ''),
    zip: String(at('zip') || ''),
    price: num(at('price')),
    status,
    tone: LISTING_STATUSES[status]?.tone || '',
    propertyType: String(at('property_type') || ''),
    beds: num(at('beds')),
    baths: num(at('baths')),
    sqft: num(at('sqft')),
    lotSize: String(at('lot_size') || ''),
    yearBuilt: num(at('year_built')),
    hoaFee: num(at('hoa_fee')),
    mls: String(at('mls') || ''),
    listedOn: String(at('listed_on') || ''),
    annualTax: num(at('tax_year')),
    priceHistory: lines(at('price_history'), 3)
      .map(([date, event, amount]) => ({ date, event, price: num(amount) })),
    schools: lines(at('schools'), 4)
      .map(([name, rating, distance, grades]) => ({
        name, rating: num(rating), distance: distance || '', grades: grades || '',
      })),
    lat: num(at('lat')),
    lng: num(at('lng')),
    image,
    gallery: gallery.length ? gallery : (image ? [image] : []),
    features,
    description: String(at('description') || ''),
  };
}

/** Every published entry as a listing, newest sort order first. */
export function toListings(collection, entries, { mapping = {}, limit } = {}) {
  const all = (entries || []).map((e) => toListing(e, collection, mapping));
  return limit && limit > 0 ? all.slice(0, limit) : all;
}

/** The locality line a card shows under the address. */
export function localityOf(l) {
  const tail = [l.state, l.zip].filter(Boolean).join(' ');
  return [l.city, tail].filter(Boolean).join(', ');
}

/**
 * Price for display. Rentals read as "/mo" because a $2,400 house and a
 * $2,400/mo rental are wildly different things to show side by side.
 */
export function priceLabel(l) {
  if (l.price === null) return 'Price on request';
  const n = `$${Math.round(l.price).toLocaleString('en-US')}`;
  return l.status === 'For rent' ? `${n}/mo` : n;
}

/** The filter vocabulary actually present in a set of listings. */
export function facetsOf(listings) {
  const has = (fn) => [...new Set(listings.map(fn).filter(Boolean))];
  const prices = listings.map((l) => l.price).filter((p) => p !== null);
  return {
    statuses: STATUS_OPTIONS.filter((s) => listings.some((l) => l.status === s)),
    propertyTypes: has((l) => l.propertyType),
    features: ALL_FEATURES.filter((f) => listings.some((l) => l.features.includes(f))),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
  };
}
