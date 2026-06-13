<script>
  /* ==================================================================
     Cover ticket strip.

     Boarding-pass style header that runs across the top of the trip
     cover. One chip per outbound stop with the arrive + depart times
     pulled off the schedule, plus a second row of return-leg chips
     (in forest-on-gold) when a return is set. A dashed schedule
     disclaimer + "Confirm on ontarionorthland.ca" link sits below.

     Lifted out of trip-page/+page.svelte on 2026-06-09 to break the
     cover into smaller pieces. Pure presentation: no local state,
     no event dispatchers. Parent passes the stop arrays + direction.
     ================================================================== */

  import { trainTimeFor, OFFICIAL_SCHEDULE_URL } from '$lib/data/schedule.js';

  /** Outbound stops as derived in the parent (each carries id, name,
      stayStart, stayEnd, etc.). */
  export let stops = [];
  /** Return-leg stops, possibly empty. */
  export let returnStops = [];
  /** 'northbound' | 'southbound' for the outbound leg. The return
      direction is the opposite and is computed inline. */
  export let direction = 'northbound';

  /* Mirrors the parent's formatDateShort: en-CA, month short + day,
     anchored at 12:00 so timezone math never shifts the day. */
  function formatDateShort(yyyymmdd) {
    if (!yyyymmdd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return '';
    try {
      return new Date(yyyymmdd + 'T12:00:00').toLocaleDateString('en-CA', {
        month: 'short',
        day: 'numeric',
      });
    } catch (_) {
      return '';
    }
  }

  $: returnDir = direction === 'northbound' ? 'southbound' : 'northbound';
</script>

{#if stops.length > 0}
  <div class="cover-ticket" aria-label="Route">
    {#each stops as s, i}
      {@const stopTime = trainTimeFor(s.id, direction)}
      {@const isFirst = i === 0}
      {@const isLastOutbound = i === stops.length - 1}
      {@const onwardTime = isLastOutbound && returnStops.length > 0
        ? trainTimeFor(s.id, returnDir)
        : stopTime}
      {@const onwardDate = isLastOutbound && returnStops.length > 0
        ? returnStops[0].stayStart
        : (i + 1 < stops.length ? stops[i + 1].stayStart : '')}
      <span class="cover-ticket-end">
        <span class="cover-ticket-kicker">
          {#if isFirst}
            Depart
          {:else}
            Stop {i}
          {/if}
        </span>
        <span class="cover-ticket-name">{s.name}</span>
        {#if !isFirst && stopTime?.arrive}
          <span class="cover-ticket-line">
            <span class="cover-ticket-tag">Arrive</span>
            <span class="cover-ticket-time">{stopTime.arrive}</span>
            {#if s.stayStart}
              <span class="cover-ticket-date">{formatDateShort(s.stayStart)}</span>
            {/if}
          </span>
        {/if}
        {#if (isFirst || !isLastOutbound || (isLastOutbound && returnStops.length > 0)) && (onwardTime?.depart || onwardTime?.arrive)}
          <span class="cover-ticket-line">
            <span class="cover-ticket-tag">Depart</span>
            <span class="cover-ticket-time">{onwardTime.depart || onwardTime.arrive}</span>
            {#if isFirst && s.stayStart}
              <span class="cover-ticket-date">{formatDateShort(s.stayStart)}</span>
            {:else if onwardDate}
              <span class="cover-ticket-date">{formatDateShort(onwardDate)}</span>
            {/if}
          </span>
          <!-- Once-a-day service hint: when the user is staying
               overnight at an intermediate stop, the "Depart" line
               renders the next day's pass-through time of the same
               train. Without this hint a glance reads "Arrive 20:45 /
               Depart 20:45" as a typo. Only fires when there is no
               separate scheduled depart time AND the depart date is
               later than the arrive date - i.e. genuinely the next
               day's same service. -->
          {#if !isFirst && !onwardTime?.depart && onwardDate && s.stayStart && onwardDate !== s.stayStart}
            <span class="cover-ticket-hint">Same train, next day</span>
          {/if}
        {/if}
      </span>
      {#if i < stops.length - 1 || returnStops.length > 0}
        <span class="cover-ticket-arrow" aria-hidden="true">
          <svg viewBox="0 0 60 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <path d="M2 7 H48" stroke-dasharray="3 3"/>
            <path d="M42 2 L52 7 L42 12"/>
          </svg>
        </span>
      {/if}
    {/each}
    {#if returnStops.length > 0}
      {#each returnStops as rs, j}
        {@const returnTime = trainTimeFor(rs.id, returnDir)}
        {@const isLastReturn = j === returnStops.length - 1}
        {@const onwardReturnTime = isLastReturn ? null : trainTimeFor(rs.id, returnDir)}
        {@const onwardReturnDate = isLastReturn ? '' : returnStops[j + 1].stayStart}
        <span class="cover-ticket-end cover-ticket-end--return">
          <span class="cover-ticket-kicker">
            {isLastReturn ? 'Return' : `Return ${j + 1}`}
          </span>
          <span class="cover-ticket-name">{rs.name}</span>
          {#if returnTime?.arrive}
            <span class="cover-ticket-line">
              <span class="cover-ticket-tag">Arrive</span>
              <span class="cover-ticket-time">{returnTime.arrive}</span>
              {#if rs.stayStart}
                <span class="cover-ticket-date">{formatDateShort(rs.stayStart)}</span>
              {/if}
            </span>
          {/if}
          {#if onwardReturnTime && (onwardReturnTime.depart || onwardReturnTime.arrive)}
            <span class="cover-ticket-line">
              <span class="cover-ticket-tag">Depart</span>
              <span class="cover-ticket-time">{onwardReturnTime.depart || onwardReturnTime.arrive}</span>
              {#if onwardReturnDate}
                <span class="cover-ticket-date">{formatDateShort(onwardReturnDate)}</span>
              {/if}
            </span>
          {/if}
        </span>
        {#if j < returnStops.length - 1}
          <span class="cover-ticket-arrow" aria-hidden="true">
            <svg viewBox="0 0 60 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M2 7 H48" stroke-dasharray="3 3"/>
              <path d="M42 2 L52 7 L42 12"/>
            </svg>
          </span>
        {/if}
      {/each}
    {/if}
  </div>
  <p class="cover-ticket-note">
    Schedule subject to change.
    <a href={OFFICIAL_SCHEDULE_URL} target="_blank" rel="noopener">
      Confirm on ontarionorthland.ca &rarr;
    </a>
  </p>
{/if}

<style>
  /* Boarding-pass header at the top of the cover. Forest dark band
     with a gold border and a dashed arrow between station chips. */
  .cover-ticket {
    position: relative;
    z-index: 3;
    max-width: 1180px;
    margin: 0 auto 28px;
    background: rgba(10, 45, 33, 0.72);
    border: 1.5px solid #c9a84c;
    box-shadow: inset 0 0 0 2px rgba(10, 45, 33, 0.85);
    padding: 12px 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    color: #f5f0e8;
    flex-wrap: wrap;
  }
  .cover-ticket-end {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 160px;
  }
  /* Each chip carries up to two timing lines (Arrive + Depart). The
     tag sits in a small caps strip so a glance reads "what" first;
     the actual time + date follow inline. */
  .cover-ticket-line {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 2px;
  }
  .cover-ticket-tag {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #c4860f;
  }
  .cover-ticket-kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.28em;
    /* Floored at 12px so the kicker stays readable on phones. */
    font-size: clamp(12px, 2.6vw, 13px);
    font-weight: 800;
    color: #c9a84c;
  }
  .cover-ticket-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: clamp(1.25rem, 4.5vw, 1.4rem);
    color: #f5f0e8;
    text-align: center;
    line-height: 1.15;
  }
  /* Same Fraunces face as the station name so the train time reads
     as part of the boarding-pass identity, not as metadata. */
  .cover-ticket-time {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-style: italic;
    font-size: clamp(1.15rem, 4vw, 1.3rem);
    color: #c9a84c;
    text-align: center;
    line-height: 1.15;
    margin-top: 2px;
  }
  .cover-ticket-date {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(13.5px, 3vw, 14.5px);
    color: #ede0cc;
    margin-top: 2px;
  }
  /* Quiet italic hint that appears under the Depart line when the
     user is staying overnight at an intermediate stop. Smaller +
     dimmer than the date so it reads as a footnote, not as more
     boarding-pass info. */
  .cover-ticket-hint {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 11.5px;
    color: #ede0cc;
    opacity: 0.75;
    letter-spacing: 0.02em;
    margin-top: 1px;
    text-align: center;
  }
  /* Schedule reference line under the ticket. Quiet italic so it
     doesn't compete; gold link to match the ticket frame. */
  .cover-ticket-note {
    position: relative;
    z-index: 3;
    max-width: 1180px;
    margin: 10px auto 28px;
    text-align: center;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(14.5px, 2vw, 16px);
    color: #ede0cc;
    opacity: 0.92;
    line-height: 1.4;
  }
  .cover-ticket-note a {
    color: #c9a84c;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .cover-ticket-note a:hover { color: #f5f0e8; }
  .cover-ticket-arrow {
    color: #c9a84c;
    width: 60px;
    flex: none;
  }
  .cover-ticket-arrow svg { width: 100%; height: auto; display: block; }
  @media (max-width: 720px) {
    .cover-ticket { padding: 12px 14px; gap: 10px 12px; }
    .cover-ticket-arrow { transform: rotate(90deg); width: 30px; }
    .cover-ticket-end { min-width: 0; flex-basis: 100%; }
  }
  /* Return chips wear a forest-gold kicker so the eye can split the
     two legs at a glance. */
  .cover-ticket-end--return .cover-ticket-kicker {
    color: #c9a84c;
  }
</style>
