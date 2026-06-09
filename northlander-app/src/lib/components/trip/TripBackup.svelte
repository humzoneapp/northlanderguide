<script>
  /* ==================================================================
     Backup band.

     Quiet cream strip below the sign-off that offers a single
     "Download backup" link. Bundles every trip row (packing,
     bookings, diary, photos, ledger) into a .northlander.json file
     the user can hand to themselves on a new device. Failure /
     success surfaces as a toast.

     Lifted out of trip-page/+page.svelte on 2026-06-09.
     ================================================================== */

  import { downloadTripBackup } from '$lib/utils/backup.js';
  import { pushToast } from '$lib/stores/toasts.js';

  /** Trip id of the trip to back up. */
  export let tripId;

  async function handleDownload() {
    if (!tripId) return;
    const ok = await downloadTripBackup(tripId);
    if (ok) pushToast({ message: 'Backup downloaded.', kind: 'success' });
    else pushToast({ message: 'Backup failed.', kind: 'warn' });
  }
</script>

<section class="backup">
  <div class="backup-inner">
    <div>
      <div class="kicker">Backup</div>
      <p>Download a single file with every plan, photo and note from this trip. Hand it to yourself if you switch devices or wipe browser data.</p>
    </div>
    <button type="button" class="backup-btn" on:click={handleDownload}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 12 V19 a2 2 0 0 0 2 2 H18 a2 2 0 0 0 2 -2 V12"/>
        <polyline points="8 12 12 16 16 12"/>
        <line x1="12" y1="3" x2="12" y2="16"/>
      </svg>
      <span>Download backup</span>
    </button>
  </div>
</section>

<style>
  .backup {
    background: #f3ece0;
    padding: 24px 24px 0;
  }
  .backup-inner {
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
  .backup p {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 4px 0 0;
    max-width: 60ch;
  }
  .backup-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    color: #7d3a1e;
    border: 1.5px solid #7d3a1e;
    padding: 9px 16px;
    border-radius: 4px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease, transform 160ms ease;
  }
  .backup-btn:hover {
    background: #7d3a1e;
    color: #fffdf6;
    transform: translateY(-1px);
  }
</style>
