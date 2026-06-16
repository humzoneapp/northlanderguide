/* ==================================================================
   Form-field validators.

   Intentionally minimal. The goal is one shared source of truth for
   email-shape, required-string, max-length checks so every form that
   ships (newsletter, advertiser sign-up, checkout email confirmation)
   uses the same rules instead of each handler rolling its own regex.

   Server-side validators in api/*.js should run the same shape on
   submitted payloads; share the regex by copying the constant rather
   than importing across the App/Guide split.
   ================================================================== */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when `s` looks like a syntactically valid email. */
export function isEmail(s) {
  return typeof s === 'string' && EMAIL_RE.test(s.trim());
}

/** True when `s` is a non-empty trimmed string. */
export function required(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

/** True when `s` is a string of length <= n. */
export function maxLen(s, n) {
  return typeof s === 'string' && s.length <= n;
}

/** Return a trimmed copy of `s`, clamped to at most `n` chars. */
export function trimToLen(s, n) {
  return String(s ?? '').trim().slice(0, n);
}

export const EMAIL_PATTERN = EMAIL_RE;
