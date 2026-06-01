<script>
  import { getStopsByIds, stopGuideUrl } from '$lib/data/stops.js';
  import { arrivalClock, travelDuration, NORTHBOUND_DEPARTURE } from '$lib/data/schedule.js';

  /** @type {string[]} - stop ids on the trip, already in route order */
  export let stopIds = [];

  $: stops = getStopsByIds(stopIds);
  $: first = stops[0] || null;
  $: last = stops[stops.length - 1] || null;
</script>

{#if stops.length === 0}
  <div class="text-center py-6">
    <p class="font-serif italic text-muted">
      No stops yet. Add stops from the Guide and the train schedule fills in around them.
    </p>
  </div>
{:else}
  <div class="mb-4 flex items-baseline justify-between">
    <span class="kicker">Northbound {NORTHBOUND_DEPARTURE.replace(':', '·')}</span>
    {#if first && last && first !== last}
      <span class="font-serif italic text-rust text-sm">
        {first.name} <span class="opacity-70">to</span> {last.name}
      </span>
    {/if}
  </div>

  <ol class="rail">
    {#each stops as stop, i}
      <li class="rail-stop">
        <span class="rail-dot" aria-hidden="true"></span>

        <div class="flex-1 min-w-0">
          <div class="flex items-baseline justify-between gap-3">
            <div class="font-serif font-bold text-forest text-lg leading-tight truncate">{stop.name}</div>
            <div class="font-serif font-bold text-rust flex-none">
              {stop.offsetMinutes === 0 ? '9:00 AM' : arrivalClock(stop.offsetMinutes)}
            </div>
          </div>
          <div class="kicker text-muted mt-0.5">
            {stop.region}<span class="mx-2 text-rust/60">·</span>{travelDuration(stop.offsetMinutes)}
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
  /* Vertical railway line with gold-haloed station dots, echoing the
     /plan boarding pass and the Guide's route-line decoration. */
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
