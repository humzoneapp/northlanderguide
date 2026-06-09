/* ==================================================================
   Trip backup + restore.

   Lets users download a single .northlander.json file holding an
   entire trip + every child row (packing, bookings, diary, photos
   as base64, budget, user events), and re-import it later on the
   same device or a different one. Independent from the share-link
   path because:

     - Photos travel here (the share link skips them to keep URLs
       short and to respect the privacy of personal images).
     - The user can hand the file to themselves as a real archive
       in case browser data is wiped.

   File schema is versioned (`v`) so future readers can refuse or
   migrate old payloads safely.
   ================================================================== */

import { db, createTrip, listTrips } from '$lib/stores/trips.js';

const FILE_VERSION = 1;

/* Read a Blob as a base64 string (no data:URL prefix). Used to
   serialize photo blobs into the JSON payload. */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Read failed'));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, type = 'image/jpeg') {
  if (!b64) return null;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch (_) {
    return null;
  }
}

/* Pull every trip-scoped row + serialize photo blobs. Returns a
   plain payload ready to JSON.stringify. */
export async function buildTripBackup(tripId) {
  if (!tripId) return null;
  const trip = await db.trips.get(tripId);
  if (!trip) return null;

  const [packingItems, bookings, diaryEntries, budgetEntries, photos, userEvents] = await Promise.all([
    db.packingItems.where({ tripId }).toArray(),
    db.bookings.where({ tripId }).toArray(),
    db.diaryEntries.where({ tripId }).toArray(),
    db.budgetEntries.where({ tripId }).toArray(),
    db.photos.where({ tripId }).toArray(),
    db.userEvents.where({ tripId }).toArray()
  ]);

  /* Photo blobs get base64-encoded. Thumbnails are encoded too so
     the restored album loads fast without re-resizing. */
  const photoRows = await Promise.all(photos.map(async (p) => ({
    id: p.id,
    stopId: p.stopId || null,
    caption: p.caption || '',
    width: p.width || null,
    height: p.height || null,
    takenAt: p.takenAt || null,
    blob: await blobToBase64(p.blob),
    thumb: await blobToBase64(p.thumb),
    blobType: p.blob?.type || 'image/jpeg',
    thumbType: p.thumb?.type || 'image/jpeg',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  })));

  return {
    v: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    trip,
    packingItems,
    bookings,
    diaryEntries,
    budgetEntries,
    userEvents,
    photos: photoRows
  };
}

/* Trigger a browser download of the payload as a .json file with
   a friendly slug-based filename. */
export async function downloadTripBackup(tripId) {
  const payload = await buildTripBackup(tripId);
  if (!payload) return false;
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = String(payload.trip?.id || 'trip').replace(/[^a-z0-9-_]+/gi, '-');
  a.href = url;
  a.download = `${slug}.northlander.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/* Restore a backup payload. The new trip lands with a fresh slug
   if the original id collides; child rows are stamped with the
   new tripId and inserted in bulk. Photos are decoded back into
   Blobs before re-insertion. Returns the new trip row. */
export async function restoreTripBackup(payload) {
  if (!payload || typeof payload !== 'object' || payload.v == null) return null;
  if (Number(payload.v) > FILE_VERSION) return null;
  const src = payload.trip;
  if (!src || !src.name) return null;

  /* Force a fresh slug so re-imports never overwrite existing
     trips. The user can rename after restore if they want. */
  const baseName = String(src.name || 'Shared trip').trim() || 'Shared trip';
  const existing = await listTrips();
  const usedNames = new Set(existing.map((t) => t.name));
  const name = usedNames.has(baseName) ? `${baseName} (restored)` : baseName;

  const created = await createTrip({ name, colorId: src.colorId || 'rust' });

  /* Carry over every field from the source trip row except those
     createTrip already owns (id, color, strap, colorId, createdAt). */
  await db.trips.update(created.id, {
    stops: Array.isArray(src.stops) ? src.stops.slice() : [],
    stopIds: Array.isArray(src.stopIds) ? src.stopIds.slice() : [],
    returnStops: Array.isArray(src.returnStops) ? src.returnStops.slice() : [],
    returnDate: src.returnDate || null,
    returnStopId: src.returnStopId || null,
    departureDate: src.departureDate || null,
    direction: src.direction === 'southbound' ? 'southbound' : 'northbound',
    defaultPackingListName: src.defaultPackingListName || null,
    extraPackingLists: Array.isArray(src.extraPackingLists) ? src.extraPackingLists.slice() : [],
    budgetTarget: Number.isFinite(src.budgetTarget) ? Number(src.budgetTarget) : null,
    wrappedAt: src.wrappedAt || null,
    updatedAt: Date.now()
  });

  const now = Date.now();
  const stamp = (row) => ({ ...row, tripId: created.id, id: undefined, updatedAt: now });

  if (Array.isArray(payload.packingItems) && payload.packingItems.length) {
    await db.packingItems.bulkAdd(payload.packingItems.map(stamp));
  }
  if (Array.isArray(payload.bookings) && payload.bookings.length) {
    await db.bookings.bulkAdd(payload.bookings.map(stamp));
  }
  if (Array.isArray(payload.diaryEntries) && payload.diaryEntries.length) {
    await db.diaryEntries.bulkAdd(payload.diaryEntries.map(stamp));
  }
  if (Array.isArray(payload.budgetEntries) && payload.budgetEntries.length) {
    await db.budgetEntries.bulkAdd(payload.budgetEntries.map(stamp));
  }
  if (Array.isArray(payload.userEvents) && payload.userEvents.length) {
    await db.userEvents.bulkAdd(payload.userEvents.map(stamp));
  }
  if (Array.isArray(payload.photos) && payload.photos.length) {
    const photoRows = payload.photos.map((p) => ({
      tripId: created.id,
      stopId: p.stopId || null,
      caption: p.caption || '',
      width: p.width || null,
      height: p.height || null,
      takenAt: p.takenAt || null,
      blob: base64ToBlob(p.blob, p.blobType || 'image/jpeg'),
      thumb: base64ToBlob(p.thumb, p.thumbType || 'image/jpeg'),
      createdAt: p.createdAt || now,
      updatedAt: now
    }));
    await db.photos.bulkAdd(photoRows);
  }

  /* Refresh the live writable so the home dashboard picks up the
     restored trip without a full reload. */
  const { trips } = await import('$lib/stores/trips.js');
  trips.set(await listTrips());

  return await db.trips.get(created.id);
}
