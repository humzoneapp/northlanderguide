/* ==================================================================
   THE NORTHLANDER WAYFINDER - EVENTS SYNC
   ------------------------------------------------------------------
   Reads every Approved event from the Airtable Events table and writes
   site/events-data.js as window.EVENTS_DATA, grouped by stop slug.

   Sync filter excludes Approved=false rows so community-submitted
   events never go live until the admin ticks Approved in Airtable
   (mirrors the Listings Needs Review pattern).

   Recurring events are kept regardless of date; one-off events are
   kept only when End Date (or Start Date if End Date is blank) is on
   or after today. Stale one-offs are dropped from the published file.

   USAGE
     node backend/sync-events.js

   REQUIRED env vars
     AIRTABLE_API_KEY
     AIRTABLE_BASE_ID
   ================================================================== */

const fs = require('fs');
const path = require('path');

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

const KEY = process.env.AIRTABLE_API_KEY;
const BASE = process.env.AIRTABLE_BASE_ID;
const GKEY = process.env.GOOGLE_PLACES_KEY;
const TABLE = 'tblPPmCZ7gBlvNGk2';
const OUT_FILE = path.join(__dirname, '..', 'site', 'events-data.js');

if (!KEY || !BASE) {
  console.error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID');
  process.exit(1);
}
/* GOOGLE_PLACES_KEY is optional. If missing, walk-time computation
   is silently skipped and existing cached values still publish. */

const FIELD = {
  name: 'fldf49uTL7Ix798Lu',
  stop: 'fldddTDHwHO7lSL3t',
  category: 'fldUbYp7mFcgi0nJt',
  startDate: 'fld4R9kLZkfdYKBiw',
  endDate: 'flduDjW3cO2JFGKDf',
  startTime: 'fld1RUVXyuvxSKVuY',
  endTime: 'fldNzvJ8lEVfdnZwY',
  venue: 'fldxmfXCcJIKBhQyn',
  address: 'fld3FdQh9igIepst7',
  description: 'fldxOqeckhT9M54JW',
  imageUrl: 'fldclee4sdCR83O9M',
  imageUpload: 'fldE7jR2Q7jDmFVAH',
  eventUrl: 'fldy4mdaUad0reqoJ',
  ticketUrl: 'fldwKW2vYL5juwBbp',
  price: 'fldWs83Oqcwo4LRv0',
  free: 'fldxHoYePcEqZSO6c',
  source: 'fldDBdDKHD2BiHD2T',
  featured: 'fldar2nu1jG1UR7tu',
  recurring: 'fldHzvAY64fVzCFVG',
  recurrencePattern: 'fldkCPHFWYA3JdCz0',
  approved: 'fldjm7sETc9PwNwRa',
  submittedBy: 'fldaKI2cPG9JPtFfW',
  submitterEmail: 'fld6gLAblN51MMJJe',
  walkMins: 'fldRq2ec4LMvKnLE3'
};

/* Stop name to slug map kept in sync with sync-from-airtable.js. */
const STOP_ID = {
  'Toronto Union': 'union', 'Langstaff': 'langstaff', 'Gormley': 'gormley',
  'Washago': 'washago', 'Gravenhurst': 'gravenhurst', 'Bracebridge': 'bracebridge',
  'Huntsville': 'huntsville', 'South River': 'southriver', 'Temagami': 'temagami',
  'North Bay': 'northbay', 'Temiskaming Shores': 'temiskaming', 'Englehart': 'englehart',
  'Kirkland Lake': 'kirklandlake', 'Matheson': 'matheson', 'Timmins': 'timmins',
  'Cochrane': 'cochrane'
};

/* Station coordinates kept in sync with enrich-listing.js so the
   walk-time computation lines up with the same anchor used for
   listings. */
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(fn, retries = 3, delay = 1500) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`retry ${i + 1}: ${err.message}`);
      await sleep(delay);
    }
  }
}

/* ---- Google Distance Matrix: walking minutes from a station to an
       address string. Returns null on any failure so the caller can
       silently fall through without breaking the publish. ---- */
async function walkMinutesFromStation(station, address) {
  if (!GKEY || !station || !address) return null;
  try {
    const url = 'https://maps.googleapis.com/maps/api/distancematrix/json'
      + '?origins=' + station.lat + ',' + station.lng
      + '&destinations=' + encodeURIComponent(address)
      + '&mode=walking&key=' + GKEY;
    const r = await fetchWithRetry(() => fetch(url));
    const d = await r.json();
    const el = d.rows && d.rows[0] && d.rows[0].elements && d.rows[0].elements[0];
    if (d.status === 'OK' && el && el.status === 'OK' && el.duration) {
      return Math.round(el.duration.value / 60);
    }
  } catch (e) { /* swallow */ }
  return null;
}

/* Cache the computed walk time back to the Airtable row so subsequent
   syncs do not re-spend a Distance Matrix call on the same address. */
async function cacheWalkMins(recordId, mins) {
  const res = await fetchWithRetry(() => fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [FIELD.walkMins]: mins } })
  }));
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.warn(`cacheWalkMins ${recordId} failed: ${res.status} ${t.slice(0, 160)}`);
  }
}

async function fetchAllApproved() {
  const records = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('filterByFormula', '{Approved}=TRUE()');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetchWithRetry(() => fetch(url, { headers: { Authorization: 'Bearer ' + KEY } }));
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Airtable fetch failed: ${res.status} ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset;
    if (offset) await sleep(220);
  } while (offset);
  return records;
}

function todayISO() {
  /* Use Toronto time for the staleness cutoff so an event happening
     today doesn't disappear mid-day in UTC terms. */
  const d = new Date();
  const t = new Date(d.toLocaleString('en-US', { timeZone: 'America/Toronto' }));
  return t.toISOString().slice(0, 10);
}

function mapRecord(rec) {
  const f = rec.fields || {};
  const name = (f[FIELD.name] || '').trim();
  const stopName = f[FIELD.stop] || '';
  const stopId = STOP_ID[stopName] || null;
  if (!name || !stopId) return null;

  return {
    id: rec.id,
    name,
    stop: stopName,
    stopId,
    category: f[FIELD.category] || null,
    startDate: f[FIELD.startDate] || null,
    endDate: f[FIELD.endDate] || null,
    startTime: f[FIELD.startTime] || null,
    endTime: f[FIELD.endTime] || null,
    venue: f[FIELD.venue] || null,
    address: f[FIELD.address] || null,
    description: f[FIELD.description] || null,
    /* Prefer an uploaded image attachment when present, fall back to
       the manually-entered Image URL. Airtable attachment URLs are
       served from a CDN and embed safely as <img src=...>. */
    imageUrl: (Array.isArray(f[FIELD.imageUpload]) && f[FIELD.imageUpload][0] && f[FIELD.imageUpload][0].url)
      || f[FIELD.imageUrl] || null,
    eventUrl: f[FIELD.eventUrl] || null,
    ticketUrl: f[FIELD.ticketUrl] || null,
    price: f[FIELD.price] || null,
    free: f[FIELD.free] === true,
    source: f[FIELD.source] || null,
    featured: f[FIELD.featured] === true,
    recurring: f[FIELD.recurring] === true,
    recurrencePattern: f[FIELD.recurrencePattern] || null,
    submittedBy: f[FIELD.submittedBy] || null,
    walkMins: typeof f[FIELD.walkMins] === 'number' ? f[FIELD.walkMins] : null
  };
}

/* ================================================================== */
(async () => {
  console.log('Fetching approved events...');
  const records = await fetchAllApproved();
  console.log(`Approved events in Airtable: ${records.length}`);

  const today = todayISO();
  const out = {};
  for (const sid of Object.values(STOP_ID)) out[sid] = [];

  let kept = 0, droppedStale = 0, droppedNoStop = 0, walkComputed = 0, walkSkipped = 0;
  const eventsToKeep = [];
  for (const rec of records) {
    const ev = mapRecord(rec);
    if (!ev) { droppedNoStop++; continue; }
    /* Keep recurring events regardless of date; drop one-offs whose
       end (or start, if no end) is in the past. */
    if (!ev.recurring) {
      const cutoff = ev.endDate || ev.startDate;
      if (cutoff && cutoff < today) { droppedStale++; continue; }
    }
    eventsToKeep.push(ev);
    kept++;
  }

  /* Walk-time pass: for any kept event with no cached walkMins but
     with a usable address, ask Google Distance Matrix once and cache
     the answer back to Airtable. Use the venue or address as the
     destination; prefer "Venue, Address" when both exist for better
     geocoding. Recurring events benefit most from caching since they
     keep their value across every future sync. */
  for (const ev of eventsToKeep) {
    if (ev.walkMins != null) continue;
    const station = STATION_COORDS[ev.stopId];
    if (!station) { walkSkipped++; continue; }
    const dest = [ev.venue, ev.address].filter(Boolean).join(', ').trim();
    if (!dest) { walkSkipped++; continue; }
    const mins = await walkMinutesFromStation(station, dest);
    if (mins != null) {
      ev.walkMins = mins;
      walkComputed++;
      await cacheWalkMins(ev.id, mins);
      await sleep(220);
    } else {
      walkSkipped++;
    }
  }

  for (const ev of eventsToKeep) {
    out[ev.stopId].push(ev);
  }

  /* Sort each stop's events: featured first, then by start date asc,
     then by name. Recurring without a start date sink to the end. */
  for (const sid of Object.keys(out)) {
    out[sid].sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      const ad = a.startDate || '9999-12-31';
      const bd = b.startDate || '9999-12-31';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  const stopsWithEvents = Object.values(out).filter(arr => arr.length > 0).length;
  console.log(`Kept ${kept} events across ${stopsWithEvents} stops. Dropped stale=${droppedStale}, unmapped-stop=${droppedNoStop}. Walk times: computed=${walkComputed}, skipped=${walkSkipped}.`);

  const header = '/* AUTO-GENERATED by backend/sync-events.js. Do not edit by hand.\n'
    + '   Event data sourced from the Airtable Events table (Approved rows only,\n'
    + '   future or recurring). Re-run the script to refresh. */\n';
  const body = 'const EVENTS_DATA = ' + JSON.stringify(out, null, 2) + ';\n'
    + "if (typeof module !== 'undefined') module.exports = EVENTS_DATA;\n"
    + "if (typeof window !== 'undefined') window.EVENTS_DATA = EVENTS_DATA;\n";

  /* Atomic write: stage to .tmp, verify marker + size, rename. */
  const tmp = OUT_FILE + '.tmp';
  fs.writeFileSync(tmp, header + body);
  const written = fs.readFileSync(tmp, 'utf8');
  if (!written.includes('window.EVENTS_DATA')) {
    fs.unlinkSync(tmp);
    throw new Error('Generated file failed marker validation.');
  }
  fs.renameSync(tmp, OUT_FILE);
  console.log(`SYNC COMPLETE: ${kept} events written to ${OUT_FILE} (${Math.round(fs.statSync(OUT_FILE).size / 1024)}kb)`);
})().catch(e => { console.error('EVENTS SYNC FAILED:', e.message); process.exit(1); });
