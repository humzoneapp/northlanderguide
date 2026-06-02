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
export async function createTrip({ name, colorId = 'rust', body, strap } = {}) {
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
    async () => {
      await db.trips.delete(id);
      await db.packingItems.where({ tripId: id }).delete();
      await db.bookings.where({ tripId: id }).delete();
      await db.diaryEntries.where({ tripId: id }).delete();
      await db.budgetEntries.where({ tripId: id }).delete();
      await db.photos.where({ tripId: id }).delete();
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
