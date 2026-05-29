/* ==================================================================
   THE NORTHLANDER WAYFINDER - AIRTABLE TO STATIC DATA SYNC
   ------------------------------------------------------------------
   Reads every active row from the Airtable Listings table and writes
   a fresh site/listings-data.js. Static photo paths from the previous
   build are merged back in so existing card images are preserved.

   Any active listing that has lat + lng but no walkMins gets a walking
   distance from the Google Distance Matrix API: a valid result is saved
   back to Airtable and the static file, while a listing with no walkable
   route is marked inactive in Airtable and dropped from the output.

   USAGE
     1. Put AIRTABLE_API_KEY and AIRTABLE_BASE_ID in backend/.env
        (GOOGLE_PLACES_KEY too, for the walking distance backfill)
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
const GOOGLE_KEY = process.env.GOOGLE_PLACES_KEY;

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

/* Station coordinates per stop, used as the Distance Matrix origin for
   walking distance lookups. Hardcoded so the sync needs no other file. */
const STATION_COORDS = {
  union:        { lat: 43.6452, lng: -79.3806 },
  langstaff:    { lat: 43.8465, lng: -79.4347 },
  gormley:      { lat: 43.9428, lng: -79.3796 },
  washago:      { lat: 44.7501, lng: -79.3338 },
  gravenhurst:  { lat: 44.9177, lng: -79.3730 },
  bracebridge:  { lat: 45.0378, lng: -79.3022 },
  huntsville:   { lat: 45.3270, lng: -79.2186 },
  southriver:   { lat: 45.8348, lng: -79.3793 },
  temagami:     { lat: 46.9833, lng: -79.7833 },
  northbay:     { lat: 46.3091, lng: -79.4608 },
  temiskaming:  { lat: 47.5150, lng: -79.6831 },
  englehart:    { lat: 47.8264, lng: -79.8694 },
  kirklandlake: { lat: 48.1500, lng: -80.0333 },
  matheson:     { lat: 48.5333, lng: -80.4667 },
  timmins:      { lat: 48.4778, lng: -81.3300 },
  cochrane:     { lat: 49.0594, lng: -81.0144 }
};

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

/* ---- Walking time + distance from a station to a listing via the
   Google Distance Matrix API (mode=walking). Returns null on
   ZERO_RESULTS, no walkable route, or any error, so the caller can
   deactivate the listing. ---- */
async function getWalk(station, lat, lng) {
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json`
      + `?origins=${station.lat},${station.lng}`
      + `&destinations=${lat},${lng}`
      + `&mode=walking&key=${GOOGLE_KEY}`;
    const res = await fetch(url);
    const d = await res.json();
    const el = d.rows && d.rows[0] && d.rows[0].elements && d.rows[0].elements[0];
    if (d.status === 'OK' && el && el.status === 'OK' && el.duration) {
      return {
        walkMins: Math.round(el.duration.value / 60),
        walkDistance: el.distance ? el.distance.text : null
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/* ---- PATCH one Airtable record, retrying briefly on rate limit ---- */
async function updateRecord(id, fields) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${id}`;
  let tries = 0;
  while (true) {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    if (res.status === 429 && tries < 5) { tries++; await sleep(1500); continue; }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error(`Record update failed (${id}): ${res.status} ${t}`);
      return false;
    }
    return true;
  }
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
  /* Preserve the Airtable attachment order exactly. The first photo is
     the card hero/cover and the rest follow in gallery order, so a drag
     reorder in Airtable flows straight to the site on the next sync.
     Only nulls are dropped; the array is never sorted or reordered. */
  const photos = Array.isArray(f[FIELD.photos])
    ? f[FIELD.photos].map(a => a && a.url).filter(Boolean)
    : [];
  return {
    recordId: rec.id,
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

  /* Map all active records first, keeping the record id for updates. */
  const mapped = [];
  let skipped = 0;
  for (const rec of records) {
    const m = mapRecord(rec);
    if (m.listing.active !== true) continue;
    if (!m.stopId || !m.catKey) { skipped++; continue; }
    mapped.push(m);
  }

  /* Walking distance backfill: any active listing with lat + lng but no
     walkMins gets a Distance Matrix lookup. A valid result is written
     back to Airtable and the static file; no walkable route deactivates
     the listing in Airtable and drops it from the output. */
  const needWalk = mapped.filter(m =>
    m.listing.walkMins == null && m.listing.lat != null && m.listing.lng != null);
  let walkSucceeded = 0, walkDeactivated = 0;
  const deactivated = new Set();

  if (needWalk.length && !GOOGLE_KEY) {
    console.warn(`GOOGLE_PLACES_KEY not set: skipping walking distance for ${needWalk.length} listings.`);
  } else {
    for (const m of needWalk) {
      const station = STATION_COORDS[m.stopId];
      if (!station) continue;
      const result = await getWalk(station, m.listing.lat, m.listing.lng);
      await sleep(100);
      if (result && result.walkMins != null) {
        m.listing.walkMins = result.walkMins;
        m.listing.walkDistance = result.walkDistance;
        await updateRecord(m.recordId, { [FIELD.walkMins]: result.walkMins });
        walkSucceeded++;
      } else {
        await updateRecord(m.recordId, { [FIELD.active]: false });
        deactivated.add(m.recordId);
        walkDeactivated++;
        console.log(`Deactivated (no walkable route): ${m.listing.name} - ${m.listing.stop}`);
      }
    }
  }

  /* Build the output, excluding any listing deactivated above. */
  const out = {};
  for (const sid of STOP_ORDER) {
    out[sid] = {};
    for (const ck of CAT_ORDER) out[sid][ck] = [];
  }

  let fetched = 0, withPhotos = 0;
  for (const m of mapped) {
    if (deactivated.has(m.recordId)) continue;
    const { stopId, catKey, placeId, listing } = m;

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
  console.log('Listings needing walking distance: ' + needWalk.length);
  console.log('Walking distance calculated: ' + walkSucceeded);
  console.log('Deactivated (no walkable route): ' + walkDeactivated);
  console.log('Stops populated: ' + stopsPopulated + ' / ' + STOP_ORDER.length);
  console.log('Listings with photos merged: ' + withPhotos);
  console.log('Wrote ' + OUT_FILE);
})().catch(e => { console.error('SYNC FAILED:', e.message); process.exit(1); });
