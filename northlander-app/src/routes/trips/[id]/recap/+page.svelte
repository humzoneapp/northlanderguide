<script>
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { getTrip } from '$lib/stores/trips.js';
  import { listPhotos } from '$lib/stores/photos.js';
  import { listDiaryEntries } from '$lib/stores/diary.js';
  import { listBookings } from '$lib/stores/bookings.js';
  import { listBudgetEntries, totalOf, formatAmount } from '$lib/stores/budget.js';
  import { getStopsByIds, getStop } from '$lib/data/stops.js';
  import {
    arrivalClock,
    departureFor,
    formatTripDate,
    DIRECTIONS
  } from '$lib/data/schedule.js';
  import Suitcase from '$lib/components/Suitcase.svelte';

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
      <div class="cover-suitcase">
        <Suitcase color={trip.color} strap={trip.strap} label="" />
      </div>
    </div>
  </section>

  <!-- ===== The route taken ===== -->
  {#if stops.length > 0}
    <section class="section">
      <div class="kicker">Chapter One</div>
      <h2>Where you went</h2>

      <ol class="timeline">
        {#each stops as stop, i}
          {@const stopPhotos = photosAt(stop.id)}
          {@const stopDiary = diaryAt(stop.id)}
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
        {/each}
      </ol>
    </section>
  {/if}

  <!-- ===== Photo wall ===== -->
  {#if photos.length > 0}
    <section class="section">
      <div class="kicker">Chapter Two</div>
      <h2>Through your lens</h2>

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
      <div class="kicker">Chapter Three</div>
      <h2>In your own words</h2>

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
      <div class="kicker">Chapter Four</div>
      <h2>By the numbers</h2>
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
    .cover-suitcase {
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
  .cover-suitcase {
    max-width: 220px;
    justify-self: center;
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

  /* ===== Timeline ===== */
  .timeline {
    list-style: none;
    padding: 0;
    margin: 0;
    position: relative;
  }
  .timeline::before {
    content: '';
    position: absolute;
    left: 18px;
    top: 18px;
    bottom: 18px;
    border-left: 2px dashed #7d3a1e;
  }
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
