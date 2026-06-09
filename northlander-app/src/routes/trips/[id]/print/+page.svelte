<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { getTrip } from '$lib/stores/trips.js';
  import { listPackingItems } from '$lib/stores/packing.js';
  import { listBookings, BOOKING_KINDS } from '$lib/stores/bookings.js';
  import {
    listBudgetEntries,
    totalOf,
    breakdownByCategory,
    formatAmount,
    BUDGET_CATEGORIES
  } from '$lib/stores/budget.js';
  import { listDiaryEntries } from '$lib/stores/diary.js';
  import { getStopsByIds, getStop } from '$lib/data/stops.js';
  import {
    arrivalClock,
    travelDuration,
    departureFor,
    formatTripDate,
    DIRECTIONS
  } from '$lib/data/schedule.js';
  import Suitcase from '$lib/components/Suitcase.svelte';

  let trip = null;
  let packing = [];
  let bookings = [];
  let budget = [];
  let diary = [];
  let loaded = false;
  let printed = false;

  $: id = $page.params.id;
  $: stops = trip ? deriveStops(trip) : [];
  $: dirMeta = trip ? DIRECTIONS.find((d) => d.id === (trip.direction || 'northbound')) || DIRECTIONS[0] : null;
  $: depClock = trip ? departureFor(trip.direction || 'northbound') : '09:00';

  /* Build the full chronological stop list including the return
     leg. Each entry carries an `isReturn` flag so the route sheet
     can mark the turnaround and pull train times off the opposite
     direction. Legacy single-return-date trips hydrate as one
     return entry. Older trips with just `stopIds[]` keep working
     via the direction-oriented fallback. */
  function deriveStops(t) {
    if (Array.isArray(t.stops) && t.stops.length > 0) {
      const outbound = t.stops
        .map((e) => {
          const s = getStop(e.stopId);
          return s ? { ...s, date: e.date || '', isReturn: false } : null;
        })
        .filter(Boolean);
      let ret = [];
      if (Array.isArray(t.returnStops) && t.returnStops.length > 0) {
        ret = t.returnStops
          .map((e) => {
            const s = getStop(e.stopId);
            return s ? { ...s, date: e.date || '', isReturn: true } : null;
          })
          .filter(Boolean);
      } else if (t.returnDate && t.returnStopId) {
        const s = getStop(t.returnStopId);
        if (s) ret = [{ ...s, date: t.returnDate, isReturn: true }];
      }
      return [...outbound, ...ret];
    }
    const forward = getStopsByIds(t.stopIds || []);
    const oriented = (t.direction === 'southbound') ? forward.slice().reverse() : forward;
    return oriented.map((s) => ({ ...s, isReturn: false }));
  }

  /* Schedule direction for a single stop entry. Outbound rides
     the trip's saved direction; return rides the opposite. */
  function dirFor(stop) {
    const outbound = trip?.direction || 'northbound';
    if (!stop?.isReturn) return outbound;
    return outbound === 'northbound' ? 'southbound' : 'northbound';
  }
  function depClockFor(stop) {
    return departureFor(dirFor(stop));
  }

  function kindLabel(k) {
    return (BOOKING_KINDS.find((b) => b.id === k) || BOOKING_KINDS[4]).label;
  }
  function budgetCatLabel(id) {
    return (BUDGET_CATEGORIES.find((c) => c.id === id) || BUDGET_CATEGORIES[4]).label;
  }

  function diaryDate(ms) {
    const d = new Date(ms);
    return d.toLocaleDateString('en-CA', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    }) + '  ·  ' + d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
  }

  function stopNameOrNull(stopId) {
    const s = stopId ? getStop(stopId) : null;
    return s ? s.name : null;
  }

  onMount(async () => {
    trip = (await getTrip(id)) || null;
    if (trip) {
      [packing, bookings, budget, diary] = await Promise.all([
        listPackingItems(id),
        listBookings(id),
        listBudgetEntries(id),
        listDiaryEntries(id)
      ]);
    }
    loaded = true;
    if (!trip) return;

    /* Wait for fonts so the headline doesn't reflow mid-print. */
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (_) {}
    }
    /* Small delay so the screen-preview renders for a beat before
       the dialog opens. The Save as PDF flow lives in the browser
       print sheet from here on. */
    setTimeout(() => {
      printed = true;
      try { window.print(); } catch (_) {}
    }, 600);
  });

  function reprint() {
    try { window.print(); } catch (_) {}
  }
</script>

<svelte:head>
  <title>{trip ? trip.name + ' - Printable Itinerary' : 'Loading - Northlander'}</title>
  <!-- Strip the global layout chrome (topbar + footer) so the
       printable page stands alone. Keep this scoped to /print only
       via :global() inside the component, but it's simplest to
       hide them outright while this route is mounted. -->
  <style>
    body { background: #ffffff !important; }
    .topbar, footer { display: none !important; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-tip, .print-actions { display: none !important; }
      @page { size: letter; margin: 0.55in; }
    }
  </style>
</svelte:head>

{#if !loaded}
  <p class="status">Loading your trip...</p>
{:else if !trip}
  <p class="status">That trip could not be found.</p>
{:else}
  <!-- Tip strip shown only on screen, hidden when printing. -->
  <div class="print-tip">
    <span>Choose <strong>Save as PDF</strong> as the destination in the print dialog to get a clean PDF copy of your trip.</span>
    <div class="print-actions">
      <button type="button" class="print-btn" on:click={reprint}>Open print dialog</button>
      <a href={`/trips/${trip.id}`} class="print-back">Back to trip</a>
    </div>
  </div>

  <!-- ===== Cover page ===== -->
  <section class="sheet sheet-cover">
    <header class="cover-head">
      <div class="cover-brand">NORTHLANDER RAILWAY</div>
      <div class="cover-leg">{dirMeta.from.toUpperCase()}  ·  {dirMeta.to.toUpperCase()}  ·  {dirMeta.label.toUpperCase()}</div>
    </header>

    <div class="cover-stage">
      <div class="cover-suitcase">
        <Suitcase color={trip.color} strap={trip.strap} label="" />
      </div>
      <div class="cover-title">
        <div class="cover-kicker">Boarding Pass</div>
        <h1>{trip.name}</h1>
        {#if trip.departureDate}
          <p class="cover-meta">{formatTripDate(trip.departureDate)}</p>
        {/if}
        <p class="cover-meta italic">Departure {arrivalClock(0, depClock, trip.direction || 'northbound')}</p>
      </div>
    </div>

    <footer class="cover-foot">
      <span>Pass No. {trip.id}</span>
      <span>Printed {(new Date()).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      <span>Valid Every Season</span>
    </footer>
  </section>

  <!-- ===== Route page ===== -->
  <section class="sheet">
    <h2 class="sheet-title">Route</h2>
    <p class="sheet-sub">
      {dirMeta.label} departure {depClock.replace(':', '·')}
      {#if trip.departureDate}  ·  {formatTripDate(trip.departureDate)}{/if}
    </p>

    {#if stops.length === 0}
      <p class="sheet-empty">No stops on this trip yet.</p>
    {:else}
      <ol class="route">
        {#each stops as stop, i}
          {@const prev = i > 0 ? stops[i - 1] : null}
          {@const turnedAround = stop.isReturn && (!prev || !prev.isReturn)}
          {#if turnedAround}
            <li class="route-turn" aria-hidden="true">Turnaround &mdash; Return Trip</li>
          {/if}
          <li class:is-return={stop.isReturn}>
            <div class="route-row">
              <span class="route-num">{i + 1}</span>
              <div class="route-body">
                <div class="route-name-row">
                  <span class="route-name">{stop.name}</span>
                  <span class="route-time">{arrivalClock(stop.offsetMinutes, depClockFor(stop), dirFor(stop))}</span>
                </div>
                <div class="route-meta">
                  {stop.region}
                  {#if stop.date} &middot; {formatTripDate(stop.date)}{/if}
                </div>
              </div>
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <!-- ===== Packing page ===== -->
  <section class="sheet">
    <h2 class="sheet-title">Packing list</h2>
    {#if packing.length === 0}
      <p class="sheet-empty">Nothing packed yet.</p>
    {:else}
      <ul class="checklist">
        {#each packing as item}
          <li class:packed={item.packed}>
            <span class="check-box" class:packed={item.packed}></span>
            <span>{item.name}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- ===== Plans page ===== -->
  <section class="sheet">
    <h2 class="sheet-title">Plans</h2>
    {#if bookings.length === 0}
      <p class="sheet-empty">Nothing planned yet.</p>
    {:else}
      <ul class="checklist">
        {#each bookings as item}
          {@const hasRoomDetail = item.kind === 'room' && (item.checkIn || item.checkOut || item.address || item.contact || item.confirmation || item.notes)}
          <li class:packed={item.status === 'booked'}>
            <span class="check-box" class:packed={item.status === 'booked'}></span>
            <span class="booking-line">
              <strong>{item.startTime ? item.startTime + '  ' : ''}{item.title}</strong>
              <em>{kindLabel(item.kind)}{item.dueDate ? '  ·  due ' + item.dueDate : ''}</em>
              {#if hasRoomDetail}
                <span class="room-detail">
                  {#if item.checkIn || item.checkOut}
                    <span class="room-dates">
                      {item.checkIn ? 'In: ' + item.checkIn : ''}
                      {item.checkIn && item.checkOut ? ' · ' : ''}
                      {item.checkOut ? 'Out: ' + item.checkOut : ''}
                    </span>
                  {/if}
                  {#if item.address}
                    <span>{item.address}</span>
                  {/if}
                  {#if item.contact}
                    <span>{item.contact}</span>
                  {/if}
                  {#if item.confirmation}
                    <span>Confirmation {item.confirmation}</span>
                  {/if}
                  {#if item.notes}
                    <span class="room-notes">{item.notes}</span>
                  {/if}
                </span>
              {/if}
            </span>
            <span class="status-cell">{item.status === 'booked' ? 'Booked' : 'Pending'}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- ===== Budget page ===== -->
  {#if budget.length > 0}
    <section class="sheet">
      <h2 class="sheet-title">Budget ledger</h2>
      <p class="sheet-sub">{formatAmount(totalOf(budget))} planned in {budget.length} {budget.length === 1 ? 'line' : 'lines'}</p>

      <ul class="ledger-print">
        {#each budget as entry}
          <li>
            <span class="ledger-label">{entry.label}</span>
            <span class="ledger-cat">{budgetCatLabel(entry.category)}</span>
            <span class="ledger-amount">{formatAmount(entry.amount)}</span>
          </li>
        {/each}
      </ul>

      <div class="ledger-total">
        <span>Total</span>
        <span>{formatAmount(totalOf(budget))}</span>
      </div>

      {#if budget.length > 1}
        {@const bd = breakdownByCategory(budget)}
        <div class="ledger-breakdown">
          {#each BUDGET_CATEGORIES as c}
            {#if bd[c.id] > 0}
              <span class="ledger-chip">
                <strong>{c.label}</strong>
                <span>{formatAmount(bd[c.id])}</span>
              </span>
            {/if}
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <!-- ===== Diary pages ===== -->
  {#if diary.length > 0}
    <section class="sheet">
      <h2 class="sheet-title">Travel diary</h2>
      <ol class="diary">
        {#each diary as entry}
          <li>
            <div class="diary-meta-line">
              <span>{diaryDate(entry.createdAt)}</span>
              {#if stopNameOrNull(entry.stopId)}
                <span class="diary-stop">At {stopNameOrNull(entry.stopId)}</span>
              {/if}
            </div>
            <p>{entry.text}</p>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  <!-- ===== Footer mark ===== -->
  <p class="end-mark">Packed with Northlander.app  ·  northlanderguide.com</p>
{/if}

<style>
  .status {
    text-align: center;
    padding: 80px 24px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
  }

  /* Tip strip - screen only. */
  .print-tip {
    max-width: 720px;
    margin: 18px auto;
    padding: 14px 18px;
    background: #fbf6ea;
    border: 1.5px dashed #8b6a3a;
    border-radius: 4px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .print-tip strong {
    font-weight: 700;
    color: #0a2d21;
    font-style: normal;
  }
  .print-actions {
    display: flex;
    gap: 14px;
    align-items: center;
  }
  .print-btn {
    background: #6e2e17;
    color: #f3ece0;
    border: 2px solid #6e2e17;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .print-back {
    font-family: 'Spline Sans', sans-serif;
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: #7d3a1e;
    text-decoration: none;
  }
  .print-back:hover {
    color: #0a2d21;
  }

  /* Each .sheet is treated as a printable page. The first sheet
     prints from the top of page 1; every subsequent sheet starts
     a fresh page. */
  .sheet {
    max-width: 720px;
    margin: 24px auto;
    padding: 24px 28px;
    background: #ffffff;
    color: #0a2d21;
    font-family: 'Spline Sans', sans-serif;
    font-size: 13.5px;
    line-height: 1.55;
    page-break-after: always;
    break-after: page;
  }
  .sheet:last-of-type {
    page-break-after: auto;
    break-after: auto;
  }

  .sheet-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 28px;
    color: #0a2d21;
    border-bottom: 2px solid #7d3a1e;
    padding-bottom: 8px;
    margin: 0 0 16px;
  }
  .sheet-sub {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #7d3a1e;
    font-size: 14px;
    margin: -6px 0 18px;
  }
  .sheet-empty {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
  }

  /* ===== Cover ===== */
  .sheet-cover {
    background: #fbf6ea;
    border: 3px double #0a2d21;
    padding: 28px 32px;
    page-break-after: always;
    break-after: page;
    min-height: 9.4in; /* fills most of a US Letter page */
    display: flex;
    flex-direction: column;
  }
  .cover-head {
    text-align: center;
    border-bottom: 2px double #c9a84c;
    padding-bottom: 14px;
    margin-bottom: 18px;
  }
  .cover-brand {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 22px;
    letter-spacing: 0.16em;
    color: #0a2d21;
  }
  .cover-leg {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.22em;
    color: #7d3a1e;
    margin-top: 6px;
  }
  .cover-stage {
    flex: 1;
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 32px;
    align-items: center;
    padding: 24px 0;
  }
  .cover-suitcase {
    max-width: 180px;
  }
  .cover-kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #7d3a1e;
    font-weight: 700;
  }
  .cover-title h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 48px;
    color: #0a2d21;
    line-height: 1.05;
    margin: 6px 0 12px;
    overflow-wrap: anywhere;
  }
  .cover-meta {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 16px;
    color: #0a2d21;
    margin: 4px 0;
  }
  .cover-meta.italic {
    font-style: italic;
    color: #7d3a1e;
  }
  .cover-foot {
    border-top: 2px double #c9a84c;
    padding-top: 12px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    color: #7d3a1e;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-weight: 700;
  }

  /* ===== Route ===== */
  .route {
    list-style: none;
    padding: 0;
    margin: 0;
    counter-reset: stop;
  }
  .route-row {
    display: grid;
    grid-template-columns: 32px 1fr;
    gap: 14px;
    align-items: flex-start;
    padding: 10px 0;
    border-bottom: 1px solid rgba(139, 106, 58, 0.4);
  }
  .route-num {
    background: #0a2d21;
    color: #ffffff;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    text-align: center;
    line-height: 26px;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 14px;
    margin-top: 1px;
  }
  .route-name-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .route-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 18px;
    color: #0a2d21;
  }
  .route-time {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 15px;
    color: #7d3a1e;
  }
  .route-meta {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    color: #5a4f3d;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-weight: 600;
    margin-top: 2px;
  }
  /* Return-leg rows wear a subtle gold tinge on the row number so
     they read as a different leg without overpowering the print
     aesthetic. */
  .route li.is-return .route-num {
    color: #c9a84c;
    border-color: #c9a84c;
  }
  /* Turnaround marker between outbound and return blocks. Same
     editorial small-caps vocabulary as the chapter divider. */
  .route-turn {
    list-style: none;
    margin: 12px 0 8px;
    padding: 6px 0;
    text-align: center;
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #7d3a1e;
    border-top: 1px dashed rgba(125, 58, 30, 0.45);
    border-bottom: 1px dashed rgba(125, 58, 30, 0.45);
  }

  /* ===== Checklists ===== */
  .checklist {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .checklist li {
    display: grid;
    grid-template-columns: 20px 1fr auto;
    gap: 12px;
    align-items: baseline;
    padding: 6px 0;
    border-bottom: 1px dotted rgba(139, 106, 58, 0.5);
    font-size: 13px;
    color: #0a2d21;
  }
  .check-box {
    width: 14px;
    height: 14px;
    border: 1.5px solid #0a2d21;
    display: inline-block;
    position: relative;
    border-radius: 2px;
    margin-top: 2px;
  }
  .check-box.packed::after {
    content: '';
    position: absolute;
    left: 1.5px;
    top: -3px;
    width: 9px;
    height: 14px;
    border-right: 2px solid #0a2d21;
    border-bottom: 2px solid #0a2d21;
    transform: rotate(45deg);
  }
  .booking-line {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .booking-line strong {
    font-family: 'Spline Sans', sans-serif;
    font-weight: 700;
    font-size: 13px;
  }
  .booking-line em {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 11.5px;
    color: #5a4f3d;
    margin-top: 1px;
  }
  .room-detail {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 6px;
    padding-left: 10px;
    border-left: 1.5px solid #7d3a1e;
    font-family: 'Spline Sans', sans-serif;
    font-size: 11.5px;
    color: #0a2d21;
  }
  .room-detail .room-dates {
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .room-detail .room-notes {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #241f1a;
    margin-top: 2px;
    white-space: pre-wrap;
  }
  .status-cell {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 700;
    color: #7d3a1e;
  }

  /* ===== Diary ===== */
  .diary {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .diary li {
    padding: 12px 0;
    border-bottom: 1px dashed rgba(139, 106, 58, 0.45);
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .diary-meta-line {
    display: flex;
    gap: 12px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 700;
    color: #7d3a1e;
    margin-bottom: 6px;
  }
  .diary-stop {
    color: #0a2d21;
  }
  .diary p {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 14.5px;
    line-height: 1.55;
    color: #241f1a;
    margin: 0;
    white-space: pre-wrap;
  }

  .end-mark {
    text-align: center;
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #5a4f3d;
    margin: 14px 0 32px;
  }

  /* ===== Budget print layout ===== */
  .ledger-print {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .ledger-print li {
    display: grid;
    grid-template-columns: 1fr auto 110px;
    align-items: baseline;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px dotted rgba(139, 106, 58, 0.5);
    font-size: 13px;
    color: #0a2d21;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .ledger-label {
    font-family: 'Spline Sans', sans-serif;
    font-weight: 600;
  }
  .ledger-cat {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 700;
    color: #7d3a1e;
  }
  .ledger-amount {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 14.5px;
    text-align: right;
    color: #0a2d21;
  }
  .ledger-total {
    display: flex;
    justify-content: space-between;
    padding: 10px 0 14px;
    border-top: 2px solid #0a2d21;
    margin-top: 6px;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 18px;
    color: #0a2d21;
  }
  .ledger-breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
  }
  .ledger-chip {
    border: 1.5px dashed #8b6a3a;
    border-radius: 999px;
    padding: 3px 10px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    color: #0a2d21;
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
  }
  .ledger-chip strong {
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 10px;
    color: #7d3a1e;
  }
</style>
