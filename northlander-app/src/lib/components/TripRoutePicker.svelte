<script>
  /* ==================================================================
     Two-step route picker. Step 1 picks the departing stop from the
     16 on the route; Step 2 picks the arriving stop from the 15
     remaining. On save we emit { stopIds: [start, end], direction }
     - direction is auto-derived from the canonical south-to-north
     route order: arriving farther north than departing => northbound,
     otherwise southbound. The cover banner reads start + end from
     stopIds[0] and stopIds[stopIds.length - 1] so the same shape
     supports both 2-stop and (eventually) multi-stop routes.
     ================================================================== */

  import { createEventDispatcher, onMount } from 'svelte';
  import { STOPS, routeIndex } from '$lib/data/stops.js';
  import { arrivalClock } from '$lib/data/schedule.js';

  /** @type {string[]} */
  export let selected = [];
  /** @type {'northbound' | 'southbound'} */
  export let direction = 'northbound';

  const dispatch = createEventDispatcher();

  let step = 1;
  let startId = selected[0] || '';
  let endId   = selected[selected.length - 1] && selected.length > 1
    ? selected[selected.length - 1]
    : '';
  let submitting = false;

  /* Step 2 filters out the chosen start. */
  $: stepTwoOptions = STOPS.filter((s) => s.id !== startId);

  /* Auto-derived direction: if the end stop sits later in the
     canonical south-to-north route than the start, it's northbound.
     Otherwise southbound. */
  $: derivedDirection = (() => {
    if (!startId || !endId) return direction;
    const a = routeIndex(startId);
    const b = routeIndex(endId);
    if (a == null || b == null) return direction;
    return b >= a ? 'northbound' : 'southbound';
  })();

  /* Departure clock at the start stop, computed for the second-step
     preview. Northbound uses the start's offsetMinutes; southbound
     wraps via the schedule helpers (the start arrives "0" minutes
     after departure regardless of direction). */
  function clockFor(stopId, dir) {
    const s = STOPS.find((x) => x.id === stopId);
    if (!s) return '';
    return arrivalClock(s.offsetMinutes, undefined, dir);
  }

  onMount(() => {
    /* If a trip already has stops, jump straight to step 2 so the
       user can change the destination without re-picking the start. */
    if (startId && !endId) step = 1;
    else if (startId && endId) step = 1;
  });

  function pickStart(id) {
    startId = id;
    /* Reset end if it now equals start. */
    if (endId === id) endId = '';
    step = 2;
  }
  function pickEnd(id) {
    if (id === startId) return;
    endId = id;
  }

  function close() {
    if (submitting) return;
    dispatch('close');
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  async function handleSave() {
    if (submitting || !startId || !endId) return;
    submitting = true;
    dispatch('save', {
      stopIds: [startId, endId],
      direction: derivedDirection
    });
  }
</script>

<svelte:window on:keydown={onKey} />

<div
  class="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
  role="dialog"
  aria-modal="true"
  aria-labelledby="route-picker-title"
>
  <button
    type="button"
    class="absolute inset-0 bg-forest/70 backdrop-blur-sm cursor-default"
    on:click={close}
    aria-label="Close"
  ></button>

  <div class="relative z-10 w-full max-w-[680px] max-h-full bg-cream shadow-ticket pl-card flex flex-col">

    <header class="bg-forest text-ivory px-6 py-3 flex justify-between items-center border-b-[3px] border-double border-gold flex-none">
      <div>
        <span id="route-picker-title" class="font-serif font-black uppercase tracking-[0.18em] text-[15px] block">
          {step === 1 ? 'Departing From' : 'Arriving To'}
        </span>
        <span class="text-gold font-serif italic text-[12px]">
          {#if step === 1}
            Step 1 of 2 &middot; Choose where the journey begins
          {:else}
            Step 2 of 2 &middot; Choose where the journey ends
          {/if}
        </span>
      </div>
      <button
        type="button"
        class="text-gold text-xl leading-none hover:text-ivory"
        on:click={close}
        aria-label="Close"
      >&times;</button>
    </header>

    {#if step === 2 && startId}
      <div class="route-summary">
        <span class="route-summary-kicker">Boarding at</span>
        <strong class="route-summary-name">{STOPS.find((s) => s.id === startId)?.name}</strong>
        <button
          type="button"
          class="route-summary-edit"
          on:click={() => (step = 1)}
        >Change</button>
      </div>
    {/if}

    <div class="overflow-y-auto bg-linen flex-1">
      <ol class="divide-y divide-dashed divide-[#8b6a3a]/35">
        {#each (step === 1 ? STOPS : stepTwoOptions) as stop}
          {@const isActiveStart = step === 1 && stop.id === startId}
          {@const isActiveEnd   = step === 2 && stop.id === endId}
          {@const onClick = step === 1 ? () => pickStart(stop.id) : () => pickEnd(stop.id)}
          <li>
            <button
              type="button"
              class="picker-row"
              class:is-on={isActiveStart || isActiveEnd}
              on:click={onClick}
            >
              <span class="picker-dot" aria-hidden="true">
                {#if isActiveStart || isActiveEnd}
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 8 7 12 13 4"></polyline>
                  </svg>
                {/if}
              </span>
              <div class="picker-body">
                <div class="picker-name-row">
                  <span class="picker-name">{stop.name}</span>
                  {#if step === 2 && startId}
                    <span class="picker-clock">
                      {clockFor(stop.id, derivedDirection)}
                    </span>
                  {/if}
                </div>
                <span class="picker-region">{stop.region}</span>
                <p class="picker-hook">{stop.hook}</p>
              </div>
            </button>
          </li>
        {/each}
      </ol>
    </div>

    <footer class="route-foot">
      <div class="route-foot-status">
        {#if step === 1}
          <span class="font-serif italic text-muted text-sm">
            {startId
              ? `Boarding at ${STOPS.find((s) => s.id === startId)?.name}.`
              : 'Pick a stop to start the journey.'}
          </span>
        {:else}
          <span class="font-serif italic text-muted text-sm">
            {endId
              ? `Arriving at ${STOPS.find((s) => s.id === endId)?.name}, ${derivedDirection}.`
              : 'Pick a stop to end the journey.'}
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-3">
        {#if step === 2}
          <button
            type="button"
            class="font-serif italic text-muted hover:text-rust text-sm"
            on:click={() => (step = 1)}
            disabled={submitting}
          >Back</button>
        {:else}
          <button
            type="button"
            class="font-serif italic text-muted hover:text-rust text-sm"
            on:click={close}
            disabled={submitting}
          >Cancel</button>
        {/if}

        {#if step === 1}
          <button
            type="button"
            class="btn-primary disabled:opacity-50"
            on:click={() => (step = 2)}
            disabled={!startId}
          >Next: Arriving To</button>
        {:else}
          <button
            type="button"
            class="btn-primary disabled:opacity-50"
            on:click={handleSave}
            disabled={!endId || submitting}
          >Save Route</button>
        {/if}
      </div>
    </footer>
  </div>
</div>

<style>
  .pl-card {
    -webkit-mask-image:
      radial-gradient(circle 8px at 0% 50%, transparent 7px, black 8px),
      radial-gradient(circle 8px at 100% 50%, transparent 7px, black 8px);
    mask-image:
      radial-gradient(circle 8px at 0% 50%, transparent 7px, black 8px),
      radial-gradient(circle 8px at 100% 50%, transparent 7px, black 8px);
  }

  /* Summary chip between header and list, when we're on step 2. */
  .route-summary {
    display: flex;
    align-items: baseline;
    gap: 10px;
    background: #f3ece0;
    border-bottom: 1px dashed rgba(125, 58, 30, 0.3);
    padding: 10px 24px;
    flex: none;
  }
  .route-summary-kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    font-weight: 800;
    color: #7d3a1e;
  }
  .route-summary-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    color: #0a2d21;
    font-size: 1.05rem;
  }
  .route-summary-edit {
    margin-left: auto;
    background: transparent;
    border: 0;
    color: #7d3a1e;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    cursor: pointer;
    text-decoration: underline;
  }
  .route-summary-edit:hover { color: #0a2d21; }

  /* List rows */
  .picker-row {
    width: 100%;
    background: transparent;
    border: 0;
    padding: 14px 20px;
    display: flex;
    gap: 16px;
    align-items: flex-start;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
    color: inherit;
  }
  .picker-row:hover { background: rgba(125, 58, 30, 0.05); }
  .picker-row.is-on { background: rgba(201, 168, 76, 0.12); }
  .picker-dot {
    margin-top: 3px;
    flex: none;
    width: 24px;
    height: 24px;
    border: 2px solid #8b6a3a;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: transparent;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .picker-dot svg { width: 14px; height: 14px; }
  .picker-row.is-on .picker-dot {
    border-color: #0a2d21;
    background: #c9a84c;
    color: #0a2d21;
  }
  .picker-body { flex: 1; min-width: 0; }
  .picker-name-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .picker-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 1.1rem;
    color: #0a2d21;
    line-height: 1.15;
  }
  .picker-clock {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #7d3a1e;
    font-size: 0.9rem;
    flex: none;
  }
  .picker-region {
    display: block;
    font-family: 'Spline Sans', system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 10px;
    font-weight: 700;
    color: #5a4f3d;
    margin-top: 2px;
  }
  .picker-hook {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #241f1a;
    margin: 4px 0 0;
    line-height: 1.3;
  }

  .route-foot {
    background: #fbf6ea;
    border-top: 3px double rgba(201, 168, 76, 0.4);
    padding: 12px 24px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
    flex: none;
  }
  .route-foot-status { flex: 1; min-width: 200px; }
</style>
