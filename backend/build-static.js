/* ==================================================================
   THE NORTHLANDER WAYFINDER · STATIC LISTINGS BUILDER
   ------------------------------------------------------------------
   One-shot build script. Fetches listings from Google Places for all
   16 stops, downloads each listing's hero photo into
   site/images/listings/ as a static file, and writes
   site/listings-data.js (window.LISTINGS_DATA) with LOCAL photo
   paths.

   The point: once this has run and the output is committed, the live
   site reads listings + photos straight from the deploy. No backend,
   no /api/photo proxy, no in-memory cache that vanishes when the
   free-tier server sleeps. Card images always show.

   To refresh content later: re-run this script and commit the
   updated site/images/listings/ and site/listings-data.js.

   USAGE
     1. Put your key in backend/.env:  GOOGLE_PLACES_KEY=your_key
     2. From the repo root or backend/ folder:  node backend/build-static.js
   ================================================================== */

const fs = require('fs');
const path = require('path');

/* Load backend/.env without depending on the dotenv package, so the
   script runs even if node_modules has not been installed. Existing
   environment variables win over the file. */
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
})();

const KEY = process.env.GOOGLE_PLACES_KEY;
if (!KEY) {
  console.error('GOOGLE_PLACES_KEY is not set. Add it to backend/.env and retry.');
  process.exit(1);
}

const SITE_DIR     = path.join(__dirname, '..', 'site');
const LISTINGS_DIR = path.join(SITE_DIR, 'images', 'listings');
const OUT_FILE     = path.join(SITE_DIR, 'listings-data.js');

/* Max listings kept per category per stop. Google Places Nearby
   Search returns 20 results per page and supports up to 3 pages, so
   60 is the hard API ceiling. Stops with few natural results (Matheson,
   South River, Englehart, etc.) simply return whatever exists: the
   pagination stops as soon as Google reports no next page, so no empty
   pages are ever forced. */
const PER_CAT_LIMIT = 20;

/* Photos downloaded per listing. The detail view shows them as a
   swipeable gallery; the card uses the first (hero) photo. */
const PHOTOS_PER_LISTING = 3;

/* Sixteen stops, in route order. Keep in sync with site/data.js. */
const STOPS = [
  { id: 'union',        lat: 43.6453, lng: -79.3806 },
  { id: 'langstaff',    lat: 43.84,   lng: -79.428  },
  { id: 'gormley',      lat: 43.946,  lng: -79.365  },
  { id: 'washago',      lat: 44.735,  lng: -79.345  },
  { id: 'gravenhurst',  lat: 44.917,  lng: -79.37   },
  { id: 'bracebridge',  lat: 45.04,   lng: -79.31   },
  { id: 'huntsville',   lat: 45.327,  lng: -79.216  },
  { id: 'southriver',   lat: 45.837,  lng: -79.38   },
  { id: 'temagami',     lat: 47.064,  lng: -79.79   },
  { id: 'northbay',     lat: 46.309,  lng: -79.461  },
  { id: 'temiskaming',  lat: 47.509,  lng: -79.677  },
  { id: 'englehart',    lat: 47.821,  lng: -79.868  },
  { id: 'kirklandlake', lat: 48.147,  lng: -80.037  },
  { id: 'matheson',     lat: 48.534,  lng: -80.464  },
  { id: 'timmins',      lat: 48.4758, lng: -81.3305 },
  { id: 'cochrane',     lat: 49.066,  lng: -81.015  }
];

/* Single-type categories. Shops is handled separately because Places
   has no single "shop" type. */
const CATEGORIES = [
  { key: 'restaurants',    type: 'restaurant' },
  { key: 'accommodations', type: 'lodging' },
  { key: 'parks',          type: 'park' },
  { key: 'attractions',    type: 'tourist_attraction' }
];
/* Shop search. Places has no single "shop" type, so we run a few
   precise shop types and merge them deduped by place_id. */
const SHOP_QUERIES = [
  { type: 'art_gallery' },
  { type: 'book_store' },
  { type: 'gift_shop' }
];

/* Shop filter, two conditions. A result is kept only if it (1) has at
   least one real retail type AND (2) has none of the non-shop types.
   The whitelist alone was not enough because the generic "store" type
   is carried by coffee shops, groceries and storage firms; the
   exclusion list removes those. */
const RETAIL_TYPES = [
  'art_gallery', 'book_store', 'gift_shop', 'store', 'clothing_store',
  'jewelry_store', 'home_goods_store', 'furniture_store', 'shoe_store',
  'florist', 'pet_store', 'bicycle_store', 'electronics_store',
  'liquor_store', 'museum'
];
const EXCLUDED_TYPES = [
  'restaurant', 'cafe', 'bar', 'meal_takeaway', 'meal_delivery',
  'lodging', 'bank', 'finance', 'moving_company', 'storage',
  'grocery_or_supermarket', 'supermarket', 'gas_station',
  'real_estate_agency', 'transit_station', 'hospital', 'doctor',
  'pharmacy', 'school', 'locality', 'political'
];
function hasRetailType(p) {
  return ((p && p.types) || []).some(t => RETAIL_TYPES.includes(t));
}
function hasExcludedType(p) {
  return ((p && p.types) || []).some(t => EXCLUDED_TYPES.includes(t));
}

/* Large chains to exclude from Shop results. A listing is dropped if
   its name contains any of these (case insensitive). */
const EXCLUDED_CHAINS = [
  'walmart', 'canadian tire', 'home depot', 'lowes', 'costco',
  'superstore', 'metro', 'sobeys', 'shoppers', 'rexall', 'dollarama',
  'giant tiger', 'no frills', 'food basics', 'staples', 'best buy',
  'sport chek', 'winners', 'homesense'
];
function isExcludedChain(name) {
  const n = (name || '').toLowerCase();
  return EXCLUDED_CHAINS.some(chain => n.includes(chain));
}

/* Human-friendly card tag per category. */
const TAG_LABEL = {
  restaurants: 'Restaurant',
  accommodations: 'Stay',
  parks: 'Park',
  attractions: 'Attraction',
  shops: 'Shop'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Fetch up to `max` Nearby Search results, walking pagetoken pages
   (20 per page, up to 3 pages = 60). A page token takes a moment to
   become valid, so we pause before each subsequent page and retry if
   Google reports the token is not ready yet. Pagination stops as soon
   as Google returns no next_page_token, so sparse stops yield only
   what exists with no forced empty pages. */
async function nearbyAllPages(type, lat, lng, max, label, keyword) {
  let base = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`
    + `?location=${lat},${lng}&radius=5000&type=${type}&key=${KEY}`;
  if (keyword) base += `&keyword=${encodeURIComponent(keyword)}`;
  const all = [];
  let token = null;
  for (let page = 0; page < 3; page++) {
    if (token) await sleep(2000);
    const url = token ? base + `&pagetoken=${encodeURIComponent(token)}` : base;
    let d = await (await fetch(url)).json();
    let tries = 0;
    while (d.status === 'INVALID_REQUEST' && token && tries < 4) {
      await sleep(2000);
      d = await (await fetch(url)).json();
      tries++;
    }
    const results = d.results || [];
    for (const p of results) all.push(p);
    console.log(`  ${label} page ${page + 1}: ${results.length} (${d.status}), running total ${all.length}`);
    if (all.length >= max) break;
    if (!d.next_page_token) break;
    token = d.next_page_token;
  }
  return all.slice(0, max);
}

/* Best-effort Place Details enrichment: website, phone, short
   description and today's hours. Any failure returns empty fields. */
async function enrich(placeId) {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json`
      + `?place_id=${placeId}`
      + `&fields=website,formatted_phone_number,editorial_summary,opening_hours,photos`
      + `&key=${KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.status !== 'OK' || !d.result) return {};
    const det = d.result;
    const day = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
    return {
      website: det.website || null,
      phone: det.formatted_phone_number || null,
      description: det.editorial_summary ? det.editorial_summary.overview : null,
      hours: det.opening_hours && det.opening_hours.weekday_text
        ? det.opening_hours.weekday_text[day]
        : null,
      photos: (det.photos || []).map(ph => ph.photo_reference).filter(Boolean)
    };
  } catch (e) {
    return {};
  }
}

/* Download a Places photo (follows Google's redirect to the image)
   and write it under site/images/listings/. Returns the site-relative
   path on success, or null on failure. */
async function downloadPhoto(ref, fileBase) {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/photo`
      + `?maxwidth=800&photo_reference=${encodeURIComponent(ref)}&key=${KEY}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return null;
    const file = `${fileBase}.jpg`;
    fs.writeFileSync(path.join(LISTINGS_DIR, file), buf);
    return `images/listings/${file}`;
  } catch (e) {
    return null;
  }
}

/* Turn a raw Places result into a listing object with a local hero
   photo path. */
async function buildListing(p, catKey, stopId, index) {
  const fileBase = `${stopId}-${catKey}-${index}`;
  let extra = {};
  if (p.place_id) {
    extra = await enrich(p.place_id);
    await sleep(60);
  }
  /* Prefer the richer Place Details photo set (up to 10), falling back
     to whatever Nearby Search returned. Download up to
     PHOTOS_PER_LISTING and keep the ones that succeed. */
  let refs = (extra.photos && extra.photos.length)
    ? extra.photos
    : (p.photos || []).map(ph => ph.photo_reference).filter(Boolean);
  refs = refs.slice(0, PHOTOS_PER_LISTING);
  const images = [];
  for (let i = 0; i < refs.length; i++) {
    const pth = await downloadPhoto(refs[i], `${fileBase}-${i}`);
    if (pth) images.push(pth);
    await sleep(50);
  }
  return {
    name: p.name || '',
    tag: TAG_LABEL[catKey] || 'Place',
    desc: p.vicinity || '',
    rating: p.rating ? String(p.rating) : 'NR',
    image: images[0] || null,
    images,
    lat: p.geometry && p.geometry.location ? p.geometry.location.lat : null,
    lng: p.geometry && p.geometry.location ? p.geometry.location.lng : null,
    website: extra.website || null,
    phone: extra.phone || null,
    description: extra.description || null,
    hours: extra.hours || null
  };
}

/* Read the existing generated data file back into an object, so a
   targeted re-run can rebuild one category without touching the rest. */
function loadExisting() {
  if (!fs.existsSync(OUT_FILE)) return {};
  const txt = fs.readFileSync(OUT_FILE, 'utf8');
  const start = txt.indexOf('{');
  const end = txt.lastIndexOf('}');
  if (start < 0 || end < 0) return {};
  return JSON.parse(txt.slice(start, end + 1));
}

/* Remove previously downloaded shop photos so a shops-only rebuild
   does not leave orphaned files behind. */
function deleteShopPhotos() {
  let n = 0;
  for (const f of fs.readdirSync(LISTINGS_DIR)) {
    if (/-shops-\d+-\d+\.jpg$/.test(f)) { fs.unlinkSync(path.join(LISTINGS_DIR, f)); n++; }
  }
  console.log(`Removed ${n} old shop photos.`);
}

async function run() {
  fs.mkdirSync(LISTINGS_DIR, { recursive: true });

  /* Pass "shops" as an argument to rebuild only the Shop category for
     every stop, preserving the other categories already in the data
     file: node backend/build-static.js shops */
  const shopsOnly = process.argv[2] === 'shops';
  const data = shopsOnly ? loadExisting() : {};
  if (shopsOnly) {
    console.log('Shops-only rebuild: preserving other categories.');
    deleteShopPhotos();
  }

  for (const stop of STOPS) {
    if (!data[stop.id]) data[stop.id] = {};

    if (!shopsOnly) for (const cat of CATEGORIES) {
      try {
        const kept = await nearbyAllPages(cat.type, stop.lat, stop.lng, PER_CAT_LIMIT, `${stop.id} ${cat.key}`);
        const listings = [];
        for (let i = 0; i < kept.length; i++) {
          listings.push(await buildListing(kept[i], cat.key, stop.id, i));
        }
        data[stop.id][cat.key] = listings;
        console.log(`${stop.id} ${cat.key}: ${listings.length} listings kept`);
      } catch (e) {
        console.log(`${stop.id} ${cat.key} FAILED:`, e.message);
        data[stop.id][cat.key] = [];
      }
    }

    // Shops: run the targeted queries, merge deduped by place_id, and
    // drop large chains.
    try {
      const seen = new Set();
      const merged = [];
      let droppedType = 0, droppedChain = 0;
      for (const q of SHOP_QUERIES) {
        if (merged.length >= PER_CAT_LIMIT) break;
        const results = await nearbyAllPages(q.type, stop.lat, stop.lng, PER_CAT_LIMIT, `${stop.id} shops/${q.type}`);
        for (const p of results) {
          if (merged.length >= PER_CAT_LIMIT) break;
          if (!p.place_id || seen.has(p.place_id)) continue;
          seen.add(p.place_id);
          if (!hasRetailType(p) || hasExcludedType(p)) { droppedType++; continue; }
          if (isExcludedChain(p.name)) { droppedChain++; continue; }
          merged.push(p);
        }
      }
      const listings = [];
      for (let i = 0; i < merged.length; i++) {
        listings.push(await buildListing(merged[i], 'shops', stop.id, i));
      }
      data[stop.id].shops = listings;
      console.log(`${stop.id} shops: ${listings.length} kept (${droppedType} by type, ${droppedChain} chains)`);
    } catch (e) {
      console.log(`${stop.id} shops FAILED:`, e.message);
      data[stop.id].shops = [];
    }
  }

  const header = '/* AUTO-GENERATED by backend/build-static.js. Do not edit by hand.\n'
    + '   Static listing data with local photo paths so the site never\n'
    + '   depends on the backend for card images. Re-run the script to refresh. */\n';
  fs.writeFileSync(OUT_FILE, header + 'window.LISTINGS_DATA = ' + JSON.stringify(data, null, 2) + ';\n');

  const counts = Object.values(data).reduce((acc, s) => {
    Object.values(s).forEach(arr => {
      acc.listings += arr.length;
      arr.forEach(l => { acc.photos += (l.images ? l.images.length : 0); });
    });
    return acc;
  }, { listings: 0, photos: 0 });
  console.log(`\nDone. ${counts.listings} listings, ${counts.photos} photos downloaded.`);
  console.log('Wrote', path.relative(process.cwd(), OUT_FILE));
}

run().catch(e => { console.error('Build failed:', e); process.exit(1); });
