<script>
  /* ==================================================================
     Sample trip preview.

     Renders SAMPLE_TRIP (lib/data/sample-trip.js) as a read-only
     editorial walkthrough of what a real trip looks like in the app.
     Goal is conversion: visitor sees the same banner they'd get if
     they'd built this trip themselves, scans the stops + packing list
     + bookings + budget + diary, and lands at a "Make this my trip"
     CTA at the bottom.

     The cover banner is the same .cover structure as /trips/[id]'s
     cover, with CoverTicket + CoverStats + CoverCollage threaded in.
     Nothing is interactive: title doesn't edit, photo doesn't upload,
     packing items don't toggle. Everything visual ports from the real
     trip page so the visitor knows what they're getting.

     The Dexie duplication that powers "Make this my trip" is the next
     commit; for now the CTA fires a placeholder toast.
     ================================================================== */

  import { onMount, onDestroy } from 'svelte';
  import { SAMPLE_TRIP } from '$lib/data/sample-trip.js';
  import { getStop, getStopsByIds, stopImageUrl } from '$lib/data/stops.js';
  import {
    formatTripDate,
    NORTHBOUND_DEPARTURE,
    SOUTHBOUND_DEPARTURE
  } from '$lib/data/schedule.js';
  import { pushToast } from '$lib/stores/toasts.js';

  import CoverTicket from '$lib/components/trip/CoverTicket.svelte';
  import CoverStats from '$lib/components/trip/CoverStats.svelte';
  import CoverCollage from '$lib/components/trip/CoverCollage.svelte';

  /* Shape the sample stops the way the trip page's deriveStops does:
     each entry has its arrival date as stayStart and the next stop's
     date (or the trip's returnDate, for the last stop) as stayEnd.
     CoverTicket reads stayStart + stayEnd off the stops to render the
     boarding-pass strip. */
  $: coverStops = SAMPLE_TRIP.stops
    .map((entry, i, arr) => {
      const stop = getStopsByIds([entry.stopId])[0];
      if (!stop) return null;
      const stayStart = entry.date;
      const next = arr[i + 1];
      const stayEnd = next ? next.date : SAMPLE_TRIP.returnDate;
      return { ...stop, date: stayStart, stayStart, stayEnd };
    })
    .filter(Boolean);

  /* The cover photo is the arriving stop's hero image. Same default
     the real trip page uses when the user hasn't uploaded a custom
     cover yet. */
  $: arrivingStop = coverStops[coverStops.length - 1] || null;
  $: bannerImage = arrivingStop ? stopImageUrl(arrivingStop) : '';

  /* Polaroid collage on the right side of the cover: one tilted photo
     per stop, alternating slight rotations so the cluster reads as
     hand-pinned. CoverCollage's @prop expects { src, name, tilt }. */
  $: collagePhotos = coverStops.map((stop, i) => ({
    src: stopImageUrl(stop),
    name: stop.name,
    tilt: [-7, 4, -3, 8, -5][i % 5]
  }));

  /* Dateline + direction for CoverStats. Sample trip is always
     northbound (Toronto -> North Bay). */
  $: tripDateLine = formatTripDate(SAMPLE_TRIP.departureDate);
  const dirLabel = 'Northbound';

  /* Live countdown to the sample trip's departure. Same formula as
     the trip page's computeCountdown: anchor at 18:30 northbound
     departure time, tick once a minute so the seconds aren't a
     distraction. Returns null when no date, { past: true } once the
     train has left, or { days, hours, minutes }. */
  let countdown = null;
  function computeCountdown() {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(SAMPLE_TRIP.departureDate || '');
    if (!m) return null;
    const [h, min] = String(NORTHBOUND_DEPARTURE).split(':').map(Number);
    const dep = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(h) || 0,
      Number(min) || 0
    ).getTime();
    const diff = dep - Date.now();
    if (diff <= 0) return { past: true };
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return { days, hours, minutes };
  }
  let countdownTimer;
  onMount(() => {
    countdown = computeCountdown();
    countdownTimer = setInterval(() => {
      countdown = computeCountdown();
    }, 60_000);
  });
  onDestroy(() => clearInterval(countdownTimer));

  /* "Fri, Sep 4" date label for the timeline cards below. */
  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString('en-CA', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  }

  /* Per-list packed counts for the accordion summary lines. Reading
     straight from SAMPLE_TRIP.packingLists so the data source stays
     single-truth. */
  function packedIn(list) {
    return list.items.filter((it) => it.packed).length;
  }

  /* Budget breakdown by category. Categories match BUDGET_CATEGORIES
     (transport / lodging / food / activities / other). The chip row
     in the accordion uses these totals; the ledger below shows each
     row. */
  const BUDGET_CATS = [
    { id: 'transport',  label: 'Transport',  color: '#7d3a1e' },
    { id: 'lodging',    label: 'Lodging',    color: '#0a2d21' },
    { id: 'food',       label: 'Food',       color: '#c4860f' },
    { id: 'activities', label: 'Activities', color: '#6b1d2e' },
    { id: 'other',      label: 'Other',      color: '#5a4f3d' }
  ];
  $: budgetBreakdown = BUDGET_CATS.map((c) => ({
    ...c,
    total: SAMPLE_TRIP.budget
      .filter((e) => e.category === c.id)
      .reduce((sum, e) => sum + (e.amount || 0), 0)
  })).filter((c) => c.total > 0);
  function catFor(id) {
    return BUDGET_CATS.find((c) => c.id === id) || BUDGET_CATS[BUDGET_CATS.length - 1];
  }

  function handleMakeMine() {
    pushToast({
      message: 'Sample-trip duplication is coming next. The polaroid lands here for now.'
    });
  }
</script>

<svelte:head>
  <title>Sample trip: A Long Weekend North — Northlander.app</title>
  <meta
    name="description"
    content="Three days up the Muskoka line with a stopover in Gravenhurst on the way to Lake Nipissing. A sample trip you can poke around before building your own."
  />
</svelte:head>

<!-- Sticky "Sample trip" banner so the visitor never mistakes this
     for one of their own trips. Rust band, ivory text, fixed under
     the topbar. -->
<div class="sample-banner" role="note" aria-label="Sample trip preview">
  <span class="sample-banner-tag">Sample trip</span>
  <span class="sample-banner-text">A worked example. Tap "Make this my trip" at the bottom to start your own.</span>
</div>

<!-- ===== Editorial cover banner =====
     Same structure as /trips/[id]/+page.svelte's <header class="cover">
     so the visitor sees exactly the banner they'd get if they'd built
     this trip themselves: full-bleed background photo of the arriving
     stop, forest gradient veil, boarding-pass ticket strip across the
     top, editorial title + kicker on the left, stats grid + polaroid
     collage on the right. -->
<header class="cover has-image">
  <div
    class="cover-bg has-image"
    style={`background-image:url('${bannerImage}');`}
    aria-hidden="true"
  ></div>
  <div class="cover-veil" aria-hidden="true"></div>

  <CoverTicket
    stops={coverStops}
    returnStops={[]}
    direction="northbound"
  />

  <div class="cover-inner">
    <div class="cover-text">
      <div class="kicker kicker-light">A Northlander Itinerary</div>

      <h1 class="cover-name">{SAMPLE_TRIP.name}</h1>

      <p class="cover-strap">{SAMPLE_TRIP.strap}</p>

      <CoverStats
        {tripDateLine}
        {dirLabel}
        {countdown}
        wrapped={false}
        stopsVisited={coverStops.length}
        plansCount={SAMPLE_TRIP.bookings.length}
        spent={SAMPLE_TRIP.budgetTotal}
        showSpent={true}
      />
    </div>

    <CoverCollage photos={collagePhotos} />
  </div>
</header>

<main class="sample-main">
  <!-- ===== Route timeline ===== -->
  <section class="sample-section">
    <header class="sample-section-head">
      <div class="kicker kicker-dark">Route</div>
      <h2>Three stops, plotted across the weekend</h2>
    </header>

    <ol class="sample-timeline">
      {#each coverStops as stop, i (stop.id + i)}
        <li class="sample-stop">
          <div class="sample-stop-photo">
            <img src={stopImageUrl(stop)} alt={stop.name} loading="lazy" decoding="async" />
          </div>
          <div class="sample-stop-body">
            <div class="sample-stop-date">{fmtDate(stop.stayStart)}</div>
            <h3 class="sample-stop-name">{stop.name}</h3>
            <div class="sample-stop-region">{stop.region}</div>
            <p class="sample-stop-note">{SAMPLE_TRIP.stops[i].note}</p>
          </div>
        </li>
      {/each}
    </ol>
  </section>

  <!-- ===== Packing: two named lists =====
       The real app supports multiple packing lists per trip - a
       default one that can be renamed, plus extra named lists for
       a co-traveller, a camera bag, the kids' bag, etc. Each list
       is its own accordion on the trip page (Drawer component) and
       we mirror that here with native <details>. The default list
       wears the traveller's name ("Sarah's bag") to show the rename
       feature; the second ("Camera + lakes gear") shows you can
       maintain more than one list side by side. -->
  <section class="sample-section">
    <header class="sample-section-head">
      <div class="kicker kicker-dark">Before You Board</div>
      <h2>Pack the whole trip in one place</h2>
    </header>

    {#each SAMPLE_TRIP.packingLists as list, listIdx (list.name)}
      {@const packed = packedIn(list)}
      {@const total = list.items.length}
      <details class="sample-packing" open={listIdx === 0}>
        <summary class="sample-packing-head">
          <div class="sample-packing-head-text">
            <div class="kicker kicker-dark">{list.kicker}</div>
            <h3 class="sample-packing-title">{list.name}</h3>
          </div>
          <span class="sample-packing-count">{packed} of {total} packed</span>
          <span class="sample-packing-chev" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </span>
        </summary>

        <ul class="pack-list">
          {#each list.items as item, i (item.name + i)}
            <li class="pack-row" class:is-packed={item.packed}>
              <span class="check-token" aria-hidden="true">
                {#if item.packed}
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 8 7 12 13 4"/>
                  </svg>
                {/if}
              </span>
              <span class="pack-name">{item.name}</span>
            </li>
          {/each}
        </ul>
      </details>
    {/each}

    <p class="sample-packing-note">
      Read-only preview. In your own trip, tap a circle to mark an item packed,
      tap the item name to rename, use the <strong>+</strong> picker to pull
      suggestions from the Guide, and add a second list any time the trip needs
      one (a partner's bag, the kids' bag, the camera bag).
    </p>
  </section>

  <!-- ===== Bookings ===== -->
  <section class="sample-section">
    <header class="sample-section-head">
      <div class="kicker kicker-dark">Bookings</div>
      <h2>What's reserved, what's still on the list</h2>
    </header>

    <ul class="sample-bookings">
      {#each SAMPLE_TRIP.bookings as b, i (b.name + i)}
        <li class="sample-booking" class:is-confirmed={b.status === 'confirmed'}>
          <span class="sample-booking-kind">{b.kind}</span>
          <div class="sample-booking-body">
            <div class="sample-booking-name">{b.name}</div>
            <div class="sample-booking-meta">
              {b.status === 'confirmed' ? 'Confirmed · ' + b.confirmation : 'Pending · book by ' + fmtDate(b.dueDate)}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  </section>

  <!-- ===== Budget ===== -->
  <section class="sample-section">
    <header class="sample-section-head">
      <div class="kicker kicker-dark">Money</div>
      <h2>What the trip cost - tracked as you go</h2>
    </header>

    <!-- Same accordion shape as the packing lists above, same shape as
         the Drawer-wrapped Budget tracker on /trips/[id]. Header carries
         the running total on the right; body opens to a per-category
         breakdown chip row and a coloured-dot ledger of every spend.
         Read-only - the real app lets you tap a row to edit or add a
         new line from the foot. -->
    <details class="sample-packing sample-budget-acc" open>
      <summary class="sample-packing-head">
        <div class="sample-packing-head-text">
          <div class="kicker kicker-dark">Ledger</div>
          <h3 class="sample-packing-title">Budget tracker</h3>
        </div>
        <span class="sample-packing-count sample-budget-total-pill">${SAMPLE_TRIP.budgetTotal} spent</span>
        <span class="sample-packing-chev" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </summary>

      <!-- Per-category breakdown chips. Same chip vocabulary as the
           real BudgetTracker: each chip carries the category colour
           as its border + text so the eye can sort the ledger below
           by colour. -->
      <div class="sample-budget-breakdown">
        {#each budgetBreakdown as c (c.id)}
          <span class="sample-budget-chip" style="border-color:{c.color};color:{c.color}">
            <strong>{c.label}</strong>
            <span>${c.total}</span>
          </span>
        {/each}
      </div>

      <!-- Ledger: one row per spend with the category dot, label,
           and amount. Same row shape as the real BudgetTracker .row. -->
      <ul class="sample-budget-ledger">
        {#each SAMPLE_TRIP.budget as line, i (line.label + i)}
          {@const c = catFor(line.category)}
          <li class="sample-budget-row">
            <span class="sample-budget-dot" style="background:{c.color}" aria-hidden="true"></span>
            <div class="sample-budget-line">
              <span class="sample-budget-line-label">{line.label}</span>
              <span class="sample-budget-line-date">{fmtDate(line.spentDate)}</span>
            </div>
            <span class="sample-budget-line-amt">${line.amount}</span>
          </li>
        {/each}
      </ul>

      <p class="sample-packing-note">
        Read-only preview. In your own trip, tap a row to edit the amount or
        category, log a new spend from the form at the bottom, and watch the
        chips re-balance as you go.
      </p>
    </details>
  </section>

  <!-- ===== Diary preview ===== -->
  <section class="sample-section">
    <header class="sample-section-head">
      <div class="kicker kicker-dark">Diary</div>
      <h2>What the trip felt like, in three notes</h2>
    </header>

    <ul class="sample-diary">
      {#each SAMPLE_TRIP.diary as entry, i (entry.title + i)}
        <li class="sample-diary-entry">
          <div class="sample-diary-stop">{getStop(entry.stopId)?.name ?? entry.stopId}</div>
          <h3 class="sample-diary-title">{entry.title}</h3>
          <p class="sample-diary-body">{entry.body}</p>
        </li>
      {/each}
    </ul>
  </section>

  <!-- ===== Make-it-mine CTA ===== -->
  <section class="sample-cta">
    <h2>Like the shape of it?</h2>
    <p>Drop this whole trip into your own list and edit it from there. Your real trips stay yours.</p>
    <button type="button" class="btn-primary sample-cta-btn" on:click={handleMakeMine}>
      Make this my trip
    </button>
    <a href="/" class="sample-cta-back">or just go back to the dashboard</a>
  </section>
</main>

<style>
  /* ---------- Sample-trip banner ---------- */
  .sample-banner {
    position: sticky;
    top: 0;
    z-index: 90;
    background: #7d3a1e;
    color: #fbf6ea;
    padding: 8px 18px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
  }
  .sample-banner-tag {
    background: #fbf6ea;
    color: #7d3a1e;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 2px;
  }
  .sample-banner-text { flex: 1; min-width: 0; }

  /* ---------- Cover banner =====
     Mirrors the .cover styles from /trips/[id]/+page.svelte exactly:
     same forest base, same parallax-ready bg image layer, same dark
     gradient veil, same 1180px two-column inner. Kept inline (not in
     a shared stylesheet) because Svelte's scoped CSS keeps these rules
     local to this page, and the trip page can evolve independently. */
  .cover {
    position: relative;
    background: linear-gradient(180deg, #0a2d21 0%, #16543e 100%);
    color: #f5f0e8;
    padding: 56px 24px 64px;
    overflow: hidden;
  }
  .cover-bg {
    position: absolute;
    inset: 0;
    background-position: center;
    background-size: cover;
    z-index: 0;
    transform: scale(1.08);
  }
  .cover-bg.has-image { background-color: #0a2d21; }
  .cover-veil {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background:
      linear-gradient(180deg, rgba(10, 45, 33, 0.45) 0%, rgba(10, 45, 33, 0.88) 100%),
      radial-gradient(ellipse at 50% 12%, rgba(0, 0, 0, 0.35), transparent 70%);
  }
  .cover-inner {
    max-width: 1180px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr;
    gap: 36px;
    position: relative;
    z-index: 2;
  }
  @media (min-width: 880px) {
    .cover-inner {
      grid-template-columns: 1.1fr 1fr;
      align-items: center;
    }
  }
  .kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .kicker-light { color: #c4860f; }
  .kicker-dark { color: #7d3a1e; }
  .cover-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2.6rem, 7vw, 5rem);
    line-height: 0.95;
    margin: 12px 0 14px;
    letter-spacing: -0.015em;
    color: #f5f0e8;
    overflow-wrap: anywhere;
  }
  .cover-strap {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(15px, 1.6vw, 18px);
    line-height: 1.5;
    color: #cad7cf;
    margin: 0 0 24px;
    max-width: 52ch;
  }

  /* ---------- Main band ---------- */
  .sample-main {
    background: #f5f0e8;
    padding: 48px 24px 80px;
  }
  .sample-section {
    max-width: 1080px;
    margin: 0 auto 56px;
  }
  .sample-section-head {
    margin-bottom: 22px;
  }
  .sample-section-head h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: clamp(22px, 2.6vw, 30px);
    color: #0a2d21;
    margin: 6px 0 0;
    line-height: 1.15;
  }

  /* ---------- Route timeline ---------- */
  .sample-timeline {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 22px;
  }
  .sample-stop {
    background: #fbf6ea;
    border: 1.5px solid rgba(125, 58, 30, 0.18);
    border-radius: 6px;
    overflow: hidden;
    display: grid;
    grid-template-columns: 1fr;
  }
  @media (min-width: 720px) {
    .sample-stop { grid-template-columns: 280px 1fr; }
  }
  .sample-stop-photo {
    background: #e8e0cd;
    aspect-ratio: 16 / 10;
  }
  .sample-stop-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .sample-stop-body { padding: 20px 22px 22px; }
  .sample-stop-date {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .sample-stop-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 24px;
    margin: 4px 0 2px;
    color: #0a2d21;
  }
  .sample-stop-region {
    font-family: 'Spline Sans', sans-serif;
    font-size: 13px;
    color: #6b5c4a;
    margin-bottom: 10px;
  }
  .sample-stop-note {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 16px;
    line-height: 1.5;
    color: #2d2418;
    margin: 0;
  }

  /* ---------- Packing accordion =====
     Native <details> styled to look like one of the chapter drawers
     on the real trip page. Header is the trigger; click toggles
     [open] and rotates the chevron. The list inside re-uses .pack-list
     /.pack-row/.check-token from PackingList.svelte so the visual
     reads as the same component. */
  .sample-packing {
    background: #fbf6ea;
    border: 1.5px solid rgba(125, 58, 30, 0.18);
    border-radius: 6px;
    padding: 18px 22px 20px;
  }
  /* Two or more stacked accordions (default packing list + named
     extras + budget): space them out so they don't read as one
     run-on block. */
  .sample-packing + .sample-packing {
    margin-top: 14px;
  }
  .sample-packing > summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .sample-packing > summary::-webkit-details-marker { display: none; }
  .sample-packing-head-text { flex: 1; min-width: 0; }
  /* Title accepts h2 (single-list legacy) and h3 (stacked named
     accordions) so the same head styles cover both. */
  .sample-packing-head-text h2,
  .sample-packing-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 22px;
    margin: 4px 0 0;
    color: #0a2d21;
    line-height: 1.15;
  }
  .sample-packing-count {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 14px;
    color: #7d3a1e;
    white-space: nowrap;
  }
  .sample-packing-chev {
    color: #7d3a1e;
    display: inline-flex;
    transition: transform 200ms ease;
  }
  .sample-packing[open] .sample-packing-chev {
    transform: rotate(180deg);
  }
  .sample-packing-note {
    margin: 14px 0 0;
    padding-top: 14px;
    border-top: 1px dashed rgba(139, 106, 58, 0.35);
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13.5px;
    color: #6b5c4a;
    line-height: 1.5;
  }
  .sample-packing-note strong {
    color: #7d3a1e;
    font-weight: 700;
    font-style: normal;
  }

  /* Packing-list visuals ported from $lib/components/PackingList.svelte.
     Local copy (not :global imports) since the sample is read-only and
     doesn't need the toggle/rename/remove chrome. */
  .pack-list {
    list-style: none;
    padding: 0;
    margin: 16px 0 0;
  }
  .pack-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px dashed rgba(139, 106, 58, 0.35);
  }
  .pack-row:last-child { border-bottom: 0; }
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
  }
  .pack-row.is-packed .check-token {
    border-color: #0a2d21;
    background: #c9a84c;
    color: #0a2d21;
  }
  .pack-name {
    flex: 1;
    min-width: 0;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 1rem;
    color: #241f1a;
  }
  .pack-row.is-packed .pack-name {
    text-decoration: line-through;
    text-decoration-color: #c9a84c;
    text-decoration-thickness: 2px;
    color: #5a4f3d;
  }

  /* ---------- Bookings ---------- */
  .sample-bookings {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 14px;
  }
  .sample-booking {
    background: #fbf6ea;
    border: 1.5px solid rgba(125, 58, 30, 0.18);
    border-radius: 6px;
    padding: 16px 18px;
    display: flex;
    gap: 14px;
    align-items: center;
  }
  .sample-booking.is-confirmed { border-color: rgba(63, 110, 68, 0.4); }
  .sample-booking-kind {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #fbf6ea;
    background: #7d3a1e;
    padding: 4px 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .sample-booking-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    font-size: 17px;
    color: #0a2d21;
  }
  .sample-booking-meta {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12.5px;
    color: #6b5c4a;
    margin-top: 2px;
  }

  /* ---------- Budget accordion ----------
     Reuses the .sample-packing accordion chrome. The total in the
     summary head wears a forest pill so it pops against the cream
     paper, and the body adds a breakdown chip row + a coloured-dot
     ledger that visually maps to BudgetTracker.svelte's .breakdown
     and .ledger sections on /trips/[id]. */
  .sample-budget-total-pill {
    background: #0a2d21;
    color: #c9a84c;
    font-style: normal;
    font-weight: 700;
    padding: 5px 10px;
    border-radius: 999px;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 13px;
    letter-spacing: 0.02em;
  }
  .sample-budget-breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 16px 0 4px;
  }
  .sample-budget-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1.5px solid #7d3a1e;
    color: #7d3a1e;
    padding: 5px 11px;
    border-radius: 999px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
  }
  .sample-budget-chip strong {
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    font-size: 10.5px;
  }
  .sample-budget-chip span {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 13px;
  }
  .sample-budget-ledger {
    list-style: none;
    padding: 0;
    margin: 14px 0 0;
  }
  .sample-budget-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px dashed rgba(139, 106, 58, 0.35);
  }
  .sample-budget-row:last-child { border-bottom: 0; }
  .sample-budget-dot {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .sample-budget-line {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sample-budget-line-label {
    font-family: 'Spline Sans', sans-serif;
    font-size: 14.5px;
    color: #241f1a;
  }
  .sample-budget-line-date {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12px;
    color: #6b5c4a;
  }
  .sample-budget-line-amt {
    flex: none;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 16px;
    color: #0a2d21;
  }

  /* ---------- Diary ---------- */
  .sample-diary {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 18px;
  }
  @media (min-width: 720px) {
    .sample-diary { grid-template-columns: repeat(3, 1fr); }
  }
  .sample-diary-entry {
    background: #fbf6ea;
    border: 1.5px solid rgba(125, 58, 30, 0.18);
    border-radius: 6px;
    padding: 18px 20px 20px;
  }
  .sample-diary-stop {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .sample-diary-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 18px;
    color: #0a2d21;
    margin: 6px 0 8px;
    line-height: 1.25;
  }
  .sample-diary-body {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 15px;
    line-height: 1.55;
    color: #2d2418;
    margin: 0;
  }

  /* ---------- Make-it-mine CTA ---------- */
  .sample-cta {
    max-width: 720px;
    margin: 0 auto;
    text-align: center;
    padding: 36px 24px 40px;
    background: #0a2d21;
    color: #f5f0e8;
    border-radius: 8px;
  }
  .sample-cta h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(24px, 3vw, 32px);
    margin: 0 0 10px;
    color: #f5f0e8;
  }
  .sample-cta p {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 16px;
    color: #cad7cf;
    margin: 0 0 22px;
    line-height: 1.5;
  }
  .sample-cta-btn {
    background: #c9a84c;
    color: #0a2d21;
    border-color: #c9a84c;
    font-weight: 700;
    padding: 14px 28px;
    box-shadow: 0 8px 18px rgba(201, 168, 76, 0.32);
  }
  .sample-cta-btn:hover {
    background: #f5f0e8;
    color: #0a2d21;
    border-color: #f5f0e8;
  }
  .sample-cta-back {
    display: block;
    margin-top: 14px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 14px;
    color: #cad7cf;
    text-decoration: underline;
  }
</style>
