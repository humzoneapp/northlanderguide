<script>
  /* ==================================================================
     Vintage paper accordion drawer.

     Used in the "Trip kit" rail on the merged itinerary trip page
     to tuck Packing / Bookings / Budget / Photos / Diary / Events
     beneath the cinematic itinerary scenes without taking over
     the page. Built on the native <details> element so keyboard
     and screen reader behaviour comes for free.

     Props:
       title       - Fraunces headline shown in the summary row
       kicker      - small gold eyebrow tag above the title
       count       - optional number rendered as an amber pill
                     (e.g. how many bookings, photos, etc.)
       countLabel  - optional label after the count, like "pending"
       defaultOpen - whether the drawer is expanded on first render
     ================================================================== */

  export let title;
  export let kicker = '';
  export let count = null;
  export let countLabel = '';
  export let defaultOpen = false;
</script>

<details class="drawer" open={defaultOpen}>
  <summary class="drawer-head">
    <div class="drawer-head-text">
      {#if kicker}<span class="drawer-kicker">{kicker}</span>{/if}
      <h3 class="drawer-title">{title}</h3>
    </div>

    {#if count != null}
      <span class="drawer-count" aria-hidden="true">
        <span class="drawer-count-num">{count}</span>
        {#if countLabel}<span class="drawer-count-label">{countLabel}</span>{/if}
      </span>
    {/if}

    <span class="drawer-chev" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </span>
  </summary>

  <div class="drawer-body">
    <slot />
  </div>
</details>

<style>
  /* Cream paper card with rust left border so it reads as a
     companion to the existing trip-detail "ticket" cards
     elsewhere in the app. */
  .drawer {
    background: #fbf6ea;
    border-left: 4px solid #7d3a1e;
    box-shadow: 0 6px 18px rgba(40, 20, 5, 0.08);
    margin-bottom: 14px;
    overflow: hidden;
  }
  .drawer + .drawer {
    margin-top: 0;
  }

  /* Hide the native disclosure triangle - we render our own chevron. */
  .drawer-head::-webkit-details-marker { display: none; }
  .drawer-head { list-style: none; }

  .drawer-head {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    cursor: pointer;
    user-select: none;
    transition: background 160ms ease;
  }
  .drawer-head:hover {
    background: rgba(196, 134, 15, 0.08);
  }

  .drawer-head-text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .drawer-kicker {
    display: block;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #7d3a1e;
    margin-bottom: 3px;
  }
  .drawer-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: clamp(18px, 2.4vw, 22px);
    line-height: 1.15;
    color: #0a2d21;
    margin: 0;
  }

  .drawer-count {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    background: rgba(196, 134, 15, 0.16);
    border: 1.5px solid #c4860f;
    border-radius: 999px;
    padding: 4px 12px;
    color: #0a2d21;
    font-family: 'Fraunces', Georgia, serif;
  }
  .drawer-count-num {
    font-weight: 900;
    font-size: 15px;
    line-height: 1;
  }
  .drawer-count-label {
    font-style: italic;
    font-size: 12px;
    color: #5a4f3d;
  }

  .drawer-chev {
    flex: 0 0 auto;
    color: #7d3a1e;
    transition: transform 180ms ease;
    display: inline-flex;
  }
  .drawer[open] .drawer-chev {
    transform: rotate(180deg);
  }

  .drawer-body {
    padding: 4px 20px 22px;
    border-top: 1px dashed rgba(125, 58, 30, 0.25);
  }

  /* Small screens - tighter padding so the cards don't dominate. */
  @media (max-width: 640px) {
    .drawer-head {
      padding: 16px 16px;
    }
    .drawer-body {
      padding: 4px 16px 18px;
    }
  }
</style>
