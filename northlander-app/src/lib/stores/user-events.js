/* ==================================================================
   User-added events.

   The events strip on each chapter (`EventsAlongRoute`) was a
   read-only pull from the Guide; this store backs the "Your events"
   half-section directly below it where the user adds their own.

   Shape (Dexie v5):
     {
       id (auto),
       tripId,
       stopId,
       name,                 - required, what the event is
       startDate,            - YYYY-MM-DD
       startTime?,           - HH:MM 24h, optional
       venue?,               - free text
       address?,             - free text, used for the map pin
       url?,                 - optional outbound link
       description?,         - free text, up to ~500 chars
       createdAt, updatedAt
     }

   Cascade-deletes with the trip via `deleteTrip()` in trips.js.
   ================================================================== */

import { db } from './trips.js';

/** Sorted by date + time so the strip reads chronologically. Rows
    without a startTime sort to the end of their day. */
export async function listUserEvents(tripId) {
  if (!tripId) return [];
  const rows = await db.userEvents.where({ tripId }).toArray();
  return rows.sort((a, b) => {
    const ad = String(a.startDate || '');
    const bd = String(b.startDate || '');
    if (ad !== bd) return ad < bd ? -1 : 1;
    const at = a.startTime || '99:99';
    const bt = b.startTime || '99:99';
    if (at !== bt) return at < bt ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
}

function normalizeDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function normalizeTime(s) {
  return typeof s === 'string' && /^\d{1,2}:\d{2}$/.test(s)
    ? s.padStart(5, '0')
    : null;
}

export async function addUserEvent(tripId, fields = {}) {
  const name = String(fields.name || '').trim();
  if (!name) return null;
  const startDate = normalizeDate(fields.startDate);
  if (!startDate) return null;
  const now = Date.now();
  return db.userEvents.add({
    tripId,
    stopId: fields.stopId || null,
    name,
    startDate,
    startTime: normalizeTime(fields.startTime),
    venue: String(fields.venue || '').trim() || null,
    address: String(fields.address || '').trim() || null,
    url: String(fields.url || '').trim() || null,
    description: String(fields.description || '').trim().slice(0, 500) || null,
    createdAt: now,
    updatedAt: now
  });
}

export async function updateUserEvent(id, patch = {}) {
  if (id == null) return null;
  const row = await db.userEvents.get(Number(id));
  if (!row) return null;
  const next = {};
  if (patch.name !== undefined) {
    const v = String(patch.name || '').trim();
    if (!v) return null;
    next.name = v;
  }
  if (patch.startDate !== undefined) {
    const v = normalizeDate(patch.startDate);
    if (!v) return null;
    next.startDate = v;
  }
  if (patch.startTime !== undefined) next.startTime = normalizeTime(patch.startTime);
  if (patch.venue !== undefined) next.venue = String(patch.venue || '').trim() || null;
  if (patch.address !== undefined) next.address = String(patch.address || '').trim() || null;
  if (patch.url !== undefined) next.url = String(patch.url || '').trim() || null;
  if (patch.description !== undefined) next.description = String(patch.description || '').trim().slice(0, 500) || null;
  if (patch.stopId !== undefined) next.stopId = patch.stopId || null;
  if (Object.keys(next).length === 0) return row;
  next.updatedAt = Date.now();
  await db.userEvents.update(Number(id), next);
  return db.userEvents.get(Number(id));
}

/* Persist a successful geocode so the next page load can skip the
   Nominatim round-trip. Mirrors setBookingGeo in bookings.js - same
   shape so the map component can treat both the same way. */
export async function setUserEventGeo(id, geo) {
  if (id == null || !geo) return null;
  const lat = Number(geo.lat);
  const lng = Number(geo.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const next = {
    geo: {
      lat,
      lng,
      source: geo.source === 'title' ? 'title' : 'address',
      query: String(geo.query || ''),
    },
    updatedAt: Date.now(),
  };
  await db.userEvents.update(Number(id), next);
  return db.userEvents.get(Number(id));
}

/* Returns the deleted row so the caller can offer Undo. */
export async function deleteUserEvent(id) {
  if (id == null) return null;
  const row = await db.userEvents.get(Number(id));
  if (!row) return null;
  await db.userEvents.delete(Number(id));
  return row;
}

export async function restoreUserEvent(row) {
  if (!row || row.id == null) return null;
  await db.userEvents.put(row);
  return row;
}
