/* ==================================================================
   Packing list storage on top of the existing Dexie database.
   Items are scoped per trip via tripId; deleting a trip cascades
   the cleanup (see trips.js -> deleteTrip).
   ================================================================== */

import { db } from './trips.js';

/**
 * @typedef {Object} PackingItem
 * @property {number} id          - Dexie auto-incremented
 * @property {string} tripId
 * @property {string} name
 * @property {boolean} packed
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** List packing items for a trip, oldest-first so newly-added rows
    settle naturally at the end of the list. */
export async function listPackingItems(tripId) {
  if (!tripId) return [];
  return db.packingItems.where({ tripId }).sortBy('createdAt');
}

/** Add a new packing item to a trip. Returns the created row id. */
export async function addPackingItem(tripId, name) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  const now = Date.now();
  return db.packingItems.add({
    tripId,
    name: clean,
    packed: false,
    createdAt: now,
    updatedAt: now
  });
}

/** Flip the packed flag without re-fetching the whole row. Dexie
    returns the patched row count, not the row, so we re-read after
    update for callers that want the new state. */
export async function togglePackingItem(id) {
  const item = await db.packingItems.get(id);
  if (!item) return null;
  await db.packingItems.update(id, { packed: !item.packed, updatedAt: Date.now() });
  return db.packingItems.get(id);
}

/** Inline-rename support. Empty names get rejected. */
export async function renamePackingItem(id, name) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  await db.packingItems.update(id, { name: clean, updatedAt: Date.now() });
  return db.packingItems.get(id);
}

export async function deletePackingItem(id) {
  await db.packingItems.delete(id);
}
