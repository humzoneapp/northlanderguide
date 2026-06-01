/* ==================================================================
   Walking distance helpers - no Google APIs, no costs.

   Strategy:
   - Listings already carry lat/lng from past enrichment, so the
     walk-time estimate is a straight Haversine distance plus a
     small detour + pacing factor. Runs in microseconds. Free.
   - Events are submitted with a postal address but no coordinates.
     For those we hit OpenStreetMap's free Nominatim geocoder
     (1 req/sec, attribution required), then take the same
     Haversine path home.

   Accuracy: comfortably within +/- 2-3 minutes of Google Distance
   Matrix's walking-mode answer for the small-town stops on the
   Northlander route. More than enough for an "X min walk from the
   station" badge.
   ================================================================== */

/* Average urban detour factor: actual walking path is roughly 1.2-1.3x
   the great-circle distance in dense grids, less in small towns. 1.25
   is a comfortable middle. Combined with 13 min/km (about 4.6 km/h,
   the leisurely walking pace), the formula slightly overestimates so
   we don't promise users a tighter walk than they'll get. */
const DETOUR_FACTOR = 1.25;
const MIN_PER_KM = 13;

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'NorthlanderGuide/1.0 (https://northlanderguide.com)';

/** Great-circle distance between two coordinates in kilometres. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Walking-time estimate in whole minutes between two coordinates.
 * Returns null when any coord is missing. Floors at 1 minute so we
 * never render a "0 min walk" badge that looks broken.
 */
function walkMinsBetween(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const n = Number(lat1) + Number(lng1) + Number(lat2) + Number(lng2);
  if (Number.isNaN(n)) return null;
  const km = haversineKm(Number(lat1), Number(lng1), Number(lat2), Number(lng2));
  return Math.max(1, Math.round(km * DETOUR_FACTOR * MIN_PER_KM));
}

/**
 * Free geocode via OpenStreetMap Nominatim. Returns { lat, lng } or
 * null. Callers MUST throttle to <= 1 request per second per
 * Nominatim's usage policy.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
async function geocodeNominatim(address) {
  if (!address || typeof address !== 'string') return null;
  const q = address.trim();
  if (!q) return null;
  try {
    const url =
      NOMINATIM_BASE +
      '?q=' +
      encodeURIComponent(q) +
      '&format=json&limit=1&addressdetails=0&countrycodes=ca';
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
    });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const lat = parseFloat(arr[0].lat);
    const lng = parseFloat(arr[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  } catch (err) {
    return null;
  }
}

module.exports = {
  haversineKm,
  walkMinsBetween,
  geocodeNominatim,
  DETOUR_FACTOR,
  MIN_PER_KM
};
