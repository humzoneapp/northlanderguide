<script>
  /* ==================================================================
     Cover action row.

     Sits at the bottom of the cover hero. When the trip is empty,
     it's a single primary "Pick your route" CTA. Once stops are
     saved, it expands into a horizontal row: Edit route, Logbook,
     Share. Export PDF used to live here too but the same link sat
     in TripSignOff at the bottom of the page; the cover slot was
     the noisier of the two and got dropped to thin the cover row
     down from 4 buttons to 3. The Save-as-PDF link in TripSignOff
     is now the canonical entry point.

     Lifted out of trip-page/+page.svelte on 2026-06-09 to break the
     cover into smaller pieces.
     ================================================================== */

  import { createEventDispatcher } from 'svelte';

  /** Trip id - used to build the logbook + print links. */
  export let tripId;
  /** Number of saved stops. Drives the empty-vs-full layout. */
  export let stopCount = 0;

  const dispatch = createEventDispatcher();
</script>

<div class="cover-actions" class:cover-actions--solo={stopCount === 0}>
  {#if stopCount === 0}
    <button
      type="button"
      class="btn-primary cover-add cover-pick-route"
      on:click={() => dispatch('pickRoute')}
      aria-label="Pick where the journey begins and ends"
    >
      <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="6" cy="12" r="2.5"/>
        <circle cx="18" cy="12" r="2.5"/>
        <path d="M8.5 12 L15.5 12" stroke-dasharray="2 2"/>
      </svg>
      <span>Pick your route</span>
    </button>
  {:else}
    <button
      type="button"
      class="btn-primary cover-edit"
      on:click={() => dispatch('editRoute')}
      aria-label="Edit the stops on this route"
    >
      <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="6" cy="6" r="2"/>
        <circle cx="6" cy="18" r="2"/>
        <circle cx="18" cy="12" r="2"/>
        <path d="M6 8 L6 16"/>
        <path d="M8 6 L16 11"/>
        <path d="M8 18 L16 13"/>
      </svg>
      <span>Edit route</span>
    </button>

    <a
      href={`/trips/${tripId}/logbook`}
      class="btn-primary cover-recap"
      aria-label="Open this trip's logbook"
    >
      <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 4 H17 a2 2 0 0 1 2 2 V20 H7 a2 2 0 0 1 -2 -2 Z"/>
        <path d="M5 18 V4"/>
        <path d="M9 8 L15 8"/>
        <path d="M9 12 L15 12"/>
      </svg>
      <span>Logbook</span>
    </a>

    <button
      type="button"
      class="btn-primary cover-share"
      on:click={() => dispatch('share')}
      aria-label="Share your trip as a poster"
    >
      <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3"/>
        <circle cx="6" cy="12" r="3"/>
        <circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
      <span>Share</span>
    </button>
  {/if}
</div>

<style>
  .cover-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 26px;
  }
  /* Primary gold - the main action. Warm/editorial rather than
     aggressive. */
  .cover-add {
    background: #c9a84c;
    border-color: #c9a84c;
    color: #0a2d21;
    font-weight: 700;
    padding: 0.85rem 1.4rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 8px 18px rgba(201, 168, 76, 0.32);
  }
  .cover-add:hover {
    background: #f5f0e8;
    border-color: #f5f0e8;
    color: #0a2d21;
  }
  /* Quiet outline - secondary actions. */
  .cover-edit,
  .cover-share {
    background: transparent;
    border: 2px solid rgba(201, 168, 76, 0.45);
    color: #c9a84c;
    padding: 0.7rem 1.1rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
  }
  .cover-edit:hover,
  .cover-share:hover {
    background: rgba(201, 168, 76, 0.12);
    border-color: #c9a84c;
    color: #f5f0e8;
  }
  /* Recap pops in gold so the post-trip view is easy to spot. */
  .cover-recap {
    background: #c9a84c;
    border-color: #c9a84c;
    color: #0a2d21;
    padding: 0.7rem 1.1rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
  }
  .cover-recap:hover {
    background: #f5f0e8;
    border-color: #f5f0e8;
    color: #0a2d21;
  }
  .cover-edit-icon {
    width: 16px;
    height: 16px;
  }
</style>
