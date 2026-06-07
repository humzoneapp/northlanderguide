/* ==================================================================
   Weather forecast.

   Open-Meteo (open-meteo.com) is free, no API key, and serves daily
   forecasts up to 16 days out for any lat/lng. We hit it once per
   (stop, date) pair and cache the result in sessionStorage so a
   visitor flipping between chapters doesn't burn the rate limit.

   Returns null when the date is outside the 16-day window or when
   the network call fails - callers should treat the strip as
   purely additive, never blocking.
   ================================================================== */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY_PREFIX = 'nl-weather:';
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours - forecasts move slowly

/* WMO weather codes -> palette-friendly label + a tiny inline SVG
   glyph kept compact for the scene-head meta row. Glyphs trace the
   editorial vocabulary used elsewhere (currentColor strokes, no
   fills, 16x16 viewbox). */
const WMO = {
  0:  { label: 'Clear',         glyph: 'sun' },
  1:  { label: 'Mostly clear',  glyph: 'sun-cloud' },
  2:  { label: 'Partly cloudy', glyph: 'sun-cloud' },
  3:  { label: 'Overcast',      glyph: 'cloud' },
  45: { label: 'Foggy',         glyph: 'fog' },
  48: { label: 'Icy fog',       glyph: 'fog' },
  51: { label: 'Light drizzle', glyph: 'rain' },
  53: { label: 'Drizzle',       glyph: 'rain' },
  55: { label: 'Heavy drizzle', glyph: 'rain' },
  61: { label: 'Light rain',    glyph: 'rain' },
  63: { label: 'Rain',          glyph: 'rain' },
  65: { label: 'Heavy rain',    glyph: 'rain' },
  66: { label: 'Freezing rain', glyph: 'rain' },
  67: { label: 'Freezing rain', glyph: 'rain' },
  71: { label: 'Light snow',    glyph: 'snow' },
  73: { label: 'Snow',          glyph: 'snow' },
  75: { label: 'Heavy snow',    glyph: 'snow' },
  77: { label: 'Snow grains',   glyph: 'snow' },
  80: { label: 'Showers',       glyph: 'rain' },
  81: { label: 'Showers',       glyph: 'rain' },
  82: { label: 'Heavy showers', glyph: 'rain' },
  85: { label: 'Snow showers',  glyph: 'snow' },
  86: { label: 'Snow showers',  glyph: 'snow' },
  95: { label: 'Thunderstorm',  glyph: 'storm' },
  96: { label: 'Thunderstorm',  glyph: 'storm' },
  99: { label: 'Thunderstorm',  glyph: 'storm' }
};

export function labelForCode(code) {
  return WMO[code]?.label || '';
}
export function glyphForCode(code) {
  return WMO[code]?.glyph || 'cloud';
}

/* Date in the user's local timezone, YYYY-MM-DD. */
function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* Open-Meteo forecasts are only reliable for the next ~16 days.
   Beyond that we skip the call - showing a forecast in October for
   a trip in May would mislead the user. */
function withinForecastWindow(targetDate) {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return false;
  const [y, m, d] = targetDate.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = Date.now();
  const diffDays = (target - now) / (24 * 60 * 60 * 1000);
  return diffDays >= -1 && diffDays <= 16;
}

function cacheKeyFor(lat, lng, date) {
  return `${CACHE_KEY_PREFIX}${lat.toFixed(3)},${lng.toFixed(3)},${date}`;
}

function readCache(key) {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { at, payload } = JSON.parse(raw);
    if (Date.now() - at > TTL_MS) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function writeCache(key, payload) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), payload }));
  } catch (_) {
    /* Quota exceeded or third-party cookies blocked - silent skip. */
  }
}

/* Fetch daily forecast for a single stop on a single date. Returns
   `{ tempMax, tempMin, code, label, glyph }` or null. The caller is
   expected to render nothing when it's null. */
export async function getWeatherFor(lat, lng, date) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const day = date || todayLocal();
  if (!withinForecastWindow(day)) return null;

  const key = cacheKeyFor(lat, lng, day);
  const cached = readCache(key);
  if (cached) return cached;

  /* Skip fetch entirely when the browser knows it's offline.
     Returns a sentinel so the caller can render an honest "weather
     unavailable offline" message instead of nothing. */
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { offline: true };
  }

  const url = `${ENDPOINT}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${day}&end_date=${day}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const json = await res.json();
    const daily = json?.daily;
    if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) return null;
    const code = Number(daily.weather_code?.[0]);
    const payload = {
      tempMax: Math.round(Number(daily.temperature_2m_max?.[0])),
      tempMin: Math.round(Number(daily.temperature_2m_min?.[0])),
      code,
      label: labelForCode(code),
      glyph: glyphForCode(code)
    };
    if (Number.isNaN(payload.tempMax) || Number.isNaN(payload.tempMin)) return null;
    writeCache(key, payload);
    return payload;
  } catch (_) {
    return null;
  }
}
