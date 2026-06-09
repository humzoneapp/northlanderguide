<script>
  /* ==================================================================
     Danger zone.

     One link ("Delete this trip") that swaps into a two-button confirm
     row (Cancel + "Yes, delete the suitcase") on the first tap. The
     two-step gate is the only thing standing between the user and a
     destructive operation; the actual deleteTrip call + redirect run
     in the parent.

     Lifted out of trip-page/+page.svelte on 2026-06-09. The component
     owns its own confirm state; the parent only needs to handle the
     `delete` event.
     ================================================================== */

  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  let confirming = false;
</script>

<section class="danger">
  <div class="danger-inner">
    <div>
      <div class="kicker">Danger zone</div>
      <p>Deleting a suitcase removes its packing list, bookings and notes. There's no undo.</p>
    </div>
    {#if confirming}
      <div class="danger-actions">
        <button
          type="button"
          on:click={() => (confirming = false)}
          class="danger-cancel"
        >Cancel</button>
        <button
          type="button"
          on:click={() => dispatch('delete')}
          class="btn-primary danger-confirm"
        >Yes, delete the suitcase</button>
      </div>
    {:else}
      <button
        type="button"
        on:click={() => (confirming = true)}
        class="danger-link"
      >Delete this trip</button>
    {/if}
  </div>
</section>

<style>
  .danger {
    background: #f3ece0;
    padding: 24px 24px 64px;
  }
  .danger-inner {
    max-width: 920px;
    margin: 0 auto;
    border-top: 1px dashed rgba(125, 58, 30, 0.4);
    padding-top: 24px;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
  .danger p {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 4px 0 0;
  }
  .danger-link {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    color: #6e2e17;
    background: transparent;
    border: 0;
    cursor: pointer;
    font-size: 14px;
  }
  .danger-link:hover { color: #0a2d21; }
  .danger-actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .danger-cancel {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    background: transparent;
    border: 0;
    cursor: pointer;
    font-size: 14px;
  }
  .danger-cancel:hover { color: #6e2e17; }
  .danger-confirm {
    background: #5e2a14;
    border-color: #5e2a14;
  }
  .danger-confirm:hover {
    background: #7d3a1e;
    border-color: #7d3a1e;
  }
</style>
