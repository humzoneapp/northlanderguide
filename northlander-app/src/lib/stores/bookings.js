/* ==================================================================
   Booking checklist storage on top of the existing Dexie database.
   Bookings live per trip via tripId and cascade-delete when the
   trip is removed (see trips.js -> deleteTrip).
   ================================================================== */

import { db } from './trips.js';

/**
 * @typedef {'train' | 'room' | 'meal' | 'activity' | 'other'} BookingKind
 * @typedef {'pending' | 'booked'} BookingStatus
 *
 * @typedef {Object} Booking
 * @property {number} id
 * @property {string} tripId
 * @property {string} title
 * @property {BookingKind} kind
 * @property {BookingStatus} status
 * @property {string|null} dueDate         - YYYY-MM-DD or null
 * @property {string|null} [stopId]        - which stop this is pinned to
 * @property {string|null} [startTime]     - HH:MM (24h), drives the
 *                                           chronological ordering
 *                                           in cinematic stop scenes
 * @property {string|null} [checkIn]       - YYYY-MM-DD, room only
 * @property {string|null} [checkOut]      - YYYY-MM-DD, room only
 * @property {string|null} [address]       - free text, mostly room
 * @property {string|null} [contact]       - phone / email / host name
 * @property {string|null} [confirmation]  - booking reference number
 * @property {string|null} [notes]         - free text
 * @property {number} createdAt
 * @property {number} updatedAt
 *
 * The extra fields (startTime, checkIn, checkOut, address, contact,
 * confirmation, notes) are unindexed JSON properties on the row, so
 * they don't require a Dexie schema bump. BookingChecklist surfaces
 * a small time pill on every row and a chevron expand panel on room
 * bookings for the longer-form details.
 */

export const BOOKING_KINDS = [
  { id: 'train',    label: 'Train ticket' },
  { id: 'room',     label: 'Place to stay' },
  { id: 'meal',     label: 'Reservation' },
  { id: 'activity', label: 'Activity' },
  { id: 'other',    label: 'Other' }
];

function isKind(k) {
  return BOOKING_KINDS.some((b) => b.id === k);
}

/** List bookings for a trip, pending-first then by due date then by
    creation order. Booked rows fall to the bottom so the next
    action stays in focus. */
export async function listBookings(tripId) {
  if (!tripId) return [];
  const rows = await db.bookings.where({ tripId }).toArray();
  return rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    const ad = a.dueDate || '9999-12-31';
    const bd = b.dueDate || '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
}

/** Add a booking with sensible defaults. Title is required;
    everything else falls back. Optional stopId pins the booking to
    a stop on the trip's route so the itinerary view can group it.
    Optional listingKey is the AddPlanModal's dedupe handle for a
    Guide listing - "stopId|listing-name-slug" - so the modal can
    show an already-added checkmark instead of a + on rows that are
    already on the trip. Optional startTime (HH:MM, 24h) seeds the
    chronological scene ordering at add time so users can drop the
    schedule slot in the modal rather than having to bounce back
    to the BookingChecklist drawer afterward. */
export async function addBooking(
  tripId,
  { title, kind = 'other', dueDate = null, stopId = null, listingKey = null, startTime = null } = {}
) {
  const clean = String(title || '').trim();
  if (!clean) return null;
  const now = Date.now();
  return db.bookings.add({
    tripId,
    title: clean,
    kind: isKind(kind) ? kind : 'other',
    status: 'pending',
    dueDate: dueDate || null,
    stopId: stopId || null,
    listingKey: listingKey || null,
    startTime: normalizeStartTime(startTime),
    createdAt: now,
    updatedAt: now
  });
}

/** Flip between pending and booked. */
export async function toggleBooking(id) {
  const row = await db.bookings.get(id);
  if (!row) return null;
  const next = row.status === 'booked' ? 'pending' : 'booked';
  await db.bookings.update(id, { status: next, updatedAt: Date.now() });
  return db.bookings.get(id);
}

export async function renameBooking(id, title) {
  const clean = String(title || '').trim();
  if (!clean) return null;
  await db.bookings.update(id, { title: clean, updatedAt: Date.now() });
  return db.bookings.get(id);
}

/* The set of fields a caller can patch through the generic helper.
   `title`, `kind`, `status`, and `dueDate` go through their own
   helpers so the validation lives in one place. Everything below is
   free-form text for the room expand panel. */
const PATCHABLE_TEXT_FIELDS = [
  'checkIn', 'checkOut', 'address', 'contact', 'confirmation', 'notes'
];

/* Permissive HH:MM (24h) validator. Accepts "9:30", "09:30", "23:59".
   Anything else clears the field. */
function normalizeStartTime(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = /^([0-9]{1,2}):([0-9]{2})$/.exec(s);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Generic patch helper for the room expand panel. Trims string
    values, treats empty strings as null so a cleared field clears
    rather than storing "". Returns the patched row. */
export async function updateBooking(id, patch = {}) {
  if (id == null) return null;
  const row = await db.bookings.get(id);
  if (!row) return null;
  const next = {};
  for (const k of PATCHABLE_TEXT_FIELDS) {
    if (patch[k] === undefined) continue;
    const v = patch[k] == null ? '' : String(patch[k]);
    const trimmed = v.trim();
    next[k] = trimmed ? trimmed.slice(0, 500) : null;
  }
  if (patch.title !== undefined) {
    const t = String(patch.title || '').trim();
    if (t) next.title = t;
  }
  if (patch.dueDate !== undefined) {
    next.dueDate = patch.dueDate ? String(patch.dueDate) : null;
  }
  if (patch.stopId !== undefined) {
    next.stopId = patch.stopId ? String(patch.stopId) : null;
  }
  if (patch.startTime !== undefined) {
    next.startTime = normalizeStartTime(patch.startTime);
  }
  if (Object.keys(next).length === 0) return row;
  next.updatedAt = Date.now();
  await db.bookings.update(id, next);
  return db.bookings.get(id);
}

export async function setBookingKind(id, kind) {
  if (!isKind(kind)) return null;
  await db.bookings.update(id, { kind, updatedAt: Date.now() });
  return db.bookings.get(id);
}

export async function deleteBooking(id) {
  await db.bookings.delete(id);
}

/** Chronological sort for cinematic stop scenes. Bookings with a
    startTime ride at the top in HH:MM order; untimed bookings fall
    to the end in insertion order so they read as "and also, whenever".
    Pure function - does not mutate the input. */
export function sortByStartTime(items) {
  const list = Array.isArray(items) ? items.slice() : [];
  const timed = list.filter((b) => b.startTime);
  const untimed = list.filter((b) => !b.startTime);
  timed.sort((a, b) => {
    if (a.startTime < b.startTime) return -1;
    if (a.startTime > b.startTime) return 1;
    return a.createdAt - b.createdAt;
  });
  untimed.sort((a, b) => a.createdAt - b.createdAt);
  return [...timed, ...untimed];
}
