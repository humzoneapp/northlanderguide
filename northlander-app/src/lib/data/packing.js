/* ==================================================================
   Cross-site packing-suggestion loader.

   The Guide publishes a window.DONT_FORGET_DATA array at
   https://northlanderguide.com/stop-pages-data.js, populated from
   the same Airtable that drives every stop page's Pack List
   section. The App picks the rows that match the trip's stops and
   surfaces them in the PackingPickerModal so users don't have to
   re-type "bug spray" on every trip.

   Same loader pattern as events.js: cross-origin <script> tag, no
   CORS dance, cached per session.
   ================================================================== */

const GUIDE_BASE = 'https://northlanderguide.com';
const DATA_URL = `${GUIDE_BASE}/stop-pages-data.js`;

let loadPromise = null;

/**
 * Resolve to the raw DONT_FORGET_DATA array from the Guide.
 * Cached for the lifetime of the page. Subsequent callers share
 * the same promise.
 */
export function loadPackingItems() {
  if (typeof window === 'undefined') {
    return Promise.resolve([]);
  }
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    /* Already loaded (events.js or another caller may have pulled
       it earlier). Reuse what's on window. */
    if (Array.isArray(window.DONT_FORGET_DATA)) {
      resolve(window.DONT_FORGET_DATA);
      return;
    }
    const script = document.createElement('script');
    script.src = DATA_URL;
    script.async = true;
    script.onload = () => {
      resolve(Array.isArray(window.DONT_FORGET_DATA) ? window.DONT_FORGET_DATA : []);
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Could not load packing suggestions from the Guide.'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

/* Normalize a stop name for loose matching. The Guide's DF rows say
   "Timmins" but our STOPS list calls it "Timmins-Porcupine"; first
   word match handles every current mismatch without a hand-curated
   aliases table. */
function firstWord(s) {
  return String(s || '').toLowerCase().split(/[-\s]/)[0];
}

/**
 * Filter the DF data down to items relevant to a given set of trip
 * stops, scoped to actual packable things.
 *
 * The Guide's DF data carries two flavours of "before you board"
 * row: stuff you put in a bag ("bug spray", "headlamp", "layers")
 * and stuff you remember to do/book ("Walk to Bracebridge Falls
 * from the station", "Book the Kidd Mine tour in advance"). On
 * a stop page both fit under the same "Before You Board" header,
 * but the App's PackingList is specifically a bag list, so we
 * drop the `Stop Specific` trigger (which is where the
 * activity-style rows live in Airtable). Universal rows
 * (`All Stops` / `Always Include`) and seasonal rows still pass.
 *
 * @param {Array} data
 * @param {string[]} stopNames - display names from STOPS[].name (unused
 *   for now since we no longer surface stop-specific rows; kept in the
 *   signature so callers don't have to change when we re-introduce
 *   per-stop suggestions)
 * @returns {Array}
 */
export function packingForStops(data, stopNames) {
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const row of data) {
    if (!row || !row.item) continue;
    const stop = row.stop || '';
    const trigger = row.triggerType || '';
    if (trigger === 'Stop Specific') continue;
    const isUniversal =
      stop === 'All Stops' ||
      !stop ||
      trigger === 'Always Include' ||
      /^Season:/i.test(trigger);
    if (isUniversal) {
      out.push(row);
    }
  }
  return out;
}

/* Sort: Essential first, then by triggerType (Always Include before
   Season before Stop Specific), then by stop, then by item name. */
const TRIGGER_RANK = {
  'Always Include': 0,
  'Season: Spring': 1,
  'Season: Summer': 2,
  'Season: Fall':   3,
  'Season: Winter': 4,
  'Stop Specific':  5
};
export function sortPackingItems(items) {
  return (items || []).slice().sort((a, b) => {
    const ap = a.priority === 'Essential' ? 0 : 1;
    const bp = b.priority === 'Essential' ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const at = TRIGGER_RANK[a.triggerType] ?? 9;
    const bt = TRIGGER_RANK[b.triggerType] ?? 9;
    if (at !== bt) return at - bt;
    const as = String(a.stop || '').localeCompare(String(b.stop || ''));
    if (as !== 0) return as;
    return String(a.item || '').localeCompare(String(b.item || ''));
  });
}

/* Group by triggerType so the modal can render section headers
   without re-implementing the grouping inline. Keys are the
   trigger labels; values are the items in their sorted order. */
export function groupPackingItems(items) {
  const map = new Map();
  for (const it of items || []) {
    const key = it.triggerType || 'Other';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  }
  return map;
}

/* Pretty section title for a triggerType. Avoids leaking the raw
   Airtable label "Season: Summer" into the UI. */
export function triggerLabel(t) {
  if (!t) return 'Other';
  if (t === 'Always Include') return 'For any trip';
  if (t === 'Stop Specific')  return 'For where you\'re going';
  /* Synthesized in-app group injected by PackingPickerModal when
     the weather forecast suggests gear (rain / snow / hot / cold). */
  if (t === '__weather') return 'For the forecast';
  const m = /^Season:\s*(.+)$/i.exec(t);
  if (m) return `For ${m[1].toLowerCase()} trips`;
  return t;
}
