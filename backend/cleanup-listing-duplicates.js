/* ==================================================================
   cleanup-listing-duplicates.js

   Removes Photos attachments whose filename starts with "place-photo"
   from every Listings row in the live Guide base. These were the
   duplicate copies that landed alongside the original photos when
   Google Places auto-fetched a second set under generic filenames
   (place-photo-1.jpg etc.). The originals carry stop-prefixed names
   like "union-accommodations-10-0.jpg" and stay untouched.

   Direction (paranoid statement, read this first):
     TARGET:     appMpzW7Xo5nYOos9  (Northlander Guide, live)
     TABLE:      tblfVQcLjEv0a4sCJ  (Listings)
     FIELD:      fldmdVR0kuIzVxe9q  (Photos attachment field)

   Per-listing behaviour:
     - Filter Photos to drop entries whose filename starts with the
       prefix "place-photo" (case-insensitive).
     - If filtering leaves the row with ZERO photos, skip and log the
       record id (so we never accidentally clear a listing whose
       photos are ALL place-photo entries).
     - If filtering leaves the row UNCHANGED (no place-photo present),
       skip silently.
     - Otherwise PATCH the Photos field with the remaining attachments
       referenced by their existing attachment IDs (`[{ id: 'attXXX' }]`),
       which preserves them in place without re-uploading.

   Usage:
     node backend/cleanup-listing-duplicates.js --dry-run
       Reads, plans, logs counts. NO writes.

     node backend/cleanup-listing-duplicates.js
       Same plan, then writes the cleaned-up Photos arrays.

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

const BASE         = 'appMpzW7Xo5nYOos9';      // Guide live
const TABLE_ID     = 'tblfVQcLjEv0a4sCJ';      // Listings
const PHOTOS_FIELD = 'fldmdVR0kuIzVxe9q';      // Photos attachment field
const DUPLICATE_PREFIX = 'place-photo';        // filename pattern to drop

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

function isDuplicate(att) {
  const name = String(att && att.filename || '').toLowerCase();
  return name.startsWith(DUPLICATE_PREFIX);
}

/* Read every record that has at least one photo. We pull the full
   Photos field with `returnFieldsByFieldId=true` so the response is
   keyed by field ID (Airtable defaults to field names, which silently
   produces zero matches when looking up by ID). */
async function readListingsWithPhotos() {
  const all = [];
  let offset;
  do {
    const params = new URLSearchParams();
    params.append('fields[]', PHOTOS_FIELD);
    params.append('returnFieldsByFieldId', 'true');
    params.append('pageSize', '100');
    if (offset) params.append('offset', offset);
    const data = await airtable('GET', BASE, '/' + TABLE_ID + '?' + params.toString());
    for (const rec of data.records) {
      const photos = rec.fields[PHOTOS_FIELD];
      if (Array.isArray(photos) && photos.length > 0) {
        all.push({ id: rec.id, photos });
      }
    }
    offset = data.offset;
    await sleep(220);
  } while (offset);
  return all;
}

/* Write a batch of records. Each entry is { id, keepAttachmentIds }.
   PATCH replaces the Photos field with the listed attachment IDs
   only (Airtable interprets `[{ id }]` as "keep these existing
   attachments and drop the rest"). */
async function writeBatch(batch) {
  const body = {
    records: batch.map((r) => ({
      id: r.id,
      fields: { [PHOTOS_FIELD]: r.keepAttachmentIds.map((id) => ({ id })) }
    })),
    typecast: false
  };
  await airtable('PATCH', BASE, '/' + TABLE_ID, body);
}

(async () => {
  console.log(DRY_RUN ? '*** DRY RUN - no writes will be made ***' : 'LIVE RUN - duplicates will be deleted.');
  console.log('Reading listings with photos from Guide (' + BASE + ')...');
  const rows = await readListingsWithPhotos();
  console.log('  Found ' + rows.length + ' listings with at least one photo.');

  let totalBefore = 0;
  let totalAfter = 0;
  const willPatch = [];
  const skipUnchanged = [];
  const skipEmptyAfter = [];

  for (const r of rows) {
    totalBefore += r.photos.length;
    const kept = r.photos.filter((p) => !isDuplicate(p));
    const dropped = r.photos.length - kept.length;

    if (dropped === 0) {
      /* No place-photo entries present, nothing to do. */
      skipUnchanged.push(r);
      totalAfter += r.photos.length;
      continue;
    }

    if (kept.length === 0) {
      /* All photos on this row are place-photo entries. Skip rather
         than empty the row out - the user can review manually. */
      skipEmptyAfter.push(r);
      totalAfter += r.photos.length;
      continue;
    }

    willPatch.push({
      id: r.id,
      keepAttachmentIds: kept.map((p) => p.id),
      droppedCount: dropped
    });
    totalAfter += kept.length;
  }

  const droppedTotal = totalBefore - totalAfter;

  console.log('');
  console.log('Plan:');
  console.log('  Listings with photos:                ' + rows.length);
  console.log('  Listings to clean up:                ' + willPatch.length);
  console.log('  Listings skipped (no duplicates):    ' + skipUnchanged.length);
  console.log('  Listings skipped (all duplicates):   ' + skipEmptyAfter.length);
  console.log('  Total attachments before:            ' + totalBefore);
  console.log('  Total attachments to drop:           ' + droppedTotal);
  console.log('  Total attachments after:             ' + totalAfter);
  console.log('');

  if (skipEmptyAfter.length > 0) {
    console.log('Listings where every photo is a duplicate (skipped, please review):');
    for (const r of skipEmptyAfter.slice(0, 10)) console.log('  ' + r.id);
    if (skipEmptyAfter.length > 10) console.log('  ... and ' + (skipEmptyAfter.length - 10) + ' more');
    console.log('');
  }

  if (DRY_RUN) {
    console.log('Dry run complete. Re-run without --dry-run to actually write.');
    return;
  }

  if (willPatch.length === 0) {
    console.log('Nothing to write.');
    return;
  }

  console.log('Writing cleaned-up Photos arrays in batches of 10...');
  let done = 0;
  let failed = 0;
  for (let i = 0; i < willPatch.length; i += 10) {
    const batch = willPatch.slice(i, i + 10);
    try {
      await writeBatch(batch);
      done += batch.length;
    } catch (err) {
      failed += batch.length;
      console.error('  Batch starting at index ' + i + ' failed: ' + err.message);
    }
    if (done % 50 === 0 || i + 10 >= willPatch.length) {
      console.log('  Cleaned ' + done + ' / ' + willPatch.length);
    }
    await sleep(250);
  }

  console.log('');
  console.log('Done.');
  console.log('  Listings cleaned: ' + done);
  console.log('  Listings failed:  ' + failed);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
