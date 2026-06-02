<script>
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { getTrip } from '$lib/stores/trips.js';
  import { listBookings, BOOKING_KINDS } from '$lib/stores/bookings.js';
  import { listDiaryEntries } from '$lib/stores/diary.js';
  import { listPhotos } from '$lib/stores/photos.js';
  import AddPlanModal from '$lib/components/AddPlanModal.svelte';
  import {
    getStopsByIds,
    getStop,
    stopGuideUrl,
    stopImageUrl
  } from '$lib/data/stops.js';
  import {
    arrivalClock,
    departureFor,
    formatTripDate,
    DIRECTIONS,
    travelDuration,
    travelMinutes,
    todayLocalISO
  } from '$lib/data/schedule.js';

  let trip = null;
  let bookings = [];
  let diary = [];
  let photos = [];
  let loaded = false;

  /* Object URLs for per-stop photo strips. Built once, torn down on
     destroy so blobs don't leak across navigations. */
  let photoUrls = new Map();

  /* AddPlanModal state. Pre-fills with the stop + kind the user
     tapped from so the modal opens already focused on what they
     want. The modal stays open across adds, so we only refresh
     bookings on its close event. */
  let showAddPlan = false;
  let addPlanStop = '';
  let addPlanKind = 'all';

  async function openAddPlan(stopId = '', kind = 'all') {
    addPlanStop = stopId;
    addPlanKind = kind;
    showAddPlan = true;
  }

  async function refreshBookings() {
    if (trip) {
      bookings = await listBookings(trip.id);
    }
  }

  async function closeAddPlan() {
    showAddPlan = false;
    /* New plans land in IndexedDB immediately; we just refetch so
       the scenes show them without a page reload. */
    await refreshBookings();
  }

  $: id = $page.params.id;
  $: stops = trip ? deriveStops(trip) : [];
  $: dirMeta = trip ? DIRECTIONS.find((d) => d.id === (trip.direction || 'northbound')) || DIRECTIONS[0] : null;
  $: depClock = trip ? departureFor(trip.direction || 'northbound') : '09:00';
  $: unassigned = bookings.filter((b) => !b.stopId);
  $: bookedCount = bookings.filter((b) => b.status === 'booked').length;
  $: tripDateLine = trip && trip.departureDate ? formatTripDate(trip.departureDate) : '';
  $: countdown = daysUntil(trip && trip.departureDate);

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

  /* Days from today to the departure date (local time). Returns null
     if the trip has no date set. Negative numbers mean the trip is
     in the past; we display those as "underway" or similar. */
  function daysUntil(yyyymmdd) {
    if (!yyyymmdd) return null;
    const today = todayLocalISO();
    const a = new Date(today);
    const b = new Date(yyyymmdd);
    const ms = b.getTime() - a.getTime();
    return Math.round(ms / 86400000);
  }

  /* Per-stop sub-section grouping. Order matters - the user reads
     this as a story so we want the practical (eat) before the
     experiential (do) and stay tucked in between. */
  const KIND_GROUPS = [
    { label: 'Travel',  kinds: ['train'] },
    { label: 'Sleep',   kinds: ['room'] },
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

  /* Window between this stop's arrival and the next stop's
     departure. Renders as "About 2h 25m here" in the empty-state
     copy so the user sees what they have to fill. */
  function hereDuration(i) {
    if (i >= stops.length - 1) return 'End of the line';
    const a = travelMinutes(stops[i].offsetMinutes, trip.direction || 'northbound');
    const b = travelMinutes(stops[i + 1].offsetMinutes, trip.direction || 'northbound');
    const delta = Math.max(0, b - a);
    if (delta < 60) return `About ${delta}m before the next train`;
    const h = Math.floor(delta / 60);
    const m = delta % 60;
    return `About ${h}h${m ? ' ' + m + 'm' : ''} before the next train`;
  }

  /* Pull every Guide stop image we have at the top so the hero
     polaroid collage can lay them out without worrying about
     undefined sources. */
  $: collagePhotos = stops.slice(0, 5).map((s) => ({
    src: stopImageUrl(s),
    name: s.name,
    tilt: ((stops.indexOf(s) % 5) - 2) * 4
  }));

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
    body { background: #0a2d21 !important; }
    .topbar, footer { display: none !important; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #ffffff !important; }
      .it-actions, .scene-explore { display: none !important; }
      @page { size: letter; margin: 0.5in; }
    }
  </style>
</svelte:head>

{#if !loaded}
  <p class="status">Pulling your itinerary together...</p>
{:else if !trip}
  <section class="not-found">
    <h1>That trip isn't around any more.</h1>
    <a href="/" class="btn-primary">Back to your platform</a>
  </section>
{:else}
  <!-- ===== Cinematic cover ===== -->
  <header class="cover">
    <div class="cover-noise" aria-hidden="true"></div>
    <div class="cover-inner">
      <div class="cover-text">
        <div class="kicker kicker-light">A Northlander Itinerary</div>
        <h1>{trip.name}</h1>

        <div class="cover-leg">
          {#if dirMeta}{dirMeta.from} <span class="opacity-70">to</span> {dirMeta.to}{/if}
          {#if dirMeta}<span class="dot">·</span>{/if}
          {dirMeta?.label || 'Northbound'}
        </div>

        {#if tripDateLine}
          <div class="cover-date">{tripDateLine}</div>
        {/if}

        {#if countdown != null}
          <div class="cover-countdown">
            {#if countdown > 1}
              <strong>{countdown}</strong> days until you board
            {:else if countdown === 1}
              <strong>Tomorrow.</strong> Final checks on the platform.
            {:else if countdown === 0}
              <strong>Today.</strong> Safe travels.
            {:else if countdown < 0}
              You've been. This is your record.
            {/if}
          </div>
        {:else}
          <div class="cover-countdown italic-soft">Pick a departure date and we'll count it down.</div>
        {/if}

        <ul class="cover-stats">
          <li><b>{stops.length}</b><span>{stops.length === 1 ? 'Stop' : 'Stops'}</span></li>
          <li><b>{bookings.length}</b><span>Plans</span></li>
          <li><b>{bookedCount}</b><span>Booked</span></li>
          <li><b>{photos.length}</b><span>Photos</span></li>
          <li><b>{diary.length}</b><span>Notes</span></li>
        </ul>

        <div class="it-actions">
          <button
            type="button"
            class="btn-primary cover-add"
            on:click={() => openAddPlan('', 'all')}
            aria-label="Add a place to your trip from the Guide"
          >
            <span class="cover-add-plus">+</span>
            <span>Add a plan</span>
          </button>
          <a href={`/trips/${trip.id}`} class="cover-back">&larr; Back to trip</a>
          <button type="button" class="btn-primary cover-print" on:click={printItinerary}>Save as PDF</button>
        </div>
      </div>

      <!-- Polaroid collage of the trip's stops in the hero -->
      {#if collagePhotos.length > 0}
        <div class="collage" aria-hidden="true">
          {#each collagePhotos as p, i}
            <figure class="collage-card" style="--rot:{p.tilt}deg;--i:{i}">
              <img src={p.src} alt="" loading="lazy" />
              <figcaption>{p.name}</figcaption>
            </figure>
          {/each}
        </div>
      {/if}
    </div>
  </header>

  <!-- ===== Narrative band ===== -->
  <section class="narrative">
    <div class="narrative-inner">
      <div class="kicker">The Story So Far</div>
      <h2 class="narrative-line">
        {#if stops.length === 0}
          Your suitcase has nothing in it yet. The first move is to choose where you want to go.
        {:else if bookings.length === 0 && diary.length === 0}
          Your route is set. Now the fun part: what you'll eat, where you'll sleep, and what you'll do at each stop.
        {:else}
          {stops.length} stops between {stops[0].name} and {stops[stops.length - 1].name}, with {bookings.length} {bookings.length === 1 ? 'plan' : 'plans'} stitched in.
        {/if}
      </h2>

      {#if stops.length === 0}
        <a href={`/trips/${trip.id}`} class="narrative-cta">Add stops &rarr;</a>
      {:else}
        <p class="narrative-hint">
          Tap "Open on the Guide" at any stop below. Each listing on NorthlanderGuide.com has a + button that drops it right here, pinned to the stop you found it at.
        </p>
      {/if}
    </div>
  </section>

  {#if stops.length > 0}
    <!-- ===== Stop scenes ===== -->
    <section class="scenes">
      {#each stops as stop, i}
        {@const stopBookings = bookingsAt(stop.id)}
        {@const stopDiary = diaryAt(stop.id)}
        {@const stopPhotos = photosAt(stop.id)}
        {@const groups = bookingsByGroup(stopBookings)}
        {@const isLast = i === stops.length - 1}
        {@const isEmpty = groups.length === 0 && stopDiary.length === 0 && stopPhotos.length === 0}

        <article class="scene" style="--bg:url('{stopImageUrl(stop)}')">
          <div class="scene-bg" aria-hidden="true"></div>
          <div class="scene-veil" aria-hidden="true"></div>

          <div class="scene-inner">
            <!-- Vintage station sign -->
            <div class="scene-sign">
              <span class="scene-num">{i + 1} of {stops.length}</span>
              <div class="scene-clock">{arrivalClock(stop.offsetMinutes, depClock, trip.direction || 'northbound')}</div>
              <span class="scene-clock-kicker">{i === 0 ? 'Departure' : 'Arrival'}</span>
            </div>

            <div class="scene-head">
              <div>
                <div class="kicker kicker-light">Chapter {i + 1}</div>
                <h2 class="scene-name">{stop.name}</h2>
                <div class="scene-region">{stop.region}</div>
              </div>
              <a
                href={stopGuideUrl(stop)}
                target="_blank"
                rel="noopener"
                class="scene-explore"
              >
                <span>Open on the Guide</span>
                <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </a>
            </div>

            <div class="scene-body">
              {#if isEmpty}
                <!-- The juicy empty state. This is where wonder gets seeded. -->
                <div class="scene-empty">
                  <p class="scene-empty-line">
                    {#if i === 0}
                      Your journey starts here.
                    {:else if isLast}
                      Last stop. Make it count.
                    {:else}
                      {hereDuration(i)}.
                    {/if}
                  </p>
                  <p class="scene-empty-sub">
                    {#if i === 0}
                      Grab a coffee, check the platform board, and step on.
                    {:else if isLast}
                      Stay overnight? Wander? Catch the connecting train? It's up to you.
                    {:else}
                      Eat something local. Walk to a viewpoint. Sit by the water. Whatever fits in the window.
                    {/if}
                  </p>
                  <div class="scene-prompts">
                    <button
                      type="button"
                      class="prompt prompt-eat"
                      on:click={() => openAddPlan(stop.id, 'eat')}
                    >
                      <span class="prompt-kicker">Eat</span>
                      <span class="prompt-label">Find a restaurant in {stop.name}</span>
                    </button>
                    <button
                      type="button"
                      class="prompt prompt-sleep"
                      on:click={() => openAddPlan(stop.id, 'stay')}
                    >
                      <span class="prompt-kicker">Sleep</span>
                      <span class="prompt-label">Find a place to stay</span>
                    </button>
                    <button
                      type="button"
                      class="prompt prompt-do"
                      on:click={() => openAddPlan(stop.id, 'do')}
                    >
                      <span class="prompt-kicker">Do</span>
                      <span class="prompt-label">See what's nearby</span>
                    </button>
                  </div>
                </div>
              {:else}
                <div class="scene-when">
                  {#if !isLast}
                    {hereDuration(i)}
                  {:else}
                    End of the line
                  {/if}
                </div>

                {#each groups as group}
                  <div class="scene-group">
                    <div class="group-head">
                      <span class="group-label">{group.label}</span>
                      <span class="group-rule" aria-hidden="true"></span>
                    </div>
                    <ul class="scene-list">
                      {#each group.items as b}
                        <li class:is-booked={b.status === 'booked'}>
                          <div class="line-main">
                            <span class="line-title">{b.title}</span>
                            <span class="line-status" class:is-booked={b.status === 'booked'}>
                              {b.status === 'booked' ? 'Booked' : 'Pending'}
                            </span>
                          </div>
                          {#if b.kind === 'room' && (b.checkIn || b.checkOut || b.address || b.contact || b.confirmation)}
                            <div class="line-room">
                              {#if b.checkIn || b.checkOut}
                                <span class="line-room-dates">
                                  {b.checkIn ? 'In ' + b.checkIn : ''}{b.checkIn && b.checkOut ? '  ·  ' : ''}{b.checkOut ? 'Out ' + b.checkOut : ''}
                                </span>
                              {/if}
                              {#if b.address}<span>{b.address}</span>{/if}
                              {#if b.contact}<span>{b.contact}</span>{/if}
                              {#if b.confirmation}<span>Conf. {b.confirmation}</span>{/if}
                            </div>
                          {/if}
                          {#if b.notes}
                            <p class="line-notes">{b.notes}</p>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/each}

                {#if stopDiary.length > 0}
                  <div class="scene-group">
                    <div class="group-head">
                      <span class="group-label">Notes from the journey</span>
                      <span class="group-rule" aria-hidden="true"></span>
                    </div>
                    <ul class="scene-diary">
                      {#each stopDiary as d}
                        <li>{d.text}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if stopPhotos.length > 0}
                  <div class="scene-group">
                    <div class="group-head">
                      <span class="group-label">Polaroids</span>
                      <span class="group-rule" aria-hidden="true"></span>
                    </div>
                    <div class="scene-photos">
                      {#each stopPhotos.slice(0, 6) as p, idx}
                        <figure class="mini-polaroid" style="--rot:{((idx % 5) - 2) * 3}deg">
                          <img src={thumbUrl(p)} alt={p.caption || stop.name} loading="lazy" />
                        </figure>
                      {/each}
                      {#if stopPhotos.length > 6}
                        <span class="scene-photos-more">+{stopPhotos.length - 6} in your album</span>
                      {/if}
                    </div>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        </article>

        {#if !isLast}
          <!-- Train-line connector to the next stop -->
          <div class="connector" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="connector-train" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="4" width="16" height="14" rx="3"/>
              <path d="M4 11 L20 11"/>
              <circle cx="8.5" cy="20" r="1.4"/>
              <circle cx="15.5" cy="20" r="1.4"/>
              <path d="M7 17 L7 19"/>
              <path d="M17 17 L17 19"/>
            </svg>
            <div class="connector-rail" aria-hidden="true"></div>
            <span class="connector-time">
              {travelDuration(
                Math.abs((stops[i + 1].offsetMinutes || 0) - (stop.offsetMinutes || 0))
              )}
              to {stops[i + 1].name}
            </span>
          </div>
        {/if}
      {/each}
    </section>
  {/if}

  <!-- ===== Loose plans ===== -->
  {#if unassigned.length > 0}
    <section class="loose">
      <div class="loose-inner">
        <div class="kicker">Loose plans</div>
        <h2>Not pinned to a stop yet</h2>
        <p>Open Bookings on the trip page to drop these onto the right stop.</p>
        <ul class="loose-list">
          {#each unassigned as b}
            <li>
              <span class="line-title">{b.title}</span>
              <span class="line-status" class:is-booked={b.status === 'booked'}>
                {b.status === 'booked' ? 'Booked' : 'Pending'}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    </section>
  {/if}

  <!-- ===== Sign off ===== -->
  <section class="foot">
    <h2>Ride safe.</h2>
    <p>Open this on your phone the morning you board.</p>
    <div class="it-actions foot-actions">
      <button
        type="button"
        class="btn-primary cover-add"
        on:click={() => openAddPlan('', 'all')}
      >
        <span class="cover-add-plus">+</span>
        <span>Add a plan</span>
      </button>
      <a href={`/trips/${trip.id}`} class="cover-back">&larr; Back to trip</a>
      <button type="button" class="btn-primary cover-print" on:click={printItinerary}>Save as PDF</button>
    </div>
  </section>

  {#if showAddPlan}
    <AddPlanModal
      tripId={trip.id}
      stopIds={trip.stopIds || []}
      initialStop={addPlanStop}
      initialKind={addPlanKind}
      existingBookings={bookings}
      on:close={closeAddPlan}
    />
  {/if}
{/if}

<style>
  .status {
    text-align: center;
    padding: 80px 24px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #c9a84c;
    background: #0a2d21;
  }
  .not-found {
    text-align: center;
    padding: 80px 24px;
    color: #f3ece0;
    background: #0a2d21;
  }
  .not-found h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    color: #f3ece0;
    margin-bottom: 22px;
  }

  /* ===== Cover ===== */
  .cover {
    position: relative;
    background:
      radial-gradient(ellipse at 70% 20%, rgba(196, 134, 15, 0.35), transparent 60%),
      linear-gradient(180deg, #0a2d21 0%, #16543e 100%);
    color: #f5f0e8;
    padding: 56px 24px 64px;
    overflow: hidden;
  }
  .cover-noise {
    position: absolute;
    inset: 0;
    background-image:
      repeating-linear-gradient(45deg, rgba(245, 240, 232, 0.025) 0, rgba(245, 240, 232, 0.025) 1px, transparent 1px, transparent 9px);
    pointer-events: none;
  }
  .cover-inner {
    max-width: 1180px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr;
    gap: 36px;
    position: relative;
    z-index: 2;
  }
  @media (min-width: 880px) {
    .cover-inner {
      grid-template-columns: 1.1fr 1fr;
      align-items: center;
    }
  }
  .kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .kicker-light {
    color: #c4860f;
  }
  .cover h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2.6rem, 7vw, 5rem);
    line-height: 0.95;
    margin: 12px 0 14px;
    letter-spacing: -0.015em;
    overflow-wrap: anywhere;
  }
  .cover-leg {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #cad7cf;
    font-weight: 600;
  }
  .cover-leg .dot {
    margin: 0 8px;
    color: #c4860f;
  }
  .opacity-70 { opacity: 0.7; }
  .cover-date {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(18px, 2.4vw, 22px);
    color: #c9a84c;
    margin: 10px 0 4px;
  }
  .cover-countdown {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(20px, 3vw, 28px);
    color: #f5f0e8;
    line-height: 1.2;
    margin: 14px 0 20px;
  }
  .cover-countdown strong {
    font-weight: 900;
    color: #c4860f;
  }
  .cover-countdown.italic-soft {
    font-style: italic;
    color: #cad7cf;
    font-size: clamp(15px, 2vw, 18px);
  }
  .cover-stats {
    list-style: none;
    padding: 22px 0 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: 16px;
    border-top: 1px dashed rgba(201, 168, 76, 0.45);
  }
  .cover-stats li {
    display: flex;
    flex-direction: column;
  }
  .cover-stats b {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(26px, 3.6vw, 34px);
    color: #c9a84c;
    line-height: 1;
  }
  .cover-stats span {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    font-weight: 700;
    color: #cad7cf;
    margin-top: 4px;
  }
  .it-actions {
    display: flex;
    gap: 14px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 22px;
  }
  .cover-back {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #c9a84c;
    text-decoration: none;
    padding: 4px 6px;
  }
  .cover-back:hover {
    color: #f5f0e8;
  }
  /* Primary action on the cover - amber so it stands out against
     the forest background and reads as "this is the main thing
     you do here". */
  .cover-add {
    background: #c4860f;
    border-color: #c4860f;
    color: #0a2d21;
    font-weight: 700;
    padding: 0.85rem 1.4rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 10px 22px rgba(196, 134, 15, 0.35);
  }
  .cover-add:hover {
    background: #f5f0e8;
    border-color: #f5f0e8;
    color: #0a2d21;
  }
  .cover-add-plus {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 20px;
    line-height: 1;
  }
  .cover-print {
    background: transparent;
    border: 2px solid rgba(201, 168, 76, 0.5);
    color: #c9a84c;
  }
  .cover-print:hover {
    background: rgba(201, 168, 76, 0.1);
    border-color: #c9a84c;
    color: #f5f0e8;
  }

  /* Polaroid collage. Scatters the first five stop photos at slight
     tilts so the cover looks like a scrapbook open on a desk. */
  .collage {
    position: relative;
    min-height: 280px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 14px;
  }
  .collage-card {
    background: #fbf6ea;
    padding: 8px 8px 12px;
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.4);
    margin: 0;
    transform: rotate(var(--rot, 0deg)) translateY(calc(var(--i, 0) * -4px));
    transition: transform 0.35s cubic-bezier(.2,.7,.3,1);
  }
  .collage-card:hover {
    transform: rotate(0deg) translateY(-8px);
    z-index: 4;
  }
  .collage-card img {
    width: clamp(110px, 16vw, 180px);
    height: clamp(110px, 16vw, 180px);
    object-fit: cover;
    background: #ede0cc;
    display: block;
  }
  .collage-card figcaption {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #0a2d21;
    text-align: center;
    padding-top: 6px;
  }

  /* ===== Narrative band ===== */
  .narrative {
    background: #fbf6ea;
    padding: 40px 24px;
    border-bottom: 2px solid #7d3a1e;
  }
  .narrative-inner {
    max-width: 920px;
    margin: 0 auto;
  }
  .narrative-line {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    font-size: clamp(1.6rem, 3.5vw, 2.4rem);
    color: #0a2d21;
    line-height: 1.15;
    margin: 8px 0 14px;
  }
  .narrative-hint {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    font-size: 16px;
    line-height: 1.55;
    margin: 0;
    max-width: 60ch;
  }
  .narrative-cta {
    display: inline-block;
    background: #6e2e17;
    color: #f3ece0;
    border: 2px solid #6e2e17;
    padding: 0.65rem 1.1rem;
    border-radius: 4px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    text-decoration: none;
  }

  /* ===== Stop scenes ===== */
  .scenes {
    background: #0a2d21;
    padding: 0;
  }
  .scene {
    position: relative;
    color: #f5f0e8;
    overflow: hidden;
  }
  .scene-bg {
    position: absolute;
    inset: 0;
    background-image: var(--bg);
    background-size: cover;
    background-position: center center;
    transform: scale(1.05);
  }
  /* Forest vignette + grain so text stays readable on any photo */
  .scene-veil {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(180deg, rgba(10, 30, 20, 0.85) 0%, rgba(10, 30, 20, 0.72) 40%, rgba(10, 30, 20, 0.92) 100%),
      radial-gradient(circle at 80% 20%, rgba(196, 134, 15, 0.25), transparent 55%);
  }
  .scene-inner {
    position: relative;
    z-index: 2;
    max-width: 1080px;
    margin: 0 auto;
    padding: 56px 24px 64px;
  }

  /* Top station-sign block: number + arrival clock */
  .scene-sign {
    display: inline-flex;
    align-items: baseline;
    gap: 14px;
    padding: 8px 16px;
    background: rgba(245, 240, 232, 0.12);
    border: 1px dashed rgba(201, 168, 76, 0.5);
    border-radius: 3px;
    margin-bottom: 18px;
  }
  .scene-num {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #c4860f;
    font-weight: 700;
  }
  .scene-clock {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 22px;
    color: #f5f0e8;
    line-height: 1;
  }
  .scene-clock-kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #cad7cf;
    font-weight: 700;
  }

  .scene-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 20px;
    flex-wrap: wrap;
    border-bottom: 1px dashed rgba(201, 168, 76, 0.35);
    padding-bottom: 18px;
    margin-bottom: 26px;
  }
  .scene-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2.4rem, 7vw, 4.4rem);
    line-height: 0.92;
    margin: 8px 0 4px;
    letter-spacing: -0.015em;
    text-shadow: 0 4px 22px rgba(0, 0, 0, 0.5);
  }
  .scene-region {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #c9a84c;
    font-weight: 700;
  }
  .scene-explore {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #c4860f;
    color: #0a2d21;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 10px 16px;
    border-radius: 3px;
    text-decoration: none;
    transition: background 0.15s, color 0.15s, transform 0.15s;
    box-shadow: 0 6px 14px rgba(196, 134, 15, 0.35);
  }
  .scene-explore:hover {
    background: #f5f0e8;
    color: #0a2d21;
    transform: translateY(-2px);
  }

  /* Empty state - this is where wonder gets seeded */
  .scene-empty {
    margin-top: 8px;
  }
  .scene-empty-line {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(1.6rem, 3.5vw, 2.4rem);
    color: #c9a84c;
    margin: 0 0 8px;
    line-height: 1.05;
  }
  .scene-empty-sub {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(15px, 2vw, 18px);
    color: #f5f0e8;
    opacity: 0.88;
    margin: 0 0 24px;
    max-width: 56ch;
  }
  .scene-prompts {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }
  @media (min-width: 640px) {
    .scene-prompts {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .prompt {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: rgba(245, 240, 232, 0.08);
    border: 1.5px dashed rgba(201, 168, 76, 0.55);
    padding: 16px 18px;
    text-decoration: none;
    color: #f5f0e8;
    transition: background 0.18s, border-color 0.18s, transform 0.18s;
    /* Reset <button> defaults so the same class works for both
       <a> and <button>. The element is decided at the call site
       based on whether we want an outbound link or an in-app
       modal trigger. */
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .prompt:hover {
    background: rgba(196, 134, 15, 0.18);
    border-color: #c9a84c;
    transform: translateY(-2px);
  }
  .prompt-kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #c4860f;
    font-weight: 700;
  }
  .prompt-label {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 16px;
    color: #f5f0e8;
    line-height: 1.3;
  }

  /* Plans groups when the stop has content */
  .scene-when {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #c4860f;
    font-weight: 700;
    margin-bottom: 18px;
  }
  .scene-group {
    margin-top: 22px;
  }
  .group-head {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 10px;
  }
  .group-label {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-style: italic;
    font-size: 18px;
    color: #c9a84c;
    flex: 0 0 auto;
  }
  .group-rule {
    flex: 1;
    height: 0;
    border-top: 1px dashed rgba(201, 168, 76, 0.35);
  }
  .scene-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .scene-list li {
    padding: 12px 0;
    border-bottom: 1px solid rgba(245, 240, 232, 0.08);
  }
  .scene-list li:last-child {
    border-bottom: 0;
  }
  .line-main {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 14px;
  }
  .line-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    font-size: clamp(17px, 2.3vw, 22px);
    color: #f5f0e8;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .scene-list li.is-booked .line-title {
    text-decoration: line-through;
    text-decoration-color: #c9a84c;
    text-decoration-thickness: 1.5px;
    color: #cad7cf;
  }
  .line-status {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1.5px dashed #c4860f;
    color: #c4860f;
    background: rgba(196, 134, 15, 0.16);
    white-space: nowrap;
    flex: 0 0 auto;
  }
  .line-status.is-booked {
    background: #c9a84c;
    color: #0a2d21;
    border-color: #c9a84c;
  }
  .line-room {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin-top: 6px;
    padding-left: 12px;
    border-left: 2px solid #c4860f;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    color: #cad7cf;
  }
  .line-room-dates {
    color: #c9a84c;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .line-notes {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #f5f0e8;
    opacity: 0.85;
    margin: 6px 0 0;
    white-space: pre-wrap;
  }

  .scene-diary {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .scene-diary li {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(15px, 2vw, 17px);
    color: #f5f0e8;
    line-height: 1.55;
    padding-left: 14px;
    border-left: 2px solid #c4860f;
    white-space: pre-wrap;
  }

  .scene-photos {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    align-items: center;
  }
  .mini-polaroid {
    background: #fbf6ea;
    padding: 6px 6px 10px;
    box-shadow: 0 10px 18px rgba(0, 0, 0, 0.4);
    margin: 0;
    transform: rotate(var(--rot, 0deg));
    transition: transform 0.3s ease;
  }
  .mini-polaroid:hover {
    transform: rotate(0deg) translateY(-3px);
  }
  .mini-polaroid img {
    width: 88px;
    height: 88px;
    object-fit: cover;
    background: #ede0cc;
    display: block;
  }
  .scene-photos-more {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #c9a84c;
    font-size: 14px;
  }

  /* ===== Connector ===== */
  .connector {
    background: #0a2d21;
    color: #c4860f;
    padding: 28px 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    flex-wrap: wrap;
    border-top: 1px solid rgba(201, 168, 76, 0.25);
    border-bottom: 1px solid rgba(201, 168, 76, 0.25);
  }
  .connector-train {
    width: 24px;
    height: 24px;
    color: #c4860f;
  }
  .connector-rail {
    width: clamp(40px, 12vw, 120px);
    height: 0;
    border-top: 2px dashed #c4860f;
  }
  .connector-time {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(15px, 2vw, 18px);
    color: #f5f0e8;
  }

  /* ===== Loose plans ===== */
  .loose {
    background: #fbf6ea;
    padding: 48px 24px;
  }
  .loose-inner {
    max-width: 920px;
    margin: 0 auto;
  }
  .loose h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    color: #0a2d21;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    margin: 8px 0 8px;
  }
  .loose p {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 0 0 16px;
  }
  .loose-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .loose-list li {
    background: #fffdf6;
    border-left: 4px solid #c4860f;
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 14px;
  }
  .loose-list .line-title {
    color: #0a2d21;
    font-size: 16px;
  }
  .loose-list .line-status {
    color: #6e2e17;
    border-color: #c4860f;
  }

  /* ===== Foot ===== */
  .foot {
    background: linear-gradient(180deg, #0e3b2c 0%, #0a2d21 100%);
    color: #f5f0e8;
    padding: 56px 24px;
    text-align: center;
  }
  .foot h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: clamp(1.8rem, 5vw, 2.6rem);
    color: #c9a84c;
    margin: 0 0 6px;
  }
  .foot p {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #cad7cf;
    margin: 0 0 28px;
  }
  .foot-actions {
    justify-content: center;
    margin-top: 0;
  }
</style>
