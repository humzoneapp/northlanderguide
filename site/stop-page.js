/* ==================================================================
   STOP PAGE renderer. Reads the stop id from the URL path, pulls
   editorial content from window.STOP_PAGES_DATA plus listings, fun
   facts, FAQs and packing items, and renders the full editorial page.
   ================================================================== */
(function () {
  'use strict';

  /* Non-www canonical so it matches the /plan page and the home
     page. If the deployed site auto-redirects between www and
     non-www, this version is the one Google should index. */
  const SITE = 'https://northlanderguide.com';
  const SP = window.STOP_PAGES_DATA || {};
  const STOPS = window.STOPS || [];
  const LIST = window.LISTINGS_DATA || {};
  const FACTS = window.FUN_FACTS_DATA || [];
  const FAQS = window.FAQS_DATA || [];
  const DF = window.DONT_FORGET_DATA || [];
  const TIPS = window.STOP_TIPS_DATA || [];

  const CATS = [
    { key: 'restaurants', label: 'Eat & Drink', color: '#7d3a1e' },
    { key: 'accommodations', label: 'Stay', color: '#0a2d21' },
    { key: 'parks', label: 'Nature', color: '#2d6a4f' },
    { key: 'attractions', label: 'See & Do', color: '#c4860f' },
    { key: 'shops', label: 'Shop', color: '#6b4c9a' },
    { key: 'transportation', label: 'Transport', color: '#4a6fa5' }
  ];

  const root = document.getElementById('stopRoot');
  const yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  const parts = location.pathname.split('/').filter(Boolean);
  let stopId = (parts[1] || '').toLowerCase();
  /* Path drives routing in production (Vercel rewrites /stops/:id here).
     Fall back to a ?stop= query param when the path has no valid id
     (direct hits on /stops/index.html, local testing). */
  if (!STOPS.find(s => s.id === stopId)) {
    const q = new URLSearchParams(location.search).get('stop');
    if (q) stopId = q.toLowerCase();
  }
  const meta = STOPS.find(s => s.id === stopId);
  const page = SP[stopId];

  if (!stopId || !meta || !page) { renderNotFound(); return; }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const paras = t => String(t || '').split(/\n+/).map(p => p.trim()).filter(Boolean);
  const idx = STOPS.findIndex(s => s.id === stopId);
  const stopNumber = idx + 1;
  const displayName = meta.name;
  const heroImg = '/' + String(meta.image || '').replace(/^\/+/, '');

  function travelCompact(s) {
    const m = String(s || '').match(/(\d+)\s*hours?(?:\s*(\d+)\s*min)/i);
    if (m) return m[1] + 'h' + (m[2] ? ' ' + m[2] + 'm' : '') + ' from Toronto';
    const mm = String(s || '').match(/(\d+)\s*min/i);
    if (mm) return mm[1] + ' min from Toronto';
    return String(s || '').slice(0, 42);
  }
  function pullQuote(t) {
    const first = (String(t || '').split(/(?<=[.!?])\s/)[0] || '').trim();
    return first.length > 120 ? first.slice(0, 117).trim() + '...' : first;
  }
  function bestForList(bf) {
    if (Array.isArray(bf)) return bf.filter(Boolean);
    return String(bf || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean);
  }
  function divider() {
    return '<div class="sp-divider" role="separator">'
      + '<span class="sp-divider-badge"><i class="ph-light ph-train" aria-hidden="true"></i></span></div>';
  }

  /* ---- listings for this stop ---- */
  const stopListings = LIST[stopId] || {};
  const allMapped = [];
  CATS.forEach(c => {
    (stopListings[c.key] || []).forEach(l => allMapped.push(Object.assign({ _cat: c }, l)));
  });

  /* Sort + filter state shared by the listings panel and the map. The
     sorts (Featured / Closest / Top Rated) only affect the listings
     panel; the Local Deals toggle hides every listing without a deal
     from both the panel AND the map markers. */
  let currentCatKey = null;
  let currentSort = 'featured';
  let currentDealsOnly = false;
  let leafletMap = null;
  let leafletMarkers = [];

  function parseRatingNum(r) {
    if (r == null || r === 'NR') return -Infinity;
    const n = parseFloat(r);
    return isNaN(n) ? -Infinity : n;
  }
  function applySortFilter(arr) {
    let out = arr;
    if (currentDealsOnly) out = out.filter(it => it && it.discountOffered === true);
    if (currentSort === 'closest') {
      out = out.slice().sort((a, b) => {
        const aw = typeof a.walkMins === 'number' ? a.walkMins : Infinity;
        const bw = typeof b.walkMins === 'number' ? b.walkMins : Infinity;
        return aw - bw;
      });
    } else if (currentSort === 'rated') {
      out = out.slice().sort((a, b) => parseRatingNum(b.rating) - parseRatingNum(a.rating));
    }
    return out;
  }

  /* Format an Airtable date string (YYYY-MM-DD) into a human label.
     Supports a single date, a range (Start + End), and the optional
     Start Time string from Airtable. */
  function formatEventWhen(ev) {
    if (!ev.startDate) return ev.recurring ? (ev.recurrencePattern || 'Recurring') : '';
    const fmt = iso => {
      const [y, m, d] = iso.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    };
    const startLabel = fmt(ev.startDate);
    const endLabel = ev.endDate && ev.endDate !== ev.startDate ? ' - ' + fmt(ev.endDate) : '';
    const timeLabel = ev.startTime ? ', ' + ev.startTime : '';
    return startLabel + endLabel + timeLabel;
  }

  /* The nine Airtable categories. */
  const SP_EVENT_CATEGORIES = [
    'Music & Live Performance', 'Food & Drink', 'Outdoor & Adventure',
    'Arts & Culture', 'Festivals & Fairs', 'Markets & Shopping',
    'Sports & Recreation', 'Community & Family', 'History & Heritage'
  ];

  let spEventFilters = { month: 'all', category: 'all', price: 'all', walk: 'all', page: 1 };
  const SP_EVENT_PAGE_SIZE = 9;

  function spPageList(current, total) {
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

  function spPaginationHtml(current, total) {
    if (total <= 1) return '';
    const items = spPageList(current, total);
    const btns = items.map(p => {
      if (p === '...') return '<span class="sp-evpageellipsis">...</span>';
      return '<button type="button" class="sp-evpagebtn' + (p === current ? ' is-active' : '') + '" data-page="' + p + '">' + p + '</button>';
    }).join('');
    return '<nav class="sp-evpagination" aria-label="Event pagination">'
      + '<button type="button" class="sp-evpagebtn sp-evpagenav" data-page="' + (current - 1) + '"' + (current === 1 ? ' disabled' : '') + ' aria-label="Previous page"><i class="ph-light ph-caret-left" aria-hidden="true"></i> Prev</button>'
      + btns
      + '<button type="button" class="sp-evpagebtn sp-evpagenav" data-page="' + (current + 1) + '"' + (current === total ? ' disabled' : '') + ' aria-label="Next page">Next <i class="ph-light ph-caret-right" aria-hidden="true"></i></button>'
      + '</nav>';
  }

  function spMonthKey(ev) {
    if (!ev.startDate) return 'recurring';
    const [y, m] = ev.startDate.split('-').map(Number);
    return y * 100 + m;
  }

  /* Every month the event spans, from Start Date through End Date.
     Used so a multi-month event (May through September) appears under
     every relevant month chip, not just its start month. */
  function spMonthKeys(ev) {
    if (!ev.startDate) return [];
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

  function spMatchesFilters(ev, f) {
    if (f.month !== 'all') {
      if (f.month === 'recurring') {
        if (!(ev.recurring || !ev.startDate)) return false;
      } else {
        if (ev.recurring || !ev.startDate) return false;
        if (!spMonthKeys(ev).includes(f.month)) return false;
      }
    }
    if (f.category !== 'all' && ev.category !== f.category) return false;
    if (f.price === 'free' && !ev.free) return false;
    if (f.price === 'paid' && ev.free) return false;
    if (f.walk !== 'all') {
      if (typeof ev.walkMins !== 'number') return false;
      if (ev.walkMins > f.walk) return false;
    }
    return true;
  }

  function spEventFilterBarHtml(allEvents, f) {
    const monthSet = new Set();
    let hasRecurring = false;
    for (const ev of allEvents) {
      if (ev.recurring || !ev.startDate) { hasRecurring = true; continue; }
      for (const k of spMonthKeys(ev)) monthSet.add(k);
    }
    const monthKeys = Array.from(monthSet).sort((a,b)=>a-b);
    const monthShort = key => {
      const y = Math.floor(key/100), m = key%100;
      return new Date(Date.UTC(y, m-1, 1)).toLocaleDateString('en-CA', {month:'short', timeZone:'UTC'});
    };
    const chip = (group, value, label, active) =>
      '<button type="button" class="sp-evchip' + (active ? ' is-active' : '') + '" data-filter-group="' + group + '" data-filter-value="' + esc(String(value)) + '">' + esc(label) + '</button>';

    const monthChips = [chip('month', 'all', 'Any time', f.month === 'all')]
      .concat(monthKeys.map(k => chip('month', k, monthShort(k), f.month === k)))
      .concat(hasRecurring ? [chip('month', 'recurring', 'Recurring', f.month === 'recurring')] : [])
      .join('');
    const categoryOpts = ['<option value="all">Any category</option>']
      .concat(SP_EVENT_CATEGORIES.map(c => '<option value="' + esc(c) + '"' + (f.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'))
      .join('');
    const priceChips = [
      chip('price', 'all', 'Any', f.price === 'all'),
      chip('price', 'free', 'Free', f.price === 'free'),
      chip('price', 'paid', 'Paid', f.price === 'paid')
    ].join('');
    const walkChips = [
      chip('walk', 'all', 'Any', f.walk === 'all'),
      chip('walk', 15, 'Under 15 min', f.walk === 15),
      chip('walk', 30, 'Under 30 min', f.walk === 30),
      chip('walk', 60, 'Under 1 hr', f.walk === 60)
    ].join('');
    const anyActive = f.month !== 'all' || f.category !== 'all' || f.price !== 'all' || f.walk !== 'all';

    return '<div class="sp-evfilters">'
      + '<div class="sp-evfilters-head">'
        + '<h3 class="sp-evfilters-title">Find events</h3>'
        + (anyActive ? '<button type="button" class="sp-evreset" id="spEventFiltersReset"><i class="ph-light ph-x" aria-hidden="true"></i> Clear filters</button>' : '')
      + '</div>'
      + '<section class="sp-evfilter-section sp-evfilter-section--full">'
        + '<div class="sp-evfilter-section-label"><i class="ph-light ph-calendar-blank" aria-hidden="true"></i><span>When</span></div>'
        + '<div class="sp-evchip-row">' + monthChips + '</div>'
      + '</section>'
      + '<div class="sp-evfilter-grid">'
        + '<section class="sp-evfilter-section">'
          + '<div class="sp-evfilter-section-label"><i class="ph-light ph-tag" aria-hidden="true"></i><span>What</span></div>'
          + '<select class="sp-evselect" id="spEventCategorySelect">' + categoryOpts + '</select>'
        + '</section>'
        + '<section class="sp-evfilter-section">'
          + '<div class="sp-evfilter-section-label"><i class="ph-light ph-currency-circle-dollar" aria-hidden="true"></i><span>Price</span></div>'
          + '<div class="sp-evchip-row">' + priceChips + '</div>'
        + '</section>'
        + '<section class="sp-evfilter-section">'
          + '<div class="sp-evfilter-section-label"><i class="ph-light ph-person-simple-walk" aria-hidden="true"></i><span>Walk time</span></div>'
          + '<div class="sp-evchip-row">' + walkChips + '</div>'
        + '</section>'
      + '</div>'
      + '</div>';
  }

  function initEventFilters() {
    const bar = document.getElementById('spEventsBar');
    const list = document.getElementById('spEventsList');
    if (!bar || !list) return;
    const all = (window.EVENTS_DATA && window.EVENTS_DATA[stopId]) || [];

    function rerender() {
      bar.innerHTML = spEventFilterBarHtml(all, spEventFilters);
      const filtered = all.filter(ev => spMatchesFilters(ev, spEventFilters));
      if (!filtered.length) {
        list.innerHTML = '<div class="sp-events-empty"><i class="ph-light ph-funnel" aria-hidden="true"></i>'
          + '<p>No events match these filters. Try widening your selection.</p></div>';
      } else {
        /* Split dated vs recurring; only dated paginate. Recurring
           always shows at the bottom outside the page window. */
        const dated = [], recurring = [];
        for (const ev of filtered) {
          if (ev.recurring || !ev.startDate) recurring.push(ev);
          else dated.push(ev);
        }
        const sortFn = (a,b) => {
          if (a.featured !== b.featured) return a.featured ? -1 : 1;
          const ad = a.startDate || '9999-12-31';
          const bd = b.startDate || '9999-12-31';
          if (ad !== bd) return ad < bd ? -1 : 1;
          return (a.name || '').localeCompare(b.name || '');
        };
        dated.sort(sortFn);
        recurring.sort(sortFn);

        const totalPages = Math.max(1, Math.ceil(dated.length / SP_EVENT_PAGE_SIZE));
        const clamped = Math.min(Math.max(1, spEventFilters.page || 1), totalPages);
        spEventFilters.page = clamped;
        const slice = dated.slice((clamped - 1) * SP_EVENT_PAGE_SIZE, clamped * SP_EVENT_PAGE_SIZE);

        const cardsHtml = slice.map(eventCard).join('')
          + (recurring.length ? recurring.map(eventCard).join('') : '');
        list.innerHTML = '<div class="sp-events">' + cardsHtml + '</div>'
          + spPaginationHtml(clamped, totalPages);
      }
      const sel = document.getElementById('spEventCategorySelect');
      if (sel) sel.addEventListener('change', () => {
        spEventFilters.category = sel.value;
        spEventFilters.page = 1;
        rerender();
      });
    }

    rerender();
    bar.addEventListener('click', e => {
      const chip = e.target.closest('button[data-filter-group]');
      if (chip) {
        const group = chip.getAttribute('data-filter-group');
        let val = chip.getAttribute('data-filter-value');
        if (group === 'month' && val !== 'all' && val !== 'recurring') val = parseInt(val, 10);
        if (group === 'walk' && val !== 'all') val = parseInt(val, 10);
        spEventFilters[group] = val;
        spEventFilters.page = 1;
        rerender();
        return;
      }
      if (e.target.id === 'spEventFiltersReset') {
        spEventFilters = { month:'all', category:'all', price:'all', walk:'all', page:1 };
        rerender();
      }
    });
    list.addEventListener('click', e => {
      const btn = e.target.closest('button.sp-evpagebtn');
      if (!btn || btn.disabled) return;
      const p = parseInt(btn.getAttribute('data-page'), 10);
      if (!Number.isFinite(p) || p < 1) return;
      spEventFilters.page = p;
      rerender();
      if (bar.scrollIntoView) bar.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  }

  function eventCard(ev) {
    const when = formatEventWhen(ev);
    const link = ev.eventUrl || ev.ticketUrl || '';
    const tag = link ? 'a' : 'div';
    const href = link ? ' href="' + esc(link) + '" target="_blank" rel="noopener"' : '';
    const priceLabel = ev.free ? 'Free' : (ev.price || '');
    const walk = (typeof ev.walkMins === 'number')
      ? '<span class="sp-event-walk"><i class="ph-light ph-person-simple-walk" aria-hidden="true"></i> ' + ev.walkMins + ' min walk</span>'
      : '';
    const family = ev.familyFriendly
      ? '<span class="sp-event-family" aria-label="Family friendly"><i class="ph-light ph-users-three" aria-hidden="true"></i> Family friendly</span>'
      : '';
    /* Walk + family share a meta row under the description. The row
       only renders when at least one badge is present. */
    const metaRow = (walk || family)
      ? '<div class="sp-event-meta">' + walk + family + '</div>'
      : '';
    return '<' + tag + ' class="sp-event"' + href + '>'
      + (ev.imageUrl
          ? '<div class="sp-event-img" style="background-image:url(\'' + esc(ev.imageUrl) + '\')"></div>'
          : '<div class="sp-event-img sp-event-img--blank"><i class="ph-light ph-calendar" aria-hidden="true"></i></div>')
      + '<div class="sp-event-body">'
      + (when ? '<div class="sp-event-when">' + esc(when) + '</div>' : '')
      + '<h4 class="sp-event-name">' + esc(ev.name) + '</h4>'
      + (ev.venue ? '<div class="sp-event-venue">' + esc(ev.venue) + '</div>' : '')
      + (ev.description ? '<p class="sp-event-desc">' + esc(ev.description) + '</p>' : '')
      + metaRow
      + '<div class="sp-event-foot">'
      + (priceLabel ? '<span class="sp-event-price">' + esc(priceLabel) + '</span>' : '<span></span>')
      + (link ? '<span class="sp-event-cta">More info <i class="ph-light ph-arrow-up-right" aria-hidden="true"></i></span>' : '')
      + '</div>'
      + '</div></' + tag + '>';
  }

  /* Map a Guide listing category to a Northlander.app booking kind.
     The app currently uses five buckets: train, room, meal, activity,
     other. Most listings fall cleanly into one. */
  function appKindForCat(catKey) {
    switch (catKey) {
      case 'restaurants':    return 'meal';
      case 'accommodations': return 'room';
      case 'parks':
      case 'attractions':    return 'activity';
      case 'transportation': return 'train';
      case 'shops':
      default:               return 'other';
    }
  }

  /* Build the cross-site hand-off URL that opens Northlander.app's
     /add page pre-filled with this listing. */
  function planAddUrl(l) {
    const params = new URLSearchParams({
      source: 'guide',
      kind: appKindForCat(l._cat && l._cat.key),
      name: String(l.name || '').slice(0, 120),
      stop: stopId
    });
    if (l.address) params.set('address', String(l.address).slice(0, 240));
    if (l.website) params.set('url', String(l.website).slice(0, 240));
    return 'https://northlander.app/add?' + params.toString();
  }

  function listingCard(l) {
    const ratingHtml = (!l.rating || l.rating === 'NR')
      ? '<span class="sp-lc-rating">New</span>'
      : '<span class="sp-lc-rating"><i class="ph-fill ph-star" aria-hidden="true"></i> ' + esc(Number(l.rating).toFixed(1)) + '</span>';
    const walk = (l.walkMins != null)
      ? '<span class="sp-lc-walk"><i class="ph-light ph-person-simple-walk" aria-hidden="true"></i> ' + esc(l.walkMins) + ' min walk</span>'
      : '';
    const href = '/#stop=' + stopId + '&cat=' + l._cat.key + '&place=' + slug(l.name);
    /* The card is wrapped in <article> with an inner <a> for the link
       and a separate <button> for the plus pill so we never nest a
       button inside an anchor. The button's onclick prevents the
       outer card link from firing. */
    return '<article class="sp-lcard">'
      + '<a class="sp-lcard-link" href="' + href + '" aria-label="' + esc(l.name) + '">'
      + '<div class="sp-lc-body">'
      + '<div class="sp-lc-top"><span class="sp-lc-tag">' + esc(l.tag || l._cat.label) + '</span>' + ratingHtml + '</div>'
      + '<h4>' + esc(l.name) + '</h4>'
      + (l.desc ? '<p class="sp-lc-desc">' + esc(l.desc) + '</p>' : '')
      + (l.address ? '<p class="sp-lc-addr">' + esc(l.address) + '</p>' : '')
      + walk
      + '</div></a>'
      + '<button class="sp-lc-add" type="button"'
        + ' aria-label="Add ' + esc(l.name) + ' to a Northlander.app trip"'
        + ' data-app-url="' + esc(planAddUrl(l)) + '">'
        + '<i class="ph-light ph-plus" aria-hidden="true"></i>'
        + '<span>Add to trip</span>'
      + '</button>'
      + '</article>';
  }

  /* ---- fun facts ticker ---- */
  let facts = FACTS.filter(f => f.stop === displayName);
  if (!facts.length) facts = [];
  function tickerStrip() {
    if (!facts.length) return '';
    let items = facts.slice();
    while (items.length < 8) items = items.concat(facts);
    const html = items.map(f =>
      '<span class="sp-ticker-item"><span class="sp-ticker-cat">' + esc(f.category) + '</span>'
      + '<span class="sp-ticker-fact">' + esc(f.fact) + '</span><span class="sp-ticker-dot"></span></span>'
    ).join('');
    return '<div class="sp-ticker"><div class="sp-ticker-track">' + html + html + '</div></div>';
  }

  /* ---- FAQs ---- */
  const faqs = FAQS.filter(f => f.stop === displayName || f.stop === 'All Stops');

  /* ---- nearby ---- */
  const prev = STOPS[idx - 1], next = STOPS[idx + 1];
  function platform(s, n) {
    if (!s) return '';
    return '<a class="sp-platform" href="/stops/' + s.id + '">'
      + '<span class="sp-platform-num">' + n + '</span>'
      + '<span><h3 class="sp-platform-name">' + esc(s.name) + '</h3>'
      + '<div class="sp-platform-region">' + esc(s.region || '') + '</div>'
      + '<span class="sp-platform-btn">Explore ' + esc(s.name) + '</span></span></a>';
  }

  /* ---- don't forget ---- */
  const dfItems = DF.filter(d => d.stop === displayName || d.stop === 'All Stops'
    || d.triggerType === 'Always Include' || !d.stop)
    .sort((a, b) => (a.priority === 'Essential' ? 0 : 1) - (b.priority === 'Essential' ? 0 : 1));

  /* ================= build markup ================= */
  const introParas = paras(page.editorialIntro);
  const bf = bestForList(page.bestFor);
  const seasons = [
    { cls: 'summer', icon: 'ph-sun', name: 'Summer', text: page.summerHighlights },
    { cls: 'spring', icon: 'ph-flower', name: 'Spring', text: page.springHighlights },
    { cls: 'fall', icon: 'ph-leaf', name: 'Fall', text: page.fallHighlights },
    { cls: 'winter', icon: 'ph-snowflake', name: 'Winter', text: page.winterHighlights }
  ];

  let html = '';

  /* HERO */
  html += '<section class="sp-hero">'
    + '<div class="sp-hero-frame">'
    + (page.travelTime ? '<span class="sp-hero-travel">' + esc(travelCompact(page.travelTime)) + '</span>' : '')
    + '<img id="spHeroImg" src="' + esc(heroImg) + '" alt="' + esc(displayName) + ' station illustration" fetchpriority="high" loading="eager" decoding="async">'
    + '</div></section>';
  html += '<div class="sp-hero-titlewrap"><h1 class="sp-hero-title" id="spTitle">' + esc(displayName) + '</h1>'
    + (page.heroTagline ? '<p class="sp-hero-tagline">' + esc(page.heroTagline) + '</p>' : '') + '</div>';

  /* BREADCRUMB */
  html += '<nav class="sp-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a>'
    + '<i class="ph-light ph-train" aria-hidden="true"></i><a href="/#stopnav">Stops</a>'
    + '<i class="ph-light ph-train" aria-hidden="true"></i><span class="here">' + esc(displayName) + '</span></nav>';

  /* BEST FOR */
  if (bf.length) {
    html += '<div class="sp-bestfor">' + bf.map(x => '<span class="sp-pill">&mdash; ' + esc(x) + '</span>').join('') + '</div>';
  }

  /* TABLE OF CONTENTS - sticky horizontal nav. Mirrors the section
     ids added below. Click smoothly scrolls to the section; an
     IntersectionObserver in initToc() highlights the active link as
     the visitor scrolls. */
  const SP_TOC = [
    { id: 'sp-overview', label: 'Overview', icon: 'ph-book-open' },
    { id: 'sp-travel',   label: 'Getting There', icon: 'ph-train' },
    { id: 'sp-seasons',  label: 'Seasons', icon: 'ph-leaf' },
    { id: 'sp-listings', label: 'Where to Go', icon: 'ph-map-pin' },
    { id: 'sp-events',   label: 'What\'s On', icon: 'ph-calendar' },
    { id: 'sp-faq',      label: 'Good to Know', icon: 'ph-question' },
    { id: 'sp-nearby',   label: 'Continue', icon: 'ph-arrow-right' },
    { id: 'sp-pack',     label: 'Pack List', icon: 'ph-backpack' },
    { id: 'sp-tips',     label: 'Tips', icon: 'ph-push-pin' }
  ];
  html += '<nav class="sp-toc" id="spToc" aria-label="Page sections">'
    + '<div class="sp-toc-row">'
    + SP_TOC.map(t =>
        '<a class="sp-toc-link" href="#' + t.id + '" data-sp-toc="' + t.id + '">'
        + '<i class="ph-light ' + t.icon + '" aria-hidden="true"></i>'
        + '<span>' + t.label + '</span></a>'
      ).join('')
    + '</div></nav>';

  /* EDITORIAL INTRO */
  html += '<section class="sp-intro sp-section" id="sp-overview">'
    + '<div class="sp-intro-body">' + introParas.map(p => '<p>' + esc(p) + '</p>').join('') + '</div>'
    + '<aside class="sp-intro-aside">'
    + (introParas.length ? '<p class="sp-pullquote">' + esc(pullQuote(page.editorialIntro)) + '</p>' : '')
    + (page.walkabilityScore ? '<div class="sp-stat"><span class="sp-stat-num">' + esc(page.walkabilityScore) + '</span>'
      + '<span class="sp-stat-label">Walkability</span></div>' : '')
    + '</aside></section>';

  html += divider();

  /* GETTING HERE / AROUND */
  html += '<section class="sp-two sp-section" id="sp-travel">'
    + '<div class="sp-card"><div class="sp-label">Getting Here</div><p>' + esc(page.gettingHere) + '</p></div>'
    + '<div class="sp-card"><div class="sp-label">Getting Around</div><p>' + esc(page.gettingAround) + '</p></div>'
    + '</section>';

  html += divider();

  /* SEASONAL */
  html += '<section class="sp-section" id="sp-seasons"><div class="sp-label">Through the Seasons</div>'
    + '<div class="sp-seasons-wrap sp-paper"><div class="sp-seasons-inner"><div class="sp-seasons">'
    + seasons.map(s => '<div class="sp-season sp-season-' + s.cls + '">'
      + '<i class="ph-light ' + s.icon + '" aria-hidden="true"></i>'
      + '<div class="sp-season-name">' + s.name + '</div>'
      + '<p class="sp-season-text">' + esc(s.text || 'Details coming soon.') + '</p></div>').join('')
    + '</div></div></div></section>';

  /* FUN FACTS TICKER */
  html += tickerStrip();

  html += divider();

  /* LISTINGS + MAP */
  html += '<section class="sp-section" id="sp-listings"><div class="sp-label">On the Ground</div>'
    + '<h2 class="sp-h2">Where to go in ' + esc(displayName) + '</h2>'
    + '<div class="sp-explore"><div class="sp-map" id="spMap"></div>'
    + '<div><div class="sp-tabs" id="spTabs"></div><div class="sp-listings" id="spListings"></div></div>'
    + '</div></section>';

  html += divider();

  /* EVENTS */
  const stopEvents = (window.EVENTS_DATA && window.EVENTS_DATA[stopId]) || [];
  html += '<section class="sp-section" id="sp-events"><h2 class="sp-h2">What\'s On in ' + esc(displayName) + '</h2>'
    + (stopEvents.length
        ? '<div id="spEventsBar"></div><div id="spEventsList"></div>'
        : '<div class="sp-events-empty"><i class="ph-light ph-calendar" aria-hidden="true"></i>'
          + '<p>Events coming soon. Know about something happening here?</p></div>')
    + '<div class="sp-events-submit"><a class="sp-btn submit-event-trigger" href="/submit-event/">'
    + '<i class="ph-light ph-plus" aria-hidden="true"></i> Submit an event at ' + esc(displayName)
    + '</a></div>'
    + '</section>';

  html += divider();

  /* FAQ */
  html += '<section class="sp-section" id="sp-faq"><h2 class="sp-h2">Good to Know</h2><div id="spFaq">'
    + (faqs.length ? faqs.map((f, i) =>
      '<div class="sp-faq" data-faq="' + i + '"><button class="sp-faq-q" type="button">'
      + '<span>' + esc(f.question) + '</span><i class="ph-light ph-plus" aria-hidden="true"></i></button>'
      + '<div class="sp-faq-a">' + esc(f.answer) + '</div></div>').join('')
      : '<p class="sp-empty">Answers coming soon.</p>')
    + '</div></section>';

  html += divider();

  /* NEARBY */
  html += '<section class="sp-section" id="sp-nearby"><h2 class="sp-h2">Continue Your Journey</h2>'
    + '<div class="sp-nearby">' + platform(prev, stopNumber - 1) + platform(next, stopNumber + 1)
    + (!prev && !next ? '<p class="sp-empty">End of the line.</p>' : '') + '</div></section>';

  /* PLAN-YOUR-TRIP CTA - styled as a vintage ticket stub mirroring
     the /plan boarding-pass aesthetic. The left band is the forest
     stub with a vertical "Northlander Pass" wordmark and a suitcase
     icon at the top; the right body has the kicker, headline,
     pitch and the rust CTA. Styles live in styles.css under
     .sp-plan-trip-cta. */
  html += '<section class="sp-section">'
    + '<article class="sp-plan-trip-cta">'
    + '<aside class="sp-plan-trip-cta-stub" aria-hidden="true">'
    +   '<i class="ph-light ph-suitcase"></i>'
    +   '<span class="sp-plan-trip-cta-stub-line">Northlander Pass</span>'
    + '</aside>'
    + '<div class="sp-plan-trip-cta-body">'
    +   '<div class="sp-plan-trip-cta-kicker">Northlander.app</div>'
    +   '<h3>Add ' + esc(displayName) + ' to your trip</h3>'
    +   '<p>Pack your route, train times, accommodations and packing list around ' + esc(displayName) + ' in one place. Free to start.</p>'
    +   '<a class="sp-plan-trip-cta-btn" href="/plan">Plan Your Trip <i class="ph-light ph-arrow-right" aria-hidden="true"></i></a>'
    + '</div>'
    + '</article>'
    + '</section>';

  html += divider();

  /* DON'T FORGET */
  html += '<section class="sp-section sp-df-section" id="sp-pack">'
    + '<h2 class="sp-h2">Before You Board</h2>'
    + '<div class="sp-df-print-head">' + esc(displayName) + ' Packing Checklist</div>'
    + (dfItems.length
      ? '<div class="sp-df-list">' + dfItems.map(d => {
        const ic = String(d.icon || '').trim();
        const icHtml = ic && /^ph-/.test(ic)
          ? '<i class="ph-light ' + esc(ic.replace(/^ph(-fill)?\s+/, '')) + '" aria-hidden="true"></i>'
          : ic
            ? '<span class="sp-df-emoji" aria-hidden="true">' + esc(ic) + '</span>'
            : '<i class="ph-light ph-circle" aria-hidden="true"></i>';
        const tt = (d.triggerType || '').toLowerCase();
        let seasonMark = '';
        if (/winter/.test(tt)) seasonMark = ' <i class="ph-light ph-snowflake sp-df-season sp-df-winter" title="For winter trips" aria-label="winter item"></i>';
        else if (/summer/.test(tt)) seasonMark = ' <i class="ph-light ph-sun sp-df-season sp-df-summer" title="For summer trips" aria-label="summer item"></i>';
        else if (/spring/.test(tt)) seasonMark = ' <i class="ph-light ph-flower sp-df-season sp-df-spring" title="For spring trips" aria-label="spring item"></i>';
        else if (/fall|autumn/.test(tt)) seasonMark = ' <i class="ph-light ph-leaf sp-df-season sp-df-fall" title="For fall trips" aria-label="fall item"></i>';
        return '<div class="sp-df-item">' + icHtml
          + '<div><span class="sp-df-name">' + esc(d.item) + seasonMark + (d.priority === 'Essential' ? '<span class="sp-df-badge">Essential</span>' : '') + '</span>'
          + (d.why ? '<div class="sp-df-why">' + esc(d.why) + '</div>' : '') + '</div></div>';
      }).join('') + '</div>'
      + '<div class="sp-df-blanks"><div class="sp-label">Add your own</div>'
      + '<ol>' + Array.from({ length: 6 }, () =>
        '<li><input type="text" class="sp-df-blank-input" maxlength="80" placeholder="Type an item, then print"></li>'
      ).join('') + '</ol></div>'
      + '<div class="sp-df-printrow"><button class="sp-btn sp-df-print" type="button" onclick="window.print()">'
      + '<i class="ph-light ph-printer" aria-hidden="true"></i> Print Checklist</button></div>'
      : '<p class="sp-empty">Packing tips for this stop are coming soon.</p>')
    + '</section>';

  html += divider();

  /* COMMUNITY TIPS - approved tips for this stop, fall back to a
     friendly placeholder when none have been pinned yet. */
  const stopTips = TIPS.filter(t => t.stop === displayName);
  const rotations = [-2, -1, 0, 1, 2];
  const tipsHtml = stopTips.length
    ? stopTips.map((t, i) =>
      '<div class="sp-tip" style="transform:rotate(' + rotations[i % 5] + 'deg)">'
      + (t.image ? '<img class="sp-tip-img" src="' + esc(t.image) + '" alt="" loading="lazy">' : '')
      + '<p class="sp-tip-text">' + esc(t.tip) + '</p>'
      + '<p class="sp-tip-by">' + esc(t.submittedBy || 'A traveller') + '</p></div>').join('')
    : '<div class="sp-tip" style="transform:rotate(-1.5deg)"><p class="sp-tip-text">'
      + 'Be the first to pin a tip about ' + esc(displayName) + '. Share a hidden gem, a timing trick, or a local favourite.</p>'
      + '<p class="sp-tip-by">The Northlander community</p></div>';
  html += '<section class="sp-section" id="sp-tips"><div class="sp-corkboard sp-paper"><div class="sp-corkboard-inner">'
    + '<h2 class="sp-h2">Traveller Tips</h2>'
    + '<div class="sp-tips">' + tipsHtml + '</div>'
    + '<form class="sp-tipform" id="spTipForm" novalidate>'
    + '<div class="sp-label">Share a tip</div>'
    + '<textarea id="spTipText" maxlength="200" placeholder="What should travellers know about ' + esc(displayName) + '?"></textarea>'
    + '<div class="sp-tip-counter"><span id="spTipCount">0</span>/200</div>'
    + '<input id="spTipName" type="text" maxlength="60" placeholder="Your name (optional)">'
    + '<div class="sp-tip-imgrow">'
      + '<label class="sp-tip-imgbtn" for="spTipImage">'
        + '<i class="ph-light ph-image" aria-hidden="true"></i>'
        + '<span id="spTipImageLabel">Add a photo (optional)</span>'
      + '</label>'
      + '<input id="spTipImage" type="file" accept="image/jpeg,image/png,image/webp">'
      + '<button type="button" class="sp-tip-imgclear" id="spTipImageClear" hidden>Remove</button>'
    + '</div>'
    + '<img id="spTipImagePreview" class="sp-tip-imgpreview" hidden alt="">'
    /* Honeypot field: hidden from sighted users but visible to most
       crawlers/bots. Real submissions leave it blank; bots fill it. */
    + '<div class="sp-tip-honey" aria-hidden="true"><label>Website<input id="spTipUrl" type="text" tabindex="-1" autocomplete="off"></label></div>'
    + '<label class="sp-tip-check"><input type="checkbox" id="spTipHuman"><span>I am not a robot.</span></label>'
    + '<label class="sp-tip-check"><input type="checkbox" id="spTipConsent"><span>I authorize this tip and image to be posted publicly after review.</span></label>'
    + '<button class="sp-btn" type="submit" id="spTipSubmit" disabled><i class="ph-light ph-paper-plane-tilt" aria-hidden="true"></i> Submit tip</button>'
    + '<p class="sp-tip-msg" id="spTipMsg" role="status"></p>'
    + '</form></div></div></section>';

  /* SHARE */
  html += '<section class="sp-section" style="margin-top:48px"><div class="sp-label">Share this stop</div>'
    + '<div class="sp-share">'
    + '<button class="sp-btn" id="spCopy"><i class="ph-light ph-link" aria-hidden="true"></i> Copy Link</button>'
    + '<a class="sp-btn" id="spFb" target="_blank" rel="noopener"><i class="ph-light ph-facebook-logo" aria-hidden="true"></i> Share on Facebook</a>'
    + '<a class="sp-btn" id="spX" target="_blank" rel="noopener"><i class="ph-light ph-x-logo" aria-hidden="true"></i> Share on X</a>'
    + '</div></section>';

  root.innerHTML = html;

  /* ================= interactions ================= */
  setSeo();
  initTabs();
  initMap();
  initFaq();
  initTips();
  initShare();
  initEventFilters();

  /* load animation */
  const titleEl = document.getElementById('spTitle');
  const heroEl = document.getElementById('spHeroImg');
  requestAnimationFrame(() => { if (titleEl) titleEl.classList.add('in'); });
  if (heroEl) {
    if (heroEl.complete) heroEl.classList.add('loaded');
    else heroEl.addEventListener('load', () => heroEl.classList.add('loaded'));
    heroEl.addEventListener('error', () => heroEl.classList.add('loaded'));
  }

  /* Deep links to a section (and screenshot testing): scroll once the
     content has been injected, since the fragment cannot resolve before. */
  if (location.hash) {
    const target = document.querySelector(location.hash);
    if (target) requestAnimationFrame(() => target.scrollIntoView());
  }

  /* Back-to-top button: visible from page load on stop pages (the
     page is long and visitors deep-link in). Click handler does a
     JS smooth-scroll which works reliably on mobile, where href="#top"
     hash-jumps can stutter with sticky URL bars. The .toback button
     keeps its scroll-gated fade so it does not crowd the hero on
     first view. */
  const toTop = document.querySelector('.totop');
  const toBack = document.querySelector('.toback');
  if (toTop) {
    toTop.classList.add('show');
    toTop.addEventListener('click', e => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  window.addEventListener('scroll', () => {
    const past = window.scrollY > 360;
    if (toBack) toBack.classList.toggle('show', past);
  }, { passive: true });

  /* Table of contents: smooth scroll on click and active link
     tracking via IntersectionObserver. The link for whatever section
     is currently in the visitor's view gets the .is-active class. */
  function initToc() {
    const toc = document.getElementById('spToc');
    if (!toc) return;
    const links = Array.from(toc.querySelectorAll('.sp-toc-link'));

    /* The sticky topbar (~58px) plus the TOC bar itself (~52px) sit at
       the top of the viewport, so we subtract roughly that combined
       height when computing scroll targets and observer offsets. */
    const STICKY_OFFSET = 110;

    links.forEach(a => {
      a.addEventListener('click', e => {
        const id = a.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        const y = target.getBoundingClientRect().top + window.scrollY - STICKY_OFFSET;
        window.scrollTo({ top: y, behavior: 'smooth' });
        /* Centre the clicked chip in the scroll bar on mobile. */
        if (a.scrollIntoView) a.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      });
    });

    const sections = links
      .map(a => document.getElementById(a.getAttribute('href').slice(1)))
      .filter(Boolean);
    if (!('IntersectionObserver' in window) || !sections.length) return;

    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id));
      });
    }, {
      /* Activate a section once its top is within ~30% of the
         viewport and well above the bottom. Tuned so the active chip
         updates as a section comes into focus rather than as it
         leaves the screen. */
      rootMargin: '-' + (STICKY_OFFSET + 20) + 'px 0px -55% 0px',
      threshold: 0
    });
    sections.forEach(s => obs.observe(s));
  }
  initToc();

  /* ---- tabs + listings ---- */
  function initTabs() {
    const tabsEl = document.getElementById('spTabs');
    const listEl = document.getElementById('spListings');
    const present = CATS.filter(c => (stopListings[c.key] || []).length);
    if (!present.length) {
      tabsEl.innerHTML = '';
      listEl.innerHTML = '<p class="sp-empty">Listings for this stop are coming soon.</p>';
      return;
    }
    currentCatKey = present[0].key;

    /* Hide the Featured sort pill until some listing in the current
       category is flagged Featured in Airtable. Keeps the sort row
       honest when no business has bought into the Featured tier yet. */
    function hasFeaturedHere() {
      return (stopListings[currentCatKey] || []).some(l => l && l.featured === true);
    }
    function tabsHtml() {
      const featuredPill = hasFeaturedHere()
        ? '<button class="sp-sort-pill' + (currentSort === 'featured' ? ' active' : '') + '" data-sort="featured" type="button">'
          + '<i class="ph-light ph-star" aria-hidden="true"></i>Featured</button>'
        : '';
      return '<div class="sp-tabs-row">' + present.map(c =>
        '<button class="sp-tab' + (c.key === currentCatKey ? ' active' : '') + '" data-cat="' + c.key + '">&mdash; ' + c.label + '</button>'
      ).join('') + '</div>'
      + '<div class="sp-sort-bar" role="toolbar" aria-label="Sort and filter">'
      + '<span class="sp-sort-label">Show</span>'
      + featuredPill
      + '<button class="sp-sort-pill' + (currentSort === 'closest' ? ' active' : '') + '" data-sort="closest" type="button">'
      + '<i class="ph-light ph-person-simple-walk" aria-hidden="true"></i>Closest</button>'
      + '<button class="sp-sort-pill' + (currentSort === 'rated' ? ' active' : '') + '" data-sort="rated" type="button">'
      + '<i class="ph-light ph-trophy" aria-hidden="true"></i>Top Rated</button>'
      + '<span class="sp-sort-divider" aria-hidden="true"></span>'
      + '<button class="sp-deals-pill' + (currentDealsOnly ? ' active' : '') + '" data-filter="deals" type="button" aria-pressed="' + currentDealsOnly + '">'
      + '<i class="ph-light ph-tag" aria-hidden="true"></i>Local Deals</button>'
      + '</div>';
    }

    function listingsForCurrent() {
      if (!currentCatKey) return [];
      const cat = CATS.find(c => c.key === currentCatKey);
      const items = (stopListings[currentCatKey] || []).map(l => Object.assign({ _cat: cat }, l));
      return applySortFilter(items);
    }
    function refreshListings() {
      const items = listingsForCurrent();
      if (!items.length) {
        listEl.innerHTML = '<p class="sp-empty">'
          + (currentDealsOnly
            ? 'No local deals in this category yet. Toggle Local Deals off to see all listings.'
            : 'Nothing here yet.')
          + '</p>';
        return;
      }
      listEl.innerHTML = items.map(l => listingCard(l)).join('');
    }

    function render() { tabsEl.innerHTML = tabsHtml(); wire(); refreshListings(); }
    function wire() {
      tabsEl.querySelectorAll('.sp-tab').forEach(b => b.addEventListener('click', () => {
        currentCatKey = b.dataset.cat; render();
      }));
      tabsEl.querySelectorAll('.sp-sort-pill').forEach(b => b.addEventListener('click', () => {
        currentSort = b.dataset.sort; render();
      }));
      const dealsBtn = tabsEl.querySelector('.sp-deals-pill');
      if (dealsBtn) dealsBtn.addEventListener('click', () => {
        currentDealsOnly = !currentDealsOnly;
        render();
        refreshMarkers();
      });
    }
    render();
  }

  /* Map markers for the currently-filtered set. Re-callable so the
     Local Deals toggle can hide non-deal markers without rebuilding
     the map itself. */
  function refreshMarkers() {
    if (!leafletMap) return;
    leafletMarkers.forEach(m => leafletMap.removeLayer(m));
    leafletMarkers = [];
    const items = currentDealsOnly
      ? allMapped.filter(l => l && l.discountOffered === true)
      : allMapped;
    const pts = [];
    items.forEach(l => {
      if (l.lat == null || l.lng == null) return;
      const color = l._cat.color;
      const icon = L.divIcon({
        className: '', iconSize: [16, 16], iconAnchor: [8, 8],
        html: '<span class="sp-marker" style="width:16px;height:16px;background:' + color + '"></span>'
      });
      const href = '/#stop=' + stopId + '&cat=' + l._cat.key + '&place=' + slug(l.name);
      const popup = '<div style="font-family:\'Spline Sans\',sans-serif;min-width:150px">'
        + '<strong style="font-family:Fraunces,serif;font-size:15px">' + esc(l.name) + '</strong><br>'
        + '<span style="color:' + color + ';font-size:12px;font-weight:600">' + esc(l._cat.label) + '</span>'
        + (l.walkMins != null ? '<br><span style="font-size:12px">' + esc(l.walkMins) + ' min walk</span>' : '')
        + (l.discountOffered ? '<br><span style="font-size:12px;color:#c4860f;font-weight:600">Local deal available</span>' : '')
        + '<br><a href="' + href + '" style="color:#7d3a1e;font-size:12px;font-weight:600">View details</a></div>';
      const m = L.marker([l.lat, l.lng], { icon }).addTo(leafletMap).bindPopup(popup);
      m.bindTooltip(esc(l.name), { direction: 'top' });
      leafletMarkers.push(m);
      pts.push([l.lat, l.lng]);
    });
    if (pts.length > 1) { try { leafletMap.fitBounds(pts, { padding: [30, 30], maxZoom: 15 }); } catch (e) {} }
  }

  /* ---- Leaflet map ----
     Creates the base map and tile layer; markers are populated by
     refreshMarkers() so the Local Deals toggle can re-render them
     in place when the filter changes. */
  function initMap() {
    const el = document.getElementById('spMap');
    if (!el || typeof L === 'undefined' || meta.lat == null) { if (el) el.innerHTML = ''; return; }
    leafletMap = L.map(el, { scrollWheelZoom: false }).setView([meta.lat, meta.lng], 14);
    /* Desktop convenience: when the cursor is over the map, allow the
       scroll wheel to zoom; otherwise leave it disabled so the page
       can scroll normally past the map. */
    el.addEventListener('mouseenter', () => leafletMap.scrollWheelZoom.enable());
    el.addEventListener('mouseleave', () => leafletMap.scrollWheelZoom.disable());
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(leafletMap);
    refreshMarkers();
  }

  /* ---- FAQ accordion ---- */
  function initFaq() {
    document.querySelectorAll('#spFaq .sp-faq').forEach(row => {
      const btn = row.querySelector('.sp-faq-q');
      const ic = row.querySelector('.sp-faq-q i');
      btn.addEventListener('click', () => {
        const open = row.classList.toggle('open');
        ic.className = 'ph-light ' + (open ? 'ph-minus' : 'ph-plus');
      });
    });
  }

  /* ---- tips form (secure: posts to serverless endpoint, no key client-side) ---- */
  function initTips() {
    const form = document.getElementById('spTipForm');
    const text = document.getElementById('spTipText');
    const count = document.getElementById('spTipCount');
    const msg = document.getElementById('spTipMsg');
    if (!form) return;
    const nameEl = document.getElementById('spTipName');
    const fileEl = document.getElementById('spTipImage');
    const fileLabel = document.getElementById('spTipImageLabel');
    const clearBtn = document.getElementById('spTipImageClear');
    const previewEl = document.getElementById('spTipImagePreview');
    const humanEl = document.getElementById('spTipHuman');
    const consentEl = document.getElementById('spTipConsent');
    const submitEl = document.getElementById('spTipSubmit');
    const honeyEl = document.getElementById('spTipUrl');
    let imagePayload = null; /* { base64, contentType, filename } */

    text.addEventListener('input', () => { count.textContent = text.value.length; });

    function syncSubmit() {
      submitEl.disabled = !(humanEl.checked && consentEl.checked);
    }
    humanEl.addEventListener('change', syncSubmit);
    consentEl.addEventListener('change', syncSubmit);

    /* Resize a chosen image client-side: max 1200px on the long edge,
       JPEG at 85% quality. Keeps the payload small and consistent. */
    async function resize(file) {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error('Could not read image.'));
          i.src = url;
        });
        let w = img.naturalWidth, h = img.naturalHeight;
        const max = 1200;
        if (w > max || h > max) {
          if (w >= h) { h = Math.round(h * max / w); w = max; }
          else { w = Math.round(w * max / h); h = max; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
        if (!blob) throw new Error('Could not encode image.');
        const base64 = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
          fr.onerror = () => reject(new Error('Could not encode image.'));
          fr.readAsDataURL(blob);
        });
        return { base64, contentType: 'image/jpeg', filename: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
      } finally { URL.revokeObjectURL(url); }
    }

    fileEl.addEventListener('change', async () => {
      const f = fileEl.files && fileEl.files[0];
      if (!f) return;
      if (f.size > 20 * 1024 * 1024) {
        msg.textContent = 'Please choose a photo under 20 MB.';
        fileEl.value = '';
        return;
      }
      msg.textContent = 'Preparing photo...';
      try {
        imagePayload = await resize(f);
        previewEl.src = 'data:image/jpeg;base64,' + imagePayload.base64;
        previewEl.hidden = false;
        clearBtn.hidden = false;
        fileLabel.textContent = 'Replace photo';
        msg.textContent = '';
      } catch (err) {
        imagePayload = null;
        msg.textContent = 'Could not read that image. Try another.';
        fileEl.value = '';
      }
    });

    clearBtn.addEventListener('click', () => {
      imagePayload = null;
      fileEl.value = '';
      previewEl.src = ''; previewEl.hidden = true;
      clearBtn.hidden = true;
      fileLabel.textContent = 'Add a photo (optional)';
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const tip = text.value.trim();
      if (!tip) { msg.textContent = 'Please write a tip first.'; return; }
      if (!humanEl.checked || !consentEl.checked) {
        msg.textContent = 'Please confirm both checkboxes.';
        return;
      }
      submitEl.disabled = true;
      msg.textContent = 'Sending...';
      try {
        const payload = {
          stop: displayName, tip,
          name: nameEl.value.trim(),
          human: true, consent: true,
          url: honeyEl.value
        };
        if (imagePayload) payload.image = imagePayload;
        const res = await fetch('/api/submit-tip', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          form.reset(); count.textContent = '0';
          clearBtn.click();
          msg.textContent = 'Thank you. Your tip has been submitted for review.';
        } else {
          let data = {};
          try { data = await res.json(); } catch (e) {}
          msg.textContent = data.error || 'Tip submission is not available yet. Please try again later.';
          submitEl.disabled = false;
        }
      } catch (err) {
        msg.textContent = 'Tip submission is not available yet. Please try again later.';
        submitEl.disabled = false;
      }
    });
  }

  /* ---- share ---- */
  function initShare() {
    const url = SITE + '/stops/' + stopId;
    const copy = document.getElementById('spCopy');
    const fb = document.getElementById('spFb');
    const x = document.getElementById('spX');
    if (fb) fb.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
    if (x) x.href = 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(displayName + ' on the Northlander route');
    if (copy) copy.addEventListener('click', () => {
      navigator.clipboard.writeText(url).then(() => { copy.innerHTML = '<i class="ph-light ph-check" aria-hidden="true"></i> Copied'; })
        .catch(() => {});
    });
  }

  /* ---- SEO ----
     Sets the per-stop title, description, canonical, Open Graph and
     Twitter Card meta in the document head, then injects a single
     application/ld+json @graph containing Organization, WebSite,
     WebPage, BreadcrumbList, TouristAttraction (the stop itself
     with geo), ItemList (the local businesses on the stop), and
     FAQPage. The Northlander.app SoftwareApplication is referenced
     by @id so crawlers connect the stop guide to the trip planner. */
  function setSeo() {
    const url = SITE + '/stops/' + stopId;
    const img = SITE + heroImg;
    const hook = (meta.hook || '').trim();
    const region = (meta.region || '').trim();

    // Title: keyword-led, under ~60 chars where possible.
    const title = page.pageTitle
      || (displayName + ': Northlander Train Stop Guide');
    // Description: editorial intro first sentence, fall back to hook.
    const introSentence = (function () {
      const intro = (page.editorialIntro || '').trim();
      if (!intro) return '';
      const m = intro.match(/^[\s\S]*?[.!?](?:\s|$)/);
      return (m ? m[0] : intro).trim();
    })();
    const desc = page.metaDescription
      || (hook ? (hook + (introSentence ? ' ' + introSentence : '')) : (page.heroTagline || ''));

    document.title = title;
    setText('docTitle', title);
    setMeta('name', 'description', desc, 'metaDescription');
    setMeta('property', 'og:url', url, 'ogUrl');
    setMeta('property', 'og:title', title, 'ogTitle');
    setMeta('property', 'og:description', desc, 'ogDescription');
    setMeta('property', 'og:image', img, 'ogImage');
    setMeta('property', 'og:image:alt',
      displayName + ' station on the Ontario Northland Northlander train route',
      'ogImageAlt');
    setMeta('name', 'twitter:title', title, 'twTitle');
    setMeta('name', 'twitter:description', desc, 'twDescription');
    setMeta('name', 'twitter:image', img, 'twImage');
    setMeta('name', 'twitter:image:alt',
      displayName + ' station on the Ontario Northland Northlander train route',
      'twImageAlt');
    const can = document.getElementById('canonicalLink'); if (can) can.href = url;

    // ---- Build the JSON-LD @graph ----
    const orgId = SITE + '/#organization';
    const siteId = SITE + '/#website';
    const webpageId = url + '#webpage';
    const breadcrumbId = url + '#breadcrumb';
    const placeId = url + '#place';

    const graph = [
      {
        '@type': 'Organization',
        '@id': orgId,
        name: 'NorthlanderGuide',
        url: SITE,
        description: "Independent traveller's directory and trip planner for the Ontario Northland Northlander train route from Toronto Union to Cochrane."
      },
      {
        '@type': 'WebSite',
        '@id': siteId,
        url: SITE,
        name: 'NorthlanderGuide.com',
        publisher: { '@id': orgId },
        inLanguage: 'en-CA'
      },
      {
        '@type': 'WebPage',
        '@id': webpageId,
        url: url,
        name: title,
        description: desc,
        isPartOf: { '@id': siteId },
        about: { '@id': placeId },
        breadcrumb: { '@id': breadcrumbId },
        primaryImageOfPage: { '@type': 'ImageObject', url: img, caption: displayName + ' on the Northlander route' },
        inLanguage: 'en-CA',
        speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.sp-hero-title', '.sp-hero-tagline', '.sp-h2'] }
      },
      {
        '@type': 'BreadcrumbList',
        '@id': breadcrumbId,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
          { '@type': 'ListItem', position: 2, name: 'Stops', item: SITE + '/#stopnav' },
          { '@type': 'ListItem', position: 3, name: displayName, item: url }
        ]
      },
      Object.assign({
        '@type': ['TouristAttraction', 'Place'],
        '@id': placeId,
        name: displayName,
        description: desc,
        image: img,
        url: url,
        publicAccess: true,
        isAccessibleForFree: true
      }, region ? { containedInPlace: { '@type': 'Place', name: region } } : {},
         meta.lat != null && meta.lng != null
           ? { geo: { '@type': 'GeoCoordinates', latitude: meta.lat, longitude: meta.lng } }
           : {}
      ),
      /* Reference the SoftwareApplication defined on /plan so crawlers
         connect every stop guide back to the trip planner. */
      {
        '@type': 'SoftwareApplication',
        '@id': SITE + '/plan#app',
        name: 'Northlander.app',
        url: 'https://northlander.app',
        applicationCategory: 'TravelApplication'
      }
    ];

    // Listings as ItemList of LocalBusiness entries (when we have them).
    const listingItems = [];
    let pos = 1;
    Object.keys(stopListings).forEach(catKey => {
      const arr = stopListings[catKey] || [];
      arr.forEach(l => {
        if (!l || !l.name) return;
        const item = {
          '@type': 'LocalBusiness',
          name: l.name,
          description: l.desc || undefined,
          address: l.address ? { '@type': 'PostalAddress', streetAddress: l.address } : undefined
        };
        if (l.rating != null && l.rating !== 'NR' && !isNaN(parseFloat(l.rating))) {
          item.aggregateRating = {
            '@type': 'AggregateRating',
            ratingValue: parseFloat(l.rating),
            ratingCount: l.ratingCount || 1,
            bestRating: 5
          };
        }
        // Drop undefined fields so they don't pollute the JSON.
        Object.keys(item).forEach(k => item[k] === undefined && delete item[k]);
        listingItems.push({ '@type': 'ListItem', position: pos++, item: item });
      });
    });
    if (listingItems.length) {
      graph.push({
        '@type': 'ItemList',
        '@id': url + '#listings',
        name: 'Things to do at ' + displayName,
        numberOfItems: listingItems.length,
        itemListElement: listingItems
      });
    }

    if (faqs.length) {
      graph.push({
        '@type': 'FAQPage',
        '@id': url + '#faq',
        mainEntity: faqs.map(f => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer }
        }))
      });
    }

    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
    document.head.appendChild(s);
  }
  function setMeta(attr, key, val, id) {
    let el = document.getElementById(id) || document.querySelector('meta[' + attr + '="' + key + '"]');
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
    el.setAttribute('content', val || '');
  }
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '';
  }

  function renderNotFound() {
    document.title = 'Stop not found - NorthlanderGuide.com';
    root.innerHTML = '<section class="sp-hero"><div class="sp-hero-titlewrap" style="margin-top:80px">'
      + '<h1 class="sp-hero-title in">Stop not found</h1>'
      + '<p class="sp-hero-tagline">We could not find that stop. Explore all 16 stops on the Northlander route.</p>'
      + '<div style="margin-top:24px"><a class="sp-btn" href="/#stopnav">Browse the route</a></div></div></section>';
  }

  /* Delegated click handler for the cross-site "Add to trip" pill
     on every listing card. Opens the prepared hand-off URL in a new
     tab and prevents the outer card link from also firing. The
     handler is delegated so it works for listings re-rendered when
     the user changes the category tab or applies a filter. */
  document.addEventListener('click', function (ev) {
    const btn = ev.target && ev.target.closest && ev.target.closest('.sp-lc-add');
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    const url = btn.getAttribute('data-app-url');
    if (url) window.open(url, '_blank', 'noopener');
  }, true); /* capture so we beat the card-link's bubble handler */
})();
