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
const { geocodeNominatim, walkMinsBetween } = require('./walk');

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
/* GOOGLE_PLACES_KEY is no longer used by this sync. Walk times come
   from backend/walk.js (Haversine after a free Nominatim geocode).
   Left in the workflow env for now so re-adding it later is a
   one-line change in the YAML. */
const TABLE = 'tblPPmCZ7gBlvNGk2';
const OUT_FILE = path.join(__dirname, '..', 'site', 'events-data.js');

/* Generic fallback image for events that don't have a hand-picked
   photo. Uses the existing "events and markets" hero already in
   site/images/ so the look is on-brand and the cards never render
   with an empty image slot. Absolute URL so both the Guide and the
   App (cross-origin) can resolve it. */
const SITE_BASE_URL = 'https://northlanderguide.com';
const EVENT_PLACEHOLDER_URL =
  `${SITE_BASE_URL}/images/northlander-events-and-festivals.jpeg`;

/* Where Airtable attachment images get downloaded to. Same convention
   as backend/build-static.js for listing photos, just a separate folder
   so cleanup logic is scoped. */
const EVENTS_IMG_DIR = path.join(__dirname, '..', 'site', 'images', 'events');
const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif'
};

if (!KEY || !BASE) {
  console.error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID');
  process.exit(1);
}

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
  walkMins: 'fldRq2ec4LMvKnLE3',
  familyFriendly: 'fldZyf84pYPDFUxs3'
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
  northbay:     { lat: 46.313907, lng: -79.438537 },
  temagami:     { lat: 47.063732, lng: -79.78894 },
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

/* Download an Airtable attachment to site/images/events/ and return
   the permanent local URL + filename. Airtable signs attachment URLs
   for ~2 hours, so embedding them directly in events-data.js means the
   image goes dead before the next sync. Mirroring the listings-photo
   pattern (backend/build-static.js) keeps card images stable forever
   once committed. Returns null on any failure so the caller can fall
   back to a cached file or the placeholder. */
async function downloadEventImage(att, eventId) {
  if (!att || !att.url) return null;
  try {
    const r = await fetch(att.url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return null;
    const ext = MIME_EXT[att.type] || 'jpg';
    const file = `${eventId}.${ext}`;
    fs.writeFileSync(path.join(EVENTS_IMG_DIR, file), buf);
    return { url: `${SITE_BASE_URL}/images/events/${file}`, file };
  } catch (e) {
    return null;
  }
}

/* ---- Walking minutes from a station to an event venue.
       Free implementation: geocode the address via OpenStreetMap's
       Nominatim service, then compute Haversine + detour via
       backend/walk.js. The caller is responsible for throttling
       between calls (Nominatim's usage policy caps us at 1 request
       per second; we sleep 1100ms between). ---- */
async function walkMinutesFromStation(station, address) {
  if (!station || !address) return null;
  const point = await geocodeNominatim(address);
  if (!point) return null;
  return walkMinsBetween(station.lat, station.lng, point.lat, point.lng);
}

/* Hard-delete every Events row whose End Date is before today (Toronto
   time). Excludes recurring events because they keep recurring past
   their listed End Date and should never be auto-purged. Runs after
   the publish step so that any failure here cannot break a successful
   sync. Deletes in batches of 10 - Airtable's per-request cap on the
   DELETE endpoint. */
async function cleanupStaleEvents(today) {
  const formula = `AND({End Date} != BLANK(), IS_BEFORE({End Date}, DATETIME_PARSE('${today}')), NOT({Recurring}))`;
  const ids = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('filterByFormula', formula);
    url.searchParams.set('fields[]', 'Event Name');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetchWithRetry(() => fetch(url, { headers: { Authorization: 'Bearer ' + KEY } }));
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`stale-event fetch ${res.status} ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    for (const r of (data.records || [])) ids.push(r.id);
    offset = data.offset;
    if (offset) await sleep(220);
  } while (offset);

  if (!ids.length) {
    console.log('Cleanup: 0 stale events to delete.');
    return 0;
  }

  let deleted = 0, failedBatches = 0;
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    /* The DELETE endpoint takes records[] as URL params (no body). */
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}`);
    for (const id of batch) url.searchParams.append('records[]', id);
    const res = await fetchWithRetry(() => fetch(url.toString(), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + KEY }
    }));
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.warn(`Cleanup batch ${Math.floor(i / 10) + 1} failed: ${res.status} ${t.slice(0, 200)}`);
      failedBatches++;
      await sleep(220);
      continue;
    }
    deleted += batch.length;
    await sleep(220);
  }
  console.log(`Cleanup: deleted ${deleted}/${ids.length} stale events (End Date before ${today}, non-recurring). ${failedBatches ? 'Failed batches: ' + failedBatches : ''}`);
  return deleted;
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
    /* Default to the manually-entered Image URL (permanent) or the
       generic events photo. When an Image Upload attachment is present
       the post-mapping download pass overwrites this with the local
       /images/events/ URL after fetching the attachment to disk. We do
       NOT embed the raw attachment URL here because Airtable signs
       attachment URLs for ~2 hours and they go dead well before the
       next sync. */
    imageUrl: f[FIELD.imageUrl] || EVENT_PLACEHOLDER_URL,
    eventUrl: f[FIELD.eventUrl] || null,
    ticketUrl: f[FIELD.ticketUrl] || null,
    price: f[FIELD.price] || null,
    free: f[FIELD.free] === true,
    source: f[FIELD.source] || null,
    featured: f[FIELD.featured] === true,
    recurring: f[FIELD.recurring] === true,
    recurrencePattern: f[FIELD.recurrencePattern] || null,
    submittedBy: f[FIELD.submittedBy] || null,
    walkMins: typeof f[FIELD.walkMins] === 'number' ? f[FIELD.walkMins] : null,
    familyFriendly: f[FIELD.familyFriendly] === true
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
  /* Track the raw Image Upload attachment per kept event so the
     image-download pass below can fetch it. Kept separate from the
     event object so the published JSON stays minimal. */
  const attachmentByEventId = {};
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
    const att = (rec.fields || {})[FIELD.imageUpload]?.[0];
    if (att) attachmentByEventId[ev.id] = att;
    kept++;
  }

  /* Image download pass: pull every Airtable attachment to disk so the
     published URL is a permanent /images/events/ link. On a transient
     download failure, fall back to the previously-cached file for the
     same event (kept across syncs) before degrading to placeholder.
     Tracks the set of files that should remain on disk for orphan
     cleanup below. */
  fs.mkdirSync(EVENTS_IMG_DIR, { recursive: true });
  const existingImgFiles = new Set(
    fs.readdirSync(EVENTS_IMG_DIR).filter(f => !f.startsWith('.'))
  );
  const cachedFileByEventId = {};
  for (const f of existingImgFiles) {
    const m = f.match(/^(rec[A-Za-z0-9]+)\.[a-z]+$/);
    if (m) cachedFileByEventId[m[1]] = f;
  }
  const expectedImgFiles = new Set();
  let imgDownloaded = 0, imgReused = 0, imgFailed = 0;
  for (const ev of eventsToKeep) {
    const att = attachmentByEventId[ev.id];
    if (!att) continue;
    const result = await downloadEventImage(att, ev.id);
    if (result) {
      ev.imageUrl = result.url;
      expectedImgFiles.add(result.file);
      imgDownloaded++;
    } else {
      const cached = cachedFileByEventId[ev.id];
      if (cached) {
        ev.imageUrl = `${SITE_BASE_URL}/images/events/${cached}`;
        expectedImgFiles.add(cached);
        imgReused++;
        console.warn(`event image download failed, reusing cached ${cached}: ${ev.id} ${ev.name}`);
      } else {
        imgFailed++;
        console.warn(`event image download failed: ${ev.id} ${ev.name}`);
      }
    }
  }
  console.log(`Event images: downloaded=${imgDownloaded}, reused-cache=${imgReused}, failed=${imgFailed}.`);

  /* Walk-time pass: for any kept event with no cached walkMins but
     with a usable address, ask Google Distance Matrix once and cache
     the answer back to Airtable. Use the venue or address as the
     destination; prefer "Venue, Address" when both exist for better
     geocoding. Recurring events benefit most from caching since they
     keep their value across every future sync. */
  /* Per-event geocode candidates, in order of precision:
       1. Address with the venue prefix stripped ("51 Fifth St, ...").
          Many Airtable addresses look like "Englehart Fairgrounds,
          51 Fifth St, Englehart, ON P0J 1H0" - Nominatim chokes on
          the leading non-numeric token but resolves the stripped
          street address cleanly.
       2. Full address as entered.
       3. Venue alone, for named landmarks (parks, downtown areas) that
          have no postable street address.
     Joining venue+address into one query was the previous strategy and
     was rejecting ~94/129 events because the venue name typically
     duplicates inside the address. Stop at the first hit. */
  const unresolved = [];
  for (const ev of eventsToKeep) {
    if (ev.walkMins != null) continue;
    const station = STATION_COORDS[ev.stopId];
    if (!station) { walkSkipped++; continue; }
    const rawAddress = (ev.address && String(ev.address).trim()) || '';
    const rawVenue = (ev.venue && String(ev.venue).trim()) || '';
    const stripped = rawAddress.match(/^[^,]+,\s*(\d[^,].*?)$/);
    const ordered = [];
    if (stripped) ordered.push(stripped[1]);
    if (rawAddress) ordered.push(rawAddress);
    if (rawVenue) ordered.push(rawVenue);
    const candidates = [...new Set(ordered)];
    if (!candidates.length) { walkSkipped++; continue; }
    let mins = null;
    for (const q of candidates) {
      mins = await walkMinutesFromStation(station, q);
      /* Nominatim usage policy: <= 1 req/sec. 1100ms is a comfortable
         margin even when multiple candidates fire for one event. */
      await sleep(1100);
      if (mins != null) break;
    }
    if (mins != null) {
      ev.walkMins = mins;
      walkComputed++;
      await cacheWalkMins(ev.id, mins);
    } else {
      walkSkipped++;
      unresolved.push(`${ev.stopId} | ${ev.name} | ${ev.address || ev.venue}`);
    }
  }
  if (unresolved.length) {
    console.log(`Walk time still unresolved (${unresolved.length} events). Tighten the Airtable address to fix:`);
    for (const u of unresolved) console.log('  -', u);
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

  /* Orphan image cleanup: any file in images/events/ that no current
     event points at is left over from a deleted event or a replaced
     attachment. Drop it so the repo doesn't grow forever. */
  let imgOrphans = 0;
  for (const f of fs.readdirSync(EVENTS_IMG_DIR)) {
    if (f.startsWith('.')) continue;
    if (!expectedImgFiles.has(f)) {
      fs.unlinkSync(path.join(EVENTS_IMG_DIR, f));
      imgOrphans++;
    }
  }
  if (imgOrphans) console.log(`Event images: removed ${imgOrphans} orphan file(s).`);

  /* Cleanup pass: remove stale rows from Airtable. Wrapped in try/catch
     so a failure here does not mask the already-successful publish. */
  try {
    await cleanupStaleEvents(today);
  } catch (e) {
    console.warn('Cleanup step failed (publish already succeeded):', e.message);
  }
})().catch(e => { console.error('EVENTS SYNC FAILED:', e.message); process.exit(1); });
