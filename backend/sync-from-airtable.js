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
const STOP_PAGES_FILE = path.join(SITE_DIR, 'stop-pages-data.js');

/* Stop-page content tables (read by field name). */
const STOP_PAGES_TABLE = 'tblowujj3pQycqWlU';
const FUN_FACTS_TABLE = 'tbl52c7zOiQciVQtl';
const FAQS_TABLE = 'tbl3q2C4DZTjL7i6A';
const DONT_FORGET_TABLE = 'tbldif0gcGvl6AvPy';
const STOP_TIPS_TABLE = 'tbluHMNsRouU4RbE6';

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
  photos: 'fldmdVR0kuIzVxe9q',
  tag: 'fldhnP3Za9yDPeGPB'
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
   walking distance lookups. Geocoded from the official Northlander
   station addresses. Hardcoded so the sync needs no other file. */
const STATION_COORDS = {
  union:        { lat: 43.645999, lng: -79.378262 },
  langstaff:    { lat: 43.838541, lng: -79.423118 },
  gormley:      { lat: 43.943199, lng: -79.398994 },
  washago:      { lat: 44.748877, lng: -79.334865 },
  gravenhurst:  { lat: 44.922324, lng: -79.372259 },
  bracebridge:  { lat: 45.043061, lng: -79.310298 },
  huntsville:   { lat: 45.323562, lng: -79.226337 },
  southriver:   { lat: 45.841012, lng: -79.3758 },
  temagami:     { lat: 47.063732, lng: -79.78894 },
  northbay:     { lat: 46.313907, lng: -79.438537 },
  temiskaming:  { lat: 47.508713, lng: -79.684951 },
  englehart:    { lat: 47.826705, lng: -79.873119 },
  kirklandlake: { lat: 48.108031, lng: -80.104478 },
  matheson:     { lat: 48.534352, lng: -80.465128 },
  timmins:      { lat: 48.495116, lng: -81.16054 },
  cochrane:     { lat: 49.060283, lng: -81.023652 }
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

/* ---- Retry helper. Calls fn() and retries on any thrown error up to
   `retries` times with `delay` ms between attempts. Used to wrap every
   Airtable / Distance Matrix fetch so a transient API blip never leads
   to an empty listings-data.js. ---- */
async function fetchWithRetry(fn, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`Attempt ${i + 1} failed: ${err.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

/* ---- Atomic write: stage the content in a sibling .tmp file, verify
   it has the expected marker and meets the minimum byte size, then
   rename over the target file in a single filesystem operation. If the
   staged file fails validation it is deleted and the original target
   file is left untouched. Returns the staged file size in bytes. ---- */
function writeAtomic(filePath, content, marker, minBytes) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content);
  const size = fs.statSync(tmp).size;
  const ok = size >= minBytes && content.includes(marker);
  if (!ok) {
    try { fs.unlinkSync(tmp); } catch (e) {}
    throw new Error(`Generated file failed validation: size=${size}, marker="${marker}" present=${content.includes(marker)}`);
  }
  fs.renameSync(tmp, filePath);
  return size;
}

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
    const res = await fetchWithRetry(() => fetch(url, { headers: { Authorization: 'Bearer ' + API_KEY } }));
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

/* ---- Generic table fetch (by field name), paginated, optional
   filterByFormula. Used for the stop-page content tables. ---- */
async function fetchTable(tableId, filter) {
  const records = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
    url.searchParams.set('pageSize', '100');
    if (filter) url.searchParams.set('filterByFormula', filter);
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetchWithRetry(() => fetch(url, { headers: { Authorization: 'Bearer ' + API_KEY } }));
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Airtable fetch failed (${tableId}): ${res.status} ${t}`);
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
    const res = await fetchWithRetry(() => fetch(url));
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
    const res = await fetchWithRetry(() => fetch(url, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    }));
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
      tag: f[FIELD.tag] || null,
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

  /* HARD GUARD: never overwrite listings-data.js with a tiny or empty
     output. A real run produces hundreds of rows; anything under 100 is
     almost certainly a transient Airtable error and a sign the file
     should not be touched. Exit code 1 makes the GitHub Action fail
     visibly instead of silently deploying a broken file. */
  if (fetched < 100) {
    console.error(`SYNC ABORTED: Only ${fetched} listings returned from Airtable. Expected at least 100. This looks like an API error. Refusing to overwrite listings-data.js.`);
    process.exit(1);
  }

  const header = '/* AUTO-GENERATED by backend/sync-from-airtable.js. Do not edit by hand.\n'
    + '   Listing data sourced from the Airtable Listings table (active rows),\n'
    + '   with static local photo paths merged in from the previous build.\n'
    + '   Re-run the script to refresh. */\n';
  const body = 'const LISTINGS_DATA = ' + JSON.stringify(out, null, 2) + ';\n'
    + "if (typeof module !== 'undefined') module.exports = LISTINGS_DATA;\n"
    + "if (typeof window !== 'undefined') window.LISTINGS_DATA = LISTINGS_DATA;\n";
  const listingsSize = writeAtomic(OUT_FILE, header + body, 'window.LISTINGS_DATA', 10000);

  console.log('Listings fetched (active): ' + fetched);
  if (skipped) console.log('Skipped (unknown stop or category): ' + skipped);
  console.log('Listings needing walking distance: ' + needWalk.length);
  console.log('Walking distance calculated: ' + walkSucceeded);
  console.log('Deactivated (no walkable route): ' + walkDeactivated);
  console.log('Stops populated: ' + stopsPopulated + ' / ' + STOP_ORDER.length);
  console.log('Listings with photos merged: ' + withPhotos);
  console.log(`SYNC COMPLETE: ${fetched} listings written to ${OUT_FILE} (${Math.round(listingsSize / 1024)}kb)`);

  /* ---- Stop-page content: Stop Pages, Fun Facts, FAQs, Don't Forget ---- */
  const num = v => (v == null || v === '') ? null : (isNaN(Number(v)) ? null : Number(v));

  const spRecs = await fetchTable(STOP_PAGES_TABLE, '{Published}=TRUE()');
  const stopPages = {};
  for (const r of spRecs) {
    const f = r.fields;
    const sid = f['Stop ID'];
    if (!sid) continue;
    stopPages[sid] = {
      stopName: f['Stop Name'] || '',
      pageTitle: f['Page Title'] || '',
      metaDescription: f['Meta Description'] || '',
      heroTagline: f['Hero Tagline'] || '',
      editorialIntro: f['Editorial Intro'] || '',
      gettingHere: f['Getting Here'] || '',
      gettingAround: f['Getting Around'] || '',
      springHighlights: f['Spring Highlights'] || '',
      summerHighlights: f['Summer Highlights'] || '',
      fallHighlights: f['Fall Highlights'] || '',
      winterHighlights: f['Winter Highlights'] || '',
      travelTime: f['Travel Time from Toronto'] || '',
      walkabilityScore: f['Walkability Score'] || '',
      bestFor: f['Best For'] || ''
    };
  }

  const ffRecs = await fetchTable(FUN_FACTS_TABLE, '{Published}=TRUE()');
  const funFacts = ffRecs.map(r => ({
    fact: r.fields['Fact'] || '', stop: r.fields['Stop'] || '',
    category: r.fields['Category'] || '', icon: r.fields['Icon'] || '',
    sortOrder: num(r.fields['Sort Order'])
  })).sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9));

  const fqRecs = await fetchTable(FAQS_TABLE, '{Published}=TRUE()');
  const faqs = fqRecs.map(r => ({
    question: r.fields['Question'] || '', answer: r.fields['Answer'] || '',
    stop: r.fields['Stop'] || '', category: r.fields['Category'] || '',
    sortOrder: num(r.fields['Sort Order'])
  })).sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9));

  const dfRecs = await fetchTable(DONT_FORGET_TABLE, '{Active}=TRUE()');
  const dontForget = dfRecs.map(r => ({
    item: r.fields['Item'] || '', why: r.fields['Why'] || '',
    triggerType: r.fields['Trigger Type'] || '', stop: r.fields['Stop'] || '',
    icon: r.fields['Icon'] || '', priority: r.fields['Priority'] || '',
    sortOrder: num(r.fields['Sort Order'])
  })).sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9));

  /* Traveller tips: approved rows only. Email and Reviewer Notes are
     intentionally excluded from the public payload (PII / internal). */
  const tipRecs = await fetchTable(STOP_TIPS_TABLE, '{Approved}=TRUE()');
  const stopTips = tipRecs.map(r => {
    const imgs = Array.isArray(r.fields['Image']) ? r.fields['Image'] : [];
    const first = imgs[0];
    return {
      tip: r.fields['Tip'] || '',
      stop: r.fields['Stop'] || '',
      submittedBy: r.fields['Submitted By'] || '',
      submissionDate: r.fields['Submission Date'] || null,
      featured: r.fields['Featured'] === true,
      displayOrder: num(r.fields['Display Order']),
      image: first ? (first.url || null) : null
    };
  }).sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return (a.displayOrder ?? 1e9) - (b.displayOrder ?? 1e9);
  });

  /* SECURITY: do not embed the Airtable key here. This file is public.
     Traveller tips submit through the /api/submit-tip serverless function,
     which holds the key server-side. */
  const spHeader = '/* AUTO-GENERATED by backend/sync-from-airtable.js. Do not edit by hand.\n'
    + '   Stop-page editorial content from Airtable (published rows only). */\n';
  const spBody = 'window.STOP_PAGES_DATA = ' + JSON.stringify(stopPages, null, 2) + ';\n'
    + 'window.FUN_FACTS_DATA = ' + JSON.stringify(funFacts, null, 2) + ';\n'
    + 'window.FAQS_DATA = ' + JSON.stringify(faqs, null, 2) + ';\n'
    + 'window.DONT_FORGET_DATA = ' + JSON.stringify(dontForget, null, 2) + ';\n'
    + 'window.STOP_TIPS_DATA = ' + JSON.stringify(stopTips, null, 2) + ';\n';
  const stopPagesSize = writeAtomic(STOP_PAGES_FILE, spHeader + spBody, 'window.STOP_PAGES_DATA', 1000);

  console.log(`Stop pages: ${Object.keys(stopPages).length} | fun facts: ${funFacts.length} | faqs: ${faqs.length} | dont-forget: ${dontForget.length} | tips: ${stopTips.length}`);
  console.log(`SYNC COMPLETE: stop-page data written to ${STOP_PAGES_FILE} (${Math.round(stopPagesSize / 1024)}kb)`);
})().catch(e => { console.error('SYNC FAILED:', e.message); process.exit(1); });
