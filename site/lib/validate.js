/* ==================================================================
   NorthlanderGuide.com client-side validators.

   One shared source of truth for email shape, required-string, and
   max-length checks so every form on the Guide (tip submission,
   event submission, the upcoming newsletter capture) runs the same
   rules. Mirrors the regex used by server-side handlers in api/*.js.

   Attached to window.NL so HTML pages can drop in via a normal
   <script src="/lib/validate.js"></script> tag.
   ================================================================== */
(function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function isEmail(s) {
    return typeof s === 'string' && EMAIL_RE.test(s.trim());
  }
  function required(s) {
    return typeof s === 'string' && s.trim().length > 0;
  }
  function maxLen(s, n) {
    return typeof s === 'string' && s.length <= n;
  }
  function trimToLen(s, n) {
    return String(s == null ? '' : s).trim().slice(0, n);
  }

  window.NL = window.NL || {};
  window.NL.isEmail = isEmail;
  window.NL.required = required;
  window.NL.maxLen = maxLen;
  window.NL.trimToLen = trimToLen;
  window.NL.EMAIL_PATTERN = EMAIL_RE;
})();
