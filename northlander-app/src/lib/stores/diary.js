/* ==================================================================
   Travel diary storage on top of the existing Dexie database.
   Entries are scoped per trip via tripId with an optional stopId so
   a note can be pinned to "the morning we got into Huntsville" or
   left as a generic trip thought. Both cascade-delete with the
   trip via trips.js -> deleteTrip.
   ================================================================== */

import { db } from './trips.js';

/**
 * @typedef {Object} DiaryEntry
 * @property {number} id
 * @property {string} tripId
 * @property {string|null} stopId
 * @property {string} text
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** Newest-first feed for the trip detail panel. */
export async function listDiaryEntries(tripId) {
  if (!tripId) return [];
  const rows = await db.diaryEntries.where({ tripId }).toArray();
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/** Returns the auto-assigned id of the new entry, or null when the
    body is empty. */
export async function addDiaryEntry(tripId, { text, stopId = null } = {}) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const now = Date.now();
  return db.diaryEntries.add({
    tripId,
    stopId: stopId || null,
    text: clean,
    createdAt: now,
    updatedAt: now
  });
}

export async function updateDiaryEntry(id, patch) {
  if (id == null) return null;
  const row = await db.diaryEntries.get(id);
  if (!row) return null;
  const next = {};
  if (patch.text !== undefined) {
    const clean = String(patch.text || '').trim();
    if (!clean) return null;
    next.text = clean;
  }
  if (patch.stopId !== undefined) next.stopId = patch.stopId || null;
  if (Object.keys(next).length === 0) return row;
  next.updatedAt = Date.now();
  await db.diaryEntries.update(id, next);
  return db.diaryEntries.get(id);
}

export async function deleteDiaryEntry(id) {
  if (id == null) return;
  await db.diaryEntries.delete(id);
}
