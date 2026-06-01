/* ==================================================================
   Local-first trip storage on top of IndexedDB via Dexie.
   Every trip is a "suitcase" the user packs. Schema is intentionally
   loose for the MVP - we widen it as features land instead of
   guessing now. Open questions like sync, auth and shareable links
   are deferred to Phase 2.
   ================================================================== */

import Dexie from 'dexie';
import { writable } from 'svelte/store';

/**
 * @typedef {Object} Trip
 * @property {string} id           - slug, stable across edits
 * @property {string} name         - what the user calls this trip
 * @property {string[]} stopIds    - ordered list of stop ids (e.g. 'huntsville')
 * @property {string} color        - leather color for the SVG suitcase
 * @property {string} strap        - strap color for the SVG suitcase
 * @property {number} createdAt    - epoch ms
 * @property {number} updatedAt    - epoch ms
 */

/* The database. Bumping the version triggers Dexie's upgrade path;
   keep migrations small and well-commented as the schema grows. */
export const db = new Dexie('northlander');
db.version(1).stores({
  // pkey = id; secondary indexes on name + updatedAt for sort/search
  trips: '&id, name, updatedAt',
  // future: packingItems, bookings, diaryEntries, photos, budgetEntries
  packingItems: '++id, tripId, name, packed',
  bookings: '++id, tripId, kind, status, dueDate',
  diaryEntries: '++id, tripId, stopId, createdAt'
});

/* Tiny convenience helpers - the page-level code shouldn't have to
   talk to Dexie directly. */

export async function listTrips() {
  return db.trips.orderBy('updatedAt').reverse().toArray();
}

export async function getTrip(id) {
  return db.trips.get(id);
}

export async function saveTrip(trip) {
  const now = Date.now();
  const next = Object.assign(
    { createdAt: now, color: '#7d3a1e', strap: '#5e2a14', stopIds: [] },
    trip,
    { updatedAt: now }
  );
  await db.trips.put(next);
  trips.set(await listTrips());
  return next;
}

export async function deleteTrip(id) {
  await db.transaction('rw', db.trips, db.packingItems, db.bookings, db.diaryEntries, async () => {
    await db.trips.delete(id);
    await db.packingItems.where({ tripId: id }).delete();
    await db.bookings.where({ tripId: id }).delete();
    await db.diaryEntries.where({ tripId: id }).delete();
  });
  trips.set(await listTrips());
}

/* Live store. Subscribers re-render whenever saveTrip/deleteTrip
   fires. Server-side rendering returns an empty list because
   IndexedDB doesn't exist in Node. */
export const trips = writable(/** @type {Trip[]} */ ([]));

if (typeof window !== 'undefined') {
  listTrips().then((rows) => trips.set(rows)).catch(() => trips.set([]));
}
