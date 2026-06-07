/* ==================================================================
   Toast queue.

   Reactive writable store that holds the currently-visible toasts.
   Components call `pushToast({ message, undo })` after a destructive
   action; the queue renders the message + an Undo button for ~5
   seconds. Tapping Undo runs the undo callback (typically re-inserts
   the deleted row) and clears the toast.

   Every toast carries an auto-incrementing id so the renderer can
   key the loop and animate individual entries in / out.
   ================================================================== */

import { writable } from 'svelte/store';

/** @typedef {{ id: number, message: string, undo?: () => any | Promise<any>, kind?: 'info' | 'success' | 'warn' }} Toast */

/** @type {import('svelte/store').Writable<Toast[]>} */
export const toasts = writable([]);

let nextId = 1;
const timers = new Map();

/** Default toast dwell. Long enough to read the message + reach the
    Undo button on a phone; short enough that it never feels stuck. */
const DEFAULT_TTL_MS = 5000;

/* Push a new toast and start its dismissal timer. Returns the toast
   id so a caller can dismiss it programmatically (rare). */
export function pushToast({ message, undo, kind = 'info', ttl = DEFAULT_TTL_MS } = {}) {
  if (!message) return null;
  const id = nextId++;
  const toast = { id, message, undo, kind };
  toasts.update((q) => [...q, toast]);
  const handle = setTimeout(() => dismiss(id), ttl);
  timers.set(id, handle);
  return id;
}

/* Remove a toast from the queue and clear its dismissal timer.
   Safe to call multiple times - missing ids are silently ignored. */
export function dismiss(id) {
  const handle = timers.get(id);
  if (handle) {
    clearTimeout(handle);
    timers.delete(id);
  }
  toasts.update((q) => q.filter((t) => t.id !== id));
}

/* Run a toast's undo callback then dismiss it. Wrapped so any
   thrown error in the callback still clears the toast. */
export async function runUndo(id) {
  let snapshot;
  toasts.update((q) => {
    snapshot = q.find((t) => t.id === id);
    return q;
  });
  if (!snapshot || typeof snapshot.undo !== 'function') {
    dismiss(id);
    return;
  }
  try {
    await snapshot.undo();
  } catch (_) {
    /* Undo failed - we still dismiss so the user isn't stuck. */
  }
  dismiss(id);
}
