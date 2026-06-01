<script>
  import { getStopsByIds, stopGuideUrl } from '$lib/data/stops.js';
  import {
    arrivalClock,
    travelDuration,
    departureFor,
    formatTripDate,
    DIRECTIONS
  } from '$lib/data/schedule.js';

  /** @type {string[]} - stop ids on the trip, in storage order */
  export let stopIds = [];
  /** @type {string | null} - YYYY-MM-DD */
  export let departureDate = null;
  /** @type {'northbound' | 'southbound'} */
  export let direction = 'northbound';

  /* Stops are always stored in canonical south-to-north route order
     by the picker. For southbound trips we display the same set in
     reverse so the list reads the way the train actually rolls
     (Cochrane down to Toronto Union). */
  $: stopsForward = getStopsByIds(stopIds);
  $: stops = direction === 'southbound' ? stopsForward.slice().reverse() : stopsForward;
  $: first = stops[0] || null;
  $: last = stops[stops.length - 1] || null;
  $: departureClock = departureFor(direction);
  $: directionMeta = DIRECTIONS.find((d) => d.id === direction) || DIRECTIONS[0];
  $: dateLine = departureDate ? formatTripDate(departureDate) : null;
</script>

{#if stops.length === 0}
  <div class="text-center py-6">
    <p class="font-serif italic text-muted">
      No stops yet. Add stops from the Guide and the train schedule fills in around them.
    </p>
  </div>
{:else}
  <div class="mb-4">
    <div class="flex items-baseline justify-between gap-3">
      <span class="kicker">{directionMeta.label} {departureClock.replace(':', '·')}</span>
      {#if first && last && first !== last}
        <span class="font-serif italic text-rust text-sm">
          {first.name} <span class="opacity-70">to</span> {last.name}
        </span>
      {/if}
    </div>
    {#if dateLine}
      <div class="font-serif italic text-forest mt-1">{dateLine}</div>
    {/if}
  </div>

  <ol class="rail">
    {#each stops as stop}
      <li class="rail-stop">
        <span class="rail-dot" aria-hidden="true"></span>

        <div class="flex-1 min-w-0">
          <div class="flex items-baseline justify-between gap-3">
            <div class="font-serif font-bold text-forest text-lg leading-tight truncate">{stop.name}</div>
            <div class="font-serif font-bold text-rust flex-none">
              {arrivalClock(stop.offsetMinutes, departureClock, direction)}
            </div>
          </div>
          <div class="kicker text-muted mt-0.5">
            {stop.region}<span class="mx-2 text-rust/60">·</span>{travelDuration(stop.offsetMinutes, direction)}
          </div>
          <a
            href={stopGuideUrl(stop)}
            target="_blank"
            rel="noopener"
            class="inline-block mt-1 text-rust hover:text-forest text-xs font-semibold no-underline tracking-wide uppercase"
          >Guide &rarr;</a>
        </div>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .rail {
    position: relative;
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .rail::before {
    content: '';
    position: absolute;
    left: 9px;
    top: 14px;
    bottom: 14px;
    border-left: 2px dashed #7d3a1e;
  }
  .rail-stop {
    position: relative;
    display: flex;
    gap: 16px;
    padding: 12px 0;
    align-items: flex-start;
  }
  .rail-stop + .rail-stop {
    border-top: 1px solid rgba(139, 106, 58, 0.25);
  }
  .rail-dot {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #0a2d21;
    box-shadow: 0 0 0 3px #c9a84c;
    margin-top: 2px;
  }
</style>
