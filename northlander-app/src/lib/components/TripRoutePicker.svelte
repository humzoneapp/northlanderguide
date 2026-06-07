<script>
  /* ==================================================================
     Multi-step dated route picker.

     The user walks through one step per stop, picking a station + the
     date they arrive there. After each step they choose:
       [+ Add another stop]  to add the next chapter
       [Set return date]     to finish and pick the date they're back
     The return step shows just a date input (the return station is
     the same as the departing one).

     On Save we emit a payload the trip store understands:
       { stops: [{stopId, date}], returnDate, returnStopId }
     The store mirrors stopIds[] + departureDate + direction so
     legacy readers (cover stats, recap, poster) keep working.
     ================================================================== */

  import { createEventDispatcher, onMount } from 'svelte';
  import { STOPS } from '$lib/data/stops.js';

  /** @type {{ stopId: string, date: string }[]} - existing outbound route */
  export let stops = [];
  /** @type {{ stopId: string, date: string }[]} - existing multi-stop
      return route (added 2026-06-07). When the trip was saved before
      multi-stop returns shipped we synthesize a single-entry array
      from the legacy returnDate + returnStopId on mount. */
  export let returnStops = [];
  /** @type {string} - legacy single-return date, kept as a prop so
      existing callers continue to work; only consulted on mount when
      `returnStops` is empty. */
  export let returnDate = '';
  /** @type {string} - legacy single-return station. */
  export let returnStopId = '';

  const dispatch = createEventDispatcher();

  /* Mode:
       'pick'   - active step where the user picks an OUTBOUND
                  station + date
       'return' - active step where the user picks a RETURN station
                  + date. Now multi-step: the user can commit a
                  return entry and add another, or save.
  */
  let mode = 'pick';

  /** @type {{ stopId: string, date: string }[]} - committed outbound entries */
  let entries = [];
  /** @type {{ stopId: string, date: string }[]} - committed return entries */
  let returnEntries = [];

  /* Active step state, edited in place until the user commits with
     Add another stop / Add another return stop / Set return date. */
  let activeStopId = '';
  let activeDate = '';

  let submitting = false;

  onMount(() => {
    if (Array.isArray(stops) && stops.length > 0) {
      entries = stops
        .filter((s) => s && s.stopId)
        .map((s) => ({ stopId: s.stopId, date: s.date || '' }));
    }
    if (Array.isArray(returnStops) && returnStops.length > 0) {
      returnEntries = returnStops
        .filter((s) => s && s.stopId)
        .map((s) => ({ stopId: s.stopId, date: s.date || '' }));
    } else if (returnDate && returnStopId) {
      /* Legacy single-stop return: hydrate into a one-entry array
         so the picker starts in the new shape. */
      returnEntries = [{ stopId: returnStopId, date: returnDate }];
    }
    activeStopId = '';
    activeDate = '';
  });

  /* Today's date in the viewer's local timezone, YYYY-MM-DD. Used as
     the floor for every date input so the user can only pick today
     or future days when planning a trip. Existing trips with past
     dates aren't disturbed - the value still displays - they just
     can't pick a new past date. */
  function todayLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const TODAY_ISO = todayLocal();

  /* The "anchor" entry the active step extends from. In pick mode
     that's the previous outbound entry; in return mode it's the last
     return entry, falling back to the last outbound entry when the
     user is picking their first return stop. */
  $: anchorEntry = (() => {
    if (mode === 'return') {
      if (returnEntries.length > 0) return returnEntries[returnEntries.length - 1];
      if (entries.length > 0) return entries[entries.length - 1];
      return null;
    }
    return entries.length > 0 ? entries[entries.length - 1] : null;
  })();
  $: minDate = (() => {
    const prev = anchorEntry?.date || '';
    return prev && prev > TODAY_ISO ? prev : TODAY_ISO;
  })();
  /* The stop the user just boarded at / arrived at. The next pick
     can't be the same place - you're already there, you can't get
     off the train at the same station you just got on. */
  $: prevStopId = anchorEntry?.stopId || '';
  $: canCommit = !!activeStopId && activeStopId !== prevStopId && !!activeDate && activeDate >= minDate;
  /* The trip needs at least the boarding station and one place to
     get off before it can be saved or have a return date. We check
     the post-commit count: if the active step is filled in, that
     entry will join the route on commit. */
  $: postCommitCount = entries.length + (mode === 'pick' && canCommit ? 1 : 0);
  $: canFinish = postCommitCount >= 2;
  /* In return mode the user can save once they have at least one
     committed return entry, OR they can save the active step
     directly (commit-and-save in one tap). */
  $: returnPostCommitCount = returnEntries.length + (mode === 'return' && canCommit ? 1 : 0);
  $: canSaveReturn = mode === 'return' && entries.length >= 2 && returnPostCommitCount >= 1;

  function pick(id) {
    if (id && id === prevStopId) return;
    activeStopId = id;
  }

  function commitActive() {
    if (!canCommit) return;
    if (mode === 'return') {
      returnEntries = [...returnEntries, { stopId: activeStopId, date: activeDate }];
    } else {
      entries = [...entries, { stopId: activeStopId, date: activeDate }];
    }
    activeStopId = '';
    activeDate = '';
  }

  function addAnotherStop() {
    commitActive();
  }

  function setReturn() {
    /* If the user filled in the active step, commit it first so the
       return date sits after the last visit. Need at least
       departure + one stop before a return makes sense. */
    if (canCommit) commitActive();
    if (entries.length < 2) return;
    mode = 'return';
    activeStopId = '';
    activeDate = '';
  }

  /* One-way save: commit the active step and dispatch immediately
     with no return entries. The user is telling us they're not
     coming back this way - the trip ends at the last stop they
     picked. */
  async function finishOneWay() {
    if (submitting) return;
    if (canCommit) commitActive();
    if (entries.length < 2) return;
    submitting = true;
    dispatch('save', {
      stops: entries,
      returnStops: []
    });
  }

  function backFromReturn() {
    /* Going back from the return picker drops any in-flight active
       return step but keeps committed return entries so the user
       doesn't lose work by tapping Back. */
    mode = 'pick';
    activeStopId = '';
    activeDate = '';
  }

  function editEntry(idx) {
    /* Pull an outbound entry back into the active step so the user
       can tweak it; drop everything after it - both the rest of the
       outbound AND every committed return entry, because their
       dates / stations may no longer make sense once the outbound
       leg is being reworked. */
    const entry = entries[idx];
    if (!entry) return;
    activeStopId = entry.stopId;
    activeDate = entry.date;
    entries = entries.slice(0, idx);
    returnEntries = [];
    mode = 'pick';
  }

  function editReturnEntry(idx) {
    const entry = returnEntries[idx];
    if (!entry) return;
    activeStopId = entry.stopId;
    activeDate = entry.date;
    returnEntries = returnEntries.slice(0, idx);
    mode = 'return';
  }

  /* Remove a single committed entry without touching the rest.
     This is the lightweight reorder path - rather than dragging
     chips around (fragile on iOS), the user removes the wrong-
     placed entry and re-adds it where it belongs. */
  function removeEntry(idx) {
    entries = entries.filter((_, i) => i !== idx);
    /* If we removed the last outbound stop, the return leg's
       starting reference is also gone; safest to drop it too so
       dates don't strand. */
    if (entries.length < 2) returnEntries = [];
  }
  function removeReturnEntry(idx) {
    returnEntries = returnEntries.filter((_, i) => i !== idx);
  }

  function close() {
    if (submitting) return;
    dispatch('close');
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  async function handleSave() {
    if (submitting) return;
    if (entries.length < 2) return;
    if (mode !== 'return') return;
    /* Commit the active return step on save so the user doesn't
       have to tap "+ Add another return stop" before Save trip when
       they only want one return entry. */
    if (canCommit) commitActive();
    if (returnEntries.length < 1) return;
    submitting = true;
    const lastReturn = returnEntries[returnEntries.length - 1];
    dispatch('save', {
      stops: entries,
      returnStops: returnEntries,
      returnDate: lastReturn.date,
      returnStopId: lastReturn.stopId
    });
  }

  function stopName(id) {
    const s = STOPS.find((x) => x.id === id);
    return s ? s.name : id;
  }

  function formatDate(d) {
    if (!d) return '';
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
        month: 'short',
        day: 'numeric'
      });
    } catch (_) {
      return d;
    }
  }
</script>

<svelte:window on:keydown={onKey} />

<div
  class="fixed inset-0 z-[200] flex items-center justify-center px-4 py-6"
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

    <header class="rp-head">
      <div>
        <span id="route-picker-title" class="rp-title">
          {#if mode === 'return'}
            {#if returnEntries.length === 0}
              Return Trip
            {:else}
              Return Stop {returnEntries.length + 1}
            {/if}
          {:else if entries.length === 0}
            Departing From
          {:else}
            Stop {entries.length}
          {/if}
        </span>
        <span class="rp-step">
          {#if mode === 'return'}
            {#if returnEntries.length === 0}
              Pick the first place you'll get off on the way back, and the day you arrive.
            {:else}
              Add another stop on the way back, or save to finish.
            {/if}
          {:else if entries.length === 0}
            Where you board the train, and the day you leave.
          {:else}
            Pick where you'll get off, and the day you arrive there.
          {/if}
        </span>
      </div>
      <button
        type="button"
        class="rp-close"
        on:click={close}
        aria-label="Close"
      >&times;</button>
    </header>

    {#if entries.length > 0 || returnEntries.length > 0}
      <div class="rp-trail">
        {#each entries as e, i}
          <div class="rp-chip-wrap">
            <button
              type="button"
              class="rp-chip"
              on:click={() => editEntry(i)}
              title="Edit this stop and everything after"
            >
              <span class="rp-chip-label">
                {i === 0 ? 'Depart' : `Stop ${i}`}
              </span>
              <span class="rp-chip-name">{stopName(e.stopId)}</span>
              <span class="rp-chip-date">{formatDate(e.date)}</span>
            </button>
            <button
              type="button"
              class="rp-chip-x"
              on:click={() => removeEntry(i)}
              aria-label={`Remove ${stopName(e.stopId)} from the route`}
              title="Remove just this stop"
            >&times;</button>
          </div>
        {/each}
        {#if returnEntries.length > 0}
          <!-- Visual turnaround marker between outbound + return -->
          <span class="rp-trail-turn" aria-hidden="true">
            <svg viewBox="0 0 24 14" width="22" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7 H17"/>
              <path d="M14 3 L18 7 L14 11"/>
              <path d="M21 11 Q21 7 17 7"/>
            </svg>
          </span>
          {#each returnEntries as e, j}
            <div class="rp-chip-wrap">
              <button
                type="button"
                class="rp-chip rp-chip-return"
                on:click={() => editReturnEntry(j)}
                title="Edit this return stop"
              >
                <span class="rp-chip-label">
                  {j === returnEntries.length - 1 ? 'Return' : `Return ${j + 1}`}
                </span>
                <span class="rp-chip-name">{stopName(e.stopId)}</span>
                <span class="rp-chip-date">{formatDate(e.date)}</span>
              </button>
              <button
                type="button"
                class="rp-chip-x"
                on:click={() => removeReturnEntry(j)}
                aria-label={`Remove return stop ${stopName(e.stopId)}`}
                title="Remove just this return stop"
              >&times;</button>
            </div>
          {/each}
        {/if}
        {#if (mode === 'pick' && entries.length > 0) || (mode === 'return' && returnEntries.length > 0)}
          <span class="rp-trail-hint">Tap a chip to edit</span>
        {/if}
      </div>
    {/if}

    <div class="rp-body">
      <label class="rp-date-label">
        <span class="rp-date-kicker">
          {#if mode === 'return'}
            {returnEntries.length === 0 ? 'Return arrival date' : 'Next return stop date'}
          {:else}
            {entries.length === 0 ? 'Departure date' : 'Arrival date'}
          {/if}
        </span>
        <input
          type="date"
          class="rp-date-input {mode === 'return' && returnEntries.length === 0 ? 'rp-date-input--big' : ''}"
          bind:value={activeDate}
          min={minDate}
        />
        {#if activeDate && activeDate < minDate}
          <span class="rp-date-error">Must be on or after {formatDate(minDate)}.</span>
        {/if}
      </label>

      <div class="rp-station-kicker">
        {mode === 'return' ? 'Return station' : 'Station'}
      </div>
      {#if mode === 'return' && returnEntries.length === 0}
        <p class="rp-return-hint">
          Most travellers return to <strong>{stopName(entries[0]?.stopId)}</strong> (where you boarded). Pick a different stop if you're ending the trip somewhere else, or break the trip up with a stopover.
        </p>
      {/if}
      <ol class="rp-list">
        {#each STOPS as stop}
          {@const isPrev = stop.id === prevStopId}
          <li>
            <button
              type="button"
              class="rp-row"
              class:is-on={stop.id === activeStopId}
              class:is-disabled={isPrev}
              on:click={() => pick(stop.id)}
              disabled={isPrev}
              aria-disabled={isPrev}
            >
              <span class="rp-dot" aria-hidden="true">
                {#if stop.id === activeStopId}
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 8 7 12 13 4"></polyline>
                  </svg>
                {/if}
              </span>
              <div class="rp-row-body">
                <span class="rp-row-name">
                  {stop.name}
                  {#if isPrev}<span class="rp-row-mark">You're already here</span>{/if}
                </span>
                <span class="rp-row-region">{stop.region}</span>
                <p class="rp-row-hook">{stop.hook}</p>
              </div>
            </button>
          </li>
        {/each}
      </ol>
    </div>

    <footer class="rp-foot">
      {#if mode === 'return'}
        <button
          type="button"
          class="rp-text-btn"
          on:click={backFromReturn}
          disabled={submitting}
        >Back</button>
        <div class="rp-foot-right">
          <!-- Add another return stop is enabled once the active step
               is a valid pick; tap commits and stays in return mode
               so the user can keep stringing return stops together. -->
          <button
            type="button"
            class="rp-add-stop"
            on:click={addAnotherStop}
            disabled={!canCommit}
            title="Pin this return stop and add another"
          >+ Add another return stop</button>
          <button
            type="button"
            class="btn-primary"
            on:click={handleSave}
            disabled={!canSaveReturn || submitting}
            title="Save the trip with the return route"
          >Save trip</button>
        </div>
      {:else}
        <button
          type="button"
          class="rp-text-btn"
          on:click={close}
          disabled={submitting}
        >Cancel</button>
        <div class="rp-foot-right">
          {#if entries.length === 0}
            <!-- First step: there's nothing to return to yet, so the
                 only path forward is to pin this stop and move on
                 to the next one. -->
            <button
              type="button"
              class="btn-primary"
              on:click={addAnotherStop}
              disabled={!canCommit}
              title="Pin this stop and pick the next one"
            >+ Add stop</button>
          {:else}
            <!-- Step 2+: user has picked at least one place to get off.
                 They can keep adding stops, finish as a one-way trip,
                 or close the loop with a return date. -->
            <button
              type="button"
              class="rp-add-stop"
              on:click={addAnotherStop}
              disabled={!canCommit}
              title="Pin this stop and add another"
            >+ Add another stop</button>
            <button
              type="button"
              class="rp-add-stop"
              on:click={finishOneWay}
              disabled={!canFinish || submitting}
              title="Save the trip with no return"
            >One-way</button>
            <button
              type="button"
              class="btn-primary"
              on:click={setReturn}
              disabled={!canFinish}
              title="Move on to the return date"
            >Set return  &rarr;</button>
          {/if}
        </div>
      {/if}
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

  /* ===== Head =====
     Deep rust matched to the footer band so the modal reads as a
     single boarding-pass identity (was #5e2a14, deepened to
     #4a1f0e on 2026-06-07 - the user wanted the band richer and
     more clearly the same colour on both ends). */
  .rp-head {
    background: #4a1f0e;
    padding: 18px 24px 16px;
    border-bottom: 3px double rgba(201, 168, 76, 0.55);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex: none;
  }
  .rp-title {
    display: block;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    color: #f5f0e8;
    font-size: 22px;
    line-height: 1.1;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .rp-step {
    display: block;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #ede0cc;
    font-size: 13.5px;
    margin-top: 4px;
  }
  .rp-close {
    background: transparent;
    border: 0;
    color: #f5f0e8;
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 6px;
  }
  .rp-close:hover { color: #c9a84c; }

  /* ===== Trail (entries so far) ===== */
  .rp-trail {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 12px 20px;
    background: #f3ece0;
    border-bottom: 1px dashed rgba(125, 58, 30, 0.3);
    align-items: center;
    flex: none;
  }
  .rp-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #fffdf6;
    border: 1.5px dashed rgba(125, 58, 30, 0.5);
    padding: 4px 10px;
    border-radius: 999px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12.5px;
    color: #0a2d21;
    cursor: pointer;
    transition: border-color 140ms ease, background 140ms ease;
  }
  .rp-chip:hover {
    border-color: #7d3a1e;
    background: rgba(125, 58, 30, 0.06);
  }
  .rp-chip-label {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-weight: 800;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
    margin-right: 2px;
  }
  .rp-chip-name { font-weight: 700; }
  .rp-chip-date {
    color: #5a4f3d;
    font-style: italic;
    font-family: 'Fraunces', Georgia, serif;
  }
  .rp-trail-hint {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    font-size: 11.5px;
    margin-left: auto;
  }
  /* Visual turnaround marker between outbound and return chips so
     the user can see at a glance where the trip turns back. */
  .rp-trail-turn {
    color: #7d3a1e;
    display: inline-flex;
    align-items: center;
    padding: 0 4px;
  }
  /* Return chips wear a forest accent on the kicker so they read as
     a different leg from the outbound rust accents above. */
  .rp-chip-return .rp-chip-label {
    color: #0a2d21;
  }
  .rp-chip-return {
    border-color: rgba(10, 45, 33, 0.45);
  }

  /* Chip wrapper holds the main chip + a small remove × so the
     user can drop a single entry from the route without restarting.
     The × sits half-overhanging the chip's top-right corner. */
  .rp-chip-wrap {
    position: relative;
    display: inline-flex;
  }
  .rp-chip-x {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fbf6ea;
    border: 1.5px solid rgba(125, 58, 30, 0.55);
    color: #7d3a1e;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 4px rgba(40, 30, 15, 0.18);
    transition: background 160ms ease, color 160ms ease;
    z-index: 2;
  }
  .rp-chip-x:hover {
    background: #7d3a1e;
    color: #fffdf6;
  }

  /* ===== Body ===== */
  .rp-body {
    overflow-y: auto;
    background: #fbf6ea;
    flex: 1;
    padding: 18px 24px 8px;
  }
  .rp-date-label {
    display: block;
    margin-bottom: 16px;
  }
  .rp-date-kicker {
    display: block;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #7d3a1e;
    margin-bottom: 6px;
  }
  .rp-date-input {
    width: 100%;
    background: #fffdf6;
    border: 1.5px solid #8b6a3a;
    border-radius: 3px;
    padding: 10px 12px;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 16px;
    color: #0a2d21;
    outline: none;
    transition: border-color 140ms ease;
  }
  .rp-date-input:focus { border-color: #7d3a1e; }
  .rp-date-input--big {
    font-size: 20px;
    padding: 14px 16px;
  }
  .rp-date-error {
    display: block;
    margin-top: 6px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #c4860f;
    font-size: 12.5px;
  }

  .rp-station-kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #7d3a1e;
    margin: 4px 0 10px;
  }

  .rp-list {
    list-style: none;
    padding: 0;
    margin: 0 0 12px;
    border-top: 1px dashed rgba(139, 106, 58, 0.35);
  }
  .rp-list li {
    border-bottom: 1px dashed rgba(139, 106, 58, 0.35);
  }
  .rp-row {
    width: 100%;
    background: transparent;
    border: 0;
    padding: 12px 4px;
    display: flex;
    gap: 14px;
    align-items: flex-start;
    cursor: pointer;
    text-align: left;
    color: inherit;
    transition: background 140ms ease;
  }
  .rp-row:hover:not(:disabled) { background: rgba(125, 58, 30, 0.05); }
  .rp-row.is-on { background: rgba(201, 168, 76, 0.14); }
  /* Disabled row = the station the user is at right now (just
     boarded or just arrived). Greyed so it reads as not-pickable
     while staying readable for context. */
  .rp-row.is-disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .rp-row.is-disabled .rp-row-name,
  .rp-row.is-disabled .rp-row-hook {
    color: #5a4f3d;
  }
  .rp-row-mark {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-style: normal;
    font-weight: 700;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #c4860f;
    margin-left: 8px;
    vertical-align: middle;
  }
  .rp-dot {
    margin-top: 3px;
    flex: none;
    width: 22px;
    height: 22px;
    border: 2px solid #8b6a3a;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: transparent;
    transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
  }
  .rp-dot svg { width: 13px; height: 13px; }
  .rp-row.is-on .rp-dot {
    border-color: #0a2d21;
    background: #c9a84c;
    color: #0a2d21;
  }
  .rp-row-body { flex: 1; min-width: 0; }
  .rp-row-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 1.05rem;
    color: #0a2d21;
    line-height: 1.15;
  }
  .rp-row-region {
    display: block;
    font-family: 'Spline Sans', system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 10px;
    font-weight: 700;
    color: #5a4f3d;
    margin-top: 2px;
  }
  .rp-row-hook {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12.5px;
    color: #241f1a;
    margin: 4px 0 0;
    line-height: 1.3;
  }

  /* ===== Return body =====
     Date input on top + a station picker reusing the same row
     pattern as the regular steps so the modal feels consistent.
     The station list defaults the selection to the departing
     stop, so most round-trips are a single tap from Done. */
  .rp-return-hint {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 0 0 14px;
    font-size: 13.5px;
    line-height: 1.45;
  }
  .rp-return-hint strong {
    font-weight: 700;
    font-style: normal;
    color: #0a2d21;
  }

  /* ===== Footer =====
     Same deep rust as the head so the two bands read as one band
     wrapping the cream body. Matched to #4a1f0e on 2026-06-07. */
  .rp-foot {
    background: #4a1f0e;
    border-top: 3px double rgba(201, 168, 76, 0.55);
    padding: 12px 20px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 14px;
    flex: none;
    color: #ede0cc;
  }
  .rp-foot-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  /* Base styles for the inline buttons. Defaults are tuned for the
     rust footer band the picker actually mounts in, so we don't
     need a second :global override that fights source order. Cancel
     / Back read as an italic ivory link; +Add stop reads as an
     ivory dashed pill that flips to a filled ivory chip on hover. */
  .rp-text-btn {
    background: transparent;
    border: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #f3e7cf;
    cursor: pointer;
    padding: 6px 8px;
    font-size: 14px;
  }
  .rp-text-btn:hover:not(:disabled) {
    color: #ffffff;
    text-decoration: underline;
  }
  .rp-text-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .rp-add-stop {
    background: transparent;
    border: 2px dashed #f3e7cf;
    color: #f3e7cf;
    padding: 0.65rem 1.2rem;
    border-radius: 4px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 0.92rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease, border-color 140ms ease, opacity 140ms ease;
  }
  .rp-add-stop:hover:not(:disabled) {
    background: #f3e7cf;
    color: #4a1f0e;
    border-color: #f3e7cf;
  }
  /* Disabled state stays readable - the label fades but doesn't
     dissolve. Previously Tailwind's .disabled\:opacity-50 dropped
     it to 50% which left "+ Add stop" almost unreadable on the
     dark band before the user filled in a date. */
  .rp-add-stop:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  /* Primary button: amber gold on forest so the call-to-action is
     impossible to miss on the dark band. Was forest-on-rust; the
     low contrast had the "+ Add stop" label disappearing into the
     band when disabled. */
  .rp-foot :global(.btn-primary) {
    background: #c9a84c;
    border-color: #c9a84c;
    color: #0a2d21;
    padding: 0.7rem 1.4rem;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  .rp-foot :global(.btn-primary:hover:not(:disabled)) {
    background: #d8b863;
    border-color: #d8b863;
  }
  .rp-foot :global(.btn-primary:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
