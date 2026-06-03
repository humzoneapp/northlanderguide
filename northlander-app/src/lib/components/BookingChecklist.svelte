<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import {
    listBookings,
    addBooking,
    toggleBooking,
    renameBooking,
    updateBooking,
    deleteBooking,
    BOOKING_KINDS
  } from '$lib/stores/bookings.js';
  import { getStopsByIds, getStop } from '$lib/data/stops.js';
  import { arrivalClock, arrivalMinutes, clockToMinutes } from '$lib/data/schedule.js';
  import BookingKindIcon from './BookingKindIcon.svelte';

  /** @type {string} */
  export let tripId;
  /** @type {string[]} - stops on this trip, so the picker only
      offers stops the user has actually added */
  export let stopIds = [];
  /** @type {'northbound' | 'southbound'} - drives the per-row
      conflict check below; we flag a booking whose startTime is
      earlier than the train's projected arrival at its stop. */
  export let direction = 'northbound';
  /** @type {string} - HH:MM 24h. Defaults at usage to the canonical
      direction departure. */
  export let departureClock = '';
  /** @type {string} - When set, the list narrows to bookings pinned
      to this stop and the quick-add row auto-pins new bookings here
      (hides the stop dropdown + "At {stop}" line on each row since
      the surrounding scene already names the stop). */
  export let stopFilter = '';

  const dispatch = createEventDispatcher();

  /** @type {import('$lib/stores/bookings.js').Booking[]} */
  let items = [];
  let loaded = false;
  let newTitle = '';
  let newKind = 'other';
  let newStop = '';
  let busy = false;

  $: tripStops = getStopsByIds(stopIds || []);

  let editingId = null;
  let editingDraft = '';

  /* Tracks which room-kind rows have their accommodation panel
     open. Keys are booking ids; truthy means open. Plain object
     so Svelte detects every toggle (re-assign to new object). */
  let expanded = {};

  function toggleExpanded(id) {
    expanded = { ...expanded, [id]: !expanded[id] };
  }

  $: tripId, refresh();
  $: visibleItems = stopFilter ? items.filter((i) => i.stopId === stopFilter) : items;
  $: total = visibleItems.length;
  $: bookedCount = visibleItems.filter((i) => i.status === 'booked').length;

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
      await addBooking(tripId, {
        title: clean,
        kind: newKind,
        stopId: stopFilter || newStop || null
      });
      newTitle = '';
      newKind = 'other';
      newStop = '';
      await refresh();
      dispatch('change');
    } finally {
      busy = false;
    }
  }

  function stopNameFor(id) {
    const s = id ? getStop(id) : null;
    return s ? s.name : '';
  }

  /* Per-row mirror of the cinematic scene's conflict check. Bookings
     pinned to the first stop on the trip are exempt (the train
     departs there). Returns the formatted arrival clock when in
     conflict, else ''. */
  function rowConflictClock(item) {
    if (!item || !item.startTime || !item.stopId) return '';
    if (!Array.isArray(stopIds) || stopIds.length === 0) return '';
    if (stopIds[0] === item.stopId) return '';
    const s = getStop(item.stopId);
    if (!s) return '';
    const arrive = arrivalMinutes(s.offsetMinutes, departureClock, direction);
    if (arrive == null) return '';
    const start = clockToMinutes(item.startTime);
    if (start == null) return '';
    if (start >= arrive) return '';
    return arrivalClock(s.offsetMinutes, departureClock, direction);
  }

  async function toggle(id) {
    await toggleBooking(id);
    await refresh();
    dispatch('change');
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
      dispatch('change');
    }
  }

  function cancelRename() {
    editingId = null;
    editingDraft = '';
  }

  async function remove(id) {
    await deleteBooking(id);
    await refresh();
    dispatch('change');
  }

  /* Save handler for the room-detail fields. Fires on blur per
     field so the user gets snappy feedback without having to
     hunt for a Save button. Mutates the local item in-place to
     keep the row's local view in sync without a full refetch. */
  async function saveRoomField(id, field, value) {
    const updated = await updateBooking(id, { [field]: value });
    if (updated) {
      const idx = items.findIndex((i) => i.id === id);
      if (idx >= 0) {
        items[idx] = updated;
        items = items;
      }
      dispatch('change');
    }
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
    {#if visibleItems.length === 0}
      <p class="font-serif italic text-muted mb-3">
        {#if stopFilter}
          Nothing pinned to this stop yet. Add a plan below.
        {:else}
          Train tickets, rooms, restaurants. Nothing booked yet.
        {/if}
      </p>
    {:else}
      <ul class="book-list">
        {#each visibleItems as item (item.id)}
          {@const conflictAt = rowConflictClock(item)}
          <li
            class="book-row"
            class:is-booked={item.status === 'booked'}
            class:has-extras={item.kind === 'room'}
            class:is-expanded={item.kind === 'room' && expanded[item.id]}
            class:is-conflict={!!conflictAt}
          >
            <span class="book-icon" aria-label={kindLabel(item.kind)} title={kindLabel(item.kind)}>
              <BookingKindIcon kind={item.kind} size="1.25rem" />
            </span>

            <!-- Time pill - inline editor for the optional startTime.
                 Empty by default; users tap to enter HH:MM and the
                 cinematic scenes pick the value up to order plans
                 chronologically. -->
            <input
              type="time"
              class="book-time"
              class:is-set={!!item.startTime}
              value={item.startTime || ''}
              aria-label={`Time for ${item.title}`}
              title={item.startTime ? 'Tap to change time' : 'Tap to add a time'}
              on:change={(e) => saveRoomField(item.id, 'startTime', e.currentTarget.value)}
            />

            {#if editingId === item.id}
              <!-- svelte-ignore a11y-autofocus -->
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
                autofocus
              />
            {:else}
              <div class="book-title-stack">
                <button
                  type="button"
                  class="book-title"
                  on:click={() => startRename(item)}
                >{item.title}</button>
                {#if !stopFilter && item.stopId && stopNameFor(item.stopId)}
                  <span class="book-stop-line">At {stopNameFor(item.stopId)}</span>
                {/if}
                {#if conflictAt}
                  <span class="book-conflict-line" role="note">
                    Train doesn't arrive until {conflictAt}
                  </span>
                {/if}
              </div>
            {/if}

            <button
              type="button"
              class="status-pill"
              on:click={() => toggle(item.id)}
              aria-label={`Mark as ${item.status === 'booked' ? 'pending' : 'booked'}`}
            >
              {item.status === 'booked' ? 'Booked' : 'Pending'}
            </button>

            {#if item.kind === 'room'}
              <button
                type="button"
                class="book-expand"
                class:is-open={expanded[item.id]}
                on:click={() => toggleExpanded(item.id)}
                aria-label={expanded[item.id] ? 'Hide room details' : 'Show room details'}
                aria-expanded={!!expanded[item.id]}
              >
                <svg viewBox="0 0 24 24" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            {/if}

            <button
              type="button"
              class="book-remove"
              on:click={() => remove(item.id)}
              aria-label={`Remove ${item.title}`}
            >&times;</button>

            {#if item.kind === 'room' && expanded[item.id]}
              <div class="book-extras">
                <div class="extras-grid">
                  {#if tripStops.length > 0}
                    <label class="extras-full">
                      <span class="extras-kicker">Pinned to</span>
                      <select
                        value={item.stopId || ''}
                        on:change={(e) => saveRoomField(item.id, 'stopId', e.currentTarget.value)}
                      >
                        <option value="">Not pinned to a stop</option>
                        {#each tripStops as s}
                          <option value={s.id}>At {s.name}</option>
                        {/each}
                      </select>
                    </label>
                  {/if}
                  <label>
                    <span class="extras-kicker">Check-in</span>
                    <input
                      type="date"
                      value={item.checkIn || ''}
                      on:blur={(e) => saveRoomField(item.id, 'checkIn', e.currentTarget.value)}
                      on:change={(e) => saveRoomField(item.id, 'checkIn', e.currentTarget.value)}
                    />
                  </label>
                  <label>
                    <span class="extras-kicker">Check-out</span>
                    <input
                      type="date"
                      value={item.checkOut || ''}
                      on:blur={(e) => saveRoomField(item.id, 'checkOut', e.currentTarget.value)}
                      on:change={(e) => saveRoomField(item.id, 'checkOut', e.currentTarget.value)}
                    />
                  </label>
                  <label class="extras-full">
                    <span class="extras-kicker">Address</span>
                    <input
                      type="text"
                      maxlength="240"
                      placeholder="123 Main St, Bracebridge ON"
                      value={item.address || ''}
                      on:blur={(e) => saveRoomField(item.id, 'address', e.currentTarget.value)}
                    />
                  </label>
                  <label>
                    <span class="extras-kicker">Host or contact</span>
                    <input
                      type="text"
                      maxlength="120"
                      placeholder="Phone, email, or host name"
                      value={item.contact || ''}
                      on:blur={(e) => saveRoomField(item.id, 'contact', e.currentTarget.value)}
                    />
                  </label>
                  <label>
                    <span class="extras-kicker">Confirmation #</span>
                    <input
                      type="text"
                      maxlength="60"
                      placeholder="Booking ref."
                      value={item.confirmation || ''}
                      on:blur={(e) => saveRoomField(item.id, 'confirmation', e.currentTarget.value)}
                    />
                  </label>
                  <label class="extras-full">
                    <span class="extras-kicker">Notes</span>
                    <textarea
                      rows="2"
                      maxlength="500"
                      placeholder="Parking, wifi password, late check-in instructions..."
                      value={item.notes || ''}
                      on:blur={(e) => saveRoomField(item.id, 'notes', e.currentTarget.value)}
                    ></textarea>
                  </label>
                </div>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <!-- Quick add row. When the trip has stops, an At-stop dropdown
         appears between Kind and Title so new bookings can be pinned
         to a stop at creation time. -->
    <form
      on:submit|preventDefault={handleAdd}
      class="book-add"
      class:has-stops={!stopFilter && tripStops.length > 0}
    >
      <select
        bind:value={newKind}
        class="book-kind"
        aria-label="Booking kind"
      >
        {#each BOOKING_KINDS as k}
          <option value={k.id}>{k.label}</option>
        {/each}
      </select>
      {#if !stopFilter && tripStops.length > 0}
        <select bind:value={newStop} class="book-stop" aria-label="Pin to stop">
          <option value="">Anywhere</option>
          {#each tripStops as s}
            <option value={s.id}>At {s.name}</option>
          {/each}
        </select>
      {/if}
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
    /* icon | time | title | status | remove */
    grid-template-columns: 28px auto 1fr auto auto;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px dashed rgba(139, 106, 58, 0.35);
  }
  .book-row.has-extras {
    /* + chevron column between status and remove for rooms */
    grid-template-columns: 28px auto 1fr auto auto auto;
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

  .book-title-stack {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
  }
  .book-stop-line {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 11.5px;
    color: #7d3a1e;
    line-height: 1.2;
    margin-top: 1px;
  }
  .book-row.is-booked .book-stop-line {
    color: #5a4f3d;
  }
  .book-conflict-line {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 11.5px;
    line-height: 1.2;
    margin-top: 2px;
    color: #b07614;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .book-conflict-line::before {
    content: '';
    width: 9px;
    height: 9px;
    background: #c9a84c;
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
    flex: none;
  }
  .book-row.is-conflict .book-time.is-set {
    background: rgba(176, 118, 20, 0.18);
    border-color: #b07614;
    color: #7a4f0c;
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
  .book-add.has-stops {
    grid-template-columns: auto auto 1fr auto;
  }
  .book-stop {
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
  .book-stop:focus {
    border-color: #7d3a1e;
  }
  @media (max-width: 540px) {
    .book-add,
    .book-add.has-stops {
      grid-template-columns: 1fr;
      gap: 8px;
    }
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

  /* ===== Room expand panel ===== */
  .book-expand {
    background: transparent;
    border: 1px dashed rgba(139, 106, 58, 0.6);
    border-radius: 50%;
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #7d3a1e;
    cursor: pointer;
    transition: transform 0.18s ease, background 0.15s, border-color 0.15s;
  }
  .book-expand:hover {
    background: rgba(125, 58, 30, 0.08);
    border-color: #7d3a1e;
  }
  .book-expand.is-open {
    transform: rotate(180deg);
    background: #0a2d21;
    border-color: #0a2d21;
    color: #c9a84c;
  }

  .book-row.is-expanded {
    background: rgba(196, 134, 15, 0.04);
  }

  /* Compact time pill in column 2 of every row. Empty state gets
     a dashed gold outline and a placeholder feel; once a value is
     set we switch to a filled amber tag so the schedule reads at
     a glance. The native time picker still pops on tap / focus. */
  .book-time {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #6e2e17;
    background: transparent;
    border: 1.5px dashed rgba(196, 134, 15, 0.55);
    border-radius: 999px;
    padding: 3px 8px;
    width: 84px;
    text-align: center;
    cursor: pointer;
    transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
  }
  .book-time:hover,
  .book-time:focus-visible {
    border-color: #c4860f;
    background: rgba(196, 134, 15, 0.08);
    outline: none;
  }
  .book-time.is-set {
    background: rgba(196, 134, 15, 0.18);
    border-color: #c4860f;
    border-style: solid;
    color: #0a2d21;
  }
  .book-row.is-booked .book-time {
    opacity: 0.65;
  }
  /* Webkit shows the up/down spinner by default - hide it to match
     the slim pill look. */
  .book-time::-webkit-calendar-picker-indicator {
    opacity: 0.6;
    margin-left: 2px;
  }

  .book-extras {
    grid-column: 1 / -1;
    padding: 12px 4px 6px 38px; /* indent under the icon */
    margin-top: 4px;
    border-top: 1px dashed rgba(139, 106, 58, 0.35);
  }
  .extras-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 14px;
  }
  .extras-grid .extras-full {
    grid-column: 1 / -1;
  }
  .extras-grid label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .extras-kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .extras-grid input,
  .extras-grid textarea {
    background: #fffdf6;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 6px 9px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 14px;
    color: #0a2d21;
    outline: none;
    width: 100%;
    transition: border-color 0.15s;
  }
  .extras-grid textarea {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    resize: vertical;
    min-height: 56px;
    line-height: 1.5;
  }
  .extras-grid input:focus,
  .extras-grid textarea:focus {
    border-color: #7d3a1e;
  }
  .extras-grid input::placeholder,
  .extras-grid textarea::placeholder {
    color: rgba(90, 79, 61, 0.5);
    font-style: italic;
  }

  @media (max-width: 540px) {
    .extras-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
