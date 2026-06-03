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

  /** @type {{ stopId: string, date: string }[]} - existing route, if any */
  export let stops = [];
  /** @type {string} */
  export let returnDate = '';

  const dispatch = createEventDispatcher();

  /* Mode:
       'pick'   - active step where the user picks station + date
       'return' - final step, only a date input
  */
  let mode = 'pick';

  /** @type {{ stopId: string, date: string }[]} - committed entries */
  let entries = [];

  /* Active step state, edited in place until the user commits with
     Add another stop / Set return date. */
  let activeStopId = '';
  let activeDate = '';

  /* Return-step state. */
  let returnDateDraft = '';

  let submitting = false;

  onMount(() => {
    if (Array.isArray(stops) && stops.length > 0) {
      entries = stops
        .filter((s) => s && s.stopId)
        .map((s) => ({ stopId: s.stopId, date: s.date || '' }));
    }
    returnDateDraft = returnDate || '';
    /* Start a fresh active step so the user can append, or open the
       return step if they already had a return date set. */
    activeStopId = '';
    activeDate = '';
  });

  $: stepNumber = entries.length + 1;
  $: minDate = (() => {
    if (entries.length === 0) return '';
    return entries[entries.length - 1].date || '';
  })();
  $: canCommit = !!activeStopId && !!activeDate && (!minDate || activeDate >= minDate);
  $: lastEntryDate = entries.length > 0 ? entries[entries.length - 1].date : '';
  $: canSaveReturn = !!returnDateDraft && (!lastEntryDate || returnDateDraft >= lastEntryDate);
  $: hasMinimumRoute = entries.length >= 1;

  function pick(id) {
    activeStopId = id;
  }

  function commitActive() {
    if (!canCommit) return;
    entries = [...entries, { stopId: activeStopId, date: activeDate }];
    activeStopId = '';
    activeDate = '';
  }

  function addAnotherStop() {
    commitActive();
  }

  function setReturn() {
    /* If the user filled in the active step, commit it first so the
       return date sits after the last visit. */
    if (canCommit) commitActive();
    if (!hasMinimumRoute) return;
    mode = 'return';
  }

  function backFromReturn() {
    mode = 'pick';
  }

  function removeEntry(idx) {
    entries = entries.filter((_, i) => i !== idx);
  }

  function editEntry(idx) {
    /* Pull the entry back into the active step so the user can tweak
       it; drop the entries that came after it since their dates may
       no longer make sense. */
    const entry = entries[idx];
    if (!entry) return;
    activeStopId = entry.stopId;
    activeDate = entry.date;
    entries = entries.slice(0, idx);
    mode = 'pick';
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
    if (!hasMinimumRoute) return;
    if (!canSaveReturn) return;
    submitting = true;
    dispatch('save', {
      stops: entries,
      returnDate: returnDateDraft,
      returnStopId: entries[0]?.stopId || ''
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
            Return Trip
          {:else if entries.length === 0}
            Departing From
          {:else}
            Next Stop
          {/if}
        </span>
        <span class="rp-step">
          {#if mode === 'return'}
            Final step &middot; When are you back at {stopName(entries[0]?.stopId)}?
          {:else}
            Step {stepNumber} &middot; Pick a station + the date you arrive
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

    {#if entries.length > 0}
      <div class="rp-trail">
        {#each entries as e, i}
          <button
            type="button"
            class="rp-chip"
            on:click={() => editEntry(i)}
            title="Edit this stop"
          >
            <span class="rp-chip-n">{i + 1}</span>
            <span class="rp-chip-name">{stopName(e.stopId)}</span>
            <span class="rp-chip-date">{formatDate(e.date)}</span>
          </button>
        {/each}
        {#if mode === 'pick' && entries.length > 0}
          <span class="rp-trail-hint">Tap a chip to edit</span>
        {/if}
      </div>
    {/if}

    {#if mode === 'return'}
      <div class="rp-body rp-return-body">
        <label class="rp-date-label">
          <span class="rp-date-kicker">Return date</span>
          <input
            type="date"
            class="rp-date-input rp-date-input--big"
            bind:value={returnDateDraft}
            min={lastEntryDate || undefined}
          />
        </label>
        <p class="rp-return-note">
          You'll be back at <strong>{stopName(entries[0]?.stopId)}</strong> on this date.
          {#if lastEntryDate}
            Last stop was on {formatDate(lastEntryDate)}.
          {/if}
        </p>
      </div>
    {:else}
      <div class="rp-body">
        <label class="rp-date-label">
          <span class="rp-date-kicker">
            {entries.length === 0 ? 'Departure date' : 'Arrival date'}
          </span>
          <input
            type="date"
            class="rp-date-input"
            bind:value={activeDate}
            min={minDate || undefined}
          />
          {#if minDate && activeDate && activeDate < minDate}
            <span class="rp-date-error">Must be on or after {formatDate(minDate)}.</span>
          {/if}
        </label>

        <div class="rp-station-kicker">Station</div>
        <ol class="rp-list">
          {#each STOPS as stop}
            <li>
              <button
                type="button"
                class="rp-row"
                class:is-on={stop.id === activeStopId}
                on:click={() => pick(stop.id)}
              >
                <span class="rp-dot" aria-hidden="true">
                  {#if stop.id === activeStopId}
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 8 7 12 13 4"></polyline>
                    </svg>
                  {/if}
                </span>
                <div class="rp-row-body">
                  <span class="rp-row-name">{stop.name}</span>
                  <span class="rp-row-region">{stop.region}</span>
                  <p class="rp-row-hook">{stop.hook}</p>
                </div>
              </button>
            </li>
          {/each}
        </ol>
      </div>
    {/if}

    <footer class="rp-foot">
      {#if mode === 'return'}
        <button
          type="button"
          class="rp-text-btn"
          on:click={backFromReturn}
          disabled={submitting}
        >Back</button>
        <div class="rp-foot-right">
          <button
            type="button"
            class="btn-primary disabled:opacity-50"
            on:click={handleSave}
            disabled={!canSaveReturn || submitting}
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
              class="btn-primary disabled:opacity-50"
              on:click={addAnotherStop}
              disabled={!canCommit}
              title="Pin this stop and pick the next one"
            >+ Add stop</button>
          {:else}
            <button
              type="button"
              class="rp-add-stop disabled:opacity-50"
              on:click={addAnotherStop}
              disabled={!canCommit}
              title="Pin this stop and add another"
            >+ Add another stop</button>
            <button
              type="button"
              class="btn-primary disabled:opacity-50"
              on:click={setReturn}
              disabled={!canCommit && !hasMinimumRoute}
              title="Move on to the return date"
            >Set return date  &rarr;</button>
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
     Lighter ivory text on forest so the title doesn't blend, with a
     gold double-rule beneath that ties into the cover banner. The
     close X is ivory so it reads on any state. */
  .rp-head {
    background: #0a2d21;
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
  .rp-chip-n {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
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
  .rp-row:hover { background: rgba(125, 58, 30, 0.05); }
  .rp-row.is-on { background: rgba(201, 168, 76, 0.14); }
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

  /* ===== Return body (just a date) ===== */
  .rp-return-body {
    padding: 32px 24px;
  }
  .rp-return-note {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 14px 0 0;
    font-size: 14px;
  }
  .rp-return-note strong {
    font-weight: 700;
    font-style: normal;
    color: #0a2d21;
  }

  /* ===== Footer ===== */
  .rp-foot {
    background: #fffdf6;
    border-top: 3px double rgba(201, 168, 76, 0.4);
    padding: 12px 20px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 14px;
    flex: none;
  }
  .rp-foot-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .rp-text-btn {
    background: transparent;
    border: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    cursor: pointer;
    padding: 6px 2px;
    font-size: 14px;
  }
  .rp-text-btn:hover { color: #7d3a1e; }
  /* Secondary button. Matches .btn-primary's square 4px radius +
     padding so the two footer buttons read as a pair. The dashed
     rust outline keeps it secondary (vs. the filled rust primary). */
  .rp-add-stop {
    background: transparent;
    border: 2px dashed #7d3a1e;
    color: #7d3a1e;
    padding: 0.85rem 1.5rem;
    border-radius: 4px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
  }
  .rp-add-stop:hover:not(:disabled) {
    background: #7d3a1e;
    border-color: #7d3a1e;
    color: #fffdf6;
  }
  .rp-add-stop:disabled { cursor: not-allowed; }
</style>
