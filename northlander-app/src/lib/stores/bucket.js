/* ==================================================================
   Bucket list storage on top of the existing Dexie database (v2).
   Bucket items are GLOBAL, not scoped per-trip. They're places the
   user saw on the Guide (or anywhere) and wants to come back to
   "someday". Promoting a bucket item into a real trip booking
   happens through the existing /add hand-off route.
   ================================================================== */

import { db } from './trips.js';
import { writable } from 'svelte/store';
import { BOOKING_KINDS } from './bookings.js';

/**
 * @typedef {Object} BucketItem
 * @property {number} id
 * @property {string} name
 * @property {string} kind            - same five-bucket palette as bookings
 * @property {string|null} stopId
 * @property {string|null} address
 * @property {string|null} url        - back-link to the Guide listing
 * @property {string|null} source     - 'guide' | 'manual' | etc.
 * @property {string|null} notes
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/* Same kind palette as bookings so the icons + labels are
   consistent across the app. */
export { BOOKING_KINDS as BUCKET_KINDS };

function isKind(k) {
  return BOOKING_KINDS.some((b) => b.id === k);
}

/** Newest-first feed. */
export async function listBucketItems() {
  const rows = await db.bucketItems.toArray();
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getBucketItem(id) {
  if (id == null) return null;
  return db.bucketItems.get(Number(id));
}

export async function addBucketItem({
  name,
  kind = 'other',
  stopId = null,
  address = null,
  url = null,
  source = null,
  notes = null
} = {}) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  const now = Date.now();
  const id = await db.bucketItems.add({
    name: clean,
    kind: isKind(kind) ? kind : 'other',
    stopId: stopId || null,
    address: address || null,
    url: url || null,
    source: source || null,
    notes: notes ? String(notes).trim() || null : null,
    createdAt: now,
    updatedAt: now
  });
  bucketItems.set(await listBucketItems());
  return id;
}

export async function updateBucketItem(id, patch = {}) {
  if (id == null) return null;
  const row = await db.bucketItems.get(Number(id));
  if (!row) return null;
  const next = {};
  if (patch.name !== undefined) {
    const clean = String(patch.name || '').trim();
    if (!clean) return null;
    next.name = clean;
  }
  if (patch.kind !== undefined && isKind(patch.kind)) next.kind = patch.kind;
  if (patch.notes !== undefined) next.notes = patch.notes ? String(patch.notes).trim() || null : null;
  if (patch.stopId !== undefined) next.stopId = patch.stopId || null;
  if (Object.keys(next).length === 0) return row;
  next.updatedAt = Date.now();
  await db.bucketItems.update(Number(id), next);
  bucketItems.set(await listBucketItems());
  return db.bucketItems.get(Number(id));
}

export async function deleteBucketItem(id) {
  if (id == null) return;
  await db.bucketItems.delete(Number(id));
  bucketItems.set(await listBucketItems());
}

/* Live store. Subscribers re-render whenever a helper fires. SSR
   returns an empty list because IndexedDB doesn't exist in Node. */
export const bucketItems = writable(/** @type {BucketItem[]} */ ([]));

if (typeof window !== 'undefined') {
  listBucketItems().then((rows) => bucketItems.set(rows)).catch(() => bucketItems.set([]));
}
