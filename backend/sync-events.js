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
const TABLE = 'tblPPmCZ7gBlvNGk2';
const OUT_FILE = path.join(__dirname, '..', 'site', 'events-data.js');

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
  submitterEmail: 'fld6gLAblN51MMJJe'
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
    imageUrl: f[FIELD.imageUrl] || null,
    eventUrl: f[FIELD.eventUrl] || null,
    ticketUrl: f[FIELD.ticketUrl] || null,
    price: f[FIELD.price] || null,
    free: f[FIELD.free] === true,
    source: f[FIELD.source] || null,
    featured: f[FIELD.featured] === true,
    recurring: f[FIELD.recurring] === true,
    recurrencePattern: f[FIELD.recurrencePattern] || null,
    submittedBy: f[FIELD.submittedBy] || null
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

  let kept = 0, droppedStale = 0, droppedNoStop = 0;
  for (const rec of records) {
    const ev = mapRecord(rec);
    if (!ev) { droppedNoStop++; continue; }
    /* Keep recurring events regardless of date; drop one-offs whose
       end (or start, if no end) is in the past. */
    if (!ev.recurring) {
      const cutoff = ev.endDate || ev.startDate;
      if (cutoff && cutoff < today) { droppedStale++; continue; }
    }
    out[ev.stopId].push(ev);
    kept++;
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
  console.log(`Kept ${kept} events across ${stopsWithEvents} stops. Dropped stale=${droppedStale}, unmapped-stop=${droppedNoStop}.`);

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
