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
 * @typedef {{ stopId: string, date: string }} StopVisit
 * One visit on a trip: a stop and the date the user arrives there.
 * The stay at that stop runs from `date` until the next visit's date
 * (or `returnDate` for the last visit).
 */

/**
 * @typedef {Object} Trip
 * @property {string} id           - slug, stable across edits
 * @property {string} name         - what the user calls this trip
 * @property {string[]} stopIds    - ordered list of stop ids; derived
 *                                   from `stops` when present, kept for
 *                                   back-compat with older code paths
 * @property {StopVisit[]} [stops] - new authoritative route: each entry
 *                                   has a stopId + date; rendered as a
 *                                   chapter in date order
 * @property {string} [returnDate] - date the user is back at the
 *                                   departing station (closes the trip
 *                                   window for events on the last stop)
 * @property {string} [returnStopId] - station the user ends at on the
 *                                   return; defaults to stops[0].stopId
 * @property {string} [departureDate] - mirror of stops[0].date so any
 *                                   legacy reader (cover stat, recap,
 *                                   poster) still finds the trip start
 * @property {string} color        - leather color for the SVG suitcase
 * @property {string} strap        - strap color for the SVG suitcase
 * @property {number} createdAt    - epoch ms
 * @property {number} updatedAt    - epoch ms
 */

/* Trip moods. Picked once at trip creation, surfaced as a small
   glyph on the home polaroid card so the dashboard reads at a
   glance. Glyphs are inline SVG so they inherit currentColor and
   tile cleanly into the rust-on-cream / cream-on-rust contexts. */
export const TRIP_MOODS = [
  {
    id: 'solo',
    label: 'Solo',
    glyph: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 21 V17 a4 4 0 0 1 4 -4 H15 a4 4 0 0 1 4 4 V21"/></svg>'
  },
  {
    id: 'family',
    label: 'Family',
    glyph: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="7" r="2.5"/><circle cx="12" cy="14" r="2"/><path d="M3 20 V18 a3 3 0 0 1 3 -3 H8 a3 3 0 0 1 3 3 V20"/><path d="M13 20 V18 a3 3 0 0 1 3 -3 H18 a3 3 0 0 1 3 3 V20"/></svg>'
  },
  {
    id: 'romantic',
    label: 'Romantic',
    glyph: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20 C6 15 3 12 3 8 a5 5 0 0 1 9 -3 a5 5 0 0 1 9 3 c0 4 -3 7 -9 12 Z"/></svg>'
  },
  {
    id: 'adventure',
    label: 'Adventure',
    glyph: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20 L9 8 L13 14 L17 6 L21 20 Z"/><circle cx="16" cy="4" r="1.6"/></svg>'
  },
  {
    id: 'work',
    label: 'Work',
    glyph: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7 V5 a2 2 0 0 1 2 -2 H13 a2 2 0 0 1 2 2 V7"/></svg>'
  }
];

/* Helper for components rendering a trip mood glyph: returns the
   full mood record or null if the trip has no mood set. */
export function getTripMood(moodId) {
  if (!moodId) return null;
  return TRIP_MOODS.find((m) => m.id === moodId) || null;
}

/* Five vintage leather palettes the user can tint a suitcase with.
   Each pair = (body, strap). These read on cream paper without
   feeling cartoonish. */
export const LEATHER_COLORS = [
  { id: 'rust',    name: 'Rust',    body: '#7d3a1e', strap: '#5e2a14' },
  { id: 'amber',   name: 'Amber',   body: '#c4860f', strap: '#7d4e0a' },
  { id: 'forest',  name: 'Forest',  body: '#1f3d2d', strap: '#0a2d21' },
  { id: 'teal',    name: 'Teal',    body: '#2c5258', strap: '#1a3338' },
  { id: 'burgundy',name: 'Burgundy',body: '#6b1d2e', strap: '#4a131e' }
];

/* The database. Bumping the version triggers Dexie's upgrade path;
   keep migrations small and well-commented as the schema grows. */
/* v1 - original four trip-scoped tables.
   v2 - adds bucketItems for the cross-trip wishlist.
   v3 - adds budgetEntries for the per-trip budget tracker.
   v4 - adds photos for the per-trip image album (full-res +
        thumbnail Blobs live in the row). All additive; no data
        migration on existing installs. */
export const db = new Dexie('northlander');
db.version(1).stores({
  trips: '&id, name, updatedAt',
  packingItems: '++id, tripId, name, packed',
  bookings: '++id, tripId, kind, status, dueDate',
  diaryEntries: '++id, tripId, stopId, createdAt'
});
db.version(2).stores({
  bucketItems: '++id, kind, stopId, createdAt'
});
db.version(3).stores({
  budgetEntries: '++id, tripId, category, createdAt'
});
db.version(4).stores({
  photos: '++id, tripId, stopId, takenAt, createdAt'
});
/* v5 - userEvents table for events the user adds themselves
   alongside the Guide's pull. Additive; no migration needed for
   existing installs. */
db.version(5).stores({
  userEvents: '++id, tripId, stopId, startDate, createdAt'
});

/* ---------- slugging ----------
   We use a stable slug from the trip name as the primary key so URLs
   read as /trips/muskoka-weekend rather than /trips/uuid-of-doom. The
   uniqueTripSlug helper handles collisions when two trips share a
   name by tacking on -2, -3, etc. */

export function slugify(name) {
  const base = String(name || 'trip')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  return base || 'trip';
}

export async function uniqueTripSlug(name) {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (await db.trips.get(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  return slug;
}

/* ---------- CRUD helpers ----------
   Page-level code shouldn't have to talk to Dexie directly. */

export async function listTrips() {
  return db.trips.orderBy('updatedAt').reverse().toArray();
}

export async function getTrip(id) {
  return db.trips.get(id);
}

/* Create a new trip from a name + a leather color id. Generates a
   unique slug, persists it, refreshes the live store, returns the
   created row (with its slug as `id`). `body` and `strap` override
   the palette when present, which is how the "custom" swatch in
   NewTripModal hands its hex codes through. */
export async function createTrip({ name, colorId = 'rust', body, strap, moodId = null } = {}) {
  const palette = LEATHER_COLORS.find((c) => c.id === colorId) || LEATHER_COLORS[0];
  const id = await uniqueTripSlug(name);
  const now = Date.now();
  const trip = {
    id,
    name: String(name || 'Untitled trip').trim() || 'Untitled trip',
    stopIds: [],
    color: body || palette.body,
    strap: strap || palette.strap,
    colorId: colorId === 'custom' ? 'custom' : palette.id,
    /* Optional mood tag. Validated against TRIP_MOODS; anything
       else stores as null so future enum changes don't strand
       garbage on the row. */
    moodId: moodId && TRIP_MOODS.some((m) => m.id === moodId) ? moodId : null,
    createdAt: now,
    updatedAt: now
  };
  await db.trips.put(trip);
  trips.set(await listTrips());
  return trip;
}

/* Generic update. Pass the fields you want to change. updatedAt is
   bumped automatically. Returns the patched row, or null when the
   trip is gone. */
export async function updateTrip(id, patch) {
  const existing = await db.trips.get(id);
  if (!existing) return null;
  const next = Object.assign({}, existing, patch, { updatedAt: Date.now() });
  await db.trips.put(next);
  trips.set(await listTrips());
  return next;
}

/* Rename a trip without changing its slug. Slugs are the source of
   truth for URLs and storage joins - renaming the slug would orphan
   packing items, bookings and diary entries. We keep the slug
   stable and only update the human-facing name. */
export async function renameTrip(id, name) {
  return updateTrip(id, { name: String(name || '').trim() || 'Untitled trip' });
}

/* Append a named packing list to the trip. The default (unnamed)
   list is always implicit, so this only records the EXTRA lists
   the user wants to maintain alongside it (Mom / Kids / Camera
   bag etc.). Names are deduped case-insensitively. Returns the
   patched row, or the existing row when the name was already
   present. */
export async function addTripPackingList(id, name) {
  if (!id) return null;
  const clean = String(name || '').trim();
  if (!clean) return null;
  const existing = await db.trips.get(id);
  if (!existing) return null;
  const lists = Array.isArray(existing.extraPackingLists) ? existing.extraPackingLists : [];
  const lower = clean.toLowerCase();
  if (lists.some((n) => String(n).toLowerCase() === lower)) return existing;
  return updateTrip(id, { extraPackingLists: [...lists, clean] });
}

/* Rename a packing list. Pass `currentName=''` (or null) to rename
   the default list - that just patches `defaultPackingListName`
   on the trip row, since items in the default list have no
   listName to migrate. For named lists we update both
   `extraPackingLists` and every packing item whose listName
   matches, in one transaction. Refuses a name collision against
   any other list (case-insensitive). */
export async function renameTripPackingList(id, currentName, newName) {
  if (!id) return null;
  const next = String(newName || '').trim();
  if (!next) return null;
  const cur = String(currentName || '').trim();
  const row = await db.trips.get(id);
  if (!row) return null;
  const lists = Array.isArray(row.extraPackingLists) ? row.extraPackingLists : [];
  const defaultName = String(row.defaultPackingListName || '').trim();
  const nextLower = next.toLowerCase();
  /* Collision: another list (default or extra) already uses this
     name. The list being renamed itself doesn't count. */
  const otherLists = [
    ...(cur && cur.toLowerCase() === defaultName.toLowerCase() ? [] : [defaultName]),
    ...lists.filter((n) => String(n).toLowerCase() !== cur.toLowerCase())
  ].filter(Boolean);
  if (otherLists.some((n) => String(n).toLowerCase() === nextLower)) {
    return row;
  }
  if (!cur) {
    /* Default list: just patches the display name on the trip. */
    return updateTrip(id, { defaultPackingListName: next });
  }
  /* Named list: rename in the trip row AND on every owned item. */
  await db.transaction(
    'rw',
    db.trips,
    db.packingItems,
    async () => {
      const t = await db.trips.get(id);
      if (t) {
        const updatedLists = (t.extraPackingLists || []).map((n) =>
          String(n).toLowerCase() === cur.toLowerCase() ? next : n
        );
        await db.trips.put({ ...t, extraPackingLists: updatedLists, updatedAt: Date.now() });
      }
      const matching = await db.packingItems
        .where({ tripId: id })
        .filter((it) => String(it.listName || '').toLowerCase() === cur.toLowerCase())
        .toArray();
      for (const it of matching) {
        await db.packingItems.update(it.id, { listName: next, updatedAt: Date.now() });
      }
    }
  );
  trips.set(await listTrips());
  return db.trips.get(id);
}

/* Stamp a trip as "Wrapped" so the cover surfaces a passport-
   cancellation stamp + the home card flips to the wrapped style.
   Reversible via unwrapTrip in case the user fat-fingered it. */
export async function wrapTrip(id) {
  if (!id) return null;
  return updateTrip(id, { wrappedAt: Date.now() });
}

export async function unwrapTrip(id) {
  if (!id) return null;
  return updateTrip(id, { wrappedAt: null });
}

/* Set the trip-wide budget target. Empty / null / a non-finite
   number stores as null (no target set). Accepts a number or a
   string; the latter is coerced. */
export async function setTripBudgetTarget(id, target) {
  if (!id) return null;
  let next = null;
  const v = typeof target === 'string' ? Number(target) : target;
  if (Number.isFinite(v) && v >= 0) {
    next = Math.round(v * 100) / 100;
  }
  return updateTrip(id, { budgetTarget: next });
}

/* Remove a named list and every packing item it owns in one
   transaction. The default (unnamed) list and its items are
   intentionally untouched. */
export async function deleteTripPackingList(id, name) {
  if (!id) return null;
  const clean = String(name || '').trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  await db.transaction(
    'rw',
    db.trips,
    db.packingItems,
    async () => {
      const row = await db.trips.get(id);
      if (row) {
        const next = (row.extraPackingLists || []).filter(
          (n) => String(n).toLowerCase() !== lower
        );
        await db.trips.put({ ...row, extraPackingLists: next, updatedAt: Date.now() });
      }
      await db.packingItems
        .where({ tripId: id })
        .filter((it) => String(it.listName || '').toLowerCase() === lower)
        .delete();
    }
  );
  trips.set(await listTrips());
  return db.trips.get(id);
}

/* Write the new dated-route shape on a trip. Mirrors `stopIds` and
   `departureDate` from `stops` so any code still reading the old
   shape keeps working. `direction` is derived from the first vs
   last picked stop's canonical route index.

   Multi-stop returns (added 2026-06-07): `returnStops` is an array
   of `{stopId, date}` entries chronologically ordered after the
   outbound leg. The legacy `returnDate` + `returnStopId` mirror the
   LAST return entry so older readers (cover ticket, recap, poster,
   print PDF) keep showing a single Return chip without needing to
   know about multi-stop returns yet. When the caller passes a
   single `returnDate` / `returnStopId` and omits `returnStops`, we
   synthesize a one-entry array so the new shape is always written. */
export async function setTripRoute(id, { stops, returnStops, returnDate, returnStopId } = {}) {
  if (!id) return null;
  const safeStops = Array.isArray(stops)
    ? stops.filter((s) => s && s.stopId).map((s) => ({
        stopId: String(s.stopId),
        date: typeof s.date === 'string' ? s.date : ''
      }))
    : [];
  const stopIds = safeStops.map((s) => s.stopId);
  const departureDate = safeStops[0]?.date || null;

  let safeReturnStops;
  if (Array.isArray(returnStops)) {
    safeReturnStops = returnStops
      .filter((s) => s && s.stopId)
      .map((s) => ({
        stopId: String(s.stopId),
        date: typeof s.date === 'string' ? s.date : ''
      }));
  } else if (returnDate && returnStopId) {
    safeReturnStops = [{ stopId: String(returnStopId), date: String(returnDate) }];
  } else {
    safeReturnStops = [];
  }
  /* Legacy mirrors point at the last return entry so the cover
     ticket, recap and PDF print routes that haven't been taught
     about multi-stop returns yet still show the user's final
     return station + date. */
  const lastReturn = safeReturnStops[safeReturnStops.length - 1] || null;
  const mirroredReturnDate = lastReturn?.date || returnDate || null;
  const mirroredReturnStopId = lastReturn?.stopId || returnStopId || stopIds[0] || null;

  /* Direction: northbound when the trip's farthest stop sits later
     in the south-to-north canonical order than the departing stop.
     We import routeIndex lazily to avoid a circular dependency
     between the store and the data module. */
  let direction = 'northbound';
  try {
    const { routeIndex } = await import('$lib/data/stops.js');
    if (stopIds.length >= 2) {
      const a = routeIndex(stopIds[0]);
      const b = routeIndex(stopIds[stopIds.length - 1]);
      if (a != null && b != null && b < a) direction = 'southbound';
    }
  } catch (_) { /* keep default */ }
  const patch = {
    stops: safeStops,
    stopIds,
    departureDate,
    returnStops: safeReturnStops,
    returnDate: mirroredReturnDate,
    returnStopId: mirroredReturnStopId,
    direction
  };
  return updateTrip(id, patch);
}

export async function changeTripColor(id, colorId, { body, strap } = {}) {
  if (colorId === 'custom') {
    /* The trip page editor passes explicit hexes here. We still
       persist colorId='custom' so the UI can recognise it on next
       open and reopen the color inputs. */
    return updateTrip(id, {
      color: body || '#7d3a1e',
      strap: strap || '#5e2a14',
      colorId: 'custom'
    });
  }
  const palette = LEATHER_COLORS.find((c) => c.id === colorId);
  if (!palette) return null;
  return updateTrip(id, { color: palette.body, strap: palette.strap, colorId: palette.id });
}

/* ---------- Custom cover photo ---------- */
/* The user's chosen banner image for a trip. Stored as a JPEG Blob
   on the trip row under `coverBlob` so it cascades with the rest of
   the trip data and doesn't need its own table. We resize down to
   1600px long-edge JPEG at quality 0.85 - same target as the photo
   album - so the row stays in the 200-500 KB range and the trip
   detail page can render it at hero size without decoding a
   12-megapixel original. */
const COVER_MAX = 1600;
const COVER_QUALITY = 0.85;

async function fileToBitmap(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

async function resizeImage(file, max) {
  const bitmap = await fileToBitmap(file);
  const w = bitmap.width || 0;
  const h = bitmap.height || 0;
  if (!w || !h) return null;
  const scale = Math.min(1, max / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, tw, th);
  return await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', COVER_QUALITY);
  });
}

export async function setTripCover(id, file) {
  if (!id || !file) return null;
  const blob = await resizeImage(file, COVER_MAX);
  if (!blob) return null;
  return updateTrip(id, { coverBlob: blob });
}

export async function clearTripCover(id) {
  if (!id) return null;
  return updateTrip(id, { coverBlob: null });
}

/* Delete a trip plus every row that references it. Wrap in a single
   transaction so a partial failure can't strand orphans. */
export async function deleteTrip(id) {
  await db.transaction(
    'rw',
    db.trips,
    db.packingItems,
    db.bookings,
    db.diaryEntries,
    db.budgetEntries,
    db.photos,
    db.userEvents,
    async () => {
      await db.trips.delete(id);
      await db.packingItems.where({ tripId: id }).delete();
      await db.bookings.where({ tripId: id }).delete();
      await db.diaryEntries.where({ tripId: id }).delete();
      await db.budgetEntries.where({ tripId: id }).delete();
      await db.photos.where({ tripId: id }).delete();
      await db.userEvents.where({ tripId: id }).delete();
    }
  );
  trips.set(await listTrips());
}

/* Live store. Subscribers re-render whenever a CRUD helper fires.
   Server-side rendering returns an empty list because IndexedDB
   doesn't exist in Node. */
export const trips = writable(/** @type {Trip[]} */ ([]));

if (typeof window !== 'undefined') {
  listTrips().then((rows) => trips.set(rows)).catch(() => trips.set([]));
}
