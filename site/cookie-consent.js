/* ==================================================================
   COOKIE-CONSENT - GDPR-aware notice banner.

   What it covers:
     - localStorage entries the site sets (sort/filter state, the
       consent flag itself, etc.)
     - Third-party cookies set by services we load (Google Fonts,
       Phosphor Icons CDN, Vercel access logs).

   What it does NOT do:
     - We don't run analytics, advertising, or tracking cookies, so
       there's nothing for the "reject" button to actually disable
       beyond what the user has already chosen by not running any.
     - The banner injects after DOMContentLoaded so it can't affect
       indexable HTML or initial paint.

   Compliance notes:
     - Accept and Reject buttons are equally prominent (per Article
       7 GDPR / EDPB guidance).
     - Consent is opt-in: nothing is set until the user clicks one.
     - The choice is stored in localStorage; clearing site data
       resurfaces the banner.
   ================================================================== */
(function () {
  'use strict';

  const KEY = 'nlg-cookie-consent';

  function alreadyDecided() {
    try { return !!(window.localStorage && localStorage.getItem(KEY)); }
    catch (e) { return true; /* private mode: skip rather than nag */ }
  }

  function persist(choice) {
    try { localStorage.setItem(KEY, choice + ':' + new Date().toISOString()); }
    catch (e) { /* private mode: silently no-op */ }
  }

  function injectBanner() {
    const banner = document.createElement('div');
    banner.className = 'cookie-banner';
    /* Non-modal: the page underneath stays interactive while the
       user decides. role="region" + aria-label identify the banner
       without promising dialog-style focus management (which a
       non-modal notice shouldn't trap). aria-live="polite" lets
       screen readers announce the banner on inject without rudely
       interrupting whatever else is being read. */
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', 'Cookie and storage notice');
    banner.innerHTML =
      '<div class="cookie-banner-inner">'
      +   '<div class="cookie-banner-text">'
      +     '<strong>Cookies + storage.</strong> NorthlanderGuide.com uses essential browser storage to remember your filter preferences and keep the site working. We do not run analytics, advertising, or tracking cookies. Third-party services we load (Google Fonts, Phosphor Icons, Vercel hosting logs) may set their own cookies; see our <a href="/privacy/">Privacy Policy</a> for details.'
      +   '</div>'
      +   '<div class="cookie-banner-actions">'
      +     '<button type="button" class="cookie-banner-btn cookie-banner-reject" data-action="reject">Reject non-essential</button>'
      +     '<button type="button" class="cookie-banner-btn cookie-banner-accept" data-action="accept">Accept all</button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(banner);

    banner.addEventListener('click', function (e) {
      const t = e.target;
      const action = t && t.getAttribute && t.getAttribute('data-action');
      if (action !== 'accept' && action !== 'reject') return;
      persist(action);
      banner.classList.add('cookie-banner-out');
      setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 240);
    });
  }

  function init() {
    if (alreadyDecided()) return;
    injectBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
