<script>
  import Suitcase from '$lib/components/Suitcase.svelte';
  import NewTripModal from '$lib/components/NewTripModal.svelte';
  import { trips } from '$lib/stores/trips.js';
  import { STOPS, getStopsByIds, stopImageUrl, stopGuideUrl } from '$lib/data/stops.js';
  import { listBookings } from '$lib/stores/bookings.js';
  import { todayLocalISO } from '$lib/data/schedule.js';

  let showNewModal = false;

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

  /* Plans-per-trip map for the dashed stub on each suitcase tag.
     Reloaded reactively whenever the trips list changes (add, delete,
     rename, etc.) so the dashboard never lies about counts. */
  let planCounts = {};

  async function loadPlanCounts(list) {
    if (!Array.isArray(list) || list.length === 0) {
      planCounts = {};
      return;
    }
    const entries = await Promise.all(
      list.map(async (t) => {
        const rows = await listBookings(t.id);
        return [t.id, rows.length];
      })
    );
    planCounts = Object.fromEntries(entries);
  }

  $: loadPlanCounts($trips);

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

  /* Pick five stops with strong hero photos for the collage. Spaced
     out along the route so the user sees south-to-north variety. */
  const COLLAGE_STOP_IDS = ['union', 'bracebridge', 'huntsville', 'temagami', 'cochrane'];
  $: collageStops = COLLAGE_STOP_IDS
    .map((id) => STOPS.find((s) => s.id === id))
    .filter(Boolean)
    .map((s, i) => ({
      stop: s,
      tilt: ((i % 5) - 2) * 4,
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
        <a href="https://northlanderguide.com" target="_blank" rel="noopener" class="dash-guide-link">
          Browse the Guide  &rarr;
        </a>
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

<!-- ===== Trip platform ===== -->
<section class="dash-platform-wrap">
  <div class="dash-section-head">
    <div class="kicker">Your Suitcases</div>
    <h2>Trips you're packing</h2>
  </div>

  <div class="dash-platform">
    <div class="dash-platform-floor" aria-hidden="true"></div>

    <div class="dash-platform-inner">
      {#if $trips.length === 0}
        <!-- Welcoming empty state. One big invitation card. -->
        <div class="dash-empty">
          <button
            type="button"
            class="trunk-new bg-transparent border-0 cursor-pointer text-center p-0 group"
            on:click={() => (showNewModal = true)}
            aria-label="Start your first trip"
          >
            <div class="aspect-[10/8] flex items-center justify-center rounded-xl border-[2.5px] border-dashed border-forest bg-cream/60 transition-colors group-hover:bg-cream group-hover:border-rust">
              <div class="text-center px-4">
                <div class="font-serif font-black text-forest text-[56px] leading-none mb-3">+</div>
                <div class="font-serif italic text-rust text-lg">Tag your first suitcase</div>
              </div>
            </div>
            <div class="trunk-tag mt-3 mx-auto bg-[#e8d6a8] border border-[#8b6a3a] rounded px-3 py-2 shadow-tag max-w-[220px]">
              <span class="block uppercase tracking-[0.2em] text-[9px] font-bold text-rust">Welcome aboard</span>
              <strong class="block font-serif font-bold text-forest text-base leading-tight">Pick a name, pick a colour</strong>
              <span class="block font-serif italic text-muted text-xs mt-1">Free, no credit card</span>
            </div>
          </button>
        </div>
      {:else}
        <div class="trip-grid">
          {#each $trips as trip, i (trip.id)}
            <a
              href={`/trips/${trip.id}`}
              class="trunk relative block no-underline text-left group"
              style="--rot:{tilts[i % tilts.length]}deg; --y:{offsets[i % offsets.length]}px"
            >
              <div class="trunk-svg">
                <Suitcase color={trip.color} strap={trip.strap} label="" />
              </div>
              <div class="trunk-tag mt-[-12px] mx-auto bg-[#e8d6a8] border border-[#8b6a3a] rounded px-3 py-2 shadow-tag relative z-10 max-w-[200px]">
                <span class="block uppercase tracking-[0.2em] text-[9px] font-bold text-rust">Trip</span>
                <strong class="block font-serif font-bold text-forest text-base leading-tight">{trip.name}</strong>
                <span class="block font-serif italic text-muted text-xs mt-1">{summarize(trip.stopIds)}</span>
                <!-- Dashed stub: countdown + plans glance. Lets the user
                     read the platform grid without opening each trip. -->
                <div class="trunk-stub mt-1.5 pt-1.5 border-t border-dashed border-[#8b6a3a]/40 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-rust">
                  {#if trip.departureDate}
                    <span>{countdownLabel(trip.departureDate)}</span>
                    <span class="text-[#8b6a3a]/55">&middot;</span>
                  {/if}
                  {#if planCounts[trip.id]}
                    <span>{planCounts[trip.id]} {planCounts[trip.id] === 1 ? 'plan' : 'plans'}</span>
                  {:else}
                    <span class="italic font-serif normal-case tracking-normal text-muted/80">Nothing booked yet</span>
                  {/if}
                </div>
              </div>
            </a>
          {/each}

          <!-- New Trip slot at the end -->
          <button
            type="button"
            class="trunk-new bg-transparent border-0 cursor-pointer text-center p-0 group"
            on:click={() => (showNewModal = true)}
            aria-label="Tag a new trip"
          >
            <div class="aspect-[10/8] flex items-center justify-center rounded-xl border-[2.5px] border-dashed border-forest bg-cream/40 transition-colors group-hover:bg-cream group-hover:border-rust">
              <div class="text-center">
                <div class="font-serif font-black text-forest text-[44px] leading-none mb-2">+</div>
                <div class="font-serif italic text-rust text-base">New trip</div>
              </div>
            </div>
            <div class="trunk-tag mt-3 mx-auto bg-[#e8d6a8] border border-[#8b6a3a] rounded px-3 py-2 shadow-tag max-w-[180px]">
              <span class="block uppercase tracking-[0.2em] text-[9px] font-bold text-rust">Open</span>
              <strong class="block font-serif font-bold text-forest text-base leading-tight">Start packing</strong>
              <span class="block font-serif italic text-muted text-xs mt-1">Free, no credit card</span>
            </div>
          </button>
        </div>
      {/if}
    </div>
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

    <ul class="stop-grid">
      {#each STOPS as stop, i}
        <li>
          <a
            href={stopGuideUrl(stop)}
            target="_blank"
            rel="noopener"
            class="stop-tile"
          >
            <span class="stop-num">{i + 1}</span>
            <img src={stopImageUrl(stop)} alt={stop.name} loading="lazy" decoding="async" />
            <div class="stop-tile-body">
              <strong>{stop.name}</strong>
              <span>{stop.region}</span>
            </div>
          </a>
        </li>
      {/each}
    </ul>
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
  .dash-guide-link {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #c9a84c;
    text-decoration: none;
    font-size: 1rem;
  }
  .dash-guide-link:hover {
    color: #f5f0e8;
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

  /* ===== Platform ===== */
  .dash-platform-wrap {
    padding: 40px 0 0;
  }
  .dash-platform {
    position: relative;
    background:
      linear-gradient(180deg, #ede0cc 0%, #e3d2b3 100%);
    background-image:
      repeating-linear-gradient(45deg, rgba(45, 30, 20, 0.05) 0, rgba(45, 30, 20, 0.05) 1px, transparent 1px, transparent 9px);
    border-top: 3px solid #0a2d21;
    border-bottom: 3px solid #0a2d21;
    margin-top: 14px;
    overflow: hidden;
  }
  .dash-platform-floor {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 36px;
    border-top: 2px solid #5a3920;
    background-image: repeating-linear-gradient(90deg, #6b4528 0 90px, #5a3920 90px 91px, #6b4528 91px 180px);
  }
  .dash-platform-inner {
    position: relative;
    z-index: 2;
    max-width: 1080px;
    margin: 0 auto;
    padding: 48px 24px 80px;
  }

  .dash-empty {
    display: flex;
    justify-content: center;
  }

  .trip-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 32px;
    align-items: end;
  }
  @media (min-width: 540px) {
    .trip-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (min-width: 920px) {
    .trip-grid {
      grid-template-columns: 1fr 1fr 1fr 1fr;
    }
  }

  /* Trunk rotation/offset driven by inline CSS variables. */
  .trunk {
    transform: rotate(var(--rot, 0deg)) translateY(var(--y, 0px));
  }
  .trunk-tag {
    transform: rotate(-2deg);
    transition: transform 0.2s ease;
  }
  .trunk:hover .trunk-tag {
    transform: rotate(0deg) translateY(-2px);
  }
  .trunk-svg {
    transition: transform 0.25s ease;
    filter: drop-shadow(0 8px 14px rgba(40, 20, 5, 0.32));
  }
  .trunk:hover .trunk-svg {
    transform: translateY(-4px);
  }

  /* ===== Inspiration grid ===== */
  .dash-inspire {
    background: #fbf6ea;
    padding: 64px 0;
  }
  .dash-inspire-inner {
    max-width: 1180px;
    margin: 0 auto;
  }
  .stop-grid {
    list-style: none;
    padding: 0 24px;
    margin: 24px 0 0;
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }
  .stop-tile {
    position: relative;
    display: block;
    aspect-ratio: 5 / 6;
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    border: 2px solid #0a2d21;
    box-shadow: 0 6px 18px rgba(40, 30, 20, 0.18);
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .stop-tile:hover {
    transform: translateY(-4px);
    border-color: #c4860f;
    box-shadow: 0 12px 24px rgba(40, 30, 20, 0.28);
  }
  .stop-tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.4s ease;
  }
  .stop-tile:hover img {
    transform: scale(1.08);
  }
  .stop-tile-body {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 24px 12px 12px;
    background: linear-gradient(180deg, transparent, rgba(10, 30, 20, 0.88));
    color: #f5f0e8;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .stop-tile-body strong {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 17px;
    line-height: 1.1;
  }
  .stop-tile-body span {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #c4860f;
    font-weight: 700;
    margin-top: 2px;
  }
  .stop-num {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 2;
    background: #0a2d21;
    color: #c9a84c;
    border: 2px solid #c9a84c;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 14px;
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
