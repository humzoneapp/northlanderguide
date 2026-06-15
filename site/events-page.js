/* ==================================================================
   EVENTS PAGE - dedicated /events route renderer.

   Renders the full route-wide events catalogue at /events/ using the
   same vocabulary as the homepage filter (.hev-filters) and grid
   (.hev-grid + .hev-card). Self-contained so the page does not load
   the homepage's stop-chip / route-map / listings stack.

   Code is intentionally a near-copy of the events-related helpers in
   site/app.js. When step 3 (homepage curated strip) lands the
   homepage will stop rendering the full route-wide grid, at which
   point the duplication on the home side shrinks naturally. A future
   refactor can extract these helpers into a shared module if we ever
   add a third event surface.
   ================================================================== */
(function () {
  'use strict';

  const EVENT_CATEGORIES = [
    'Music & Live Performance', 'Food & Drink', 'Outdoor & Adventure',
    'Arts & Culture', 'Festivals & Fairs', 'Markets & Shopping',
    'Sports & Recreation', 'Community & Family', 'History & Heritage'
  ];

  const HEV_PAGE_SIZE = 9;

  /* Filter state lives on window so deep-link query support could be
     added later without restructuring. Defaults to "show everything". */
  window.eventFilters = window.eventFilters || {
    month: 'all',     // 'all' | numeric key (YYYYMM) | 'recurring'
    stop: 'all',      // 'all' | a stop id slug
    category: 'all',  // 'all' | one of EVENT_CATEGORIES
    price: 'all',     // 'all' | 'free' | 'paid'
    walk: 'all',      // 'all' | 15 | 30 | 60
    page: 1
  };

  function escHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  function formatEventDate(ev){
    if(!ev.startDate) return ev.recurring ? (ev.recurrencePattern || 'Recurring') : '';
    const fmt = iso => {
      const [y, m, d] = iso.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m-1, d));
      return dt.toLocaleDateString('en-CA', { month:'short', day:'numeric', timeZone:'UTC' });
    };
    const start = fmt(ev.startDate);
    const end = ev.endDate && ev.endDate !== ev.startDate ? ' - ' + fmt(ev.endDate) : '';
    const time = ev.startTime ? ', ' + ev.startTime : '';
    return start + end + time;
  }

  function monthKeyForEvent(ev){
    if(!ev.startDate) return 'recurring';
    const [y, m] = ev.startDate.split('-').map(Number);
    return y * 100 + m;
  }

  /* Every month an event spans, from Start Date through End Date. A
     May-Sept run returns [202605, 202606, ..., 202609]. Used both for
     filter matching ("show me everything happening in July, even if
     it started in May") and for the When-chip discovery so a chip
     appears for every relevant month. Hard guard on a runaway loop
     in case bad data lands a > 5-year span. */
  function monthKeysForEvent(ev){
    if(!ev.startDate) return [];
    const [sy, sm] = ev.startDate.split('-').map(Number);
    const endIso = ev.endDate || ev.startDate;
    const [ey, em] = endIso.split('-').map(Number);
    const keys = [];
    let y = sy, m = sm;
    for (let i = 0; i < 60; i++) {
      keys.push(y * 100 + m);
      if (y > ey || (y === ey && m >= em)) break;
      m++;
      if (m > 12) { y++; m = 1; }
    }
    return keys;
  }

  function monthLabel(key){
    const y = Math.floor(key / 100);
    const m = key % 100;
    const dt = new Date(Date.UTC(y, m-1, 1));
    return dt.toLocaleDateString('en-CA', { month:'long', year:'numeric', timeZone:'UTC' });
  }

  function eventCardHtml(ev){
    const when = formatEventDate(ev);
    const link = ev.eventUrl || ev.ticketUrl || '';
    const tag  = link ? 'a' : 'div';
    const href = link ? ' href="' + escHtml(link) + '" target="_blank" rel="noopener"' : '';
    const priceLabel = ev.free ? 'Free' : (ev.price || '');
    const stopName = ev.stop || '';
    const walk = (typeof ev.walkMins === 'number')
      ? '<span class="hev-walk"><i class="ph-light ph-person-simple-walk" aria-hidden="true"></i> ' + ev.walkMins + ' min walk</span>'
      : '';
    const family = ev.familyFriendly
      ? '<span class="hev-family" aria-label="Family friendly"><i class="ph-light ph-users-three" aria-hidden="true"></i> Family friendly</span>'
      : '';
    const metaRow = (walk || family)
      ? '<div class="hev-meta">' + walk + family + '</div>'
      : '';
    /* Defense in depth: events-data.js already bakes a placeholder URL
       into every row, but if a stale data file ever ships without one
       a generic events photo still renders so the card never feels
       broken. Same URL the sync uses. */
    const imgSrc = ev.imageUrl || 'https://northlanderguide.com/images/northlander-events-and-festivals.jpeg';
    /* Map query prefers address (the full street address Airtable
       captures) over venue, because Google search results are sharper
       on a real address. Falls back to venue when no address is set so
       named landmarks still resolve. Joining the two was the previous
       behaviour and produced noisy queries with duplicated venue names. */
    const mapQ = (ev.address && String(ev.address).trim())
              || (ev.venue && String(ev.venue).trim())
              || '';
    const mapUrl = mapQ ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQ) : '';
    const mapBtn = mapUrl
      ? '<button type="button" class="hev-mapbtn" data-mapurl="' + escHtml(mapUrl) + '" aria-label="View this event on Google Maps"><i class="ph-light ph-map-pin" aria-hidden="true"></i> Map</button>'
      : '';
    return '<' + tag + ' class="hev-card"' + href + '>'
      + '<div class="hev-img" style="background-image:url(\'' + escHtml(imgSrc) + '\')"></div>'
      + '<div class="hev-body">'
      +   (when ? '<div class="hev-when">' + escHtml(when) + '</div>' : '')
      +   '<h4 class="hev-name">' + escHtml(ev.name) + '</h4>'
      +   '<div class="hev-stop">' + escHtml(stopName) + (ev.venue ? ' · ' + escHtml(ev.venue) : '') + '</div>'
      +   (ev.description ? '<p class="hev-desc">' + escHtml(ev.description) + '</p>' : '')
      +   metaRow
      +   '<div class="hev-foot">'
      +     (priceLabel ? '<span class="hev-price">' + escHtml(priceLabel) + '</span>' : '<span></span>')
      +     '<span class="hev-foot-actions">' + mapBtn
      +       (link ? '<span class="hev-cta">More info <i class="ph-light ph-arrow-up-right" aria-hidden="true"></i></span>' : '')
      +     '</span>'
      +   '</div>'
      + '</div>'
      + '</' + tag + '>';
  }

  /* Delegated map-button handler. preventDefault + stopPropagation so
     the outer card <a> doesn't also fire. Capture phase so it runs
     before the card link's default navigation. */
  document.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest && e.target.closest('.hev-mapbtn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const url = btn.getAttribute('data-mapurl');
    if (url) window.open(url, '_blank', 'noopener');
  }, true);

  function eventMatchesFilters(ev, f) {
    if (f.month !== 'all') {
      if (f.month === 'recurring') {
        if (!(ev.recurring || !ev.startDate)) return false;
      } else {
        if (ev.recurring || !ev.startDate) return false;
        if (!monthKeysForEvent(ev).includes(f.month)) return false;
      }
    }
    if (f.stop !== 'all' && ev.stopId !== f.stop) return false;
    if (f.category !== 'all' && ev.category !== f.category) return false;
    if (f.price === 'free' && !ev.free) return false;
    if (f.price === 'paid' && ev.free) return false;
    if (f.walk !== 'all') {
      if (typeof ev.walkMins !== 'number') return false;
      if (ev.walkMins > f.walk) return false;
    }
    return true;
  }

  function eventsFilterBarHtml(allEvents, f) {
    const monthSet = new Set();
    let hasRecurring = false;
    for (const ev of allEvents) {
      if (ev.recurring || !ev.startDate) { hasRecurring = true; continue; }
      for (const k of monthKeysForEvent(ev)) monthSet.add(k);
    }
    const monthKeys = Array.from(monthSet).sort((a,b)=>a-b);

    /* When is now a dropdown rather than a chip row. The chip row
       blew out to 10+ pills once a season's worth of months landed,
       and on mobile the row crowded out the rest of the filter
       bar. A dropdown reads as one slot regardless of how many
       months are loaded. Year is suffixed in the option label only
       when the data spans more than one calendar year. */
    const yearsInSet = new Set(monthKeys.map(k => Math.floor(k/100)));
    const showYearInLabel = yearsInSet.size > 1;
    const monthLongLabel = key => {
      const y = Math.floor(key/100), m = key%100;
      const dt = new Date(Date.UTC(y, m-1, 1));
      const m_str = dt.toLocaleDateString('en-CA', {month:'long', timeZone:'UTC'});
      return showYearInLabel ? m_str + ' ' + y : m_str;
    };
    const chip = (group, value, label, active) =>
      '<button type="button" class="hev-chip' + (active ? ' is-active' : '') + '" data-filter-group="' + group + '" data-filter-value="' + escHtml(String(value)) + '">' + escHtml(label) + '</button>';

    const monthOpts = ['<option value="all">Any time</option>']
      .concat(hasRecurring ? ['<option value="recurring"' + (f.month === 'recurring' ? ' selected' : '') + '>Recurring</option>'] : [])
      .concat(monthKeys.map(k => '<option value="' + k + '"' + (f.month === k ? ' selected' : '') + '>' + escHtml(monthLongLabel(k)) + '</option>'))
      .join('');

    const categoryOpts = ['<option value="all">Any category</option>']
      .concat(EVENT_CATEGORIES.map(c => '<option value="' + escHtml(c) + '"' + (f.category === c ? ' selected' : '') + '>' + escHtml(c) + '</option>'))
      .join('');

    /* Build the Where dropdown only from stops that actually have at
       least one event. Sort south-to-north along the route using the
       global STOPS catalogue. */
    const stopsWithEvents = new Set(allEvents.map(ev => ev.stopId).filter(Boolean));
    const stopOpts = ['<option value="all">Anywhere on the route</option>']
      .concat(
        (window.STOPS || [])
          .filter(s => stopsWithEvents.has(s.id))
          .map(s => '<option value="' + escHtml(s.id) + '"' + (f.stop === s.id ? ' selected' : '') + '>' + escHtml(s.name) + '</option>')
      )
      .join('');

    const priceChips = [
      chip('price', 'all', 'Any', f.price === 'all'),
      chip('price', 'free', 'Free', f.price === 'free'),
      chip('price', 'paid', 'Paid', f.price === 'paid')
    ].join('');

    const walkChips = [
      chip('walk', 'all', 'Any', f.walk === 'all'),
      chip('walk', 15, '15 min', f.walk === 15),
      chip('walk', 30, '30 min', f.walk === 30),
      chip('walk', 60, '1 hr', f.walk === 60)
    ].join('');

    const anyActive = f.month !== 'all' || f.stop !== 'all' || f.category !== 'all' || f.price !== 'all' || f.walk !== 'all';

    return ''
      + '<div class="hev-filters" id="eventFilters">'
      +   '<div class="hev-filters-head">'
      +     (anyActive ? '<button type="button" class="hev-reset" id="eventFiltersReset"><i class="ph-light ph-x" aria-hidden="true"></i> Clear filters</button>' : '')
      +   '</div>'
      +   '<div class="hev-filter-grid">'
      +     '<section class="hev-filter-section">'
      +       '<div class="hev-filter-section-label"><i class="ph-light ph-calendar-blank" aria-hidden="true"></i><span>When</span></div>'
      +       '<select class="hev-select" id="eventMonthSelect">' + monthOpts + '</select>'
      +     '</section>'
      +     '<section class="hev-filter-section">'
      +       '<div class="hev-filter-section-label"><i class="ph-light ph-map-pin" aria-hidden="true"></i><span>Where</span></div>'
      +       '<select class="hev-select" id="eventStopSelect">' + stopOpts + '</select>'
      +     '</section>'
      +     '<section class="hev-filter-section">'
      +       '<div class="hev-filter-section-label"><i class="ph-light ph-tag" aria-hidden="true"></i><span>What</span></div>'
      +       '<select class="hev-select" id="eventCategorySelect">' + categoryOpts + '</select>'
      +     '</section>'
      +     '<section class="hev-filter-section">'
      +       '<div class="hev-filter-section-label"><i class="ph-light ph-currency-circle-dollar" aria-hidden="true"></i><span>Price</span></div>'
      +       '<div class="hev-chip-row">' + priceChips + '</div>'
      +     '</section>'
      +     '<section class="hev-filter-section">'
      +       '<div class="hev-filter-section-label"><i class="ph-light ph-person-simple-walk" aria-hidden="true"></i><span>Walk time</span></div>'
      +       '<div class="hev-chip-row">' + walkChips + '</div>'
      +     '</section>'
      +   '</div>'
      + '</div>';
  }

  function sortEventsList(arr) {
    return arr.sort((a,b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      const ad = a.startDate || '9999-12-31';
      const bd = b.startDate || '9999-12-31';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  function eventsPageList(current, total) {
    if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
    const pages = new Set([1, total, current - 1, current, current + 1]);
    const ordered = Array.from(pages).filter(n => n >= 1 && n <= total).sort((a,b) => a-b);
    const out = [];
    for (let i = 0; i < ordered.length; i++) {
      if (i && ordered[i] - ordered[i-1] > 1) out.push('...');
      out.push(ordered[i]);
    }
    return out;
  }

  function eventsPaginationHtml(current, total) {
    if (total <= 1) return '';
    const items = eventsPageList(current, total);
    const btns = items.map(p => {
      if (p === '...') return '<span class="hev-pageellipsis">...</span>';
      return '<button type="button" class="hev-pagebtn' + (p === current ? ' is-active' : '') + '" data-page="' + p + '">' + p + '</button>';
    }).join('');
    return '<nav class="hev-pagination" aria-label="Event pagination">'
      + '<button type="button" class="hev-pagebtn hev-pagenav" data-page="' + (current - 1) + '"' + (current === 1 ? ' disabled' : '') + ' aria-label="Previous page">'
      +   '<i class="ph-light ph-caret-left" aria-hidden="true"></i> Prev'
      + '</button>'
      + btns
      + '<button type="button" class="hev-pagebtn hev-pagenav" data-page="' + (current + 1) + '"' + (current === total ? ' disabled' : '') + ' aria-label="Next page">'
      +   'Next <i class="ph-light ph-caret-right" aria-hidden="true"></i>'
      + '</button>'
      + '</nav>';
  }

  /* Render the filtered list into `target`. Groups dated events by
     "Month YYYY", surfaces Recurring at the bottom in its own group,
     paginates the dated set so the page never balloons even when a
     full season is on the route. */
  function renderEventsGridInto(target, events, page, activeMonthFilter) {
    if (!target) return;
    const dated = sortEventsList(events.filter(e => !e.recurring && e.startDate));
    const recurring = sortEventsList(events.filter(e => e.recurring || !e.startDate));

    const totalPages = Math.max(1, Math.ceil(dated.length / HEV_PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page || 1), totalPages);
    const sliceStart = (safePage - 1) * HEV_PAGE_SIZE;
    const slice = dated.slice(sliceStart, sliceStart + HEV_PAGE_SIZE);

    /* Group the page's slice by month for the editorial month labels.
       If a month filter is active, force the slice into that month's
       label so multi-month events visually anchor to the active filter
       rather than their start month. */
    const buckets = new Map();
    const seenKeys = [];
    for (const ev of slice) {
      let k;
      if (activeMonthFilter && activeMonthFilter !== 'all' && activeMonthFilter !== 'recurring' && monthKeysForEvent(ev).includes(activeMonthFilter)) {
        k = activeMonthFilter;
      } else {
        k = monthKeyForEvent(ev);
      }
      if (!buckets.has(k)) { buckets.set(k, []); seenKeys.push(k); }
      buckets.get(k).push(ev);
    }

    let html = '';
    for (const k of seenKeys) {
      html += '<div class="hev-month">'
        + (k === 'recurring' ? '' : '<h3 class="hev-month-label">' + escHtml(monthLabel(k)) + '</h3>')
        + '<div class="hev-grid">' + buckets.get(k).map(eventCardHtml).join('') + '</div>'
        + '</div>';
    }
    if (recurring.length) {
      html += '<div class="hev-month">'
        + '<h3 class="hev-month-label">Ongoing &amp; Recurring</h3>'
        + '<div class="hev-grid">' + recurring.map(eventCardHtml).join('') + '</div>'
        + '</div>';
    }
    if (!html) {
      html = '<div class="hev-empty"><i class="ph-light ph-funnel" aria-hidden="true"></i>'
        + '<p>No events match those filters. Try widening the dates or clearing the filter row.</p>'
        + '<button type="button" class="hev-reset" id="eventFiltersResetInGrid"><i class="ph-light ph-x" aria-hidden="true"></i> Clear filters</button>'
        + '</div>';
    }

    target.innerHTML = html + eventsPaginationHtml(safePage, totalPages);
    return safePage;
  }

  function renderEvents() {
    const wrap = document.getElementById('eventPanel');
    if (!wrap) return;
    const data = window.EVENTS_DATA || {};
    const all = [];
    for (const sid of Object.keys(data)) {
      for (const ev of (data[sid] || [])) all.push(ev);
    }

    if (!all.length) {
      wrap.innerHTML = '<div class="hev-empty"><i class="ph-light ph-calendar" aria-hidden="true"></i>'
        + '<p>No events listed yet. Know about something happening along the route?</p>'
        + '<a class="btn btn-primary" href="/submit-event/">Submit an event</a>'
        + '</div>';
      return;
    }

    const filtered = all.filter(ev => eventMatchesFilters(ev, window.eventFilters));
    wrap.innerHTML = eventsFilterBarHtml(all, window.eventFilters)
      + '<div id="eventGrid"></div>';
    const activeMonth = (typeof window.eventFilters.month === 'number') ? window.eventFilters.month : null;
    const safePage = renderEventsGridInto(document.getElementById('eventGrid'), filtered, window.eventFilters.page || 1, activeMonth);
    if (safePage !== window.eventFilters.page) window.eventFilters.page = safePage;

    /* Delegated handlers for chips + dropdowns + reset + pagination. */
    const bar = document.getElementById('eventFilters');
    if (bar) {
      bar.addEventListener('click', e => {
        const chip = e.target.closest('button[data-filter-group]');
        if (chip) {
          const group = chip.getAttribute('data-filter-group');
          let val = chip.getAttribute('data-filter-value');
          if (group === 'month' && val !== 'all' && val !== 'recurring') val = parseInt(val, 10);
          if (group === 'walk' && val !== 'all') val = parseInt(val, 10);
          window.eventFilters[group] = val;
          window.eventFilters.page = 1;
          renderEvents();
          return;
        }
        if (e.target.id === 'eventFiltersReset') {
          window.eventFilters = { month:'all', stop:'all', category:'all', price:'all', walk:'all', page:1 };
          renderEvents();
        }
      });
      const sel = document.getElementById('eventCategorySelect');
      if (sel) sel.addEventListener('change', () => {
        window.eventFilters.category = sel.value;
        window.eventFilters.page = 1;
        renderEvents();
      });
      const stopSel = document.getElementById('eventStopSelect');
      if (stopSel) stopSel.addEventListener('change', () => {
        window.eventFilters.stop = stopSel.value;
        window.eventFilters.page = 1;
        renderEvents();
      });
      const monthSel = document.getElementById('eventMonthSelect');
      if (monthSel) monthSel.addEventListener('change', () => {
        const v = monthSel.value;
        window.eventFilters.month = (v === 'all' || v === 'recurring') ? v : Number(v);
        window.eventFilters.page = 1;
        renderEvents();
      });
    }

    const grid = document.getElementById('eventGrid');
    if (grid) {
      grid.addEventListener('click', e => {
        const btn = e.target.closest('button.hev-pagebtn');
        if (btn && !btn.disabled) {
          const next = parseInt(btn.getAttribute('data-page'), 10);
          if (Number.isFinite(next)) {
            window.eventFilters.page = next;
            renderEvents();
            /* Scroll the grid back into view so the next page lands at
               the top of the new card set instead of leaving the
               visitor staring at the pagination bar. */
            wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          return;
        }
        if (e.target.id === 'eventFiltersResetInGrid') {
          window.eventFilters = { month:'all', stop:'all', category:'all', price:'all', walk:'all', page:1 };
          renderEvents();
        }
      });
    }
  }

  /* Wait for both data files and the DOM. EVENTS_DATA + STOPS load via
     <script> tags above this file, so they're guaranteed to be defined
     by the time this IIFE runs unless someone loads it out of order. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderEvents);
  } else {
    renderEvents();
  }
})();
