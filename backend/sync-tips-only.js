/* ==================================================================
   THE NORTHLANDER WAYFINDER - FAST APPROVED-TIPS SYNC
   ------------------------------------------------------------------
   A partial sync that ONLY refreshes the window.STOP_TIPS_DATA section
   of site/stop-pages-data.js. Designed to be called by the
   tip-approved repository_dispatch workflow so an approved tip shows up
   on the corkboard within seconds, without re-fetching listings, stop
   pages, fun facts, FAQs or packing items.

   USAGE
     env AIRTABLE_API_KEY=... AIRTABLE_BASE_ID=... node backend/sync-tips-only.js
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
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const STOP_TIPS_TABLE = 'tbluHMNsRouU4RbE6';

if (!API_KEY || !BASE_ID) {
  console.error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID');
  process.exit(1);
}

const STOP_PAGES_FILE = path.join(__dirname, '..', 'site', 'stop-pages-data.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = v => (v == null || v === '') ? null : (isNaN(Number(v)) ? null : Number(v));

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

function writeAtomic(filePath, content, marker, minBytes) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content);
  const size = fs.statSync(tmp).size;
  if (size < minBytes || !content.includes(marker)) {
    try { fs.unlinkSync(tmp); } catch (e) {}
    throw new Error(`Generated file failed validation: size=${size}, marker present=${content.includes(marker)}`);
  }
  fs.renameSync(tmp, filePath);
  return size;
}

async function fetchAllApprovedTips() {
  const records = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${STOP_TIPS_TABLE}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('filterByFormula', '{Approved}=TRUE()');
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

(async () => {
  if (!fs.existsSync(STOP_PAGES_FILE)) {
    console.error(`Refusing to run: ${STOP_PAGES_FILE} does not exist. The full sync must run first.`);
    process.exit(1);
  }

  const recs = await fetchAllApprovedTips();
  const stopTips = recs.map(r => {
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

  const existing = fs.readFileSync(STOP_PAGES_FILE, 'utf8');
  /* The STOP_TIPS_DATA assignment is the last window.* in the file and
     its array ends with "\n];" at column 0. Match that exactly so a
     tip string containing ];  inline cannot confuse the regex. */
  const pattern = /window\.STOP_TIPS_DATA = \[[\s\S]*?\n\];/;
  const replacement = 'window.STOP_TIPS_DATA = ' + JSON.stringify(stopTips, null, 2) + ';';

  if (!pattern.test(existing)) {
    console.error('Could not find window.STOP_TIPS_DATA section in stop-pages-data.js. Run the full sync first.');
    process.exit(1);
  }
  const updated = existing.replace(pattern, replacement);

  if (!updated.includes('window.STOP_PAGES_DATA') || !updated.includes('window.STOP_TIPS_DATA')) {
    console.error('Updated file failed validation. Aborting.');
    process.exit(1);
  }

  const size = writeAtomic(STOP_PAGES_FILE, updated, 'window.STOP_TIPS_DATA', 1000);
  console.log(`TIPS SYNC COMPLETE: ${stopTips.length} approved tips written to ${STOP_PAGES_FILE} (${Math.round(size / 1024)}kb)`);
})().catch(e => { console.error('TIPS SYNC FAILED:', e.message); process.exit(1); });
