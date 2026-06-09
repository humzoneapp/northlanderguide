<script>
  /* ==================================================================
     Today band.

     A quiet stationmaster's morning notice that only renders when
     today's date falls inside the trip window (between the trip's
     departureDate and the last return entry's date). Sits at the
     top of the trip page above the cover and links into today's
     chapter so a user opening the app mid-trip lands on "you are
     here" instead of the cold pre-trip cover.

     Self-contained: takes the same outbound stops + return stops +
     trip direction the trip page already derives, computes today's
     chapter internally, and dispatches `jump` with the chapter DOM
     id so the parent can smooth-scroll using its existing STICKY
     offset helper.
     ================================================================== */

  import { createEventDispatcher } from 'svelte';
  import { trainTimeFor } from '$lib/data/schedule.js';

  /** Outbound chapters in trip order. Each row has at minimum
      { id, name, stayStart, stayEnd }. */
  export let stops = [];
  /** Return chapters in chronological order after the outbound leg. */
  export let returnStops = [];
  /** 'northbound' | 'southbound' - the outbound direction. Return
      chapters read off the opposite direction's schedule. */
  export let direction = 'northbound';
  /** When the trip is wrapped, the band hides so it doesn't fight
      the Logbook surface for the post-trip story. */
  export let wrapped = false;

  const dispatch = createEventDispatcher();

  /* Local YYYY-MM-DD for today. Recomputes once per render which is
     fine for a band that's only visible during a trip - midnight
     rollovers are caught the next time the trip page mounts. */
  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /* A chapter is "today's" when today >= stayStart AND today <= stayEnd
     (or stayEnd is empty, meaning the chapter has no upper bound).
     Returns the chapter descriptor + the DOM id the trip page uses
     to identify the scene, or null when no chapter matches. */
  function findTodayChapter(t, outbound, returnLeg, dir) {
    if (!t) return null;
    for (let i = 0; i < outbound.length; i++) {
      const c = outbound[i];
      if (!c.stayStart) continue;
      if (t >= c.stayStart && (!c.stayEnd || t <= c.stayEnd)) {
        return {
          chapter: c,
          chapterDir: dir,
          domId: `scene-${i}`,
          legLabel: i === 0 ? 'Departure' : `Stop ${i}`
        };
      }
    }
    const returnDir = dir === 'northbound' ? 'southbound' : 'northbound';
    for (let j = 0; j < returnLeg.length; j++) {
      const c = returnLeg[j];
      if (!c.stayStart) continue;
      if (t >= c.stayStart && (!c.stayEnd || t <= c.stayEnd)) {
        return {
          chapter: c,
          chapterDir: returnDir,
          domId: `scene-return-${j}`,
          legLabel: j === returnLeg.length - 1 ? 'Return' : `Return ${j + 1}`
        };
      }
    }
    return null;
  }

  $: today = todayKey();
  $: todayChapter = wrapped ? null : findTodayChapter(today, stops, returnStops, direction);
  $: train = todayChapter ? trainTimeFor(todayChapter.chapter.id, todayChapter.chapterDir) : null;
  $: trainLine = (() => {
    if (!todayChapter || !train) return '';
    /* Departure day on the outbound leg uses the depart clock from
       the home station; everywhere else the arrival clock is what
       the user wants to see. */
    if (todayChapter.legLabel === 'Departure' && train.depart) return `Train departs ${train.depart}`;
    if (train.arrive) return `Train arrives ${train.arrive}`;
    return '';
  })();
  $: friendlyDate = (() => {
    if (!todayChapter) return '';
    try {
      return new Date(today + 'T12:00:00').toLocaleDateString('en-CA', {
        weekday: 'long', month: 'short', day: 'numeric'
      });
    } catch (_) {
      return '';
    }
  })();
</script>

{#if todayChapter}
  <section class="today-band" aria-label="Today on your trip">
    <div class="today-inner">
      <div class="today-text">
        <span class="today-kicker">Today on the route</span>
        <h2 class="today-headline">
          {todayChapter.legLabel === 'Departure' ? 'Boarding from' : 'You\'re at'}
          <strong>{todayChapter.chapter.name}</strong>
        </h2>
        <p class="today-meta">
          {#if friendlyDate}<span>{friendlyDate}</span>{/if}
          {#if friendlyDate && trainLine}<span class="today-dot" aria-hidden="true">·</span>{/if}
          {#if trainLine}<span>{trainLine}</span>{/if}
        </p>
      </div>
      <button
        type="button"
        class="today-jump"
        on:click={() => dispatch('jump', { id: todayChapter.domId })}
      >
        Jump to {todayChapter.chapter.name}
        <span aria-hidden="true">&rarr;</span>
      </button>
    </div>
  </section>
{/if}

<style>
  /* Stationmaster's morning notice. Cream paper sandwiched between
     two thin dashed gold rules so it reads as a notice pinned to a
     board, not a header or a chrome bar. Sits ABOVE the trip cover
     so it greets the user on travel-day mornings without competing
     with the cover's editorial layout. */
  .today-band {
    background: #fbf6ea;
    border-top: 1px dashed rgba(196, 134, 15, 0.45);
    border-bottom: 1px dashed rgba(196, 134, 15, 0.45);
    padding: 18px 20px;
  }
  .today-inner {
    max-width: 980px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .today-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .today-kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .today-headline {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    font-style: italic;
    font-size: clamp(20px, 3vw, 26px);
    color: #0a2d21;
    line-height: 1.2;
    margin: 2px 0 4px;
  }
  .today-headline strong {
    font-weight: 900;
    font-style: normal;
    color: #7d3a1e;
  }
  .today-meta {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: #5a4f3d;
    margin: 0;
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px 8px;
  }
  .today-dot {
    color: rgba(125, 58, 30, 0.55);
  }
  .today-jump {
    flex: 0 0 auto;
    background: #0a2d21;
    color: #c9a84c;
    border: 1.5px solid #0a2d21;
    border-radius: 999px;
    padding: 8px 16px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: background 160ms ease, color 160ms ease;
  }
  .today-jump:hover {
    background: #c9a84c;
    color: #0a2d21;
    border-color: #c9a84c;
  }
  @media (max-width: 540px) {
    .today-inner {
      flex-direction: column;
      align-items: stretch;
    }
    .today-jump {
      align-self: flex-start;
    }
  }
</style>
