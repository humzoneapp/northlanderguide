<script>
  import { onMount, onDestroy } from 'svelte';
  import NewTripModal from '$lib/components/NewTripModal.svelte';
  import OnboardingOverlay from '$lib/components/OnboardingOverlay.svelte';
  import { trips, deleteTrip, listTrips } from '$lib/stores/trips.js';
  import { pullToRefresh } from '$lib/utils/pull-to-refresh.js';
  import { STOPS, getStop, getStopsByIds, stopImageUrl, stopGuideUrl } from '$lib/data/stops.js';
  import { listBookings } from '$lib/stores/bookings.js';
  import { listPackingItems } from '$lib/stores/packing.js';
  import { todayLocalISO, formatTripDate } from '$lib/data/schedule.js';

  let showNewModal = false;

  /* Pull-to-refresh handler. Re-reads trips + per-trip stats so a
     user who edited a trip elsewhere (file restore, another tab)
     can drag down to see fresh dashboard data. */
  async function handleRefresh() {
    const list = await listTrips();
    trips.set(list);
    await loadTripStats(list);
  }

  /* The trips store populates from Dexie on first paint. We wait
     a short beat before deciding whether to mount the onboarding
     overlay so returning users (who have trips but the store
     hasn't filled yet) don't see it flash up and then disappear. */
  let onboardingReady = false;
  /* Pull-to-refresh action handle so we can tear it down on
     destroy. Attached directly to document.body so the gesture
     works no matter which surface the user grabs. */
  let ptrHandle = null;
  onMount(() => {
    const t = setTimeout(() => (onboardingReady = true), 220);
    if (typeof document !== 'undefined') {
      ptrHandle = pullToRefresh(document.body, { onRefresh: handleRefresh });
    }
    return () => {
      clearTimeout(t);
      if (ptrHandle) {
        ptrHandle.destroy();
        ptrHandle = null;
      }
    };
  });
  onDestroy(() => {
    if (typeof URL !== 'undefined') {
      for (const u of coverObjectUrls.values()) URL.revokeObjectURL(u);
      coverObjectUrls.clear();
    }
  });

  /* Stable per-card rotation so trips always sit at the same angle
     regardless of how many other trips share the platform. Cycle
     through six values keyed by index. */
  const tilts = [-3, 0, 4, -2, 3, -4];
  const offsets = [8, -6, 10, 4, -4, 6];

  /* In-page confirm dialog state for the polaroid corner delete.
     window.confirm worked but felt jarring; a styled modal in the
     app's vocabulary lets the user pause before nuking a trip.
     `confirmingTrip` holds the trip pending confirmation; null
     means no dialog open. */
  let confirmingTrip = null;
  let confirmBusy = false;

  function handleDeleteTrip(trip, ev) {
    /* The polaroid wrapper holds the <a> link AND this button as
       siblings; the button is positioned absolute. preventDefault
       + stopPropagation are belt-and-braces so any future
       restructure that nests them again still won't navigate. */
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    if (!trip) return;
    confirmingTrip = trip;
  }
  async function confirmDelete() {
    if (!confirmingTrip || confirmBusy) return;
    confirmBusy = true;
    try {
      await deleteTrip(confirmingTrip.id);
      confirmingTrip = null;
    } finally {
      confirmBusy = false;
    }
  }
  function cancelDelete() {
    if (confirmBusy) return;
    confirmingTrip = null;
  }

  /* Tag line shown on each trip card's luggage tag. With stops:
     "Toronto Union to Cochrane (4 stops)". Without: a small nudge. */
  function summarize(stopIds) {
    const stops = getStopsByIds(stopIds);
    if (stops.length === 0) return 'No stops yet';
    if (stops.length === 1) return stops[0].name;
    const first = stops[0].name;
    const last = stops[stops.length - 1].name;
    return `${first} to ${last} (${stops.length} stops)`;
  }

  /* Per-trip stats for the suitcase cards: total plans, how many of
     those are still pending, and packing progress (total + packed).
     Reloaded reactively whenever the trips list changes. The three
     queries run in parallel per trip so the dashboard paints fast. */
  let tripStats = {};

  async function loadTripStats(list) {
    if (!Array.isArray(list) || list.length === 0) {
      tripStats = {};
      return;
    }
    const entries = await Promise.all(
      list.map(async (t) => {
        const [bookings, packing] = await Promise.all([
          listBookings(t.id),
          listPackingItems(t.id)
        ]);
        const pendingPlans = bookings.filter((b) => b.status === 'pending').length;
        const packedCount = packing.filter((p) => p.packed).length;
        const bookedCount = bookings.filter((b) => b.status === 'booked').length;
        /* Composite "ready" fraction: average packing progress with
           booking progress when both exist; fall through to whichever
           one does. Drives the circular progress ring around the
           polaroid seal. */
        const haveP = packing.length > 0;
        const haveB = bookings.length > 0;
        const packF = haveP ? packedCount / packing.length : null;
        const bookF = haveB ? bookedCount / bookings.length : null;
        let readyFraction = null;
        if (packF != null && bookF != null) readyFraction = (packF + bookF) / 2;
        else if (packF != null) readyFraction = packF;
        else if (bookF != null) readyFraction = bookF;
        return [t.id, {
          planCount: bookings.length,
          pendingPlans,
          packTotal: packing.length,
          packDone: packedCount,
          bookedCount,
          readyFraction
        }];
      })
    );
    tripStats = Object.fromEntries(entries);
  }

  $: loadTripStats($trips);

  /* Italic "next move" line on each card. Reads the trip's state and
     coaches the user one action ahead. Past-departure trips suggest
     opening the recap. Today / Tomorrow get warm urgency copy. */
  function nextMove(trip) {
    const stats = tripStats[trip.id] || {};
    const stopCount = (trip.stopIds || []).length;
    const days = trip.departureDate ? daysUntilDate(trip.departureDate) : null;

    if (days != null && days < 0) return 'Pick up the recap';
    if (days === 0) return 'All aboard today';
    if (days === 1) return 'Boarding tomorrow';

    if (stopCount === 0) return 'Choose the stops';
    if ((stats.planCount || 0) === 0) return 'Drop your first plan';
    if ((stats.pendingPlans || 0) > 0) {
      return `${stats.pendingPlans} plan${stats.pendingPlans === 1 ? '' : 's'} still to book`;
    }
    if ((stats.packTotal || 0) === 0) return 'Start the packing list';
    if ((stats.packDone || 0) < (stats.packTotal || 0)) {
      return `${stats.packTotal - stats.packDone} item${stats.packTotal - stats.packDone === 1 ? '' : 's'} left to pack`;
    }
    return 'Ready when you are';
  }

  /* Masthead label: "The Itinerary Desk · June 2026". Recomputes on
     mount so it stays current across long sessions. */
  $: mastheadMonth = new Date().toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });

  function daysUntilDate(yyyymmdd) {
    if (!yyyymmdd) return null;
    const today = todayLocalISO();
    const a = new Date(today);
    const b = new Date(yyyymmdd);
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  /* Cover thumb for each polaroid on the dashboard.
       1. If the trip has a custom coverBlob (user-uploaded on the
          trip page), use that.
       2. Else fall back to the arriving stop's hero photo - the
          destination is the part of the trip the user is anticipating.
       3. Else null (no stops yet).
     Object URLs created from coverBlobs are cached in coverObjectUrls
     and revoked when the trips list changes / page unmounts so they
     don't leak. */
  let coverObjectUrls = new Map();
  function rebuildCoverObjectUrls(list) {
    if (typeof URL === 'undefined') return;
    const next = new Map();
    for (const t of list || []) {
      if (t.coverBlob) {
        const existing = coverObjectUrls.get(t.id);
        if (existing) next.set(t.id, existing);
        else {
          try { next.set(t.id, URL.createObjectURL(t.coverBlob)); }
          catch (_) {}
        }
      }
    }
    for (const [id, u] of coverObjectUrls) {
      if (!next.has(id)) URL.revokeObjectURL(u);
    }
    coverObjectUrls = next;
  }
  $: rebuildCoverObjectUrls($trips);

  function firstStopThumb(trip) {
    const stops = getStopsByIds(trip.stopIds || []);
    const custom = coverObjectUrls.get(trip.id);
    if (custom) {
      return {
        name: stops.length ? stops[stops.length - 1].name : trip.name,
        url: custom
      };
    }
    if (stops.length === 0) return null;
    /* Arriving stop = last stop in the canonical-order array. */
    const arriving = stops[stops.length - 1];
    return { name: arriving.name, url: stopImageUrl(arriving) };
  }

  /* Packing progress fraction 0..1, used by the dashed arc on the
     luggage tag. Returns null when there's nothing on the list yet. */
  function packFraction(trip) {
    const s = tripStats[trip.id];
    if (!s || !s.packTotal) return null;
    return Math.max(0, Math.min(1, s.packDone / s.packTotal));
  }

  /* "Next departure" plaque copy. Picks the earliest trip with a
     date >= today. Falls back to a quiet-platform line when no
     trip has a date yet. */
  $: nextDeparture = (() => {
    const today = todayLocalISO();
    const list = ($trips || [])
      .filter((t) => t.departureDate && t.departureDate >= today)
      .sort((a, b) => a.departureDate.localeCompare(b.departureDate));
    if (list.length === 0) return null;
    const t = list[0];
    const days = daysUntilDate(t.departureDate);
    let when;
    if (days === 0) when = 'Today';
    else if (days === 1) when = 'Tomorrow';
    else when = `In ${days} days`;
    return { trip: t, when, dateLabel: formatTripDate(t.departureDate) };
  })();

  /* Compact countdown for the stub. Hidden when no departureDate. */
  function countdownLabel(yyyymmdd) {
    if (!yyyymmdd) return '';
    const today = todayLocalISO();
    const a = new Date(today);
    const b = new Date(yyyymmdd);
    const days = Math.round((b.getTime() - a.getTime()) / 86400000);
    if (days > 1) return `${days} days`;
    if (days === 1) return 'Tomorrow';
    if (days === 0) return 'Today';
    return 'Wrapped';
  }

  /* Four stops with strong hero photos for the collage. Spaced
     out along the route so the user sees south-to-north variety:
     Toronto Union -> Bracebridge -> Huntsville -> Cochrane. */
  const COLLAGE_STOP_IDS = ['union', 'bracebridge', 'huntsville', 'cochrane'];
  $: collageStops = COLLAGE_STOP_IDS
    .map((id) => STOPS.find((s) => s.id === id))
    .filter(Boolean)
    .map((s, i) => ({
      stop: s,
      tilt: ((i % 4) - 1.5) * 4,
      lift: (i % 2 === 0) ? 0 : -10
    }));
</script>

<svelte:head>
  <title>Northlander.app: Pack your Northern Ontario train trip</title>
  <meta
    name="description"
    content="Plan your Northlander train trip in one place. Route, stops, packing list, bookings and itinerary, available offline."
  />
</svelte:head>

<!-- ===== Cinematic hero ===== -->
<header class="dash-hero">
  <div class="dash-noise" aria-hidden="true"></div>

  <div class="dash-hero-inner">
    <div class="dash-hero-text">
      <div class="kicker kicker-light">Northern Ontario  ·  16 Stops  ·  Endless Trips</div>
      <h1>
        Pack a <em>trip</em>.<br />
        Open it anywhere.
      </h1>
      <p class="dash-lede">
        {#if $trips.length === 0}
          The Northlander runs north from Toronto Union to Cochrane through some of the prettiest country in Ontario. Name a trip, pick a few stops, and start planning where you'll eat, sleep, and watch the lakes appear.
        {:else if $trips.length === 1}
          One trip already started. Open it to keep building, or begin another adventure.
        {:else}
          {$trips.length} trips on the platform. Tap one to keep building, or start a fresh one from Toronto Union.
        {/if}
      </p>
      <div class="dash-actions">
        <button
          type="button"
          class="btn-primary dash-cta"
          on:click={() => (showNewModal = true)}
        >
          {$trips.length === 0 ? 'Start your first trip' : '+ Start a new trip'}
        </button>
      </div>
    </div>

    <!-- Polaroid collage of route highlights -->
    <div class="dash-collage" aria-hidden="true">
      {#each collageStops as item, i}
        <figure
          class="dash-polaroid"
          style="--rot:{item.tilt}deg;--lift:{item.lift}px;--i:{i}"
        >
          <img src={stopImageUrl(item.stop)} alt="" loading="lazy" decoding="async" />
          <figcaption>{item.stop.name}</figcaption>
        </figure>
      {/each}
    </div>
  </div>
</header>

<!-- ===== The Itinerary Desk =====
     Editorial dashboard, not a SaaS list. The user's trips are
     polaroids taped to a cream paper page: each one a stop photo,
     handwritten Fraunces trip name, a wax-seal stamp in the user's
     leather color carrying the trip initial, and an italic next-move
     line coaching the next action. Today-trips wear a swaying rust
     "Now Boarding" ribbon; past trips wear a "Wrapped" stamp and
     fade to sepia so they read as archive. Same vocabulary as the
     Guide's /plan scrapbook. -->
<section class="dash-desk">
  <div class="dash-desk-inner">

    <header class="desk-masthead">
      <span class="desk-volume">The Itinerary Desk  ·  {mastheadMonth}</span>
      <h2 class="desk-title">
        {#if $trips.length === 0}
          An empty notebook
        {:else if $trips.length === 1}
          One trip in progress
        {:else}
          {$trips.length} trips in progress
        {/if}
      </h2>
      {#if nextDeparture}
        <p class="desk-subhead">
          Next departure  &mdash;  <em>{nextDeparture.trip.name}</em>, {nextDeparture.when.toLowerCase()}.
        </p>
      {/if}
    </header>

    {#if $trips.length === 0}
      {@const heroStop = STOPS.find((s) => s.id === 'union')}
      <div class="desk-blank">
        <button
          type="button"
          class="polaroid polaroid-cta"
          on:click={() => (showNewModal = true)}
          aria-label="Start your first trip"
        >
          <span class="polaroid-tape" aria-hidden="true"></span>
          <span class="polaroid-stamp polaroid-stamp--invite" aria-hidden="true">Start a Trip</span>
          <div class="polaroid-photo polaroid-photo-faded">
            {#if heroStop}
              <img src={stopImageUrl(heroStop)} alt="" loading="lazy" decoding="async" />
            {/if}
          </div>
          <div class="polaroid-paper polaroid-paper--centered">
            <h3 class="polaroid-name">A blank page.</h3>
            <p class="polaroid-meta">Where to first?</p>
            <p class="polaroid-next">Pick a name, pick your route, pack the rest later.</p>
          </div>
        </button>
      </div>
    {:else}
      <div class="desk-scrapbook">
        {#each $trips as trip, i (trip.id)}
          {@const thumb = firstStopThumb(trip)}
          {@const days = trip.departureDate ? daysUntilDate(trip.departureDate) : null}
          {@const isToday = days === 0}
          {@const isWrapped = days != null && days < 0}
          {@const prog = packFraction(trip)}
          {@const initial = (trip.name || '?').trim().charAt(0).toUpperCase()}
          {@const ready = tripStats[trip.id]?.readyFraction}
          <div
            class="polaroid-wrap"
            style="--rot:{tilts[i % tilts.length]}deg; --y:{offsets[i % offsets.length]}px; --i:{i}"
          >
            <a
              href={`/trips/${trip.id}`}
              class="polaroid"
              class:is-wrapped={isWrapped}
              class:is-today={isToday}
            >
              <span class="polaroid-tape" aria-hidden="true"></span>
              {#if isToday}
                <span class="polaroid-ribbon" aria-hidden="true">Now Boarding</span>
              {/if}
              {#if isWrapped}
                <span class="polaroid-stamp" aria-hidden="true">Wrapped</span>
              {/if}

              <div class="polaroid-photo">
                {#if thumb}
                  <img src={thumb.url} alt="" loading="lazy" decoding="async" />
                {:else}
                  <div class="polaroid-photo-empty" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 4 L20 4 L20 20 L4 20 Z" />
                      <path d="M9 9 L15 9 M9 12 L15 12 M9 15 L13 15" stroke-dasharray="2 2" />
                    </svg>
                  </div>
                {/if}

                <span class="polaroid-seal" aria-hidden="true">
                  {#if ready != null}
                    <!-- SVG progress ring: gold-dashed background +
                         solid rust arc proportional to ready. The
                         initial sits at the center as before. -->
                    <svg class="polaroid-seal-ring" viewBox="0 0 40 40">
                      <circle cx="20" cy="20" r="17" stroke="rgba(201, 168, 76, 0.55)" stroke-width="2" fill="none" stroke-dasharray="3 3" />
                      <circle
                        cx="20"
                        cy="20"
                        r="17"
                        stroke="#c9a84c"
                        stroke-width="3"
                        fill="none"
                        stroke-linecap="round"
                        transform="rotate(-90 20 20)"
                        stroke-dasharray={`${(Math.max(0, Math.min(1, ready)) * 2 * Math.PI * 17).toFixed(1)} ${(2 * Math.PI * 17).toFixed(1)}`}
                      />
                    </svg>
                  {/if}
                  <span>{initial}</span>
                  {#if ready != null && ready >= 1}
                    <span class="polaroid-seal-tick" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 9 7 13 13 4"/>
                      </svg>
                    </span>
                  {/if}
                </span>
              </div>

              <div class="polaroid-paper">
                <h3 class="polaroid-name">{trip.name}</h3>
                <p class="polaroid-meta">
                  {#if thumb}{thumb.name}{:else}No stops yet{/if}
                  {#if trip.departureDate}
                    &nbsp;&middot;&nbsp; {countdownLabel(trip.departureDate)}
                  {/if}
                </p>
                {#if prog != null}
                  <span class="polaroid-prog">
                    {tripStats[trip.id]?.packDone || 0} of {tripStats[trip.id]?.packTotal || 0} packed
                  </span>
                {/if}
                <p class="polaroid-next">{nextMove(trip)}</p>
              </div>
            </a>
            <button
              type="button"
              class="polaroid-delete"
              on:click={(ev) => handleDeleteTrip(trip, ev)}
              aria-label={`Delete ${trip.name}`}
              title="Delete this trip"
            >&times;</button>
          </div>
        {/each}

        <button
          type="button"
          class="polaroid polaroid-cta"
          on:click={() => (showNewModal = true)}
          aria-label="Start a new trip"
        >
          <span class="polaroid-tape" aria-hidden="true"></span>
          <span class="polaroid-stamp polaroid-stamp--invite" aria-hidden="true">A New Trip</span>
          <div class="polaroid-photo polaroid-photo-blank" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="32" cy="32" r="22" stroke-dasharray="4 4" />
              <path d="M32 22 L32 42 M22 32 L42 32" />
            </svg>
          </div>
          <div class="polaroid-paper polaroid-paper--cta">
            <h3 class="polaroid-name">A fresh trip</h3>
            <p class="polaroid-meta">Start a new one</p>
            <p class="polaroid-next">Free, no credit card.</p>
          </div>
        </button>
      </div>
    {/if}

    <p class="desk-signoff">Stay curious.  ·  Pack light.</p>
  </div>
</section>

<!-- ===== Inspiration: every stop on the route ===== -->
<section class="dash-inspire">
  <div class="dash-inspire-inner">
    <div class="dash-section-head">
      <div class="kicker">Daydream</div>
      <h2>16 stops north from Toronto Union</h2>
      <p class="dash-section-sub">
        Lake towns, gold-mine country, polar bear country. Tap any stop to open its guide and start picking favourites.
      </p>
    </div>
  </div>

  <!-- Full-bleed scrolling band of real stop photos. Hover (or focus)
       pauses the scroll. Each tile links out to the Guide. The list
       is doubled so the loop seam is invisible. -->
  <div class="dash-marquee" aria-label="The 16 stops on the Northlander route">
    <div class="dash-marquee-track">
      {#each STOPS as stop}
        <a
          class="dash-marquee-item"
          href={stopGuideUrl(stop)}
          target="_blank"
          rel="noopener"
          aria-label={`Explore the ${stop.name} stop guide`}
        >
          <img src={stopImageUrl(stop)} alt={stop.name} loading="lazy" decoding="async" />
          <span class="dash-marquee-name">{stop.name}</span>
        </a>
      {/each}
      {#each STOPS as stop}
        <a
          class="dash-marquee-item"
          href={stopGuideUrl(stop)}
          target="_blank"
          rel="noopener"
          aria-hidden="true"
          tabindex="-1"
        >
          <img src={stopImageUrl(stop)} alt="" loading="lazy" decoding="async" />
          <span class="dash-marquee-name">{stop.name}</span>
        </a>
      {/each}
    </div>
  </div>
</section>

<!-- ===== How it works ===== -->
<section class="dash-howto">
  <div class="dash-howto-inner">
    <div class="dash-section-head dash-section-head--center">
      <div class="kicker">How It Works</div>
      <h2>Three steps to the platform</h2>
    </div>

    <ol class="howto-steps">
      <li>
        <span class="howto-num">01</span>
        <h3>Browse the Guide</h3>
        <p>Find your stops, restaurants, places to stay, and things to do on NorthlanderGuide.com. Tap the + on any listing.</p>
      </li>
      <li>
        <span class="howto-num">02</span>
        <h3>Pack your bag</h3>
        <p>Add packing items, check off bookings, set a budget. Train boarding and arrival times appear automatically.</p>
      </li>
      <li>
        <span class="howto-num">03</span>
        <h3>Take it with you</h3>
        <p>Your trip lives on your phone. Works offline. Edits sync when you're back in signal.</p>
      </li>
    </ol>
  </div>
</section>

<!-- Restore-a-backup moved to the layout footer (2026-06-09) so
     first-time visitors aren't asked to parse "what's a backup
     file" on their first scroll. Power users on a new device still
     find it next to Privacy + Terms. -->

{#if showNewModal}
  <NewTripModal on:close={() => (showNewModal = false)} />
{/if}

<!-- In-page confirmation for polaroid-corner delete. Forest header
     + cream body + rust footer so it speaks the same boarding-pass
     vocabulary as the rest of the modals. -->
{#if confirmingTrip}
  <div
    class="confirm-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-trip-title"
    on:keydown={(e) => { if (e.key === 'Escape') cancelDelete(); }}
  >
    <button
      type="button"
      class="confirm-backdrop"
      on:click={cancelDelete}
      aria-label="Cancel delete"
    ></button>
    <div class="confirm-card">
      <header class="confirm-head">
        <span class="confirm-kicker">Danger zone</span>
        <h2 id="confirm-trip-title" class="confirm-title">Delete "{confirmingTrip.name}"?</h2>
      </header>
      <div class="confirm-body">
        <p>
          This removes the trip's packing list, bookings, photos, diary,
          and spending. It <strong>cannot be undone</strong>.
        </p>
      </div>
      <footer class="confirm-foot">
        <button
          type="button"
          class="confirm-cancel"
          on:click={cancelDelete}
          disabled={confirmBusy}
        >Keep this trip</button>
        <button
          type="button"
          class="confirm-confirm"
          on:click={confirmDelete}
          disabled={confirmBusy}
        >
          {confirmBusy ? 'Deleting...' : 'Yes, delete it'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<!-- First-launch onboarding. Renders only when the persisted
     dismiss flag is unset; the component manages its own
     localStorage check + early-return. We also gate the mount on
     onboardingReady + $trips.length === 0 so returning users
     (whose Dexie load is still in flight on first paint) don't
     see the overlay flash up. 'start' fires when the user taps
     "Tag my first suitcase" on the last card, which we hand
     straight off to NewTripModal so they land in their first
     trip without seeing the empty platform. -->
{#if onboardingReady && $trips.length === 0}
  <OnboardingOverlay on:start={() => (showNewModal = true)} />
{/if}

<style>
  /* ===== Hero ===== */
  .dash-hero {
    position: relative;
    background:
      radial-gradient(ellipse at 75% 25%, rgba(196, 134, 15, 0.32), transparent 55%),
      linear-gradient(180deg, #0a2d21 0%, #16543e 100%);
    color: #f5f0e8;
    padding: 56px 24px 64px;
    overflow: hidden;
  }
  .dash-noise {
    position: absolute;
    inset: 0;
    background-image:
      repeating-linear-gradient(45deg, rgba(245, 240, 232, 0.025) 0, rgba(245, 240, 232, 0.025) 1px, transparent 1px, transparent 9px);
    pointer-events: none;
  }
  .dash-hero-inner {
    max-width: 1180px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr;
    gap: 40px;
    position: relative;
    z-index: 2;
  }
  @media (min-width: 880px) {
    .dash-hero-inner {
      grid-template-columns: 1.15fr 1fr;
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

  .dash-hero h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    /* Larger floor (3.6rem) so the title reads big on phones where
       7vw drops below the desktop ceiling - was tiny against the
       full-height hero band. */
    font-size: clamp(3.6rem, 10vw, 5rem);
    line-height: 0.95;
    margin: 14px 0 18px;
    letter-spacing: -0.015em;
  }
  .dash-hero h1 em {
    font-style: italic;
    font-weight: 500;
    color: #c4860f;
  }
  .dash-lede {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(16px, 1.8vw, 19px);
    color: #cad7cf;
    line-height: 1.55;
    margin: 0 0 24px;
    max-width: 52ch;
  }

  .dash-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
  }
  .dash-cta {
    background: #c9a84c;
    color: #0a2d21;
    border-color: #c9a84c;
    font-weight: 700;
    padding: 0.95rem 1.6rem;
    box-shadow: 0 8px 18px rgba(201, 168, 76, 0.32);
  }
  .dash-cta:hover {
    background: #f5f0e8;
    color: #0a2d21;
    border-color: #f5f0e8;
  }
  /* Polaroid collage on the hero */
  .dash-collage {
    position: relative;
    min-height: 320px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }
  .dash-polaroid {
    background: #fbf6ea;
    padding: 8px 8px 14px;
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.4);
    margin: 0;
    --base-tilt: var(--rot, 0deg);
    --base-lift: var(--lift, 0px);
    transform: rotate(var(--base-tilt)) translateY(var(--base-lift));
    transition: transform 0.35s cubic-bezier(.2,.7,.3,1);
    /* Ambient sway so the dashboard reads as alive even when the
       user hasn't reached for the cursor. Staggered per-index so
       all four polaroids don't dip on the same beat. */
    animation: dash-polaroid-float 7.5s ease-in-out infinite;
    animation-delay: calc(var(--i, 0) * -1.7s);
    transform-origin: 50% 100%;
  }
  .dash-polaroid:hover {
    transform: rotate(0deg) translateY(-8px);
    z-index: 4;
    animation: none;
  }
  @keyframes dash-polaroid-float {
    0%   { transform: rotate(var(--base-tilt)) translateY(var(--base-lift)) rotate(0deg); }
    50%  { transform: rotate(var(--base-tilt)) translateY(calc(var(--base-lift) - 7px)) rotate(0.9deg); }
    100% { transform: rotate(var(--base-tilt)) translateY(var(--base-lift)) rotate(0deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .dash-polaroid { animation: none; }
  }
  .dash-polaroid img {
    width: clamp(110px, 14vw, 170px);
    height: clamp(110px, 14vw, 170px);
    object-fit: cover;
    background: #ede0cc;
    display: block;
  }
  .dash-polaroid figcaption {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #0a2d21;
    text-align: center;
    padding-top: 6px;
  }

  /* ===== Section heads ===== */
  .dash-section-head {
    padding: 0 24px;
    max-width: 1080px;
    margin: 0 auto 20px;
  }
  .dash-section-head h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(1.8rem, 4vw, 2.8rem);
    color: #0a2d21;
    line-height: 1.05;
    margin: 8px 0 8px;
    letter-spacing: -0.01em;
  }
  .dash-section-sub {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    font-size: 16px;
    margin: 0;
    max-width: 64ch;
  }
  .dash-section-head--center {
    text-align: center;
  }

  /* ===== The Itinerary Desk =====
     Cream paper page with the Guide's signature diagonal grain. The
     middle section is editorial: a publication masthead at the top,
     a scrapbook of polaroid trip cards in the middle, an italic
     sign-off at the bottom. No 3D scenery; the typography and the
     paper texture carry the brand. */
  .dash-desk {
    position: relative;
    background: #fbf6ea;
    background-image:
      repeating-linear-gradient(45deg, rgba(45, 30, 20, 0.05) 0, rgba(45, 30, 20, 0.05) 1px, transparent 1px, transparent 9px);
    padding: 56px 0 40px;
    border-top: 3px double rgba(125, 58, 30, 0.25);
    border-bottom: 3px double rgba(125, 58, 30, 0.25);
  }
  .dash-desk-inner {
    max-width: 1180px;
    margin: 0 auto;
    padding: 0 24px;
  }

  .desk-masthead {
    text-align: center;
    margin-bottom: 8px;
  }
  .desk-volume {
    display: block;
    font-family: 'Spline Sans', system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.28em;
    font-size: 11px;
    font-weight: 800;
    color: #7d3a1e;
  }
  .desk-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2rem, 4vw, 2.6rem);
    line-height: 1.05;
    color: #0a2d21;
    margin: 6px 0 0;
  }
  .desk-subhead {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 14px;
    color: #5a4f3d;
    margin: 8px 0 0;
  }
  .desk-subhead em {
    font-style: italic;
    color: #7d3a1e;
    font-weight: 600;
  }
  /* Sign-off at the bottom of the section, same vocabulary as the
     Guide's editorial mood. Polaroid cards tilt + cast shadow
     outside their grid cell so the section's content height
     understates the visual footprint - bumped the top margin so
     the sign-off sits CLEAR of the "Free, no credit card." line
     on the new-trip CTA polaroid below. */
  .desk-signoff {
    text-align: center;
    margin: 120px auto 0;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    letter-spacing: 0.08em;
    color: #7d3a1e;
    opacity: 0.7;
    max-width: 320px;
  }

  /* Scrapbook of polaroids. Stable per-index tilts driven by inline
     CSS variables so cards always read scattered, not gridded. */
  .desk-scrapbook {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 44px 24px;
    margin-top: 32px;
  }
  .desk-blank {
    display: flex;
    justify-content: center;
    margin-top: 32px;
  }
  .desk-blank .polaroid {
    width: 100%;
    max-width: 380px;
  }

  /* Each trip is a polaroid taped to the page: cream paper, soft
     shadow, slight tilt, photo on top, handwritten Fraunces name
     under it. The user's leather color shows as a wax-seal stamp
     in the corner of the photo - the suitcase metaphor without
     the suitcase. */
  /* Outer wrapper that carries the rotation + translate so the
     <a> stays a plain link element (we can't nest a button inside
     an anchor for the corner delete). The .polaroid itself drops
     its tilt onto the wrapper and only handles the lift on hover. */
  .polaroid-wrap {
    position: relative;
    --base-tilt: var(--rot, 0deg);
    --base-lift: var(--y, 0px);
    transform: rotate(var(--base-tilt)) translateY(var(--base-lift));
    transition: transform 0.35s cubic-bezier(.2,.7,.3,1);
    /* Idle drift so the trip polaroids don't sit dead still on the
       dashboard. Staggered via --i so the row reads as a breeze
       passing through the photos pinned to a paper page. */
    animation: trip-polaroid-drift 8s ease-in-out infinite;
    animation-delay: calc(var(--i, 0) * -2s);
    transform-origin: 50% 100%;
  }
  .polaroid-wrap:hover {
    transform: rotate(0deg) translateY(-8px);
    z-index: 2;
    animation: none;
  }
  @keyframes trip-polaroid-drift {
    0%   { transform: rotate(var(--base-tilt)) translateY(var(--base-lift)) rotate(0deg); }
    50%  { transform: rotate(var(--base-tilt)) translateY(calc(var(--base-lift) - 6px)) rotate(0.7deg); }
    100% { transform: rotate(var(--base-tilt)) translateY(var(--base-lift)) rotate(0deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .polaroid-wrap { animation: none; }
  }
  /* Hover-reveal the delete corner on devices that support hover. */
  .polaroid-wrap:hover .polaroid-delete,
  .polaroid-wrap:focus-within .polaroid-delete {
    opacity: 1;
  }

  .polaroid {
    position: relative;
    display: block;
    background: #fbf6ea;
    padding: 12px 12px 18px;
    box-shadow: 0 14px 28px rgba(20, 14, 6, 0.28);
    transition: box-shadow 0.35s ease;
    text-decoration: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
    border: 0;
    font-family: inherit;
    width: 100%;
  }
  .polaroid-wrap:hover .polaroid {
    box-shadow: 0 26px 42px rgba(20, 14, 6, 0.34);
  }

  /* Corner delete button. Pinned to the polaroid's top-right with
     a small offset so it overhangs the paper edge. Hidden by
     default on hover-capable devices and revealed on hover;
     always visible on touch (no hover state) so iPad users can
     find it. Two-step safety via window.confirm. */
  .polaroid-delete {
    position: absolute;
    top: -10px;
    right: -10px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1.5px solid #6e2e17;
    background: #fffdf6;
    color: #6e2e17;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(20, 14, 6, 0.25);
    opacity: 0;
    transition: opacity 140ms ease, background 140ms ease, color 140ms ease;
    z-index: 3;
  }
  .polaroid-delete:hover {
    background: #6e2e17;
    color: #fffdf6;
  }
  /* Touch devices have no hover state, so the button stays
     visible. matches the pattern Safari on iPad uses for "no
     hover" detection. */
  @media (hover: none) {
    .polaroid-delete { opacity: 1; }
  }

  /* Single piece of masking tape over the top-left edge. Cream-on-
     cream with a soft shadow so it reads tactile rather than
     graphic. */
  .polaroid-tape {
    position: absolute;
    top: -10px;
    left: 18px;
    width: 78px;
    height: 22px;
    background: rgba(232, 214, 168, 0.78);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.18);
    transform: rotate(-3deg);
    z-index: 4;
  }

  .polaroid-photo {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    background: #0a2d21;
  }
  .polaroid-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .polaroid-photo-empty,
  .polaroid-photo-blank {
    width: 100%;
    height: 100%;
    background: #ede0cc;
    color: #7d3a1e;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .polaroid-photo-empty svg { width: 56px; height: 56px; opacity: 0.55; }
  .polaroid-photo-blank svg { width: 76px; height: 76px; }
  .polaroid-photo-faded img {
    filter: sepia(0.35) saturate(0.7) brightness(1.05);
    opacity: 0.92;
  }

  /* Wax-seal stamp in the user's leather color, set at the photo's
     top-right corner with the trip initial pressed into it. A real
     wax-seal feel from one inner radial highlight + one dark ring. */
  .polaroid-seal {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 32% 30%, rgba(255, 255, 255, 0.35) 0%, transparent 35%),
      #7d3a1e;
    border: 2.5px solid #5e2a14;
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.18),
      0 6px 12px rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3;
  }
  .polaroid-seal span {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 16px;
    color: #fbf6ea;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.45);
    line-height: 1;
  }
  /* Progress ring overlaid on the seal. Gold dashed background +
     solid amber arc proportional to how ready the trip is. */
  .polaroid-seal-ring {
    position: absolute;
    inset: -6px;
    width: calc(100% + 12px);
    height: calc(100% + 12px);
    pointer-events: none;
    z-index: 2;
  }
  /* Small tick in the corner when ready hits 100% so the user gets
     a tiny celebration moment without needing a confetti library. */
  .polaroid-seal-tick {
    position: absolute;
    bottom: -10px;
    right: -10px;
    width: 22px;
    height: 22px;
    background: #c9a84c;
    color: #0a2d21;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 3px 8px rgba(40, 30, 15, 0.32);
    z-index: 3;
  }
  .polaroid-seal-tick svg { width: 14px; height: 14px; }

  /* "Now Boarding" rust ribbon on the day-of trip. Pinned to the
     photo, gently swaying. */
  .polaroid-ribbon {
    position: absolute;
    top: 18px;
    left: -8px;
    background: #7d3a1e;
    color: #f5f0e8;
    font-family: 'Spline Sans', system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 9.5px;
    font-weight: 800;
    padding: 4px 12px;
    z-index: 5;
    transform: rotate(-6deg);
    box-shadow: 0 5px 10px rgba(0, 0, 0, 0.22);
    animation: polaroid-ribbon-sway 4.5s ease-in-out infinite;
  }
  .polaroid-ribbon::before,
  .polaroid-ribbon::after {
    content: '';
    position: absolute;
    bottom: -5px;
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 5px solid #5e2a14;
  }
  .polaroid-ribbon::before { left: 0; }
  .polaroid-ribbon::after  { right: 0; }
  @keyframes polaroid-ribbon-sway {
    0%, 100% { transform: rotate(-6deg); }
    50%      { transform: rotate(-3deg); }
  }

  /* "Wrapped" stamp on past trips. Rotated rust outline with cream
     paper underneath, matches the journey-end stamp on /plan. */
  .polaroid-stamp {
    position: absolute;
    top: 18px;
    right: 14px;
    background: rgba(255, 250, 240, 0.86);
    border: 2px solid #7d3a1e;
    color: #7d3a1e;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 900;
    font-size: 12px;
    letter-spacing: 0.08em;
    padding: 3px 10px;
    transform: rotate(-12deg);
    z-index: 5;
    text-transform: uppercase;
  }
  .polaroid-stamp--invite {
    color: #c9a84c;
    border-color: #c9a84c;
    background: rgba(10, 45, 33, 0.85);
  }

  /* Cream-paper area beneath the photo with handwritten-style name
     and a small metadata line. The italic Fraunces "next move" sits
     on a dashed perforation rule so it reads like a margin note. */
  .polaroid-paper {
    padding: 16px 4px 0;
  }
  .polaroid-paper--centered { text-align: center; }
  /* The "+ new trip" polaroid sits below the dashed-circle icon
     rather than a real photo, so push the name down a touch and
     center it for a more invitational feel. */
  .polaroid-paper--cta {
    /* Extra breathing room above "A fresh trip" so the text isn't
       pressed against the dashed-circle icon area above. */
    padding-top: 40px;
    text-align: center;
  }
  .polaroid-name {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 1.25rem;
    line-height: 1.15;
    color: #0a2d21;
    margin: 0 0 4px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
  }
  .polaroid-meta {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-weight: 700;
    color: #7d3a1e;
    margin: 0;
  }
  .polaroid-prog {
    display: inline-block;
    margin-top: 6px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12px;
    color: #6d5a36;
  }
  .polaroid-next {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #7d3a1e;
    margin: 10px 0 0;
    padding-top: 8px;
    border-top: 1px dashed rgba(125, 58, 30, 0.3);
  }

  /* Past trips fade to a sepia archive treatment. The seal and
     ribbon stay full-color so the eye still finds them. */
  .polaroid.is-wrapped {
    opacity: 0.92;
  }
  .polaroid.is-wrapped .polaroid-photo img {
    filter: sepia(0.5) saturate(0.65) brightness(0.92);
  }
  .polaroid.is-wrapped .polaroid-name,
  .polaroid.is-wrapped .polaroid-next {
    color: #6d5a36;
  }

  /* "+ New trip" / empty-state CTA polaroid - blank cream photo with
     a dashed circle + plus, an invitation stamp, and a clearly
     button-like role. Hovers like any other polaroid. */
  .polaroid-cta {
    background: #fbf6ea;
  }
  .polaroid-cta .polaroid-photo {
    background: #ede0cc;
  }

  @media (prefers-reduced-motion: reduce) {
    .polaroid-ribbon { animation: none; }
    .polaroid { transition: none; }
  }

  /* ===== Inspiration marquee =====
     Full-bleed cream paper band with forest top/bottom rails.
     Mirrors the /plan page's `.pl-marquee` exactly so the App's
     home page reads as a continuation of the Guide's plan flow. */
  .dash-inspire {
    background: #fbf6ea;
    padding: 64px 0 0;
  }
  .dash-inspire-inner {
    max-width: 1180px;
    margin: 0 auto;
    padding: 0 24px;
  }
  .dash-marquee {
    margin: 40px 0 0;
    background: #fbf6ea;
    border-top: 3px solid #0a2d21;
    border-bottom: 3px solid #0a2d21;
    padding: 18px 0;
    overflow: hidden;
    white-space: nowrap;
    position: relative;
    font-size: 0;
    line-height: 0;
    display: flex;
    align-items: center;
  }
  .dash-marquee-track {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    animation: dash-marquee-scroll 90s linear infinite;
    font-size: initial;
    line-height: initial;
  }
  .dash-marquee:hover .dash-marquee-track,
  .dash-marquee:focus-within .dash-marquee-track {
    animation-play-state: paused;
  }
  .dash-marquee-item {
    display: block;
    position: relative;
    width: 200px;
    height: 140px;
    flex: none;
    overflow: hidden;
    border: 2px solid #0a2d21;
    background: #f5f0e8;
    text-decoration: none;
    color: inherit;
    transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
  }
  .dash-marquee-item:hover {
    transform: translateY(-3px);
    border-color: #c4860f;
    box-shadow: 0 10px 20px rgba(10, 45, 33, 0.22);
  }
  .dash-marquee-item:focus-visible {
    outline: 3px solid #c4860f;
    outline-offset: 2px;
  }
  .dash-marquee-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.4s ease;
  }
  .dash-marquee-item:hover img {
    transform: scale(1.06);
  }
  .dash-marquee-name {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(10, 45, 33, 0.86);
    color: #f5f0e8;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 5px 10px;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .dash-marquee-name::after {
    content: '\2192';
    color: #c9a84c;
    font-weight: 700;
    font-size: 14px;
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity 0.2s, transform 0.2s;
  }
  .dash-marquee-item:hover .dash-marquee-name::after {
    opacity: 1;
    transform: translateX(0);
  }
  @keyframes dash-marquee-scroll {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  @media (max-width: 640px) {
    .dash-marquee-item { width: 160px; height: 110px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .dash-marquee-track { animation: none; }
  }

  /* ===== How it works ===== */
  .dash-howto {
    background: #0a2d21;
    color: #f5f0e8;
    padding: 64px 24px;
  }
  .dash-howto-inner {
    max-width: 1080px;
    margin: 0 auto;
  }
  .dash-howto .dash-section-head h2 {
    color: #f5f0e8;
  }
  .howto-steps {
    list-style: none;
    padding: 0;
    margin: 28px 0 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 28px;
  }
  @media (min-width: 760px) {
    .howto-steps {
      grid-template-columns: 1fr 1fr 1fr;
    }
  }
  .howto-steps li {
    padding: 26px 20px;
    background: rgba(245, 240, 232, 0.05);
    border-left: 3px solid #c4860f;
  }
  .howto-num {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 38px;
    color: #c4860f;
    line-height: 1;
    display: block;
    margin-bottom: 6px;
  }
  .howto-steps h3 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 20px;
    color: #f5f0e8;
    margin: 0 0 6px;
  }
  .howto-steps p {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 15px;
    line-height: 1.55;
    color: #cad7cf;
    margin: 0;
  }

  /* ===== Delete-trip confirmation =====
     Inline modal triggered by the polaroid corner X. Forest +
     cream + rust boarding-pass band identity, same vocabulary as
     the rest of the app's modals. */
  .confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 250;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .confirm-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(10, 30, 20, 0.72);
    border: 0;
    cursor: pointer;
    padding: 0;
    backdrop-filter: blur(2px);
  }
  .confirm-card {
    position: relative;
    z-index: 1;
    background: #fbf6ea;
    border: 1.5px solid #c9a84c;
    box-shadow: 0 24px 48px rgba(10, 30, 20, 0.45);
    width: 100%;
    max-width: 460px;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .confirm-head {
    background: #4a1f0e;
    padding: 16px 22px 14px;
    border-bottom: 3px double rgba(201, 168, 76, 0.55);
  }
  .confirm-kicker {
    display: block;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #c9a84c;
    margin-bottom: 4px;
  }
  .confirm-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 800;
    font-size: clamp(18px, 4vw, 22px);
    color: #f5f0e8;
    line-height: 1.2;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .confirm-body {
    padding: 18px 22px;
  }
  .confirm-body p {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 14.5px;
    line-height: 1.5;
    color: #5a4f3d;
    margin: 0;
  }
  .confirm-body strong {
    font-style: normal;
    color: #7d3a1e;
    font-weight: 700;
  }
  .confirm-foot {
    background: #4a1f0e;
    border-top: 3px double rgba(201, 168, 76, 0.55);
    padding: 12px 18px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }
  .confirm-cancel {
    background: transparent;
    border: 1.5px solid rgba(245, 240, 232, 0.5);
    color: #f3ece0;
    padding: 8px 14px;
    border-radius: 4px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 160ms ease, border-color 160ms ease;
  }
  .confirm-cancel:hover {
    background: rgba(245, 240, 232, 0.1);
    border-color: #f3ece0;
  }
  .confirm-confirm {
    background: #c9a84c;
    border: 2px solid #c9a84c;
    color: #0a2d21;
    padding: 8px 16px;
    border-radius: 4px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 160ms ease, transform 160ms ease;
  }
  .confirm-confirm:hover:not(:disabled) {
    background: #d8b863;
    transform: translateY(-1px);
  }
  .confirm-confirm:disabled {
    opacity: 0.55;
    cursor: progress;
  }
</style>
