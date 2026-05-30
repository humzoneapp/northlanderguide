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

/* When loaded as a module (require'd by backfill-listings.js) we expose
   enrichRecord() and do nothing else. The CLI entry below only runs
   when this file is executed directly. */
const IS_CLI = require.main === module;
const recordId = IS_CLI ? process.argv[2] : null;
if (IS_CLI && (!recordId || !/^rec[A-Za-z0-9]+$/.test(recordId))) {
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
  /* Only structured fields. editorial_summary and reviews are
     intentionally excluded because the house style requires Claude to
     write from verified Places data only, never from prose hearsay. */
  const fields = [
    'place_id', 'name', 'formatted_address', 'formatted_phone_number',
    'website', 'rating', 'price_level', 'opening_hours', 'geometry',
    'types', 'photos'
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

  const system = [
    "You write very short blurbs for a traveller's guide to places along the Ontario Northland Northlander train route in Northern Ontario.",
    "VOICE:",
    " - Write like a real person giving a friend a quick tip. Plain everyday words. Friendly and informative.",
    " - No flowery, salesy, or AI-marketing copy. Avoid words like 'thoughtful', 'curated', 'elevated', 'experience', 'destination', 'craft', 'artisanal', 'program', 'offering'.",
    " - No hooky openers, no editorialising. Just describe it the way a local would in one breath.",
    "LENGTH:",
    " - Aim for ONE sentence. Two short ones at most. Shorter is better. Fewer words is correct when you are unsure.",
    "STRICT FACT RULES (this is the most important section):",
    " - Use ONLY facts that come from the structured Places fields provided below: business name, address, the Google category type list, and rating. These are the only verified inputs.",
    " - Do NOT use reviews, editorial summaries, photos, or general knowledge about the business. Reviews are unverified user content and are not provided here for that reason.",
    " - SPECIFICALLY FORBIDDEN unless the detail is literally in the structured Places fields above:",
    "    * Decor or interior details. No 'stone walls', 'plush banquettes', 'rustic decor', 'cozy fireplace', 'industrial-chic', 'warm lighting'.",
    "    * Named or specific amenities. No 'Japanese spa', 'upscale martini bar', 'model train display', 'rooftop patio', 'wine cellar', 'kids' play area'.",
    "    * Exact numbers. No acreage, no square footage, no count of rooms, trails, dog areas, taps, seats.",
    "    * Who the place is 'popular with', 'great for', 'a favourite of', 'beloved by', 'frequented by'. Do not name an audience.",
    "    * Ambiance, atmosphere, vibe, mood, or character claims. No 'laid-back', 'cozy', 'lively', 'romantic', 'upscale', 'casual', 'family-friendly', 'authentic'.",
    "    * Invented dishes, signature items, specialties, or 'serving X' specifics unless the category type itself implies it (an 'italian_restaurant' category supports 'Italian restaurant', but not 'serving handmade pasta').",
    "    * Owner stories, staff details, family history, training, motivations, backstory. Even if a review hints at it, ignore it.",
    "    * Superlatives. No 'best', 'most authentic', 'famous', 'legendary', 'iconic', 'beloved', 'a must-visit'.",
    " - When unsure about any specific detail, leave it out. A shorter, plainer description is correct. 'Italian restaurant serving traditional dishes' is better than inventing the room.",
    "STYLE RULES:",
    " - Skip distances and walk times because the card already shows them.",
    " - Skip opening hours because the card already shows them.",
    " - Avoid 'perfect for' and 'a must-visit'. Do not begin with 'This place'.",
    " - NEVER use em dashes or en dashes. Use commas, periods, or sentence breaks instead. The house style forbids them entirely.",
    "TARGET EXAMPLES (this is the voice, length and strictness we want):",
    " - 'Italian restaurant serving traditional dishes.'",
    " - 'Downtown hotel with suites and a spa.'",
    " - 'Local park with walking trails and picnic spots.'",
    " - 'Bagel bakery serving breakfast and sandwiches.'"
  ].join('\n');

  /* The only inputs Claude sees are the structured Places fields. We
     deliberately do NOT include editorial_summary or reviews because
     they are the source of decor, ambiance, and "popular with" claims
     the house style forbids. */
  const user = "Write three things for this business: a description, one tag, and a list of Best For tags.\n\n"
    + 'STRUCTURED PLACES DATA (these are the only verified facts you may use):\n'
    + '  Business name: ' + ctx.name + '\n'
    + '  Address: ' + ctx.address + '\n'
    + '  Google category types: ' + (ctx.types || []).join(', ') + '\n'
    + '  Rating: ' + (ctx.rating == null ? 'unknown' : ctx.rating) + '\n'
    + (ctx.priceLevel != null ? '  Price level (0-4, higher is pricier): ' + ctx.priceLevel + '\n' : '')
    + '\n'
    + 'TAG - pick exactly ONE name from this list. Return null if none clearly fit. Do not invent.\n'
    + tagBullets + '\n\n'
    + 'BEST FOR - pick up to FOUR names from this list that genuinely apply. Be conservative: only pick a tag if the category type plainly supports it. Do not infer audience from address, name, or rating. Return an empty array if none clearly fit.\n'
    + bfBullets + '\n\n'
    + 'Description rules:\n'
    + '- ONE sentence ideally. Two short ones absolute max. Shorter is better.\n'
    + '- Plain, friendly, like a friend giving a quick tip. No marketing words, no flourishes.\n'
    + '- Use ONLY the structured Places fields above. No decor, no named amenities, no exact numbers, no audience claims, no ambiance, no invented dishes or specialties, no superlatives.\n'
    + '- If the category is generic (just "restaurant"), the description should be generic too. Do not invent cuisine, signature items, or atmosphere to fill space.\n'
    + '- No distances, no walk times, no opening hours.\n'
    + "- When unsure, stay general or leave it out. Fewer words is correct.\n"
    + "- Target examples: 'Italian restaurant serving traditional dishes.' | 'Downtown hotel with suites and a spa.' | 'Local park with walking trails and picnic spots.' | 'Bagel bakery serving breakfast and sandwiches.'\n\n"
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

/* ==================================================================
   Core entry point. Returns:
     { status: 'enriched', updated: <count> }
     { status: 'skipped', reason: '...' }   (in backfill mode)
   The single-row webhook path calls this with no opts.
   The backfill path calls this with { onlyFillEmpty: true } so it
   never overwrites human-edited Description/Tag/Best For and never
   touches Google Places facts that are already populated.
   ================================================================== */
async function enrichRecord(recordId, opts) {
  opts = opts || {};
  const onlyFillEmpty = opts.onlyFillEmpty === true;
  const forceClaude = opts.forceClaude === true;
  console.log('Enriching record', recordId,
    forceClaude ? '[force-claude]' : (onlyFillEmpty ? '[backfill]' : ''));

  /* 1. fetch record */
  const rec = await airtableGet(`${TABLE}/${recordId}`);
  const f = rec.fields || {};
  const name = (f[FIELD.name] || f['Business Name'] || '').trim();
  const address = (f[FIELD.address] || f['Address'] || '').trim();
  if (!name || !address) {
    if (onlyFillEmpty) return { status: 'skipped', reason: 'missing name or address' };
    console.error('Business Name and Address are required');
    process.exit(1);
  }

  /* Backfill gate: skip rows where Description, Tag, and Best For are
     all already populated. Those are either human-edited or already
     reviewed, and we must not touch them. forceClaude bypasses the
     gate for an explicit rewrite of the AI fields only. */
  const hasDesc = typeof f[FIELD.description] === 'string' && f[FIELD.description].trim().length > 0;
  const hasTag  = typeof f[FIELD.tag] === 'string' && f[FIELD.tag].length > 0;
  const hasBF   = Array.isArray(f[FIELD.bestFor]) && f[FIELD.bestFor].length > 0;
  if (onlyFillEmpty && !forceClaude && hasDesc && hasTag && hasBF) {
    return { status: 'skipped', reason: 'all three fields already filled' };
  }

  const updates = {};

  /* setIfEmpty: in backfill mode only write a field when it is currently
     blank in Airtable, so human-edited content is never overwritten. In
     the normal single-row webhook path this writes unconditionally. */
  const isTextEmpty = v => v == null || (typeof v === 'string' && v.trim().length === 0);
  const isNumEmpty  = v => v == null;
  const setIfEmpty = (fieldId, value, isEmptyFn) => {
    if (value == null) return;
    if (onlyFillEmpty) {
      const cur = f[fieldId];
      const empty = isEmptyFn ? isEmptyFn(cur) : (cur == null || cur === '');
      if (!empty) return;
    }
    updates[fieldId] = value;
  };

  /* 2 + 3. Google Find Place + Place Details.
     In forceClaude mode the row already has a cached place_id from the
     previous run, so reuse it to skip the findPlace call and stay
     cheaper. */
  let placeId = forceClaude && typeof f[FIELD.placeId] === 'string' && f[FIELD.placeId].length > 0
    ? f[FIELD.placeId]
    : null;
  if (!placeId) placeId = await findPlace(name + ', ' + address);
  let details = null;
  if (placeId) {
    setIfEmpty(FIELD.placeId, placeId, isTextEmpty);
    details = await placeDetails(placeId);
  }
  if (details) {
    if (details.formatted_address) setIfEmpty(FIELD.address, details.formatted_address, isTextEmpty);
    if (details.formatted_phone_number) setIfEmpty(FIELD.phone, details.formatted_phone_number, isTextEmpty);
    if (details.website) setIfEmpty(FIELD.website, details.website, isTextEmpty);
    if (typeof details.rating === 'number') setIfEmpty(FIELD.rating, details.rating, isNumEmpty);
    if (details.opening_hours) {
      const h = formatHours(details.opening_hours);
      if (h) setIfEmpty(FIELD.hours, h, isTextEmpty);
    }
    if (details.geometry && details.geometry.location) {
      setIfEmpty(FIELD.lat, details.geometry.location.lat, isNumEmpty);
      setIfEmpty(FIELD.lng, details.geometry.location.lng, isNumEmpty);
    }
  }

  /* 4. Walking distance + no-route deactivation.
     We resolve the effective lat/lng from either the new Places data or
     whatever is already on the row, so backfill rows whose lat/lng are
     pre-filled still get a walk-time check when missing. */
  let deactivated = false;
  const stopName = f[FIELD.stop] || f['Stop'];
  const stopId = STOP_ID[stopName];
  const station = STATION_COORDS[stopId];
  const effLat = updates[FIELD.lat] != null ? updates[FIELD.lat] : f[FIELD.lat];
  const effLng = updates[FIELD.lng] != null ? updates[FIELD.lng] : f[FIELD.lng];
  /* forceClaude skips the walking-time call entirely. Walking time was
     already set on the previous run and is not what we are rewriting. */
  const needWalk = !forceClaude && (!onlyFillEmpty || isNumEmpty(f[FIELD.walkMins]));
  if (station && effLat != null && effLng != null && needWalk) {
    const walk = await getWalk(station, effLat, effLng);
    if (walk && walk.walkMins != null) {
      setIfEmpty(FIELD.walkMins, walk.walkMins, isNumEmpty);
    } else if (!onlyFillEmpty) {
      /* Only flip Active off during a fresh enrichment. Backfill must
         never deactivate a row that is already live on the site. */
      updates[FIELD.active] = false;
      deactivated = true;
      console.log('no walkable route - deactivating');
    }
  } else if (!station) {
    console.warn(`Stop "${stopName}" not recognised, skipping walking distance`);
  }

  /* 5. Claude: description + tag + Best For.
     Skip the API call entirely in backfill mode when nothing is missing,
     to save credits. forceClaude always runs and always overwrites the
     three AI fields. */
  const needDesc = !hasDesc;
  const needTag  = !hasTag;
  const needBF   = !hasBF;
  const callAI = forceClaude || !onlyFillEmpty || needDesc || needTag || needBF;
  if (callAI) {
    try {
      const tagChoices = await choicesFor(FIELD.tag);
      const bfChoices = await choicesFor(FIELD.bestFor);
      const ai = await callClaude({
        name,
        address: updates[FIELD.address] || f[FIELD.address] || address,
        rating: updates[FIELD.rating] != null ? updates[FIELD.rating] : f[FIELD.rating],
        types: (details && details.types) || [],
        priceLevel: details && typeof details.price_level === 'number' ? details.price_level : null,
        tagChoices, bestForChoices: bfChoices
      });
      if (ai.description && typeof ai.description === 'string') {
        /* Safety net: even with the system prompt forbidding em dashes,
           scrub U+2014 (em) and U+2013 (en) characters from the output
           and replace with a comma + space so house style stays intact. */
        const clean = ai.description.trim()
          .replace(/\s*[—–]\s*/g, ', ')
          .replace(/, +/g, ', ');
        if (forceClaude || !onlyFillEmpty || needDesc) updates[FIELD.description] = clean;
      }
      if (ai.tag && tagChoices.indexOf(ai.tag) >= 0) {
        if (forceClaude || !onlyFillEmpty || needTag) updates[FIELD.tag] = ai.tag;
      }
      if (Array.isArray(ai.bestFor)) {
        const filtered = ai.bestFor.filter(b => bfChoices.indexOf(b) >= 0).slice(0, 4);
        if (filtered.length && (forceClaude || !onlyFillEmpty || needBF)) updates[FIELD.bestFor] = filtered;
      }
    } catch (err) {
      console.warn('Claude enrichment skipped:', err.message);
    }
  }

  /* 6. Mark review state. Any row we touched needs human review before
     it goes live, because the sync now filters Needs Review = true. */
  updates[FIELD.autoEnriched] = true;
  updates[FIELD.needsReview] = true;

  /* 7. PATCH record */
  await airtablePatch(recordId, updates);
  const updatedCount = Object.keys(updates).length;
  console.log(`updated ${updatedCount} fields | deactivated=${deactivated}`);

  /* 8. Photos: only upload when the row has no attachments yet, so
     backfill never overwrites curated photos. forceClaude skips photos
     entirely because that mode is for rewriting text fields only. */
  const existingPhotos = Array.isArray(f[FIELD.photos]) ? f[FIELD.photos] : [];
  const wantPhotos = !forceClaude && (!onlyFillEmpty || existingPhotos.length === 0);
  if (wantPhotos && details && Array.isArray(details.photos) && details.photos.length) {
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
  return { status: 'enriched', updated: updatedCount };
}

module.exports = { enrichRecord };

if (IS_CLI) {
  enrichRecord(recordId).catch(e => {
    console.error('ENRICHMENT FAILED:', e.message);
    process.exit(1);
  });
}
