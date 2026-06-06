<script>
  import { onMount, tick, createEventDispatcher } from 'svelte';
  import {
    listDiaryEntries,
    addDiaryEntry,
    updateDiaryEntry,
    deleteDiaryEntry
  } from '$lib/stores/diary.js';
  import { getStopsByIds, getStop } from '$lib/data/stops.js';

  /** @type {string} */
  export let tripId;
  /** @type {string[]} - the trip's currently selected stops, so the
      "associate with stop" dropdown only offers stops in the suitcase */
  export let stopIds = [];
  /** @type {string} - When set, the feed narrows to notes pinned to
      this stop and new notes auto-pin here. The composer drops its
      stop dropdown and per-entry stop pills since the surrounding
      scene already names the stop. */
  export let stopFilter = '';
  /** @type {number} - Bump from the parent to force a refetch when
      an outside surface has mutated the diary while this view is
      mounted. See BookingChecklist for the same pattern. */
  export let refreshKey = 0;

  const dispatch = createEventDispatcher();

  /** @type {import('$lib/stores/diary.js').DiaryEntry[]} */
  let entries = [];
  let loaded = false;
  let saving = false;

  /* Today as YYYY-MM-DD in local time. Used to default the entry
     date input so quick notes still feel instant. */
  function todayLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /* Add-entry form state. */
  let draft = '';
  let draftStopId = '';
  let draftDate = todayLocal();

  /* Inline edit state. */
  let editingId = null;
  let editText = '';
  let editStopId = '';
  let editDate = '';

  /** @type {HTMLTextAreaElement | undefined} */
  let editTextarea;

  $: tripId, refreshKey, refresh();
  $: tripStops = getStopsByIds(stopIds);
  $: visibleEntries = stopFilter ? entries.filter((e) => e.stopId === stopFilter) : entries;

  onMount(refresh);

  async function refresh() {
    if (!tripId) {
      entries = [];
      loaded = true;
      return;
    }
    entries = await listDiaryEntries(tripId);
    loaded = true;
  }

  async function handleAdd() {
    if (saving) return;
    const text = draft.trim();
    if (!text) return;
    saving = true;
    try {
      await addDiaryEntry(tripId, {
        text,
        stopId: stopFilter || draftStopId || null,
        entryDate: draftDate || null
      });
      draft = '';
      draftStopId = '';
      draftDate = todayLocal();
      await refresh();
      dispatch('change');
    } finally {
      saving = false;
    }
  }

  async function startEdit(entry) {
    editingId = entry.id;
    editText = entry.text;
    editStopId = entry.stopId || '';
    editDate = entry.entryDate || '';
    await tick();
    editTextarea?.focus();
  }

  async function commitEdit() {
    if (editingId == null) return;
    const id = editingId;
    const text = editText;
    const stopId = stopFilter || editStopId || null;
    const entryDate = editDate || null;
    editingId = null;
    editText = '';
    editStopId = '';
    editDate = '';
    if (text.trim()) {
      await updateDiaryEntry(id, { text, stopId, entryDate });
      await refresh();
      dispatch('change');
    }
  }

  function cancelEdit() {
    editingId = null;
    editText = '';
    editStopId = '';
    editDate = '';
  }

  async function remove(id) {
    await deleteDiaryEntry(id);
    await refresh();
    dispatch('change');
  }

  function stopNameOrNull(id) {
    const s = id ? getStop(id) : null;
    return s ? s.name : null;
  }

  /* "Today" / "Yesterday" / "Sep 5" / "Aug 15 2024" relative to the
     viewer's local timezone. Keeps the feed readable without
     overwhelming each entry with the year for recent notes. */
  function formatEntryDate(entry) {
    if (!entry) return '';
    if (typeof entry.entryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.entryDate)) {
      return formatDate(new Date(entry.entryDate + 'T12:00:00').getTime());
    }
    return formatDate(entry.createdAt);
  }
  function formatDate(ms) {
    if (!ms) return '';
    const dt = new Date(ms);
    const now = new Date();
    const sameDay = dt.toDateString() === now.toDateString();
    if (sameDay) {
      return dt.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) + '  ·  Today';
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (dt.toDateString() === yesterday.toDateString()) {
      return dt.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) + '  ·  Yesterday';
    }
    const sameYear = dt.getFullYear() === now.getFullYear();
    return dt.toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: sameYear ? undefined : 'numeric'
    });
  }
</script>

<div>
  <div class="flex items-baseline justify-between mb-3">
    <div>
      <div class="kicker">Journey</div>
      <h3 class="font-serif font-bold text-forest text-xl">Travel diary</h3>
    </div>
    {#if loaded && visibleEntries.length > 0}
      <span class="font-serif italic text-rust text-sm flex-none">
        {visibleEntries.length} {visibleEntries.length === 1 ? 'note' : 'notes'}
      </span>
    {/if}
  </div>

  {#if loaded}
    <!-- Add-entry composer -->
    <form on:submit|preventDefault={handleAdd} class="diary-add">
      <textarea
        bind:value={draft}
        rows="3"
        maxlength="2000"
        placeholder="Pin a thought, a meal, a view from the window..."
        class="diary-textarea"
      ></textarea>
      <div class="diary-add-row">
        <label class="diary-date-pick">
          <span class="sr-only">Note date</span>
          <input
            type="date"
            class="diary-date-input"
            bind:value={draftDate}
            aria-label="Date of this note"
          />
        </label>
        {#if !stopFilter && tripStops.length > 0}
          <label class="diary-stop-pick">
            <span class="sr-only">Pin to a stop</span>
            <select bind:value={draftStopId} class="diary-select">
              <option value="">Anywhere on the trip</option>
              {#each tripStops as s}
                <option value={s.id}>At {s.name}</option>
              {/each}
            </select>
          </label>
        {:else if !stopFilter}
          <span class="font-serif italic text-muted text-sm">Add stops to your trip to pin notes to a place.</span>
        {:else}
          <span class="font-serif italic text-muted text-sm">Pinned to this stop.</span>
        {/if}
        <button
          type="submit"
          class="btn-primary disabled:opacity-50"
          disabled={saving || !draft.trim()}
        >
          {saving ? 'Pinning...' : 'Add note'}
        </button>
      </div>
    </form>

    <!-- Entries feed -->
    {#if visibleEntries.length === 0}
      <p class="font-serif italic text-muted mt-4">
        {#if stopFilter}
          Nothing here yet. Drop a thought in the composer above.
        {:else}
          No notes yet. The first one is always the hardest. Try: "Toronto Union, finally."
        {/if}
      </p>
    {:else}
      <ol class="diary-feed">
        {#each visibleEntries as entry (entry.id)}
          <li class="diary-entry" class:is-editing={editingId === entry.id}>
            {#if editingId === entry.id}
              <textarea
                bind:this={editTextarea}
                bind:value={editText}
                rows="3"
                maxlength="2000"
                class="diary-textarea"
                on:keydown={(e) => {
                  if (e.key === 'Escape') cancelEdit();
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitEdit(); }
                }}
              ></textarea>
              <div class="diary-add-row">
                <label class="diary-date-pick">
                  <span class="sr-only">Note date</span>
                  <input
                    type="date"
                    class="diary-date-input"
                    bind:value={editDate}
                    aria-label="Date of this note"
                  />
                </label>
                {#if !stopFilter && tripStops.length > 0}
                  <select bind:value={editStopId} class="diary-select">
                    <option value="">Anywhere on the trip</option>
                    {#each tripStops as s}
                      <option value={s.id}>At {s.name}</option>
                    {/each}
                  </select>
                {/if}
                <div class="ml-auto flex items-center gap-3">
                  <button type="button" class="font-serif italic text-muted hover:text-rust text-sm" on:click={cancelEdit}>Cancel</button>
                  <button type="button" class="btn-primary" on:click={commitEdit} disabled={!editText.trim()}>Save note</button>
                </div>
              </div>
            {:else}
              <div class="diary-meta">
                <span class="diary-date">{formatEntryDate(entry)}</span>
                {#if entry.stopId && stopNameOrNull(entry.stopId)}
                  <span class="diary-stop-pill">{stopNameOrNull(entry.stopId)}</span>
                {/if}
                {#if entry.updatedAt > entry.createdAt + 1000}
                  <span class="diary-edited">edited</span>
                {/if}
              </div>
              <p class="diary-text">{entry.text}</p>
              <div class="diary-actions">
                <button type="button" class="diary-action" on:click={() => startEdit(entry)}>Edit</button>
                <button type="button" class="diary-action" on:click={() => remove(entry.id)}>Delete</button>
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  {/if}
</div>

<style>
  .diary-add {
    background: #fbf6ea;
    border: 1.5px dashed rgba(139, 106, 58, 0.55);
    border-radius: 4px;
    padding: 14px 16px;
    margin-bottom: 18px;
  }
  .diary-textarea {
    width: 100%;
    background: transparent;
    border: 0;
    outline: none;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 16px;
    line-height: 1.55;
    color: #241f1a;
    resize: vertical;
    min-height: 72px;
  }
  .diary-textarea::placeholder {
    color: rgba(90, 79, 61, 0.55);
    font-style: italic;
  }
  .diary-add-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .diary-stop-pick {
    flex: 1;
    min-width: 0;
  }
  .diary-date-pick {
    flex: 0 0 auto;
  }
  .diary-date-input {
    background: #fffdf6;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 6px 10px;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 13px;
    color: #0a2d21;
    outline: none;
  }
  .diary-date-input:focus { border-color: #7d3a1e; }
  .diary-select {
    background: #fffdf6;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 6px 10px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #0a2d21;
    cursor: pointer;
    outline: none;
    max-width: 100%;
  }
  .diary-select:focus {
    border-color: #7d3a1e;
  }

  .diary-feed {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .diary-entry {
    position: relative;
    background: #fbf6ea;
    border-left: 4px solid #c4860f;
    padding: 14px 16px 12px;
    box-shadow: 0 4px 12px rgba(80, 50, 20, 0.06);
  }
  .diary-entry.is-editing {
    border-left-color: #7d3a1e;
    background: #fffdf6;
  }
  .diary-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 6px;
  }
  .diary-date {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .diary-stop-pill {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #0a2d21;
    background: rgba(196, 134, 15, 0.18);
    border: 1px dashed #c4860f;
    border-radius: 999px;
    padding: 2px 10px;
  }
  .diary-edited {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    color: rgba(90, 79, 61, 0.7);
    font-style: italic;
    text-transform: lowercase;
  }
  .diary-text {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 16px;
    line-height: 1.6;
    color: #241f1a;
    white-space: pre-wrap;
    margin: 0 0 8px;
  }
  .diary-actions {
    display: flex;
    gap: 14px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .diary-entry:hover .diary-actions,
  .diary-entry:focus-within .diary-actions {
    opacity: 1;
  }
  .diary-action {
    background: transparent;
    border: 0;
    padding: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #7d3a1e;
    cursor: pointer;
    transition: color 0.15s;
  }
  .diary-action:hover {
    color: #0a2d21;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
</style>
