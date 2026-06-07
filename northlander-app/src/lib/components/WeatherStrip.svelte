<script>
  /* Italic weather strip rendered in the scene-head meta row of each
     chapter. Fetches once per (stop, date) via the open-meteo store
     and renders the result as small SVG + "12 to 22, partly cloudy".
     Renders nothing on fetch failure or when the trip date is more
     than 16 days out (open-meteo only forecasts that far). */
  import { onMount } from 'svelte';
  import { getWeatherFor } from '$lib/data/weather.js';

  /** @type {{ lat: number, lng: number }} */
  export let stop;
  /** @type {string} - YYYY-MM-DD */
  export let date;

  let forecast = null;
  let busy = true;

  /* Refetch whenever the stop or the date the caller cares about
     changes. The store caches per-(stop,date) so a re-render after
     an edit hits sessionStorage instead of the network. */
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

  onMount(refetch);
</script>

{#if forecast && !busy}
  <span class="weather" title={forecast.label}>
    <span class="weather-glyph" aria-hidden="true">
      {#if forecast.glyph === 'sun'}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <line x1="12" y1="3" x2="12" y2="5"/>
          <line x1="12" y1="19" x2="12" y2="21"/>
          <line x1="3" y1="12" x2="5" y2="12"/>
          <line x1="19" y1="12" x2="21" y2="12"/>
          <line x1="5.6" y1="5.6" x2="7" y2="7"/>
          <line x1="17" y1="17" x2="18.4" y2="18.4"/>
          <line x1="5.6" y1="18.4" x2="7" y2="17"/>
          <line x1="17" y1="7" x2="18.4" y2="5.6"/>
        </svg>
      {:else if forecast.glyph === 'sun-cloud'}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="9" r="3"/>
          <line x1="8" y1="2" x2="8" y2="4"/>
          <line x1="2" y1="9" x2="4" y2="9"/>
          <line x1="3.5" y1="4.5" x2="5" y2="6"/>
          <path d="M9 18 a4 4 0 1 1 6 -3 a3 3 0 0 1 3 3 H8 a3 3 0 0 1 1 0 Z"/>
        </svg>
      {:else if forecast.glyph === 'cloud'}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 18 a5 5 0 1 1 9 -3 a3 3 0 0 1 3 3 H6 a3 3 0 0 1 1 0 Z"/>
        </svg>
      {:else if forecast.glyph === 'rain'}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 13 a5 5 0 1 1 9 -3 a3 3 0 0 1 3 3 H6 a3 3 0 0 1 1 0 Z"/>
          <line x1="9" y1="17" x2="8" y2="20"/>
          <line x1="13" y1="17" x2="12" y2="20"/>
          <line x1="17" y1="17" x2="16" y2="20"/>
        </svg>
      {:else if forecast.glyph === 'snow'}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 13 a5 5 0 1 1 9 -3 a3 3 0 0 1 3 3 H6 a3 3 0 0 1 1 0 Z"/>
          <circle cx="9" cy="19" r="0.8" fill="currentColor"/>
          <circle cx="13" cy="20" r="0.8" fill="currentColor"/>
          <circle cx="17" cy="19" r="0.8" fill="currentColor"/>
        </svg>
      {:else if forecast.glyph === 'fog'}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 9 L19 9"/>
          <path d="M3 13 L21 13"/>
          <path d="M5 17 L19 17"/>
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 13 a5 5 0 1 1 9 -3 a3 3 0 0 1 3 3 H6 a3 3 0 0 1 1 0 Z"/>
          <path d="M11 16 L9 20 L13 20 L11 24" stroke="currentColor"/>
        </svg>
      {/if}
    </span>
    <span class="weather-text">
      {forecast.tempMin}&deg; to {forecast.tempMax}&deg;{forecast.label ? `, ${forecast.label.toLowerCase()}` : ''}
    </span>
  </span>
{/if}

<style>
  .weather {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #5a4f3d;
    line-height: 1;
  }
  .weather-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: #c4860f;
  }
  .weather-glyph :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
