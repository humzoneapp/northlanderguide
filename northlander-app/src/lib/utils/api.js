/* ==================================================================
   Tiny fetch wrapper for the App's server-side endpoints.

   Anywhere the App POSTs JSON to its own /api/ routes (newsletter
   subscribe, Stripe checkout, advertiser checkout, etc.) should go
   through `postJson` so the error story stays consistent: a thrown
   ApiError with `status` and `body` regardless of the route.

   Read-only fetches that just want JSON back use `getJson`.

   These are deliberately small. The point is one shared shape,
   not framework-level abstraction.
   ================================================================== */

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, body?: any }} [opts]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status ?? 0;
    this.body = opts.body ?? null;
  }
}

async function parseBody(res) {
  try { return await res.json(); }
  catch (_) { return null; }
}

/** POST a JSON payload, parse a JSON response, throw ApiError on 4xx/5xx. */
export async function postJson(url, payload, init = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    body: JSON.stringify(payload ?? {}),
    ...init
  });
  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(
      (body && body.error) || `Request failed (${res.status})`,
      { status: res.status, body }
    );
  }
  return body;
}

/** GET a JSON response, throw ApiError on 4xx/5xx. */
export async function getJson(url, init = {}) {
  const res = await fetch(url, init);
  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(
      (body && body.error) || `Request failed (${res.status})`,
      { status: res.status, body }
    );
  }
  return body;
}
