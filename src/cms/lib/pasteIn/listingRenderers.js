// Renderers for property listings.
//
// Split out of blockRenderers.js because these five are bigger than the
// average block and share a card, a badge and a stat row between them —
// keeping them together means one place to change what a listing looks like.
//
// Same contract as every other renderer: pure (fields) -> html, no state, and
// nothing trusted from storage. The entries themselves arrive already
// flattened by src/shared/listingsMap.js, so nothing here reaches into a
// collection's jsonb.

import { FEATURE_GROUPS, localityOf, priceLabel } from '../../../shared/listingsMap.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const LAZY = 'loading="lazy" decoding="async"';
const num = (n) => (n === null || n === undefined ? '' : Number(n).toLocaleString('en-US'));

// Shared by every listing block, hoisted once by extractSharedStyles when a
// page uses more than one of them.
const CARD_CSS = `
.lst-grid { display:grid; gap:20px; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); }
.lst-card { display:flex; flex-direction:column; border:1px solid var(--border); border-radius:12px; overflow:hidden; background:var(--surface); text-decoration:none; color:inherit; }
.lst-card:hover .lst-addr { text-decoration:underline; }
.lst-shot { position:relative; aspect-ratio:4/3; background:var(--surface-strong); }
.lst-shot img { width:100%; height:100%; object-fit:cover; display:block; }
.lst-none { display:flex; align-items:center; justify-content:center; height:100%; color:var(--color-muted); font-size:13px; }
.lst-badge { position:absolute; top:12px; left:12px; font-family:var(--font-mono,monospace); font-size:10px; letter-spacing:.09em; text-transform:uppercase; padding:6px 10px; border-radius:3px; background:var(--color-primary); color:#fff; }
.lst-badge[data-tone="sale"] { background:var(--color-accent); color:var(--on-accent,#fff); }
.lst-badge[data-tone="rent"] { background:var(--color-secondary); color:#fff; }
.lst-badge[data-tone="alert"] { background:#8A0011; color:#fff; }
.lst-badge[data-tone="soon"] { background:var(--color-primary); color:#fff; }
.lst-badge[data-tone="done"] { background:var(--color-muted); color:#fff; }
.lst-body { padding:16px; display:flex; flex-direction:column; gap:6px; flex:1; }
.lst-price { font-family:var(--font-display); font-size:21px; font-weight:700; letter-spacing:-.02em; }
.lst-addr { font-size:15px; font-weight:600; }
.lst-where { font-size:13px; color:var(--color-muted); }
.lst-stats { display:flex; flex-wrap:wrap; gap:12px; margin-top:6px; padding-top:12px; border-top:1px solid var(--border); font-size:13px; color:var(--color-muted); }
.lst-stats b { color:var(--color-text); font-weight:600; }
.lst-tags { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
.lst-tag { font-size:11px; padding:4px 9px; border-radius:999px; background:var(--accent-soft); color:var(--color-text); }
.lst-empty { padding:40px 20px; text-align:center; color:var(--color-muted); border:1px dashed var(--border); border-radius:12px; }
`;

// Is this block actually bound to a listing, or is it sitting in the editor
// waiting to be? The three blocks that collapse when they have nothing to
// show have to tell those apart: an empty section is right on a live listing
// with no features tagged, and wrong in the editor, where dropping a block
// and seeing nothing at all reads as broken.
const boundToListing = (l) => Boolean(l && (l.slug || l.address));

const placeholder = (what) =>
  `<style>.lst-ph { max-width:1240px; margin:0 auto; padding:28px 24px; }
.lst-ph div { padding:28px 20px; text-align:center; color:var(--color-muted); font-size:13.5px; border:1px dashed var(--border); border-radius:12px; }
</style><div class="lst-ph"><div>${esc(what)} appears here once this page is showing a listing.</div></div>`;

const statBits = (l) => [
  l.beds !== null ? `<span><b>${esc(num(l.beds))}</b> bd</span>` : '',
  l.baths !== null ? `<span><b>${esc(num(l.baths))}</b> ba</span>` : '',
  l.sqft !== null ? `<span><b>${esc(num(l.sqft))}</b> sqft</span>` : '',
  l.lotSize ? `<span><b>${esc(l.lotSize)}</b></span>` : '',
].filter(Boolean).join('');

/**
 * One listing card. `tagLimit` keeps a listing with twenty amenities from
 * making its card four times taller than its neighbours in the grid.
 */
export function listingCard(l, { tagLimit = 3 } = {}) {
  const tag = l.status
    ? `<span class="lst-badge" data-tone="${esc(l.tone)}">${esc(l.status)}</span>` : '';
  const where = localityOf(l);
  const tags = (l.features || []).slice(0, tagLimit)
    .map((f) => `<span class="lst-tag">${esc(f)}</span>`).join('');
  const shot = l.image
    ? `<img ${LAZY} src="${esc(l.image)}" alt="${esc(l.address)}" />`
    : '<div class="lst-none">No photo yet</div>';
  // A listing with no detail page is still worth showing, just not as a link.
  const openTag = l.href ? `<a class="lst-card" href="${esc(l.href)}">` : '<div class="lst-card">';
  return `${openTag}
  <div class="lst-shot">${shot}${tag}</div>
  <div class="lst-body">
    <div class="lst-price">${esc(priceLabel(l))}</div>
    <div class="lst-addr">${esc(l.address)}</div>
    ${where ? `<div class="lst-where">${esc(where)}</div>` : ''}
    ${statBits(l) ? `<div class="lst-stats">${statBits(l)}</div>` : ''}
    ${tags ? `<div class="lst-tags">${tags}</div>` : ''}
  </div>
${l.href ? '</a>' : '</div>'}`;
}

// A plain grid of listings — the "featured homes" strip for a home page.
// Bind it to a collection and it fills itself; the placeholder state is what
// shows in the editor before a collection is picked.
export function renderListingCards(fields) {
  const listings = Array.isArray(fields.listings) ? fields.listings : [];
  const heading = fields.headings?.[0];
  const body = (fields.text || []).map((t) => `<p class="lst-lede">${esc(t)}</p>`).join('');
  const cards = listings.length
    ? listings.map((l) => listingCard(l, { tagLimit: Number(fields.tagLimit) || 3 })).join('\n')
    : `<div class="lst-empty">${esc(fields.emptyText || 'No listings yet. Bind this block to a listings collection.')}</div>`;
  return `<style>${CARD_CSS}
.lst-wrap { max-width:1240px; margin:0 auto; padding:64px 24px; }
.lst-head { margin-bottom:24px; }
.lst-head h2 { font-family:var(--font-display); font-size:var(--text-h2); letter-spacing:-.02em; margin:0 0 8px; }
.lst-lede { color:var(--color-muted); margin:0; max-width:60ch; }
</style>
<div class="lst-wrap">
  ${heading || body ? `<div class="lst-head">${heading ? `<h2>${esc(heading)}</h2>` : ''}${body}</div>` : ''}
  <div class="lst-grid">${cards}</div>
</div>`;
}

// ---------------------------------------------------------------- search

// Filters + sort + map + results, as one block.
//
// Everything filters client-side over the listings already in the markup.
// That means no API round-trip per keystroke, the results are in the HTML for
// crawlers and for anyone with JS off, and it stays inside the strict CSP
// (which allows hash-pinned inline script but no external JS at all).
//
// The map is drawn from OpenStreetMap raster tiles as plain <img> elements.
// That is a deliberate choice over Leaflet or Mapbox: `img-src https:` is
// already allowed, `script-src` is not, so a CDN map library would be blocked
// outright. Tiles need attribution under ODbL, which is rendered below.
export function renderListingSearch(fields) {
  const listings = Array.isArray(fields.listings) ? fields.listings : [];
  const facets = fields.facets || {};
  const showMap = fields.showMap !== false;
  const pins = listings.filter((l) => l.lat !== null && l.lng !== null);

  const chips = (name, values) => (values || []).map((v) => `
      <label class="ls-chip"><input type="checkbox" name="${esc(name)}" value="${esc(v)}" /><span>${esc(v)}</span></label>`).join('');

  const featureGroups = FEATURE_GROUPS
    .map((g) => ({ label: g.label, options: g.options.filter((o) => (facets.features || []).includes(o)) }))
    .filter((g) => g.options.length > 0);

  const cards = listings.map((l) => `<div class="ls-hit" data-hit
    data-price="${l.price === null ? '' : esc(l.price)}"
    data-beds="${l.beds === null ? '' : esc(l.beds)}"
    data-baths="${l.baths === null ? '' : esc(l.baths)}"
    data-sqft="${l.sqft === null ? '' : esc(l.sqft)}"
    data-status="${esc(l.status)}"
    data-type="${esc(l.propertyType)}"
    data-features="${esc((l.features || []).join('|'))}"
    data-lat="${l.lat === null ? '' : esc(l.lat)}"
    data-lng="${l.lng === null ? '' : esc(l.lng)}"
    data-text="${esc([l.address, localityOf(l), l.mls].filter(Boolean).join(' ').toLowerCase())}"
    >${listingCard(l)}</div>`).join('\n');

  return `<style>${CARD_CSS}
.ls { max-width:1400px; margin:0 auto; padding:40px 24px 72px; }
.ls-top { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-bottom:18px; }
.ls-search { flex:1; min-width:220px; padding:13px 15px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--color-text); font-size:15px; font-family:inherit; }
.ls-sort { padding:13px 15px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--color-text); font-size:14px; font-family:inherit; }
.ls-toggle { padding:13px 16px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--color-text); font-size:14px; cursor:pointer; font-family:inherit; }
.ls-layout { display:grid; gap:24px; grid-template-columns:1fr; }
@media (min-width:1080px){ .ls-layout { grid-template-columns:270px 1fr; } .ls-panel { position:sticky; top:20px; align-self:start; max-height:calc(100vh - 40px); overflow-y:auto; } }
.ls-panel { border:1px solid var(--border); border-radius:12px; padding:18px; background:var(--surface); }
.ls-panel[hidden] { display:none; }
.ls-grp { margin-bottom:18px; }
.ls-grp > b { display:block; font-family:var(--font-mono,monospace); font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--color-muted); margin-bottom:9px; }
.ls-range { display:flex; gap:8px; }
.ls-range input { width:100%; min-width:0; padding:9px 10px; border:1px solid var(--border); border-radius:6px; background:var(--color-bg); color:var(--color-text); font-size:13px; font-family:inherit; }
.ls-chip { display:inline-flex; align-items:center; gap:6px; margin:0 6px 6px 0; }
.ls-chip input { position:absolute; opacity:0; pointer-events:none; }
.ls-chip span { display:inline-block; font-size:12.5px; padding:6px 11px; border-radius:999px; border:1px solid var(--border); cursor:pointer; }
.ls-chip input:checked + span { background:var(--color-accent); color:var(--on-accent,#fff); border-color:var(--color-accent); }
.ls-chip input:focus-visible + span { outline:2px solid var(--color-link); outline-offset:2px; }
.ls-count { font-size:13px; color:var(--color-muted); margin-bottom:14px; }
.ls-clear { background:none; border:none; padding:0; color:var(--color-link); font:inherit; font-size:13px; cursor:pointer; text-decoration:underline; }
.ls-hit[hidden] { display:none; }
.ls-map { position:relative; height:340px; border:1px solid var(--border); border-radius:12px; overflow:hidden; margin-bottom:20px; background:var(--surface-strong); }
.ls-tiles { position:absolute; inset:0; }
.ls-tiles img { position:absolute; width:256px; height:256px; user-select:none; }
.ls-pin { position:absolute; transform:translate(-50%,-100%); background:var(--color-accent); color:var(--on-accent,#fff); font-size:11.5px; font-weight:700; padding:5px 9px; border-radius:4px; white-space:nowrap; text-decoration:none; box-shadow:0 2px 6px rgba(0,0,0,.3); }
.ls-pin::after { content:""; position:absolute; left:50%; top:100%; transform:translateX(-50%); border:5px solid transparent; border-top-color:var(--color-accent); }
.ls-zoom { position:absolute; top:10px; right:10px; display:flex; flex-direction:column; gap:4px; }
.ls-zoom button { width:32px; height:32px; font-size:17px; line-height:1; border:1px solid var(--border); border-radius:6px; background:var(--color-bg); color:var(--color-text); cursor:pointer; }
.ls-attr { position:absolute; bottom:0; right:0; font-size:10px; padding:3px 6px; background:rgba(255,255,255,.82); color:#222; }
.ls-attr a { color:#222; }
.ls-nomap { display:flex; align-items:center; justify-content:center; height:100%; color:var(--color-muted); font-size:13px; text-align:center; padding:20px; }
</style>
<div class="ls" data-listings>
  <div class="ls-top">
    <input class="ls-search" type="search" data-q placeholder="${esc(fields.placeholder || 'Search by address, city, or MLS #')}" aria-label="Search listings" />
    <select class="ls-sort" data-sort aria-label="Sort listings">
      <option value="new">Newest</option>
      <option value="price-asc">Price: low to high</option>
      <option value="price-desc">Price: high to low</option>
      <option value="sqft-desc">Largest</option>
      <option value="beds-desc">Most bedrooms</option>
    </select>
    <button class="ls-toggle" type="button" data-toggle aria-expanded="false">Filters</button>
  </div>
  <div class="ls-layout">
    <form class="ls-panel" data-filters hidden>
      <div class="ls-grp"><b>Price</b><div class="ls-range">
        <input type="number" name="min" inputmode="numeric" placeholder="No min" aria-label="Minimum price" />
        <input type="number" name="max" inputmode="numeric" placeholder="No max" aria-label="Maximum price" />
      </div></div>
      <div class="ls-grp"><b>Beds</b><div class="ls-range">
        <input type="number" name="beds" inputmode="numeric" min="0" placeholder="Any" aria-label="Minimum bedrooms" />
        <input type="number" name="baths" inputmode="numeric" min="0" placeholder="Baths" aria-label="Minimum bathrooms" />
      </div></div>
      ${facets.statuses?.length ? `<div class="ls-grp"><b>Status</b>${chips('status', facets.statuses)}</div>` : ''}
      ${facets.propertyTypes?.length ? `<div class="ls-grp"><b>Property type</b>${chips('type', facets.propertyTypes)}</div>` : ''}
      ${featureGroups.map((g) => `<div class="ls-grp"><b>${esc(g.label)}</b>${chips('feature', g.options)}</div>`).join('')}
      <button class="ls-clear" type="reset">Clear all filters</button>
    </form>
    <div>
      ${showMap ? `<div class="ls-map" data-map>${pins.length
        ? `<div class="ls-tiles" data-tiles></div>
        <div class="ls-zoom"><button type="button" data-zoom="1" aria-label="Zoom in">+</button><button type="button" data-zoom="-1" aria-label="Zoom out">−</button></div>
        <div class="ls-attr">© <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a></div>`
        : '<div class="ls-nomap">Add latitude and longitude to your listings to see them on a map.</div>'}</div>` : ''}
      <div class="ls-count" data-count>${listings.length} ${listings.length === 1 ? 'listing' : 'listings'}</div>
      <div class="lst-grid" data-results>${cards || `<div class="lst-empty">${esc(fields.emptyText || 'No listings yet.')}</div>`}</div>
    </div>
  </div>
</div>
<script>
(function(){
  var root = document.currentScript.previousElementSibling;
  if(!root) return;
  var hits = [].slice.call(root.querySelectorAll('[data-hit]'));
  var form = root.querySelector('[data-filters]');
  var q = root.querySelector('[data-q]');
  var sort = root.querySelector('[data-sort]');
  var count = root.querySelector('[data-count]');
  var results = root.querySelector('[data-results]');
  var toggle = root.querySelector('[data-toggle]');

  // The panel starts hidden so a phone shows listings, not a wall of
  // checkboxes; from 1080px the stylesheet puts it in its own column, so it
  // has to be shown there whatever the button last said.
  var wide = matchMedia('(min-width:1080px)');
  function syncPanel(){
    if(wide.matches){ form.hidden = false; toggle.hidden = true; }
    else { toggle.hidden = false; form.hidden = toggle.getAttribute('aria-expanded') !== 'true'; }
  }
  toggle.addEventListener('click', function(){
    var open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    syncPanel();
  });
  (wide.addEventListener ? wide.addEventListener('change', syncPanel) : wide.addListener(syncPanel));
  syncPanel();

  function checked(name){
    return [].slice.call(form.querySelectorAll('input[name="'+name+'"]:checked')).map(function(i){ return i.value; });
  }
  function val(name){
    var el = form.querySelector('[name="'+name+'"]');
    var n = el && el.value !== '' ? Number(el.value) : null;
    return (n === null || isNaN(n)) ? null : n;
  }

  function apply(){
    var text = (q.value || '').trim().toLowerCase();
    var min = val('min'), max = val('max'), beds = val('beds'), baths = val('baths');
    var statuses = checked('status'), types = checked('type'), feats = checked('feature');
    var shown = 0;
    hits.forEach(function(hit){
      var d = hit.dataset;
      var price = d.price === '' ? null : Number(d.price);
      var ok = true;
      if(text && d.text.indexOf(text) === -1) ok = false;
      // A listing with no price is hidden only when a price bound is set —
      // otherwise "price on request" would vanish from an unfiltered search.
      if(ok && min !== null && (price === null || price < min)) ok = false;
      if(ok && max !== null && (price === null || price > max)) ok = false;
      if(ok && beds !== null && (d.beds === '' || Number(d.beds) < beds)) ok = false;
      if(ok && baths !== null && (d.baths === '' || Number(d.baths) < baths)) ok = false;
      if(ok && statuses.length && statuses.indexOf(d.status) === -1) ok = false;
      if(ok && types.length && types.indexOf(d.type) === -1) ok = false;
      if(ok && feats.length){
        var mine = d.features ? d.features.split('|') : [];
        // Every checked feature must be present: ticking Pool and Garage
        // means "both", which is what a buyer narrowing a search expects.
        for(var i=0;i<feats.length;i++){ if(mine.indexOf(feats[i]) === -1){ ok = false; break; } }
      }
      hit.hidden = !ok;
      if(ok) shown++;
    });
    count.textContent = shown + (shown === 1 ? ' listing' : ' listings');
    if(typeof drawMap === 'function') drawMap();
  }

  function order(){
    var mode = sort.value;
    var key = { 'price-asc':'price', 'price-desc':'price', 'sqft-desc':'sqft', 'beds-desc':'beds' }[mode];
    if(!key){ hits.forEach(function(h){ results.appendChild(h); }); return; }
    var dir = mode === 'price-asc' ? 1 : -1;
    hits.slice().sort(function(a,b){
      var x = a.dataset[key] === '' ? null : Number(a.dataset[key]);
      var y = b.dataset[key] === '' ? null : Number(b.dataset[key]);
      // Blanks sort last in both directions — an unpriced listing at the top
      // of "price: low to high" looks like a bug.
      if(x === null && y === null) return 0;
      if(x === null) return 1;
      if(y === null) return -1;
      return (x - y) * dir;
    }).forEach(function(h){ results.appendChild(h); });
  }

  form.addEventListener('input', apply);
  form.addEventListener('reset', function(){ setTimeout(apply, 0); });
  q.addEventListener('input', apply);
  sort.addEventListener('change', function(){ order(); apply(); });

  // ---- map ----------------------------------------------------------
  var map = root.querySelector('[data-map]');
  var tiles = map && map.querySelector('[data-tiles]');
  var drawMap, zoomNow = 14;
  if(tiles){
    // null means "fit to whatever is showing". The zoom buttons pin it to a
    // number; until then every filter change re-frames the map.
    var zoom = null, TILE = 256, PAD = 70;
    var lon2x = function(lon,z){ return (lon+180)/360*Math.pow(2,z); };
    var lat2y = function(lat,z){
      var r = lat*Math.PI/180;
      return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z);
    };
    // The largest zoom at which every visible pin still fits in the box.
    // Without this the map sat at a fixed zoom and silently culled any pin
    // outside it -- five listings across one county showed as one pin.
    var fit = function(pts, w, hgt){
      if(pts.length < 2) return 14;
      var lats = pts.map(function(p){ return p.lat; }), lngs = pts.map(function(p){ return p.lng; });
      var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
      var minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
      for(var z = 18; z > 3; z--){
        var dx = (lon2x(maxLng,z) - lon2x(minLng,z)) * TILE;
        var dy = (lat2y(minLat,z) - lat2y(maxLat,z)) * TILE;
        if(dx <= w - PAD && dy <= hgt - PAD) return z;
      }
      return 3;
    };
    drawMap = function(){
      var pts = hits.filter(function(h){ return !h.hidden && h.dataset.lat !== '' && h.dataset.lng !== ''; })
        .map(function(h){ return { lat:Number(h.dataset.lat), lng:Number(h.dataset.lng), h:h }; });
      if(!pts.length){ tiles.innerHTML = ''; return; }
      var w = map.clientWidth, hgt = map.clientHeight;
      if(!w || !hgt) return;
      var z = zoom === null ? fit(pts, w, hgt) : zoom;
      // Centre on the middle of the bounds, not the mean: four listings in
      // one suburb and one an hour away should frame all five, and the mean
      // sits inside the cluster where it leaves the outlier off the edge.
      var cLat = (Math.min.apply(null, pts.map(function(p){ return p.lat; })) + Math.max.apply(null, pts.map(function(p){ return p.lat; }))) / 2;
      var cLng = (Math.min.apply(null, pts.map(function(p){ return p.lng; })) + Math.max.apply(null, pts.map(function(p){ return p.lng; }))) / 2;
      zoomNow = z;
      var cx = lon2x(cLng, z)*TILE, cy = lat2y(cLat, z)*TILE;
      var left = cx - w/2, top = cy - hgt/2;
      var html = '';
      var x0 = Math.floor(left/TILE), x1 = Math.floor((left+w)/TILE);
      var y0 = Math.floor(top/TILE), y1 = Math.floor((top+hgt)/TILE);
      var span = Math.pow(2, z);
      for(var x=x0;x<=x1;x++){
        for(var y=y0;y<=y1;y++){
          if(y < 0 || y >= span) continue;
          var wrapped = ((x % span) + span) % span;
          // decoding="async" matters more here than anywhere: a wide map is
          // sixteen-odd tiles, and decoding those on the main thread janks
          // every scroll and filter keystroke while they arrive.
          html += '<img alt="" loading="lazy" decoding="async" src="https://tile.openstreetmap.org/'+z+'/'+wrapped+'/'+y+'.png" style="left:'+(x*TILE-left)+'px;top:'+(y*TILE-top)+'px">';
        }
      }
      pts.forEach(function(p){
        var px = lon2x(p.lng, z)*TILE - left, py = lat2y(p.lat, z)*TILE - top;
        if(px < -40 || py < -40 || px > w+40 || py > hgt+40) return;
        var card = p.h.querySelector('.lst-price');
        var href = p.h.querySelector('a.lst-card');
        var label = card ? card.textContent : 'View';
        html += '<a class="ls-pin" style="left:'+px+'px;top:'+py+'px"'+(href?' href="'+href.getAttribute('href')+'"':'')+'>'+label.replace(/</g,'&lt;')+'</a>';
      });
      tiles.innerHTML = html;
    };
    // Stepping off the auto-fit starts from whatever it last chose, so the
    // first click nudges the view the user is actually looking at.
    [].slice.call(map.querySelectorAll('[data-zoom]')).forEach(function(b){
      b.addEventListener('click', function(){
        zoom = Math.max(3, Math.min(18, (zoom === null ? zoomNow : zoom) + Number(b.getAttribute('data-zoom'))));
        drawMap();
      });
    });
    // The first draw usually lands before the grid has settled its column
    // widths, and again when a web font or an image above shifts the page.
    // That left the map sized for the old box, with tiles covering a fraction
    // of it and the rest showing as flat grey. A ResizeObserver catches the
    // container changing for any reason, which a window resize listener
    // cannot; that listener stays as the fallback.
    if(typeof ResizeObserver === 'function'){ new ResizeObserver(drawMap).observe(map); }
    else { addEventListener('resize', drawMap, { passive:true }); }
    drawMap();
  }
})();
</script>`;
}

// ------------------------------------------------------- detail-page blocks

// The top of a single listing's page: gallery, price, address, key stats.
// Reads one listing, so on a collection detail page it is bound to the entry
// being rendered rather than to the collection as a whole.
export function renderListingHero(fields) {
  const l = fields.listing || {};
  const shots = (l.gallery || []).slice(0, 8);
  const main = shots[0] || l.image;
  const rest = shots.slice(1, 5);
  return `<style>${CARD_CSS}
.lh { max-width:1240px; margin:0 auto; padding:28px 24px 8px; }
.lh-shots { display:grid; gap:8px; grid-template-columns:1fr; margin-bottom:22px; }
/* The grid adapts to how many photos there actually are. A fixed 3x2 left a
   dead white rectangle on any listing with fewer than five, which is most of
   them early on — an agent uploads the exterior and one kitchen shot first. */
@media (min-width:900px){
  .lh-shots { grid-template-columns:2fr 1fr 1fr; grid-template-rows:1fr 1fr; }
  .lh-shots img:first-child { grid-row:span 2; }
  .lh-shots[data-n="1"] { grid-template-columns:1fr; grid-template-rows:auto; }
  .lh-shots[data-n="2"], .lh-shots[data-n="3"] { grid-template-columns:2fr 1fr; }
  .lh-shots[data-n="2"] img:last-child { grid-row:span 2; }
  .lh-shots[data-n="4"] img:last-child { grid-column:span 2; }
}
.lh-shots img { width:100%; height:100%; min-height:180px; object-fit:cover; border-radius:8px; display:block; }
.lh-none { padding:80px 20px; text-align:center; color:var(--color-muted); border:1px dashed var(--border); border-radius:12px; margin-bottom:22px; }
.lh-head { display:flex; flex-wrap:wrap; gap:16px; align-items:flex-start; justify-content:space-between; }
.lh-price { font-family:var(--font-display); font-size:clamp(30px,5vw,42px); font-weight:700; letter-spacing:-.025em; margin:0; }
.lh-addr { font-size:17px; margin:6px 0 0; }
.lh-where { color:var(--color-muted); margin:2px 0 0; }
.lh-badge { font-family:var(--font-mono,monospace); font-size:10px; letter-spacing:.09em; text-transform:uppercase; padding:7px 11px; border-radius:3px; background:var(--color-accent); color:var(--on-accent,#fff); }
.lh-stats { display:flex; flex-wrap:wrap; gap:26px; margin-top:22px; padding:18px 0; border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
.lh-stat { display:flex; flex-direction:column; gap:2px; }
.lh-stat b { font-family:var(--font-display); font-size:21px; }
.lh-stat span { font-size:12px; color:var(--color-muted); text-transform:uppercase; letter-spacing:.06em; }
</style>
<div class="lh">
  ${main ? `<div class="lh-shots" data-n="${rest.length + 1}">
    <img ${LAZY} src="${esc(main)}" alt="${esc(l.address || '')}" />
    ${rest.map((s) => `<img ${LAZY} src="${esc(s)}" alt="" />`).join('')}
  </div>` : '<div class="lh-none">No photos on this listing yet.</div>'}
  <div class="lh-head">
    <div>
      <p class="lh-price">${esc(priceLabel(l))}</p>
      <p class="lh-addr">${esc(l.address || '')}</p>
      ${localityOf(l) ? `<p class="lh-where">${esc(localityOf(l))}</p>` : ''}
    </div>
    ${l.status ? `<span class="lh-badge" data-tone="${esc(l.tone)}">${esc(l.status)}</span>` : ''}
  </div>
  <div class="lh-stats">
    ${[['beds', 'Bedrooms'], ['baths', 'Bathrooms'], ['sqft', 'Sq ft']].map(([k, label]) => (
    l[k] !== null && l[k] !== undefined ? `<div class="lh-stat"><b>${esc(num(l[k]))}</b><span>${label}</span></div>` : ''
  )).join('')}
    ${l.lotSize ? `<div class="lh-stat"><b>${esc(l.lotSize)}</b><span>Lot</span></div>` : ''}
    ${l.yearBuilt !== null && l.yearBuilt !== undefined ? `<div class="lh-stat"><b>${esc(l.yearBuilt)}</b><span>Built</span></div>` : ''}
  </div>
</div>`;
}

// The property-details table plus the description.
export function renderListingFacts(fields) {
  const l = fields.listing || {};
  const rows = [
    ['Property type', l.propertyType],
    ['Bedrooms', l.beds === null ? '' : num(l.beds)],
    ['Bathrooms', l.baths === null ? '' : num(l.baths)],
    ['Square feet', l.sqft === null ? '' : num(l.sqft)],
    ['Lot size', l.lotSize],
    ['Year built', l.yearBuilt === null ? '' : l.yearBuilt],
    ['HOA fee', l.hoaFee === null || l.hoaFee === undefined || l.hoaFee === '' ? '' : `$${num(l.hoaFee)}/mo`],
    ['MLS #', l.mls],
    ['Listed on', l.listedOn],
    ['Status', l.status],
  ].filter(([, v]) => v !== '' && v !== null && v !== undefined);

  return `<style>
.lf2 { max-width:1240px; margin:0 auto; padding:32px 24px; }
.lf2 h2 { font-family:var(--font-display); font-size:var(--text-h3); margin:0 0 14px; }
.lf2-desc { max-width:70ch; line-height:1.7; margin-bottom:30px; }
.lf2-tbl { width:100%; border-collapse:collapse; max-width:640px; }
.lf2-tbl th, .lf2-tbl td { text-align:left; padding:11px 0; border-bottom:1px solid var(--border); font-size:15px; }
.lf2-tbl th { font-weight:500; color:var(--color-muted); width:45%; }
</style>
<div class="lf2">
  ${l.description ? `<div class="lf2-desc">${esc(l.description).replace(/\n{2,}/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>')}</div>` : ''}
  ${rows.length ? `<h2>${esc(fields.headings?.[0] || 'Property details')}</h2>
  <table class="lf2-tbl"><tbody>
    ${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
  </tbody></table>` : ''}
</div>`;
}

// An estimated monthly payment, recalculated live.
//
// Prefilled from the listing (price, HOA, the tax figure if one is entered)
// and then entirely the visitor's to play with — the numbers never post
// anywhere, so this collects no financial data and needs no consent.
//
// It is an estimate and says so. Quoting a precise figure for someone else's
// mortgage without knowing their credit, insurer or escrow terms would be
// stating something we cannot know.
export function renderMortgageCalc(fields) {
  const l = fields.listing || {};
  const price = l.price !== null && l.price !== undefined ? l.price : Number(fields.defaultPrice) || 350000;
  const down = Number(fields.downPercent) || 20;
  const rate = Number(fields.ratePercent) || 6.5;
  const years = Number(fields.termYears) || 30;
  // A rough national default when the listing carries no tax figure — 1.1%
  // of value a year. Labelled as an estimate, and the field is editable.
  const tax = l.annualTax !== null && l.annualTax !== undefined ? l.annualTax : Math.round(price * 0.011);
  const hoa = l.hoaFee !== null && l.hoaFee !== undefined ? l.hoaFee : 0;
  const ins = Math.round(price * 0.0035);

  const row = (key, label, value, step) => `
    <label class="mc-row"><span>${esc(label)}</span>
      <input type="number" data-mc="${key}" value="${esc(value)}" step="${esc(step || 1)}" min="0" inputmode="decimal" />
    </label>`;

  return `<style>
.mc { max-width:1240px; margin:0 auto; padding:32px 24px; }
.mc h2 { font-family:var(--font-display); font-size:var(--text-h3); margin:0 0 6px; }
.mc-note { color:var(--color-muted); font-size:13px; margin:0 0 20px; max-width:60ch; }
.mc-grid { display:grid; gap:28px; grid-template-columns:1fr; align-items:start; }
@media (min-width:820px){ .mc-grid { grid-template-columns:1fr 300px; } }
.mc-row { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:9px 0; border-bottom:1px solid var(--border); }
.mc-row span { font-size:14px; }
.mc-row input { width:130px; padding:8px 10px; border:1px solid var(--border); border-radius:6px; background:var(--color-bg); color:var(--color-text); font:inherit; font-size:14px; text-align:right; }
.mc-out { border:1px solid var(--border); border-radius:12px; padding:20px; background:var(--surface); text-align:center; }
.mc-total { font-family:var(--font-display); font-size:34px; font-weight:700; letter-spacing:-.02em; margin:8px 0 2px; }
.mc-sub { font-size:12px; color:var(--color-muted); text-transform:uppercase; letter-spacing:.07em; }
.mc-ring { display:block; margin:14px auto 10px; }
.mc-key { display:flex; flex-direction:column; gap:7px; margin-top:14px; text-align:left; }
.mc-key div { display:flex; align-items:center; gap:8px; font-size:13px; }
.mc-key i { width:10px; height:10px; border-radius:2px; display:block; flex:none; }
.mc-key b { margin-left:auto; font-weight:600; }
</style>
<div class="mc" data-mortgage>
  <h2>${esc(fields.headings?.[0] || 'Estimated monthly payment')}</h2>
  <p class="mc-note">${esc(fields.text?.[0] || 'An estimate only — your real payment depends on your rate, credit, insurer and escrow. Nothing here is sent anywhere.')}</p>
  <div class="mc-grid">
    <div>
      ${row('price', 'Home price', price)}
      ${row('down', 'Down payment (%)', down, '0.5')}
      ${row('rate', 'Interest rate (%)', rate, '0.05')}
      ${row('years', 'Loan term (years)', years)}
      ${row('tax', 'Property tax (per year)', tax)}
      ${row('ins', 'Home insurance (per year)', ins)}
      ${row('hoa', 'HOA (per month)', hoa)}
    </div>
    <div class="mc-out">
      <div class="mc-sub">Estimated total</div>
      <div class="mc-total" data-mc-total>—</div>
      <div class="mc-sub">per month</div>
      <svg class="mc-ring" width="150" height="150" viewBox="0 0 42 42" role="img" aria-label="Payment breakdown">
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--border)" stroke-width="5"></circle>
        <circle data-mc-arc="principal" cx="21" cy="21" r="15.915" fill="none" stroke="var(--color-accent)" stroke-width="5" stroke-dasharray="0 100" transform="rotate(-90 21 21)"></circle>
        <circle data-mc-arc="tax" cx="21" cy="21" r="15.915" fill="none" stroke="var(--color-secondary)" stroke-width="5" stroke-dasharray="0 100" transform="rotate(-90 21 21)"></circle>
        <circle data-mc-arc="ins" cx="21" cy="21" r="15.915" fill="none" stroke="var(--color-muted)" stroke-width="5" stroke-dasharray="0 100" transform="rotate(-90 21 21)"></circle>
        <circle data-mc-arc="hoa" cx="21" cy="21" r="15.915" fill="none" stroke="var(--color-primary)" stroke-width="5" stroke-dasharray="0 100" transform="rotate(-90 21 21)"></circle>
      </svg>
      <div class="mc-key">
        <div><i style="background:var(--color-accent)"></i>Principal &amp; interest<b data-mc-key="principal">—</b></div>
        <div><i style="background:var(--color-secondary)"></i>Property tax<b data-mc-key="tax">—</b></div>
        <div><i style="background:var(--color-muted)"></i>Insurance<b data-mc-key="ins">—</b></div>
        <div><i style="background:var(--color-primary)"></i>HOA<b data-mc-key="hoa">—</b></div>
      </div>
    </div>
  </div>
</div>
<script>
(function(){
  var root = document.currentScript.previousElementSibling;
  if(!root) return;
  var get = function(k){
    var el = root.querySelector('[data-mc="'+k+'"]');
    var n = el ? Number(el.value) : 0;
    return isFinite(n) && n >= 0 ? n : 0;
  };
  var money = function(n){ return '$' + Math.round(n).toLocaleString('en-US'); };
  function calc(){
    var price = get('price'), down = Math.min(100, get('down')), years = get('years') || 30;
    var loan = price * (1 - down/100);
    var r = get('rate')/100/12, n = years*12;
    // A 0% loan is a straight division; the amortisation formula divides by
    // zero there and would print NaN into the page.
    var pi = loan <= 0 ? 0 : (r === 0 ? loan/n : loan * r * Math.pow(1+r,n) / (Math.pow(1+r,n) - 1));
    var parts = { principal: pi, tax: get('tax')/12, ins: get('ins')/12, hoa: get('hoa') };
    var total = parts.principal + parts.tax + parts.ins + parts.hoa;
    root.querySelector('[data-mc-total]').textContent = money(total);
    var offset = 0;
    ['principal','tax','ins','hoa'].forEach(function(k){
      var pct = total > 0 ? parts[k]/total*100 : 0;
      var arc = root.querySelector('[data-mc-arc="'+k+'"]');
      arc.setAttribute('stroke-dasharray', pct.toFixed(2)+' '+(100-pct).toFixed(2));
      arc.setAttribute('stroke-dashoffset', (-offset).toFixed(2));
      offset += pct;
      root.querySelector('[data-mc-key="'+k+'"]').textContent = money(parts[k]);
    });
  }
  root.addEventListener('input', calc);
  calc();
})();
</script>`;
}

// What the price has done since it was listed. Reads the listing's own
// history, so it is per-property rather than something authored on the page.
export function renderPriceHistory(fields) {
  const rows = fields.listing?.priceHistory || [];
  if (rows.length === 0) return boundToListing(fields.listing) ? '' : placeholder('Price history');
  return `<style>
.ph { max-width:1240px; margin:0 auto; padding:32px 24px; }
.ph h2 { font-family:var(--font-display); font-size:var(--text-h3); margin:0 0 14px; }
.ph table { width:100%; border-collapse:collapse; max-width:680px; }
.ph th, .ph td { text-align:left; padding:11px 12px 11px 0; border-bottom:1px solid var(--border); font-size:14.5px; }
.ph thead th { font-family:var(--font-mono,monospace); font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--color-muted); }
.ph td:last-child { text-align:right; padding-right:0; font-weight:600; }
</style>
<div class="ph">
  <h2>${esc(fields.headings?.[0] || 'Price history')}</h2>
  <table>
    <thead><tr><th>Date</th><th>Event</th><th>Price</th></tr></thead>
    <tbody>
      ${rows.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.event)}</td><td>${r.price === null ? '—' : esc('$' + num(r.price))}</td></tr>`).join('')}
    </tbody>
  </table>
</div>`;
}

// Nearby schools. The rating bar is drawn from the number rather than an
// image, so it costs nothing and inherits the theme.
export function renderNearbySchools(fields) {
  const rows = fields.listing?.schools || [];
  if (rows.length === 0) return boundToListing(fields.listing) ? '' : placeholder('Nearby schools');
  return `<style>
.ns { max-width:1240px; margin:0 auto; padding:32px 24px; }
.ns h2 { font-family:var(--font-display); font-size:var(--text-h3); margin:0 0 6px; }
.ns-note { color:var(--color-muted); font-size:13px; margin:0 0 16px; max-width:60ch; }
.ns-row { display:flex; align-items:center; gap:14px; padding:13px 0; border-bottom:1px solid var(--border); max-width:680px; }
.ns-score { width:38px; height:38px; flex:none; border-radius:8px; display:flex; align-items:center; justify-content:center; font-family:var(--font-display); font-weight:700; font-size:15px; background:var(--accent-soft); color:var(--color-text); }
.ns-name { font-weight:600; font-size:15px; }
.ns-meta { font-size:13px; color:var(--color-muted); }
.ns-dist { margin-left:auto; font-size:13px; color:var(--color-muted); white-space:nowrap; }
</style>
<div class="ns">
  <h2>${esc(fields.headings?.[0] || 'Nearby schools')}</h2>
  <p class="ns-note">${esc(fields.text?.[0] || 'Ratings and distances are a starting point — check current attendance zones with the district before you rely on them.')}</p>
  ${rows.map((s) => `<div class="ns-row">
    ${s.rating === null ? '' : `<div class="ns-score">${esc(s.rating)}</div>`}
    <div>
      <div class="ns-name">${esc(s.name)}</div>
      ${s.grades ? `<div class="ns-meta">Grades ${esc(s.grades)}</div>` : ''}
    </div>
    ${s.distance ? `<div class="ns-dist">${esc(s.distance)}</div>` : ''}
  </div>`).join('')}
</div>`;
}

// The amenity list, grouped the same way the filter panel groups it so the
// two read as the same vocabulary rather than two unrelated lists.
export function renderListingFeatures(fields) {
  const l = fields.listing || {};
  const mine = new Set(l.features || []);
  if (mine.size === 0) return boundToListing(l) ? '' : placeholder('Features');
  const groups = FEATURE_GROUPS
    .map((g) => ({ label: g.label, options: g.options.filter((o) => mine.has(o)) }))
    .filter((g) => g.options.length > 0);
  // Anything the author added that isn't in the standard vocabulary still
  // shows, rather than silently disappearing off the page.
  const known = new Set(FEATURE_GROUPS.flatMap((g) => g.options));
  const extra = [...mine].filter((f) => !known.has(f));
  if (extra.length) groups.push({ label: 'Also', options: extra });

  return `<style>${CARD_CSS}
.lfe { max-width:1240px; margin:0 auto; padding:8px 24px 40px; }
.lfe h2 { font-family:var(--font-display); font-size:var(--text-h3); margin:0 0 16px; }
.lfe-grp { margin-bottom:18px; }
.lfe-grp > b { display:block; font-family:var(--font-mono,monospace); font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--color-muted); margin-bottom:8px; }
</style>
<div class="lfe">
  <h2>${esc(fields.headings?.[0] || 'Features')}</h2>
  ${groups.map((g) => `<div class="lfe-grp"><b>${esc(g.label)}</b><div class="lst-tags">
    ${g.options.map((o) => `<span class="lst-tag">${esc(o)}</span>`).join('')}
  </div></div>`).join('')}
</div>`;
}
