<script>
  /* ==================================================================
     Cover title with inline rename.

     Shows the trip name as an H1; tapping it swaps in a focused
     text input so the user can rename in place. Enter (or blur)
     saves; Escape cancels. The parent owns the actual DB write
     (renameTrip + reload) and is told via the `save` event with
     the new name.

     Lifted out of trip-page/+page.svelte on 2026-06-09. The editing
     draft + input ref are kept local since they only exist while
     the inline edit is open.
     ================================================================== */

  import { createEventDispatcher } from 'svelte';

  /** Current trip name. Always reflects the latest saved value;
      while the input is open, the draft state below holds the
      user's pending edit. */
  export let name = '';

  const dispatch = createEventDispatcher();

  let editing = false;
  let draft = '';
  /** @type {HTMLInputElement | undefined} */
  let input;

  function start() {
    draft = name;
    editing = true;
    /* Wait one microtask so the input is in the DOM before we
       try to focus it. */
    queueMicrotask(() => input?.focus());
  }
  function cancel() {
    editing = false;
    draft = '';
  }
  function save() {
    const next = draft.trim();
    editing = false;
    draft = '';
    if (!next || next === name) return;
    dispatch('save', { name: next });
  }
</script>

{#if editing}
  <form class="cover-name-form" on:submit|preventDefault={save}>
    <input
      bind:this={input}
      bind:value={draft}
      type="text"
      maxlength="60"
      class="cover-name-input"
      on:blur={save}
      on:keydown={(e) => e.key === 'Escape' && cancel()}
    />
    <span class="cover-name-hint">Enter to save</span>
  </form>
{:else}
  <button
    type="button"
    on:click={start}
    class="cover-name-btn"
    aria-label="Rename trip"
  >
    <h1>{name}</h1>
    <span class="cover-name-hint">Tap to rename</span>
  </button>
{/if}

<style>
  .cover-name-btn {
    background: transparent;
    border: 0;
    padding: 0;
    text-align: left;
    cursor: pointer;
    color: inherit;
    display: block;
    width: 100%;
  }
  .cover-name-btn h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2.6rem, 7vw, 5rem);
    line-height: 0.95;
    margin: 12px 0 6px;
    letter-spacing: -0.015em;
    overflow-wrap: anywhere;
    color: #f5f0e8;
    transition: color 160ms ease;
  }
  /* The underline below the title is the only affordance that the
     H1 is editable; the cover trip-name itself stays white on hover. */
  .cover-name-hint {
    display: block;
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(202, 215, 207, 0.55);
    margin-bottom: 10px;
  }
  .cover-name-form { margin: 12px 0 6px; }
  .cover-name-input {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2.4rem, 6vw, 4.4rem);
    line-height: 1;
    background: transparent;
    color: #f5f0e8;
    border: 0;
    border-bottom: 2px solid #c4860f;
    outline: none;
    width: 100%;
    padding-bottom: 6px;
  }
</style>
