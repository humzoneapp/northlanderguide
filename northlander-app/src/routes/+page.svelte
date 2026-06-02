<script>
  import { onMount } from 'svelte';
  import Suitcase from '$lib/components/Suitcase.svelte';
  import NewTripModal from '$lib/components/NewTripModal.svelte';
  import OnboardingOverlay from '$lib/components/OnboardingOverlay.svelte';
  import { trips } from '$lib/stores/trips.js';
  import { STOPS, getStop, getStopsByIds, stopImageUrl, stopGuideUrl } from '$lib/data/stops.js';
  import { listBookings } from '$lib/stores/bookings.js';
  import { listPackingItems } from '$lib/stores/packing.js';
  import { todayLocalISO, formatTripDate } from '$lib/data/schedule.js';

  let showNewModal = false;
  /* The trips store populates from Dexie on first paint. We wait
     a short beat before deciding whether to mount the onboarding
     overlay so returning users (who have trips but the store
     hasn't filled yet) don't see it flash up and then disappear. */
  let onboardingReady = false;
  onMount(() => {
    const t = setTimeout(() => (onboardingReady = true), 220);
    return () => clearTimeout(t);
  });

  /* Stable per-card rotation so trips always sit at the same angle
     regardless of how many other trips share the platform. Cycle
     through six values keyed by index. */
  const tilts = [-3, 0, 4, -2, 3, -4];
  const offsets = [8, -6, 10, 4, -4, 6];

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
        return [t.id, {
          planCount: bookings.length,
          pendingPlans,
          packTotal: packing.length,
          packDone: packedCount
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

    if (days != null && days < 0) return 'View the recap';
    if (days === 0) return 'All aboard today';
    if (days === 1) return 'Boarding tomorrow';

    if (stopCount === 0) return 'Pick your first stops';
    if ((stats.planCount || 0) === 0) return 'Drop your first plan';
    if ((stats.pendingPlans || 0) > 0) {
      return `${stats.pendingPlans} plan${stats.pendingPlans === 1 ? '' : 's'} still to book`;
    }
    if ((stats.packTotal || 0) === 0) return 'Pack the camera';
    if ((stats.packDone || 0) < (stats.packTotal || 0)) {
      return `${stats.packTotal - stats.packDone} item${stats.packTotal - stats.packDone === 1 ? '' : 's'} left to pack`;
    }
    return 'All packed, ready to roll';
  }

  function daysUntilDate(yyyymmdd) {
    if (!yyyymmdd) return null;
    const today = todayLocalISO();
    const a = new Date(today);
    const b = new Date(yyyymmdd);
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  /* First stop's hero photo, surfaced as a small tucked polaroid on
     the suitcase card. Returns null when the trip has no stops yet
     so the empty-state card can skip the polaroid entirely. */
  function firstStopThumb(trip) {
    const stops = getStopsByIds(trip.stopIds || []);
    if (stops.length === 0) return null;
    return { name: stops[0].name, url: stopImageUrl(stops[0]) };
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
    content="Pack your Northlander train trip into one suitcase. Route, stops, packing list, bookings and itinerary, available offline."
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
          The Northlander runs north from Toronto Union to Cochrane through some of the prettiest country in Ontario. Tag a suitcase, choose a few stops, and start planning where you'll eat, sleep, and watch the lakes appear.
        {:else if $trips.length === 1}
          One suitcase already packed and waiting. Open it to keep building, or start another adventure.
        {:else}
          {$trips.length} suitcases on the platform. Tap one to keep building, or tag a fresh trip from Toronto Union.
        {/if}
      </p>
      <div class="dash-actions">
        <button
          type="button"
          class="btn-primary dash-cta"
          on:click={() => (showNewModal = true)}
        >
          {$trips.length === 0 ? 'Start your first trip' : '+ Tag a new suitcase'}
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

<!-- ===== Trip platform =====
     Staged like an actual station: an enamel platform sign + a small
     departure-board plaque sit above a wood-floor platform with brass
     rail and warm gas-lamp vignette. Each trip card is the user's
     luggage waiting on that platform - tucked polaroid from the
     first stop, packing-progress ring on the tag, and an italic
     "next move" line that coaches the user toward their next action. -->
<section class="dash-platform-wrap">
  <div class="dash-stationhead">
    <div class="stationhead-sign">
      <span class="stationhead-rivet" aria-hidden="true"></span>
      <span class="stationhead-rivet stationhead-rivet--r" aria-hidden="true"></span>
      <div class="stationhead-text">
        <span class="stationhead-kicker">Platform 1  ·  Now Boarding</span>
        <h2 class="stationhead-title">
          {#if $trips.length === 0}
            An empty platform
          {:else if $trips.length === 1}
            One suitcase on the platform
          {:else}
            {$trips.length} suitcases on the platform
          {/if}
        </h2>
      </div>
    </div>

    {#if $trips.length > 0}
      <aside class="dash-board" aria-label="Departure board">
        <span class="dash-board-kicker">Next Departure</span>
        {#if nextDeparture}
          <strong class="dash-board-name">{nextDeparture.trip.name}</strong>
          <span class="dash-board-when">{nextDeparture.when}  ·  {nextDeparture.dateLabel}</span>
        {:else}
          <strong class="dash-board-name dash-board-name--quiet">Mid-day lull</strong>
          <span class="dash-board-when">No dates set  ·  The platform is yours</span>
        {/if}
      </aside>
    {/if}
  </div>

  <div class="dash-platform">
    <div class="dash-platform-glow" aria-hidden="true"></div>
    <div class="dash-platform-inner">
      {#if $trips.length === 0}
        <!-- Empty-state vignette: one big invitation luggage card with a
             tucked Toronto Union polaroid so even an empty platform
             carries the brand. -->
        {@const heroStop = STOPS.find((s) => s.id === 'union')}
        <div class="dash-empty">
          <button
            type="button"
            class="trunk trunk-empty"
            on:click={() => (showNewModal = true)}
            aria-label="Start your first trip"
          >
            {#if heroStop}
              <figure class="trunk-polaroid trunk-polaroid--empty" aria-hidden="true">
                <img src={stopImageUrl(heroStop)} alt="" loading="lazy" decoding="async" />
                <figcaption>{heroStop.name}</figcaption>
              </figure>
            {/if}
            <div class="trunk-svg trunk-svg--empty">
              <svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg" class="block w-full h-auto" aria-hidden="true">
                <ellipse cx="100" cy="146" rx="62" ry="6" fill="rgba(40,20,5,0.22)" />
                <rect x="22" y="30" width="156" height="108" rx="10" fill="#fbf6ea" stroke="#7d3a1e" stroke-width="2.5" stroke-dasharray="6 5"/>
                <text x="100" y="105" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="64" text-anchor="middle" fill="#7d3a1e">+</text>
              </svg>
            </div>
            <div class="trunk-tag trunk-tag--empty">
              <span class="trunk-tag-kicker">Welcome aboard</span>
              <strong class="trunk-tag-name">Tag your first suitcase</strong>
              <span class="trunk-tag-route">Pick a name, pick a colour</span>
              <span class="trunk-next">Free, no credit card</span>
            </div>
          </button>
        </div>
      {:else}
        <div class="trip-grid">
          {#each $trips as trip, i (trip.id)}
            {@const stopCount = (trip.stopIds || []).length}
            {@const railCap = 6}
            {@const railStops = (trip.stopIds || []).slice(0, railCap)}
            {@const railOverflow = Math.max(0, stopCount - railCap)}
            {@const hasRail = stopCount >= 2}
            {@const thumb = firstStopThumb(trip)}
            {@const prog = packFraction(trip)}
            <a
              href={`/trips/${trip.id}`}
              class="trunk relative block no-underline text-left group"
              style="--rot:{tilts[i % tilts.length]}deg; --y:{offsets[i % offsets.length]}px"
            >
              {#if thumb}
                <figure class="trunk-polaroid" aria-hidden="true">
                  <img src={thumb.url} alt="" loading="lazy" decoding="async" />
                  <figcaption>{thumb.name}</figcaption>
                </figure>
              {/if}

              <div class="trunk-svg">
                <Suitcase color={trip.color} strap={trip.strap} label="" />
              </div>

              <div class="trunk-tag">
                {#if prog != null}
                  <!-- Packing-progress arc on the tag corner. Faded
                       dashed gold ring + solid amber arc filling
                       clockwise from 12 o'clock. -->
                  <span class="trunk-prog" aria-label={`${tripStats[trip.id]?.packDone || 0} of ${tripStats[trip.id]?.packTotal || 0} packed`}>
                    <svg viewBox="0 0 36 36" aria-hidden="true">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a84c" stroke-width="2" stroke-dasharray="2 3" opacity="0.3"/>
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#c9a84c" stroke-width="2.6" stroke-linecap="round"
                              pathLength="100"
                              stroke-dasharray="{(prog * 100).toFixed(1)} 100"
                              transform="rotate(-90 18 18)"/>
                    </svg>
                    <span class="trunk-prog-num">{Math.round(prog * 100)}</span>
                  </span>
                {/if}

                <span class="trunk-tag-kicker">Trip</span>
                <strong class="trunk-tag-name">{trip.name}</strong>
                <span class="trunk-tag-route">{summarize(trip.stopIds)}</span>

                {#if hasRail}
                  <div class="trunk-rail" aria-hidden="true">
                    <span class="rail-badge" title={trip.direction === 'southbound' ? 'Southbound' : 'Northbound'}>
                      {trip.direction === 'southbound' ? 'S' : 'N'}
                    </span>
                    {#each railStops as _, ri}
                      <span class="rail-seg"></span>
                      <span class="rail-dot">{ri + 1}</span>
                    {/each}
                    <span class="rail-seg"></span>
                    {#if railOverflow > 0}
                      <span class="rail-more">+{railOverflow}</span>
                    {/if}
                  </div>
                {:else}
                  <div class="trunk-divider"></div>
                {/if}

                <div class="trunk-stub">
                  {#if trip.departureDate}
                    <span>{countdownLabel(trip.departureDate)}</span>
                    <span class="trunk-stub-sep">&middot;</span>
                  {/if}
                  <span>{(tripStats[trip.id]?.planCount || 0)} {(tripStats[trip.id]?.planCount || 0) === 1 ? 'plan' : 'plans'}</span>
                </div>

                <span class="trunk-next">{nextMove(trip)}</span>
              </div>
            </a>
          {/each}

          <!-- New Trip slot at the end -->
          <button
            type="button"
            class="trunk trunk-empty"
            on:click={() => (showNewModal = true)}
            aria-label="Tag a new trip"
          >
            <div class="trunk-svg trunk-svg--empty">
              <svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg" class="block w-full h-auto" aria-hidden="true">
                <ellipse cx="100" cy="146" rx="62" ry="6" fill="rgba(40,20,5,0.22)" />
                <rect x="22" y="30" width="156" height="108" rx="10" fill="#fbf6ea" stroke="#7d3a1e" stroke-width="2.5" stroke-dasharray="6 5"/>
                <text x="100" y="105" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="56" text-anchor="middle" fill="#7d3a1e">+</text>
              </svg>
            </div>
            <div class="trunk-tag trunk-tag--empty">
              <span class="trunk-tag-kicker">Open</span>
              <strong class="trunk-tag-name">Start packing</strong>
              <span class="trunk-tag-route">A fresh suitcase</span>
              <span class="trunk-next">An empty space on the platform</span>
            </div>
          </button>
        </div>
      {/if}
    </div>

    <div class="dash-platform-rail" aria-hidden="true"></div>
    <div class="dash-platform-floor" aria-hidden="true"></div>
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

{#if showNewModal}
  <NewTripModal on:close={() => (showNewModal = false)} />
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
    font-size: clamp(2.6rem, 7vw, 5rem);
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
    background: #c4860f;
    color: #0a2d21;
    border-color: #c4860f;
    font-weight: 700;
    padding: 0.95rem 1.6rem;
    box-shadow: 0 10px 22px rgba(196, 134, 15, 0.35);
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
    transform: rotate(var(--rot, 0deg)) translateY(var(--lift, 0px));
    transition: transform 0.35s cubic-bezier(.2,.7,.3,1);
  }
  .dash-polaroid:hover {
    transform: rotate(0deg) translateY(-8px);
    z-index: 4;
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

  /* ===== Platform =====
     Restaged as a vintage station: enamel sign + small departure
     plaque sit above a warm wood-floor platform with a brass rail
     and gas-lamp vignette. */
  .dash-platform-wrap {
    padding: 40px 0 0;
  }

  /* Station head: enamel-style platform sign + departure plaque.
     Cream porcelain look with double border and two rivets to read
     as a real metal sign. */
  .dash-stationhead {
    max-width: 1080px;
    margin: 0 auto;
    padding: 0 24px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
  }
  .stationhead-sign {
    position: relative;
    background: #f3ece0;
    border: 2px solid #0a2d21;
    box-shadow: inset 0 0 0 4px #fbf6ea, 0 8px 18px rgba(10, 30, 20, 0.18);
    padding: 12px 28px 12px 28px;
    min-width: 240px;
  }
  .stationhead-rivet {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #f3ece0 0%, #8b6a3a 70%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .stationhead-rivet--r { left: auto; right: 8px; }
  .stationhead-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: flex-start;
  }
  .stationhead-kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    font-weight: 800;
    color: #7d3a1e;
  }
  .stationhead-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(1.6rem, 3.2vw, 2.2rem);
    line-height: 1.05;
    color: #0a2d21;
    margin: 0;
  }

  /* Departure-board plaque on the right of the section head. Forest
     wood-look background with brass border + gold serif text so it
     reads as a station's brass departures sign. */
  .dash-board {
    background:
      linear-gradient(180deg, #0a2d21 0%, #06231a 100%);
    border: 2px solid #c9a84c;
    box-shadow:
      inset 0 0 0 3px #0a2d21,
      0 10px 20px rgba(10, 30, 20, 0.28);
    padding: 10px 16px 12px;
    color: #f5f0e8;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 220px;
    max-width: 340px;
  }
  .dash-board-kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    font-weight: 800;
    color: #c9a84c;
  }
  .dash-board-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 1.05rem;
    line-height: 1.15;
    color: #f5f0e8;
  }
  .dash-board-name--quiet {
    font-style: italic;
    color: #c4860f;
  }
  .dash-board-when {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    color: #d6c2a0;
    letter-spacing: 0.04em;
  }

  .dash-platform {
    position: relative;
    /* Warm sepia sky above + wood undertone fading in toward the
       floor. The vertical gradient does the heavy lifting; the
       diagonal hatch is a subtle paper-grain echo from the rest
       of the design. */
    background:
      linear-gradient(180deg, #ede0cc 0%, #d8c39b 70%, #b89265 100%);
    background-image:
      repeating-linear-gradient(45deg, rgba(45, 30, 20, 0.05) 0, rgba(45, 30, 20, 0.05) 1px, transparent 1px, transparent 9px);
    border-top: 3px solid #0a2d21;
    border-bottom: 3px solid #0a2d21;
    margin-top: 18px;
    overflow: hidden;
  }
  /* Warm gas-lamp glow at the top corners + a center floor halo. */
  .dash-platform-glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background:
      radial-gradient(ellipse 600px 240px at 8% -10%, rgba(255, 204, 102, 0.22), transparent 60%),
      radial-gradient(ellipse 600px 240px at 92% -10%, rgba(255, 204, 102, 0.22), transparent 60%),
      radial-gradient(ellipse 700px 200px at 50% 100%, rgba(196, 134, 15, 0.18), transparent 70%),
      radial-gradient(ellipse at center, transparent 35%, rgba(40, 25, 10, 0.18) 100%);
  }
  /* Brass rail strip sitting on top of the wooden floor. */
  .dash-platform-rail {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 60px;
    height: 3px;
    z-index: 2;
    background: linear-gradient(180deg, #c9a84c 0%, #8a6c1c 100%);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.18), 0 -1px 0 rgba(0, 0, 0, 0.25);
  }
  /* Wood-plank floor with varying plank widths so the perspective
     reads a little more handmade. Darker plank lines mid + thinner
     accents in between. */
  .dash-platform-floor {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 60px;
    z-index: 1;
    background:
      linear-gradient(180deg, #6b4528 0%, #3f2814 100%),
      repeating-linear-gradient(90deg,
        #6b4528 0 96px,
        #5a3920 96px 98px,
        #6b4528 98px 156px,
        #4a3018 156px 158px,
        #6b4528 158px 220px);
    background-blend-mode: multiply;
    box-shadow: inset 0 8px 14px rgba(0, 0, 0, 0.35);
  }
  .dash-platform-inner {
    position: relative;
    z-index: 3;
    max-width: 1080px;
    margin: 0 auto;
    padding: 56px 24px 96px;
  }

  .dash-empty {
    display: flex;
    justify-content: center;
  }

  .trip-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 36px 32px;
    align-items: end;
  }
  @media (min-width: 540px) {
    .trip-grid { grid-template-columns: 1fr 1fr; }
  }
  @media (min-width: 920px) {
    .trip-grid { grid-template-columns: 1fr 1fr 1fr 1fr; }
  }

  /* Card / luggage. Tilt + lift driven by inline CSS vars per index,
     so the row reads as scattered luggage rather than a neat grid. */
  .trunk {
    position: relative;
    transform: rotate(var(--rot, 0deg)) translateY(var(--y, 0px));
    text-decoration: none;
    color: inherit;
  }
  .trunk-empty {
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
    text-align: left;
    color: inherit;
    font: inherit;
    width: 100%;
  }

  /* Tucked polaroid: peeks out from the top-left of the suitcase so
     each card carries a real photo from the trip's first stop.
     Slight tilt makes it feel like a memento clipped under the
     luggage strap. */
  .trunk-polaroid {
    position: absolute;
    top: -14px;
    left: -10px;
    z-index: 0;
    width: 78px;
    background: #fbf6ea;
    padding: 5px 5px 12px;
    box-shadow: 0 10px 20px rgba(20, 14, 6, 0.45);
    transform: rotate(-9deg);
    transition: transform 0.3s ease;
    margin: 0;
  }
  .trunk-polaroid img {
    display: block;
    width: 100%;
    height: 56px;
    object-fit: cover;
  }
  .trunk-polaroid figcaption {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 9px;
    color: #0a2d21;
    text-align: center;
    margin-top: 3px;
    letter-spacing: 0.02em;
  }
  .trunk:hover .trunk-polaroid {
    transform: rotate(-4deg) translateY(-3px);
  }
  /* Empty-state polaroid sits a little bigger and more centered. */
  .trunk-polaroid--empty {
    top: -18px;
    left: -14px;
    width: 96px;
  }
  .trunk-polaroid--empty img { height: 68px; }

  .trunk-svg {
    position: relative;
    z-index: 1;
    transition: transform 0.25s ease;
    filter: drop-shadow(0 12px 18px rgba(10, 20, 5, 0.45));
  }
  .trunk-svg--empty { opacity: 0.92; }
  .trunk:hover .trunk-svg {
    transform: translateY(-4px);
  }

  /* Luggage tag. Sits below the suitcase, ticket-paper feel, slight
     tilt so it doesn't read as a database row. The packing-progress
     ring lives in the top-right corner as a real luggage sticker. */
  .trunk-tag {
    position: relative;
    z-index: 2;
    margin: -12px auto 0;
    max-width: 220px;
    background: #e8d6a8;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 9px 12px 10px;
    box-shadow: 0 8px 14px rgba(40, 20, 5, 0.32);
    transform: rotate(-2deg);
    transition: transform 0.2s ease;
    text-align: left;
  }
  .trunk:hover .trunk-tag {
    transform: rotate(0deg) translateY(-2px);
  }
  .trunk-tag--empty { background: #f3ece0; }
  .trunk-tag-kicker {
    display: block;
    font-family: 'Spline Sans', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 9px;
    font-weight: 700;
    color: #7d3a1e;
  }
  .trunk-tag-name {
    display: block;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    color: #0a2d21;
    font-size: 1rem;
    line-height: 1.15;
  }
  .trunk-tag-route {
    display: block;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 11.5px;
    color: #6d5a36;
    margin-top: 2px;
  }

  .trunk-prog {
    position: absolute;
    top: -10px;
    right: -10px;
    width: 36px;
    height: 36px;
    background: #fbf6ea;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(40, 20, 5, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .trunk-prog svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .trunk-prog-num {
    position: relative;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 10.5px;
    color: #7d3a1e;
    line-height: 1;
  }
  .trunk-prog-num::after {
    content: '%';
    font-size: 6.5px;
    margin-left: 0.5px;
    vertical-align: top;
    font-weight: 700;
  }

  .trunk-stub {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #7d3a1e;
  }
  .trunk-stub-sep { color: rgba(139, 106, 58, 0.55); }

  /* Italic Fraunces "next move" coaching line at the bottom of the
     tag. Reads the trip's state and tells the user the next concrete
     action so the card feels alive rather than static. */
  .trunk-next {
    display: block;
    text-align: center;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px dashed rgba(125, 58, 30, 0.35);
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12.5px;
    color: #7d3a1e;
    line-height: 1.2;
  }

  /* ===== Mini route rail on suitcase tags =====
     Numbered dots on a dashed gold line for 2+ stop trips, plain
     dashed rule for the rest. Mirrors the RouteMap pin identity
     (dark forest circle + gold inset halo + gold number) so the
     dashboard and the trip page read as one publication. */
  .trunk-rail {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-top: 8px;
    margin-bottom: 6px;
  }
  .rail-dot {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #0a2d21;
    color: #c9a84c;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 9px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 0 0 1.3px #c9a84c;
  }
  /* Direction stamp at the head of the rail. Rust pill with cream
     letter so it reads as a stationmaster's signpost and visually
     separates from the forest+gold numbered dots. */
  .rail-badge {
    flex: 0 0 auto;
    min-width: 16px;
    height: 14px;
    border-radius: 999px;
    background: #7d3a1e;
    color: #f3ece0;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-weight: 800;
    font-size: 9px;
    letter-spacing: 0.04em;
    line-height: 1;
    padding: 0 5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .rail-seg {
    flex: 1 1 auto;
    min-width: 4px;
    height: 0;
    border-top: 1.5px dashed rgba(196, 134, 15, 0.75);
  }
  .rail-more {
    flex: 0 0 auto;
    font-family: 'Spline Sans', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #7d3a1e;
    padding-left: 4px;
  }
  /* Plain dashed rule fallback for trips with 0 or 1 stops -
     keeps the visual separation between the route line and the
     countdown stub. */
  .trunk-divider {
    margin-top: 8px;
    margin-bottom: 6px;
    border-top: 1px dashed rgba(139, 106, 58, 0.4);
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
</style>
