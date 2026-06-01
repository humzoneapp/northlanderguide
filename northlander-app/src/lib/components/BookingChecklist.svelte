<script>
  import { onMount } from 'svelte';
  import {
    listBookings,
    addBooking,
    toggleBooking,
    renameBooking,
    deleteBooking,
    BOOKING_KINDS
  } from '$lib/stores/bookings.js';

  /** @type {string} */
  export let tripId;

  /** @type {import('$lib/stores/bookings.js').Booking[]} */
  let items = [];
  let loaded = false;
  let newTitle = '';
  let newKind = 'other';
  let busy = false;

  let editingId = null;
  let editingDraft = '';

  $: tripId, refresh();
  $: total = items.length;
  $: bookedCount = items.filter((i) => i.status === 'booked').length;

  onMount(refresh);

  async function refresh() {
    if (!tripId) {
      items = [];
      loaded = true;
      return;
    }
    items = await listBookings(tripId);
    loaded = true;
  }

  async function handleAdd() {
    if (busy) return;
    const clean = newTitle.trim();
    if (!clean) return;
    busy = true;
    try {
      await addBooking(tripId, { title: clean, kind: newKind });
      newTitle = '';
      newKind = 'other';
      await refresh();
    } finally {
      busy = false;
    }
  }

  async function toggle(id) {
    await toggleBooking(id);
    await refresh();
  }

  function startRename(item) {
    editingId = item.id;
    editingDraft = item.title;
  }

  async function commitRename() {
    if (editingId == null) return;
    const id = editingId;
    const draft = editingDraft;
    editingId = null;
    editingDraft = '';
    if (draft.trim()) {
      await renameBooking(id, draft);
      await refresh();
    }
  }

  function cancelRename() {
    editingId = null;
    editingDraft = '';
  }

  async function remove(id) {
    await deleteBooking(id);
    await refresh();
  }

  function kindLabel(id) {
    return (BOOKING_KINDS.find((k) => k.id === id) || BOOKING_KINDS[4]).label;
  }
</script>

<div>
  <div class="flex items-baseline justify-between mb-2">
    <div>
      <div class="kicker">Bookings</div>
      <h3 class="font-serif font-bold text-forest text-xl">Booking checklist</h3>
    </div>
    {#if total > 0}
      <span class="font-serif italic text-rust text-sm flex-none">
        {bookedCount} of {total} booked
      </span>
    {/if}
  </div>

  {#if loaded}
    {#if items.length === 0}
      <p class="font-serif italic text-muted mb-3">
        Train tickets, rooms, restaurants. Nothing booked yet.
      </p>
    {:else}
      <ul class="book-list">
        {#each items as item (item.id)}
          <li class="book-row" class:is-booked={item.status === 'booked'}>
            <span class="book-icon" aria-label={kindLabel(item.kind)} title={kindLabel(item.kind)}>
              {#if item.kind === 'train'}
                <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="4" y="3" width="16" height="14" rx="3"/>
                  <path d="M4 11 L20 11"/>
                  <circle cx="8.5" cy="20" r="1.4"/>
                  <circle cx="15.5" cy="20" r="1.4"/>
                  <path d="M7 17 L7 19"/>
                  <path d="M17 17 L17 19"/>
                </svg>
              {:else if item.kind === 'room'}
                <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 18 L3 10 L21 10 L21 18"/>
                  <path d="M3 18 L21 18"/>
                  <path d="M7 10 L7 7 L11 7 L11 10"/>
                </svg>
              {:else if item.kind === 'meal'}
                <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 3 L6 10 Q6 12 8 12 Q10 12 10 10 L10 3"/>
                  <path d="M8 12 L8 21"/>
                  <path d="M17 3 Q14 6 17 11 L17 21"/>
                </svg>
              {:else if item.kind === 'activity'}
                <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
                  <path d="M3 9 L3 11 Q5 11 5 13 Q5 15 3 15 L3 17 L21 17 L21 15 Q19 15 19 13 Q19 11 21 11 L21 9 Z"/>
                  <path d="M9 9 L9 17 M15 9 L15 17" stroke-dasharray="2 2"/>
                </svg>
              {:else}
                <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
                  <path d="M6 3 L18 3 L18 21 L12 17 L6 21 Z"/>
                </svg>
              {/if}
            </span>

            {#if editingId === item.id}
              <input
                type="text"
                bind:value={editingDraft}
                maxlength="120"
                class="book-input"
                on:blur={commitRename}
                on:keydown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  if (e.key === 'Escape') cancelRename();
                }}
                /* svelte-ignore a11y-autofocus */
                autofocus
              />
            {:else}
              <button
                type="button"
                class="book-title"
                on:click={() => startRename(item)}
              >{item.title}</button>
            {/if}

            <button
              type="button"
              class="status-pill"
              on:click={() => toggle(item.id)}
              aria-label={`Mark as ${item.status === 'booked' ? 'pending' : 'booked'}`}
            >
              {item.status === 'booked' ? 'Booked' : 'Pending'}
            </button>

            <button
              type="button"
              class="book-remove"
              on:click={() => remove(item.id)}
              aria-label={`Remove ${item.title}`}
            >&times;</button>
          </li>
        {/each}
      </ul>
    {/if}

    <!-- Quick add row -->
    <form on:submit|preventDefault={handleAdd} class="book-add">
      <select
        bind:value={newKind}
        class="book-kind"
        aria-label="Booking kind"
      >
        {#each BOOKING_KINDS as k}
          <option value={k.id}>{k.label}</option>
        {/each}
      </select>
      <input
        type="text"
        bind:value={newTitle}
        maxlength="120"
        placeholder="Add a booking..."
        class="book-add-input"
      />
      <button
        type="submit"
        class="book-add-btn"
        disabled={busy || !newTitle.trim()}
      >Add</button>
    </form>
  {/if}
</div>

<style>
  .book-list {
    list-style: none;
    padding: 0;
    margin: 0 0 12px;
  }
  .book-row {
    display: grid;
    grid-template-columns: 28px 1fr auto auto;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px dashed rgba(139, 106, 58, 0.35);
  }
  .book-row:last-child {
    border-bottom: 0;
  }
  .book-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #7d3a1e;
    width: 28px;
    height: 28px;
  }
  .book-row.is-booked .book-icon {
    color: #0a2d21;
  }
  .book-title {
    text-align: left;
    background: transparent;
    border: 0;
    padding: 4px 0;
    cursor: text;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 1rem;
    color: #241f1a;
    min-width: 0;
    overflow-wrap: anywhere;
    transition: color 0.15s;
  }
  .book-title:hover {
    color: #7d3a1e;
  }
  .book-row.is-booked .book-title {
    text-decoration: line-through;
    text-decoration-color: #c9a84c;
    text-decoration-thickness: 2px;
    color: #5a4f3d;
  }
  .book-input {
    background: #fffdf6;
    border: 0;
    border-bottom: 2px solid #7d3a1e;
    padding: 4px 2px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 1rem;
    color: #241f1a;
    outline: none;
    min-width: 0;
  }
  .status-pill {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.1s;
    white-space: nowrap;
    background: rgba(196, 134, 15, 0.18);
    color: #6e2e17;
    border: 1.5px dashed #c4860f;
  }
  .status-pill:hover {
    transform: translateY(-1px);
  }
  .book-row.is-booked .status-pill {
    background: #0a2d21;
    color: #f3ece0;
    border: 1.5px solid #0a2d21;
  }
  .book-remove {
    background: transparent;
    border: 0;
    color: rgba(139, 106, 58, 0.55);
    font-size: 20px;
    line-height: 1;
    padding: 4px 6px;
    cursor: pointer;
    transition: color 0.15s;
  }
  .book-remove:hover {
    color: #7d3a1e;
  }

  .book-add {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 2px dashed rgba(139, 106, 58, 0.45);
  }
  .book-kind {
    background: #fbf6ea;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: #0a2d21;
    padding: 6px 8px;
    cursor: pointer;
    outline: none;
  }
  .book-kind:focus {
    border-color: #7d3a1e;
  }
  .book-add-input {
    background: transparent;
    border: 0;
    padding: 4px 0;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 1rem;
    color: #241f1a;
    outline: none;
    min-width: 0;
  }
  .book-add-input::placeholder {
    color: rgba(90, 79, 61, 0.55);
    font-style: italic;
  }
  .book-add-btn {
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
  .book-add-btn:hover:not(:disabled) {
    color: #0a2d21;
  }
  .book-add-btn:disabled {
    color: rgba(125, 58, 30, 0.4);
    cursor: not-allowed;
  }
</style>
