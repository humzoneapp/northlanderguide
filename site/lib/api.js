/* ==================================================================
   NorthlanderGuide.com client-side fetch helper.

   Anywhere a form on the Guide POSTs JSON to /api/* (subscribe,
   submit-event, submit-tip, etc.) should go through `NL.postJson`
   so the error story is one shape: a thrown ApiError with `status`
   and `body` properties. Read-only fetches use `NL.getJson`.

   This file is plain script, no module, attached to a single
   `window.NL` namespace so HTML pages can drop it in with a normal
   <script src="/lib/api.js"></script> tag.
   ================================================================== */
(function () {
  'use strict';

  function ApiError(message, status, body) {
    const err = new Error(message);
    err.name = 'ApiError';
    err.status = status || 0;
    err.body = body || null;
    return err;
  }

  async function parseBody(res) {
    try { return await res.json(); }
    catch (_) { return null; }
  }

  async function postJson(url, payload, init) {
    const opts = init || {};
    const res = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
      body: JSON.stringify(payload || {})
    });
    const body = await parseBody(res);
    if (!res.ok) {
      throw ApiError(
        (body && body.error) || 'Request failed (' + res.status + ')',
        res.status,
        body
      );
    }
    return body;
  }

  async function getJson(url, init) {
    const res = await fetch(url, init || {});
    const body = await parseBody(res);
    if (!res.ok) {
      throw ApiError(
        (body && body.error) || 'Request failed (' + res.status + ')',
        res.status,
        body
      );
    }
    return body;
  }

  window.NL = window.NL || {};
  window.NL.postJson = postJson;
  window.NL.getJson = getJson;
  window.NL.ApiError = ApiError;
})();
