/* ==================================================================
   THE NORTHLANDER WAYFINDER - BACKFILL AIRTABLE PHOTOS FROM VERCEL
   ------------------------------------------------------------------
   Fills the Airtable Photos attachment field on each Listings row with
   the static photos already deployed to the live site, by matching on
   Business Name + Stop.

   HOW AIRTABLE ATTACHMENTS WORK
   The records API cannot create an attachment from raw binary: you give
   Airtable a publicly reachable URL and Airtable fetches the file
   itself. Our build photos are already public at
   https://www.northlanderguide.com/images/listings/..., so we pass
   those URLs straight through. No download, no resize, no temp files:
   the source images are already capped at 800px wide by build-static.js,
   so the initial backfill needs no processing.

   FUTURE / MANUAL UPLOADS
   Airtable accepts either an image URL (it fetches it) or a direct
   upload through the Airtable UI. For best performance, any photo you
   add by hand should first be resized to a maximum of 1200px on the
   longest edge and re-encoded as JPEG at 85% quality. Do this with any
   image editor or the free squoosh.app tool. If a future script ever
   needs to resize before upload, the sharp npm package can do it, but
   sharp is intentionally not a dependency here because these source
   images already need no resizing.

   USAGE
     1. AIRTABLE_API_KEY and AIRTABLE_BASE_ID must be in backend/.env
     2. node backend/upload-photos-to-airtable.js
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
const DATA_FILE = path.join(SITE_DIR, 'listings-data.js');
/* The apex northlanderguide.com answers with a 307 redirect to the www
   host. Airtable fetches attachment URLs without reliably following
   redirects, so point at www directly, which serves the image as a
   200 image/jpeg. */
const BASE_URL = 'https://www.northlanderguide.com/';

const FIELD = {
  name: 'fldih5HMKh5O61HMh',
  stop: 'fldmyKFYFKHzOYYhf',
  photos: 'fldmdVR0kuIzVxe9q'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
const keyOf = (name, stop) => norm(name) + '|' + norm(stop);

/* ---- Read site/listings-data.js and return the listings that carry a
   static images array, with their business name and stop ---- */
function readListingsWithImages() {
  const txt = fs.readFileSync(DATA_FILE, 'utf8');
  const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
  const D = JSON.parse(txt.slice(s, e + 1));
  const out = [];
  for (const stopId of Object.keys(D)) {
    for (const cat of Object.keys(D[stopId])) {
      for (const l of (D[stopId][cat] || [])) {
        const images = Array.isArray(l.images) ? l.images.filter(Boolean) : [];
        if (!images.length) continue;
        out.push({ name: l.name || '', stop: l.stop || '', images });
      }
    }
  }
  return out;
}

/* ---- Fetch every Listings record (id, name, stop, whether Photos is
   already populated), paginating with the offset token ---- */
async function fetchAllRecords() {
  const out = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.append('fields[]', FIELD.name);
    url.searchParams.append('fields[]', FIELD.stop);
    url.searchParams.append('fields[]', FIELD.photos);
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + API_KEY } });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Airtable fetch failed: ${res.status} ${t}`);
    }
    const data = await res.json();
    for (const rec of (data.records || [])) {
      const f = rec.fields || {};
      const ph = f[FIELD.photos];
      out.push({
        id: rec.id,
        name: f[FIELD.name] || '',
        stop: f[FIELD.stop] || '',
        hasPhotos: Array.isArray(ph) && ph.length > 0
      });
    }
    offset = data.offset;
    if (offset) await sleep(220);
  } while (offset);
  return out;
}

/* ---- PATCH up to 10 records at once, retrying briefly on rate limit ---- */
async function patchBatch(records) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
  let tries = 0;
  while (true) {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records })
    });
    if (res.status === 429 && tries < 5) { tries++; await sleep(1500); continue; }
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  }
}

function attachmentsFor(images) {
  return images.map(img => {
    const clean = img.replace(/^\/+/, '');
    return { url: BASE_URL + clean, filename: clean.split('/').pop() };
  });
}

(async () => {
  const records = await fetchAllRecords();
  const byKey = {};
  for (const r of records) {
    const k = keyOf(r.name, r.stop);
    (byKey[k] = byKey[k] || []).push(r);
  }

  const listings = readListingsWithImages();

  /* Build the update list. Only target records whose Photos field is
     still empty, and claim each record at most once per run so several
     same-named listings at one stop map to distinct records. */
  const claimed = new Set();
  const updates = [];
  let processed = 0, noRecord = 0, alreadyHadPhotos = 0;
  for (const l of listings) {
    processed++;
    const candidates = byKey[keyOf(l.name, l.stop)] || [];
    if (!candidates.length) { noRecord++; continue; }
    const rec = candidates.find(c => !c.hasPhotos && !claimed.has(c.id));
    if (!rec) { alreadyHadPhotos++; continue; }
    claimed.add(rec.id);
    const atts = attachmentsFor(l.images);
    updates.push({ id: rec.id, fields: { [FIELD.photos]: atts }, count: atts.length });
  }

  console.log(`Listings with static images: ${processed}`);
  console.log(`Matched to an empty Airtable record: ${updates.length}`);
  console.log(`Skipped (already had photos): ${alreadyHadPhotos}`);
  console.log(`Skipped (no matching record): ${noRecord}`);
  console.log(`Uploading in batches of 10 with a 500ms delay...\n`);

  let updatedRecords = 0, photosUploaded = 0, nextLog = 50;
  const failures = [];
  for (let i = 0; i < updates.length; i += 10) {
    const slice = updates.slice(i, i + 10);
    const payload = slice.map(u => ({ id: u.id, fields: u.fields }));
    const { status, body } = await patchBatch(payload);
    if (status === 200 && body.records) {
      updatedRecords += body.records.length;
      photosUploaded += slice.reduce((s, u) => s + u.count, 0);
    } else {
      const msg = body && body.error
        ? (body.error.type + ': ' + (body.error.message || ''))
        : ('HTTP ' + status);
      slice.forEach(u => failures.push({ id: u.id, error: msg }));
      console.error(`Batch fail at update ${i + 1}: ${msg}`);
    }
    if (i + slice.length >= nextLog) {
      console.log(`progress: ${updatedRecords} records updated (${i + slice.length}/${updates.length})`);
      nextLog += 50;
    }
    await sleep(500);
  }

  console.log(`\nDONE.`);
  console.log(`Total listings processed: ${processed}`);
  console.log(`Total records updated: ${updatedRecords}`);
  console.log(`Total photos uploaded: ${photosUploaded}`);
  console.log(`Failures: ${failures.length}`);
  if (failures.length) {
    failures.slice(0, 30).forEach(f => console.log(`  - ${f.id}: ${f.error}`));
    if (failures.length > 30) console.log(`  ...and ${failures.length - 30} more`);
  }
})().catch(e => { console.error('UPLOAD FAILED:', e.message); process.exit(1); });
