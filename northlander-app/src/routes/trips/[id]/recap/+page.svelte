<script>
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { getTrip } from '$lib/stores/trips.js';
  import { listPhotos } from '$lib/stores/photos.js';
  import { listDiaryEntries } from '$lib/stores/diary.js';
  import { listBookings } from '$lib/stores/bookings.js';
  import { listBudgetEntries, totalOf, formatAmount } from '$lib/stores/budget.js';
  import { getStopsByIds, getStop, stopImageUrl } from '$lib/data/stops.js';
  import {
    arrivalClock,
    departureFor,
    formatTripDate,
    DIRECTIONS,
    travelDuration
  } from '$lib/data/schedule.js';

  let trip = null;
  let photos = [];
  let diary = [];
  let bookings = [];
  let budget = [];
  let loaded = false;

  /* Object URLs for the photo wall, keyed by photo id. Built once
     in onMount + torn down in onDestroy so blobs don't leak. */
  let photoUrls = new Map();

  $: id = $page.params.id;
  $: stops = trip ? deriveStops(trip) : [];
  $: dirMeta = trip ? DIRECTIONS.find((d) => d.id === (trip.direction || 'northbound')) || DIRECTIONS[0] : null;
  $: bookedCount = bookings.filter((b) => b.status === 'booked').length;
  $: totalSpent = totalOf(budget);
  $: tripDateLine = trip && trip.departureDate ? formatTripDate(trip.departureDate) : '';

  function deriveStops(t) {
    const forward = getStopsByIds(t.stopIds || []);
    return (t.direction === 'southbound') ? forward.slice().reverse() : forward;
  }

  function stopName(stopId) {
    const s = stopId ? getStop(stopId) : null;
    return s ? s.name : '';
  }

  function photosAt(stopId) {
    return photos.filter((p) => p.stopId === stopId);
  }

  function diaryAt(stopId) {
    return diary.filter((d) => d.stopId === stopId);
  }

  function thumbUrl(p) {
    const u = photoUrls.get(p.id);
    return u ? u.thumb : '';
  }

  /* Five frames band between the cover and Chapter One. Prefers
     the user's own photos so the recap reads as their record;
     falls back to stop hero photos when no user photos are in
     the album so the band still seeds the scrapbook mood for
     trips that were planned but never photographed. */
  function buildFrames(ps, ss, urls) {
    if (Array.isArray(ps) && ps.length > 0) {
      return ps.slice(0, 5).map((p, i) => ({
        src: (urls.get(p.id) || {}).thumb || '',
        caption: stopName(p.stopId) || p.caption || '',
        tilt: ((i % 5) - 2) * 3,
        isUser: true
      }));
    }
    if (Array.isArray(ss) && ss.length > 0) {
      return ss.slice(0, 5).map((s, i) => ({
        src: stopImageUrl(s),
        caption: s.name,
        tilt: ((i % 5) - 2) * 3,
        isUser: false
      }));
    }
    return [];
  }
  $: frames = buildFrames(photos, stops, photoUrls);

  /* Hero polaroid for the cover. Prefers the user's first photo so
     the recap reads as their record; falls back to the arriving
     stop's hero photo when the album is empty so even
     un-photographed trips get a real image. */
  $: coverHeroSrc = (() => {
    if (Array.isArray(photos) && photos.length > 0) {
      const first = photos[0];
      const urls = photoUrls.get(first.id);
      if (urls && urls.full) return urls.full;
    }
    const arriving = stops.length > 0 ? stops[stops.length - 1] : null;
    return arriving ? stopImageUrl(arriving) : '';
  })();
  $: coverHeroCaption = (() => {
    if (Array.isArray(photos) && photos.length > 0) {
      const first = photos[0];
      if (first && first.caption) return first.caption;
    }
    const arriving = stops.length > 0 ? stops[stops.length - 1] : null;
    return arriving ? arriving.name : (trip ? trip.name : '');
  })();

  function relDate(ms) {
    if (!ms) return '';
    const dt = new Date(ms);
    return dt.toLocaleDateString('en-CA', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  /* The polaroid wall rotates each photo a few degrees so it reads
     as a scrapbook page. Cycle through six values keyed by index so
     the same photo keeps the same tilt across re-renders. */
  const tilts = [-4, 3, -2, 4, -3, 2];

  onMount(async () => {
    trip = (await getTrip(id)) || null;
    if (trip) {
      const [ph, d, b, bu] = await Promise.all([
        listPhotos(id),
        listDiaryEntries(id),
        listBookings(id),
        listBudgetEntries(id)
      ]);
      /* Walk diary oldest-first on the recap page so the journey
         reads chronologically; the trip-detail diary kept newest
         first for editing convenience. */
      photos = ph.slice().sort((a, b) => a.createdAt - b.createdAt);
      diary = d.slice().sort((a, b) => a.createdAt - b.createdAt);
      bookings = b;
      budget = bu;
      const next = new Map();
      for (const p of photos) {
        next.set(p.id, {
          thumb: URL.createObjectURL(p.thumb),
          full: URL.createObjectURL(p.blob)
        });
      }
      photoUrls = next;
    }
    loaded = true;
  });

  onDestroy(() => {
    for (const u of photoUrls.values()) {
      if (u.thumb) URL.revokeObjectURL(u.thumb);
      if (u.full) URL.revokeObjectURL(u.full);
    }
    photoUrls.clear();
  });

  function printRecap() {
    try { window.print(); } catch (_) {}
  }
</script>

<svelte:head>
  <title>{trip ? trip.name + ' - A Recap' : 'Trip recap - Northlander'}</title>
  <style>
    body { background: #f5f0e8 !important; }
    .topbar, footer { display: none !important; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .recap-actions { display: none !important; }
      @page { size: letter; margin: 0.5in; }
    }
  </style>
</svelte:head>

{#if !loaded}
  <p class="loading">Pulling your trip together...</p>
{:else if !trip}
  <section class="not-found">
    <h1>That trip isn't around any more.</h1>
    <a href="/" class="btn-primary">Back to your platform</a>
  </section>
{:else}
  <!-- ===== Cover ===== -->
  <section class="cover">
    <div class="cover-inner">
      <div class="cover-text">
        <div class="kicker kicker-on-dark">A Northlander Recap</div>
        <h1>{trip.name}</h1>
        {#if tripDateLine}
          <p class="cover-date">{tripDateLine}</p>
        {/if}
        {#if stops.length > 1}
          <p class="cover-route">
            {stops[0].name} <span class="opacity-70">to</span> {stops[stops.length - 1].name}
          </p>
        {/if}

        <ul class="stats">
          <li><b>{stops.length || 0}</b><span>{stops.length === 1 ? 'Stop' : 'Stops'}</span></li>
          <li><b>{photos.length}</b><span>{photos.length === 1 ? 'Photo' : 'Photos'}</span></li>
          <li><b>{diary.length}</b><span>{diary.length === 1 ? 'Note' : 'Notes'}</span></li>
          <li><b>{bookedCount}</b><span>Booked</span></li>
          {#if budget.length > 0}
            <li><b>{formatAmount(totalSpent)}</b><span>Spent</span></li>
          {/if}
        </ul>
      </div>
      <figure class="cover-polaroid" aria-hidden="true">
        {#if coverHeroSrc}
          <img src={coverHeroSrc} alt="" loading="eager" />
        {:else}
          <div class="cover-polaroid-blank"></div>
        {/if}
        <figcaption>{coverHeroCaption}</figcaption>
      </figure>
    </div>
  </section>

  <!-- ===== Five frames =====
       Polaroid band between the cover and the chapters - mood-setter
       made of the user's own photos when available, stop hero photos
       otherwise. -->
  {#if frames.length > 0}
    <section class="frames">
      <div class="frames-inner">
        <div class="kicker frames-kicker">{photos.length > 0 ? 'A few frames' : 'The route in pictures'}</div>
        <div class="frames-row">
          {#each frames as f, i}
            <figure class="frame-card" style="--rot:{f.tilt}deg;--i:{i}">
              <img src={f.src} alt={f.caption} loading="lazy" />
              {#if f.caption}<figcaption>{f.caption}</figcaption>{/if}
            </figure>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <!-- ===== The route taken ===== -->
  {#if stops.length > 0}
    <section class="section">
      <header class="chapter-head">
        <span class="chapter-medal" aria-hidden="true"><span class="chapter-num">1</span></span>
        <span class="chapter-rule" aria-hidden="true"></span>
        <div class="chapter-text">
          <div class="kicker">Chapter One</div>
          <h2>Where you went</h2>
        </div>
      </header>

      <ol class="timeline">
        {#each stops as stop, i}
          {@const stopPhotos = photosAt(stop.id)}
          {@const stopDiary = diaryAt(stop.id)}
          {@const isLast = i === stops.length - 1}
          <li class="tl-row">
            <span class="tl-marker">{i + 1}</span>
            <div class="tl-card">
              <div class="tl-head">
                <h3>{stop.name}</h3>
                {#if dirMeta && stop.offsetMinutes != null}
                  <span class="tl-time">
                    {arrivalClock(stop.offsetMinutes, departureFor(trip.direction || 'northbound'), trip.direction || 'northbound')}
                  </span>
                {/if}
              </div>
              <div class="tl-meta">{stop.region}</div>

              {#if stopPhotos.length > 0}
                <div class="tl-photos">
                  {#each stopPhotos.slice(0, 3) as p}
                    <img src={thumbUrl(p)} alt={p.caption || stop.name} loading="lazy" />
                  {/each}
                  {#if stopPhotos.length > 3}
                    <span class="tl-more">+{stopPhotos.length - 3} more</span>
                  {/if}
                </div>
              {/if}

              {#if stopDiary.length > 0}
                <p class="tl-note">{stopDiary[0].text}</p>
              {/if}
            </div>
          </li>

          {#if !isLast}
            <li class="tl-connector" aria-hidden="true">
              <span class="tl-train">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="4" y="4" width="16" height="14" rx="3" />
                  <path d="M4 11 L20 11" />
                  <circle cx="8.5" cy="20" r="1.4" />
                  <circle cx="15.5" cy="20" r="1.4" />
                  <path d="M7 17 L7 19" />
                  <path d="M17 17 L17 19" />
                </svg>
              </span>
              <span class="tl-rail"></span>
              <span class="tl-travel">
                {travelDuration(
                  Math.abs((stops[i + 1].offsetMinutes || 0) - (stop.offsetMinutes || 0))
                )}
                to {stops[i + 1].name}
              </span>
            </li>
          {/if}
        {/each}
      </ol>
    </section>
  {/if}

  <!-- ===== Photo wall ===== -->
  {#if photos.length > 0}
    <section class="section">
      <header class="chapter-head">
        <span class="chapter-medal" aria-hidden="true"><span class="chapter-num">2</span></span>
        <span class="chapter-rule" aria-hidden="true"></span>
        <div class="chapter-text">
          <div class="kicker">Chapter Two</div>
          <h2>Through your lens</h2>
        </div>
      </header>

      <div class="wall">
        {#each photos as p, i (p.id)}
          <figure class="polaroid" style="--rot: {tilts[i % tilts.length]}deg">
            <img src={thumbUrl(p)} alt={p.caption || ''} loading="lazy" />
            {#if p.caption}
              <figcaption>{p.caption}</figcaption>
            {/if}
            {#if stopName(p.stopId)}
              <span class="polaroid-tag">{stopName(p.stopId)}</span>
            {/if}
          </figure>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ===== Diary ===== -->
  {#if diary.length > 0}
    <section class="section">
      <header class="chapter-head">
        <span class="chapter-medal" aria-hidden="true"><span class="chapter-num">3</span></span>
        <span class="chapter-rule" aria-hidden="true"></span>
        <div class="chapter-text">
          <div class="kicker">Chapter Three</div>
          <h2>In your own words</h2>
        </div>
      </header>

      <ol class="journal">
        {#each diary as entry}
          <li>
            <div class="entry-meta">
              <span>{relDate(entry.createdAt)}</span>
              {#if stopName(entry.stopId)}
                <span class="entry-pin">At {stopName(entry.stopId)}</span>
              {/if}
            </div>
            <p>{entry.text}</p>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  <!-- ===== Budget summary ===== -->
  {#if budget.length > 0}
    <section class="section">
      <header class="chapter-head">
        <span class="chapter-medal" aria-hidden="true"><span class="chapter-num">4</span></span>
        <span class="chapter-rule" aria-hidden="true"></span>
        <div class="chapter-text">
          <div class="kicker">Chapter Four</div>
          <h2>By the numbers</h2>
        </div>
      </header>
      <p class="budget-line">
        <strong>{formatAmount(totalSpent)}</strong>
        across {budget.length} {budget.length === 1 ? 'line' : 'lines'} in your ledger.
      </p>
    </section>
  {/if}

  <!-- ===== Footer / sign-off ===== -->
  <section class="sign-off">
    <h2>Until next time.</h2>
    <p>Packed with Northlander.app</p>
    <div class="recap-actions">
      <a href={`/trips/${trip.id}`} class="back">&larr; Back to trip</a>
      <button type="button" class="btn-primary" on:click={printRecap}>Save as PDF</button>
    </div>
  </section>
{/if}

<style>
  .loading,
  .not-found {
    text-align: center;
    padding: 80px 24px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
  }
  .not-found h1 {
    font-style: normal;
    color: #0a2d21;
    font-size: clamp(1.6rem, 4vw, 2.2rem);
    margin-bottom: 22px;
  }

  /* ===== Cover ===== */
  .cover {
    background:
      radial-gradient(circle at 70% 30%, rgba(196, 134, 15, 0.22), transparent 55%),
      linear-gradient(180deg, #0a2d21 0%, #0e3b2c 100%);
    color: #f5f0e8;
    padding: 64px 24px 48px;
  }
  .cover-inner {
    max-width: 1080px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 220px;
    gap: 36px;
    align-items: center;
  }
  @media (max-width: 720px) {
    .cover-inner {
      grid-template-columns: 1fr;
    }
    .cover-polaroid {
      margin: 0 auto;
      max-width: 200px;
    }
  }
  .kicker-on-dark {
    color: #c4860f;
  }
  .cover h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2.4rem, 6vw, 4rem);
    line-height: 1;
    margin: 10px 0 14px;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  .cover-date {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(16px, 2vw, 18px);
    color: #c9a84c;
    margin: 0 0 4px;
  }
  .cover-route {
    font-family: 'Spline Sans', sans-serif;
    font-size: 13px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #cad7cf;
    margin: 0 0 22px;
  }
  .opacity-70 { opacity: 0.7; }

  .stats {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 18px;
    border-top: 1px dashed rgba(201, 168, 76, 0.45);
    padding-top: 18px;
  }
  .stats li {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stats b {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(28px, 4vw, 38px);
    color: #c9a84c;
    line-height: 1;
  }
  .stats span {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
    color: #cad7cf;
  }
  .cover-polaroid {
    margin: 0;
    background: #fffdf6;
    padding: 14px 14px 22px;
    max-width: 220px;
    width: 100%;
    justify-self: center;
    box-shadow:
      0 22px 36px rgba(8, 22, 14, 0.5),
      0 4px 10px rgba(8, 22, 14, 0.3);
    transform: rotate(-3deg);
  }
  .cover-polaroid img,
  .cover-polaroid-blank {
    display: block;
    width: 100%;
    height: 220px;
    object-fit: cover;
    background: #ede0cc;
  }
  .cover-polaroid figcaption {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-style: italic;
    font-size: 14px;
    color: #0a2d21;
    text-align: center;
    padding-top: 12px;
    letter-spacing: 0.02em;
  }

  /* ===== Five frames band ===== */
  .frames {
    background:
      radial-gradient(circle at 50% 0%, rgba(196, 134, 15, 0.08), transparent 60%),
      #f5f0e8;
    padding: 40px 24px 36px;
    border-bottom: 1px dashed rgba(125, 58, 30, 0.3);
  }
  .frames-inner {
    max-width: 1080px;
    margin: 0 auto;
  }
  .frames-kicker {
    text-align: center;
    margin-bottom: 22px;
  }
  .frames-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 16px;
  }
  .frame-card {
    background: #fbf6ea;
    padding: 8px 8px 14px;
    box-shadow: 0 14px 28px rgba(40, 20, 5, 0.18);
    margin: 0;
    transform: rotate(var(--rot, 0deg)) translateY(calc(var(--i, 0) * -2px));
    transition: transform 320ms cubic-bezier(.2,.7,.3,1);
  }
  .frame-card:hover {
    transform: rotate(0deg) translateY(-6px);
    z-index: 4;
  }
  .frame-card img {
    width: clamp(110px, 16vw, 170px);
    height: clamp(110px, 16vw, 170px);
    object-fit: cover;
    background: #ede0cc;
    display: block;
  }
  .frame-card figcaption {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #0a2d21;
    text-align: center;
    padding-top: 6px;
    max-width: clamp(110px, 16vw, 170px);
    overflow-wrap: anywhere;
  }

  /* ===== Section frame ===== */
  .section {
    max-width: 1080px;
    margin: 56px auto 0;
    padding: 0 24px;
  }
  .section h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(1.8rem, 4vw, 2.6rem);
    color: #0a2d21;
    line-height: 1.05;
    margin: 6px 0 20px;
    letter-spacing: -0.01em;
  }
  .kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #7d3a1e;
  }

  /* ===== Chapter heading ===== */
  /* Numbered forest medallion + dashed gold rule + kicker + h2.
     Mirrors the RouteMap pin so the chapter rhythm reads as a
     continuation of the rest of the app's vocabulary. */
  .chapter-head {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 18px;
  }
  .chapter-medal {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #0a2d21;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      inset 0 0 0 2.5px #c9a84c,
      0 0 0 4px rgba(196, 134, 15, 0.18),
      0 6px 14px rgba(40, 20, 5, 0.18);
  }
  .chapter-num {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 19px;
    color: #c9a84c;
    line-height: 1;
  }
  .chapter-rule {
    flex: 0 0 60px;
    height: 0;
    border-top: 2px dashed rgba(196, 134, 15, 0.7);
  }
  .chapter-text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .chapter-text .kicker {
    margin-bottom: 0;
  }
  .chapter-text h2 {
    margin: 4px 0 0;
  }
  @media (max-width: 640px) {
    .chapter-head { gap: 10px; }
    .chapter-medal { width: 38px; height: 38px; }
    .chapter-num { font-size: 16px; }
    .chapter-rule { flex-basis: 30px; }
  }

  /* ===== Timeline ===== */
  .timeline {
    list-style: none;
    padding: 0;
    margin: 0;
    position: relative;
  }
  /* The decorative vertical rail has been retired - the connector
     rows now carry the visual continuity between stops with their
     own train icon + dashed line + travel-time label, the same
     vocabulary the cinematic itinerary scenes use. */
  .tl-row {
    position: relative;
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: 18px;
    padding: 10px 0;
  }
  .tl-marker {
    background: #0a2d21;
    color: #f5f0e8;
    border: 3px solid #c9a84c;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 16px;
    z-index: 1;
  }
  .tl-card {
    background: #fbf6ea;
    border-left: 4px solid #7d3a1e;
    padding: 14px 18px;
    box-shadow: 0 4px 12px rgba(80, 50, 20, 0.07);
  }

  /* Vintage train-line connector between timeline stops. Matches
     the connector pattern in the cinematic itinerary scenes so the
     recap reads as the same world. The row spans the full timeline
     grid width and centres its contents. */
  .tl-connector {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 14px 0;
    color: #c4860f;
  }
  .tl-train {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #c4860f;
  }
  .tl-train svg { width: 24px; height: 24px; }
  .tl-rail {
    width: clamp(40px, 14vw, 140px);
    height: 0;
    border-top: 2px dashed rgba(196, 134, 15, 0.7);
  }
  .tl-travel {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    font-size: clamp(13px, 1.6vw, 15px);
  }
  .tl-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .tl-card h3 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 22px;
    color: #0a2d21;
    margin: 0;
  }
  .tl-time {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    color: #7d3a1e;
    font-size: 15px;
  }
  .tl-meta {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #5a4f3d;
    font-weight: 700;
    margin: 4px 0 8px;
  }
  .tl-photos {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    margin: 10px 0;
  }
  .tl-photos img {
    width: 80px;
    height: 80px;
    object-fit: cover;
    border: 4px solid #ffffff;
    box-shadow: 0 4px 10px rgba(40, 20, 5, 0.16);
  }
  .tl-more {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #7d3a1e;
  }
  .tl-note {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 15px;
    color: #241f1a;
    line-height: 1.55;
    margin: 10px 0 0;
    white-space: pre-wrap;
  }

  /* ===== Photo wall ===== */
  .wall {
    display: grid;
    gap: 28px;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }
  .polaroid {
    position: relative;
    background: #fbf6ea;
    padding: 12px 12px 16px;
    box-shadow: 0 12px 26px rgba(40, 20, 5, 0.28);
    transform: rotate(var(--rot, 0deg));
    transition: transform 0.25s ease, box-shadow 0.25s ease;
    margin: 0;
  }
  .polaroid:hover {
    transform: rotate(0deg) translateY(-4px);
    box-shadow: 0 16px 32px rgba(40, 20, 5, 0.32);
  }
  .polaroid img {
    width: 100%;
    aspect-ratio: 1 / 1;
    object-fit: cover;
    background: #ede0cc;
    display: block;
  }
  .polaroid figcaption {
    margin-top: 8px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 14px;
    color: #241f1a;
    text-align: center;
    line-height: 1.4;
  }
  .polaroid-tag {
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    background: #c4860f;
    color: #0a2d21;
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding: 3px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }

  /* ===== Journal ===== */
  .journal {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .journal li {
    background: #fbf6ea;
    border-left: 4px solid #c4860f;
    padding: 16px 20px;
    box-shadow: 0 4px 12px rgba(80, 50, 20, 0.07);
  }
  .entry-meta {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
    font-weight: 700;
  }
  .entry-pin {
    color: #0a2d21;
  }
  .journal p {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 17px;
    line-height: 1.6;
    color: #241f1a;
    margin: 0;
    white-space: pre-wrap;
  }

  /* ===== Budget summary ===== */
  .budget-line {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(22px, 3vw, 30px);
    color: #0a2d21;
    margin: 0;
  }
  .budget-line strong {
    font-weight: 900;
    color: #7d3a1e;
  }

  /* ===== Sign off ===== */
  .sign-off {
    margin-top: 80px;
    background: linear-gradient(180deg, #0e3b2c 0%, #0a2d21 100%);
    color: #f5f0e8;
    padding: 56px 24px;
    text-align: center;
  }
  .sign-off h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: clamp(1.8rem, 5vw, 2.6rem);
    color: #c9a84c;
    margin: 0 0 6px;
  }
  .sign-off p {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #cad7cf;
    margin: 0 0 28px;
  }
  .recap-actions {
    display: flex;
    gap: 14px;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
  }
  .recap-actions .back {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #c9a84c;
    text-decoration: none;
    padding: 4px 6px;
  }
  .recap-actions .back:hover {
    color: #f5f0e8;
  }
</style>
