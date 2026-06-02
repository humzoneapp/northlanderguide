<script>
  /* ==================================================================
     Vintage railway route map.

     A horizontal (desktop) / vertical (mobile) schematic of the
     stops on the trip, in route order, with numbered pins. Each
     pin is a link to the matching scene below (#scene-{i}) so the
     map doubles as a chapter-jump nav.

     Visual identity mirrors the rest of the cinematic shell:
     forest field, gold-haloed dark pins (same as the wizard
     numbered badges), dashed gold rail, cream italic stop names,
     gold mono arrival times. Travel-time labels sit on the rail
     between adjacent pins on desktop and tuck out of the way on
     mobile to keep the column scan tight.

     The component renders nothing for trips with fewer than two
     stops - a one-stop "map" wouldn't tell you anything you
     don't already know from the scenes themselves.
     ================================================================== */

  import { arrivalClock, travelDuration, travelMinutes } from '$lib/data/schedule.js';

  export let stops = [];
  export let direction = 'northbound';
  export let departureClock = '09:00';

  /* Pre-compute the travel-time label between each adjacent pair
     so the template stays simple. Index i is the gap between
     stop i and stop i+1 (so it's undefined past the last pin). */
  $: gaps = stops.slice(0, -1).map((s, i) => {
    const a = travelMinutes(s.offsetMinutes, direction);
    const b = travelMinutes(stops[i + 1].offsetMinutes, direction);
    return travelDuration(Math.max(0, b - a));
  });

  $: visible = Array.isArray(stops) && stops.length >= 2;

  /* "Heading north" / "Heading south" tag at the start. */
  $: headingLabel = direction === 'southbound' ? 'Heading south' : 'Heading north';
</script>

{#if visible}
  <section class="map" aria-label="Route map">
    <div class="map-inner">
      <header class="map-head">
        <div>
          <div class="kicker kicker-light">Your route</div>
          <h2 class="map-title">{stops.length} stops &middot; {headingLabel}</h2>
        </div>
        <p class="map-hint">Tap a stop to jump to its chapter below.</p>
      </header>

      <ol class="rail">
        {#each stops as stop, i}
          <li class="rail-stop" style="--i:{i}">
            <a
              href={`#scene-${i}`}
              class="pin"
              aria-label={`Jump to ${stop.name}`}
            >
              <span class="pin-num">{i + 1}</span>
            </a>
            <div class="rail-meta">
              <div class="rail-name">{stop.name}</div>
              <div class="rail-time">{arrivalClock(stop.offsetMinutes, departureClock, direction)}</div>
            </div>
            {#if i < stops.length - 1}
              <span class="rail-gap" aria-hidden="true">
                <span class="rail-gap-line"></span>
                <span class="rail-gap-time">{gaps[i]}</span>
              </span>
            {/if}
          </li>
        {/each}
      </ol>
    </div>
  </section>
{/if}

<style>
  /* Forest field so the map reads as a continuation of the cover
     and scenes - it sits between the narrative band and the
     scenes section. The amber radial highlight echoes the cover. */
  .map {
    background:
      radial-gradient(circle at 80% 0%, rgba(196, 134, 15, 0.16), transparent 55%),
      linear-gradient(180deg, var(--cover-bg-deep, #0a2d21) 0%, var(--cover-bg-bot, #0e3b2c) 100%);
    color: #f5f0e8;
    padding: 40px 24px 44px;
    border-top: 1px solid rgba(201, 168, 76, 0.18);
    border-bottom: 1px solid rgba(201, 168, 76, 0.18);
  }
  .map-inner {
    max-width: 1180px;
    margin: 0 auto;
  }
  .map-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
    margin-bottom: 28px;
    padding-bottom: 16px;
    border-bottom: 1px dashed rgba(201, 168, 76, 0.3);
  }
  .kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #c4860f;
    margin-bottom: 6px;
  }
  .kicker-light { color: #c4860f; }
  .map-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-style: italic;
    font-size: clamp(20px, 3vw, 26px);
    margin: 0;
    color: #f5f0e8;
  }
  .map-hint {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: rgba(245, 240, 232, 0.7);
    font-size: 13px;
    margin: 0;
  }

  /* ===== Horizontal rail (desktop) ===== */
  .rail {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0;
    position: relative;
  }
  .rail-stop {
    display: flex;
    align-items: flex-start;
    flex: 0 0 auto;
    position: relative;
  }
  /* Pin column - dot + meta. .rail-gap floats next to it. */
  .rail-stop > .pin {
    flex: 0 0 auto;
  }
  .rail-stop > .rail-meta {
    position: absolute;
    top: 56px;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    width: clamp(80px, 11vw, 140px);
    pointer-events: none;
  }
  .rail-name {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(13px, 1.5vw, 16px);
    color: #f5f0e8;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .rail-time {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #c4860f;
    font-weight: 700;
    margin-top: 3px;
  }

  /* Gap between pins - dashed gold line with travel-time label. */
  .rail-gap {
    flex: 1 1 auto;
    position: relative;
    height: 44px;
    display: flex;
    align-items: center;
    min-width: 60px;
  }
  .rail-gap-line {
    flex: 1;
    height: 0;
    border-top: 2px dashed rgba(196, 134, 15, 0.75);
  }
  .rail-gap-time {
    position: absolute;
    top: -22px;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12px;
    color: rgba(245, 240, 232, 0.8);
    background: #0a2d21;
    padding: 0 8px;
    white-space: nowrap;
  }

  /* Pin - gold halo, dark forest center, gold number. Matches the
     wizard's numbered badges so the visual vocabulary repeats. */
  .pin {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #0a2d21;
    color: #c9a84c;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 19px;
    text-decoration: none;
    box-shadow:
      inset 0 0 0 2.5px #c9a84c,
      0 0 0 4px rgba(196, 134, 15, 0.18),
      0 6px 14px rgba(0, 0, 0, 0.35);
    transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
    line-height: 1;
    flex-shrink: 0;
  }
  .pin:hover,
  .pin:focus-visible {
    background: #c4860f;
    color: #0a2d21;
    transform: translateY(-2px);
    box-shadow:
      inset 0 0 0 2.5px #f5f0e8,
      0 0 0 6px rgba(196, 134, 15, 0.32),
      0 10px 22px rgba(0, 0, 0, 0.4);
    outline: none;
  }
  .pin-num {
    line-height: 1;
    pointer-events: none;
  }

  /* ===== Vertical (mobile) ===== */
  @media (max-width: 720px) {
    .map {
      padding: 32px 18px 36px;
    }
    .map-head {
      margin-bottom: 20px;
      padding-bottom: 12px;
    }
    .rail {
      flex-direction: column;
      gap: 0;
    }
    .rail-stop {
      flex-direction: column;
      align-items: stretch;
      width: 100%;
      padding-left: 60px;
      position: relative;
      min-height: 60px;
    }
    /* Pin sits at the left edge of the stop row */
    .rail-stop > .pin {
      position: absolute;
      top: 0;
      left: 0;
    }
    /* Meta column flows to the right of the pin */
    .rail-stop > .rail-meta {
      position: static;
      transform: none;
      text-align: left;
      width: auto;
      padding-top: 4px;
    }
    .rail-name {
      font-size: 17px;
    }
    /* Gap becomes a vertical dashed line dropping from below
       the pin to the next stop's pin. */
    .rail-gap {
      position: absolute;
      top: 48px;
      left: 22px;
      width: 0;
      height: calc(100% - 48px + 16px);
      flex: none;
      min-width: 0;
    }
    .rail-gap-line {
      position: absolute;
      top: 0;
      bottom: 0;
      left: -1px;
      width: 0;
      height: 100%;
      border-top: 0;
      border-left: 2px dashed rgba(196, 134, 15, 0.75);
    }
    .rail-gap-time {
      top: 50%;
      left: 12px;
      transform: translateY(-50%);
      background: transparent;
      padding: 0;
      font-size: 11px;
      color: rgba(196, 134, 15, 0.85);
    }
    /* Add bottom space so the next pin doesn't run into the meta */
    .rail-stop:not(:last-child) {
      padding-bottom: 32px;
    }
  }
</style>
