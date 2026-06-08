<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import {
    listBookings,
    addBooking,
    renameBooking,
    updateBooking,
    deleteBooking,
    restoreBooking,
    BOOKING_KINDS
  } from '$lib/stores/bookings.js';
  import { getStopsByIds, getStop } from '$lib/data/stops.js';
  import { arrivalClock, arrivalMinutes, clockToMinutes } from '$lib/data/schedule.js';
  import BookingKindIcon from './BookingKindIcon.svelte';
  import { pushToast } from '$lib/stores/toasts.js';

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
  /** @type {number} - Bump from the parent (via the trip page's
      dataVersion counter) to force this checklist to re-pull from
      IndexedDB. Used when an outside surface (AddPlanModal) mutates
      bookings while this checklist is mounted but unmounted-paint;
      Svelte's reactive `$:` on this value triggers refresh(). */
  export let refreshKey = 0;
  /** @type {boolean} - When wrapped in a parent Drawer that already
      prints "Bookings / Booking checklist" in its summary row,
      suppress the in-component header so it doesn't duplicate. */
  export let hideHeader = false;

  const dispatch = createEventDispatcher();

  /** @type {import('$lib/stores/bookings.js').Booking[]} */
  let items = [];
  let loaded = false;
  let newTitle = '';
  let newKind = 'other';
  let newStop = '';
  let newTime = '';
  let busy = false;

  $: tripStops = getStopsByIds(stopIds || []);

  let editingId = null;
  let editingDraft = '';

  /* Tracks which row's <input type="time"> is currently focused.
     When a row is in this state we show a small Done button next
     to the pill; tapping Done blurs the input so iOS / iPad
     Safari closes the native time popover without the user
     having to tap outside. Cleared on blur. */
  let timeFocusFor = null;
  /** @type {Object<number, HTMLInputElement>} */
  let timeInputs = {};
  function doneEditingTime(id) {
    const el = timeInputs[id];
    if (el && typeof el.blur === 'function') el.blur();
  }

  /* Tracks which room-kind rows have their accommodation panel
     open. Keys are booking ids; truthy means open. Plain object
     so Svelte detects every toggle (re-assign to new object). */
  let expanded = {};

  function toggleExpanded(id) {
    expanded = { ...expanded, [id]: !expanded[id] };
  }

  $: tripId, refreshKey, refresh();
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
        stopId: stopFilter || newStop || null,
        startTime: newTime || null
      });
      newTitle = '';
      newKind = 'other';
      newStop = '';
      newTime = '';
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
    const snapshot = await deleteBooking(id);
    await refresh();
    dispatch('change');
    if (snapshot) {
      pushToast({
        message: `Removed "${snapshot.title}".`,
        undo: async () => {
          await restoreBooking(snapshot);
          await refresh();
          dispatch('change');
        }
      });
    }
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
  {#if !hideHeader}
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
  {/if}

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
            class:has-extras={item.kind === 'room'}
            class:is-expanded={item.kind === 'room' && expanded[item.id]}
            class:is-conflict={!!conflictAt}
          >
            <span class="book-icon" aria-label={kindLabel(item.kind)} title={kindLabel(item.kind)}>
              <BookingKindIcon kind={item.kind} size="1.25rem" />
            </span>

            <!-- Time pill + Done button. The native <input
                 type="time"> on iOS / iPad opens a popover wheel
                 that the user otherwise has to tap outside to
                 close; the small Done pill that appears while the
                 input is focused calls .blur() so the popover
                 dismisses with one tap. Desktop browsers ignore
                 the Done button since the native picker is
                 already in place when the input has focus. -->
            <span class="book-time-wrap">
              <input
                type="time"
                class="book-time"
                class:is-set={!!item.startTime}
                value={item.startTime || ''}
                bind:this={timeInputs[item.id]}
                aria-label={`Time for ${item.title}`}
                title={item.startTime ? 'Tap to change time' : 'Tap to add a time'}
                on:focus={() => (timeFocusFor = item.id)}
                on:blur={() => { if (timeFocusFor === item.id) timeFocusFor = null; }}
                on:change={(e) => saveRoomField(item.id, 'startTime', e.currentTarget.value)}
              />
              {#if timeFocusFor === item.id}
                <button
                  type="button"
                  class="book-time-done"
                  on:mousedown|preventDefault={() => doneEditingTime(item.id)}
                  on:click={() => doneEditingTime(item.id)}
                >Done</button>
              {/if}
            </span>

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

    <!-- Quick add row. Five small kind buttons replace the old
         dropdown so the user can pick eat/sleep/do/train/other
         with a single tap (and read the choice at a glance), plus
         a time pill so users can set HH:MM at creation time. -->
    <form
      on:submit|preventDefault={handleAdd}
      class="book-add"
    >
      <div class="book-add-kinds" role="radiogroup" aria-label="Booking kind">
        {#each BOOKING_KINDS as k}
          <button
            type="button"
            class="book-add-kind"
            class:is-active={newKind === k.id}
            on:click={() => (newKind = k.id)}
            aria-label={k.label}
            aria-pressed={newKind === k.id}
            title={k.label}
          >
            <BookingKindIcon kind={k.id} size="1.1rem" />
          </button>
        {/each}
      </div>
      <label class="book-add-time-label">
        <span class="book-add-time-kicker">Pick a time</span>
        <input
          type="time"
          bind:value={newTime}
          class="book-add-time"
          class:is-set={!!newTime}
          aria-label="Time"
          title="Optional start time"
        />
      </label>
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

  /* The add row uses flex-wrap so the kind buttons + time pill +
     title input + Add button reflow onto two lines on narrow
     screens instead of squeezing into one. */
  .book-add {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 2px dashed rgba(139, 106, 58, 0.45);
  }
  /* Five small icon buttons for kind: train / room / meal /
     activity / other. Tap to select; the active one fills with
     forest. Replaces the old <select> Other dropdown. */
  .book-add-kinds {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
  }
  .book-add-kind {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1.5px dashed rgba(139, 106, 58, 0.55);
    background: transparent;
    color: #7d3a1e;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
  }
  .book-add-kind:hover {
    border-color: #7d3a1e;
    background: rgba(125, 58, 30, 0.08);
  }
  .book-add-kind.is-active {
    background: #0a2d21;
    border-color: #0a2d21;
    color: #c9a84c;
  }
  /* Wrapper around the add-row time pill so the user sees a kicker
     "Pick a time" above the input. Native <input type="time"> on
     iOS renders blank with no placeholder + no icon when there's
     no value, so without an external label the pill looks dead. */
  .book-add-time-label {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    min-width: 0;
  }
  .book-add-time-kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
    padding-left: 10px;
  }
  /* Time pill: same dashed-gold vocabulary as the row time pills
     so the add row reads as part of the same family. */
  .book-add-time {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #6e2e17;
    background-color: transparent;
    /* Small clock glyph baked in as a background image so the pill
       reads as a time picker even when empty - iOS otherwise paints
       no placeholder + no icon. The icon hides via the is-set rule
       below once the user picks a value, so HH:MM has the pill to
       itself. */
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%237d3a1e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 7 V12 L15 14'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: 8px center;
    background-size: 14px 14px;
    border: 1.5px dashed rgba(196, 134, 15, 0.55);
    border-radius: 999px;
    padding: 6px 12px 6px 28px;
    min-height: 36px;
    width: 110px;
    text-align: left;
    cursor: pointer;
    outline: none;
    transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
    -webkit-appearance: none;
    appearance: none;
  }
  .book-add-time:hover,
  .book-add-time:focus-visible {
    border-color: #c4860f;
    background-color: rgba(196, 134, 15, 0.08);
  }
  .book-add-time.is-set {
    background-color: rgba(196, 134, 15, 0.18);
    background-image: none;
    padding-left: 12px;
    text-align: center;
    border-color: #c4860f;
    border-style: solid;
    color: #0a2d21;
  }
  .book-add-time::-webkit-calendar-picker-indicator {
    opacity: 0;
    -webkit-appearance: none;
    width: 0;
    margin: 0;
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
    .book-add {
      gap: 8px;
    }
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
    flex: 1 1 200px;
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

  /* Compact time pill in column 2 of every row. Empty state shows
     a small clock glyph + "Time" so iOS users can see what the
     pill does even before they've picked a value (the native
     <input type="time"> renders no placeholder, no icon when
     empty). The .is-set rule below replaces the icon + label with
     the filled-in HH:MM. */
  .book-time {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #6e2e17;
    background-color: transparent;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' fill='none' stroke='%237d3a1e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 7 V12 L15 14'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: 8px center;
    background-size: 14px 14px;
    border: 1.5px dashed rgba(196, 134, 15, 0.55);
    border-radius: 999px;
    padding: 5px 12px 5px 28px;
    min-height: 32px;
    width: 100px;
    text-align: left;
    cursor: pointer;
    transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
    -webkit-appearance: none;
    appearance: none;
  }
  /* When empty on iOS, the input's content area stays blank. Use
     ::before pseudo to print "Time" beside the clock icon. */
  .book-time::-webkit-datetime-edit-fields-wrapper {
    color: inherit;
  }
  .book-time:hover,
  .book-time:focus-visible {
    border-color: #c4860f;
    background-color: rgba(196, 134, 15, 0.08);
    outline: none;
  }
  .book-time.is-set {
    background-color: rgba(196, 134, 15, 0.18);
    background-image: none;
    padding-left: 12px;
    text-align: center;
    border-color: #c4860f;
    border-style: solid;
    color: #0a2d21;
  }
  .book-time::-webkit-calendar-picker-indicator {
    opacity: 0;
    -webkit-appearance: none;
    width: 0;
    margin: 0;
  }
  /* Wrap is inline-flex so the Done pill sits flush next to the
     time input without affecting other row cells. */
  .book-time-wrap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  /* Done pill - only visible while the input is focused (Svelte
     mounts it conditionally). mousedown|preventDefault on the
     button keeps the input from blurring before the click
     handler reads, so the explicit .blur() call fires. */
  .book-time-done {
    background: #0a2d21;
    color: #f5f0e8;
    border: 1.5px solid #0a2d21;
    border-radius: 999px;
    padding: 3px 10px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .book-time-done:hover { background: #1f3d2d; border-color: #1f3d2d; }
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
