/* ==================================================================
   COPY-PROTECT - soft deterrent against casual copy-paste.

   What it does:
     1. Blocks the right-click context menu on editorial content
        (but not on inputs, links, the legal pages, or footer text
        - those still need to work normally for usability).
     2. Stamps long clipboard copies with a source attribution line
        ("Source: NorthlanderGuide.com - <url>"), so anyone pasting
        the text into a doc or another site gets a credit they have
        to manually delete. Short copies (an address, phone number,
        date) pass through unchanged.

   What it does NOT do, by design:
     - It does not stop a determined copier (view source, browser
       extensions, reader mode, voice dictation, screenshots all
       still work). This is a soft deterrent, not protection.
     - It does not affect SEO: Googlebot does not execute click
       handlers, does not honor user-select CSS, and reads the page
       HTML directly. The rendered indexable content is unchanged.
     - It does not touch /privacy or /terms. Legal copy needs to be
       quotable for review and dispute.

   Load on every editorial page (home, /stops, /events, /plan, the
   submit-event modal page). Skip on /privacy and /terms.
   ================================================================== */
(function () {
  'use strict';

  /* The .legal-page body class tells us to leave the document alone.
     Same check inside each handler so any future page that adopts
     the class gets the bypass for free. */
  function isLegalPage() {
    return document.body && document.body.classList.contains('legal-page');
  }

  /* Selectors where the visitor genuinely needs the right-click /
     copy behaviour to work: form inputs, links (so they can copy a
     URL via right-click), buttons that act as inputs (the kind
     wrapping editable elements), explicit opt-ins via .allow-copy,
     and anything inside the legal article body. */
  const ALLOW_NATIVE = 'input, textarea, select, [contenteditable], a[href], .allow-copy, .legal-inner, .legal-inner *';

  document.addEventListener('contextmenu', function (e) {
    if (isLegalPage()) return;
    const t = e.target;
    if (t && t.closest && t.closest(ALLOW_NATIVE)) return;
    e.preventDefault();
  });

  /* Stamp the clipboard on substantial copies. Threshold is 80 chars
     so a single address ("620 Church St, Toronto, ON M4Y 2G2") still
     copies cleanly. Long editorial passages get the source line
     appended. Wrapped in try/catch in case the browser refuses
     clipboardData.setData (older Safari occasionally throws). */
  document.addEventListener('copy', function (e) {
    if (isLegalPage()) return;
    const sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString();
    if (!text || text.length < 80) return;
    try {
      const stamped = text + '\n\nSource: NorthlanderGuide.com (' + (window.location && window.location.href ? window.location.href : 'https://northlanderguide.com') + ')';
      e.clipboardData.setData('text/plain', stamped);
      e.preventDefault();
    } catch (err) {
      /* Default copy behaviour kicks in. */
    }
  });

  /* Block native image drag (cosmetic - it doesn't really protect
     anything, but it removes the casual "drag the photo onto your
     desktop" gesture). Forms and links unaffected. */
  document.addEventListener('dragstart', function (e) {
    if (isLegalPage()) return;
    const t = e.target;
    if (t && t.tagName === 'IMG') e.preventDefault();
  });
})();
