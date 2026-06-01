<script>
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { getTrip } from '$lib/stores/trips.js';
  import { listBookings, BOOKING_KINDS } from '$lib/stores/bookings.js';
  import { listDiaryEntries } from '$lib/stores/diary.js';
  import { listPhotos } from '$lib/stores/photos.js';
  import { getStopsByIds, getStop, stopGuideUrl } from '$lib/data/stops.js';
  import {
    arrivalClock,
    departureFor,
    formatTripDate,
    DIRECTIONS,
    travelDuration
  } from '$lib/data/schedule.js';

  let trip = null;
  let bookings = [];
  let diary = [];
  let photos = [];
  let loaded = false;

  /* Object URLs for the per-stop photo strips. Built once on mount,
     revoked on destroy so we don't leak across navigations. */
  let photoUrls = new Map();

  $: id = $page.params.id;
  $: stops = trip ? deriveStops(trip) : [];
  $: dirMeta = trip ? DIRECTIONS.find((d) => d.id === (trip.direction || 'northbound')) || DIRECTIONS[0] : null;
  $: depClock = trip ? departureFor(trip.direction || 'northbound') : '09:00';
  $: unassigned = bookings.filter((b) => !b.stopId);

  function deriveStops(t) {
    const forward = getStopsByIds(t.stopIds || []);
    return (t.direction === 'southbound') ? forward.slice().reverse() : forward;
  }

  function kindLabel(id) {
    return (BOOKING_KINDS.find((k) => k.id === id) || BOOKING_KINDS[4]).label;
  }

  function bookingsAt(stopId) {
    return bookings.filter((b) => b.stopId === stopId);
  }

  function diaryAt(stopId) {
    return diary.filter((d) => d.stopId === stopId);
  }

  function photosAt(stopId) {
    return photos.filter((p) => p.stopId === stopId);
  }

  function thumbUrl(p) {
    return photoUrls.get(p.id) || '';
  }

  /* Layout group names for the per-stop booking sub-sections. The
     order here is the order they render in: travel first (so you see
     the segment you'll catch), then sleep, eat, do, other. */
  const KIND_GROUPS = [
    { label: 'Travel',  kinds: ['train'] },
    { label: 'Stay',    kinds: ['room'] },
    { label: 'Eat',     kinds: ['meal'] },
    { label: 'Do',      kinds: ['activity'] },
    { label: 'Other',   kinds: ['other'] }
  ];

  function bookingsByGroup(items) {
    const out = [];
    for (const g of KIND_GROUPS) {
      const matches = items.filter((b) => g.kinds.includes(b.kind));
      if (matches.length > 0) out.push({ label: g.label, items: matches });
    }
    return out;
  }

  onMount(async () => {
    trip = (await getTrip(id)) || null;
    if (trip) {
      [bookings, diary, photos] = await Promise.all([
        listBookings(id),
        listDiaryEntries(id),
        listPhotos(id)
      ]);
      const next = new Map();
      for (const p of photos) {
        if (p.stopId) next.set(p.id, URL.createObjectURL(p.thumb));
      }
      photoUrls = next;
    }
    loaded = true;
  });

  onDestroy(() => {
    for (const u of photoUrls.values()) URL.revokeObjectURL(u);
    photoUrls.clear();
  });

  function printItinerary() {
    try { window.print(); } catch (_) {}
  }
</script>

<svelte:head>
  <title>{trip ? trip.name + ' - Itinerary' : 'Trip itinerary - Northlander'}</title>
  <style>
    body { background: #f5f0e8 !important; }
    .topbar, footer { display: none !important; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .it-actions { display: none !important; }
      @page { size: letter; margin: 0.5in; }
    }
  </style>
</svelte:head>

{#if !loaded}
  <p class="loading">Pulling your itinerary together...</p>
{:else if !trip}
  <section class="not-found">
    <h1>That trip isn't around any more.</h1>
    <a href="/" class="btn-primary">Back to your platform</a>
  </section>
{:else}
  <!-- ===== Top band ===== -->
  <header class="it-top">
    <div class="it-top-inner">
      <div class="kicker kicker-on-dark">Itinerary</div>
      <h1>{trip.name}</h1>
      <div class="it-meta">
        {#if dirMeta}
          <span>{dirMeta.from} <span class="opacity-70">to</span> {dirMeta.to}</span>
        {/if}
        {#if trip.departureDate}
          <span>{formatTripDate(trip.departureDate)}</span>
        {/if}
        <span>Departure {arrivalClock(0, depClock, trip.direction || 'northbound')}</span>
      </div>

      <div class="it-actions">
        <a href={`/trips/${trip.id}`} class="it-back">&larr; Back to trip</a>
        <button type="button" class="btn-primary" on:click={printItinerary}>Save as PDF</button>
      </div>
    </div>
  </header>

  {#if stops.length === 0}
    <section class="it-section">
      <div class="it-empty">
        <p>No stops on this trip yet.</p>
        <a href={`/trips/${trip.id}`} class="btn-primary mt-3">Add stops</a>
      </div>
    </section>
  {:else}
    <!-- ===== Per-stop cards ===== -->
    <section class="it-section">
      <ol class="it-stops">
        {#each stops as stop, i}
          {@const stopBookings = bookingsAt(stop.id)}
          {@const stopDiary = diaryAt(stop.id)}
          {@const stopPhotos = photosAt(stop.id)}
          {@const groups = bookingsByGroup(stopBookings)}
          {@const isLast = i === stops.length - 1}
          <li class="it-stop">
            <!-- Transit header (the train arriving at this stop) -->
            <div class="it-transit">
              <span class="it-marker">{i + 1}</span>
              <div>
                <div class="it-transit-time">
                  {arrivalClock(stop.offsetMinutes, depClock, trip.direction || 'northbound')}
                </div>
                <div class="it-transit-line">
                  {i === 0 ? 'Train departs' : 'Train arrives at'}  <strong>{stop.name}</strong>
                </div>
                <div class="it-transit-sub">{travelDuration(stop.offsetMinutes, trip.direction || 'northbound')}</div>
              </div>
            </div>

            <!-- Body: stop info, plans, notes, photos -->
            <div class="it-card">
              <div class="it-card-head">
                <div>
                  <h2 class="it-stop-name">{stop.name}</h2>
                  <div class="it-stop-region">{stop.region}</div>
                </div>
                <a
                  href={stopGuideUrl(stop)}
                  target="_blank"
                  rel="noopener"
                  class="it-guide-link"
                >Open on the Guide &rarr;</a>
              </div>

              {#if groups.length === 0 && stopDiary.length === 0 && stopPhotos.length === 0}
                <p class="it-free-time">
                  Free time at {stop.name}. Tap "Open on the Guide" above to find places to eat, see and stay - the + button on each listing drops it right onto this stop.
                </p>
              {/if}

              {#each groups as group}
                <div class="it-group">
                  <div class="it-group-head">{group.label}</div>
                  <ul class="it-list">
                    {#each group.items as b}
                      <li class:is-booked={b.status === 'booked'}>
                        <span class="it-list-title">{b.title}</span>
                        <span class="it-list-meta">
                          <span class="it-list-kind">{kindLabel(b.kind)}</span>
                          <span class="it-list-status" class:is-booked={b.status === 'booked'}>
                            {b.status === 'booked' ? 'Booked' : 'Pending'}
                          </span>
                        </span>
                        {#if b.kind === 'room' && (b.checkIn || b.checkOut || b.address || b.contact || b.confirmation)}
                          <span class="it-list-room">
                            {#if b.checkIn || b.checkOut}
                              {b.checkIn ? 'In ' + b.checkIn : ''}{b.checkIn && b.checkOut ? '  ·  ' : ''}{b.checkOut ? 'Out ' + b.checkOut : ''}
                            {/if}
                            {#if b.address}  ·  {b.address}{/if}
                            {#if b.contact}  ·  {b.contact}{/if}
                            {#if b.confirmation}  ·  Conf. {b.confirmation}{/if}
                          </span>
                        {/if}
                        {#if b.notes}
                          <span class="it-list-notes">{b.notes}</span>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </div>
              {/each}

              {#if stopDiary.length > 0}
                <div class="it-group">
                  <div class="it-group-head">Notes</div>
                  <ul class="it-notes">
                    {#each stopDiary as d}
                      <li>{d.text}</li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if stopPhotos.length > 0}
                <div class="it-group">
                  <div class="it-group-head">Photos</div>
                  <div class="it-photo-strip">
                    {#each stopPhotos.slice(0, 6) as p}
                      <img src={thumbUrl(p)} alt={p.caption || stop.name} loading="lazy" />
                    {/each}
                    {#if stopPhotos.length > 6}
                      <span class="it-photo-more">+{stopPhotos.length - 6}</span>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>

            {#if !isLast}
              <!-- Connector between stops -->
              <div class="it-connector" aria-hidden="true">
                <span class="it-rail"></span>
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  <!-- ===== Unassigned ===== -->
  {#if unassigned.length > 0}
    <section class="it-section it-unassigned">
      <div class="kicker">Loose plans</div>
      <h2>Not pinned to a stop yet</h2>
      <p class="it-unassigned-sub">
        These showed up in your booking checklist without a stop. Pin them on the Bookings card to drop them into the right spot above.
      </p>
      <ul class="it-list it-list--standalone">
        {#each unassigned as b}
          <li class:is-booked={b.status === 'booked'}>
            <span class="it-list-title">{b.title}</span>
            <span class="it-list-meta">
              <span class="it-list-kind">{kindLabel(b.kind)}</span>
              <span class="it-list-status" class:is-booked={b.status === 'booked'}>
                {b.status === 'booked' ? 'Booked' : 'Pending'}
              </span>
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <!-- ===== Sign-off ===== -->
  <section class="it-section it-foot">
    <h2>Ride safe.</h2>
    <p>Open this on your phone the morning you board.</p>
    <div class="it-actions">
      <a href={`/trips/${trip.id}`} class="it-back">&larr; Back to trip</a>
      <button type="button" class="btn-primary" on:click={printItinerary}>Save as PDF</button>
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

  /* ===== Top band ===== */
  .it-top {
    background:
      radial-gradient(circle at 80% 30%, rgba(196, 134, 15, 0.22), transparent 55%),
      linear-gradient(180deg, #0a2d21 0%, #0e3b2c 100%);
    color: #f5f0e8;
    padding: 48px 24px 32px;
  }
  .it-top-inner {
    max-width: 1080px;
    margin: 0 auto;
  }
  .kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .kicker-on-dark {
    color: #c4860f;
  }
  .it-top h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2rem, 5vw, 3.4rem);
    line-height: 1.02;
    margin: 8px 0 16px;
    overflow-wrap: anywhere;
  }
  .it-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px 22px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #cad7cf;
    font-weight: 600;
  }
  .opacity-70 { opacity: 0.7; }

  .it-actions {
    display: flex;
    gap: 14px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 22px;
  }
  .it-back {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #c9a84c;
    text-decoration: none;
    padding: 4px 6px;
  }
  .it-back:hover {
    color: #f5f0e8;
  }

  /* ===== Section frame ===== */
  .it-section {
    max-width: 1080px;
    margin: 32px auto 0;
    padding: 0 24px;
  }
  .it-section h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    color: #0a2d21;
    line-height: 1.05;
    margin: 6px 0 12px;
  }
  .it-empty {
    background: #fbf6ea;
    border: 1.5px dashed rgba(139, 106, 58, 0.55);
    padding: 36px 28px;
    text-align: center;
  }
  .it-empty p {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 0;
  }
  .mt-3 { margin-top: 18px; }

  /* ===== Stops ===== */
  .it-stops {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .it-stop {
    margin-bottom: 22px;
  }

  .it-transit {
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: 16px;
    align-items: center;
    background: #0a2d21;
    color: #f5f0e8;
    padding: 14px 18px;
    border-top: 3px solid #c9a84c;
  }
  .it-marker {
    background: #fbf6ea;
    color: #0a2d21;
    border: 3px solid #c9a84c;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 17px;
  }
  .it-transit-time {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 22px;
    color: #c9a84c;
    line-height: 1;
  }
  .it-transit-line {
    font-family: 'Spline Sans', sans-serif;
    font-size: 13px;
    color: #cad7cf;
    margin-top: 2px;
  }
  .it-transit-line strong {
    color: #f5f0e8;
    font-weight: 700;
  }
  .it-transit-sub {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
    color: #c4860f;
    margin-top: 4px;
  }

  .it-card {
    background: #fbf6ea;
    border-left: 4px solid #7d3a1e;
    padding: 18px 20px 14px;
    box-shadow: 0 4px 14px rgba(80, 50, 20, 0.07);
  }
  .it-card-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .it-stop-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(1.4rem, 3vw, 1.8rem);
    color: #0a2d21;
    margin: 0;
    line-height: 1.05;
  }
  .it-stop-region {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #5a4f3d;
    font-weight: 700;
    margin-top: 4px;
  }
  .it-guide-link {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
    text-decoration: none;
  }
  .it-guide-link:hover {
    color: #0a2d21;
  }

  .it-free-time {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 0;
  }

  .it-group {
    margin-top: 14px;
  }
  .it-group-head {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #7d3a1e;
    margin-bottom: 6px;
  }
  .it-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .it-list li {
    padding: 10px 0;
    border-bottom: 1px dashed rgba(139, 106, 58, 0.35);
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 14px;
  }
  .it-list li:last-child {
    border-bottom: 0;
  }
  .it-list--standalone li {
    background: #fbf6ea;
    border-left: 4px solid #c4860f;
    padding: 10px 14px;
    margin-bottom: 8px;
    border-bottom: 0;
  }
  .it-list-title {
    font-family: 'Spline Sans', sans-serif;
    font-size: 14.5px;
    color: #241f1a;
    font-weight: 600;
  }
  .it-list li.is-booked .it-list-title {
    text-decoration: line-through;
    text-decoration-color: #c9a84c;
    text-decoration-thickness: 1.5px;
    color: #5a4f3d;
  }
  .it-list-meta {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .it-list-kind {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12px;
    color: #7d3a1e;
  }
  .it-list-status {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1.5px dashed #c4860f;
    color: #6e2e17;
    background: rgba(196, 134, 15, 0.14);
    white-space: nowrap;
  }
  .it-list-status.is-booked {
    background: #0a2d21;
    color: #f3ece0;
    border-color: #0a2d21;
  }
  .it-list-room {
    grid-column: 1 / -1;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    color: #5a4f3d;
    padding-left: 8px;
    border-left: 2px solid #7d3a1e;
  }
  .it-list-notes {
    grid-column: 1 / -1;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #241f1a;
    opacity: 0.85;
    white-space: pre-wrap;
  }

  .it-notes {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .it-notes li {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 14.5px;
    line-height: 1.55;
    color: #241f1a;
    padding-left: 14px;
    border-left: 2px solid #c4860f;
    white-space: pre-wrap;
  }

  .it-photo-strip {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .it-photo-strip img {
    width: 72px;
    height: 72px;
    object-fit: cover;
    border: 3px solid #ffffff;
    box-shadow: 0 4px 10px rgba(40, 20, 5, 0.16);
  }
  .it-photo-more {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #7d3a1e;
    font-size: 13px;
  }

  /* Connector between two stop cards. The vertical rail extends the
     line implied by the train marker on the next card down. */
  .it-connector {
    display: flex;
    justify-content: flex-start;
    padding-left: 19px;
    padding-top: 8px;
    padding-bottom: 8px;
  }
  .it-rail {
    width: 2px;
    height: 32px;
    background: repeating-linear-gradient(180deg, #c9a84c 0 6px, transparent 6px 12px);
  }

  /* ===== Unassigned ===== */
  .it-unassigned-sub {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 0 0 12px;
  }

  /* ===== Sign-off ===== */
  .it-foot {
    margin-top: 60px;
    background: linear-gradient(180deg, #0e3b2c 0%, #0a2d21 100%);
    color: #f5f0e8;
    padding: 48px 24px;
    text-align: center;
    max-width: none;
  }
  .it-foot h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    color: #c9a84c;
    margin: 0 0 6px;
  }
  .it-foot p {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #cad7cf;
    margin: 0 0 22px;
  }
  .it-foot .it-actions {
    justify-content: center;
  }
</style>
