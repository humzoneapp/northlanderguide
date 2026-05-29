/* ==================================================================
   STOP PAGE renderer. Reads the stop id from the URL path, pulls
   editorial content from window.STOP_PAGES_DATA plus listings, fun
   facts, FAQs and packing items, and renders the full editorial page.
   ================================================================== */
(function () {
  'use strict';

  const SITE = 'https://www.northlanderguide.com';
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

  function listingCard(l) {
    const ratingHtml = (!l.rating || l.rating === 'NR')
      ? '<span class="sp-lc-rating">New</span>'
      : '<span class="sp-lc-rating"><i class="ph-fill ph-star" aria-hidden="true"></i> ' + esc(Number(l.rating).toFixed(1)) + '</span>';
    const walk = (l.walkMins != null)
      ? '<span class="sp-lc-walk"><span class="sp-walker" aria-hidden="true"></span>' + esc(l.walkMins) + ' min walk</span>'
      : '';
    const href = '/#stop=' + stopId + '&cat=' + l._cat.key + '&place=' + slug(l.name);
    return '<div class="sp-lcard">'
      + '<div class="sp-lc-top"><span class="sp-lc-tag">' + esc(l.tag || l._cat.label) + '</span>' + ratingHtml + '</div>'
      + '<h4>' + esc(l.name) + '</h4>'
      + (l.address ? '<p class="sp-lc-addr">' + esc(l.address) + '</p>' : '')
      + walk
      + '<a href="' + href + '" class="stop-page-link" style="margin-top:10px"><i class="ph-light ph-arrow-right icon-sm" aria-hidden="true"></i> View details</a>'
      + '</div>';
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
    + '<img id="spHeroImg" src="' + esc(heroImg) + '" alt="' + esc(displayName) + ' station illustration">'
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

  /* EDITORIAL INTRO */
  html += '<section class="sp-intro sp-section">'
    + '<div class="sp-intro-body">' + introParas.map(p => '<p>' + esc(p) + '</p>').join('') + '</div>'
    + '<aside class="sp-intro-aside">'
    + (introParas.length ? '<p class="sp-pullquote">' + esc(pullQuote(page.editorialIntro)) + '</p>' : '')
    + (page.walkabilityScore ? '<div class="sp-stat"><span class="sp-stat-num">' + esc(page.walkabilityScore) + '</span>'
      + '<span class="sp-stat-label">Walkability</span></div>' : '')
    + '</aside></section>';

  html += divider();

  /* GETTING HERE / AROUND */
  html += '<section class="sp-two sp-section">'
    + '<div class="sp-card"><div class="sp-label">Getting Here</div><p>' + esc(page.gettingHere) + '</p></div>'
    + '<div class="sp-card"><div class="sp-label">Getting Around</div><p>' + esc(page.gettingAround) + '</p></div>'
    + '</section>';

  html += divider();

  /* SEASONAL */
  html += '<section class="sp-section"><div class="sp-label">Through the Seasons</div>'
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
  html += '<section class="sp-section"><div class="sp-label">On the Ground</div>'
    + '<h2 class="sp-h2">Where to go in ' + esc(displayName) + '</h2>'
    + '<div class="sp-explore"><div class="sp-map" id="spMap"></div>'
    + '<div><div class="sp-tabs" id="spTabs"></div><div class="sp-listings" id="spListings"></div></div>'
    + '</div></section>';

  html += divider();

  /* EVENTS */
  html += '<section class="sp-section"><h2 class="sp-h2">What\'s On in ' + esc(displayName) + '</h2>'
    + '<div class="sp-events-empty"><i class="ph-light ph-calendar" aria-hidden="true"></i>'
    + '<p>Events coming soon. Know about something happening here? Submit it below.</p>'
    + '<a href="/#events">Submit an event</a></div></section>';

  html += divider();

  /* FAQ */
  html += '<section class="sp-section"><h2 class="sp-h2">Good to Know</h2><div id="spFaq">'
    + (faqs.length ? faqs.map((f, i) =>
      '<div class="sp-faq" data-faq="' + i + '"><button class="sp-faq-q" type="button">'
      + '<span>' + esc(f.question) + '</span><i class="ph-light ph-plus" aria-hidden="true"></i></button>'
      + '<div class="sp-faq-a">' + esc(f.answer) + '</div></div>').join('')
      : '<p class="sp-empty">Answers coming soon.</p>')
    + '</div></section>';

  html += divider();

  /* NEARBY */
  html += '<section class="sp-section"><h2 class="sp-h2">Continue Your Journey</h2>'
    + '<div class="sp-nearby">' + platform(prev, stopNumber - 1) + platform(next, stopNumber + 1)
    + (!prev && !next ? '<p class="sp-empty">End of the line.</p>' : '') + '</div></section>';

  html += divider();

  /* DON'T FORGET */
  html += '<section class="sp-section"><h2 class="sp-h2">Before You Board</h2>'
    + (dfItems.length
      ? '<div class="sp-df-list">' + dfItems.map(d =>
        '<div class="sp-df-item"><i class="ph-light ' + esc((d.icon || 'ph-circle').replace(/^ph(-fill)?\s+/, '')) + '" aria-hidden="true"></i>'
        + '<div><span class="sp-df-name">' + esc(d.item) + (d.priority === 'Essential' ? '<span class="sp-df-badge">Essential</span>' : '') + '</span>'
        + (d.why ? '<div class="sp-df-why">' + esc(d.why) + '</div>' : '') + '</div></div>').join('') + '</div>'
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
      + '<p class="sp-tip-text">' + esc(t.tip) + '</p>'
      + '<p class="sp-tip-by">' + esc(t.submittedBy || 'A traveller') + '</p></div>').join('')
    : '<div class="sp-tip" style="transform:rotate(-1.5deg)"><p class="sp-tip-text">'
      + 'Be the first to pin a tip about ' + esc(displayName) + '. Share a hidden gem, a timing trick, or a local favourite.</p>'
      + '<p class="sp-tip-by">The Northlander community</p></div>';
  html += '<section class="sp-section"><div class="sp-corkboard sp-paper"><div class="sp-corkboard-inner">'
    + '<h2 class="sp-h2">Traveller Tips</h2>'
    + '<div class="sp-tips">' + tipsHtml + '</div>'
    + '<form class="sp-tipform" id="spTipForm">'
    + '<div class="sp-label">Share a tip</div>'
    + '<textarea id="spTipText" maxlength="200" placeholder="What should travellers know about ' + esc(displayName) + '?"></textarea>'
    + '<div class="sp-tip-counter"><span id="spTipCount">0</span>/200</div>'
    + '<input id="spTipName" type="text" maxlength="60" placeholder="Your name (optional)">'
    + '<button class="sp-btn" type="submit"><i class="ph-light ph-paper-plane-tilt" aria-hidden="true"></i> Submit tip</button>'
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

  /* ---- tabs + listings ---- */
  function initTabs() {
    const tabsEl = document.getElementById('spTabs');
    const listEl = document.getElementById('spListings');
    const present = CATS.filter(c => (stopListings[c.key] || []).length);
    if (!present.length) { tabsEl.innerHTML = ''; listEl.innerHTML = '<p class="sp-empty">Listings for this stop are coming soon.</p>'; return; }
    tabsEl.innerHTML = present.map((c, i) =>
      '<button class="sp-tab' + (i === 0 ? ' active' : '') + '" data-cat="' + c.key + '">&mdash; ' + c.label + '</button>').join('');
    function paint(key) {
      const items = stopListings[key] || [];
      const cat = CATS.find(c => c.key === key);
      listEl.innerHTML = items.length
        ? items.map(l => listingCard(Object.assign({ _cat: cat }, l))).join('')
        : '<p class="sp-empty">Nothing here yet.</p>';
    }
    tabsEl.querySelectorAll('.sp-tab').forEach(b => b.addEventListener('click', () => {
      tabsEl.querySelectorAll('.sp-tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      paint(b.dataset.cat);
    }));
    paint(present[0].key);
  }

  /* ---- Leaflet map ---- */
  function initMap() {
    const el = document.getElementById('spMap');
    if (!el || typeof L === 'undefined' || meta.lat == null) { if (el) el.innerHTML = ''; return; }
    const map = L.map(el, { scrollWheelZoom: false }).setView([meta.lat, meta.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    const pts = [];
    allMapped.forEach(l => {
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
        + '<br><a href="' + href + '" style="color:#7d3a1e;font-size:12px;font-weight:600">View details</a></div>';
      const m = L.marker([l.lat, l.lng], { icon }).addTo(map).bindPopup(popup);
      m.bindTooltip(esc(l.name), { direction: 'top' });
      pts.push([l.lat, l.lng]);
    });
    if (pts.length > 1) { try { map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 }); } catch (e) {} }
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
    text.addEventListener('input', () => { count.textContent = text.value.length; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const tip = text.value.trim();
      if (!tip) { msg.textContent = 'Please write a tip first.'; return; }
      msg.textContent = 'Sending...';
      try {
        const res = await fetch('/api/submit-tip', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stop: displayName, tip, name: document.getElementById('spTipName').value.trim() })
        });
        if (res.ok) {
          form.reset(); count.textContent = '0';
          msg.textContent = 'Thank you. Your tip has been submitted for review.';
        } else {
          msg.textContent = 'Tip submission is not available yet. Please try again later.';
        }
      } catch (err) {
        msg.textContent = 'Tip submission is not available yet. Please try again later.';
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

  /* ---- SEO ---- */
  function setSeo() {
    const title = page.pageTitle || (displayName + ' - NorthlanderGuide.com');
    const desc = page.metaDescription || (page.heroTagline || '');
    const url = SITE + '/stops/' + stopId;
    const img = SITE + heroImg;
    document.title = title;
    setMeta('name', 'description', desc, 'metaDescription');
    setMeta('property', 'og:title', title, 'ogTitle');
    setMeta('property', 'og:description', desc, 'ogDescription');
    setMeta('property', 'og:image', img, 'ogImage');
    const can = document.getElementById('canonicalLink'); if (can) can.href = url;

    const ld = [
      {
        '@context': 'https://schema.org', '@type': 'TouristDestination',
        name: displayName, description: desc, image: img, url: url,
        geo: meta.lat != null ? { '@type': 'GeoCoordinates', latitude: meta.lat, longitude: meta.lng } : undefined
      },
      {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
          { '@type': 'ListItem', position: 2, name: 'Stops', item: SITE + '/#stopnav' },
          { '@type': 'ListItem', position: 3, name: displayName, item: url }
        ]
      }
    ];
    if (faqs.length) {
      ld.push({
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: faqs.map(f => ({
          '@type': 'Question', name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer }
        }))
      });
    }
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(ld);
    document.head.appendChild(s);
  }
  function setMeta(attr, key, val, id) {
    let el = document.getElementById(id) || document.querySelector('meta[' + attr + '="' + key + '"]');
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
    el.setAttribute('content', val || '');
  }

  function renderNotFound() {
    document.title = 'Stop not found - NorthlanderGuide.com';
    root.innerHTML = '<section class="sp-hero"><div class="sp-hero-titlewrap" style="margin-top:80px">'
      + '<h1 class="sp-hero-title in">Stop not found</h1>'
      + '<p class="sp-hero-tagline">We could not find that stop. Explore all 16 stops on the Northlander route.</p>'
      + '<div style="margin-top:24px"><a class="sp-btn" href="/#stopnav">Browse the route</a></div></div></section>';
  }
})();
