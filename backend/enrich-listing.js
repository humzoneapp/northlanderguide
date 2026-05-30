/* ==================================================================
   THE NORTHLANDER WAYFINDER - AUTO-ENRICH A NEW LISTING
   ------------------------------------------------------------------
   Runs once per new Listings row that has Business Name + Address but
   has not been Auto-enriched yet. Pulls structured facts from Google
   Places, the walking distance from Distance Matrix, and a description
   + Tag + Best For from Claude, then ticks Auto-enriched + Needs Review
   so the admin can vet the row before it goes live.

   USAGE
     node backend/enrich-listing.js <recordId>

   REQUIRED env vars
     AIRTABLE_API_KEY
     AIRTABLE_BASE_ID
     GOOGLE_PLACES_KEY
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
const GKEY = process.env.GOOGLE_PLACES_KEY;
const CKEY = process.env.ANTHROPIC_API_KEY;
const TABLE = 'tblfVQcLjEv0a4sCJ';

if (!KEY || !BASE || !GKEY || !CKEY) {
  console.error('Missing one of: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, GOOGLE_PLACES_KEY, ANTHROPIC_API_KEY');
  process.exit(1);
}

const recordId = process.argv[2];
if (!recordId || !/^rec[A-Za-z0-9]+$/.test(recordId)) {
  console.error('Usage: node backend/enrich-listing.js <recordId>');
  process.exit(1);
}

const FIELD = {
  name: 'fldih5HMKh5O61HMh',
  stop: 'fldmyKFYFKHzOYYhf',
  description: 'fldTCRqsKiBc9rx1U',
  address: 'fldtBmMjbHHDdtUlV',
  phone: 'fldDH9fPVWo2zmkUz',
  website: 'fldMQ5wJE2TIGm7WM',
  rating: 'fldkJgaEuX7z2aQvx',
  hours: 'fldmtTI3OjGcxoSrx',
  walkMins: 'fld7mLkMzxGJVNJxr',
  lat: 'fld7h0S4J8A70XiXg',
  lng: 'fldxTXlzYovpPvWMI',
  active: 'fldNJFh7wOpBhjUh2',
  photos: 'fldmdVR0kuIzVxe9q',
  tag: 'fldhnP3Za9yDPeGPB',
  bestFor: 'flduCnaFSk17ZAu3O',
  placeId: 'fldjb3aaW4IXgvDG1',
  autoEnriched: 'fldiWBtlCcpiKQGK0',
  needsReview: 'fldIqZXFMbMjdP40w'
};

const STOP_ID = {
  'Toronto Union': 'union', 'Langstaff': 'langstaff', 'Gormley': 'gormley',
  'Washago': 'washago', 'Gravenhurst': 'gravenhurst', 'Bracebridge': 'bracebridge',
  'Huntsville': 'huntsville', 'South River': 'southriver', 'Temagami': 'temagami',
  'North Bay': 'northbay', 'Temiskaming Shores': 'temiskaming', 'Englehart': 'englehart',
  'Kirkland Lake': 'kirklandlake', 'Matheson': 'matheson', 'Timmins': 'timmins',
  'Cochrane': 'cochrane'
};
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

async function airtableGet(pathSuffix) {
  const res = await fetchWithRetry(() => fetch(`https://api.airtable.com/v0/${BASE}/${pathSuffix}`, {
    headers: { Authorization: 'Bearer ' + KEY }
  }));
  if (!res.ok) throw new Error(`airtable GET ${pathSuffix} ${res.status}`);
  return res.json();
}

async function airtablePatch(recId, fields) {
  const res = await fetchWithRetry(() => fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}/${recId}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  }));
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`airtable PATCH ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function getFieldChoices(fieldId) {
  const data = await airtableGet(`meta/bases/${BASE}/tables`).then(r => r); // ignored
  // Use the cached tables call below instead
  return [];
}

let _tablesCache = null;
async function tables() {
  if (_tablesCache) return _tablesCache;
  const res = await fetchWithRetry(() => fetch(`https://api.airtable.com/v0/meta/bases/${BASE}/tables`, {
    headers: { Authorization: 'Bearer ' + KEY }
  }));
  if (!res.ok) throw new Error(`meta tables ${res.status}`);
  _tablesCache = await res.json();
  return _tablesCache;
}

async function choicesFor(fieldId) {
  const data = await tables();
  const t = (data.tables || []).find(x => x.id === TABLE);
  const f = (t.fields || []).find(x => x.id === fieldId);
  return ((f && f.options && f.options.choices) || []).map(c => c.name);
}

async function findPlace(query) {
  const url = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
    + '?input=' + encodeURIComponent(query)
    + '&inputtype=textquery&fields=place_id&key=' + GKEY;
  const r = await fetchWithRetry(() => fetch(url));
  const d = await r.json();
  if (d.status === 'OK' && d.candidates && d.candidates[0]) return d.candidates[0].place_id;
  console.warn(`findplace status=${d.status} for "${query}"`);
  return null;
}

async function placeDetails(placeId) {
  const fields = [
    'place_id', 'name', 'formatted_address', 'formatted_phone_number',
    'website', 'rating', 'opening_hours', 'geometry', 'types',
    'editorial_summary', 'photos', 'reviews'
  ].join(',');
  const url = 'https://maps.googleapis.com/maps/api/place/details/json'
    + '?place_id=' + placeId
    + '&fields=' + fields
    + '&key=' + GKEY;
  const r = await fetchWithRetry(() => fetch(url));
  const d = await r.json();
  if (d.status !== 'OK') {
    console.warn(`placedetails status=${d.status}`);
    return null;
  }
  return d.result;
}

function formatHours(oh) {
  if (!oh || !Array.isArray(oh.weekday_text)) return null;
  // Compact form, single line, fits the Airtable text field.
  return oh.weekday_text.join(' | ').slice(0, 240);
}

async function getWalk(station, lat, lng) {
  try {
    const url = 'https://maps.googleapis.com/maps/api/distancematrix/json'
      + '?origins=' + station.lat + ',' + station.lng
      + '&destinations=' + lat + ',' + lng
      + '&mode=walking&key=' + GKEY;
    const r = await fetchWithRetry(() => fetch(url));
    const d = await r.json();
    const el = d.rows && d.rows[0] && d.rows[0].elements && d.rows[0].elements[0];
    if (d.status === 'OK' && el && el.status === 'OK' && el.duration) {
      return { walkMins: Math.round(el.duration.value / 60) };
    }
    return null;
  } catch (e) { return null; }
}

async function fetchPhoto(photoRef, maxwidth = 1200) {
  const url = 'https://maps.googleapis.com/maps/api/place/photo'
    + '?maxwidth=' + maxwidth
    + '&photo_reference=' + encodeURIComponent(photoRef)
    + '&key=' + GKEY;
  const r = await fetchWithRetry(() => fetch(url));
  if (!r.ok) throw new Error('photo fetch ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

async function uploadAttachment(recId, base64, filename) {
  const r = await fetchWithRetry(() => fetch(
    `https://content.airtable.com/v0/${BASE}/${recId}/${FIELD.photos}/uploadAttachment`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: 'image/jpeg', filename, file: base64 })
    }
  ));
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('uploadAttachment ' + r.status + ' ' + t.slice(0, 200));
  }
}

/* ---- Claude: write description + pick tag + pick Best For from
   the existing option lists only. ---- */
async function callClaude(ctx) {
  const tagBullets = ctx.tagChoices.map(t => '  - ' + t).join('\n');
  const bfBullets = ctx.bestForChoices.map(b => '  - ' + b).join('\n');

  const system = "You write short editorial descriptions for a traveller's guide to places along the Ontario Northland Northlander train route in Northern Ontario. Voice is warm, honest, and factual. You frame each place for a visitor who has arrived by train. You never invent details, brands, hours or experiences that are not in the source data. You skip distances or walk times because the card already shows them. You avoid generic phrases like 'perfect for' or 'a must-visit', and you do not begin with 'This place'.";

  const user = "Write three things for this business: a description, one tag, and a list of Best For tags.\n\n"
    + 'Business: ' + ctx.name + '\n'
    + 'Address: ' + ctx.address + '\n'
    + 'Google type categories: ' + (ctx.types || []).join(', ') + '\n'
    + 'Rating: ' + (ctx.rating == null ? 'unknown' : ctx.rating) + '\n'
    + 'Google editorial summary: ' + (ctx.editorialSummary || '(none)') + '\n'
    + 'Sample review excerpts (only as background, do not quote): '
    + (ctx.reviews && ctx.reviews.length
      ? ctx.reviews.map(r => '"' + (r.text || '').slice(0, 160).replace(/\s+/g, ' ').trim() + '"').join(' / ')
      : '(none)')
    + '\n\n'
    + 'TAG - pick exactly ONE name from this list. Return null if none clearly fit. Do not invent.\n'
    + tagBullets + '\n\n'
    + 'BEST FOR - pick up to FOUR names from this list that genuinely apply. Return an empty array if none fit. Do not invent.\n'
    + bfBullets + '\n\n'
    + 'Description rules:\n'
    + '- 30 to 45 words.\n'
    + '- Hooky opening, then factual specifics from the source data.\n'
    + "- Frame for a train traveller (someone arriving by Northlander) without naming the train.\n"
    + '- No distances, no walk times, no opening hours.\n'
    + "- No invented details. If you do not know something, do not say it.\n\n"
    + 'Return ONLY a JSON object, no surrounding text, no code fences:\n'
    + '{"description": "...", "tag": "..." or null, "bestFor": [ "...", "..." ]}';

  const res = await fetchWithRetry(() => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CKEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: user }]
    })
  }));
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('anthropic ' + res.status + ' ' + t.slice(0, 200));
  }
  const data = await res.json();
  const text = (data.content && data.content[0] && data.content[0].text) || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in Claude response');
  return JSON.parse(m[0]);
}

/* ================================================================== */
(async () => {
  console.log('Enriching record', recordId);

  /* 1. fetch record */
  const rec = await airtableGet(`${TABLE}/${recordId}`);
  const f = rec.fields || {};
  const name = (f[FIELD.name] || f['Business Name'] || '').trim();
  const address = (f[FIELD.address] || f['Address'] || '').trim();
  if (!name || !address) {
    console.error('Business Name and Address are required');
    process.exit(1);
  }

  /* 2 + 3. Google Find Place + Place Details */
  const updates = {};
  const placeId = await findPlace(name + ', ' + address);
  let details = null;
  if (placeId) {
    updates[FIELD.placeId] = placeId;
    details = await placeDetails(placeId);
  }
  if (details) {
    if (details.formatted_address) updates[FIELD.address] = details.formatted_address;
    if (details.formatted_phone_number) updates[FIELD.phone] = details.formatted_phone_number;
    if (details.website) updates[FIELD.website] = details.website;
    if (typeof details.rating === 'number') updates[FIELD.rating] = details.rating;
    if (details.opening_hours) {
      const h = formatHours(details.opening_hours);
      if (h) updates[FIELD.hours] = h;
    }
    if (details.geometry && details.geometry.location) {
      updates[FIELD.lat] = details.geometry.location.lat;
      updates[FIELD.lng] = details.geometry.location.lng;
    }
  }

  /* 4. Walking distance + no-route deactivation */
  let deactivated = false;
  const stopName = f[FIELD.stop] || f['Stop'];
  const stopId = STOP_ID[stopName];
  const station = STATION_COORDS[stopId];
  if (station && updates[FIELD.lat] != null && updates[FIELD.lng] != null) {
    const walk = await getWalk(station, updates[FIELD.lat], updates[FIELD.lng]);
    if (walk && walk.walkMins != null) {
      updates[FIELD.walkMins] = walk.walkMins;
    } else {
      updates[FIELD.active] = false;
      deactivated = true;
      console.log('no walkable route - deactivating');
    }
  } else if (!station) {
    console.warn(`Stop "${stopName}" not recognised, skipping walking distance`);
  }

  /* 5. Claude: description + tag + Best For */
  try {
    const tagChoices = await choicesFor(FIELD.tag);
    const bfChoices = await choicesFor(FIELD.bestFor);
    const ai = await callClaude({
      name,
      address: updates[FIELD.address] || address,
      rating: updates[FIELD.rating],
      types: (details && details.types) || [],
      editorialSummary: (details && details.editorial_summary && details.editorial_summary.overview) || '',
      reviews: (details && details.reviews) || [],
      tagChoices, bestForChoices: bfChoices
    });
    if (ai.description && typeof ai.description === 'string') {
      updates[FIELD.description] = ai.description.trim();
    }
    if (ai.tag && tagChoices.indexOf(ai.tag) >= 0) {
      updates[FIELD.tag] = ai.tag;
    }
    if (Array.isArray(ai.bestFor)) {
      const filtered = ai.bestFor.filter(b => bfChoices.indexOf(b) >= 0).slice(0, 4);
      if (filtered.length) updates[FIELD.bestFor] = filtered;
    }
  } catch (err) {
    console.warn('Claude enrichment skipped:', err.message);
  }

  /* 6. Mark review state */
  updates[FIELD.autoEnriched] = true;
  updates[FIELD.needsReview] = true;

  /* 7. PATCH record */
  await airtablePatch(recordId, updates);
  console.log(`updated ${Object.keys(updates).length} fields | deactivated=${deactivated}`);

  /* 8. Photos: fetch up to 3 from Place Details, upload to Airtable */
  if (details && Array.isArray(details.photos) && details.photos.length) {
    const refs = details.photos.slice(0, 3);
    for (let i = 0; i < refs.length; i++) {
      try {
        const buf = await fetchPhoto(refs[i].photo_reference);
        const b64 = buf.toString('base64');
        await uploadAttachment(recordId, b64, `place-photo-${i + 1}.jpg`);
        console.log(`photo ${i + 1}/${refs.length} uploaded`);
        await sleep(600);
      } catch (err) {
        console.warn(`photo ${i + 1} failed: ${err.message}`);
      }
    }
  }

  console.log('ENRICHMENT COMPLETE for', recordId);
})().catch(e => { console.error('ENRICHMENT FAILED:', e.message); process.exit(1); });
