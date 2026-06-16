/* ==================================================================
   Travel diary storage on top of the existing Dexie database.
   Entries are scoped per trip via tripId with an optional stopId so
   a note can be pinned to "the morning we got into Huntsville" or
   left as a generic trip thought. Both cascade-delete with the
   trip via trips.js -> deleteTrip.
   ================================================================== */

import { db } from './db.js';

/**
 * @typedef {Object} DiaryEntry
 * @property {number} id
 * @property {string} tripId
 * @property {string|null} stopId
 * @property {string} text
 * @property {string|null} [entryDate]  YYYY-MM-DD when the user says
 *   the note "happened" - may differ from createdAt for backdated
 *   notes (you write the entry on the train but date it for the
 *   day before). Optional; legacy rows fall back to createdAt.
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/* Sort key: the user-supplied entryDate when present, else the
   createdAt timestamp. Both are descending so the most recent note
   lands on top. */
function entrySortKey(row) {
  if (row && typeof row.entryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.entryDate)) {
    try {
      return new Date(row.entryDate + 'T12:00:00').getTime();
    } catch (_) {
      /* fall through to createdAt */
    }
  }
  return row && row.createdAt ? row.createdAt : 0;
}

/** Newest-first feed for the trip detail panel. */
export async function listDiaryEntries(tripId) {
  if (!tripId) return [];
  const rows = await db.diaryEntries.where({ tripId }).toArray();
  return rows.sort((a, b) => entrySortKey(b) - entrySortKey(a));
}

/** Returns the auto-assigned id of the new entry, or null when the
    body is empty. `entryDate` is optional; the UI defaults it to
    today so quick notes still feel instant. */
export async function addDiaryEntry(tripId, { text, stopId = null, entryDate = null } = {}) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const now = Date.now();
  return db.diaryEntries.add({
    tripId,
    stopId: stopId || null,
    text: clean,
    entryDate: typeof entryDate === 'string' && entryDate ? entryDate : null,
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
  if (patch.entryDate !== undefined) next.entryDate = patch.entryDate || null;
  if (Object.keys(next).length === 0) return row;
  next.updatedAt = Date.now();
  await db.diaryEntries.update(id, next);
  return db.diaryEntries.get(id);
}

/* Returns the deleted row so the caller can offer Undo via a
   toast that calls restoreDiaryEntry(row). */
export async function deleteDiaryEntry(id) {
  if (id == null) return null;
  const row = await db.diaryEntries.get(Number(id));
  if (!row) return null;
  await db.diaryEntries.delete(Number(id));
  return row;
}

export async function restoreDiaryEntry(row) {
  if (!row || row.id == null) return null;
  await db.diaryEntries.put(row);
  return row;
}
