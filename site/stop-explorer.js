/* ==================================================================
   STOP EXPLORER - full-screen overlay listing all 16 stops, south to
   north. Shared by the home page and the stop pages. Triggered by the
   lantern button via window.openStopExplorer().
   ================================================================== */
(function () {
  'use strict';
  let overlay = null;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function fmtTime(t) {
    if (!t) return '';
    const m = String(t).match(/^(\d+):(\d+)/);
    if (!m) return String(t);
    const h = +m[1], mi = +m[2];
    if (h === 0 && mi === 0) return 'Start of the line';
    return ((h ? h + 'h ' : '') + (mi ? mi + 'm' : '')).trim() + ' from Toronto';
  }

  function card(s, i) {
    const img = '/' + String(s.image || '').replace(/^\/+/, '');
    const t = fmtTime(s.time);
    return '<a class="se-card" href="/stops/' + s.id + '">'
      + '<div class="se-card-img"><img src="' + esc(img) + '" alt="' + esc(s.name) + '" loading="lazy"></div>'
      + '<div class="se-card-body"><span class="se-num">' + (i + 1) + '</span>'
      + '<h3>' + esc(s.name) + '</h3>'
      + (t ? '<span class="se-time">' + esc(t) + '</span>' : '')
      + '<span class="se-explore">Explore &rarr;</span></div></a>';
  }

  function build() {
    const stops = window.STOPS || [];
    overlay = document.createElement('div');
    overlay.className = 'stop-explorer';
    overlay.id = 'stopExplorer';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="se-panel" role="dialog" aria-label="All stops">'
      + '<button class="se-close" type="button" aria-label="Close">&times;</button>'
      + '<div class="se-head"><span class="se-kicker">The Northlander Route</span>'
      + '<h2>Explore Every Stop</h2><p>Sixteen stops, south to north.</p></div>'
      + '<div class="se-grid">' + stops.map((s, i) => card(s, i)).join('') + '</div>'
      + '</div>';
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.se-close').addEventListener('click', close);
    document.body.appendChild(overlay);
  }

  /* Track which element opened the overlay so close() can return
     focus to it. Open from a lantern button -> close lands back on
     the lantern button; open from a header link -> close lands back
     on the header link. Without this, focus drops to <body> and
     keyboard users lose their place on the page. */
  let lastTrigger = null;

  /* Collect every focusable descendant of the panel that's currently
     visible. The overlay contains the close button and 16 stop card
     anchors, so the trap cycles through those plus Tab landing back
     on the close button. */
  function focusableInside(root) {
    const sel = 'a[href], button:not([disabled]), input:not([disabled]), '
              + 'select:not([disabled]), textarea:not([disabled]), '
              + '[tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll(sel))
      .filter(el => el.offsetParent !== null);
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab' || !overlay) return;
    const list = focusableInside(overlay);
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    /* Wrap Tab focus inside the panel: from the last element forward
       goes to the first; from the first element backward goes to the
       last. Native <dialog> gets this for free but a custom overlay
       has to do it by hand. */
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }

  function open(trigger) {
    if (!overlay) build();
    lastTrigger = trigger || document.activeElement;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    /* Move focus into the panel so screen readers announce the
       dialog and Tab cycles the trap instead of the page below. */
    const closeBtn = overlay.querySelector('.se-close');
    if (closeBtn) try { closeBtn.focus(); } catch (e) {}
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    if (lastTrigger && typeof lastTrigger.focus === 'function') {
      try { lastTrigger.focus(); } catch (e) {}
    }
    lastTrigger = null;
  }

  /* The existing inline `onclick="openStopExplorer()"` call sites
     pass no argument; `open()` falls back to `document.activeElement`
     so close() returns focus to whichever button or link was
     clicked. Browsers vary on whether anchor clicks focus the
     anchor; in the worst case focus lands on <body>, which is the
     same place focus would have been without the trap. */
  window.openStopExplorer = open;
  window.closeStopExplorer = close;

  /* Shareable deep link: opening a page at #explore reveals the overlay. */
  if (location.hash === '#explore') open();

  /* ---- Header "More" dropdown menu ---- */
  function initDropdown() {
    const dd = document.getElementById('navDropdown');
    if (!dd) return;
    const btn = dd.querySelector('.nav-dropdown-toggle');
    function setOpen(yes) {
      dd.classList.toggle('open', yes);
      btn.setAttribute('aria-expanded', yes ? 'true' : 'false');
    }
    btn.addEventListener('click', e => {
      e.stopPropagation();
      setOpen(!dd.classList.contains('open'));
    });
    document.addEventListener('click', e => {
      if (!dd.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') setOpen(false);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDropdown);
  else initDropdown();
})();
