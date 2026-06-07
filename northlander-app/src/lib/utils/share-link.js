/* ==================================================================
   Shareable trip link.

   We pack the trip and its child rows (packing, bookings, diary,
   budget) into a compressed base64url payload that lives in a URL
   fragment - the bit after `#`, which browsers don't send to servers.
   No backend; the recipient's app decodes the fragment, shows a
   preview, and writes the trip into their own IndexedDB on accept.

   Photos are intentionally excluded - the blobs are too large for a
   URL and feel personal. Bucket items are global, not trip-scoped,
   so they don't travel either.

   Token layout: `<version><base64url>`
     - version = '1' => zlib-deflate-raw of UTF-8 JSON
     - version = '0' => UTF-8 JSON as-is (used when the browser is too
                        old to expose CompressionStream)
   ================================================================== */

const FIELD_BOOKING = [
  'title', 'kind', 'status', 'dueDate', 'stopId',
  'startTime', 'checkIn', 'checkOut', 'address',
  'contact', 'confirmation', 'notes'
];
const FIELD_PACKING = ['name', 'packed', 'listName'];
const FIELD_DIARY   = ['text', 'stopId', 'createdAt'];
const FIELD_BUDGET  = ['label', 'amount', 'category', 'stopId', 'spentDate', 'createdAt'];
const FIELD_TRIP    = [
  'name', 'stopIds', 'color', 'strap', 'colorId',
  'departureDate', 'direction',
  /* Dated multi-stop route + multi-stop return added to the
     payload 2026-06-07; without these the recipient was rebuilding
     the trip with no actual stops or dates. */
  'stops', 'returnStops', 'returnDate', 'returnStopId',
  /* Packing list metadata so a renamed default or named lists
     survive the round-trip. */
  'defaultPackingListName', 'extraPackingLists',
  /* Trip-wide budget target so the share recipient sees the same
     "Spent / Left of target" math. */
  'budgetTarget'
];

function pickFields(row, fields) {
  const out = {};
  for (const f of fields) {
    if (row[f] !== undefined && row[f] !== null) out[f] = row[f];
  }
  return out;
}

/** Build the plain payload object that will get serialised. Keeps it
    deterministic: same input always produces the same JSON, so two
    users sharing the same trip get the same link. */
export function buildSharePayload({ trip, packing = [], bookings = [], diary = [], budget = [] }) {
  return {
    v: 1,
    trip: pickFields(trip || {}, FIELD_TRIP),
    packing: packing.map((r) => pickFields(r, FIELD_PACKING)),
    bookings: bookings.map((r) => pickFields(r, FIELD_BOOKING)),
    diary: diary.map((r) => pickFields(r, FIELD_DIARY)),
    budget: budget.map((r) => pickFields(r, FIELD_BUDGET))
  };
}

/* ---------- base64url ---------- */

function bytesToBase64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(token) {
  const std = String(token).replace(/-/g, '+').replace(/_/g, '/');
  const pad = std.length % 4 ? std + '='.repeat(4 - (std.length % 4)) : std;
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- compression (deflate-raw, when available) ---------- */

async function deflate(text) {
  if (typeof CompressionStream === 'undefined') return null;
  const input = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = await new Response(input).arrayBuffer();
  return new Uint8Array(buf);
}

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') return null;
  const input = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(input).text();
}

/* ---------- public API ---------- */

/** Encode a payload into a token string suitable for a URL fragment. */
export async function encodePayload(payload) {
  const json = JSON.stringify(payload);
  const compressed = await deflate(json);
  if (compressed && compressed.length < new TextEncoder().encode(json).length) {
    return '1' + bytesToBase64Url(compressed);
  }
  return '0' + bytesToBase64Url(new TextEncoder().encode(json));
}

/** Decode a token back into a payload, or null on any failure. */
export async function decodePayload(token) {
  if (!token || typeof token !== 'string') return null;
  const version = token.charAt(0);
  const body = token.slice(1);
  try {
    const bytes = base64UrlToBytes(body);
    let json;
    if (version === '1') {
      json = await inflate(bytes);
      if (!json) return null;
    } else if (version === '0') {
      json = new TextDecoder().decode(bytes);
    } else {
      return null;
    }
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !parsed.trip) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Build the full shareable URL for the current origin. */
export function buildShareUrl(token) {
  const origin =
    typeof window !== 'undefined' && window.location
      ? window.location.origin
      : 'https://northlander.app';
  return `${origin}/share#${token}`;
}
