<script>
  /* ==================================================================
     Packing picker.

     Opens from the + on the PackingList. Surfaces the Guide's
     curated DONT_FORGET items for the trip's stops, grouped by
     trigger (any trip / season / stop-specific). Tap an item to
     add it to the user's packing list; the bottom row lets them
     type their own.

     We keep the modal's data in-flight even after add so the
     parent sees fresh items on close (PackingList re-fetches
     via on:change).
     ================================================================== */

  import { createEventDispatcher, onMount } from 'svelte';
  import {
    loadPackingItems,
    packingForStops,
    sortPackingItems,
    groupPackingItems,
    triggerLabel
  } from '$lib/data/packing.js';
  import { getStop } from '$lib/data/stops.js';
  import { addPackingItem, deletePackingItem, listPackingItems } from '$lib/stores/packing.js';

  /** @type {string} */
  export let tripId;
  /** @type {string[]} - stop ids on the trip, used to filter
      suggestions to the user's actual route. */
  export let stopIds = [];

  const dispatch = createEventDispatcher();

  let loading = true;
  let error = '';
  /** @type {Array} */
  let items = [];
  /** Map<group label, items[]> */
  let groups = new Map();

  /* Lowercased item name -> packing item id. Drives both the
     row's checked state AND the lookup we need to delete the row
     when the user unchecks it. Mounted from listPackingItems and
     mutated on every tap. */
  let existingItemIds = new Map();
  /* Per-row in-flight flag so a fast double-tap doesn't fire two
     simultaneous adds or deletes against the same name. */
  let pendingKeys = new Set();

  let customName = '';
  let customBusy = false;

  $: stopNames = (stopIds || []).map((id) => {
    const s = getStop(id);
    return s ? s.name : '';
  }).filter(Boolean);

  onMount(async () => {
    try {
      const [data, existing] = await Promise.all([
        loadPackingItems(),
        listPackingItems(tripId)
      ]);
      const map = new Map();
      for (const p of existing || []) {
        const k = String(p.name || '').trim().toLowerCase();
        if (k) map.set(k, p.id);
      }
      existingItemIds = map;
      const filtered = sortPackingItems(packingForStops(data, stopNames));
      items = filtered;
      groups = groupPackingItems(filtered);
    } catch (err) {
      error = "We couldn't load the packing suggestions from the Guide right now. Check your connection?";
    } finally {
      loading = false;
    }
  });

  function itemKey(it) {
    return String(it.item || '').trim().toLowerCase();
  }

  /* Toggle: tap adds, tap again removes. Tracks pendingKeys so a
     fast double-tap on the same row doesn't race two writes. The
     existingItemIds Map is reassigned with the spread trick on
     every mutation so Svelte's reactivity catches it. */
  async function toggleItem(it) {
    if (!tripId || !it || !it.item) return;
    const k = itemKey(it);
    if (pendingKeys.has(k)) return;
    pendingKeys = new Set([...pendingKeys, k]);
    try {
      if (existingItemIds.has(k)) {
        const id = existingItemIds.get(k);
        /* Optimistic remove. Roll back the Map entry on failure. */
        const prevId = id;
        const next = new Map(existingItemIds);
        next.delete(k);
        existingItemIds = next;
        try {
          await deletePackingItem(id);
        } catch (_) {
          const rb = new Map(existingItemIds);
          rb.set(k, prevId);
          existingItemIds = rb;
        }
      } else {
        const newId = await addPackingItem(tripId, it.item);
        if (newId != null) {
          const next = new Map(existingItemIds);
          next.set(k, newId);
          existingItemIds = next;
        }
      }
    } finally {
      const np = new Set(pendingKeys);
      np.delete(k);
      pendingKeys = np;
    }
  }

  async function addCustom() {
    if (customBusy) return;
    const clean = customName.trim();
    if (!clean) return;
    customBusy = true;
    try {
      const newId = await addPackingItem(tripId, clean);
      if (newId != null) {
        const k = clean.toLowerCase();
        const next = new Map(existingItemIds);
        next.set(k, newId);
        existingItemIds = next;
      }
      customName = '';
    } finally {
      customBusy = false;
    }
  }

  function close() {
    /* Tell the parent so it can refetch and update counts. */
    dispatch('change');
    dispatch('close');
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window on:keydown={onKey} />

<div
  class="pp-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="pp-title"
>
  <button
    type="button"
    class="pp-backdrop"
    on:click={close}
    aria-label="Close"
  ></button>

  <div class="pp-card">
    <header class="pp-head">
      <div>
        <span class="pp-kicker">Before you board</span>
        <h2 id="pp-title" class="pp-title">Pack the bag</h2>
        <p class="pp-sub">
          Tap an item to drop it on your packing list. Already-added
          items are marked.
        </p>
      </div>
      <button
        type="button"
        class="pp-close"
        on:click={close}
        aria-label="Close"
      >&times;</button>
    </header>

    <div class="pp-body">
      {#if loading}
        <p class="pp-status">Pulling suggestions from NorthlanderGuide.com...</p>
      {:else if error}
        <p class="pp-status pp-error">{error}</p>
      {:else if items.length === 0}
        <p class="pp-status">
          No curated suggestions for this route yet. You can still
          add your own below.
        </p>
      {:else}
        {#each [...groups] as [label, rows]}
          <section class="pp-group">
            <div class="pp-group-head">
              <span class="pp-group-label">{triggerLabel(label)}</span>
              <span class="pp-group-rule" aria-hidden="true"></span>
            </div>
            <ul class="pp-list">
              {#each rows as it (itemKey(it))}
                <!-- Inline the reactivity here so Svelte sees the
                     direct refs to existingItemIds + pendingKeys
                     (a function call from {@const} doesn't track
                     its internal deps and the checkmark would
                     stay stale after a tap). -->
                {@const k = itemKey(it)}
                {@const already = existingItemIds.has(k)}
                {@const pending = pendingKeys.has(k)}
                <li class="pp-row" class:is-on={already}>
                  <button
                    type="button"
                    class="pp-check"
                    on:click={() => toggleItem(it)}
                    aria-pressed={already}
                    aria-label={already ? `Remove ${it.item} from your list` : `Add ${it.item} to your list`}
                    disabled={pending}
                  >
                    {#if already}
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 8 7 12 13 4"></polyline>
                      </svg>
                    {/if}
                  </button>
                  <div class="pp-text">
                    <div class="pp-name-row">
                      <span class="pp-name">{it.item}</span>
                      {#if it.priority === 'Essential'}
                        <span class="pp-essential">Essential</span>
                      {/if}
                      {#if it.stop && it.stop !== 'All Stops'}
                        <span class="pp-stop">{it.stop}</span>
                      {/if}
                    </div>
                    {#if it.why}
                      <p class="pp-why">{it.why}</p>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      {/if}

      <!-- Custom add row. Always available, even on error states,
           so the modal never feels like a dead end. -->
      <form class="pp-custom" on:submit|preventDefault={addCustom}>
        <span class="pp-custom-kicker">Pack your own</span>
        <div class="pp-custom-row">
          <input
            type="text"
            bind:value={customName}
            maxlength="80"
            placeholder="Something specific to you..."
            class="pp-custom-input"
            disabled={customBusy}
          />
          <button
            type="submit"
            class="btn-primary disabled:opacity-50"
            disabled={customBusy || !customName.trim()}
          >Add to bag</button>
        </div>
      </form>
    </div>

    <footer class="pp-foot">
      <button
        type="button"
        class="btn-primary"
        on:click={close}
      >Done</button>
    </footer>
  </div>
</div>

<style>
  .pp-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .pp-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(10, 30, 20, 0.85);
    backdrop-filter: blur(4px);
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .pp-card {
    position: relative;
    z-index: 1;
    width: min(680px, 100%);
    max-height: calc(100vh - 32px);
    background: #fbf6ea;
    box-shadow: 0 28px 48px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
  }

  .pp-head {
    background: #0a2d21;
    color: #f5f0e8;
    padding: 18px 22px 16px;
    border-bottom: 3px double rgba(201, 168, 76, 0.55);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex: none;
  }
  .pp-kicker {
    display: block;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #c9a84c;
  }
  .pp-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    color: #f5f0e8;
    font-size: 22px;
    line-height: 1.15;
    margin: 4px 0 0;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .pp-sub {
    margin: 6px 0 0;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #ede0cc;
    font-size: 13.5px;
  }
  .pp-close {
    background: transparent;
    border: 0;
    color: #f5f0e8;
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 6px;
  }
  .pp-close:hover { color: #c9a84c; }

  .pp-body {
    overflow-y: auto;
    background: #fbf6ea;
    flex: 1;
    padding: 18px 22px 8px;
  }
  .pp-status {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 6px 0 16px;
  }
  .pp-error { color: #7d3a1e; }

  .pp-group {
    margin-bottom: 18px;
  }
  .pp-group-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .pp-group-label {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    color: #7d3a1e;
    font-size: 16px;
    flex: 0 0 auto;
  }
  .pp-group-rule {
    flex: 1;
    height: 0;
    border-top: 1px dashed rgba(125, 58, 30, 0.35);
  }

  .pp-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .pp-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px dashed rgba(139, 106, 58, 0.3);
  }
  .pp-row:last-child { border-bottom: 0; }
  .pp-check {
    flex: none;
    width: 24px;
    height: 24px;
    margin-top: 2px;
    border-radius: 50%;
    border: 2px solid #8b6a3a;
    background: transparent;
    color: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
  }
  .pp-check:hover:not(:disabled) {
    border-color: #7d3a1e;
  }
  .pp-row.is-on .pp-check {
    border-color: #0a2d21;
    background: #c9a84c;
    color: #0a2d21;
  }
  /* Soft hint that a checked token is still tappable: nudge to
     rust on hover so the user knows tapping uncheckes. */
  .pp-row.is-on .pp-check:hover:not(:disabled) {
    border-color: #6e2e17;
    background: #7d3a1e;
    color: #f5f0e8;
  }
  .pp-check:disabled { opacity: 0.6; }
  .pp-check svg { width: 13px; height: 13px; }

  .pp-text {
    flex: 1;
    min-width: 0;
  }
  .pp-name-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }
  .pp-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    color: #0a2d21;
    font-size: 16px;
    line-height: 1.2;
  }
  .pp-row.is-on .pp-name {
    color: #5a4f3d;
  }
  .pp-essential {
    background: #c9a84c;
    color: #0a2d21;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 2px;
  }
  .pp-stop {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .pp-why {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    font-size: 13px;
    margin: 4px 0 0;
    line-height: 1.45;
  }

  .pp-custom {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 2px dashed rgba(139, 106, 58, 0.45);
  }
  .pp-custom-kicker {
    display: block;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #7d3a1e;
    margin-bottom: 8px;
  }
  .pp-custom-row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .pp-custom-input {
    flex: 1;
    min-width: 200px;
    background: #fffdf6;
    border: 1.5px solid #8b6a3a;
    border-radius: 3px;
    padding: 10px 12px;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 15px;
    color: #0a2d21;
    outline: none;
  }
  .pp-custom-input:focus { border-color: #7d3a1e; }

  .pp-foot {
    background: #fffdf6;
    border-top: 3px double rgba(201, 168, 76, 0.4);
    padding: 12px 22px;
    display: flex;
    justify-content: flex-end;
    flex: none;
  }
</style>
