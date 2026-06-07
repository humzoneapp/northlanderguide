<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import {
    loadEvents,
    eventsForStops,
    eventsInDateWindow,
    eventsInRange,
    sortEvents,
    formatEventDate,
    priceLabel
  } from '$lib/data/events.js';
  import { getStop } from '$lib/data/stops.js';
  import { addBooking } from '$lib/stores/bookings.js';
  import {
    listUserEvents,
    addUserEvent,
    deleteUserEvent,
    restoreUserEvent
  } from '$lib/stores/user-events.js';
  import { pushToast } from '$lib/stores/toasts.js';

  /** @type {string} */
  export let tripId;
  /** @type {string[]} */
  export let stopIds = [];
  /** @type {string|null} */
  export let departureDate = null;
  /** @type {string|null} - end of the per-stop stay window. When set
      alongside departureDate, only events between the two dates show. */
  export let endDate = null;

  const dispatch = createEventDispatcher();

  /** @type {Array} */
  let events = [];
  /** @type {import('$lib/stores/user-events.js').UserEvent[]} */
  let userEvents = [];
  let loading = true;
  let error = '';
  /* Saved tracker so the same event can't be added twice in a row. */
  let savedIds = {};

  /* "Add your own" form state. The form is hidden behind a pill so
     the user-events block doesn't push the Guide grid down when
     there's nothing to add. */
  let showAddForm = false;
  let formName = '';
  let formDate = departureDate || todayLocal();
  let formTime = '';
  let formVenue = '';
  let formAddress = '';
  let formUrl = '';
  let formDescription = '';
  let formBusy = false;

  function todayLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /* Pick the [start, end] YYYY-MM-DD window the user-events list
     should be gated to. When the parent passes both dates (the trip
     page does per chapter), use them verbatim. When endDate is
     missing, mirror eventsInDateWindow and synthesize a 7-day window
     forward from departureDate. When departureDate is missing too,
     return [null, null] so the filter passes everything (the user
     hasn't dated their route yet). */
  function userEventsWindow(start, end) {
    if (!start) return [null, null];
    if (end) return [start, end];
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
    if (!m) return [start, null];
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setDate(d.getDate() + 6);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return [start, `${y}-${mo}-${da}`];
  }

  $: tripId, stopIds, departureDate, endDate, refresh();

  onMount(refresh);

  async function refresh() {
    if (!Array.isArray(stopIds) || stopIds.length === 0) {
      events = [];
      userEvents = [];
      loading = false;
      return;
    }
    loading = true;
    error = '';
    try {
      const [data, ueRows] = await Promise.all([
        loadEvents(),
        tripId ? listUserEvents(tripId) : Promise.resolve([])
      ]);
      const forStops = eventsForStops(data, stopIds);
      const inWindow = (departureDate && endDate)
        ? eventsInRange(forStops, departureDate, endDate)
        : eventsInDateWindow(forStops, departureDate, 7);
      events = sortEvents(inWindow);
      /* Filter user events to the same stop set AND the same date
         window the Guide grid uses, so each chapter's strip only
         shows items that fall on the days the user is actually at
         the stop. When `endDate` is missing (one-way, last chapter),
         mirror the Guide's 7-day fallback from `departureDate`. */
      const ids = new Set(stopIds);
      const [winStart, winEnd] = userEventsWindow(departureDate, endDate);
      userEvents = ueRows.filter((u) => {
        if (u.stopId && !ids.has(u.stopId)) return false;
        if (!winStart) return true;
        const d = u.startDate;
        if (!d) return false;
        if (d < winStart) return false;
        if (winEnd && d > winEnd) return false;
        return true;
      });
    } catch (err) {
      error = "We couldn't fetch events from the Guide right now. Check your connection?";
      events = [];
    } finally {
      loading = false;
    }
  }

  async function submitUserEvent() {
    if (formBusy) return;
    const cleanName = formName.trim();
    if (!cleanName || !formDate) return;
    formBusy = true;
    try {
      await addUserEvent(tripId, {
        stopId: stopIds[0] || null,
        name: cleanName,
        startDate: formDate,
        startTime: formTime || null,
        venue: formVenue || null,
        address: formAddress || null,
        url: formUrl || null,
        description: formDescription || null
      });
      formName = '';
      formTime = '';
      formVenue = '';
      formAddress = '';
      formUrl = '';
      formDescription = '';
      showAddForm = false;
      await refresh();
      dispatch('change');
    } finally {
      formBusy = false;
    }
  }

  async function removeUserEvent(id) {
    /* Toast + Undo replaces the window.confirm two-step. The five-
       second dwell on the toast is the soft safety net. */
    const snapshot = await deleteUserEvent(id);
    await refresh();
    dispatch('change');
    if (snapshot) {
      pushToast({
        message: `Removed "${snapshot.name}".`,
        undo: async () => {
          await restoreUserEvent(snapshot);
          await refresh();
          dispatch('change');
        }
      });
    }
  }

  function formatUserEventDate(ev) {
    if (!ev || !ev.startDate) return '';
    const [y, m, d] = ev.startDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const now = new Date();
    const day = dt.toLocaleDateString('en-CA', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: dt.getFullYear() === now.getFullYear() ? undefined : 'numeric'
    });
    return ev.startTime ? `${day}  .  ${ev.startTime}` : day;
  }

  function userEventMapUrl(ev) {
    const parts = [ev.venue, ev.address].filter((s) => s && String(s).trim());
    if (parts.length === 0) return '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
  }

  function stopNameFor(id) {
    const s = id ? getStop(id) : null;
    return s ? s.name : '';
  }

  /* Universal Google Maps search URL. Works on iOS (deep-links to
     Apple Maps via the OS handler), Android (Google Maps), and
     desktop (opens in a tab). Falls back to '' when neither venue
     nor address is present so the icon can hide. */
  function mapUrlFor(ev) {
    const parts = [ev.venue, ev.address].filter((s) => s && String(s).trim());
    if (parts.length === 0) return '';
    const q = encodeURIComponent(parts.join(', '));
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  async function saveToTrip(ev) {
    if (savedIds[ev.id]) return;
    const title = ev.venue ? `${ev.name} - ${ev.venue}` : ev.name;
    await addBooking(tripId, { title, kind: 'activity', stopId: ev.stopId || null });
    savedIds = { ...savedIds, [ev.id]: true };
  }
</script>

<div>
  <div class="flex items-baseline justify-between mb-3">
    <div>
      <h3 class="font-serif font-bold text-forest text-xl">Events along your route</h3>
    </div>
  </div>

  {#if !departureDate}
    <p class="font-serif italic text-muted text-sm mb-3">
      Set dates in your route to narrow events to the days you're at this stop.
    </p>
  {/if}

  <!-- Your events: user-added items that sit above the Guide pull
       so the things they care about most are first on the page. -->
  <div class="user-events-block">
    <div class="sub-heading">
      <span class="sub-kicker">Your events</span>
      <span class="sub-rule" aria-hidden="true"></span>
      {#if userEvents.length > 0}
        <span class="sub-count">{userEvents.length} {userEvents.length === 1 ? 'pinned' : 'pinned'}</span>
      {/if}
    </div>

    {#if userEvents.length === 0 && !showAddForm}
      <p class="font-serif italic text-muted text-sm mb-3">
        Add a dinner reservation, a show, a meet-up. They'll sit in your chapter alongside Guide listings.
      </p>
    {/if}

    {#if userEvents.length > 0}
      <ul class="user-events-list">
        {#each userEvents as ue (ue.id)}
          <li class="user-event-card">
            <button
              type="button"
              class="user-event-remove"
              on:click={() => removeUserEvent(ue.id)}
              aria-label="Remove this event"
              title="Remove"
            >x</button>
            <div class="user-event-when">{formatUserEventDate(ue)}</div>
            <h4 class="user-event-name">{ue.name}</h4>
            {#if ue.venue}
              {@const mapUrl = userEventMapUrl(ue)}
              <div class="user-event-venue">
                <span>{ue.venue}{ue.address ? ` . ${ue.address}` : ''}</span>
                {#if mapUrl}
                  <a
                    class="event-map-btn"
                    href={mapUrl}
                    target="_blank"
                    rel="noopener"
                    aria-label={`Open ${ue.venue} on a map`}
                    title="Open on a map"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M12 21 C7 14 4 11 4 8 a8 8 0 0 1 16 0 c0 3 -3 6 -8 13 Z" />
                      <circle cx="12" cy="8" r="2.5" />
                    </svg>
                  </a>
                {/if}
              </div>
            {/if}
            {#if ue.description}
              <p class="user-event-desc">{ue.description}</p>
            {/if}
            {#if ue.url}
              <div class="user-event-foot">
                <a class="event-link" href={ue.url} target="_blank" rel="noopener">Open ↗</a>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if showAddForm}
      <form class="user-event-form" on:submit|preventDefault={submitUserEvent}>
        <label class="ue-field ue-field-wide">
          <span>What</span>
          <input type="text" bind:value={formName} placeholder="Dinner at Aux Trois Petits Bouchons" required />
        </label>
        <label class="ue-field">
          <span>Date</span>
          <input type="date" bind:value={formDate} required />
        </label>
        <label class="ue-field">
          <span>Time</span>
          <input type="time" bind:value={formTime} />
        </label>
        <label class="ue-field">
          <span>Venue</span>
          <input type="text" bind:value={formVenue} placeholder="Optional" />
        </label>
        <label class="ue-field">
          <span>Address</span>
          <input type="text" bind:value={formAddress} placeholder="Optional, used for the map pin" />
        </label>
        <label class="ue-field ue-field-wide">
          <span>Link</span>
          <input type="url" bind:value={formUrl} placeholder="https://" />
        </label>
        <label class="ue-field ue-field-wide">
          <span>Note</span>
          <textarea bind:value={formDescription} rows="2" placeholder="Reservation under the family name, etc."></textarea>
        </label>
        <div class="ue-form-actions">
          <button type="button" class="ue-cancel" on:click={() => (showAddForm = false)}>Cancel</button>
          <button type="submit" class="ue-save" disabled={formBusy || !formName.trim() || !formDate}>
            {formBusy ? 'Saving...' : 'Pin to trip'}
          </button>
        </div>
      </form>
    {:else}
      <button type="button" class="ue-add-pill" on:click={() => (showAddForm = true)}>
        + Add your own event
      </button>
    {/if}
  </div>

  <div class="sub-heading sub-heading-guide">
    <span class="sub-kicker">From the Guide</span>
    <span class="sub-rule" aria-hidden="true"></span>
    {#if !loading && events.length > 0}
      <span class="sub-count">{events.length} {events.length === 1 ? 'listing' : 'listings'}</span>
    {/if}
  </div>

  {#if loading}
    <p class="font-serif italic text-muted">Pulling listings from NorthlanderGuide.com...</p>
  {:else if error}
    <p class="font-serif italic text-rust">{error}</p>
  {:else if !stopIds || stopIds.length === 0}
    <p class="font-serif italic text-muted">
      Add stops to your trip and we'll pull events happening near them.
    </p>
  {:else if events.length === 0}
    <p class="font-serif italic text-muted">
      Nothing on the calendar at your stops for these dates. Try widening your departure window or browse the Guide directly.
    </p>
  {:else}
    <ul class="events-grid">
      {#each events as ev (ev.id)}
        <li class="event-card">
          {#if ev.imageUrl}
            <div class="event-img-wrap">
              <img src={ev.imageUrl} alt={ev.name} loading="lazy" decoding="async" />
              {#if ev.featured}
                <span class="event-featured" aria-label="Featured">Featured</span>
              {/if}
            </div>
          {:else}
            <div class="event-img-wrap event-img-blank" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="w-10 h-10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="5" width="18" height="16" rx="2"/>
                <path d="M3 9 L21 9"/>
                <path d="M8 3 L8 7 M16 3 L16 7"/>
              </svg>
            </div>
          {/if}

          <div class="event-body">
            <div class="event-when">{formatEventDate(ev)}</div>
            <h4 class="event-name">{ev.name}</h4>
            {#if ev.venue}
              {@const mapUrl = mapUrlFor(ev)}
              <div class="event-venue">
                <span>{ev.venue}</span>
                {#if mapUrl}
                  <a
                    class="event-map-btn"
                    href={mapUrl}
                    target="_blank"
                    rel="noopener"
                    aria-label={`Open ${ev.venue} on a map`}
                    title="Open on a map"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M12 21 C7 14 4 11 4 8 a8 8 0 0 1 16 0 c0 3 -3 6 -8 13 Z" />
                      <circle cx="12" cy="8" r="2.5" />
                    </svg>
                  </a>
                {/if}
              </div>
            {/if}

            <div class="event-pills">
              {#if stopNameFor(ev.stopId)}
                <span class="event-pill stop-pill">{stopNameFor(ev.stopId)}</span>
              {/if}
              {#if ev.walkMins != null}
                <span class="event-pill walk-pill">{ev.walkMins} min walk</span>
              {/if}
              {#if ev.familyFriendly}
                <span class="event-pill family-pill">Family friendly</span>
              {/if}
              {#if ev.recurring}
                <span class="event-pill recurring-pill">Recurring</span>
              {/if}
            </div>

            {#if ev.description}
              <p class="event-desc">{ev.description}</p>
            {/if}

            <div class="event-foot">
              {#if priceLabel(ev)}
                <span class="event-price" class:is-free={ev.free}>{priceLabel(ev)}</span>
              {:else}
                <span></span>
              {/if}
              <div class="event-actions">
                {#if ev.eventUrl}
                  <a
                    href={ev.eventUrl}
                    target="_blank"
                    rel="noopener"
                    class="event-link"
                  >Open ↗</a>
                {/if}
                <button
                  type="button"
                  class="event-save"
                  on:click={() => saveToTrip(ev)}
                  disabled={savedIds[ev.id]}
                >
                  {savedIds[ev.id] ? 'Saved' : '+ Save to trip'}
                </button>
              </div>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .events-grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 16px;
    grid-template-columns: 1fr;
  }
  @media (min-width: 720px) {
    .events-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  .event-card {
    background: #fbf6ea;
    border: 1px solid rgba(139, 106, 58, 0.35);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  }
  .event-card:hover {
    border-color: #7d3a1e;
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(40, 30, 20, 0.08);
  }

  .event-img-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #ede0cc;
    overflow: hidden;
  }
  .event-img-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .event-img-blank {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #7d3a1e;
  }
  .event-featured {
    position: absolute;
    top: 10px;
    left: 10px;
    background: #c4860f;
    color: #0a2d21;
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 2px;
  }

  .event-body {
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }
  .event-when {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .event-name {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 18px;
    font-weight: 700;
    color: #0a2d21;
    line-height: 1.2;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .event-venue {
    font-family: 'Spline Sans', sans-serif;
    font-size: 13px;
    color: #5a4f3d;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  /* Small pin glyph next to the venue. Tap opens the venue in a
     map (Google Maps universal URL works on iOS, Android, desktop).
     Sits next to the venue text so the affordance is obvious. */
  .event-map-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: 1.5px solid rgba(125, 58, 30, 0.55);
    border-radius: 50%;
    color: #7d3a1e;
    background: transparent;
    transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
    text-decoration: none;
  }
  .event-map-btn:hover {
    background: #7d3a1e;
    border-color: #7d3a1e;
    color: #fffdf6;
  }

  .event-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;
  }
  .event-pill {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12px;
    padding: 2px 9px;
    border-radius: 999px;
    border: 1px dashed rgba(139, 106, 58, 0.55);
    color: #0a2d21;
    background: rgba(251, 246, 234, 0.7);
    line-height: 1.4;
  }
  .stop-pill {
    background: rgba(196, 134, 15, 0.18);
    border-color: #c4860f;
  }
  .walk-pill {
    color: #7d3a1e;
    font-style: normal;
    font-family: 'Spline Sans', sans-serif;
    font-weight: 600;
    font-size: 11px;
  }
  .family-pill {
    background: rgba(63, 110, 68, 0.12);
    border-color: rgba(63, 110, 68, 0.6);
    color: #3f6e44;
    font-style: normal;
    font-family: 'Spline Sans', sans-serif;
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.04em;
  }
  .recurring-pill {
    background: rgba(10, 45, 33, 0.08);
    border-color: rgba(10, 45, 33, 0.4);
  }

  .event-desc {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 14px;
    line-height: 1.5;
    color: #241f1a;
    opacity: 0.82;
    margin: 4px 0 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .event-foot {
    margin-top: auto;
    padding-top: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-top: 1px dashed rgba(139, 106, 58, 0.35);
  }
  .event-price {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: #0a2d21;
    letter-spacing: 0.02em;
  }
  .event-price.is-free {
    color: #3f6e44;
  }
  .event-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }
  .event-link {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #7d3a1e;
    text-transform: uppercase;
    text-decoration: none;
  }
  .event-link:hover {
    color: #0a2d21;
  }
  .event-save {
    background: #7d3a1e;
    color: #f5f0e8;
    border: 1px solid #7d3a1e;
    border-radius: 3px;
    padding: 5px 12px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }
  .event-save:hover:not(:disabled) {
    background: #0a2d21;
    border-color: #0a2d21;
  }
  .event-save:disabled {
    background: rgba(63, 110, 68, 0.18);
    color: #3f6e44;
    border-color: #3f6e44;
    cursor: default;
  }

  /* Subheadings split the strip into "Your events" and
     "From the Guide" so the user-added items aren't lost under
     the Guide grid. Letterpress small caps + a dashed gold rule
     match the rest of the editorial vocabulary. */
  .sub-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 14px 0 10px;
  }
  .sub-heading-guide {
    margin-top: 22px;
  }
  .sub-kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #7d3a1e;
    white-space: nowrap;
  }
  .sub-rule {
    flex: 1;
    height: 1px;
    border-top: 1px dashed rgba(201, 168, 76, 0.7);
  }
  .sub-count {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12.5px;
    color: #7d3a1e;
    white-space: nowrap;
  }

  .user-events-block {
    margin-bottom: 4px;
  }
  .user-events-list {
    list-style: none;
    padding: 0;
    margin: 0 0 12px;
    display: grid;
    gap: 12px;
    grid-template-columns: 1fr;
  }
  @media (min-width: 720px) {
    .user-events-list {
      grid-template-columns: 1fr 1fr;
    }
  }

  .user-event-card {
    position: relative;
    background: #fbf6ea;
    border: 1px solid rgba(139, 106, 58, 0.35);
    border-left: 3px solid #c9a84c;
    padding: 12px 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .user-event-remove {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(125, 58, 30, 0.4);
    border-radius: 50%;
    background: transparent;
    color: #7d3a1e;
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    line-height: 1;
    transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
  }
  .user-event-remove:hover {
    background: #7d3a1e;
    border-color: #7d3a1e;
    color: #fffdf6;
  }
  .user-event-when {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .user-event-name {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 17px;
    font-weight: 700;
    color: #0a2d21;
    line-height: 1.25;
    margin: 0;
    padding-right: 26px;
    overflow-wrap: anywhere;
  }
  .user-event-venue {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12.5px;
    color: #5a4f3d;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .user-event-desc {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 13.5px;
    line-height: 1.45;
    color: #241f1a;
    opacity: 0.82;
    margin: 4px 0 0;
  }
  .user-event-foot {
    margin-top: 6px;
    padding-top: 8px;
    border-top: 1px dashed rgba(139, 106, 58, 0.35);
  }

  .ue-add-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px dashed rgba(125, 58, 30, 0.55);
    color: #7d3a1e;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 7px 14px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
  }
  .ue-add-pill:hover {
    background: #7d3a1e;
    border-color: #7d3a1e;
    color: #fffdf6;
  }

  .user-event-form {
    background: #fbf6ea;
    border: 1px solid rgba(139, 106, 58, 0.45);
    border-left: 3px solid #c9a84c;
    padding: 14px;
    display: grid;
    gap: 10px;
    grid-template-columns: 1fr 1fr;
    margin-bottom: 6px;
  }
  .ue-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ue-field-wide {
    grid-column: 1 / -1;
  }
  .ue-field > span {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .ue-field input,
  .ue-field textarea {
    border: 1px solid rgba(139, 106, 58, 0.45);
    background: #fffdf6;
    padding: 7px 9px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 13px;
    color: #241f1a;
    border-radius: 2px;
  }
  .ue-field input:focus,
  .ue-field textarea:focus {
    outline: 2px solid #c9a84c;
    outline-offset: 1px;
    border-color: #7d3a1e;
  }
  .ue-form-actions {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 2px;
  }
  .ue-cancel,
  .ue-save {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 7px 14px;
    border-radius: 3px;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .ue-cancel {
    background: transparent;
    color: #5a4f3d;
    border-color: rgba(90, 79, 61, 0.45);
  }
  .ue-cancel:hover {
    background: rgba(90, 79, 61, 0.08);
  }
  .ue-save {
    background: #0a2d21;
    color: #fffdf6;
    border-color: #0a2d21;
  }
  .ue-save:hover:not(:disabled) {
    background: #07241a;
  }
  .ue-save:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
</style>
