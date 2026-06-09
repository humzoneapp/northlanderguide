<script>
  /* ==================================================================
     First-launch onboarding overlay.

     Renders a four-card carousel on top of the dashboard the first
     time a visitor lands on the App. The cards explain the app's
     metaphor in vintage poster vocabulary - what the train is,
     what a suitcase represents, what filling a trip looks like,
     and that the whole thing works offline once packed.

     Dismiss is per-device: a single localStorage flag, so coming
     back on the same browser will not re-trigger the overlay.
     Clearing site data resets it for that browser.

     The final card's primary action emits 'start' to the parent so
     the dashboard can open NewTripModal directly without the user
     ever seeing the empty platform - the smoothest possible
     hand-off from "what is this?" to "here's my suitcase".
     ================================================================== */

  import { createEventDispatcher, onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { STOPS, stopImageUrl } from '$lib/data/stops.js';

  /* Bumped to v2 on 2026-06-08 when the onboarding cards were
     rewritten around the app's actual capabilities (train data +
     weather + per-stop drawers + offline / private / shareable).
     Existing visitors see the refreshed tour once on their next
     load; subsequent loads stay dismissed. */
  const KEY = 'northlander.onboarded.v2';

  const dispatch = createEventDispatcher();

  let mounted = false;
  let visible = false;
  let step = 0;

  /* Four stops with strong hero photos for the Card 1 collage. */
  const COLLAGE_STOPS = ['bracebridge', 'huntsville', 'temagami', 'cochrane'];

  $: collagePhotos = COLLAGE_STOPS
    .map((id) => STOPS.find((s) => s.id === id))
    .filter(Boolean)
    .map((s, i) => ({
      src: stopImageUrl(s),
      name: s.name,
      tilt: ((i % 4) - 1.5) * 5
    }));

  /* Onboarding cards lean into BENEFITS, not steps. Each card
     teases a capability so a first-time visitor sees what the app
     unlocks before they're asked to invest a single tap. */
  const cards = [
    {
      kicker: 'Welcome aboard',
      title: 'Plan a Northern Ontario train trip.',
      body: "From the morning you board to the last photo at Cochrane - your route, your packing, your plans, your photos, your day-by-day all live in one place.",
      cta: "Show me what's inside"
    },
    {
      kicker: 'Built on real data',
      title: 'Real train times. Live weather. Day by day.',
      body: "The app threads in the actual Ontario Northland schedule, fetches the forecast for every stop on your route, and even suggests rain gear when the weather calls for it. You plan a trip that knows where it's going.",
      cta: 'Next'
    },
    {
      kicker: 'Carry it all',
      title: 'Bookings, polaroids, diary, spending, events.',
      body: "Every stop becomes its own chapter. Pin a dinner reservation, snap a polaroid from the platform, jot a note, log a coffee spend, drop in a local event. Build a keepsake while you travel.",
      cta: 'Next'
    },
    {
      kicker: "It's yours",
      title: 'Free. Offline. No accounts.',
      body: "Everything you save lives on this device. Works offline on the train. Download a backup any time. Share a trip with a friend with one link or a QR code. No login. No credit card. No catch.",
      cta: 'Start my first trip'
    }
  ];

  onMount(() => {
    /* Skip if the user has already been through this on this
       browser. Wrapped in try/catch so private-mode storage
       errors don't crash the dashboard - we just keep the
       overlay hidden as if it was dismissed. */
    let onboarded = false;
    try {
      onboarded = localStorage.getItem(KEY) === 'true';
    } catch (e) { onboarded = true; /* fail closed */ }
    mounted = true;
    if (!onboarded) {
      visible = true;
    }
  });

  function persistDismiss() {
    try { localStorage.setItem(KEY, 'true'); } catch (e) { /* ignore */ }
  }

  function skip() {
    persistDismiss();
    visible = false;
    dispatch('close');
  }

  function next() {
    if (step < cards.length - 1) {
      step += 1;
    } else {
      finish();
    }
  }

  function back() {
    if (step > 0) step -= 1;
  }

  function finish() {
    persistDismiss();
    visible = false;
    dispatch('start');
  }

  function onKey(e) {
    if (!visible) return;
    if (e.key === 'Escape') skip();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') back();
  }
</script>

<svelte:window on:keydown={onKey} />

{#if mounted && visible}
  <div class="ob-overlay" role="dialog" aria-modal="true" aria-labelledby="ob-title" transition:fade={{ duration: 200 }}>
    <button
      type="button"
      class="ob-backdrop"
      on:click={skip}
      aria-label="Skip the tour"
    ></button>

    <div class="ob-card" in:fly={{ y: 30, duration: 280 }} out:fade={{ duration: 160 }}>
      <header class="ob-head">
        <div class="ob-head-text">
          <span class="ob-kicker">{cards[step].kicker}</span>
          <h2 id="ob-title" class="ob-title">{cards[step].title}</h2>
        </div>
        <button
          type="button"
          class="ob-skip"
          on:click={skip}
          aria-label="Skip the tour"
        >Skip the tour</button>
      </header>

      <div class="ob-stage" aria-hidden="true">
        {#if step === 0}
          <!-- Polaroid collage of route highlights -->
          <div class="ob-collage">
            {#each collagePhotos as p, i}
              <figure class="ob-polaroid" style="--rot:{p.tilt}deg;--i:{i}">
                <img src={p.src} alt="" loading="lazy" />
                <figcaption>{p.name}</figcaption>
              </figure>
            {/each}
          </div>
        {:else if step === 1}
          <!-- Train + weather + day icons so the user can see the
               trio of real-data features the card promises. -->
          <div class="ob-trio">
            <div class="ob-trio-tile">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="6" y="5" width="20" height="18" rx="4"/>
                <path d="M6 14 L26 14"/>
                <circle cx="11" cy="26" r="1.8"/>
                <circle cx="21" cy="26" r="1.8"/>
                <path d="M9 22 L9 25 M23 22 L23 25"/>
              </svg>
              <span>Train times</span>
            </div>
            <div class="ob-trio-tile">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="13" r="4"/>
                <line x1="11" y1="3" x2="11" y2="6"/>
                <line x1="3" y1="13" x2="6" y2="13"/>
                <line x1="5" y1="7" x2="7" y2="9"/>
                <path d="M13 24 a6 6 0 1 1 9 -4 a4 4 0 0 1 4 4 H11 a4 4 0 0 1 2 0 Z"/>
              </svg>
              <span>Forecast</span>
            </div>
            <div class="ob-trio-tile">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M16 3 C10 3 5 8 5 14 c0 8 11 16 11 16 s11 -8 11 -16 c0 -6 -5 -11 -11 -11 Z"/>
                <circle cx="16" cy="14" r="4"/>
              </svg>
              <span>Map</span>
            </div>
          </div>
        {:else if step === 2}
          <!-- Stack of chapter "drawer" pills - shows the per-stop
               sections the user actually gets at every stop:
               Bookings / Diary / Polaroids / Spending / Events. -->
          <div class="ob-drawers">
            <div class="ob-drawer">
              <span class="ob-drawer-kicker">Plans</span>
              <span class="ob-drawer-arrow">&rsaquo;</span>
            </div>
            <div class="ob-drawer">
              <span class="ob-drawer-kicker">Travel Diary</span>
              <span class="ob-drawer-arrow">&rsaquo;</span>
            </div>
            <div class="ob-drawer">
              <span class="ob-drawer-kicker">Polaroids</span>
              <span class="ob-drawer-arrow">&rsaquo;</span>
            </div>
            <div class="ob-drawer">
              <span class="ob-drawer-kicker">Spending</span>
              <span class="ob-drawer-arrow">&rsaquo;</span>
            </div>
          </div>
        {:else}
          <!-- Offline + lock + share trio = "your trip, on your
               device, only you control how it travels". -->
          <div class="ob-offline-trio">
            <div class="ob-offline-tile">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="8" y="4" width="16" height="24" rx="3"/>
                <line x1="8" y1="24" x2="24" y2="24"/>
                <circle cx="16" cy="26" r="0.8" fill="currentColor"/>
                <path d="M11 11 Q16 7 21 11"/>
                <path d="M12.5 14 Q16 11.5 19.5 14"/>
                <path d="M14 17 Q16 16 18 17"/>
              </svg>
              <span>Offline</span>
            </div>
            <div class="ob-offline-tile">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="7" y="14" width="18" height="14" rx="2"/>
                <path d="M11 14 V10 a5 5 0 0 1 10 0 V14"/>
                <circle cx="16" cy="21" r="1.4"/>
              </svg>
              <span>Private</span>
            </div>
            <div class="ob-offline-tile">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="9" cy="16" r="3"/>
                <circle cx="23" cy="8" r="3"/>
                <circle cx="23" cy="24" r="3"/>
                <line x1="11.6" y1="14.6" x2="20.4" y2="9.4"/>
                <line x1="11.6" y1="17.4" x2="20.4" y2="22.6"/>
              </svg>
              <span>Shareable</span>
            </div>
          </div>
          <span class="ob-offline-tag">Free. Yours. Forever.</span>
        {/if}
      </div>

      <p class="ob-body">{cards[step].body}</p>

      <footer class="ob-foot">
        <!-- Pagination dots show the user how far they are. -->
        <div class="ob-dots" aria-hidden="true">
          {#each cards as _, i}
            <span class="ob-dot" class:is-active={i === step}></span>
          {/each}
        </div>

        <div class="ob-foot-actions">
          {#if step > 0}
            <button type="button" class="ob-back" on:click={back}>&larr; Back</button>
          {/if}
          <button type="button" class="ob-next" on:click={next}>
            {cards[step].cta}
            {#if step < cards.length - 1}
              <span class="ob-arrow" aria-hidden="true">&rarr;</span>
            {/if}
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .ob-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .ob-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(10, 30, 20, 0.72);
    border: 0;
    cursor: pointer;
    padding: 0;
    backdrop-filter: blur(2px);
  }

  /* Cream paper card with rust border + soft drop shadow.
     Sized to comfortably hold a stage + body + footer on
     phones in portrait. */
  .ob-card {
    position: relative;
    z-index: 1;
    background: #fbf6ea;
    border: 1.5px solid #8b6a3a;
    box-shadow:
      0 30px 60px rgba(10, 30, 20, 0.5),
      0 10px 22px rgba(10, 30, 20, 0.35);
    width: 100%;
    max-width: 540px;
    max-height: 90vh;
    overflow-y: auto;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
  }

  /* Forest header band - same identity as the trip-page cover */
  .ob-head {
    background:
      radial-gradient(circle at 70% 0%, rgba(196, 134, 15, 0.22), transparent 55%),
      linear-gradient(180deg, #0a2d21 0%, #0f3a2b 100%);
    color: #f5f0e8;
    padding: 22px 24px 20px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }
  .ob-head-text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .ob-kicker {
    display: block;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #c4860f;
    margin-bottom: 6px;
  }
  .ob-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 800;
    /* Bigger floor so the welcome title reads boldly on phones -
       was clamping down to 20px which was small against the rest
       of the card. */
    font-size: clamp(26px, 5.5vw, 30px);
    line-height: 1.15;
    color: #f5f0e8;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .ob-skip {
    flex: 0 0 auto;
    background: transparent;
    border: 1px solid rgba(245, 240, 232, 0.25);
    color: rgba(245, 240, 232, 0.7);
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 6px 12px;
    border-radius: 999px;
    cursor: pointer;
    transition: all 160ms ease;
    white-space: nowrap;
  }
  .ob-skip:hover {
    border-color: rgba(245, 240, 232, 0.55);
    color: #f5f0e8;
  }

  /* Stage - the visual for each step. Centered with paper colour
     so the illustrations breathe. */
  .ob-stage {
    background: #f3ece0;
    padding: 28px 24px;
    border-bottom: 1px dashed rgba(125, 58, 30, 0.3);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 220px;
  }

  /* Step 1: polaroid collage */
  .ob-collage {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .ob-polaroid {
    background: #fbf6ea;
    padding: 7px 7px 11px;
    box-shadow: 0 12px 22px rgba(40, 20, 5, 0.22);
    margin: 0;
    transform: rotate(var(--rot, 0deg)) translateY(calc(var(--i, 0) * -2px));
    transition: transform 320ms cubic-bezier(.2,.7,.3,1);
  }
  .ob-polaroid:hover {
    transform: rotate(0deg) translateY(-4px);
    z-index: 4;
  }
  .ob-polaroid img {
    width: 90px;
    height: 90px;
    object-fit: cover;
    display: block;
    background: #ede0cc;
  }
  .ob-polaroid figcaption {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 11px;
    color: #0a2d21;
    text-align: center;
    padding-top: 4px;
  }

  /* Step 2: sample polaroid. Cream paper card with a stop photo,
     "Your trip" caption on the white border, tilted slightly to
     echo the dashboard scrapbook. */
  .ob-trip-card {
    width: 220px;
    max-width: 70%;
    background: #fffdf6;
    padding: 12px 12px 18px;
    margin: 0;
    box-shadow:
      0 18px 30px rgba(40, 25, 10, 0.28),
      0 2px 6px rgba(40, 25, 10, 0.18);
    transform: rotate(-3deg);
  }
  .ob-trip-card img {
    display: block;
    width: 100%;
    height: 180px;
    object-fit: cover;
    background: #ede0cc;
  }
  .ob-trip-card figcaption {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-style: italic;
    font-size: 14px;
    color: #0a2d21;
    text-align: center;
    padding-top: 10px;
    letter-spacing: 0.02em;
  }

  /* Step 3: mini route rail (echoes the dashboard tag mini-rail) */
  .ob-route {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    width: 100%;
    max-width: 320px;
  }
  .ob-route-pin {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #0a2d21;
    color: #c9a84c;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      inset 0 0 0 2px #c9a84c,
      0 0 0 4px rgba(196, 134, 15, 0.18);
  }
  .ob-route-rail {
    flex: 1 1 auto;
    height: 0;
    border-top: 2px dashed #c4860f;
    margin: 0 6px;
  }
  .ob-route-caption {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    font-size: 14px;
    margin: 16px 0 0;
  }

  /* Step 2: trio of feature tiles (train / weather / map).
     Three cream paper chips with palette-tinted icons + caption
     so the user sees the three real-data hooks at a glance. */
  .ob-trio,
  .ob-offline-trio {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .ob-trio-tile,
  .ob-offline-tile {
    background: #fffdf6;
    border: 1.5px solid rgba(125, 58, 30, 0.32);
    border-radius: 6px;
    padding: 14px 12px 12px;
    width: 96px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    box-shadow: 0 6px 14px rgba(40, 25, 10, 0.14);
    color: #7d3a1e;
  }
  .ob-trio-tile svg,
  .ob-offline-tile svg {
    width: 36px;
    height: 36px;
  }
  .ob-trio-tile span,
  .ob-offline-tile span {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #0a2d21;
    text-align: center;
  }

  /* Step 3: stack of chapter "drawer" pills. Mimics the actual
     accordion summary rows the user gets at every stop, so the
     onboarding preview matches reality once they're inside. */
  .ob-drawers {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    max-width: 320px;
  }
  .ob-drawer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: #fffdf6;
    border: 1.5px solid rgba(125, 58, 30, 0.3);
    border-left: 3px solid #c9a84c;
    border-radius: 4px;
    padding: 9px 14px;
    box-shadow: 0 3px 8px rgba(40, 25, 10, 0.08);
  }
  .ob-drawer-kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .ob-drawer-arrow {
    color: #c9a84c;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 16px;
    line-height: 1;
  }

  /* Step 4: closing tag below the offline / private / shareable
     trio. Quiet italic so the trio above carries the weight. */
  .ob-offline-tag {
    margin-top: 14px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #7d3a1e;
  }

  .ob-body {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(15px, 2vw, 17px);
    line-height: 1.55;
    color: #5a4f3d;
    padding: 22px 26px 6px;
    margin: 0;
  }

  .ob-foot {
    padding: 18px 24px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .ob-dots {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ob-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(125, 58, 30, 0.3);
    transition: background 200ms ease, transform 200ms ease;
  }
  .ob-dot.is-active {
    background: #7d3a1e;
    transform: scale(1.35);
  }
  .ob-foot-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }
  .ob-back {
    background: transparent;
    border: 0;
    color: #5a4f3d;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 14px;
    cursor: pointer;
    padding: 4px 6px;
  }
  .ob-back:hover { color: #7d3a1e; }
  .ob-next {
    background: #6e2e17;
    color: #f3ece0;
    border: 2px solid #6e2e17;
    font-family: 'Spline Sans', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 9px 18px;
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: background 160ms ease, border-color 160ms ease;
  }
  .ob-next:hover {
    background: #884023;
    border-color: #884023;
  }
  .ob-arrow {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 16px;
    line-height: 1;
  }

  @media (max-width: 540px) {
    .ob-card {
      max-width: 100%;
    }
    .ob-head {
      padding: 18px 18px 16px;
    }
    .ob-stage {
      padding: 22px 18px;
      min-height: 180px;
    }
    .ob-body {
      padding: 18px 20px 4px;
    }
    .ob-foot {
      padding: 14px 18px 20px;
    }
    /* 2x2 polaroid grid on mobile - four cards on two rows of two
       instead of the flex-wrap 3+1 that the four-card collage
       falls into on a narrow viewport. */
    .ob-collage {
      display: grid;
      grid-template-columns: repeat(2, max-content);
      gap: 14px;
      justify-content: center;
    }
    .ob-polaroid img {
      width: 96px;
      height: 96px;
    }
  }
</style>
