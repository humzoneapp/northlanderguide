/* ==================================================================
   Northlander schedule helpers.
   MVP models both directions:
     - Northbound (Toronto Union to Cochrane, departure 09:00)
     - Southbound (Cochrane to Toronto Union, departure 09:00)
   Real Ontario Northland service runs on specific days; we don't
   enforce that yet so the user can plan around any date. The day of
   the week shows up in the UI for sanity, but we don't refuse to
   compute a time.
   ================================================================== */

/** Toronto Union to Cochrane in minutes (Cochrane's offset). */
export const ROUTE_TOTAL_MINUTES = 680;

export const NORTHBOUND_DEPARTURE = '09:00';
export const SOUTHBOUND_DEPARTURE = '09:00';

export const DIRECTIONS = [
  { id: 'northbound', label: 'Northbound', from: 'Toronto Union', to: 'Cochrane' },
  { id: 'southbound', label: 'Southbound', from: 'Cochrane',      to: 'Toronto Union' }
];

/** Default departure clock for a given direction. */
export function departureFor(direction) {
  return direction === 'southbound' ? SOUTHBOUND_DEPARTURE : NORTHBOUND_DEPARTURE;
}

/** Parse "HH:MM" 24-hour into minutes since midnight. */
function parseClock(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes since midnight to "9:00 AM" / "11:35 PM". Wraps midnight. */
export function formatClock(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '';
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  return `${h12}:${String(min).padStart(2, '0')} ${suffix}`;
}

/**
 * Travel minutes from the train's origin (where it departs) to the
 * stop with the given offsetMinutes. Northbound uses offsets as-is;
 * southbound reverses them against the total route length so Cochrane
 * becomes 0 and Toronto Union becomes ROUTE_TOTAL_MINUTES.
 */
export function travelMinutes(offsetMinutes, direction = 'northbound') {
  if (offsetMinutes == null) return null;
  if (direction === 'southbound') {
    return Math.max(0, ROUTE_TOTAL_MINUTES - Number(offsetMinutes));
  }
  return Number(offsetMinutes);
}

/**
 * Project an arrival clock at a stop.
 *
 * @param {number} offsetMinutes  - stop offset from Toronto Union
 * @param {string} [departure]    - "HH:MM" 24h local (default 09:00)
 * @param {'northbound'|'southbound'} [direction]
 * @returns {string} formatted clock, or '' on bad inputs
 */
export function arrivalClock(offsetMinutes, departure, direction = 'northbound') {
  const base = parseClock(departure || departureFor(direction));
  if (base == null) return '';
  const tm = travelMinutes(offsetMinutes, direction);
  if (tm == null) return '';
  return formatClock(base + tm);
}

/**
 * Arrival as raw minutes since midnight at the given stop. Returned as
 * a plain number so callers can compare a booking's HH:MM startTime
 * against it. Mirrors arrivalClock but skips the human formatting.
 *
 * @returns {number|null}
 */
export function arrivalMinutes(offsetMinutes, departure, direction = 'northbound') {
  const base = parseClock(departure || departureFor(direction));
  if (base == null) return null;
  const tm = travelMinutes(offsetMinutes, direction);
  if (tm == null) return null;
  return base + tm;
}

/** Public version of the internal HH:MM parser. Returns minutes since
    midnight or null for anything unparseable. */
export function clockToMinutes(hhmm) {
  return parseClock(hhmm);
}

/**
 * "Hh Mm" travel duration for compact display. The 0 case returns
 * "Departure" since the train is leaving from that very stop.
 */
export function travelDuration(offsetMinutes, direction = 'northbound') {
  const tm = travelMinutes(offsetMinutes, direction);
  if (tm == null) return '';
  if (tm === 0) return 'Departure';
  const h = Math.floor(tm / 60);
  const m = tm % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Format an ISO date string (YYYY-MM-DD) for human display. We
 * deliberately interpret the date in UTC so the displayed weekday
 * doesn't drift when the user is in a different timezone than the
 * train.
 */
export function formatTripDate(yyyymmdd) {
  if (!yyyymmdd) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

/** Today as YYYY-MM-DD in the user's local timezone, for picker defaults. */
export function todayLocalISO() {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
