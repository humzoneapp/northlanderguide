<script>
  /* ==================================================================
     Per-stop chapter scene.

     One chapter for one stop on the trip. Same shape whether it's an
     outbound chapter or a return chapter; the parent passes a kicker
     label + a direction so the train clock, weather strip and add-
     plan modal all read against the right leg of the trip.

     Renders seven Drawer accordions in the main column (Day plan,
     Map, Bookings, Diary, Polaroids, Spending, Happening) plus an
     aside with the stop's hero photo, italic hook, and Guide link.

     Lifted out of the trip page on 2026-06-09 because the chapter
     markup was being duplicated between the outbound and return
     scenes blocks - ~200 lines of identical Drawer wiring living
     twice inside trip-page/+page.svelte.
     ================================================================== */

  import { createEventDispatcher } from 'svelte';
  import { stopImageUrl } from '$lib/data/stops.js';
  import { trainTimeFor } from '$lib/data/schedule.js';

  import Drawer from '$lib/components/Drawer.svelte';
  import StopMap from '$lib/components/StopMap.svelte';
  import BookingChecklist from '$lib/components/BookingChecklist.svelte';
  import TravelDiary from '$lib/components/TravelDiary.svelte';
  import PhotoAlbum from '$lib/components/PhotoAlbum.svelte';
  import BudgetTracker from '$lib/components/BudgetTracker.svelte';
  import EventsAlongRoute from '$lib/components/EventsAlongRoute.svelte';
  import WeatherStrip from '$lib/components/WeatherStrip.svelte';

  /** Stop entry with id/name/region/hook/lat/lng/stayStart/stayEnd. */
  export let stop;
  /** DOM id for the <article>, e.g. "scene-0" or "scene-return-2". */
  export let id;
  /** Kicker label shown above the stop name ("Departure" / "Stop 1" /
      "Return 2" / "Return"). Caller knows the leg + index, so it
      composes the label itself. */
  export let kicker;
  /** 'outbound' | 'return' - drives the per-stop direction used for
      train clocks, weather, and the AddPlanModal direction prop when
      the user taps the Browse-the-Guide pill in this chapter. */
  export let kind = 'outbound';
  /** Trip-wide direction ('northbound' | 'southbound'). For outbound
      chapters this matches; for return chapters the opposite direction
      is used. Computed in the parent + passed in. */
  export let direction = 'northbound';

  /** Trip-level data, kept on the page and filtered per-stop inside. */
  export let tripId;
  /** @type {string[]} */
  export let stopIds = [];
  /** @type {string} */
  export let departureClock = '09:00';
  /** Monotonic counter bumped by the page after every refetch so the
      child accordions know to refresh. */
  export let refreshKey = 0;

  /** Full arrays from the page; the chapter slices by stop.id below. */
  export let bookings = [];
  export let diary = [];
  export let photos = [];
  export let budgetEntries = [];
  export let userEventsAll = [];

  const dispatch = createEventDispatcher();

  /* Reactive slices. Filtering here (not at the parent) lets the
     chapter's drawer count badges read the live arrays directly so
     a Svelte reactivity update propagates correctly - the
     {@const}-inside-each gotcha that bit us on the old trip page
     is sidestepped entirely. */
  $: stopBookings = bookings.filter((b) => b.stopId === stop.id);
  $: stopDiary = diary.filter((d) => d.stopId === stop.id);
  $: stopPhotos = photos.filter((p) => p.stopId === stop.id);
  $: stopBudget = budgetEntries.filter((e) => e.stopId === stop.id);
  $: stopUserEvents = userEventsAll.filter((e) => !e.stopId || e.stopId === stop.id);

  /* Train clock for this chapter. For outbound chapters: arrive at
     middle stops, depart at the first stop. For return chapters:
     arrive at every stop. */
  $: stopTime = trainTimeFor(stop.id, direction);
  $: trainLine = kind === 'outbound' && kicker === 'Departure'
    ? (stopTime?.depart ? `Departs ${stopTime.depart}` : '')
    : (stopTime?.arrive ? `Arrives ${stopTime.arrive}` : '');

  function formatStayLabel(s) {
    if (!s || !s.stayStart) return '';
    try {
      const start = new Date(s.stayStart + 'T12:00:00').toLocaleDateString('en-CA', {
        weekday: 'short', month: 'short', day: 'numeric'
      });
      if (s.stayEnd && s.stayEnd !== s.stayStart) {
        const end = new Date(s.stayEnd + 'T12:00:00').toLocaleDateString('en-CA', {
          weekday: 'short', month: 'short', day: 'numeric'
        });
        return `${start} to ${end}`;
      }
      return start;
    } catch (_) {
      return s.stayStart;
    }
  }
</script>

<article {id} class="scene" class:scene--return={kind === 'return'}>
  <div class="scene-inner">
    <header class="scene-head">
      <div class="kicker">{kicker}</div>
      <h2 class="scene-name">{stop.name}</h2>
      <div class="scene-meta">
        <span class="scene-meta-region">{stop.region}</span>
        {#if stop.stayStart}
          <span class="scene-meta-sep" aria-hidden="true">·</span>
          <span class="scene-meta-date">{formatStayLabel(stop)}</span>
        {/if}
        {#if trainLine}
          <span class="scene-meta-sep" aria-hidden="true">·</span>
          <span class="scene-meta-time">{trainLine}</span>
        {/if}
        {#if stop.stayStart}
          <WeatherStrip {stop} date={stop.stayStart} />
        {/if}
      </div>
    </header>

    <div class="scene-grid">
      <div class="scene-main">
        <Drawer
          kicker="Plans"
          title="What you're doing here"
          count={stopBookings.length}
          countLabel={stopBookings.length === 1 ? 'plan' : 'plans'}
        >
          <!-- BookingChecklist owns its drawer-bottom action row:
               Browse-the-Guide pill on top, Add-a-booking pill below.
               Browse-the-Guide dispatches openAddPlan up through this
               component so we can stamp the right `fromReturn` flag
               for the AddPlanModal's direction badge. -->
          <BookingChecklist
            {tripId}
            {stopIds}
            stopFilter={stop.id}
            {direction}
            {departureClock}
            {refreshKey}
            hideHeader={true}
            on:change
            on:openAddPlan={(e) => dispatch('openAddPlan', {
              stopId: e.detail.stopId || stop.id,
              kind: e.detail.kind || 'all',
              fromReturn: kind === 'return'
            })}
          />

          <!-- Map of this chapter's bookings + user events sits below
               the list + action pills so a freshly-added address pops
               into view immediately under the checklist. -->
          <div class="booking-map">
            <div class="booking-map-head">Where they are</div>
            <StopMap
              {stop}
              bookings={stopBookings}
              userEvents={stopUserEvents}
            />
          </div>
        </Drawer>

        <Drawer
          kicker="Journey"
          title="Travel Diary"
          count={stopDiary.length}
          countLabel={stopDiary.length === 1 ? 'note' : 'notes'}
        >
          <TravelDiary
            {tripId}
            {stopIds}
            stopFilter={stop.id}
            {refreshKey}
            hideHeader={true}
            on:change
          />
        </Drawer>

        <Drawer
          kicker="Album"
          title="Polaroids"
          count={stopPhotos.length}
          countLabel={stopPhotos.length === 1 ? 'photo' : 'photos'}
        >
          <PhotoAlbum
            {tripId}
            {stopIds}
            stopFilter={stop.id}
            {refreshKey}
            hideHeader={true}
            on:change
          />
        </Drawer>

        <Drawer
          kicker="Ledger"
          title="Spending"
          count={stopBudget.length}
          countLabel={stopBudget.length === 1 ? 'entry' : 'entries'}
        >
          <BudgetTracker
            {tripId}
            stopFilter={stop.id}
            {refreshKey}
            hideHeader={true}
            on:change
          />
        </Drawer>

        <Drawer
          kicker="From the Guide"
          title="Happening at {stop.name}"
        >
          <EventsAlongRoute
            {tripId}
            stopIds={[stop.id]}
            departureDate={stop.stayStart || null}
            endDate={stop.stayEnd || null}
          />
        </Drawer>
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

<style>
  /* Scene-level styles. Reveal-on-scroll animation hooks live on
     the trip-page parent so chapters from both legs animate via
     the same observer; everything else (kicker, head, grid,
     aside) is local. */
  .scene {
    position: relative;
    color: #241f1a;
    scroll-margin-top: 72px;
    transition: opacity 700ms cubic-bezier(.2,.7,.3,1), transform 700ms cubic-bezier(.2,.7,.3,1);
  }
  :global(.scene.is-pre-reveal) {
    opacity: 0;
    transform: translateY(28px);
  }
  :global(.scene.is-pre-reveal.is-revealed) {
    opacity: 1;
    transform: translateY(0);
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.scene.is-pre-reveal) {
      opacity: 1;
      transform: none;
      transition: none;
    }
  }
  .scene-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 28px 0 56px;
  }

  /* Editorial section heading. Kicker (rust caps) + display H2 +
     italic Fraunces meta row with region + date + train time +
     weather. */
  .scene-head {
    margin-bottom: 18px;
  }
  .scene-head .kicker {
    color: #c4860f;
    margin-bottom: 4px;
  }
  .scene-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(1.8rem, 4vw, 2.4rem);
    line-height: 1.05;
    color: #0a2d21;
    margin: 0 0 8px;
    letter-spacing: -0.01em;
  }
  .scene-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 10px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 14px;
    color: #5a4f3d;
  }
  .scene-meta-region {
    color: #c4860f;
    font-style: normal;
    font-family: 'Spline Sans', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-weight: 700;
    font-size: 11px;
  }
  .scene-meta-date {
    color: #0a2d21;
    font-weight: 600;
  }
  .scene-meta-time {
    color: #7d3a1e;
    font-weight: 600;
  }
  .scene-meta-sep { color: rgba(125, 58, 30, 0.4); }

  /* Two-column main + aside on wide viewports; single column with
     the aside underneath on phones. */
  .scene-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 28px;
  }
  @media (min-width: 880px) {
    .scene-grid {
      grid-template-columns: 65% 35%;
      gap: 36px;
    }
  }

  /* Spacing between consecutive Drawers in the scene-main column.
     Each Drawer is `<details>` so we target by sibling. */
  .scene-main > :global(details.drawer) {
    margin-bottom: 14px;
  }
  .scene-main > :global(details.drawer:last-child) {
    margin-bottom: 0;
  }

  /* Inline map inside the Bookings drawer (since 2026-06-09). Sits
     between the booking list and the Browse-the-Guide pill so a row
     the user just added shows up on the map immediately. The thin
     dashed rust kicker frames it as a "look here too" subsection
     without making it feel like a separate drawer. */
  .booking-map {
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px dashed rgba(125, 58, 30, 0.3);
  }
  .booking-map-head {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #7d3a1e;
    margin: 0 0 10px;
  }

  /* Right-column aside: stop hero polaroid + italic hook + a small
     Guide link out. */
  .scene-aside {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .scene-postcard {
    margin: 0;
    background: #fbf6ea;
    padding: 10px 10px 14px;
    box-shadow: 0 14px 28px rgba(40, 25, 10, 0.18);
    transform: rotate(-2deg);
  }
  .scene-postcard img {
    width: 100%;
    height: auto;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    background: #ede0cc;
    display: block;
  }
  .scene-aside-hook {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    font-size: 15px;
    line-height: 1.5;
    margin: 8px 0 0;
  }
  .scene-aside-guide {
    align-self: flex-start;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #7d3a1e;
    text-decoration: none;
    border-bottom: 1.5px dashed rgba(125, 58, 30, 0.45);
    padding-bottom: 2px;
    transition: color 140ms ease, border-color 140ms ease;
  }
  .scene-aside-guide:hover {
    color: #0a2d21;
    border-color: #0a2d21;
  }

  /* Kicker base class re-used from the global token. Kept here as
     a fallback for components mounting the chapter outside the
     app's normal layout. */
  .kicker {
    font-family: 'Spline Sans', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.24em;
    font-size: 11px;
    font-weight: 700;
    color: #c4860f;
  }
</style>
