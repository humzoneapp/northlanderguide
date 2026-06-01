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
 * @property {string|null} dueDate    - YYYY-MM-DD or null
 * @property {number} createdAt
 * @property {number} updatedAt
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
    everything else falls back. */
export async function addBooking(tripId, { title, kind = 'other', dueDate = null } = {}) {
  const clean = String(title || '').trim();
  if (!clean) return null;
  const now = Date.now();
  return db.bookings.add({
    tripId,
    title: clean,
    kind: isKind(kind) ? kind : 'other',
    status: 'pending',
    dueDate: dueDate || null,
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

export async function setBookingKind(id, kind) {
  if (!isKind(kind)) return null;
  await db.bookings.update(id, { kind, updatedAt: Date.now() });
  return db.bookings.get(id);
}

export async function deleteBooking(id) {
  await db.bookings.delete(id);
}
