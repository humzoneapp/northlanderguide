<script>
  /* ==================================================================
     Cover photo control.

     Small discreet pill pinned to the top-right of the cover hero.
     A <label> wraps a visually-hidden <input type="file"> so iOS
     Safari opens the picker on tap natively (Safari refuses to honour
     .click() on hidden inputs that aren't in layout). When the user
     already has a custom photo saved, a quiet italic "Reset" link
     appears next to the upload pill so they can drop back to the
     arriving stop's hero photo.

     The actual DB writes (setTripCover / clearTripCover) live in the
     parent. This component just signals the user's intent via two
     events; the parent flips `busy` so the pill goes into the
     disabled "Uploading..." state during the write.

     Lifted out of trip-page/+page.svelte on 2026-06-09 as part of the
     cover-breakup pass.
     ================================================================== */

  import { createEventDispatcher } from 'svelte';

  /** True when the user has saved a custom cover photo. Drives the
      upload pill label (Upload vs Replace) and surfaces the Reset
      link. */
  export let hasCustomPhoto = false;
  /** Parent flips this during the async cover write so the pill
      shows "Uploading..." and disables the input. */
  export let busy = false;

  const dispatch = createEventDispatcher();

  /** @type {HTMLInputElement | undefined} */
  let fileInput;

  function onChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    dispatch('upload', { file });
    /* Clear the input value so the same file can be picked again
       after a reset / failed upload. Has to happen on the next tick
       so the change event finishes propagating first. */
    queueMicrotask(() => {
      if (fileInput) fileInput.value = '';
    });
  }
</script>

<div class="cover-photo-actions">
  <label
    class="cover-photo-btn"
    class:is-busy={busy}
    aria-label={hasCustomPhoto ? 'Replace cover photo' : 'Upload a cover photo'}
    title={hasCustomPhoto ? 'Replace cover photo' : 'Upload a cover photo'}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14.5 4 H9.5 L7.5 6.5 H4 a1 1 0 0 0 -1 1 V18 a1 1 0 0 0 1 1 H20 a1 1 0 0 0 1 -1 V7.5 a1 1 0 0 0 -1 -1 H16.5 Z"/>
      <circle cx="12" cy="13" r="3.5"/>
    </svg>
    <span>{busy ? 'Uploading...' : (hasCustomPhoto ? 'Replace cover' : 'Upload cover')}</span>
    <input
      bind:this={fileInput}
      type="file"
      accept="image/*"
      class="cover-file-input"
      on:change={onChange}
      disabled={busy}
    />
  </label>
  {#if hasCustomPhoto}
    <button
      type="button"
      class="cover-photo-reset"
      on:click={() => dispatch('reset')}
      disabled={busy}
      title="Use the arriving stop's photo instead"
    >Reset</button>
  {/if}
</div>

<style>
  .cover-photo-actions {
    position: absolute;
    top: 12px;
    right: 16px;
    z-index: 4;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .cover-photo-btn {
    background: rgba(10, 45, 33, 0.62);
    color: #f5f0e8;
    border: 1px dashed rgba(201, 168, 76, 0.65);
    padding: 5px 12px 5px 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
    transition: background 0.15s, border-color 0.15s;
    position: relative;
  }
  .cover-photo-btn svg { width: 14px; height: 14px; }
  .cover-photo-btn:hover:not(.is-busy) {
    background: rgba(10, 45, 33, 0.85);
    border-color: #c9a84c;
  }
  .cover-photo-btn.is-busy { opacity: 0.6; cursor: progress; }
  .cover-photo-reset {
    background: transparent;
    border: 0;
    color: rgba(245, 240, 232, 0.78);
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
  }
  .cover-photo-reset:hover { color: #c9a84c; }
  /* Visually-hidden file input. Kept in layout flow (position:absolute)
     so iOS Safari treats it as tappable when wrapped in the <label>. */
  .cover-file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
