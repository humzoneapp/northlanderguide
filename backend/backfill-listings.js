/* ==================================================================
   THE NORTHLANDER WAYFINDER - BACKFILL ENRICHMENT
   ------------------------------------------------------------------
   One-shot script that walks every Active Listings row and runs the
   same auto-enrichment routine used by the single-row webhook path,
   but in "only fill empty fields" mode so human-edited content is
   never overwritten. Each touched row is marked Needs Review = true,
   which the listings sync now filters out, so backfilled content
   never goes live until the admin unchecks Needs Review.

   USAGE
     node backend/backfill-listings.js --dry-run
       Prints eligible count and a small sample. No writes.

     node backend/backfill-listings.js
       Runs enrichment on every eligible row. Sequential, with a
       small pause between rows to stay polite to Google + Anthropic.

     node backend/backfill-listings.js --limit 25
       Caps the run at N rows. Useful for spot-checking the pipeline
       before committing the full backfill.

     node backend/backfill-listings.js --needs-review --force-claude
       Re-runs Claude on every Active row that already has
       Needs Review = true (i.e. the rows from a previous backfill
       batch). Skips Google Places writes and photos. Useful when the
       description prompt has been tightened and you want to refresh
       the AI fields on already-flagged rows before reviewing them.

   ELIGIBILITY
     Active = true AND NOT (Description filled AND Tag filled AND
     Best For filled). Rows where all three are filled are treated
     as either human-edited or already reviewed and are skipped.

   REQUIRED env vars (live mode)
     AIRTABLE_API_KEY, AIRTABLE_BASE_ID, GOOGLE_PLACES_KEY,
     ANTHROPIC_API_KEY
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
const TABLE = 'tblfVQcLjEv0a4sCJ';

const FIELD = {
  name: 'fldih5HMKh5O61HMh',
  stop: 'fldmyKFYFKHzOYYhf',
  description: 'fldTCRqsKiBc9rx1U',
  tag: 'fldhnP3Za9yDPeGPB',
  bestFor: 'flduCnaFSk17ZAu3O',
  needsReview: 'fldIqZXFMbMjdP40w'
};

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const NEEDS_REVIEW = argv.includes('--needs-review');
const FORCE_CLAUDE = argv.includes('--force-claude');
const LIMIT = (() => {
  const i = argv.indexOf('--limit');
  if (i >= 0 && argv[i + 1]) return Math.max(0, parseInt(argv[i + 1], 10) || 0);
  return null;
})();

if (!KEY || !BASE) {
  console.error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID');
  process.exit(1);
}

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

async function fetchRecords(formula) {
  const records = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('filterByFormula', formula);
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetchWithRetry(() => fetch(url, { headers: { Authorization: 'Bearer ' + KEY } }));
    if (!res.ok) throw new Error(`Airtable fetch failed: ${res.status}`);
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset;
    if (offset) await sleep(220);
  } while (offset);
  return records;
}

function isEligible(rec) {
  const f = rec.fields || {};
  const hasDesc = typeof f[FIELD.description] === 'string' && f[FIELD.description].trim().length > 0;
  const hasTag  = typeof f[FIELD.tag] === 'string' && f[FIELD.tag].length > 0;
  const hasBF   = Array.isArray(f[FIELD.bestFor]) && f[FIELD.bestFor].length > 0;
  return !(hasDesc && hasTag && hasBF);
}

function whichMissing(rec) {
  const f = rec.fields || {};
  const out = [];
  if (!(typeof f[FIELD.description] === 'string' && f[FIELD.description].trim().length > 0)) out.push('Description');
  if (!(typeof f[FIELD.tag] === 'string' && f[FIELD.tag].length > 0)) out.push('Tag');
  if (!(Array.isArray(f[FIELD.bestFor]) && f[FIELD.bestFor].length > 0)) out.push('Best For');
  return out;
}

(async () => {
  let all, eligible;
  if (NEEDS_REVIEW) {
    console.log('Fetching Active rows where Needs Review = true...');
    all = await fetchRecords('AND({Active}=TRUE(), {Needs Review}=TRUE())');
    /* In needs-review mode every fetched row is eligible because the
       point is to re-run on rows that were already flagged for review. */
    eligible = all.slice();
    console.log(`Active + Needs Review rows: ${all.length}`);
    console.log(`Eligible (all of them): ${eligible.length}`);
  } else {
    console.log('Fetching active Listings...');
    all = await fetchRecords('{Active}=TRUE()');
    eligible = all.filter(isEligible);
    console.log(`Active rows: ${all.length}`);
    console.log(`Eligible (missing one or more of Description, Tag, Best For): ${eligible.length}`);
    console.log(`Already complete (skipped): ${all.length - eligible.length}`);
  }

  /* Per-field breakdown so the operator can see whether most eligible
     rows are missing the description, the tag, the best-for, or some
     combination. Skipped in needs-review mode because those rows are
     all already filled by definition. */
  if (!NEEDS_REVIEW) {
    const missCount = { Description: 0, Tag: 0, 'Best For': 0 };
    for (const r of eligible) {
      for (const k of whichMissing(r)) missCount[k] += 1;
    }
    console.log('Missing field breakdown:');
    for (const k of Object.keys(missCount)) console.log(`  ${k}: ${missCount[k]}`);
  }

  console.log('\nFirst 10 eligible rows:');
  for (const r of eligible.slice(0, 10)) {
    const f = r.fields || {};
    const nm = f[FIELD.name] || '(no name)';
    const stop = f[FIELD.stop] || '(no stop)';
    const tail = NEEDS_REVIEW ? '' : `  [missing: ${whichMissing(r).join(', ')}]`;
    console.log(`  ${r.id}  ${stop.padEnd(18)} ${nm}${tail}`);
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN. No writes. Re-run without --dry-run to apply.');
    return;
  }

  /* Live mode: lazily require the enrichment module so dry-run never
     needs GOOGLE_PLACES_KEY or ANTHROPIC_API_KEY. */
  const { enrichRecord } = require('./enrich-listing.js');

  const todo = LIMIT != null ? eligible.slice(0, LIMIT) : eligible;
  console.log(`\nLive backfill: ${todo.length} rows.`);
  let ok = 0, skipped = 0, failed = 0;
  for (let i = 0; i < todo.length; i++) {
    const r = todo[i];
    const f = r.fields || {};
    const tag = `[${i + 1}/${todo.length}] ${r.id} ${f[FIELD.name] || ''}`;
    try {
      const result = await enrichRecord(r.id, { onlyFillEmpty: true, forceClaude: FORCE_CLAUDE });
      if (result.status === 'enriched') ok++;
      else { skipped++; console.log(`${tag} skipped: ${result.reason}`); }
    } catch (err) {
      failed++;
      console.warn(`${tag} FAILED: ${err.message}`);
    }
    /* Polite pause between rows. Google + Anthropic both have rate
       limits and we are not in a hurry. */
    await sleep(1500);
  }
  console.log(`\nBackfill complete. enriched=${ok} skipped=${skipped} failed=${failed}`);
})().catch(e => { console.error('BACKFILL FAILED:', e.message); process.exit(1); });
