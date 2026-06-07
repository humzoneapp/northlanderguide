<script>
  /* Fixed-position toast stack mounted once in the root layout. Each
     toast slides in from the bottom, sits for ~5s, then slides out.
     If a toast carries an `undo` callback, the user gets an Undo
     pill that calls it and dismisses the toast. */
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { toasts, dismiss, runUndo } from '$lib/stores/toasts.js';
</script>

<div class="toast-stack" aria-live="polite" aria-atomic="false">
  {#each $toasts as toast (toast.id)}
    <div
      class="toast"
      class:is-success={toast.kind === 'success'}
      class:is-warn={toast.kind === 'warn'}
      in:fly={{ y: 24, duration: 240, easing: cubicOut }}
      out:fly={{ y: 24, duration: 200, easing: cubicOut }}
      role="status"
    >
      <span class="toast-msg">{toast.message}</span>
      {#if typeof toast.undo === 'function'}
        <button type="button" class="toast-undo" on:click={() => runUndo(toast.id)}>Undo</button>
      {/if}
      <button type="button" class="toast-close" on:click={() => dismiss(toast.id)} aria-label="Dismiss">&times;</button>
    </div>
  {/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(env(safe-area-inset-bottom, 0) + 24px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    z-index: 300;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 14px;
    min-width: 240px;
    max-width: min(420px, calc(100vw - 32px));
    background: #0a2d21;
    color: #f5f0e8;
    border: 1.5px solid #c9a84c;
    border-radius: 6px;
    padding: 12px 14px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 13.5px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);
  }
  .toast.is-warn {
    background: #7d3a1e;
    border-color: #c9a84c;
  }
  .toast.is-success {
    background: #1f3d2d;
    border-color: #c9a84c;
  }
  .toast-msg {
    flex: 1;
    line-height: 1.35;
  }
  .toast-undo {
    background: transparent;
    border: 1.5px solid #c9a84c;
    color: #c9a84c;
    border-radius: 4px;
    padding: 4px 10px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease;
  }
  .toast-undo:hover {
    background: #c9a84c;
    color: #0a2d21;
  }
  .toast-close {
    background: transparent;
    border: 0;
    color: rgba(245, 240, 232, 0.65);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
  }
  .toast-close:hover { color: #f5f0e8; }
</style>
