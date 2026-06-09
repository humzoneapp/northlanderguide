<script>
  /* ==================================================================
     Wrap-up call-to-action band.

     Surfaces inside the cover once the trip's end date has passed
     and the user hasn't stamped it Wrapped yet. Ceremonial gold
     band - one kicker, one short body, one button. Stamping wraps
     the trip and slides it into the archive.

     Lifted out of trip-page/+page.svelte on 2026-06-09. The actual
     wrap mutation stays on the parent (it needs to update the trip
     row + push a toast); the component just dispatches `wrap`.
     ================================================================== */

  import { createEventDispatcher } from 'svelte';

  /** ISO date the trip ended on. Optional - drops to "recently" if
      we can't format it. */
  export let endDate = '';
  /** Set true while the parent is mid-write so the button shows
      "Wrapping..." and disables itself. */
  export let busy = false;

  const dispatch = createEventDispatcher();

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
</script>

<div class="wrap-cta" role="note">
  <div class="wrap-cta-text">
    <span class="wrap-cta-kicker">
      Your trip wrapped {endDate ? formatDateShort(endDate) : 'recently'}
    </span>
    <p class="wrap-cta-body">
      Add a closing note, pick a favourite photo, lock in the spend total.
      Then stamp it <em>Wrapped</em> and it slides into your archive.
    </p>
  </div>
  <button
    type="button"
    class="wrap-cta-btn"
    on:click={() => dispatch('wrap')}
    disabled={busy}
  >
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/>
      <path d="M7 12 L10 15 L17 8"/>
    </svg>
    <span>{busy ? 'Wrapping...' : 'Wrap up this trip'}</span>
  </button>
</div>

<style>
  .wrap-cta {
    margin: 22px 0 6px;
    background: rgba(251, 246, 234, 0.92);
    border: 1.5px solid #c9a84c;
    border-radius: 6px;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    box-shadow: 0 6px 16px rgba(40, 30, 15, 0.18);
  }
  .wrap-cta-text {
    flex: 1 1 220px;
    min-width: 0;
  }
  .wrap-cta-kicker {
    display: block;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #7d3a1e;
    margin-bottom: 4px;
  }
  .wrap-cta-body {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #0a2d21;
    font-size: 14px;
    line-height: 1.45;
    margin: 0;
  }
  .wrap-cta-body em {
    font-style: normal;
    font-weight: 700;
    color: #7d3a1e;
  }
  .wrap-cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #c9a84c;
    color: #0a2d21;
    border: 2px solid #c9a84c;
    padding: 9px 18px;
    border-radius: 4px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12.5px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 160ms ease, transform 160ms ease, box-shadow 160ms ease;
    box-shadow: 0 3px 8px rgba(40, 30, 15, 0.22);
  }
  .wrap-cta-btn:hover:not(:disabled) {
    background: #d8b863;
    transform: translateY(-1px);
    box-shadow: 0 6px 14px rgba(40, 30, 15, 0.3);
  }
  .wrap-cta-btn:disabled { opacity: 0.6; cursor: progress; }
</style>
