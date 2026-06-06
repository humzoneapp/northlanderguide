/* ==================================================================
   Northlander schedule helpers.

   The data here mirrors the Proposed Service Schedule published at
   https://www.ontarionorthland.ca/en/northlander (table verbatim,
   confirmed 2026-06-06). The northbound train departs Toronto Union
   at 18:30 and arrives in Cochrane the next morning at 08:30; the
   southbound train departs Cochrane at 22:15 and arrives in Toronto
   Union at 10:55. Service is overnight in both directions with
   layovers in Timmins and rest stops in Englehart + North Bay.

   We don't yet model the days-of-week the train actually runs (so
   the UI lets users plan around any date); when Ontario Northland
   publishes that, the validation belongs in this file.

   Schedule subject to change. Tell the user to reconfirm at
   ontarionorthland.ca before they board.
   ================================================================== */

/** Toronto Union to Cochrane in minutes (Cochrane's offset). Kept
    for legacy travel-duration callers; the per-stop projected
    arrival clocks now come from TRAIN_SCHEDULE below. */
export const ROUTE_TOTAL_MINUTES = 680;

/** Departure clocks at the route's two ends, in 24h. */
export const NORTHBOUND_DEPARTURE = '18:30';
export const SOUTHBOUND_DEPARTURE = '22:15';

/** Source of truth for what the train does at each stop, per the
    Proposed Service Schedule. Times are HH:MM 24h. Two-time entries
    (e.g. Timmins) are an arrival-departure pair for a layover or
    rest stop. The Matheson northbound note records the optional
    express coach to Cochrane (departs 04:30, arrives 05:45).
    Keep this list in stop-id sync with `data/stops.js`. */
export const TRAIN_SCHEDULE = {
  union:        { northbound: { depart: '18:30' },                          southbound: { arrive: '10:55' } },
  langstaff:    { northbound: { arrive: '19:05' },                          southbound: { arrive: '10:20' } },
  gormley:      { northbound: { arrive: '19:20' },                          southbound: { arrive: '10:05' } },
  washago:      { northbound: { arrive: '20:20' },                          southbound: { arrive: '09:05' } },
  gravenhurst:  { northbound: { arrive: '20:45' },                          southbound: { arrive: '08:40' } },
  bracebridge:  { northbound: { arrive: '21:00' },                          southbound: { arrive: '08:25' } },
  huntsville:   { northbound: { arrive: '21:35' },                          southbound: { arrive: '07:50' } },
  southriver:   { northbound: { arrive: '22:25' },                          southbound: { arrive: '07:00' } },
  northbay:     { northbound: { arrive: '23:30', depart: '23:40', restStop: true },
                  southbound: { arrive: '05:45', depart: '05:55', restStop: true } },
  temagami:     { northbound: { arrive: '01:10' },                          southbound: { arrive: '04:15' } },
  temiskaming:  { northbound: { arrive: '02:10' },                          southbound: { arrive: '03:15' } },
  englehart:    { northbound: { arrive: '02:40', depart: '02:50', restStop: true },
                  southbound: { arrive: '02:35', depart: '02:45', restStop: true } },
  kirklandlake: { northbound: { arrive: '03:30' },                          southbound: { arrive: '01:55' } },
  matheson:     { northbound: { arrive: '04:15', expressCoach: { depart: '04:30', arriveCochrane: '05:45' } },
                  southbound: { arrive: '01:10' } },
  timmins:      { northbound: { arrive: '05:10', depart: '07:30', layover: true },
                  southbound: { arrive: '23:15', depart: '00:15', layover: true } },
  cochrane:     { northbound: { arrive: '08:30' },                          southbound: { depart: '22:15' } }
};

/** Public URL of the official schedule. Surface this anywhere the
    app prints a train time so the user can reconfirm. */
export const OFFICIAL_SCHEDULE_URL = 'https://www.ontarionorthland.ca/en/northlander';

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

/**
 * Look up the train's scheduled time at a stop in the given
 * direction, formatted for display. Returns an object so callers
 * can pick which slot is relevant (e.g. show `depart` on the user's
 * departing chip and `arrive` on every intermediate / return chip).
 *
 *   {
 *     arrive:    "11:30 PM",   // arrival HH:MM 24h pulled through formatClock
 *     depart:    "11:40 PM",   // departure (= arrive for instant pass-through)
 *     primary:   "11:30 PM",   // best single time to show
 *     hasLayover: false,
 *     hasRestStop: true,
 *     raw:       { arrive: "23:30", depart: "23:40", restStop: true }
 *   }
 *
 * Returns null when the stop or direction isn't recognized.
 */
export function trainTimeFor(stopId, direction = 'northbound') {
  const stop = TRAIN_SCHEDULE[stopId];
  if (!stop) return null;
  const slot = stop[direction === 'southbound' ? 'southbound' : 'northbound'];
  if (!slot) return null;
  const arriveMin = parseClock(slot.arrive);
  const departMin = parseClock(slot.depart);
  const arrive = arriveMin != null ? formatClock(arriveMin) : '';
  const depart = departMin != null ? formatClock(departMin) : '';
  /* Single-time stops (instant pass-through) record only `arrive`
     OR only `depart`. Mirror it so callers don't have to handle
     three permutations. */
  const primary = arrive || depart;
  return {
    arrive: arrive || depart,
    depart: depart || arrive,
    primary,
    hasLayover: !!slot.layover,
    hasRestStop: !!slot.restStop,
    raw: slot
  };
}

/** Shorthand: the time printed on a Depart chip in the cover ticket
    (the moment the train leaves the user's boarding station). */
export function departTimeAt(stopId, direction = 'northbound') {
  const t = trainTimeFor(stopId, direction);
  return t ? t.depart : '';
}

/** Today as YYYY-MM-DD in the user's local timezone, for picker defaults. */
export function todayLocalISO() {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
