<script>
  import { onMount } from 'svelte';
  import {
    loadEvents,
    eventsForStops,
    eventsInDateWindow,
    sortEvents,
    formatEventDate,
    priceLabel
  } from '$lib/data/events.js';
  import { getStop } from '$lib/data/stops.js';
  import { addBooking } from '$lib/stores/bookings.js';

  /** @type {string} */
  export let tripId;
  /** @type {string[]} */
  export let stopIds = [];
  /** @type {string|null} */
  export let departureDate = null;

  /** @type {Array} */
  let events = [];
  let loading = true;
  let error = '';
  /* Saved tracker so the same event can't be added twice in a row. */
  let savedIds = {};

  $: tripId, stopIds, departureDate, refresh();

  onMount(refresh);

  async function refresh() {
    if (!Array.isArray(stopIds) || stopIds.length === 0) {
      events = [];
      loading = false;
      return;
    }
    loading = true;
    error = '';
    try {
      const data = await loadEvents();
      const forStops = eventsForStops(data, stopIds);
      const inWindow = eventsInDateWindow(forStops, departureDate, 7);
      events = sortEvents(inWindow);
    } catch (err) {
      error = "We couldn't fetch events from the Guide right now. Check your connection?";
      events = [];
    } finally {
      loading = false;
    }
  }

  function stopNameFor(id) {
    const s = id ? getStop(id) : null;
    return s ? s.name : '';
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
      <div class="kicker">From the Guide</div>
      <h3 class="font-serif font-bold text-forest text-xl">Events along your route</h3>
    </div>
    {#if !loading && events.length > 0}
      <span class="font-serif italic text-rust text-sm flex-none">
        {events.length} {events.length === 1 ? 'event' : 'events'}
      </span>
    {/if}
  </div>

  {#if !departureDate}
    <p class="font-serif italic text-muted text-sm mb-3">
      Set a departure date on the schedule strip above to narrow events to your trip window.
    </p>
  {/if}

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
              <div class="event-venue">{ev.venue}</div>
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
</style>
