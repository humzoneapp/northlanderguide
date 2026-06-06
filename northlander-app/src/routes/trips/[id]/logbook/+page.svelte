<script>
  /* ==================================================================
     Logbook.

     Replaces the old Recap page (commit af92661). Instead of a
     post-trip scrapbook, the Logbook is a live chronological feed
     of every action taken on the trip - bookings made, photos
     uploaded, notes written, spend logged - sorted newest-first
     and grouped by day. Reads like a railway conductor's running
     log, fits the vintage editorial vocabulary used everywhere
     else.

     Pure read surface. All data comes from IndexedDB via the
     existing stores; no writes happen here. Photo blobs are
     wrapped in object URLs on mount and revoked on destroy so
     nothing leaks across navigations.
     ================================================================== */

  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { getTrip } from '$lib/stores/trips.js';
  import { listPhotos } from '$lib/stores/photos.js';
  import { listDiaryEntries } from '$lib/stores/diary.js';
  import { listBookings, BOOKING_KINDS } from '$lib/stores/bookings.js';
  import { listBudgetEntries, totalOf, formatAmount, BUDGET_CATEGORIES } from '$lib/stores/budget.js';
  import { getStop } from '$lib/data/stops.js';
  import { formatTripDate } from '$lib/data/schedule.js';
  import { renderDiaryText } from '$lib/utils/diary-html.js';
  import BookingKindIcon from '$lib/components/BookingKindIcon.svelte';

  let trip = null;
  let photos = [];
  let diary = [];
  let bookings = [];
  let budget = [];
  let loaded = false;

  /** Object URLs for photo thumbnails, keyed by photo id. */
  let photoUrls = new Map();

  $: id = $page.params.id;
  $: stops = trip && Array.isArray(trip.stops) && trip.stops.length > 0
    ? trip.stops
        .map((e) => getStop(e.stopId))
        .filter(Boolean)
    : trip
      ? (trip.stopIds || []).map((sid) => getStop(sid)).filter(Boolean)
      : [];
  $: tripDateLine = trip && trip.departureDate ? formatTripDate(trip.departureDate) : '';
  $: totalSpent = totalOf(budget);
  $: stopCount = Math.max(0, stops.length - 1);

  /* Combine every mutation event into one chronological feed. The
     trip's createdAt is the bottom anchor ("Trip started"). Stops
     don't have per-entry timestamps yet, so the route is summarized
     in the cover band instead of being event-rendered.

     Diary entries with a custom `entryDate` still sort by their
     stored entryDate so backdated reflections land on the right
     day. Everything else sorts on `createdAt`. */
  $: events = buildEvents(trip, bookings, diary, photos, budget);
  $: groups = groupByDay(events);

  function eventTime(ev) {
    if (ev.type === 'diary' && ev.row && typeof ev.row.entryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ev.row.entryDate)) {
      try {
        return new Date(ev.row.entryDate + 'T12:00:00').getTime();
      } catch (_) { /* fall through */ }
    }
    return ev.row?.createdAt || 0;
  }

  function buildEvents(t, bks, dy, ph, bg) {
    const out = [];
    if (!t) return out;
    if (Array.isArray(bks)) {
      for (const b of bks) out.push({ type: 'booking', row: b });
    }
    if (Array.isArray(dy)) {
      for (const d of dy) out.push({ type: 'diary', row: d });
    }
    if (Array.isArray(ph)) {
      for (const p of ph) out.push({ type: 'photo', row: p });
    }
    if (Array.isArray(bg)) {
      for (const e of bg) out.push({ type: 'spend', row: e });
    }
    /* Synthesize a "trip started" anchor at the bottom of the feed
       so the user can see when the journey was first planned. */
    if (t.createdAt) out.push({ type: 'start', row: { createdAt: t.createdAt } });
    return out.sort((a, b) => eventTime(b) - eventTime(a));
  }

  function dayKey(ms) {
    const dt = new Date(ms);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function groupByDay(list) {
    const map = new Map();
    for (const ev of list) {
      const ms = eventTime(ev);
      const key = dayKey(ms);
      if (!map.has(key)) map.set(key, { key, label: dayLabel(ms), events: [] });
      map.get(key).events.push(ev);
    }
    return [...map.values()];
  }

  function dayLabel(ms) {
    const dt = new Date(ms);
    const today = new Date();
    if (dt.toDateString() === today.toDateString()) return 'Today';
    const yest = new Date(today);
    yest.setDate(today.getDate() - 1);
    if (dt.toDateString() === yest.toDateString()) return 'Yesterday';
    const sameYear = dt.getFullYear() === today.getFullYear();
    return dt.toLocaleDateString('en-CA', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: sameYear ? undefined : 'numeric'
    });
  }

  function formatTime(ms) {
    if (!ms) return '';
    return new Date(ms).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
  }

  function stopName(stopId) {
    const s = stopId ? getStop(stopId) : null;
    return s ? s.name : '';
  }

  function kindLabel(kindId) {
    const k = BOOKING_KINDS.find((x) => x.id === kindId);
    return k ? k.label : 'Plan';
  }

  function categoryColor(catId) {
    const c = BUDGET_CATEGORIES.find((x) => x.id === catId);
    return c ? c.color : '#5a4f3d';
  }

  function thumbUrl(id) {
    const u = photoUrls.get(id);
    return u ? u.thumb : '';
  }

  onMount(async () => {
    trip = (await getTrip(id)) || null;
    if (!trip) {
      loaded = true;
      return;
    }
    [bookings, diary, photos, budget] = await Promise.all([
      listBookings(trip.id),
      listDiaryEntries(trip.id),
      listPhotos(trip.id),
      listBudgetEntries(trip.id)
    ]);
    /* Build thumbnail URLs for every photo so the feed cards can
       render without waiting on per-card object-URL creation. */
    const next = new Map();
    for (const p of photos) {
      next.set(p.id, {
        thumb: URL.createObjectURL(p.thumb)
      });
    }
    photoUrls = next;
    loaded = true;
  });

  onDestroy(() => {
    for (const u of photoUrls.values()) {
      if (u.thumb) URL.revokeObjectURL(u.thumb);
    }
    photoUrls.clear();
  });
</script>

<svelte:head>
  <title>{trip ? `Logbook - ${trip.name}` : 'Logbook'} - Northlander</title>
  <style>
    /* Hide the layout topbar + footer for a focused reading view,
       mirroring what the old Recap page did. */
    .topbar, footer { display: none !important; }
  </style>
</svelte:head>

{#if !loaded}
  <p class="status">Reading the log…</p>
{:else if !trip}
  <section class="missing">
    <h1>Trip not found</h1>
    <a href="/" class="back-link">&larr; Back to your trips</a>
  </section>
{:else}
  <header class="cover">
    <a href={`/trips/${trip.id}`} class="back-link">&larr; Back to {trip.name}</a>
    <div class="kicker">Trip Logbook</div>
    <h1>{trip.name}</h1>
    {#if stops.length >= 2}
      <p class="route">{stops[0].name} &rarr; {stops[stops.length - 1].name}{tripDateLine ? `  .  ${tripDateLine}` : ''}</p>
    {:else if tripDateLine}
      <p class="route">{tripDateLine}</p>
    {/if}
    <ul class="stats">
      <li><b>{stopCount}</b><span>{stopCount === 1 ? 'Stop' : 'Stops'}</span></li>
      <li><b>{bookings.length}</b><span>Plans</span></li>
      <li><b>{photos.length}</b><span>Photos</span></li>
      <li><b>{diary.length}</b><span>Notes</span></li>
      {#if budget.length > 0}
        <li><b>{formatAmount(totalSpent)}</b><span>Spent</span></li>
      {/if}
    </ul>
  </header>

  <main class="feed">
    {#if events.length === 0}
      <p class="empty">No log entries yet. Pin your first plan, photo, or note from the trip page and it'll land here.</p>
    {:else}
      {#each groups as group (group.key)}
        <section class="day">
          <header class="day-head">
            <h2>{group.label}</h2>
            <span class="day-rule" aria-hidden="true"></span>
            <span class="day-count">{group.events.length} {group.events.length === 1 ? 'entry' : 'entries'}</span>
          </header>
          <ol class="day-list">
            {#each group.events as ev (ev.type + '-' + (ev.row.id ?? ev.row.createdAt))}
              <li class={`event event-${ev.type}`}>
                <span class="event-time" aria-hidden="true">{formatTime(eventTime(ev))}</span>
                <div class="event-body">
                  {#if ev.type === 'booking'}
                    {@const kind = ev.row.kind || 'other'}
                    <div class="event-row">
                      <span class="event-kind-icon"><BookingKindIcon {kind} size="1.1em" /></span>
                      <div class="event-text">
                        <div class="event-kicker">{kindLabel(kind)} added</div>
                        <p class="event-title">{ev.row.title}</p>
                        {#if ev.row.stopId && stopName(ev.row.stopId)}
                          <span class="event-tag">At {stopName(ev.row.stopId)}</span>
                        {/if}
                      </div>
                    </div>
                  {:else if ev.type === 'diary'}
                    <div class="event-kicker">Travel diary</div>
                    <div class="diary-body">{@html renderDiaryText(ev.row.text || '')}</div>
                    {#if ev.row.stopId && stopName(ev.row.stopId)}
                      <span class="event-tag">At {stopName(ev.row.stopId)}</span>
                    {/if}
                  {:else if ev.type === 'photo'}
                    <div class="event-kicker">Polaroid</div>
                    <figure class="photo-card">
                      {#if thumbUrl(ev.row.id)}
                        <img src={thumbUrl(ev.row.id)} alt={ev.row.caption || ''} loading="lazy" />
                      {:else}
                        <div class="photo-blank" aria-hidden="true"></div>
                      {/if}
                      {#if ev.row.caption}
                        <figcaption>{ev.row.caption}</figcaption>
                      {/if}
                    </figure>
                    {#if ev.row.stopId && stopName(ev.row.stopId)}
                      <span class="event-tag">At {stopName(ev.row.stopId)}</span>
                    {/if}
                  {:else if ev.type === 'spend'}
                    <div class="event-row">
                      <span
                        class="event-amount"
                        style="color: {categoryColor(ev.row.category)}; border-color: {categoryColor(ev.row.category)};"
                      >{formatAmount(ev.row.amount)}</span>
                      <div class="event-text">
                        <div class="event-kicker">Spend logged</div>
                        <p class="event-title">{ev.row.label}</p>
                        {#if ev.row.stopId && stopName(ev.row.stopId)}
                          <span class="event-tag">At {stopName(ev.row.stopId)}</span>
                        {/if}
                      </div>
                    </div>
                  {:else if ev.type === 'start'}
                    <div class="event-kicker">Trip started</div>
                    <p class="event-title event-title--quiet">A new logbook opened. Northlander Railway.</p>
                  {/if}
                </div>
              </li>
            {/each}
          </ol>
        </section>
      {/each}
    {/if}
  </main>
{/if}

<style>
  .status, .missing {
    max-width: 720px;
    margin: 80px auto;
    text-align: center;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
  }
  .missing h1 {
    font-style: normal;
    font-weight: 900;
    color: #0a2d21;
    margin-bottom: 12px;
  }
  .back-link {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
    color: #c9a84c;
    text-decoration: none;
    margin-bottom: 22px;
    display: inline-block;
  }
  .back-link:hover { color: #f5f0e8; }

  /* Cover band: forest gradient with amber radial highlight. Same
     visual vocabulary as the rest of the App so the Logbook reads
     as a trip surface, not a separate destination. */
  .cover {
    background:
      radial-gradient(circle at 25% 0%, rgba(196, 134, 15, 0.18), transparent 55%),
      linear-gradient(180deg, #0a2d21, #0c3327);
    color: #f5f0e8;
    padding: 48px 24px 40px;
  }
  .cover .back-link { color: #c9a84c; }
  .cover .back-link:hover { color: #f5f0e8; }
  .kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    font-weight: 800;
    color: #c4860f;
    margin-bottom: 8px;
  }
  .cover h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2.2rem, 5.5vw, 3.6rem);
    line-height: 1;
    margin: 0 0 14px;
    color: #f5f0e8;
    letter-spacing: -0.01em;
  }
  .route {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #ede0cc;
    font-size: clamp(14px, 1.8vw, 17px);
    margin: 0 0 20px;
  }
  .stats {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 18px;
    border-top: 1px dashed rgba(201, 168, 76, 0.45);
    padding-top: 18px;
    max-width: 720px;
  }
  .stats li { display: flex; flex-direction: column; gap: 2px; }
  .stats b {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(24px, 3.5vw, 32px);
    color: #c9a84c;
    line-height: 1;
  }
  .stats span {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
    color: #cad7cf;
  }

  /* ===== Feed ===== */
  .feed {
    background: #fbf6ea;
    background-image:
      repeating-linear-gradient(45deg, rgba(45, 30, 20, 0.04) 0, rgba(45, 30, 20, 0.04) 1px, transparent 1px, transparent 8px);
    color: #241f1a;
    padding: 32px 0 80px;
  }
  .empty {
    max-width: 720px;
    margin: 32px auto;
    padding: 0 24px;
    text-align: center;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
  }
  .day {
    max-width: 760px;
    margin: 0 auto;
    padding: 22px 24px 8px;
  }
  .day-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .day-head h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 800;
    font-style: italic;
    font-size: clamp(18px, 2vw, 22px);
    color: #5e2a14;
    margin: 0;
  }
  .day-rule {
    flex: 1;
    height: 0;
    border-top: 1px dashed rgba(125, 58, 30, 0.4);
  }
  .day-count {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
    color: #7d3a1e;
  }
  .day-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* ===== Event cards =====
     Cream paper card with a rust left rule. Time sits in a small
     column on the left; the body holds whatever the event needs. */
  .event {
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: 14px;
    background: #fffdf6;
    border-left: 3px solid #7d3a1e;
    padding: 14px 16px;
    box-shadow: 0 4px 12px rgba(40, 25, 10, 0.06);
  }
  .event-time {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-style: italic;
    color: #7d3a1e;
    font-size: 14px;
    line-height: 1.2;
    text-align: right;
    padding-top: 2px;
  }
  .event-kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    font-weight: 800;
    color: #c4860f;
    margin-bottom: 4px;
  }
  .event-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .event-text {
    flex: 1;
    min-width: 0;
  }
  .event-kind-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1.5px solid #7d3a1e;
    background: rgba(125, 58, 30, 0.08);
    color: #7d3a1e;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .event-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 16px;
    color: #0a2d21;
    margin: 0;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .event-title--quiet {
    font-style: italic;
    font-weight: 500;
    color: #5a4f3d;
  }
  .event-tag {
    display: inline-block;
    margin-top: 6px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
    color: #7d3a1e;
    border: 1px dashed rgba(125, 58, 30, 0.45);
    padding: 2px 8px;
    border-radius: 999px;
  }

  /* Diary body keeps the same vocabulary as the chapter feed. */
  .diary-body {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 15.5px;
    line-height: 1.55;
    color: #241f1a;
  }
  .diary-body :global(ul),
  .diary-body :global(ol) { padding-left: 1.4em; margin: 4px 0; }
  .diary-body :global(li) { margin: 2px 0; }
  .diary-body :global(.sticker) {
    display: inline-flex;
    align-items: center;
    vertical-align: -3px;
    margin: 0 2px;
    color: #7d3a1e;
  }

  .photo-card {
    margin: 0;
    background: #ede0cc;
    border: 2px solid #0a2d21;
    max-width: 220px;
  }
  .photo-card img {
    display: block;
    width: 100%;
    height: 160px;
    object-fit: cover;
  }
  .photo-blank {
    width: 100%;
    height: 160px;
    background: linear-gradient(135deg, #ede0cc, #d5c5a8);
  }
  .photo-card figcaption {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #0a2d21;
    font-size: 13px;
    padding: 8px 10px;
    border-top: 1px dashed rgba(0, 0, 0, 0.18);
  }

  .event-amount {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 18px;
    border: 2px solid currentColor;
    background: rgba(255, 253, 246, 0.6);
    padding: 4px 10px;
    border-radius: 4px;
    flex: 0 0 auto;
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    .event {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .event-time { text-align: left; }
  }
</style>
