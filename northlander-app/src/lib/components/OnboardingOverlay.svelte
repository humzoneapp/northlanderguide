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
  import Suitcase from './Suitcase.svelte';
  import { STOPS, stopImageUrl } from '$lib/data/stops.js';

  const KEY = 'northlander.onboarded';

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

  const cards = [
    {
      kicker: 'Welcome aboard',
      title: 'Pack a Northern Ontario train trip.',
      body: "The Northlander runs north from Toronto Union to Cochrane through some of the prettiest country in the province. This app is how you carry your trip, your plans, and your photos in one suitcase.",
      cta: 'Show me how'
    },
    {
      kicker: 'Step one',
      title: 'Tag a suitcase.',
      body: "Every trip lives in its own tinted suitcase. Pick a name, pick a leather, and the suitcase sits on your platform until you're ready to open it.",
      cta: 'Next'
    },
    {
      kicker: 'Step two',
      title: 'Pick your stops.',
      body: "Choose the train stations you'll step off at along the route. Each stop becomes a chapter you can fill with plans, polaroids, and notes from the journey.",
      cta: 'Next'
    },
    {
      kicker: 'Step three',
      title: 'Open it anywhere.',
      body: "Everything you save lives on this device. No accounts, no servers, no internet needed once your trip is packed. Open it on your phone the morning you board.",
      cta: 'Tag my first suitcase'
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
          <!-- Tinted suitcase preview -->
          <div class="ob-suitcase">
            <Suitcase color="#7d3a1e" strap="#c4860f" label="" />
          </div>
        {:else if step === 2}
          <!-- Mini numbered route rail (RouteMap echo) -->
          <div class="ob-route">
            {#each [1, 2, 3, 4] as n, i}
              {#if i > 0}<span class="ob-route-rail"></span>{/if}
              <span class="ob-route-pin">{n}</span>
            {/each}
          </div>
          <p class="ob-route-caption">Toronto Union to Cochrane, your way.</p>
        {:else}
          <!-- Offline glyph -->
          <div class="ob-offline">
            <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="20" y="10" width="40" height="60" rx="6" />
              <line x1="20" y1="62" x2="60" y2="62" />
              <circle cx="40" cy="68" r="1.5" fill="currentColor" />
              <path d="M28 28 Q40 22 52 28" />
              <path d="M31 34 Q40 30 49 34" />
              <path d="M34 40 Q40 38 46 40" />
            </svg>
            <span class="ob-offline-tag">Works offline</span>
          </div>
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
    font-size: clamp(20px, 3.5vw, 26px);
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

  /* Step 2: suitcase preview */
  .ob-suitcase {
    width: 200px;
    max-width: 60%;
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

  /* Step 4: offline glyph */
  .ob-offline {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: #7d3a1e;
  }
  .ob-offline svg { width: 88px; height: 88px; }
  .ob-offline-tag {
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
    .ob-polaroid img {
      width: 72px;
      height: 72px;
    }
  }
</style>
