<script>
  /* ==================================================================
     Trip page = cinematic itinerary by default.

     This page absorbed what used to live at /trips/[id]/itinerary.
     The page now opens with the magazine-spread itinerary (forest
     cover, narrative band, full-bleed stop scenes) and the older
     trip-detail cards (Packing, Bookings, Budget, Photos, Diary,
     Events, Schedule + Identity) collapse into the "Trip kit"
     drawer rail below the sign off.

     /trips/[id]/itinerary now just redirects here.
     /trips/[id]/print stays as the dedicated print-friendly view.
     ================================================================== */

  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  /* ---------- Trip data ---------- */
  import {
    getTrip,
    renameTrip,
    updateTrip,
    setTripRoute,
    deleteTrip,
    setTripCover,
    clearTripCover
  } from '$lib/stores/trips.js';
  import { listBookings, BOOKING_KINDS } from '$lib/stores/bookings.js';
  import { listDiaryEntries } from '$lib/stores/diary.js';
  import { listPhotos } from '$lib/stores/photos.js';
  import { listPackingItems } from '$lib/stores/packing.js';
  import { listBudgetEntries, totalOf, formatAmount } from '$lib/stores/budget.js';

  /* ---------- Stop + schedule helpers ---------- */
  import {
    getStopsByIds,
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

  /* ---------- Components ---------- */
  import TripRoutePicker from '$lib/components/TripRoutePicker.svelte';
  import PackingList from '$lib/components/PackingList.svelte';
  import BookingChecklist from '$lib/components/BookingChecklist.svelte';
  import TravelDiary from '$lib/components/TravelDiary.svelte';
  import EventsAlongRoute from '$lib/components/EventsAlongRoute.svelte';
  import BudgetTracker from '$lib/components/BudgetTracker.svelte';
  import PhotoAlbum from '$lib/components/PhotoAlbum.svelte';
  import ShareModal from '$lib/components/ShareModal.svelte';
  import AddPlanModal from '$lib/components/AddPlanModal.svelte';

  /** @type {{ id: string, name: string, color: string, strap: string, colorId?: string, stopIds?: string[], departureDate?: string|null, direction?: string } | null} */
  let trip = null;
  let loading = true;

  /* Trip-level snapshots that drive the cover stats. The per-chapter
     components mount their own copies and edit through the stores;
     they fire on:change to call load() back so these stay in sync. */
  let bookings = [];
  let diary = [];
  let photos = [];
  let packingCount = 0;
  let budgetEntries = [];

  /* Modal flags */
  let showStopPicker = false;
  let showShareModal = false;
  let showAddPlan = false;
  let addPlanStop = '';
  let addPlanKind = 'all';

  /* Inline rename state on the cover H1 */
  let editingName = false;
  let nameDraft = '';
  /** @type {HTMLInputElement | undefined} */
  let nameInput;

  let confirmingDelete = false;

  /* Custom cover photo for the banner. Built from trip.coverBlob
     when present; revoked whenever the row swaps out or the page
     unmounts so we don't leak object URLs across navigations. */
  let coverObjectUrl = '';
  let coverUploadBusy = false;
  /** @type {HTMLInputElement | undefined} */
  let coverFileInput;

  $: refreshCoverUrl(trip);
  function refreshCoverUrl(t) {
    if (typeof URL === 'undefined') return;
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    coverObjectUrl = '';
    if (t && t.coverBlob) {
      try {
        coverObjectUrl = URL.createObjectURL(t.coverBlob);
      } catch (_) {
        coverObjectUrl = '';
      }
    }
  }

  /* The trip's "cover" stop is the arriving stop (last one in the
     route). When the user hasn't picked stops yet, fall back to
     null and the banner uses a quiet cream placeholder. */
  $: arrivingStop = stops.length > 0 ? stops[stops.length - 1] : null;
  $: departingStop = stops.length > 0 ? stops[0] : null;
  /* Banner image precedence: user upload > arriving stop hero >
     nothing (placeholder gradient). */
  $: bannerImage = coverObjectUrl
    ? coverObjectUrl
    : arrivingStop
      ? stopImageUrl(arrivingStop)
      : '';

  async function handleCoverUpload(event) {
    if (!trip || coverUploadBusy) return;
    const file = event.target.files?.[0];
    if (!file) return;
    coverUploadBusy = true;
    try {
      const updated = await setTripCover(trip.id, file);
      if (updated) trip = updated;
    } catch (err) {
      console.error(err);
    } finally {
      coverUploadBusy = false;
      if (coverFileInput) coverFileInput.value = '';
    }
  }
  async function handleCoverReset() {
    if (!trip || coverUploadBusy) return;
    coverUploadBusy = true;
    try {
      const updated = await clearTripCover(trip.id);
      if (updated) trip = updated;
    } finally {
      coverUploadBusy = false;
    }
  }

  $: tripId = $page.params.id;
  $: stops = trip ? deriveStops(trip) : [];
  $: dirMeta = trip ? DIRECTIONS.find((d) => d.id === (trip.direction || 'northbound')) || DIRECTIONS[0] : null;
  $: depClock = trip ? departureFor(trip.direction || 'northbound') : '09:00';
  $: unassigned = bookings.filter((b) => !b.stopId);
  $: bookedCount = bookings.filter((b) => b.status === 'booked').length;
  $: pendingCount = bookings.length - bookedCount;
  $: tripDateLine = trip && trip.departureDate ? formatTripDate(trip.departureDate) : '';
  $: countdown = daysUntil(trip && trip.departureDate);
  /* Stamp date: the trip's departure month/year if set, otherwise
     the month we're in. Powers the "Now Boarding"-style postmark
     on the sign-off. */
  $: stampDate = (() => {
    const d = trip && trip.departureDate
      ? new Date(trip.departureDate + 'T00:00:00')
      : new Date();
    return d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }).toUpperCase();
  })();
  $: budgetTotal = totalOf(budgetEntries);

  /* First five stop photos for the cover collage. Tilts vary by
     index so the cluster looks scattered. */
  $: collagePhotos = stops.slice(0, 5).map((s, idx) => ({
    src: stopImageUrl(s),
    name: s.name,
    tilt: ((idx % 5) - 2) * 4
  }));

  onMount(load);

  async function load() {
    loading = true;
    trip = (await getTrip(tripId)) || null;
    loading = false;
    if (!trip) return;

    [bookings, diary, photos, packingCount, budgetEntries] = await Promise.all([
      listBookings(trip.id),
      listDiaryEntries(trip.id),
      listPhotos(trip.id),
      listPackingItems(trip.id).then((rows) => rows.length),
      listBudgetEntries(trip.id)
    ]);
  }

  onDestroy(() => {
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
  });

  /* ---------- Derived helpers ---------- */

  /* Build the chapter list. When the trip has the dated `stops`
     shape, use it (each chapter knows its arrival date + stay window
     to the next chapter / return date). Older trips fall back to
     `stopIds` with direction applied. */
  function deriveStops(t) {
    if (Array.isArray(t.stops) && t.stops.length > 0) {
      return t.stops
        .map((entry, i, arr) => {
          const stop = getStopsByIds([entry.stopId])[0];
          if (!stop) return null;
          const stayStart = entry.date || '';
          const next = arr[i + 1];
          const stayEnd = next ? (next.date || '') : (t.returnDate || '');
          return { ...stop, date: stayStart, stayStart, stayEnd };
        })
        .filter(Boolean);
    }
    const forward = getStopsByIds(t.stopIds || []);
    const oriented = (t.direction === 'southbound') ? forward.slice().reverse() : forward;
    return oriented.map((s) => ({ ...s, date: '', stayStart: '', stayEnd: '' }));
  }

  /* Window between this stop's arrival and the next stop's
     departure. Drives the "About 2h 25m before the next train"
     copy in chapter heads. */
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

  /* "Mon, May 15" or "Mon, May 15 to Tue, May 16" for a multi-day
     stay. Falls back to '' so the header can drop the date row when
     a legacy trip has no per-stop date. */
  function formatStayLabel(stop) {
    if (!stop || !stop.stayStart) return '';
    const fmt = (s) => {
      try {
        return new Date(s + 'T00:00:00').toLocaleDateString('en-CA', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        });
      } catch (_) {
        return s;
      }
    };
    const start = fmt(stop.stayStart);
    if (!stop.stayEnd || stop.stayEnd === stop.stayStart) return start;
    return `${start} to ${fmt(stop.stayEnd)}`;
  }

  function daysUntil(yyyymmdd) {
    if (!yyyymmdd) return null;
    const today = todayLocalISO();
    const a = new Date(today);
    const b = new Date(yyyymmdd);
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  /* ---------- Actions ---------- */

  function startRename() {
    if (!trip) return;
    nameDraft = trip.name;
    editingName = true;
    queueMicrotask(() => nameInput?.focus());
  }
  async function saveRename() {
    if (!trip) return;
    const next = nameDraft.trim();
    editingName = false;
    if (!next || next === trip.name) return;
    const updated = await renameTrip(trip.id, next);
    if (updated) trip = updated;
  }
  function cancelRename() {
    editingName = false;
    nameDraft = '';
  }

  async function handleDelete() {
    if (!trip) return;
    await deleteTrip(trip.id);
    await goto('/');
  }

  async function saveStops(event) {
    if (!trip) return;
    const detail = event.detail || {};
    const updated = await setTripRoute(trip.id, {
      stops: detail.stops || [],
      returnDate: detail.returnDate || '',
      returnStopId: detail.returnStopId || ''
    });
    if (updated) trip = updated;
    showStopPicker = false;
  }

  async function openAddPlan(stopId = '', kind = 'all') {
    addPlanStop = stopId;
    addPlanKind = kind;
    showAddPlan = true;
  }
  async function closeAddPlan() {
    showAddPlan = false;
    /* Refetch so scenes + counts refresh without a page reload. */
    if (trip) {
      const [b, p] = await Promise.all([
        listBookings(trip.id),
        listPackingItems(trip.id).then((r) => r.length)
      ]);
      bookings = b;
      packingCount = p;
    }
  }

  function kindLabel(id) {
    return (BOOKING_KINDS.find((k) => k.id === id) || BOOKING_KINDS[4]).label;
  }
</script>

<svelte:head>
  <title>{trip ? trip.name + ' - Northlander' : 'Trip - Northlander'}</title>
</svelte:head>

{#if loading}
  <p class="status">Standing by at the platform...</p>
{:else if !trip}
  <!-- ===== Trip not found ===== -->
  <section class="not-found">
    <div class="kicker kicker-light">Hmm.</div>
    <h1>That suitcase has left the station.</h1>
    <p>We couldn't find a trip at this address. It may have been deleted on another device.</p>
    <a href="/" class="btn-primary cover-add">Back to your platform</a>
  </section>
{:else}
  <!-- ===== Breadcrumb (inside the forest band so it sits over the gradient) ===== -->
  <nav class="crumbs">
    <div class="crumbs-inner">
      <a href="/">Platform</a>
      <span class="crumbs-sep">/</span>
      <span class="crumbs-now">{trip.name}</span>
    </div>
  </nav>

  <!-- ===== Editorial cover banner =====
       The arriving stop's hero photo (or the user's custom upload)
       sits behind a forest gradient overlay. A boarding-pass header
       runs across the top: FROM Toronto Union -> TO Bracebridge,
       date and direction. The user's name, countdown and stats sit
       below in the cream/ivory editorial style. A small "Change
       cover" button in the corner lets the user swap the banner
       image at any time. -->
  <header class="cover" class:has-image={!!bannerImage}>
    <div
      class="cover-bg"
      class:has-image={!!bannerImage}
      style={bannerImage ? `background-image:url('${bannerImage}')` : ''}
      aria-hidden="true"
    ></div>
    <div class="cover-veil" aria-hidden="true"></div>

    {#if departingStop && arrivingStop}
      <div class="cover-ticket" aria-label="Route">
        <span class="cover-ticket-end">
          <span class="cover-ticket-kicker">From</span>
          <span class="cover-ticket-name">{departingStop.name}</span>
        </span>
        <span class="cover-ticket-arrow" aria-hidden="true">
          <svg viewBox="0 0 80 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <path d="M2 7 H68" stroke-dasharray="3 3"/>
            <path d="M62 2 L72 7 L62 12"/>
          </svg>
        </span>
        <span class="cover-ticket-end">
          <span class="cover-ticket-kicker">To</span>
          <span class="cover-ticket-name">{arrivingStop.name}</span>
        </span>
      </div>
    {/if}

    <input
      bind:this={coverFileInput}
      type="file"
      accept="image/*"
      class="cover-file-input"
      on:change={handleCoverUpload}
      tabindex="-1"
      aria-hidden="true"
    />
    {#if stops.length > 0}
      <div class="cover-photo-actions">
        <button
          type="button"
          class="cover-photo-btn"
          on:click={() => coverFileInput?.click()}
          disabled={coverUploadBusy}
          aria-label={coverObjectUrl ? 'Replace cover photo' : 'Upload a cover photo'}
          title={coverObjectUrl ? 'Replace cover photo' : 'Upload a cover photo'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14.5 4 H9.5 L7.5 6.5 H4 a1 1 0 0 0 -1 1 V18 a1 1 0 0 0 1 1 H20 a1 1 0 0 0 1 -1 V7.5 a1 1 0 0 0 -1 -1 H16.5 Z"/>
            <circle cx="12" cy="13" r="3.5"/>
          </svg>
          <span>{coverUploadBusy ? 'Uploading...' : (coverObjectUrl ? 'Replace cover' : 'Upload cover')}</span>
        </button>
        {#if coverObjectUrl}
          <button
            type="button"
            class="cover-photo-reset"
            on:click={handleCoverReset}
            disabled={coverUploadBusy}
            title="Use the arriving stop's photo instead"
          >Reset</button>
        {/if}
      </div>
    {/if}

    <div class="cover-inner" class:is-empty={stops.length === 0}>
      <div class="cover-text">
        <div class="kicker kicker-light">A Northlander Itinerary</div>

        {#if editingName}
          <form class="cover-name-form" on:submit|preventDefault={saveRename}>
            <input
              bind:this={nameInput}
              bind:value={nameDraft}
              type="text"
              maxlength="60"
              class="cover-name-input"
              on:blur={saveRename}
              on:keydown={(e) => e.key === 'Escape' && cancelRename()}
            />
            <span class="cover-name-hint">Enter to save</span>
          </form>
        {:else}
          <button
            type="button"
            on:click={startRename}
            class="cover-name-btn"
            aria-label="Rename trip"
          >
            <h1>{trip.name}</h1>
            <span class="cover-name-hint">Tap to rename</span>
          </button>
        {/if}

        {#if stops.length > 0}
          {#if tripDateLine}
            <div class="cover-date">{tripDateLine}  ·  {dirMeta?.label || 'Northbound'}</div>
          {/if}

          {#if countdown != null}
            <div class="cover-countdown">
              {#if countdown > 1}
                <strong>{countdown}</strong> days until you board
              {:else if countdown === 1}
                <strong>Tomorrow.</strong> Final checks on the platform.
              {:else if countdown === 0}
                <strong>Today.</strong> Safe travels.
              {:else}
                You've been. This is your record.
              {/if}
            </div>
          {:else}
            <div class="cover-countdown italic-soft">
              Pick a departure date in Before You Board below and we'll count it down.
            </div>
          {/if}

          <ul class="cover-stats">
            <li><b>{stops.length}</b><span>{stops.length === 1 ? 'Stop' : 'Stops'}</span></li>
            <li><b>{bookings.length}</b><span>Plans</span></li>
            <li><b>{bookedCount}</b><span>Booked</span></li>
            <li><b>{photos.length}</b><span>Photos</span></li>
            <li><b>{diary.length}</b><span>Notes</span></li>
            {#if budgetEntries.length > 0}
              <li><b>{formatAmount(budgetTotal)}</b><span>Spent</span></li>
            {/if}
          </ul>
        {:else}
          <!-- Empty-trip welcome. This is the entire page until
               the user picks a route - one warm prompt, one button.
               Everything below the cover stays hidden until both
               departing and arriving stops are saved. -->
          <div class="cover-welcome">
            <p class="cover-welcome-lede">
              Where to first?
            </p>
            <p class="cover-welcome-sub">
              Tell us where the journey begins and ends. The rest of
              your itinerary - packing, plans, photos, the ledger -
              will open once you pick your route.
            </p>
          </div>
        {/if}

        <div class="it-actions" class:it-actions--solo={stops.length === 0}>
          {#if stops.length === 0}
            <button
              type="button"
              class="btn-primary cover-add cover-pick-route"
              on:click={() => (showStopPicker = true)}
              aria-label="Pick where the journey begins and ends"
            >
              <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="6" cy="12" r="2.5"/>
                <circle cx="18" cy="12" r="2.5"/>
                <path d="M8.5 12 L15.5 12" stroke-dasharray="2 2"/>
              </svg>
              <span>Pick your route</span>
            </button>
          {:else}
            <button
              type="button"
              class="btn-primary cover-edit"
              on:click={() => (showStopPicker = true)}
              aria-label="Edit the stops on this route"
            >
              <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="6" cy="6" r="2"/>
                <circle cx="6" cy="18" r="2"/>
                <circle cx="18" cy="12" r="2"/>
                <path d="M6 8 L6 16"/>
                <path d="M8 6 L16 11"/>
                <path d="M8 18 L16 13"/>
              </svg>
              <span>Edit route</span>
            </button>
          {/if}
          {#if stops.length > 0}
          <a
            href={`/trips/${trip.id}/recap`}
            class="btn-primary cover-recap"
            aria-label="See a recap of this trip"
          >
            <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 4 H20 V20 H4 Z"/>
              <path d="M4 9 L20 9"/>
              <path d="M9 4 L9 9"/>
            </svg>
            <span>Recap</span>
          </a>
          <a
            href={`/trips/${trip.id}/print`}
            target="_blank"
            rel="noopener"
            class="btn-primary cover-print"
            aria-label="Open the print-ready version in a new tab"
          >
            <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14 2 H6 a2 2 0 0 0 -2 2 v16 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2 -2 V8 Z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="13" y2="17"/>
            </svg>
            <span>Export PDF</span>
          </a>
          <button
            type="button"
            class="btn-primary cover-share"
            on:click={() => (showShareModal = true)}
            aria-label="Share your trip as a poster"
          >
            <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            <span>Share</span>
          </button>
          {/if}
        </div>
      </div>

      <!-- Polaroid collage of stops -->
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

  <!-- ===== Onboarding gate =====
       Until the user has picked a Departing + Arriving stop, the rest
       of the page stays hidden. The banner above carries the only
       call to action ("Pick your route"). The moment stops are
       saved, the narrative band, scenes, route map, trip kit,
       sign-off and danger zone reveal together as a single unfold. -->
  {#if stops.length > 0}

  <!-- ===== Narrative band ===== -->
    <section class="narrative">
      <div class="narrative-inner">
        <div class="kicker">The Story So Far</div>
        <h2 class="narrative-line">
          {#if bookings.length === 0 && diary.length === 0}
            Your route is set. Now the fun part: what you'll eat, where you'll sleep, and what you'll do at each stop.
          {:else}
            {stops.length} stops between {stops[0].name} and {stops[stops.length - 1].name}, with {bookings.length} {bookings.length === 1 ? 'plan' : 'plans'} stitched in.
          {/if}
        </h2>
        <p class="narrative-hint">
          Every chapter below holds its own plans, notes, photos, spend, and events. Pack once for the whole trip in the section just below, then write each chapter as you go.
        </p>
      </div>
    </section>

    <!-- ===== Before you board =====
         One trip-wide section between the narrative and the chapters.
         Dates + direction now live in the route picker (cover Edit
         action). All that stays here is the one bag the user packs
         for the whole journey. -->
    <section class="before-board">
      <div class="before-board-inner">
        <div class="before-board-head">
          <div class="kicker">Before You Board</div>
          <h2>One bag for the whole journey.</h2>
        </div>
        <div class="group-head">
          <span class="group-label">Packing list</span>
          <span class="group-rule" aria-hidden="true"></span>
        </div>
        <PackingList tripId={trip.id} />
      </div>
    </section>

    <!-- ===== Stop scenes ===== -->
    <section class="scenes">
      {#each stops as stop, i}
        {@const isLast = i === stops.length - 1}

        <article id="scene-{i}" class="scene">
          <div class="scene-inner">
            <header class="scene-head">
              <div class="kicker">Chapter {i + 1}</div>
              <h2 class="scene-name">{stop.name}</h2>
              <div class="scene-meta">
                <span class="scene-meta-region">{stop.region}</span>
                {#if stop.stayStart}
                  <span class="scene-meta-sep" aria-hidden="true">·</span>
                  <span class="scene-meta-date">{formatStayLabel(stop)}</span>
                {:else}
                  <span class="scene-meta-sep" aria-hidden="true">·</span>
                  <span class="scene-meta-clock">
                    {i === 0 ? 'Boarding' : 'Arrival'}  {arrivalClock(stop.offsetMinutes, depClock, trip.direction || 'northbound')}
                  </span>
                {/if}
              </div>
            </header>

            <div class="scene-grid">
              <div class="scene-main">
                <div class="scene-when">
                  {#if !isLast}{hereDuration(i)}{:else}End of the line{/if}
                </div>

                <section class="self-section">
                  <div class="group-head">
                    <span class="group-label">Schedule for {stop.name}</span>
                    <span class="group-rule" aria-hidden="true"></span>
                  </div>
                  <BookingChecklist
                    tripId={trip.id}
                    stopIds={trip.stopIds || []}
                    stopFilter={stop.id}
                    direction={trip.direction || 'northbound'}
                    departureClock={depClock}
                    on:change={load}
                  />
                  <button
                    type="button"
                    class="browse-guide-btn"
                    on:click={() => openAddPlan(stop.id, 'all')}
                  >
                    <span class="browse-guide-plus" aria-hidden="true">+</span>
                    Browse the Guide for {stop.name}
                  </button>
                </section>

                <section class="self-section">
                  <div class="group-head">
                    <span class="group-label">Notes from {stop.name}</span>
                    <span class="group-rule" aria-hidden="true"></span>
                  </div>
                  <TravelDiary
                    tripId={trip.id}
                    stopIds={trip.stopIds || []}
                    stopFilter={stop.id}
                    on:change={load}
                  />
                </section>

                <section class="self-section">
                  <div class="group-head">
                    <span class="group-label">Polaroids from {stop.name}</span>
                    <span class="group-rule" aria-hidden="true"></span>
                  </div>
                  <PhotoAlbum
                    tripId={trip.id}
                    stopIds={trip.stopIds || []}
                    stopFilter={stop.id}
                    on:change={load}
                  />
                </section>

                <section class="self-section">
                  <div class="group-head">
                    <span class="group-label">Spending at {stop.name}</span>
                    <span class="group-rule" aria-hidden="true"></span>
                  </div>
                  <BudgetTracker
                    tripId={trip.id}
                    stopFilter={stop.id}
                    on:change={load}
                  />
                </section>

                <section class="self-section">
                  <div class="group-head">
                    <span class="group-label">Happening at {stop.name}</span>
                    <span class="group-rule" aria-hidden="true"></span>
                  </div>
                  <EventsAlongRoute
                    tripId={trip.id}
                    stopIds={[stop.id]}
                    departureDate={stop.stayStart || trip.departureDate || null}
                    endDate={stop.stayEnd || trip.returnDate || null}
                  />
                </section>
              </div>

              <aside class="scene-aside">
                <figure class="scene-postcard">
                  <img src={stopImageUrl(stop)} alt={stop.name} loading="lazy" decoding="async" />
                </figure>
                <p class="scene-aside-hook">{stop.hook}</p>
                <a
                  class="scene-aside-guide"
                  href={`https://northlanderguide.com/stops/${stop.id}/`}
                  target="_blank"
                  rel="noopener"
                >Open {stop.name} on the Guide  &rarr;</a>
              </aside>
            </div>
          </div>
        </article>

        {#if !isLast}
          <div class="chapter-divider" aria-hidden="true">
            <div class="chapter-divider-rule"></div>
            <div class="chapter-divider-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="4" width="16" height="14" rx="3"/>
                <path d="M4 11 L20 11"/>
                <circle cx="8.5" cy="20" r="1.4"/>
                <circle cx="15.5" cy="20" r="1.4"/>
                <path d="M7 17 L7 19"/>
                <path d="M17 17 L17 19"/>
              </svg>
            </div>
            <span class="chapter-divider-time">
              {travelDuration(
                Math.abs((stops[i + 1].offsetMinutes || 0) - (stop.offsetMinutes || 0))
              )} to {stops[i + 1].name}
            </span>
          </div>
        {/if}
      {/each}
    </section>

  {#if unassigned.length > 0}
    <!-- ===== Loose plans ===== -->
    <section class="loose">
      <div class="loose-inner">
        <div class="kicker">Loose plans</div>
        <h2>Not pinned to a stop yet</h2>
        <p>Open the Plans drawer below to pin these to the right stop.</p>
        <ul class="loose-list">
          {#each unassigned as b}
            <li>
              {#if b.startTime}<span class="loose-time">{b.startTime}</span>{/if}
              <span class="line-title">{b.title}</span>
              <span class="loose-kind">{kindLabel(b.kind)}</span>
              <span class="line-status" class:is-booked={b.status === 'booked'}>
                {b.status === 'booked' ? 'Booked' : 'Pending'}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    </section>
  {/if}

  <!-- ===== Sign off =====
       Closes the page with an editorial signature - forest band
       with a small vintage stamp pinned in the top-right corner.
       Stamp uses the Guide's circular double-border pattern
       (plan-page.css:1110-1142) at a smaller scale, rotated -8deg
       so it reads as something pressed onto the page. -->
  <section class="foot">
    <span class="foot-stamp" aria-hidden="true">
      <span class="foot-stamp-line foot-stamp-line--top">Northlander</span>
      <span class="foot-stamp-line foot-stamp-line--big">Bon</span>
      <span class="foot-stamp-line foot-stamp-line--big">Voyage</span>
      <span class="foot-stamp-line foot-stamp-line--bot">{stampDate}</span>
    </span>
    <h2>Bon voyage.</h2>
    <p>Open this on your phone the morning you board.</p>
    <div class="it-actions foot-actions">
      <a
        href={`/trips/${trip.id}/print`}
        target="_blank"
        rel="noopener"
        class="btn-primary cover-print"
      >Save as PDF</a>
    </div>
  </section>

  <!-- ===== Danger zone ===== -->
  <section class="danger">
    <div class="danger-inner">
      <div>
        <div class="kicker">Danger zone</div>
        <p>Deleting a suitcase removes its packing list, bookings and notes. There's no undo.</p>
      </div>
      {#if confirmingDelete}
        <div class="danger-actions">
          <button
            type="button"
            on:click={() => (confirmingDelete = false)}
            class="danger-cancel"
          >Cancel</button>
          <button
            type="button"
            on:click={handleDelete}
            class="btn-primary danger-confirm"
          >Yes, delete the suitcase</button>
        </div>
      {:else}
        <button
          type="button"
          on:click={() => (confirmingDelete = true)}
          class="danger-link"
        >Delete this trip</button>
      {/if}
    </div>
  </section>

  {/if}<!-- end onboarding gate -->

  <!-- ===== Modals ===== -->
  {#if showStopPicker}
    <TripRoutePicker
      stops={trip.stops || (trip.stopIds || []).map((id) => ({ stopId: id, date: '' }))}
      returnDate={trip.returnDate || ''}
      on:save={saveStops}
      on:close={() => (showStopPicker = false)}
    />
  {/if}

  {#if showShareModal}
    <ShareModal {trip} on:close={() => (showShareModal = false)} />
  {/if}

  {#if showAddPlan}
    <AddPlanModal
      tripId={trip.id}
      stopIds={trip.stopIds || []}
      initialStop={addPlanStop}
      initialKind={addPlanKind}
      existingBookings={bookings}
      direction={trip.direction || 'northbound'}
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
    margin: 0;
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
    font-size: clamp(2rem, 5vw, 3rem);
    margin: 14px 0 12px;
  }
  .not-found p {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #cad7cf;
    margin: 0 0 24px;
  }

  /* ===== Breadcrumb ===== */
  .crumbs {
    background: #0a2d21;
    color: #cad7cf;
    padding: 18px 24px 0;
  }
  .crumbs-inner {
    max-width: 1180px;
    margin: 0 auto;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
  }
  .crumbs-inner a {
    color: #c9a84c;
    text-decoration: none;
  }
  .crumbs-inner a:hover { color: #f5f0e8; }
  .crumbs-sep {
    color: #7d3a1e;
    margin: 0 8px;
  }
  .crumbs-now { color: #f5f0e8; }

  /* ===== Cover banner =====
     The arriving stop's photo (or a user upload) sits behind a
     forest gradient veil that keeps text legible while leaving
     enough of the photo visible to set the mood. When there's no
     image yet (empty trip), the cover falls back to the original
     forest-gradient look. */
  .cover {
    position: relative;
    background: linear-gradient(180deg, #0a2d21 0%, #16543e 100%);
    color: #f5f0e8;
    padding: 56px 24px 64px;
    overflow: hidden;
  }
  .cover-bg {
    position: absolute;
    inset: 0;
    background-position: center;
    background-size: cover;
    z-index: 0;
  }
  .cover-bg.has-image { background-color: #0a2d21; }
  /* Editorial overlay: deeper at the bottom for text legibility,
     warmer amber at the top for atmosphere. */
  .cover-veil {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background:
      linear-gradient(180deg, rgba(10, 45, 33, 0.55) 0%, rgba(10, 45, 33, 0.85) 100%),
      radial-gradient(ellipse at 70% 12%, rgba(196, 134, 15, 0.25), transparent 60%);
  }
  .cover.has-image .cover-veil {
    background:
      linear-gradient(180deg, rgba(10, 45, 33, 0.45) 0%, rgba(10, 45, 33, 0.88) 100%),
      radial-gradient(ellipse at 50% 12%, rgba(0, 0, 0, 0.35), transparent 70%);
  }

  /* Boarding-pass ticket header at the top of the cover. Forest
     dark band with gold dashed border and a dashed arrow between
     the two stop names. */
  .cover-ticket {
    position: relative;
    z-index: 3;
    max-width: 1180px;
    margin: 0 auto 28px;
    background: rgba(10, 45, 33, 0.72);
    border: 1.5px solid #c9a84c;
    box-shadow: inset 0 0 0 2px rgba(10, 45, 33, 0.85);
    padding: 12px 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    color: #f5f0e8;
    flex-wrap: wrap;
  }
  .cover-ticket-end {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 120px;
  }
  .cover-ticket-kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.28em;
    font-size: 10px;
    font-weight: 800;
    color: #c9a84c;
  }
  .cover-ticket-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: clamp(1.05rem, 2.2vw, 1.4rem);
    color: #f5f0e8;
    text-align: center;
  }
  .cover-ticket-arrow {
    color: #c9a84c;
    width: 80px;
    flex: none;
  }
  .cover-ticket-arrow svg { width: 100%; height: auto; display: block; }
  @media (max-width: 540px) {
    .cover-ticket { padding: 10px 14px; gap: 8px; }
    .cover-ticket-arrow { transform: rotate(90deg); width: 36px; }
    .cover-ticket-end { min-width: 0; }
  }

  /* Discreet "Change cover" button in the top-right corner. */
  .cover-file-input { display: none; }
  .cover-photo-actions {
    position: absolute;
    top: 12px;
    right: 16px;
    z-index: 4;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .cover-photo-btn {
    background: rgba(10, 45, 33, 0.62);
    color: #f5f0e8;
    border: 1px dashed rgba(201, 168, 76, 0.65);
    padding: 5px 12px 5px 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
    transition: background 0.15s, border-color 0.15s;
  }
  .cover-photo-btn svg { width: 14px; height: 14px; }
  .cover-photo-btn:hover:not(:disabled) {
    background: rgba(10, 45, 33, 0.85);
    border-color: #c9a84c;
  }
  .cover-photo-btn:disabled { opacity: 0.6; cursor: progress; }
  .cover-photo-reset {
    background: transparent;
    border: 0;
    color: rgba(245, 240, 232, 0.78);
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
  }
  .cover-photo-reset:hover { color: #c9a84c; }
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
    /* When the trip is empty there's no polaroid collage in the
       right column, so we collapse back to a single column to
       avoid the lopsided "text + blank" look. */
    .cover-inner.is-empty {
      grid-template-columns: 1fr;
    }
  }

  /* Welcome card that replaces the leg + date + countdown + stats
     when the trip is empty. Italic Fraunces lede + Spline sub gives
     the cover a "this is where it begins" feeling rather than a row
     of zeros. */
  .cover-welcome {
    margin: 14px 0 22px;
    max-width: 60ch;
    border-top: 1px dashed rgba(201, 168, 76, 0.45);
    border-bottom: 1px dashed rgba(201, 168, 76, 0.45);
    padding: 18px 0;
  }
  .cover-welcome-lede {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: clamp(20px, 3vw, 28px);
    line-height: 1.2;
    color: #c9a84c;
    margin: 0 0 10px;
  }
  .cover-welcome-sub {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.55;
    color: rgba(245, 240, 232, 0.78);
    margin: 0;
  }
  .kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .kicker-light { color: #c4860f; }

  /* H1 + inline rename */
  .cover-name-btn {
    background: transparent;
    border: 0;
    padding: 0;
    text-align: left;
    cursor: pointer;
    color: inherit;
    display: block;
    width: 100%;
  }
  .cover-name-btn h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2.6rem, 7vw, 5rem);
    line-height: 0.95;
    margin: 12px 0 6px;
    letter-spacing: -0.015em;
    overflow-wrap: anywhere;
    color: #f5f0e8;
    transition: color 160ms ease;
  }
  /* Cover trip-name stays white on hover; the underline below the
     title is the only affordance that the H1 is editable. */
  .cover-name-hint {
    display: block;
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(202, 215, 207, 0.55);
    margin-bottom: 10px;
  }
  .cover-name-form { margin: 12px 0 6px; }
  .cover-name-input {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2.4rem, 6vw, 4.4rem);
    line-height: 1;
    background: transparent;
    color: #f5f0e8;
    border: 0;
    border-bottom: 2px solid #c4860f;
    outline: none;
    width: 100%;
    padding-bottom: 6px;
  }

  /* Direction leg + date + countdown */
  .cover-leg {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #cad7cf;
    font-weight: 600;
  }
  .cover-leg .leg-soft { opacity: 0.7; }
  .cover-leg .dot {
    margin: 0 8px;
    color: #c4860f;
  }
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

  /* Stats grid */
  .cover-stats {
    list-style: none;
    padding: 22px 0 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: 16px;
    border-top: 1px dashed rgba(201, 168, 76, 0.45);
  }
  .cover-stats li { display: flex; flex-direction: column; }
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

  /* Action row */
  .it-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 26px;
  }
  /* Primary gold - the main action. Matches the Recap button's
     softer #c9a84c tone rather than the harsher amber, so the
     primary CTA reads warm and editorial rather than aggressive. */
  .cover-add {
    background: #c9a84c;
    border-color: #c9a84c;
    color: #0a2d21;
    font-weight: 700;
    padding: 0.85rem 1.4rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 8px 18px rgba(201, 168, 76, 0.32);
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
  /* Quiet outline - secondary actions */
  .cover-edit,
  .cover-print,
  .cover-share {
    background: transparent;
    border: 2px solid rgba(201, 168, 76, 0.45);
    color: #c9a84c;
    padding: 0.7rem 1.1rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
  }
  .cover-edit:hover,
  .cover-print:hover,
  .cover-share:hover {
    background: rgba(201, 168, 76, 0.12);
    border-color: #c9a84c;
    color: #f5f0e8;
  }
  /* Recap pops in gold so the post-trip view is easy to spot */
  .cover-recap {
    background: #c9a84c;
    border-color: #c9a84c;
    color: #0a2d21;
    padding: 0.7rem 1.1rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
  }
  .cover-recap:hover {
    background: #f5f0e8;
    border-color: #f5f0e8;
    color: #0a2d21;
  }
  .cover-edit-icon {
    width: 16px;
    height: 16px;
  }

  /* Polaroid collage */
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
    cursor: pointer;
  }
  .narrative-cta:hover {
    background: #884023;
    border-color: #884023;
  }

  /* ===== Stop scenes ===== */
  /* ===== Stop scenes =====
     Each scene is now an editorial chapter: a publication heading
     (kicker + display H2 + dashed rule), then a two-column body
     (65/35) with the timeline on the left and a flat postcard +
     stop-hook pull-quote on the right. Disciplined spacing, 2px
     solid rules, no rotation, no shadows inside content. Type
     and color tokens ported from the Guide's stop-page and /plan
     editorial pattern. */
  .scenes {
    background: #fbf6ea;
    background-image:
      repeating-linear-gradient(45deg, rgba(45, 30, 20, 0.03) 0, rgba(45, 30, 20, 0.03) 1px, transparent 1px, transparent 8px);
    color: #241f1a;
    padding: 0;
  }
  .scene {
    position: relative;
    color: #241f1a;
    scroll-margin-top: 72px;
  }
  .scene-inner {
    max-width: 1080px;
    margin: 0 auto;
    padding: 56px 24px;
  }

  /* Editorial section heading. Kicker (rust caps) + display H2 +
     metadata row (region · arrival) on a single dashed rust rule.
     Mirrors stop-page.css:29-33 + plan-page.css:163-181. */
  .scene-head {
    border-bottom: 1px dashed rgba(125, 58, 30, 0.4);
    padding-bottom: 22px;
    margin-bottom: 36px;
  }
  .scene-head .kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    color: #7d3a1e;
    font-size: 11px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .scene-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    font-size: clamp(2rem, 4.5vw, 3.2rem);
    line-height: 1.02;
    margin: 0 0 12px;
    letter-spacing: -0.01em;
    color: #0a2d21;
  }
  .scene-meta {
    display: inline-flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 10px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    font-weight: 700;
  }
  .scene-meta-region { color: #c4860f; letter-spacing: 0.32em; }
  .scene-meta-sep { color: rgba(125, 58, 30, 0.4); }
  .scene-meta-clock { color: #5a4f3d; font-family: 'Spline Sans', system-ui, sans-serif; }
  .scene-meta-date {
    color: #7d3a1e;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 14.5px;
    letter-spacing: 0;
    text-transform: none;
    font-weight: 600;
  }

  /* Two-column body: 65/35 like stop-page.css:84. Main holds the
     timeline (or empty state); aside holds a flat postcard and a
     rust-rule sidebar with the stop's editorial hook. Mobile
     collapses to a single column with the aside dropping below. */
  .scene-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 32px;
    align-items: start;
  }
  @media (min-width: 880px) {
    .scene-grid {
      grid-template-columns: 65% 35%;
      gap: 48px;
    }
  }

  .scene-aside {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .scene-postcard {
    margin: 0;
    background: #ede0cc;
    border: 2px solid #0a2d21;
  }
  .scene-postcard img {
    display: block;
    width: 100%;
    height: 200px;
    object-fit: cover;
  }
  .scene-aside-hook {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: 17px;
    line-height: 1.4;
    color: #7d3a1e;
    margin: 0;
    padding-left: 18px;
    border-left: 2px solid #7d3a1e;
  }
  .scene-aside-guide {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6e2e17;
    text-decoration: none;
    border-bottom: 1.5px dashed #c4860f;
    padding-bottom: 2px;
    align-self: flex-start;
  }
  .scene-aside-guide:hover { color: #0a2d21; border-color: #0a2d21; }

  /* Browse-the-Guide pill under each Schedule list. Opens the
     AddPlanModal pre-scoped to this stop with the category tabs
     (All / Eat / Sleep / Do / Shop) so the user can drop a Guide
     listing straight into the chapter. */
  .browse-guide-btn {
    margin-top: 16px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: 1.5px dashed #7d3a1e;
    color: #7d3a1e;
    padding: 8px 16px;
    border-radius: 999px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease;
  }
  .browse-guide-btn:hover {
    background: #7d3a1e;
    color: #fffdf6;
  }
  .browse-guide-plus {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 16px;
    line-height: 1;
  }

  /* ===== Self-contained chapter sections =====
     Each chapter renders five sections inline (Schedule / Notes /
     Polaroids / Spending / Happening). Sections sit on cream paper
     and are separated by a soft dashed gold rule, mirroring the
     stop-page.css editorial rhythm. */
  .self-section {
    margin-top: 36px;
    padding-top: 22px;
    border-top: 1px dashed rgba(196, 134, 15, 0.45);
  }
  .self-section:first-of-type {
    margin-top: 28px;
    padding-top: 22px;
  }

  /* "About 2h 25m before the next train" line above the first
     section in each chapter. */
  .scene-when {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #7d3a1e;
    font-weight: 700;
    margin-bottom: 24px;
  }

  /* Editorial group header. The label + dashed rust rule mirror
     stop-page.css:78-79: italic Fraunces kicker against a dashed
     line that fills the remainder of the row. */
  .group-head {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 18px;
  }
  .group-label {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 500;
    font-style: italic;
    font-size: 20px;
    color: #7d3a1e;
    flex: 0 0 auto;
  }
  .group-rule {
    flex: 1;
    height: 0;
    border-top: 1px dashed rgba(125, 58, 30, 0.35);
  }

  /* ===== Before You Board =====
     One trip-wide section between the narrative and the chapters.
     Dates live in the route picker now, so this section is just the
     trip-wide PackingList. */
  .before-board {
    background: #fbf6ea;
    padding: 56px 24px;
  }
  @media (min-width: 880px) {
    .before-board { padding: 72px 32px; }
  }
  .before-board-inner {
    max-width: 1100px;
    margin: 0 auto;
  }
  .before-board-head {
    margin-bottom: 32px;
  }
  .before-board-head h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    font-size: clamp(1.6rem, 3.4vw, 2.2rem);
    color: #0a2d21;
    margin: 6px 0 0;
    line-height: 1.2;
  }
  .before-board-inner > .group-head {
    max-width: 760px;
  }

  /* ===== Chapter divider =====
     Direct port of the Guide's pl-divider pattern (plan-page.css
     405-418). A thin forest rule across the cream page with a
     42px circular forest badge centered, holding a train icon.
     Italic Fraunces travel-time floats above the rule. 48px
     vertical margin keeps section rhythm. */
  /* Chapter divider: a thin forest rule with a 42px circular forest
     badge centered on it, and the italic travel-time on its own
     line below the badge (so it never collides with the icon).
     Mirrors the Guide's pl-divider pattern. */
  .chapter-divider {
    position: relative;
    max-width: 1080px;
    margin: 48px auto;
    padding: 0 24px;
    text-align: center;
  }
  .chapter-divider-rule {
    position: absolute;
    left: 24px;
    right: 24px;
    top: 21px;
    height: 1px;
    background: rgba(10, 45, 33, 0.35);
    z-index: 0;
  }
  .chapter-divider-badge {
    position: relative;
    z-index: 1;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: #0a2d21;
    color: #c9a84c;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 6px 14px rgba(40, 30, 20, 0.18);
  }
  .chapter-divider-badge svg { width: 20px; height: 20px; }
  .chapter-divider-time {
    display: block;
    margin-top: 14px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: 14px;
    color: #5a4f3d;
    white-space: nowrap;
  }

  /* ===== Loose plans ===== */
  .loose {
    background: #fbf6ea;
    padding: 48px 24px;
  }
  .loose-inner { max-width: 920px; margin: 0 auto; }
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
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-direction: column; gap: 10px;
  }
  .loose-list li {
    background: #fffdf6;
    border-left: 4px solid #c4860f;
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
  }
  .loose-list .line-title { color: #0a2d21; font-size: 16px; }
  .loose-time {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-style: italic;
    color: #6e2e17;
    font-size: 15px;
    margin-right: 6px;
  }
  .loose-kind {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
    font-weight: 700;
  }
  .loose-list .line-status {
    color: #6e2e17;
    border-color: #c4860f;
  }

  /* ===== Sign off =====
     Forest band bookend with the Bon voyage signature and a small
     vintage stamp pinned in the corner. The stamp is a direct port
     of the Guide's pl-pass-stamp (plan-page.css:1110-1142): circular
     double-border ring, amber fill, dotted inner ring, rotated. */
  .foot {
    position: relative;
    background: linear-gradient(180deg, #0e3b2c 0%, #0a2d21 100%);
    color: #f5f0e8;
    padding: 64px 24px;
    text-align: center;
    overflow: hidden;
  }
  .foot h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: clamp(1.8rem, 5vw, 2.6rem);
    color: #c9a84c;
    margin: 0 0 8px;
  }
  .foot p {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #cad7cf;
    margin: 0 0 28px;
  }
  .foot-actions { justify-content: center; margin-top: 0; }

  .foot-stamp {
    position: absolute;
    top: 24px;
    right: 32px;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    border: 3px double #c9a84c;
    background: radial-gradient(circle, rgba(196, 134, 15, 0.08) 0%, transparent 65%);
    box-shadow:
      0 6px 14px rgba(0, 0, 0, 0.3),
      inset 0 0 0 6px transparent,
      inset 0 0 0 7px rgba(201, 168, 76, 0.35);
    color: #c9a84c;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    transform: rotate(-8deg);
    font-family: 'Fraunces', Georgia, serif;
    line-height: 1;
    text-align: center;
    user-select: none;
  }
  .foot-stamp::before,
  .foot-stamp::after {
    content: '';
    position: absolute;
    left: 50%;
    width: 26px;
    height: 1px;
    background: #c9a84c;
    opacity: 0.7;
    transform: translateX(-50%);
  }
  .foot-stamp::before { top: 18px; }
  .foot-stamp::after  { bottom: 18px; }
  .foot-stamp-line {
    display: block;
  }
  .foot-stamp-line--top {
    font-size: 8.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-weight: 700;
    margin-top: 4px;
  }
  .foot-stamp-line--big {
    font-style: italic;
    font-weight: 700;
    font-size: 17px;
  }
  .foot-stamp-line--bot {
    font-size: 8.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-weight: 700;
    margin-bottom: 4px;
  }
  @media (max-width: 720px) {
    .foot-stamp {
      width: 78px; height: 78px;
      top: 14px; right: 14px;
    }
    .foot-stamp-line--big { font-size: 14px; }
  }

  /* ===== Danger zone ===== */
  .danger {
    background: #f3ece0;
    padding: 24px 24px 64px;
  }
  .danger-inner {
    max-width: 920px;
    margin: 0 auto;
    border-top: 1px dashed rgba(125, 58, 30, 0.4);
    padding-top: 24px;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
  .danger p {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 4px 0 0;
  }
  .danger-link {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    color: #6e2e17;
    background: transparent;
    border: 0;
    cursor: pointer;
    font-size: 14px;
  }
  .danger-link:hover { color: #0a2d21; }
  .danger-actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .danger-cancel {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    background: transparent;
    border: 0;
    cursor: pointer;
    font-size: 14px;
  }
  .danger-cancel:hover { color: #6e2e17; }
  .danger-confirm {
    background: #5e2a14;
    border-color: #5e2a14;
  }
  .danger-confirm:hover {
    background: #7d3a1e;
    border-color: #7d3a1e;
  }
</style>
