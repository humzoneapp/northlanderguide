<script>
  /* ==================================================================
     Weather particle overlay.

     Reads the trip's first-stop forecast and renders a thin layer of
     particles matching the conditions: rain streaks, snowflakes, or
     nothing on clear days. CSS-only animation - no JS RAF loop - so
     it's cheap even on slower devices. Sits absolutely positioned
     inside whichever container the parent mounts it in (typically
     the cover veil) and never blocks pointer events.

     Particles only render when both a forecast is available AND the
     user hasn't asked the OS for reduced motion.
     ================================================================== */

  import { onMount } from 'svelte';
  import { getWeatherFor } from '$lib/data/weather.js';

  /** @type {{ lat: number, lng: number } | null} */
  export let stop = null;
  /** @type {string|null} - YYYY-MM-DD */
  export let date = null;

  let forecast = null;
  let busy = true;
  let reduceMotion = false;

  $: stop, date, refetch();

  async function refetch() {
    if (!stop || !date) {
      forecast = null;
      busy = false;
      return;
    }
    busy = true;
    forecast = await getWeatherFor(stop.lat, stop.lng, date);
    busy = false;
  }

  /* WMO weather codes that map to each particle kind. */
  $: kind = (() => {
    const c = forecast?.code;
    if (c == null || forecast?.offline) return 'none';
    if ([51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82].includes(c)) return 'rain';
    if ([71, 73, 75, 77, 85, 86].includes(c)) return 'snow';
    return 'none';
  })();

  onMount(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    refetch();
  });
</script>

{#if !busy && !reduceMotion && kind === 'rain'}
  <div class="particles rain" aria-hidden="true">
    {#each Array(36) as _, i}
      <span
        class="rain-drop"
        style={`left:${(i * 2.83) % 100}%; animation-delay:${(i * 0.13) % 2.4}s; animation-duration:${0.95 + (i % 5) * 0.18}s; opacity:${0.42 + (i % 7) * 0.03};`}
      ></span>
    {/each}
  </div>
{:else if !busy && !reduceMotion && kind === 'snow'}
  <div class="particles snow" aria-hidden="true">
    {#each Array(28) as _, i}
      <span
        class="snow-flake"
        style={`left:${(i * 3.6) % 100}%; animation-delay:${(i * 0.32) % 6}s; animation-duration:${7 + (i % 6) * 1.2}s; font-size:${10 + (i % 4) * 3}px; opacity:${0.55 + (i % 5) * 0.06};`}
      >&#10052;</span>
    {/each}
  </div>
{/if}

<style>
  .particles {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 2;
  }
  /* Rain - thin gold streaks slanting down. Each .rain-drop runs
     its own keyframe with a per-index delay so the layer feels
     ambient instead of synchronized. */
  .rain-drop {
    position: absolute;
    top: -10%;
    width: 1.5px;
    height: 16px;
    background: linear-gradient(180deg, rgba(245, 240, 232, 0) 0%, rgba(201, 168, 76, 0.7) 100%);
    transform: skewX(-12deg);
    animation: rain-fall 1.2s linear infinite;
  }
  @keyframes rain-fall {
    0%   { transform: translateY(0) skewX(-12deg); opacity: 0; }
    10%  { opacity: 0.6; }
    90%  { opacity: 0.5; }
    100% { transform: translateY(120vh) skewX(-12deg); opacity: 0; }
  }
  /* Snow - tilted asterisk glyphs drifting down slowly. */
  .snow-flake {
    position: absolute;
    top: -8%;
    color: rgba(245, 240, 232, 0.92);
    text-shadow: 0 0 2px rgba(245, 240, 232, 0.6);
    font-family: 'Spline Sans', system-ui, sans-serif;
    animation: snow-fall 9s linear infinite;
  }
  @keyframes snow-fall {
    0%   { transform: translateY(0) translateX(0) rotate(0); opacity: 0; }
    10%  { opacity: 0.8; }
    50%  { transform: translateY(60vh) translateX(18px) rotate(180deg); }
    100% { transform: translateY(125vh) translateX(-12px) rotate(360deg); opacity: 0; }
  }
</style>
