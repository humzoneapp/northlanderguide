<script>
  /* ==================================================================
     Diary emoji + sticker picker.

     Renders a small popover with two tabs:
       Stickers - 10 inline-SVG Northlander stickers
                 (train / pine / polaroid / lantern etc.)
       Emoji    - a curated set of ~30 native unicode emojis
                 (travel + nature + mood)

     Picking a sticker dispatches 'pick' with `{ kind: 'sticker',
     html }` so the parent can insert it at the contenteditable
     caret. Picking an emoji dispatches `{ kind: 'emoji', html }`
     with the unicode character ready to drop.

     Pointer-handlers use mousedown|preventDefault so the picker
     doesn't steal focus from the contenteditable before the
     parent has a chance to read the saved range and insert.
     ================================================================== */

  import { createEventDispatcher } from 'svelte';
  import { NORTHLANDER_STICKERS, CURATED_EMOJI } from '$lib/data/diary-stickers.js';

  /** @type {boolean} */
  export let open = false;

  const dispatch = createEventDispatcher();

  let tab = 'stickers';

  function pickSticker(s) {
    /* Wrap each sticker in span.sticker contenteditable="false" so the
       contenteditable treats it as a single atom (cursor skips over
       it; one Backspace deletes the whole thing). */
    const html = `<span class="sticker" contenteditable="false">${s.svg}</span>`;
    dispatch('pick', { kind: 'sticker', html, name: s.name });
  }
  function pickEmoji(ch) {
    dispatch('pick', { kind: 'emoji', html: ch });
  }
  function close() {
    dispatch('close');
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window on:keydown={onKey} />

{#if open}
  <div class="ep-pop" role="dialog" aria-label="Pick a sticker or emoji">
    <div class="ep-tabs" role="tablist">
      <button
        type="button"
        class="ep-tab"
        class:is-active={tab === 'stickers'}
        on:mousedown|preventDefault
        on:click={() => (tab = 'stickers')}
        role="tab"
        aria-selected={tab === 'stickers'}
      >Stickers</button>
      <button
        type="button"
        class="ep-tab"
        class:is-active={tab === 'emoji'}
        on:mousedown|preventDefault
        on:click={() => (tab = 'emoji')}
        role="tab"
        aria-selected={tab === 'emoji'}
      >Emoji</button>
    </div>

    <div class="ep-body">
      {#if tab === 'stickers'}
        <div class="ep-grid">
          {#each NORTHLANDER_STICKERS as s (s.name)}
            <button
              type="button"
              class="ep-sticker"
              on:mousedown|preventDefault={() => pickSticker(s)}
              aria-label={`Insert ${s.label}`}
              title={s.label}
            >
              {@html s.svg}
            </button>
          {/each}
        </div>
        <p class="ep-hint">Northlander stickers - tap to drop one in.</p>
      {:else}
        <div class="ep-grid ep-grid--emoji">
          {#each CURATED_EMOJI as ch}
            <button
              type="button"
              class="ep-emoji"
              on:mousedown|preventDefault={() => pickEmoji(ch)}
              aria-label="Insert emoji"
            >{ch}</button>
          {/each}
        </div>
        <p class="ep-hint">A small set we curated for trip notes.</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .ep-pop {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 6px;
    width: 280px;
    z-index: 40;
    background: #fffdf6;
    border: 1px solid #8b6a3a;
    box-shadow:
      0 14px 30px rgba(40, 25, 10, 0.18),
      0 4px 10px rgba(40, 25, 10, 0.12);
    border-radius: 4px;
    overflow: hidden;
  }
  .ep-tabs {
    display: flex;
    background: #f3ece0;
    border-bottom: 1px solid rgba(139, 106, 58, 0.4);
  }
  .ep-tab {
    flex: 1;
    background: transparent;
    border: 0;
    padding: 8px 10px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #5a4f3d;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color 140ms ease, border-color 140ms ease;
  }
  .ep-tab:hover { color: #7d3a1e; }
  .ep-tab.is-active {
    color: #5e2a14;
    border-bottom-color: #5e2a14;
    background: #fffdf6;
  }
  .ep-body { padding: 10px 12px 8px; }
  .ep-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
  }
  .ep-grid--emoji {
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }
  /* Sticker tile: forest hover so the inline-SVG (which uses
     currentColor) lights up. */
  .ep-sticker {
    background: transparent;
    border: 1px dashed rgba(139, 106, 58, 0.45);
    border-radius: 4px;
    padding: 6px;
    color: #7d3a1e;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 140ms ease, border-color 140ms ease, color 140ms ease, transform 120ms ease;
  }
  .ep-sticker:hover {
    background: rgba(125, 58, 30, 0.08);
    border-color: #7d3a1e;
    color: #5e2a14;
    transform: translateY(-1px);
  }
  .ep-emoji {
    background: transparent;
    border: 0;
    padding: 4px 0;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    border-radius: 4px;
    transition: background 140ms ease, transform 120ms ease;
  }
  .ep-emoji:hover {
    background: rgba(125, 58, 30, 0.08);
    transform: scale(1.1);
  }
  .ep-hint {
    margin: 8px 2px 0;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    font-size: 11.5px;
    line-height: 1.3;
  }
</style>
