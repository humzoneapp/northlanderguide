/* ==================================================================
   Photo album storage on top of Dexie v4.
   Originals get resized to a sensible web max before they hit
   IndexedDB - browsers cap per-origin quota and "20 photos at 4MB"
   adds up fast on mobile. We also pre-bake a thumbnail Blob so the
   grid view doesn't have to decode the full-res image just to draw
   a 200px tile.
   ================================================================== */

import { db } from './trips.js';

/**
 * @typedef {Object} Photo
 * @property {number} id
 * @property {string} tripId
 * @property {string|null} stopId
 * @property {Blob} blob            - resized to FULL_MAX
 * @property {Blob} thumb           - resized to THUMB_MAX
 * @property {string} caption
 * @property {number|null} width
 * @property {number|null} height
 * @property {number|null} takenAt  - file.lastModified or null
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/* Resize targets. 1600 long-edge JPEG quality 0.85 lands in the
   200-500 KB range for most phone photos, plenty sharp for the
   lightbox + print. 400 thumbnails decode instantly in a grid. */
const FULL_MAX = 1600;
const THUMB_MAX = 400;
const JPEG_QUALITY = 0.85;

/* ---------- resize helpers ---------- */

async function fileToBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  /* Older Safari fallback: <img> then drawImage. */
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function dimsFromBitmap(bm) {
  if (bm && typeof bm.width === 'number') return { w: bm.width, h: bm.height };
  return { w: 0, h: 0 };
}

async function resizeTo(bitmap, max) {
  const { w, h } = dimsFromBitmap(bitmap);
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
    canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY);
  });
}

/* ---------- CRUD ---------- */

/** Newest-first feed so freshly added photos land at the front of
    the grid. Strips out Blobs from the row index for sorting only;
    callers receive the full row including blobs. */
export async function listPhotos(tripId) {
  if (!tripId) return [];
  const rows = await db.photos.where({ tripId }).toArray();
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Add a single file. Returns the new row id, or null when the file
 * could not be decoded as an image. Stores both resized full-res and
 * a thumbnail Blob on the row.
 *
 * @param {string} tripId
 * @param {File|Blob} file
 * @param {{ caption?: string, stopId?: string|null }} [meta]
 */
export async function addPhoto(tripId, file, meta = {}) {
  if (!tripId || !file) return null;
  let bitmap;
  try {
    bitmap = await fileToBitmap(file);
  } catch (err) {
    return null;
  }
  const [blob, thumb] = await Promise.all([
    resizeTo(bitmap, FULL_MAX),
    resizeTo(bitmap, THUMB_MAX)
  ]);
  if (typeof bitmap.close === 'function') bitmap.close();
  if (!blob || !thumb) return null;
  const { w, h } = dimsFromBitmap(bitmap);
  const now = Date.now();
  const takenAt =
    file && typeof file.lastModified === 'number' && file.lastModified > 0
      ? file.lastModified
      : null;
  return db.photos.add({
    tripId,
    stopId: meta.stopId || null,
    blob,
    thumb,
    caption: String(meta.caption || '').trim(),
    width: w || null,
    height: h || null,
    takenAt,
    createdAt: now,
    updatedAt: now
  });
}

export async function updatePhoto(id, patch = {}) {
  if (id == null) return null;
  const row = await db.photos.get(Number(id));
  if (!row) return null;
  const next = {};
  if (patch.caption !== undefined) next.caption = String(patch.caption || '').trim();
  if (patch.stopId !== undefined) next.stopId = patch.stopId || null;
  if (Object.keys(next).length === 0) return row;
  next.updatedAt = Date.now();
  await db.photos.update(Number(id), next);
  return db.photos.get(Number(id));
}

export async function deletePhoto(id) {
  if (id == null) return;
  await db.photos.delete(Number(id));
}

/** Total bytes of every photo's full-res Blob + thumb for a trip.
    Used by the album header to give the user an honest "X photos,
    Y MB on this device" line. */
export async function totalBytes(tripId) {
  if (!tripId) return 0;
  const rows = await db.photos.where({ tripId }).toArray();
  let total = 0;
  for (const r of rows) {
    if (r.blob && typeof r.blob.size === 'number') total += r.blob.size;
    if (r.thumb && typeof r.thumb.size === 'number') total += r.thumb.size;
  }
  return total;
}

/** "1.2 MB" / "240 KB" formatter. */
export function formatBytes(n) {
  const v = Number(n || 0);
  if (v < 1024) return `${Math.round(v)} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}
