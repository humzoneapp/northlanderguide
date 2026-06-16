/* ==================================================================
   The Dexie database.

   Hoisted out of trips.js so any future table (subscriptions /
   accounts / licenses for the paid tier, advertiser records, etc)
   can sit alongside the existing trip-scoped tables without importing
   from a sibling store that has nothing to do with it.

   Bumping the version triggers Dexie's upgrade path. Keep migrations
   small, additive, and well-commented; the existing v1..v5 are all
   table-additive so a returning user opens straight into the new
   schema with no data migration.
   ================================================================== */

import Dexie from 'dexie';

export const db = new Dexie('northlander');

/* v1 - original four trip-scoped tables. */
db.version(1).stores({
  trips: '&id, name, updatedAt',
  packingItems: '++id, tripId, name, packed',
  bookings: '++id, tripId, kind, status, dueDate',
  diaryEntries: '++id, tripId, stopId, createdAt'
});
/* v2 - adds bucketItems for the cross-trip wishlist. */
db.version(2).stores({
  bucketItems: '++id, kind, stopId, createdAt'
});
/* v3 - adds budgetEntries for the per-trip budget tracker. */
db.version(3).stores({
  budgetEntries: '++id, tripId, category, createdAt'
});
/* v4 - photos table for the per-trip image album. Full-res +
   thumbnail Blobs live in the row. */
db.version(4).stores({
  photos: '++id, tripId, stopId, takenAt, createdAt'
});
/* v5 - userEvents table for events the user adds themselves
   alongside the Guide's pull. */
db.version(5).stores({
  userEvents: '++id, tripId, stopId, startDate, createdAt'
});
