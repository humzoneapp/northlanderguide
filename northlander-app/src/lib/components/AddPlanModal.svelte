<script>
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import {
    loadListings,
    flattenListings,
    searchListings,
    listingImage,
    listingGuideUrl,
    listingKeyFor,
    categoryToKind,
    CATEGORY_MAP,
    KIND_TABS
  } from '$lib/data/listings.js';
  import { addBooking } from '$lib/stores/bookings.js';
  import { getStop, getStopsByIds } from '$lib/data/stops.js';

  /** @type {string} */
  export let tripId;
  /** @type {string[]} - stops on this trip, in route order */
  export let stopIds = [];
  /** @type {string} - the stop the user opened from, or '' for global */
  export let initialStop = '';
  /** @type {string} - id from KIND_TABS, e.g. 'eat', 'stay', 'do' */
  export let initialKind = 'all';
  /** @type {{ id: number, stopId: string|null, listingKey: string|null }[]} */
  export let existingBookings = [];

  const dispatch = createEventDispatcher();

  let stopFilter = initialStop || '__all__';
  let kindFilter = KIND_TABS.some((t) => t.id === initialKind) ? initialKind : 'all';
  let query = '';

  /** @type {Record<string, Record<string, any[]>>} */
  let data = null;
  let loading = true;
  let error = '';

  /* Set of listingKeys already on the trip. Updated in place when
     the user taps + so the badge flips without a re-query. */
  let addedKeys = new Set(
    (existingBookings || [])
      .filter((b) => b && b.listingKey)
      .map((b) => b.listingKey)
  );
  /* Per-listing-key toast state, briefly highlights the row that
     just got added. */
  let justAdded = new Set();

  /** @type {HTMLInputElement | undefined} */
  let searchInput;
  /** Stop-chip row, used to scoped-querySelector the chip we want
      to scroll into view. */
  let chipRow;

  $: tripStops = getStopsByIds(stopIds || []);

  /* Pick the best stop chip to surface for the current search
     query. Prefix matches win over substring matches so typing
     "br" jumps to Bracebridge rather than to a stop that happens
     to contain "br" mid-name. Returns null while the query is
     empty or too short to be useful (< 2 chars). Case-insensitive. */
  function findStopByQuery(q, stops) {
    const s = String(q || '').trim().toLowerCase();
    if (s.length < 2 || !Array.isArray(stops) || stops.length === 0) return null;
    let m = stops.find((stop) => String(stop.name || '').toLowerCase().startsWith(s));
    if (m) return m;
    m = stops.find((stop) => String(stop.name || '').toLowerCase().includes(s));
    return m || null;
  }

  /* The hinted stop is the one we'd nudge the user toward on the
     current query. Empty when nothing matches or when the match
     is already the active filter (no point hinting at the chip
     you've already tapped). */
  $: hintedStop = findStopByQuery(query, tripStops);
  $: hintedStopId = hintedStop && hintedStop.id !== stopFilter ? hintedStop.id : '';

  /* Smooth-scroll a chip into the visible region of the row.
     Scoped to the chip row so we don't accidentally scroll some
     other ap-chip elsewhere in the DOM. */
  async function scrollChipIntoView(id) {
    if (!id || !chipRow) return;
    await tick();
    const safeId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(id) : id;
    const el = chipRow.querySelector(`[data-stop-id="${safeId}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  /* Two scroll triggers: the active chip (so opening the modal
     with initialStop lands on that chip + tapping a chip recentres
     it), and the hinted chip (so typing a stop name brings that
     chip into view even before the user taps it). */
  $: scrollChipIntoView(stopFilter);
  $: scrollChipIntoView(hintedStopId);
  $: selectedStopIds = stopFilter === '__all__' ? (stopIds || []) : [stopFilter];
  $: catKeys = (KIND_TABS.find((t) => t.id === kindFilter) || KIND_TABS[0]).cats;
  $: rows = data ? searchListings(flattenListings(data, selectedStopIds, catKeys), query) : [];
  $: addedCount = addedKeys.size;
  $: openStopForGuide = stopFilter === '__all__'
    ? (selectedStopIds[0] || null)
    : stopFilter;

  onMount(async () => {
    try {
      data = await loadListings();
    } catch (err) {
      error = 'We couldn\'t fetch listings from the Guide. Check your connection?';
    } finally {
      loading = false;
      /* No mobile autofocus - keeps the soft keyboard down. */
      if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(max-width: 720px)').matches) {
        await tick();
        searchInput?.focus();
      }
      /* The reactive scrollChipIntoView only fires when stopFilter
         itself changes, so it misses the initial render where
         chipRow is the late-bound dependency. Kick it once
         explicitly so initialStop lands centred in the chip row. */
      await tick();
      scrollChipIntoView(stopFilter);
    }
  });

  function close() {
    dispatch('close');
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  async function handleAdd(row) {
    const key = listingKeyFor(row.stopId, row.listing.name);
    if (addedKeys.has(key)) return;
    const title = row.listing.address
      ? `${row.listing.name} - ${row.listing.address}`
      : row.listing.name;
    await addBooking(tripId, {
      title,
      kind: categoryToKind(row.catKey),
      stopId: row.stopId,
      listingKey: key
    });
    addedKeys = new Set([...addedKeys, key]);
    justAdded = new Set([...justAdded, key]);
    /* The toast highlight clears itself after ~1.5s so a burst of
       adds keeps each card lighting up briefly. */
    setTimeout(() => {
      justAdded.delete(key);
      justAdded = new Set(justAdded);
    }, 1500);
  }

  function stopNameFor(id) {
    const s = id ? getStop(id) : null;
    return s ? s.name : '';
  }

  function kindIconFor(catKey) {
    return (CATEGORY_MAP[catKey] && CATEGORY_MAP[catKey].icon) || 'other';
  }
  function catLabel(catKey) {
    return (CATEGORY_MAP[catKey] && CATEGORY_MAP[catKey].label) || 'Listing';
  }
</script>

<svelte:window on:keydown={onKey} />

<div class="ap-overlay" role="dialog" aria-modal="true" aria-labelledby="ap-title">
  <button
    type="button"
    class="ap-backdrop"
    on:click={close}
    aria-label="Close"
  ></button>

  <div class="ap-card">
    <!-- Forest header band -->
    <header class="ap-head">
      <div>
        <span id="ap-title" class="ap-title">Add a Plan</span>
        <span class="ap-sub">
          {#if loading}
            Loading listings from the Guide...
          {:else if rows.length === 0}
            From NorthlanderGuide.com
          {:else}
            {rows.length} {rows.length === 1 ? 'place' : 'places'} along your route
          {/if}
        </span>
      </div>
      <div class="ap-head-right">
        {#if addedCount > 0}
          <span class="ap-tally">
            <span class="ap-tally-num">{addedCount}</span>
            added
          </span>
        {/if}
        <button
          type="button"
          class="ap-close"
          on:click={close}
          aria-label="Close"
        >&times;</button>
      </div>
    </header>

    <!-- Stop chips. Auto-scrolls to the active chip when stopFilter
         changes and pulses the best stop-name match for the current
         search query so the user can spot "type 'tem', jump to
         Temagami." -->
    <div
      class="ap-chips"
      role="tablist"
      aria-label="Stop"
      bind:this={chipRow}
    >
      <button
        type="button"
        data-stop-id="__all__"
        class="ap-chip"
        class:is-active={stopFilter === '__all__'}
        on:click={() => (stopFilter = '__all__')}
        role="tab"
        aria-selected={stopFilter === '__all__'}
      >All stops</button>
      {#each tripStops as s}
        <button
          type="button"
          data-stop-id={s.id}
          class="ap-chip"
          class:is-active={stopFilter === s.id}
          class:is-hint={hintedStopId === s.id}
          on:click={() => (stopFilter = s.id)}
          role="tab"
          aria-selected={stopFilter === s.id}
        >{s.name}</button>
      {/each}
    </div>

    <!-- Kind tabs -->
    <div class="ap-tabs" role="tablist" aria-label="Category">
      {#each KIND_TABS as t}
        <button
          type="button"
          class="ap-tab"
          class:is-active={kindFilter === t.id}
          on:click={() => (kindFilter = t.id)}
          role="tab"
          aria-selected={kindFilter === t.id}
        >{t.label}</button>
      {/each}
    </div>

    <!-- Search -->
    <div class="ap-search">
      <input
        bind:this={searchInput}
        bind:value={query}
        type="text"
        maxlength="80"
        placeholder="Search by name, dish, neighbourhood..."
        aria-label="Search listings"
      />
      {#if openStopForGuide}
        <a
          href={listingGuideUrl(openStopForGuide, null)}
          target="_blank"
          rel="noopener"
          class="ap-guide-link"
        >Open {stopNameFor(openStopForGuide)} on the Guide &rarr;</a>
      {/if}
    </div>

    <!-- Body: listing cards -->
    <div class="ap-body">
      {#if loading}
        <p class="ap-status">Pulling listings from the Guide. The first browse can take a moment.</p>
      {:else if error}
        <p class="ap-status ap-error">{error}</p>
      {:else if !data}
        <p class="ap-status">No data.</p>
      {:else if (tripStops.length === 0)}
        <p class="ap-status">Add stops to your trip first. The picker pulls listings from the stops in your suitcase.</p>
      {:else if rows.length === 0}
        <p class="ap-status">
          {#if query}
            Nothing matches "{query}" at the chosen stops. Try a different word or clear the search.
          {:else}
            No listings here yet. Try another stop or the All category.
          {/if}
        </p>
      {:else}
        <ul class="ap-list">
          {#each rows as row (row.stopId + '|' + row.listing.name)}
            {@const key = listingKeyFor(row.stopId, row.listing.name)}
            {@const added = addedKeys.has(key)}
            {@const flash = justAdded.has(key)}
            {@const img = listingImage(row.listing)}
            <li class="ap-card-row" class:is-added={added} class:is-flash={flash}>
              {#if img}
                <img class="ap-thumb" src={img} alt={row.listing.name} loading="lazy" />
              {:else}
                <div class="ap-thumb ap-thumb-blank" aria-hidden="true">
                  <svg viewBox="0 0 24 24" class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2"/>
                    <circle cx="8.5" cy="11" r="1.5"/>
                    <path d="M21 17 L16 12 L5 19"/>
                  </svg>
                </div>
              {/if}

              <div class="ap-card-body">
                <div class="ap-card-meta">
                  <span class="ap-pill">{catLabel(row.catKey)}</span>
                  <span class="ap-meta-stop">{stopNameFor(row.stopId)}</span>
                  {#if row.listing.walkMins != null}
                    <span class="ap-meta-walk">{row.listing.walkMins} min walk</span>
                  {/if}
                  {#if row.listing.rating != null && row.listing.rating !== 'NR'}
                    <span class="ap-meta-rating">{Number(row.listing.rating).toFixed(1)} ★</span>
                  {/if}
                </div>
                <h3 class="ap-name">{row.listing.name}</h3>
                {#if row.listing.desc}
                  <p class="ap-desc">{row.listing.desc}</p>
                {/if}
                {#if row.listing.address}
                  <p class="ap-addr">{row.listing.address}</p>
                {/if}
              </div>

              <button
                type="button"
                class="ap-add"
                class:is-on={added}
                on:click={() => handleAdd(row)}
                aria-label={added ? `Already added: ${row.listing.name}` : `Add ${row.listing.name} to your trip`}
                disabled={added}
              >
                {#if added}
                  <svg viewBox="0 0 16 16" class="ap-add-icon" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 8 7 12 13 4"></polyline>
                  </svg>
                  <span>Added</span>
                {:else}
                  <span class="ap-add-plus">+</span>
                  <span>Add</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Done bar -->
    <footer class="ap-foot">
      <span class="ap-foot-hint">
        {#if addedCount > 0}
          Each tap drops a place on the right stop's scene. Tap Done when you're finished.
        {:else}
          Tap + on any listing to drop it onto your itinerary.
        {/if}
      </span>
      <button type="button" class="btn-primary" on:click={close}>Done</button>
    </footer>
  </div>
</div>

<style>
  .ap-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .ap-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(10, 30, 20, 0.85);
    backdrop-filter: blur(4px);
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .ap-card {
    position: relative;
    z-index: 1;
    width: min(960px, 100%);
    max-height: calc(100vh - 32px);
    background: #fbf6ea;
    box-shadow: 0 28px 48px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ===== Header ===== */
  .ap-head {
    background: #0a2d21;
    color: #f5f0e8;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 20px;
    border-bottom: 3px double #c9a84c;
  }
  .ap-title {
    display: block;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 18px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .ap-sub {
    display: block;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12px;
    color: #c9a84c;
    margin-top: 2px;
  }
  .ap-head-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .ap-tally {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #c4860f;
    font-weight: 700;
  }
  .ap-tally-num {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 16px;
    color: #c9a84c;
    margin-right: 4px;
  }
  .ap-close {
    background: transparent;
    border: 0;
    color: #c9a84c;
    font-size: 24px;
    line-height: 1;
    padding: 4px 8px;
    cursor: pointer;
  }
  .ap-close:hover {
    color: #f5f0e8;
  }

  /* ===== Stop chips ===== */
  .ap-chips {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: 6px;
    padding: 12px 16px 6px;
    background: #fbf6ea;
    border-bottom: 1px dashed rgba(139, 106, 58, 0.35);
    scrollbar-width: thin;
  }
  .ap-chip {
    flex: 0 0 auto;
    background: transparent;
    border: 1.5px dashed #8b6a3a;
    border-radius: 999px;
    padding: 5px 12px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: #5a4f3d;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .ap-chip:hover {
    border-color: #7d3a1e;
    color: #0a2d21;
  }
  .ap-chip.is-active {
    background: #0a2d21;
    border-color: #0a2d21;
    color: #c9a84c;
  }
  /* Hint state - when the search query matches a stop name, that
     stop's chip pulses gently with an amber halo so the user
     spots it and can tap. We don't auto-select; "type to scroll"
     is the soft prompt. The pulse skips when the chip is already
     active (avoids loud animation on a tapped chip). */
  .ap-chip.is-hint:not(.is-active) {
    border-color: #c4860f;
    border-style: solid;
    color: #0a2d21;
    animation: ap-chip-pulse 1.6s ease-in-out infinite;
  }
  @keyframes ap-chip-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(196, 134, 15, 0); }
    50%      { box-shadow: 0 0 0 5px rgba(196, 134, 15, 0.22); }
  }
  @media (prefers-reduced-motion: reduce) {
    .ap-chip.is-hint:not(.is-active) {
      animation: none;
      box-shadow: 0 0 0 3px rgba(196, 134, 15, 0.22);
    }
  }

  /* ===== Kind tabs ===== */
  .ap-tabs {
    display: flex;
    gap: 6px;
    padding: 8px 16px 10px;
    background: #fbf6ea;
    border-bottom: 1px solid rgba(139, 106, 58, 0.25);
    overflow-x: auto;
  }
  .ap-tab {
    flex: 0 0 auto;
    background: transparent;
    border: 0;
    padding: 6px 10px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #5a4f3d;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }
  .ap-tab:hover {
    color: #7d3a1e;
  }
  .ap-tab.is-active {
    color: #7d3a1e;
    border-bottom-color: #7d3a1e;
  }

  /* ===== Search ===== */
  .ap-search {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #fbf6ea;
    border-bottom: 1px solid rgba(139, 106, 58, 0.25);
    flex-wrap: wrap;
  }
  .ap-search input {
    flex: 1;
    min-width: 0;
    background: #fffdf6;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 8px 12px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 14px;
    color: #0a2d21;
    outline: none;
    transition: border-color 0.15s;
  }
  .ap-search input:focus {
    border-color: #7d3a1e;
  }
  .ap-search input::placeholder {
    color: rgba(90, 79, 61, 0.55);
    font-style: italic;
  }
  .ap-guide-link {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #7d3a1e;
    font-size: 13px;
    text-decoration: none;
    white-space: nowrap;
  }
  .ap-guide-link:hover {
    color: #0a2d21;
    text-decoration: underline;
  }

  /* ===== Body ===== */
  .ap-body {
    background: #fbf6ea;
    overflow-y: auto;
    flex: 1;
    padding: 4px 0;
  }
  .ap-status {
    text-align: center;
    padding: 36px 24px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
  }
  .ap-error {
    color: #6e2e17;
  }
  .ap-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .ap-card-row {
    display: grid;
    grid-template-columns: 96px 1fr auto;
    gap: 14px;
    padding: 14px 18px;
    border-bottom: 1px dashed rgba(139, 106, 58, 0.3);
    transition: background 0.3s ease, border-color 0.3s ease;
  }
  .ap-card-row.is-added {
    background: rgba(196, 134, 15, 0.08);
  }
  .ap-card-row.is-flash {
    background: rgba(196, 134, 15, 0.22);
  }
  .ap-thumb {
    width: 96px;
    height: 96px;
    object-fit: cover;
    background: #ede0cc;
    border: 2px solid #8b6a3a;
  }
  .ap-thumb-blank {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #8b6a3a;
  }
  .ap-card-body {
    min-width: 0;
  }
  .ap-card-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin-bottom: 4px;
  }
  .ap-pill {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #ffffff;
    background: #7d3a1e;
    padding: 2px 8px;
  }
  .ap-meta-stop {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #0a2d21;
  }
  .ap-meta-walk {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11.5px;
    font-weight: 600;
    color: #7d3a1e;
  }
  .ap-meta-rating {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: #c4860f;
  }
  .ap-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 18px;
    color: #0a2d21;
    line-height: 1.2;
    margin: 2px 0 4px;
    overflow-wrap: anywhere;
  }
  .ap-desc {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 13.5px;
    line-height: 1.5;
    color: #241f1a;
    opacity: 0.82;
    margin: 0 0 4px;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .ap-addr {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    color: #5a4f3d;
    margin: 0;
  }

  .ap-add {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #6e2e17;
    color: #f3ece0;
    border: 2px solid #6e2e17;
    padding: 8px 14px;
    border-radius: 3px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, transform 0.15s, border-color 0.15s;
    white-space: nowrap;
  }
  .ap-add:hover:not(:disabled) {
    background: #0a2d21;
    border-color: #0a2d21;
    transform: translateY(-1px);
  }
  .ap-add.is-on {
    background: rgba(63, 110, 68, 0.18);
    color: #3f6e44;
    border-color: #3f6e44;
    cursor: default;
  }
  .ap-add:disabled {
    cursor: default;
  }
  .ap-add-icon {
    width: 16px;
    height: 16px;
  }
  .ap-add-plus {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 17px;
    line-height: 1;
  }

  /* ===== Foot ===== */
  .ap-foot {
    background: #0a2d21;
    color: #cad7cf;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-top: 3px double #c9a84c;
    flex-wrap: wrap;
  }
  .ap-foot-hint {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    flex: 1;
    min-width: 0;
  }

  @media (max-width: 720px) {
    .ap-card-row {
      grid-template-columns: 64px 1fr;
      grid-template-rows: auto auto;
    }
    .ap-thumb {
      width: 64px;
      height: 64px;
    }
    .ap-add {
      grid-column: 1 / -1;
      justify-self: end;
    }
  }
</style>
