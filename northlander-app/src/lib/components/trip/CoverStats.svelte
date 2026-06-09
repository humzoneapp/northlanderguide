<script>
  /* ==================================================================
     Cover dateline + countdown + animated stats grid.

     Sits in the cover's left column below the H1. Three editorial
     layers stacked on a dashed gold rule:

       1. Dateline - "Mon, May 15 to Wed, May 17 . Northbound"
       2. Countdown - "3 days, 4 hrs, 12 mins until you board",
          or a soft italic prompt when no departure date is set yet,
          or "You've been. This is your record." once the train has
          left and the trip's in the past.
       3. Stats grid - six tweened figures (Stops / Plans / Booked /
          Photos / Notes / Spent). Each animates from 0 to the latest
          count whenever the parent's data refreshes.

     Lifted out of trip-page/+page.svelte on 2026-06-09 as part of
     the cover-breakup pass. The tweened stores live here so the
     parent's only job is to hand over the raw counts.
     ================================================================== */

  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { formatAmount } from '$lib/stores/budget.js';

  /** "Mon, May 15 to Wed, May 17" or '' for legacy trips with no
      departure date. */
  export let tripDateLine = '';
  /** 'Northbound' | 'Southbound'. */
  export let dirLabel = 'Northbound';
  /** null = no departure date | { past: true } | { days, hours, minutes }. */
  export let countdown = null;

  /* Live counts the parent already aggregates. Each one drives one
     tweened store below. */
  export let stopsVisited = 0;
  export let plansCount = 0;
  export let bookedCount = 0;
  export let photosCount = 0;
  export let notesCount = 0;
  export let spent = 0;
  /** Hide the Spent tile until at least one ledger row exists, so
      empty trips don't show a "$0.00 Spent" zero. */
  export let showSpent = false;

  const animStops = tweened(0, { duration: 700, easing: cubicOut });
  const animPlans = tweened(0, { duration: 700, easing: cubicOut });
  const animBooked = tweened(0, { duration: 700, easing: cubicOut });
  const animPhotos = tweened(0, { duration: 700, easing: cubicOut });
  const animNotes = tweened(0, { duration: 700, easing: cubicOut });
  const animSpent = tweened(0, { duration: 800, easing: cubicOut });

  $: animStops.set(stopsVisited);
  $: animPlans.set(plansCount);
  $: animBooked.set(bookedCount);
  $: animPhotos.set(photosCount);
  $: animNotes.set(notesCount);
  $: animSpent.set(spent || 0);
</script>

{#if tripDateLine}
  <div class="cover-date">{tripDateLine}  ·  {dirLabel}</div>
{/if}

{#if countdown == null}
  <div class="cover-countdown italic-soft">
    Pick a departure date in Before You Board below and we'll count it down.
  </div>
{:else if countdown.past}
  <div class="cover-countdown italic-soft">
    You've been. This is your record.
  </div>
{:else}
  {@const d = countdown.days}
  {@const h = countdown.hours}
  {@const m = countdown.minutes}
  <div class="cover-countdown">
    <strong>
      {#if d > 0}{d} {d === 1 ? 'day' : 'days'}, {/if}
      {#if d > 0 || h > 0}{h} {h === 1 ? 'hr' : 'hrs'}, {/if}
      {m} {m === 1 ? 'min' : 'mins'}
    </strong>
    until you board
  </div>
{/if}

<ul class="cover-stats">
  <li>
    <b>{Math.round($animStops)}</b>
    <span>{stopsVisited === 1 ? 'Stop' : 'Stops'}</span>
  </li>
  <li><b>{Math.round($animPlans)}</b><span>Plans</span></li>
  <li><b>{Math.round($animBooked)}</b><span>Booked</span></li>
  <li><b>{Math.round($animPhotos)}</b><span>Photos</span></li>
  <li><b>{Math.round($animNotes)}</b><span>Notes</span></li>
  {#if showSpent}
    <li><b>{formatAmount($animSpent)}</b><span>Spent</span></li>
  {/if}
</ul>

<style>
  .cover-date {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(18px, 2.4vw, 22px);
    color: #c9a84c;
    margin: 10px 0 4px;
  }
  .cover-countdown {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(20px, 3vw, 28px);
    /* "until you board" sits in amber so the bigger ivory numbers
       inside <strong> carry the visual weight. */
    color: #c4860f;
    line-height: 1.2;
    margin: 14px 0 20px;
  }
  .cover-countdown strong {
    font-weight: 900;
    color: #f5f0e8;
  }
  .cover-countdown.italic-soft {
    font-style: italic;
    color: #cad7cf;
    font-size: clamp(15px, 2vw, 18px);
  }

  .cover-stats {
    list-style: none;
    padding: 22px 0 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: 16px;
    border-top: 1px dashed rgba(201, 168, 76, 0.45);
  }
  .cover-stats li { display: flex; flex-direction: column; }
  .cover-stats b {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(26px, 3.6vw, 34px);
    color: #c9a84c;
    line-height: 1;
  }
  .cover-stats span {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    font-weight: 700;
    color: #cad7cf;
    margin-top: 4px;
  }
</style>
