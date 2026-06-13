<script>
  /* ==================================================================
     Sample trip preview.

     Renders SAMPLE_TRIP (lib/data/sample-trip.js) as a read-only
     editorial walkthrough of what a real trip looks like in the app.
     Goal is conversion - the visitor sees stops, bookings, budget,
     diary, and lands at a "Make this my trip" CTA at the bottom.

     The duplication into Dexie (creating a real trip from this) is
     coming in a follow-up commit; for now the CTA shows a "coming
     soon" toast so the surface ships and the polaroid CTA on home
     has somewhere real to land.
     ================================================================== */

  import { SAMPLE_TRIP } from '$lib/data/sample-trip.js';
  import { STOPS, getStop, stopImageUrl } from '$lib/data/stops.js';
  import { pushToast } from '$lib/stores/toasts.js';

  /* Resolve stopId → stop record once for each sample stop so we can
     show the name, region, hook, and image without per-render lookups. */
  $: tripStops = SAMPLE_TRIP.stops.map((s) => ({
    visit: s,
    stop: getStop(s.stopId)
  }));

  /* Format a YYYY-MM-DD date as "Fri, Sep 4" for the trip timeline. */
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

<!-- Sticky "Sample trip" banner so the visitor never mistakes this for
     one of their own trips. Rust band, ivory text, fixed under the
     topbar. -->
<div class="sample-banner" role="note" aria-label="Sample trip preview">
  <span class="sample-banner-tag">Sample trip</span>
  <span class="sample-banner-text">This is a worked example. Tap "Make this my trip" at the bottom to start your own.</span>
</div>

<header class="sample-hero">
  <div class="sample-hero-inner">
    <div class="kicker">Three Stops · Three Days · 2026</div>
    <h1>{SAMPLE_TRIP.name}</h1>
    <p class="sample-strap">{SAMPLE_TRIP.strap}</p>

    <ul class="sample-stats" aria-label="Trip summary">
      <li><b>{SAMPLE_TRIP.packingCount}</b><span>Packing items</span></li>
      <li><b>{SAMPLE_TRIP.bookingCount}</b><span>Bookings</span></li>
      <li><b>${SAMPLE_TRIP.budgetTotal}</b><span>Budget planned</span></li>
      <li><b>{SAMPLE_TRIP.diaryCount}</b><span>Diary notes</span></li>
    </ul>
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
      {#each tripStops as { visit, stop }, i (visit.stopId + i)}
        {#if stop}
          <li class="sample-stop">
            <div class="sample-stop-photo">
              <img src={stopImageUrl(stop)} alt={stop.name} loading="lazy" decoding="async" />
            </div>
            <div class="sample-stop-body">
              <div class="sample-stop-date">{fmtDate(visit.date)}</div>
              <h3 class="sample-stop-name">{stop.name}</h3>
              <div class="sample-stop-region">{stop.region}</div>
              <p class="sample-stop-note">{visit.note}</p>
            </div>
          </li>
        {/if}
      {/each}
    </ol>
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
      <div class="kicker kicker-dark">Budget</div>
      <h2>${SAMPLE_TRIP.budgetTotal} for one traveller, three days</h2>
    </header>

    <table class="sample-budget">
      <tbody>
        {#each SAMPLE_TRIP.budget as line, i (line.category + i)}
          <tr>
            <td class="sample-budget-cat">{line.category}</td>
            <td class="sample-budget-label">{line.label}</td>
            <td class="sample-budget-amt">${line.amount}</td>
          </tr>
        {/each}
        <tr class="sample-budget-total">
          <td colspan="2">Total</td>
          <td>${SAMPLE_TRIP.budgetTotal}</td>
        </tr>
      </tbody>
    </table>
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
  .sample-banner-text {
    flex: 1;
    min-width: 0;
  }

  .sample-hero {
    background:
      radial-gradient(ellipse at 75% 25%, rgba(196, 134, 15, 0.32), transparent 55%),
      linear-gradient(180deg, #0a2d21 0%, #16543e 100%);
    color: #f5f0e8;
    padding: 48px 24px 56px;
  }
  .sample-hero-inner {
    max-width: 1180px;
    margin: 0 auto;
  }
  .kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #c4860f;
  }
  .kicker-dark {
    color: #7d3a1e;
  }
  .sample-hero h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2.4rem, 6vw, 3.6rem);
    line-height: 1.05;
    margin: 12px 0 14px;
    letter-spacing: -0.01em;
  }
  .sample-strap {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(15px, 1.6vw, 18px);
    line-height: 1.5;
    color: #cad7cf;
    margin: 0 0 28px;
    max-width: 56ch;
  }
  .sample-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 28px 36px;
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .sample-stats li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: #f5f0e8;
  }
  .sample-stats b {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 32px;
    font-weight: 900;
    color: #c9a84c;
    line-height: 1;
  }
  .sample-stats span {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #cad7cf;
  }

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
    .sample-stop {
      grid-template-columns: 280px 1fr;
    }
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
  .sample-stop-body {
    padding: 20px 22px 22px;
  }
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
  .sample-booking.is-confirmed {
    border-color: rgba(63, 110, 68, 0.4);
  }
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

  /* ---------- Budget table ---------- */
  .sample-budget {
    width: 100%;
    border-collapse: collapse;
    background: #fbf6ea;
    border: 1.5px solid rgba(125, 58, 30, 0.18);
    border-radius: 6px;
    overflow: hidden;
  }
  .sample-budget td {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(125, 58, 30, 0.12);
    font-family: 'Spline Sans', sans-serif;
    font-size: 14px;
    color: #0a2d21;
    vertical-align: top;
  }
  .sample-budget tr:last-child td { border-bottom: none; }
  .sample-budget-cat {
    font-weight: 700;
    color: #7d3a1e;
    width: 22%;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.14em;
  }
  .sample-budget-label {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 15px;
  }
  .sample-budget-amt {
    text-align: right;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 16px;
    color: #0a2d21;
    width: 90px;
  }
  .sample-budget-total td {
    background: rgba(125, 58, 30, 0.08);
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 17px;
    color: #0a2d21;
    text-transform: none;
    letter-spacing: 0;
  }
  .sample-budget-total td:last-child {
    text-align: right;
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
