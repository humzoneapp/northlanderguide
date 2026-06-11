/* ==================================================================
   restore-listing-photos.js

   Copies the Listings Photos attachment field from the restored
   snapshot base back into the live base, matched by record ID.

   Direction (paranoid statement, read this first):
     READ FROM:  appUbIWiFr5aNhstV  (Northlander RESTORE, snapshot)
     WRITE TO:   appMpzW7Xo5nYOos9  (Northlander Guide, live)
     FIELD:      fldmdVR0kuIzVxe9q  (Photos attachment field only)

   Nothing else is touched. No DELETEs anywhere. Only PATCH against
   the Photos field on records that already exist in the live base.

   Usage:
     node backend/restore-listing-photos.js --dry-run
       Reads from RESTORE, intersects with live record IDs, logs
       what it would do. NO writes.

     node backend/restore-listing-photos.js
       Same as above, then writes the photos to the live base.

   Reads AIRTABLE_API_KEY from backend/.env automatically.
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

const API_KEY = process.env.AIRTABLE_API_KEY;

const SOURCE_BASE = 'appUbIWiFr5aNhstV';      // RESTORE snapshot, read-only
const LIVE_BASE   = 'appMpzW7Xo5nYOos9';      // Guide live, write target
const TABLE_ID    = 'tblfVQcLjEv0a4sCJ';      // Listings (same ID in both bases)
const PHOTOS_FIELD = 'fldmdVR0kuIzVxe9q';     // Photos attachment field

const DRY_RUN = process.argv.includes('--dry-run');

if (!API_KEY) {
  console.error('Missing AIRTABLE_API_KEY in environment (or backend/.env). Aborting.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function airtable(method, base, urlPath, body) {
  const res = await fetch('https://api.airtable.com/v0/' + base + urlPath, {
    method,
    headers: {
      Authorization: 'Bearer ' + API_KEY,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(method + ' ' + urlPath + ' failed: ' + res.status + ' ' + text);
  }
  return res.json();
}

/* Read every record in SOURCE that has at least one photo. We only
   request the Photos field so this is the minimum data needed.

   `returnFieldsByFieldId=true` makes Airtable key the response by
   field ID (the default is to key by field name, which would mean
   the script looks for rec.fields['fldmdVR0kuIzVxe9q'] but Airtable
   returns rec.fields['Photos'], silently producing zero matches). */
async function readSourcePhotos() {
  const all = [];
  let offset;
  do {
    const params = new URLSearchParams();
    params.append('fields[]', PHOTOS_FIELD);
    params.append('returnFieldsByFieldId', 'true');
    params.append('pageSize', '100');
    if (offset) params.append('offset', offset);
    const data = await airtable('GET', SOURCE_BASE, '/' + TABLE_ID + '?' + params.toString());
    for (const rec of data.records) {
      const photos = rec.fields[PHOTOS_FIELD];
      if (Array.isArray(photos) && photos.length > 0) {
        all.push({
          id: rec.id,
          attachments: photos.map((p) => ({ url: p.url, filename: p.filename }))
        });
      }
    }
    offset = data.offset;
    await sleep(220);
  } while (offset);
  return all;
}

/* Read every record ID that EXISTS in the live base. Used to filter
   the source list so we never try to PATCH a record that was deleted
   from live (which would fail the entire batch). */
async function readLiveRecordIds() {
  const ids = new Set();
  let offset;
  do {
    const params = new URLSearchParams();
    /* Request the primary field so the payload is small; we only
       care about the record ID, not the field value. */
    params.append('fields[]', 'fldih5HMKh5O61HMh');
    params.append('returnFieldsByFieldId', 'true');
    params.append('pageSize', '100');
    if (offset) params.append('offset', offset);
    const data = await airtable('GET', LIVE_BASE, '/' + TABLE_ID + '?' + params.toString());
    for (const rec of data.records) ids.add(rec.id);
    offset = data.offset;
    await sleep(220);
  } while (offset);
  return ids;
}

/* PATCH a batch of up to 10 records, writing ONLY the Photos field.
   Airtable PATCH replaces the named field's value while leaving every
   other field on the record untouched. */
async function writeBatch(records) {
  const body = {
    records: records.map((r) => ({
      id: r.id,
      fields: { [PHOTOS_FIELD]: r.attachments }
    })),
    typecast: false
  };
  await airtable('PATCH', LIVE_BASE, '/' + TABLE_ID, body);
}

(async () => {
  console.log(DRY_RUN ? '*** DRY RUN - no writes will be made ***' : 'LIVE RUN - photos will be written.');
  console.log('Reading photos from RESTORE (' + SOURCE_BASE + ')...');
  const sourceRecords = await readSourcePhotos();
  const totalPhotos = sourceRecords.reduce((n, r) => n + r.attachments.length, 0);
  console.log('  Found ' + sourceRecords.length + ' listings with photos (' + totalPhotos + ' images total).');

  console.log('Reading record IDs from Guide (' + LIVE_BASE + ')...');
  const liveIds = await readLiveRecordIds();
  console.log('  Found ' + liveIds.size + ' listings in the live base.');

  /* Intersect: only PATCH records that exist in both bases. */
  const restorable = sourceRecords.filter((r) => liveIds.has(r.id));
  const orphaned = sourceRecords.filter((r) => !liveIds.has(r.id));
  console.log('');
  console.log('Plan:');
  console.log('  Listings to restore:        ' + restorable.length);
  console.log('  Listings skipped (orphans): ' + orphaned.length +
              ' (exist in RESTORE but not in Guide)');
  console.log('');

  if (DRY_RUN) {
    if (orphaned.length > 0) {
      console.log('First few orphans (record id only):');
      for (const o of orphaned.slice(0, 5)) console.log('  ' + o.id);
    }
    console.log('');
    console.log('Dry run complete. Re-run without --dry-run to actually write.');
    return;
  }

  console.log('Writing photos to Guide in batches of 10...');
  let done = 0;
  let failed = 0;
  for (let i = 0; i < restorable.length; i += 10) {
    const batch = restorable.slice(i, i + 10);
    try {
      await writeBatch(batch);
      done += batch.length;
    } catch (err) {
      failed += batch.length;
      console.error('  Batch starting at index ' + i + ' failed: ' + err.message);
    }
    if (done % 50 === 0 || i + 10 >= restorable.length) {
      console.log('  Restored ' + done + ' / ' + restorable.length);
    }
    await sleep(250);
  }

  console.log('');
  console.log('Done.');
  console.log('  Listings restored: ' + done);
  console.log('  Listings failed:   ' + failed);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
