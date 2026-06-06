/* ==================================================================
   Per-trip budget storage on top of the existing Dexie database
   (v3 schema adds budgetEntries). Entries are line items the user
   logs as they plan and travel. Currency is CAD by default; the
   formatter is opinionated so the UI doesn't need to thread currency
   through every component.
   ================================================================== */

import { db } from './trips.js';

/**
 * @typedef {Object} BudgetEntry
 * @property {number} id
 * @property {string} tripId
 * @property {string} label
 * @property {number} amount             - CAD, two-decimal precision
 * @property {string} category           - id from BUDGET_CATEGORIES
 * @property {string|null} [stopId]      - chapter to pin this spend to
 * @property {string|null} [spentDate]   - YYYY-MM-DD when the spend
 *   actually happened (added 2026-06-06). Optional, unindexed; defaults
 *   to today on add. Display layers prefer this over createdAt when
 *   present so a backdated meal lands in the right day on the Logbook.
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/* Five categories. `kind` mirrors the BookingChecklist's BOOKING_KINDS
   ids so a budget category can render with the same glyph - the trip
   page's add row swaps the old <select>Other</select> dropdown for a
   row of `BookingKindIcon` buttons via `bookingKindFor`. Order matches
   BOOKING_KINDS so the icon row reads the same in both surfaces. */
export const BUDGET_CATEGORIES = [
  { id: 'transport',  label: 'Transport',  color: '#7d3a1e', kind: 'train' },
  { id: 'lodging',    label: 'Lodging',    color: '#0a2d21', kind: 'room' },
  { id: 'food',       label: 'Food',       color: '#c4860f', kind: 'meal' },
  { id: 'activities', label: 'Activities', color: '#6b1d2e', kind: 'activity' },
  { id: 'other',      label: 'Other',      color: '#5a4f3d', kind: 'other' }
];

/** Booking-kind id for a given budget category (so BudgetTracker can
    render BookingKindIcon for each chip). Falls back to 'other'. */
export function bookingKindFor(categoryId) {
  const c = BUDGET_CATEGORIES.find((x) => x.id === categoryId);
  return c ? c.kind : 'other';
}

function isCategory(id) {
  return BUDGET_CATEGORIES.some((c) => c.id === id);
}

/** Newest-first feed so freshly added entries land at the top of
    the list - convenient when the user is rapidly logging spend. */
export async function listBudgetEntries(tripId) {
  if (!tripId) return [];
  const rows = await db.budgetEntries.where({ tripId }).toArray();
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/** Trim, validate, persist. Amount is coerced into a Number;
    negatives are clamped to 0 to avoid weird subtotals. `stopId` is
    optional (unindexed) so per-chapter ledger sections can pin a
    spend to a stop while the cover total stays trip-wide. Returns
    the new row's auto id, or null when inputs don't survive
    validation. */
export async function addBudgetEntry(tripId, { label, amount, category = 'other', stopId = null, spentDate = null } = {}) {
  const cleanLabel = String(label || '').trim();
  const amt = Number(amount);
  if (!cleanLabel) return null;
  if (Number.isNaN(amt)) return null;
  const now = Date.now();
  return db.budgetEntries.add({
    tripId,
    label: cleanLabel,
    amount: Math.max(0, Math.round(amt * 100) / 100),
    category: isCategory(category) ? category : 'other',
    stopId: stopId || null,
    spentDate: typeof spentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(spentDate) ? spentDate : null,
    createdAt: now,
    updatedAt: now
  });
}

export async function updateBudgetEntry(id, patch = {}) {
  if (id == null) return null;
  const row = await db.budgetEntries.get(Number(id));
  if (!row) return null;
  const next = {};
  if (patch.label !== undefined) {
    const v = String(patch.label || '').trim();
    if (!v) return null;
    next.label = v;
  }
  if (patch.amount !== undefined) {
    const v = Number(patch.amount);
    if (Number.isNaN(v)) return null;
    next.amount = Math.max(0, Math.round(v * 100) / 100);
  }
  if (patch.category !== undefined && isCategory(patch.category)) {
    next.category = patch.category;
  }
  if (patch.stopId !== undefined) {
    next.stopId = patch.stopId || null;
  }
  if (patch.spentDate !== undefined) {
    next.spentDate = typeof patch.spentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(patch.spentDate)
      ? patch.spentDate
      : null;
  }
  if (Object.keys(next).length === 0) return row;
  next.updatedAt = Date.now();
  await db.budgetEntries.update(Number(id), next);
  return db.budgetEntries.get(Number(id));
}

export async function deleteBudgetEntry(id) {
  if (id == null) return;
  await db.budgetEntries.delete(Number(id));
}

/** Sum every entry's amount. */
export function totalOf(entries) {
  return (entries || []).reduce((acc, e) => acc + Number(e.amount || 0), 0);
}

/** { categoryId: subtotal, ... } so the UI can render per-category
    chips without each component reimplementing the loop. */
export function breakdownByCategory(entries) {
  const out = {};
  for (const c of BUDGET_CATEGORIES) out[c.id] = 0;
  for (const e of entries || []) {
    const key = isCategory(e.category) ? e.category : 'other';
    out[key] += Number(e.amount || 0);
  }
  return out;
}

/** "$1,234.56" - en-CA so the thousands separator is a comma and
    the currency mark sits before the digits. */
export function formatAmount(n) {
  const v = Number(n || 0);
  if (Number.isNaN(v)) return '$0.00';
  return v.toLocaleString('en-CA', {
    style: 'currency',
    currency: 'CAD',
    currencyDisplay: 'symbol'
  });
}
