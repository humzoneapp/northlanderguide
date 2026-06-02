/* ==================================================================
   Cross-site listings loader.
   Mirrors src/lib/data/events.js: the Guide already publishes a
   fresh window.LISTINGS_DATA at https://northlanderguide.com/listings-data.js
   so we inject it as a <script> tag (CORS-free for code execution),
   cache the parsed result per session, and let the AddPlanModal
   filter it by stop + category + search.
   ================================================================== */

const GUIDE_BASE = 'https://northlanderguide.com';
const LISTINGS_URL = `${GUIDE_BASE}/listings-data.js`;

let loadPromise = null;

/**
 * Resolve to `{ "stopId": { "category": [listing, ...], ... } }`
 * from the Guide. Cached for the page's lifetime; concurrent callers
 * share the same in-flight promise.
 */
export function loadListings() {
  if (typeof window === 'undefined') {
    return Promise.resolve({});
  }
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (window.LISTINGS_DATA && typeof window.LISTINGS_DATA === 'object') {
      resolve(window.LISTINGS_DATA);
      return;
    }
    const script = document.createElement('script');
    script.src = LISTINGS_URL;
    script.async = true;
    script.onload = () => resolve(window.LISTINGS_DATA || {});
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Could not load listings from the Guide.'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

/* The Guide groups listings by these category keys. The app maps
   each to one of our five booking kinds so the AddPlanModal kind
   tabs translate cleanly. */
export const CATEGORY_MAP = {
  restaurants:    { kind: 'meal',     label: 'Eat',     icon: 'meal' },
  accommodations: { kind: 'room',     label: 'Sleep',   icon: 'room' },
  parks:          { kind: 'activity', label: 'Outside', icon: 'activity' },
  attractions:    { kind: 'activity', label: 'See',     icon: 'activity' },
  shops:          { kind: 'other',    label: 'Shop',    icon: 'other' },
  transportation: { kind: 'train',    label: 'Travel',  icon: 'train' }
};

/* Modal tabs - friendlier labels than the bare Guide categories
   plus an "All" pill that doesn't filter. Tabs group multiple
   categories under one label so the user sees "Do" instead of
   "Parks + Attractions". */
export const KIND_TABS = [
  { id: 'all',  label: 'All',   cats: Object.keys(CATEGORY_MAP) },
  { id: 'eat',  label: 'Eat',   cats: ['restaurants'] },
  { id: 'stay', label: 'Sleep', cats: ['accommodations'] },
  { id: 'do',   label: 'Do',    cats: ['parks', 'attractions'] },
  { id: 'shop', label: 'Shop',  cats: ['shops'] }
];

/** Map a Guide category key to its booking kind. */
export function categoryToKind(catKey) {
  return (CATEGORY_MAP[catKey] && CATEGORY_MAP[catKey].kind) || 'other';
}

/* Stable key for dedupe between the modal and the bookings table.
   Combines the stop slug with a slug of the listing name so a
   given Guide listing always maps to the same key. */
export function listingKeyFor(stopId, name) {
  const slug = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${stopId}|${slug}`;
}

/**
 * Flatten the listings under a set of stop ids and a set of
 * Guide categories. Preserves Guide order so featured rows stay
 * near the top of their stop bucket.
 *
 * @param {Record<string, Record<string, Array>>} data
 * @param {string[]} stopIds
 * @param {string[]} catKeys
 * @returns {Array<{ stopId: string, catKey: string, listing: any }>}
 */
export function flattenListings(data, stopIds, catKeys) {
  if (!data || !Array.isArray(stopIds) || !Array.isArray(catKeys)) return [];
  const out = [];
  for (const stopId of stopIds) {
    const stopBucket = data[stopId];
    if (!stopBucket) continue;
    for (const catKey of catKeys) {
      const arr = stopBucket[catKey];
      if (!Array.isArray(arr)) continue;
      for (const listing of arr) {
        if (!listing || !listing.name) continue;
        out.push({ stopId, catKey, listing });
      }
    }
  }
  return out;
}

/** Case-insensitive substring match against name + description +
    address + category. Returns the same flattened shape. */
export function searchListings(rows, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(({ listing, catKey }) => {
    const haystack = [
      listing.name,
      listing.desc,
      listing.address,
      listing.category,
      CATEGORY_MAP[catKey] && CATEGORY_MAP[catKey].label
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** First photo URL for a listing - listings-data.js carries either
    `image` (single string) or `images` (array) plus an optional
    `photos` fallback for very fresh rows from Airtable. */
export function listingImage(listing) {
  if (!listing) return '';
  if (typeof listing.image === 'string' && listing.image) {
    return absUrl(listing.image);
  }
  if (Array.isArray(listing.images) && listing.images.length > 0) {
    return absUrl(listing.images[0]);
  }
  if (Array.isArray(listing.photos) && listing.photos.length > 0) {
    return absUrl(listing.photos[0]);
  }
  return '';
}

function absUrl(p) {
  const s = String(p || '');
  if (/^https?:\/\//.test(s)) return s;
  return `${GUIDE_BASE}/${s.replace(/^\/+/, '')}`;
}

/** Build a deep link to the listing on the Guide. */
export function listingGuideUrl(stopId, listing) {
  if (!stopId) return GUIDE_BASE;
  if (listing && listing.name) {
    const slug = listingKeyFor(stopId, listing.name).split('|')[1];
    return `${GUIDE_BASE}/stops/${stopId}#${slug}`;
  }
  return `${GUIDE_BASE}/stops/${stopId}`;
}
