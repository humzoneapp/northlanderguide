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

  function onKey(e) { if (e.key === 'Escape') close(); }

  function open() {
    if (!overlay) build();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  }

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
