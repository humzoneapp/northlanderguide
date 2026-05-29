/* ==================================================================
   THE NORTHLANDER WAYFINDER - AIRTABLE TO STATIC DATA SYNC
   ------------------------------------------------------------------
   Reads every active row from the Airtable Listings table and writes
   a fresh site/listings-data.js. Static photo paths from the previous
   build are merged back in so existing card images are preserved.

   USAGE
     1. Put AIRTABLE_API_KEY and AIRTABLE_BASE_ID in backend/.env
     2. From the repo root or backend/ folder:
          node backend/sync-from-airtable.js
   ================================================================== */

const fs = require('fs');
const path = require('path');

/* Load backend/.env without depending on the dotenv package. Existing
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

const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID = 'tblfVQcLjEv0a4sCJ';

if (!API_KEY || !BASE_ID) {
  console.error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID in backend/.env');
  process.exit(1);
}

const SITE_DIR = path.join(__dirname, '..', 'site');
const OUT_FILE = path.join(SITE_DIR, 'listings-data.js');

/* Airtable field IDs mapped to listing object properties. */
const FIELD = {
  name: 'fldih5HMKh5O61HMh',
  stop: 'fldmyKFYFKHzOYYhf',
  category: 'fld6sIsJElpHy2bE8',
  desc: 'fldTCRqsKiBc9rx1U',
  address: 'fldtBmMjbHHDdtUlV',
  phone: 'fldDH9fPVWo2zmkUz',
  website: 'fldMQ5wJE2TIGm7WM',
  rating: 'fldkJgaEuX7z2aQvx',
  hours: 'fldmtTI3OjGcxoSrx',
  walkMins: 'fld7mLkMzxGJVNJxr',
  lat: 'fld7h0S4J8A70XiXg',
  lng: 'fldxTXlzYovpPvWMI',
  active: 'fldNJFh7wOpBhjUh2',
  featured: 'fldf50ZoE14MhbeQT',
  packageTier: 'fldlPa64bln3mG19I',
  sortOrder: 'fld1uCZwGyUEayJnc',
  featuredPriority: 'fldS4HJzHM7LVYvRh',
  discountOffered: 'fldLdEKiROfULP2yu',
  discountDetails: 'fldKbIzS3rmpee8Vu',
  photos: 'fldmdVR0kuIzVxe9q'
};

/* Airtable Stop display name to internal stop id. */
const STOP_ID = {
  'Toronto Union': 'union',
  'Langstaff': 'langstaff',
  'Gormley': 'gormley',
  'Washago': 'washago',
  'Gravenhurst': 'gravenhurst',
  'Bracebridge': 'bracebridge',
  'Huntsville': 'huntsville',
  'South River': 'southriver',
  'Temagami': 'temagami',
  'North Bay': 'northbay',
  'Temiskaming Shores': 'temiskaming',
  'Englehart': 'englehart',
  'Kirkland Lake': 'kirklandlake',
  'Matheson': 'matheson',
  'Timmins': 'timmins',
  'Cochrane': 'cochrane'
};
const STOP_ORDER = [
  'union', 'langstaff', 'gormley', 'washago', 'gravenhurst', 'bracebridge',
  'huntsville', 'southriver', 'temagami', 'northbay', 'temiskaming',
  'englehart', 'kirklandlake', 'matheson', 'timmins', 'cochrane'
];

/* Airtable Category to internal category key. */
const CAT_KEY = {
  'Eat & Drink': 'restaurants',
  'Stay': 'accommodations',
  'Nature': 'parks',
  'See & Do': 'attractions',
  'Shop': 'shops',
  'Transport': 'transportation'
};
const CAT_ORDER = ['restaurants', 'accommodations', 'parks', 'attractions', 'shops', 'transportation'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
const numOrNull = v => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

/* ---- Fetch every active record, paginating with the offset token ---- */
async function fetchAllActive() {
  const records = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('filterByFormula', '{Active}=TRUE()');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + API_KEY } });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Airtable fetch failed: ${res.status} ${t}`);
    }
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset;
    if (offset) await sleep(220);
  } while (offset);
  return records;
}

/* ---- Build a photo lookup from the existing listings-data.js so the
   static local image paths survive the rewrite ---- */
function buildPhotoIndex() {
  const idx = { byPlace: {}, byNameStop: {} };
  if (!fs.existsSync(OUT_FILE)) return idx;
  let txt;
  try { txt = fs.readFileSync(OUT_FILE, 'utf8'); } catch (e) { return idx; }
  const start = txt.indexOf('{');
  const end = txt.lastIndexOf('}');
  if (start < 0 || end < 0) return idx;
  let obj;
  try { obj = JSON.parse(txt.slice(start, end + 1)); } catch (e) { return idx; }
  for (const stopId of Object.keys(obj)) {
    const cats = obj[stopId] || {};
    for (const catKey of Object.keys(cats)) {
      for (const l of (cats[catKey] || [])) {
        const photos = {
          image: l.image || null,
          images: Array.isArray(l.images) ? l.images.filter(Boolean) : []
        };
        const pid = l.placeId || l.place_id || l.googlePlaceId;
        if (pid) idx.byPlace[pid] = photos;
        if (l.name) idx.byNameStop[stopId + '|' + norm(l.name)] = photos;
      }
    }
  }
  return idx;
}

function mapRecord(rec) {
  const f = rec.fields || {};
  const stopName = f[FIELD.stop] || '';
  const catLabel = f[FIELD.category] || '';
  const photos = Array.isArray(f[FIELD.photos])
    ? f[FIELD.photos].map(a => a && a.url).filter(Boolean)
    : [];
  return {
    stopId: STOP_ID[stopName] || null,
    catKey: CAT_KEY[catLabel] || null,
    placeId: f.googlePlaceId || null,
    listing: {
      name: f[FIELD.name] || '',
      stop: stopName,
      category: catLabel,
      desc: f[FIELD.desc] || null,
      address: f[FIELD.address] || null,
      phone: f[FIELD.phone] || null,
      website: f[FIELD.website] || null,
      rating: (f[FIELD.rating] == null || f[FIELD.rating] === '') ? null : f[FIELD.rating],
      hours: f[FIELD.hours] || null,
      walkMins: numOrNull(f[FIELD.walkMins]),
      lat: numOrNull(f[FIELD.lat]),
      lng: numOrNull(f[FIELD.lng]),
      active: f[FIELD.active] === true,
      featured: f[FIELD.featured] === true,
      packageTier: f[FIELD.packageTier] || null,
      sortOrder: numOrNull(f[FIELD.sortOrder]),
      featuredPriority: numOrNull(f[FIELD.featuredPriority]),
      discountOffered: f[FIELD.discountOffered] === true,
      discountDetails: f[FIELD.discountDetails] || null,
      photos
    }
  };
}

/* Featured first (by featuredPriority asc), then non-featured by
   sortOrder asc, then anything unsorted last. Stable within each tier. */
function sortListings(arr) {
  const tier = l => l.featured ? 0 : (typeof l.sortOrder === 'number' ? 1 : 2);
  return arr
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const ta = tier(a.l), tb = tier(b.l);
      if (ta !== tb) return ta - tb;
      if (ta === 0) {
        const pa = typeof a.l.featuredPriority === 'number' ? a.l.featuredPriority : Infinity;
        const pb = typeof b.l.featuredPriority === 'number' ? b.l.featuredPriority : Infinity;
        if (pa !== pb) return pa - pb;
        return a.i - b.i;
      }
      if (ta === 1) {
        if (a.l.sortOrder !== b.l.sortOrder) return a.l.sortOrder - b.l.sortOrder;
        return a.i - b.i;
      }
      return a.i - b.i;
    })
    .map(x => x.l);
}

(async () => {
  const photoIndex = buildPhotoIndex();
  const records = await fetchAllActive();

  const out = {};
  for (const sid of STOP_ORDER) {
    out[sid] = {};
    for (const ck of CAT_ORDER) out[sid][ck] = [];
  }

  let fetched = 0, skipped = 0, withPhotos = 0;
  for (const rec of records) {
    const { stopId, catKey, placeId, listing } = mapRecord(rec);
    if (listing.active !== true) continue;
    if (!stopId || !catKey) { skipped++; continue; }

    const match = (placeId && photoIndex.byPlace[placeId])
      || photoIndex.byNameStop[stopId + '|' + norm(listing.name)]
      || null;
    listing.image = match ? match.image : null;
    listing.images = match ? match.images : [];
    if (match && (match.image || (match.images && match.images.length))) withPhotos++;

    out[stopId][catKey].push(listing);
    fetched++;
  }

  let stopsPopulated = 0;
  for (const sid of STOP_ORDER) {
    let any = false;
    for (const ck of CAT_ORDER) {
      out[sid][ck] = sortListings(out[sid][ck]);
      if (out[sid][ck].length) any = true;
    }
    if (any) stopsPopulated++;
  }

  const header = '/* AUTO-GENERATED by backend/sync-from-airtable.js. Do not edit by hand.\n'
    + '   Listing data sourced from the Airtable Listings table (active rows),\n'
    + '   with static local photo paths merged in from the previous build.\n'
    + '   Re-run the script to refresh. */\n';
  const body = 'const LISTINGS_DATA = ' + JSON.stringify(out, null, 2) + ';\n'
    + "if (typeof module !== 'undefined') module.exports = LISTINGS_DATA;\n"
    + "if (typeof window !== 'undefined') window.LISTINGS_DATA = LISTINGS_DATA;\n";
  fs.writeFileSync(OUT_FILE, header + body);

  console.log('Listings fetched (active): ' + fetched);
  if (skipped) console.log('Skipped (unknown stop or category): ' + skipped);
  console.log('Stops populated: ' + stopsPopulated + ' / ' + STOP_ORDER.length);
  console.log('Listings with photos merged: ' + withPhotos);
  console.log('Wrote ' + OUT_FILE);
})().catch(e => { console.error('SYNC FAILED:', e.message); process.exit(1); });
