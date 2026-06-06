/* ==================================================================
   Cross-site events loader.
   The Guide already publishes a fresh window.EVENTS_DATA on every
   sync at https://northlanderguide.com/events-data.js. We pull it
   in via a regular <script> tag (no CORS dance - script tags can
   load cross-origin), cache the parsed result per session, and let
   the trip-detail page filter to the stops + dates that matter.
   ================================================================== */

const GUIDE_BASE = 'https://northlanderguide.com';
const EVENTS_URL = `${GUIDE_BASE}/events-data.js`;

let loadPromise = null;

/**
 * Resolve to `{ "stopId": [event, ...], ... }` from the Guide.
 * Cached for the lifetime of the page. Subsequent callers share
 * the same promise.
 */
export function loadEvents() {
  if (typeof window === 'undefined') {
    return Promise.resolve({});
  }
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    /* If something already loaded events-data.js into window
       (e.g. a previous mount) reuse it without injecting again. */
    if (window.EVENTS_DATA && typeof window.EVENTS_DATA === 'object') {
      resolve(window.EVENTS_DATA);
      return;
    }
    const script = document.createElement('script');
    script.src = EVENTS_URL;
    script.async = true;
    script.onload = () => {
      resolve(window.EVENTS_DATA || {});
    };
    script.onerror = () => {
      /* Reset so a retry can re-attempt. */
      loadPromise = null;
      reject(new Error('Could not load events from the Guide.'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

/** Parse a YYYY-MM-DD date string in the user's local timezone. */
function parseLocalDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Today at 00:00 local. */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Pull every event whose `stopId` is in the supplied set of stops.
 * Preserves Guide order (featured-first then start-date) by walking
 * each stop's bucket in turn.
 */
export function eventsForStops(eventsData, stopIds) {
  if (!eventsData || !Array.isArray(stopIds) || stopIds.length === 0) return [];
  const out = [];
  for (const id of stopIds) {
    const bucket = eventsData[id];
    if (!Array.isArray(bucket)) continue;
    for (const ev of bucket) out.push(ev);
  }
  return out;
}

/**
 * Filter events down to those that overlap the trip's date window.
 * If the trip has no departureDate set, keep every upcoming event
 * (start in the past with a future end still counts as ongoing).
 * Recurring events are always kept regardless of dates.
 *
 * @param {Array} events
 * @param {string|null} departureDate - YYYY-MM-DD
 * @param {number} windowDays - days after departureDate to include
 * @returns {Array}
 */
export function eventsInDateWindow(events, departureDate, windowDays = 7) {
  if (!Array.isArray(events)) return [];
  const today = startOfToday();

  /* No specific trip date: drop only events whose entire range is
     in the past. Keep recurring forever. */
  if (!departureDate) {
    return events.filter((ev) => {
      if (ev.recurring) return true;
      const endStr = ev.endDate || ev.startDate;
      const end = parseLocalDate(endStr);
      if (!end) return true;
      return end.getTime() >= today.getTime();
    });
  }

  const tripStart = parseLocalDate(departureDate);
  if (!tripStart) return events;
  const tripEnd = new Date(tripStart.getTime() + windowDays * 86400000);
  const tripStartMs = tripStart.getTime();
  const tripEndMs = tripEnd.getTime();

  return events.filter((ev) => {
    if (ev.recurring) return true;
    const start = parseLocalDate(ev.startDate);
    const end = parseLocalDate(ev.endDate || ev.startDate);
    if (!start) return true;
    const endMs = (end || start).getTime();
    /* Event range intersects trip window. */
    return endMs >= tripStartMs && start.getTime() <= tripEndMs;
  });
}

/* Detect day-of-week mentions in a recurrence pattern string. Returns
   a list of 0-6 indices (Sunday=0). "Every Friday" -> [5]. "Tuesday
   and Thursday" -> [2,4]. Empty when we can't pull a recognized day
   out of the pattern, in which case the per-chapter filter treats
   the recurring event as un-checkable and drops it. */
const DAY_LOOKUP = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6
};
const DAY_REGEX = /\b(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thu|friday|fri|saturday|sat)\b/gi;
function recurrenceDows(pattern) {
  if (!pattern) return [];
  const matches = String(pattern).toLowerCase().match(DAY_REGEX);
  if (!matches) return [];
  const set = new Set();
  for (const m of matches) {
    const idx = DAY_LOOKUP[m];
    if (idx != null) set.add(idx);
  }
  return [...set];
}
function windowOverlapsDows(start, end, dows) {
  if (dows.length === 0) return false;
  const dayMs = 86400000;
  for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
    if (dows.includes(new Date(t).getDay())) return true;
  }
  return false;
}

/**
 * Filter events to those that overlap an explicit [startDate, endDate]
 * window (YYYY-MM-DD, both inclusive). Strict: an event only passes
 * when we can confirm it lands inside the window.
 *
 * - Non-recurring events: their date range must intersect the window.
 *   Events with no startDate are dropped (we can't verify).
 * - Recurring events: we parse day-of-week mentions from
 *   `recurrencePattern` and check whether any of those days fall in
 *   the window. When the pattern has no recognizable day name (e.g.
 *   "First Sunday of each month"), the event is dropped because we
 *   can't be sure it happens during the stay.
 *
 * Used by the per-chapter event strip so each stop only surfaces
 * events the user could actually attend on the days they're there.
 */
export function eventsInRange(events, startDate, endDate) {
  if (!Array.isArray(events)) return [];
  if (!startDate) return eventsInDateWindow(events, null);
  const start = parseLocalDate(startDate);
  if (!start) return events;
  const endStr = endDate || startDate;
  const end = parseLocalDate(endStr) || start;
  const startMs = start.getTime();
  const endMs = end.getTime();
  return events.filter((ev) => {
    if (ev.recurring) {
      const dows = recurrenceDows(ev.recurrencePattern);
      if (dows.length === 0) return false;
      return windowOverlapsDows(start, end, dows);
    }
    const evStart = parseLocalDate(ev.startDate);
    if (!evStart) return false;
    const evEnd = parseLocalDate(ev.endDate || ev.startDate) || evStart;
    return evEnd.getTime() >= startMs && evStart.getTime() <= endMs;
  });
}

/**
 * "Sat, Sep 14" / "Sep 14 to Sep 18" / "Sep 14 · 7:00 PM" type label.
 * Time gets folded in for single-day dated events.
 */
export function formatEventDate(ev) {
  if (!ev) return '';
  if (ev.recurring) {
    return ev.recurrencePattern || 'Recurring';
  }
  const start = parseLocalDate(ev.startDate);
  const end = parseLocalDate(ev.endDate);
  if (!start) return '';
  const opts = { month: 'short', day: 'numeric' };
  if (end && end.getTime() !== start.getTime()) {
    return (
      start.toLocaleDateString('en-CA', opts) +
      ' to ' +
      end.toLocaleDateString('en-CA', opts)
    );
  }
  const weekday = start.toLocaleDateString('en-CA', { weekday: 'short' });
  const ds = start.toLocaleDateString('en-CA', opts);
  if (ev.startTime) {
    return `${weekday}, ${ds} · ${ev.startTime}`;
  }
  return `${weekday}, ${ds}`;
}

/** Pricing label: "Free" badge text, "$25" etc. */
export function priceLabel(ev) {
  if (!ev) return '';
  if (ev.free) return 'Free';
  return (ev.price && String(ev.price).trim()) || '';
}

/** Sort: featured first, then by start date, then by name. */
export function sortEvents(events) {
  return events.slice().sort((a, b) => {
    if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
    const ad = a.startDate || '9999-12-31';
    const bd = b.startDate || '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}
