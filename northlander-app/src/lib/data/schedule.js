/* ==================================================================
   Northlander schedule helpers.
   The MVP only models the northbound service (Toronto Union to
   Cochrane). Southbound + multi-day variants come in Phase 2.

   We don't model individual trips/dates yet either; we just take a
   `departureLocal` clock (default 09:00 - the proposed Ontario
   Northland northbound timing) and project arrival times at each
   stop using offsetMinutes from the stop catalog.
   ================================================================== */

/** Default northbound departure from Toronto Union (24-hour, local). */
export const NORTHBOUND_DEPARTURE = '09:00';

/** Parse "HH:MM" 24-hour into minutes since midnight. */
function parseClock(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Format a minutes-since-midnight value as a 12-hour clock string
    in the conductor's voice: "9:00 AM", "11:35 AM", "12:05 PM", etc.
    Wraps around midnight gracefully so a late-night arrival reads
    correctly. */
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
 * Project an arrival time at a stop given its offsetMinutes from
 * Toronto Union and a northbound departure clock.
 *
 * @param {number} offsetMinutes - stop offset from origin
 * @param {string} [departure]   - "HH:MM" 24-hour local clock (default 09:00)
 * @returns {string} e.g. "11:35 AM" or '' if inputs are bad
 */
export function arrivalClock(offsetMinutes, departure = NORTHBOUND_DEPARTURE) {
  const base = parseClock(departure);
  if (base == null || offsetMinutes == null) return '';
  return formatClock(base + Number(offsetMinutes));
}

/**
 * Travel time from origin formatted as "Hh Mm" for compact display.
 * 0 returns "Departure" (it IS the origin).
 *
 * @param {number} offsetMinutes
 * @returns {string}
 */
export function travelDuration(offsetMinutes) {
  if (offsetMinutes == null) return '';
  if (offsetMinutes === 0) return 'Departure';
  const h = Math.floor(offsetMinutes / 60);
  const m = offsetMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
