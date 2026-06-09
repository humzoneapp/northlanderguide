<script>
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { addBooking, BOOKING_KINDS } from '$lib/stores/bookings.js';
  import { getStopsByIds } from '$lib/data/stops.js';
  import BookingKindIcon from './BookingKindIcon.svelte';

  /** @type {string} */
  export let tripId;
  /** @type {string[]} - stops on the trip so the dropdown only
      offers stops the user has actually added */
  export let stopIds = [];
  /** @type {string} - When set, the booking auto-pins to this stop
      and the stop dropdown is suppressed (the surrounding scene
      already names the stop). */
  export let initialStop = '';

  const dispatch = createEventDispatcher();

  let title = '';
  let kind = 'other';
  let stopId = initialStop || '';
  let startTime = '';
  let address = '';
  let busy = false;

  /** @type {HTMLInputElement | undefined} */
  let titleInput;

  $: tripStops = getStopsByIds(stopIds || []);
  $: canSave = !!title.trim() && !busy;

  onMount(async () => {
    /* Skip autofocus on mobile so the soft keyboard doesn't pop up
       the instant the modal opens. Same pattern as AddPlanModal. */
    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(max-width: 720px)').matches) {
      await tick();
      titleInput?.focus();
    }
  });

  function close() {
    dispatch('close');
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  async function save() {
    if (!canSave) return;
    busy = true;
    try {
      await addBooking(tripId, {
        title: title.trim(),
        kind,
        stopId: stopId || null,
        startTime: startTime || null,
        address: address.trim() || null
      });
      dispatch('saved');
      close();
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window on:keydown={onKey} />

<div class="qb-overlay" role="dialog" aria-modal="true" aria-labelledby="qb-title">
  <button type="button" class="qb-backdrop" on:click={close} aria-label="Close"></button>

  <div class="qb-card">
    <header class="qb-head">
      <div>
        <span id="qb-title" class="qb-title">Add a Plan</span>
        <span class="qb-sub">Drop something onto your itinerary.</span>
      </div>
      <button type="button" class="qb-close" on:click={close} aria-label="Close">&times;</button>
    </header>

    <form class="qb-body" on:submit|preventDefault={save}>
      <!-- Kind row: 5 icon buttons mirroring the BookingChecklist
           inline picker so the vocabulary stays familiar. -->
      <fieldset class="qb-kinds" aria-label="Plan kind">
        {#each BOOKING_KINDS as k}
          <button
            type="button"
            class="qb-kind"
            class:is-active={kind === k.id}
            on:click={() => (kind = k.id)}
            aria-pressed={kind === k.id}
            title={k.label}
          >
            <BookingKindIcon kind={k.id} size="1.2rem" />
            <span class="qb-kind-label">{k.label}</span>
          </button>
        {/each}
      </fieldset>

      <label class="qb-field">
        <span class="qb-kicker">What's the plan</span>
        <input
          bind:this={titleInput}
          bind:value={title}
          type="text"
          maxlength="120"
          placeholder="Hotel Victoria, dinner at the Raven, train to Cochrane..."
          required
        />
      </label>

      <!-- Address - the one field that actually drives the map pin.
           Strongly encouraged via the kicker copy + hint, but stays
           optional so non-geographic bookings (a train ticket) can
           still get added without it. -->
      <label class="qb-field">
        <span class="qb-kicker">Address</span>
        <input
          bind:value={address}
          type="text"
          maxlength="240"
          placeholder="56 Yonge St, Toronto ON M5E 1G5"
        />
        <span class="qb-hint">Used to pin the plan on the chapter map. Skip it and we'll park the pin at the train station.</span>
      </label>

      <div class="qb-grid">
        {#if !initialStop && tripStops.length > 0}
          <label class="qb-field">
            <span class="qb-kicker">Pinned to</span>
            <select bind:value={stopId}>
              <option value="">Not pinned</option>
              {#each tripStops as s}
                <option value={s.id}>{s.name}</option>
              {/each}
            </select>
          </label>
        {/if}

        <label class="qb-field">
          <span class="qb-kicker">Time (optional)</span>
          <input
            type="time"
            class="qb-time"
            class:is-set={!!startTime}
            bind:value={startTime}
            aria-label="Time"
          />
        </label>
      </div>

      <footer class="qb-foot">
        <button type="button" class="qb-cancel" on:click={close}>Cancel</button>
        <button type="submit" class="btn-primary" disabled={!canSave}>Save plan</button>
      </footer>
    </form>
  </div>
</div>

<style>
  .qb-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .qb-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(10, 30, 20, 0.85);
    backdrop-filter: blur(4px);
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .qb-card {
    position: relative;
    z-index: 1;
    width: min(560px, 100%);
    max-height: calc(100vh - 32px);
    background: #fbf6ea;
    box-shadow: 0 28px 48px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .qb-head {
    background: #4a1f0e;
    color: #f5f0e8;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 20px;
    border-bottom: 3px double #c9a84c;
    flex: 0 0 auto;
  }
  .qb-title {
    display: block;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 18px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .qb-sub {
    display: block;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12px;
    color: #c9a84c;
    margin-top: 2px;
  }
  .qb-close {
    background: transparent;
    border: 0;
    color: #c9a84c;
    font-size: 24px;
    line-height: 1;
    padding: 4px 8px;
    cursor: pointer;
  }
  .qb-close:hover { color: #f5f0e8; }

  .qb-body {
    padding: 18px 20px 0;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .qb-kinds {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }
  .qb-kind {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 10px 6px;
    border: 1.5px dashed rgba(139, 106, 58, 0.55);
    background: transparent;
    color: #7d3a1e;
    cursor: pointer;
    border-radius: 4px;
    transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
  }
  .qb-kind:hover {
    border-color: #7d3a1e;
    background: rgba(125, 58, 30, 0.06);
  }
  .qb-kind.is-active {
    background: #0a2d21;
    border-color: #0a2d21;
    border-style: solid;
    color: #c9a84c;
  }
  .qb-kind-label {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .qb-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .qb-kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .qb-hint {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12.5px;
    color: #5a4f3d;
    margin-top: 2px;
    line-height: 1.4;
  }
  .qb-field input[type="text"],
  .qb-field input[type="time"],
  .qb-field select {
    background: #fffdf6;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 8px 10px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 14px;
    color: #0a2d21;
    outline: none;
    width: 100%;
    transition: border-color 0.15s;
  }
  .qb-field input::placeholder {
    color: rgba(90, 79, 61, 0.55);
    font-style: italic;
  }
  .qb-field input:focus,
  .qb-field select:focus {
    border-color: #7d3a1e;
  }

  .qb-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 14px;
  }
  @media (max-width: 480px) {
    .qb-grid {
      grid-template-columns: 1fr;
    }
  }

  .qb-time.is-set {
    border-color: #c4860f;
    background: rgba(196, 134, 15, 0.08);
    color: #0a2d21;
  }

  .qb-foot {
    background: #4a1f0e;
    color: #ede0cc;
    padding: 12px 20px;
    margin: 18px -20px 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    border-top: 3px double #c9a84c;
    flex-wrap: wrap;
  }
  .qb-foot :global(.btn-primary) {
    background: #c9a84c;
    border-color: #c9a84c;
    color: #0a2d21;
  }
  .qb-foot :global(.btn-primary:hover:not(:disabled)) {
    background: #d6b75a;
    border-color: #d6b75a;
  }
  .qb-foot :global(.btn-primary:disabled) {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .qb-cancel {
    background: transparent;
    border: 0;
    color: #f5f0e8;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 14px;
    cursor: pointer;
    padding: 6px 10px;
  }
  .qb-cancel:hover {
    color: #c9a84c;
  }
</style>
