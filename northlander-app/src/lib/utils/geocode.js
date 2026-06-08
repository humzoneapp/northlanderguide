/* ==================================================================
   Browser-side geocoder.

   Resolves a free-text address ("123 Main Street, Bracebridge") to a
   {lat, lng} pair via OpenStreetMap's Nominatim service. Cached in
   sessionStorage so the same address doesn't hit the network twice
   per visit - even a quick flip between chapters reuses results.

   Nominatim asks callers to keep request rate <= 1/s and to use a
   descriptive User-Agent. We can't set UA from the browser, but the
   per-session cache + the fact that each chapter geocodes only a
   handful of addresses keeps us well under their threshold.

   Resolves null on a miss / network error so callers can simply
   filter for non-null results.
   ================================================================== */

const CACHE_PREFIX = 'nl-geocode:';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

function readCache(query) {
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + query);
    if (!raw) return undefined;
    const { at, payload } = JSON.parse(raw);
    if (Date.now() - at > TTL_MS) return undefined;
    return payload;
  } catch (_) {
    return undefined;
  }
}
function writeCache(query, payload) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(CACHE_PREFIX + query, JSON.stringify({ at: Date.now(), payload }));
  } catch (_) {
    /* Quota exceeded - silently drop the cache write. */
  }
}

/** Geocode a single address. Returns `{lat, lng}` or null. */
export async function geocode(address) {
  const query = String(address || '').trim();
  if (!query) return null;

  const cached = readCache(query);
  if (cached !== undefined) return cached;

  const url = `${ENDPOINT}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' }
    });
    if (!res.ok) {
      writeCache(query, null);
      return null;
    }
    const json = await res.json();
    const hit = Array.isArray(json) ? json[0] : null;
    if (!hit) {
      writeCache(query, null);
      return null;
    }
    const payload = {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon)
    };
    if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) {
      writeCache(query, null);
      return null;
    }
    writeCache(query, payload);
    return payload;
  } catch (_) {
    /* Network error - don't cache so we'll retry next time. */
    return null;
  }
}

/** Geocode several addresses in parallel. Returns an array of
    `{lat, lng}|null` in the same order as the input. */
export async function geocodeMany(addresses) {
  return Promise.all((addresses || []).map((a) => geocode(a)));
}
