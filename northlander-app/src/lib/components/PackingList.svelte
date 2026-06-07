<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import {
    listPackingItems,
    addPackingItem,
    togglePackingItem,
    renamePackingItem,
    deletePackingItem,
    restorePackingItem
  } from '$lib/stores/packing.js';
  import PackingPickerModal from './PackingPickerModal.svelte';
  import { pushToast } from '$lib/stores/toasts.js';

  /** @type {string} */
  export let tripId;
  /** @type {string[]} - trip's stop ids. Threads into the picker so
      it can surface stop-specific suggestions from the Guide. */
  export let stopIds = [];
  /** @type {string} - when set, this list filters to items whose
      `listName` matches; new items + picker additions auto-tag
      with the same name. Empty / unset = the default unnamed list. */
  export let listName = '';
  /** @type {{ stopId: string, date: string }[]} - trip's stops with
      dates. Threaded through to the picker so it can fetch weather
      forecasts and synthesize a "For the forecast" suggestion
      group when rain / snow / hot / cold is expected. */
  export let weatherStops = [];

  const dispatch = createEventDispatcher();

  let showPicker = false;

  /** @type {import('$lib/stores/packing.js').PackingItem[]} */
  let items = [];
  let loaded = false;
  let newName = '';
  let busy = false;

  /** id of the item currently being renamed inline, or null. */
  let editingId = null;
  let editingDraft = '';

  $: tripId, refresh();
  /* Visible slice = items belonging to this list. Default list
     (no listName prop) catches items with no listName set. */
  $: visibleItems = listName
    ? items.filter((i) => i.listName === listName)
    : items.filter((i) => !i.listName);
  $: total = visibleItems.length;
  $: packedCount = visibleItems.filter((i) => i.packed).length;

  onMount(refresh);

  async function refresh() {
    if (!tripId) {
      items = [];
      loaded = true;
      return;
    }
    items = await listPackingItems(tripId);
    loaded = true;
  }

  async function handleAdd() {
    if (busy) return;
    const clean = newName.trim();
    if (!clean) return;
    busy = true;
    try {
      await addPackingItem(tripId, clean, listName || null);
      newName = '';
      await refresh();
      dispatch('change');
    } finally {
      busy = false;
    }
  }

  async function toggle(id) {
    await togglePackingItem(id);
    await refresh();
    dispatch('change');
  }

  function startRename(item) {
    editingId = item.id;
    editingDraft = item.name;
  }

  async function commitRename() {
    if (editingId == null) return;
    const id = editingId;
    const draft = editingDraft;
    editingId = null;
    editingDraft = '';
    if (draft.trim()) {
      await renamePackingItem(id, draft);
      await refresh();
      dispatch('change');
    }
  }

  function cancelRename() {
    editingId = null;
    editingDraft = '';
  }

  async function remove(id) {
    const snapshot = await deletePackingItem(id);
    await refresh();
    dispatch('change');
    if (snapshot) {
      pushToast({
        message: `Removed "${snapshot.name}".`,
        undo: async () => {
          await restorePackingItem(snapshot);
          await refresh();
          dispatch('change');
        }
      });
    }
  }
</script>

<div>
  <div class="flex items-baseline justify-between mb-2">
    <div>
      <div class="kicker">Packing</div>
      <h3 class="font-serif font-bold text-forest text-xl">Packing list</h3>
    </div>
    {#if total > 0}
      <span class="font-serif italic text-rust text-sm flex-none">
        {packedCount} of {total} packed
      </span>
    {/if}
  </div>

  {#if loaded}
    {#if visibleItems.length === 0}
      <p class="font-serif italic text-muted mb-3">
        Your bag is empty. Toothbrush, train ticket, your better book...
      </p>
    {:else}
      <ul class="pack-list">
        {#each visibleItems as item (item.id)}
          <li class="pack-row" class:is-packed={item.packed}>
            <button
              type="button"
              class="check-token"
              on:click={() => toggle(item.id)}
              aria-label={item.packed ? `Unpack ${item.name}` : `Pack ${item.name}`}
              aria-pressed={item.packed}
            >
              {#if item.packed}
                <svg viewBox="0 0 16 16" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 8 7 12 13 4"></polyline>
                </svg>
              {/if}
            </button>

            {#if editingId === item.id}
              <!-- svelte-ignore a11y-autofocus -->
              <input
                type="text"
                bind:value={editingDraft}
                maxlength="80"
                class="pack-input"
                on:blur={commitRename}
                on:keydown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  if (e.key === 'Escape') cancelRename();
                }}
                autofocus
              />
            {:else}
              <button
                type="button"
                class="pack-name"
                on:click={() => startRename(item)}
                aria-label={`Rename ${item.name}`}
              >{item.name}</button>
            {/if}

            <button
              type="button"
              class="pack-remove"
              on:click={() => remove(item.id)}
              aria-label={`Remove ${item.name}`}
            >&times;</button>
          </li>
        {/each}
      </ul>
    {/if}

    <!-- Quick add input - always available at the bottom. The + is
         a real button now: tapping it opens the picker modal so
         users can pull curated items from the Guide's Pack List
         (one tap per item) without leaving the trip. The plain
         text input next to it still handles "type your own". -->
    <form on:submit|preventDefault={handleAdd} class="pack-add">
      <button
        type="button"
        class="pack-add-bullet pack-add-bullet-btn"
        on:click={() => (showPicker = true)}
        aria-label="Browse packing suggestions"
        title="Browse packing suggestions from the Guide"
      >+</button>
      <input
        type="text"
        bind:value={newName}
        maxlength="80"
        placeholder="Add an item..."
        class="pack-add-input"
      />
      <button
        type="submit"
        class="pack-add-btn"
        disabled={busy || !newName.trim()}
        aria-label="Add item"
      >Add</button>
    </form>
  {/if}
</div>

{#if showPicker}
  <PackingPickerModal
    {tripId}
    {stopIds}
    {listName}
    {weatherStops}
    on:change={() => { refresh(); dispatch('change'); }}
    on:close={() => { showPicker = false; refresh(); dispatch('change'); }}
  />
{/if}

<style>
  .pack-list {
    list-style: none;
    padding: 0;
    margin: 0 0 12px;
  }
  .pack-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px dashed rgba(139, 106, 58, 0.35);
  }
  .pack-row:last-child {
    border-bottom: 0;
  }
  .check-token {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid #8b6a3a;
    background: transparent;
    color: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .check-token:hover {
    border-color: #7d3a1e;
  }
  .pack-row.is-packed .check-token {
    border-color: #0a2d21;
    background: #c9a84c;
    color: #0a2d21;
  }
  .pack-name {
    flex: 1;
    min-width: 0;
    text-align: left;
    background: transparent;
    border: 0;
    padding: 4px 0;
    cursor: text;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 1rem;
    color: #241f1a;
    transition: color 0.15s;
  }
  .pack-name:hover {
    color: #7d3a1e;
  }
  .pack-row.is-packed .pack-name {
    text-decoration: line-through;
    text-decoration-color: #c9a84c;
    text-decoration-thickness: 2px;
    color: #5a4f3d;
  }
  .pack-input {
    flex: 1;
    min-width: 0;
    background: #fffdf6;
    border: 0;
    border-bottom: 2px solid #7d3a1e;
    padding: 4px 2px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 1rem;
    color: #241f1a;
    outline: none;
  }
  .pack-remove {
    flex: none;
    background: transparent;
    border: 0;
    color: rgba(139, 106, 58, 0.55);
    font-size: 20px;
    line-height: 1;
    padding: 4px 6px;
    cursor: pointer;
    transition: color 0.15s;
  }
  .pack-remove:hover {
    color: #7d3a1e;
  }

  .pack-add {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 2px dashed rgba(139, 106, 58, 0.45);
  }
  .pack-add-bullet {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px dashed #7d3a1e;
    color: #7d3a1e;
    background: transparent;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    padding: 0;
  }
  .pack-add-bullet-btn {
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease, border-color 140ms ease, transform 140ms ease;
  }
  .pack-add-bullet-btn:hover {
    background: #7d3a1e;
    color: #fffdf6;
    border-style: solid;
    transform: scale(1.06);
  }
  .pack-add-bullet-btn:focus-visible {
    outline: 2px solid #c9a84c;
    outline-offset: 2px;
  }
  .pack-add-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    padding: 4px 0;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 1rem;
    color: #241f1a;
    outline: none;
  }
  .pack-add-input::placeholder {
    color: rgba(90, 79, 61, 0.55);
    font-style: italic;
  }
  .pack-add-btn {
    flex: none;
    background: transparent;
    border: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 700;
    color: #7d3a1e;
    cursor: pointer;
    padding: 4px 8px;
    transition: color 0.15s;
  }
  .pack-add-btn:hover:not(:disabled) {
    color: #0a2d21;
  }
  .pack-add-btn:disabled {
    color: rgba(125, 58, 30, 0.4);
    cursor: not-allowed;
  }
</style>
