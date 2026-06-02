<script>
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { createTrip, LEATHER_COLORS } from '$lib/stores/trips.js';
  import Suitcase from './Suitcase.svelte';

  const dispatch = createEventDispatcher();

  let name = '';
  let colorId = 'rust';
  let submitting = false;
  /** @type {HTMLInputElement | undefined} */
  let nameInput;

  /* Custom-leather state. Seeded from the rust preset so the very
     first frame after picking Custom shows the suitcase in something
     other than transparent. The user can then tap the body or
     strap/buckle swatches to dial in their own colors. */
  let customBody = '#7d3a1e';
  let customStrap = '#5e2a14';

  $: palette = LEATHER_COLORS.find((c) => c.id === colorId) || LEATHER_COLORS[0];
  $: isCustom = colorId === 'custom';
  $: previewBody  = isCustom ? customBody  : palette.body;
  $: previewStrap = isCustom ? customStrap : palette.strap;

  onMount(async () => {
    await tick();
    nameInput?.focus();
  });

  function close() {
    if (submitting) return;
    dispatch('close');
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  async function handleSubmit() {
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      nameInput?.focus();
      return;
    }
    submitting = true;
    try {
      const trip = await createTrip(
        isCustom
          ? { name: trimmed, colorId: 'custom', body: customBody, strap: customStrap }
          : { name: trimmed, colorId }
      );
      dispatch('close');
      await goto(`/trips/${trip.id}`);
    } catch (err) {
      console.error(err);
      submitting = false;
    }
  }
</script>

<svelte:window on:keydown={onKey} />

<!-- Backdrop -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center px-4"
  role="dialog"
  aria-modal="true"
  aria-labelledby="new-trip-title"
>
  <button
    type="button"
    class="absolute inset-0 bg-forest/70 backdrop-blur-sm cursor-default"
    on:click={close}
    aria-label="Close"
  ></button>

  <!-- Cream paper card with scalloped ticket edges -->
  <div class="relative z-10 w-full max-w-[520px] bg-cream shadow-ticket pl-card">
    <!-- Forest railway header -->
    <header class="bg-forest text-ivory px-6 py-3 flex justify-between items-center border-b-[3px] border-double border-gold">
      <span class="font-serif font-black uppercase tracking-[0.18em] text-[15px]">Tag a New Suitcase</span>
      <button
        type="button"
        class="text-gold text-xl leading-none hover:text-ivory"
        on:click={close}
        aria-label="Close"
      >&times;</button>
    </header>

    <form on:submit|preventDefault={handleSubmit} class="px-6 py-6 bg-linen">
      <!-- Preview suitcase -->
      <div class="mx-auto mb-5" style="max-width:170px">
        <Suitcase color={previewBody} strap={previewStrap} label={name.trim() ? '' : 'New'} />
      </div>

      <!-- Trip name -->
      <label class="block mb-5">
        <span class="kicker block mb-1.5">Trip name</span>
        <input
          bind:this={nameInput}
          bind:value={name}
          type="text"
          maxlength="60"
          placeholder="e.g. Muskoka Weekend"
          class="w-full bg-ivory border border-[#8b6a3a] px-3 py-2.5 font-serif text-lg text-forest placeholder:text-muted/60 focus:outline-none focus:border-rust"
        />
      </label>

      <!-- Leather color picker -->
      <div class="mb-6">
        <span class="kicker block mb-2">Leather</span>
        <div class="flex flex-wrap gap-3 items-center">
          {#each LEATHER_COLORS as c}
            <button
              type="button"
              class="pl-swatch group relative w-11 h-11 rounded-full border-2 transition"
              class:is-selected={c.id === colorId}
              style="background:{c.body};border-color:{c.id === colorId ? c.strap : 'transparent'}"
              on:click={() => (colorId = c.id)}
              aria-label={c.name}
              aria-pressed={c.id === colorId}
            >
              <span
                class="absolute inset-1 rounded-full border opacity-40"
                style="border-color:{c.strap}"
                aria-hidden="true"
              ></span>
            </button>
          {/each}

          <!-- Custom swatch. Empty dashed-rust circle until selected;
               on click it reveals body + strap/buckle color inputs
               below the row and unlocks live preview tinting. -->
          <button
            type="button"
            class="pl-swatch pl-swatch-custom group relative w-11 h-11 rounded-full border-2 transition"
            class:is-selected={isCustom}
            on:click={() => (colorId = 'custom')}
            aria-label="Custom leather"
            aria-pressed={isCustom}
          >
            <svg viewBox="0 0 24 24" class="pl-swatch-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 8 L12 16 M8 12 L16 12" />
            </svg>
          </button>
        </div>

        {#if isCustom}
          <div class="pl-custom-pickers">
            <label class="pl-custom-pick">
              <span class="kicker">Body</span>
              <span class="pl-custom-row">
                <input
                  type="color"
                  bind:value={customBody}
                  aria-label="Suitcase body color"
                />
                <span class="pl-custom-hex">{customBody.toUpperCase()}</span>
              </span>
            </label>
            <label class="pl-custom-pick">
              <span class="kicker">Strap &amp; buckle</span>
              <span class="pl-custom-row">
                <input
                  type="color"
                  bind:value={customStrap}
                  aria-label="Strap and buckle color"
                />
                <span class="pl-custom-hex">{customStrap.toUpperCase()}</span>
              </span>
            </label>
          </div>
        {/if}
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-between gap-4 pt-2 border-t border-dashed border-[#8b6a3a]/45 mt-2">
        <button
          type="button"
          on:click={close}
          class="font-serif italic text-muted hover:text-rust text-sm"
          disabled={submitting}
        >Cancel</button>
        <button
          type="submit"
          class="btn-primary disabled:opacity-50"
          disabled={submitting || !name.trim()}
        >
          {submitting ? 'Tagging...' : 'Start Packing'}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  /* Scalloped left/right edges so the modal reads as a real ticket. */
  .pl-card {
    -webkit-mask-image:
      radial-gradient(circle 8px at 0% 50%, transparent 7px, black 8px),
      radial-gradient(circle 8px at 100% 50%, transparent 7px, black 8px);
    mask-image:
      radial-gradient(circle 8px at 0% 50%, transparent 7px, black 8px),
      radial-gradient(circle 8px at 100% 50%, transparent 7px, black 8px);
  }
  .pl-swatch:hover {
    transform: translateY(-2px);
  }
  .pl-swatch.is-selected {
    box-shadow: 0 0 0 3px #c9a84c, 0 6px 12px rgba(40, 20, 5, 0.25);
  }

  /* Custom swatch: dashed empty circle, rust glyph in the middle.
     Selecting it swaps the dashed border for the solid amber halo so
     it sits in the same visual family as the preset swatches. */
  .pl-swatch-custom {
    background: #fbf6ea;
    border-style: dashed;
    border-color: #7d3a1e;
    color: #7d3a1e;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pl-swatch-custom.is-selected {
    border-style: solid;
    border-color: #5e2a14;
  }
  .pl-swatch-icon {
    width: 20px;
    height: 20px;
  }

  /* Custom color inputs revealed when the custom swatch is active. */
  .pl-custom-pickers {
    margin-top: 14px;
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
  }
  .pl-custom-pick {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1 1 160px;
    min-width: 0;
  }
  .pl-custom-row {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #fbf6ea;
    border: 1px solid #8b6a3a;
    padding: 5px 10px 5px 5px;
    border-radius: 3px;
  }
  .pl-custom-row input[type='color'] {
    width: 34px;
    height: 34px;
    border: 1px solid #8b6a3a;
    background: transparent;
    padding: 0;
    cursor: pointer;
    border-radius: 2px;
  }
  .pl-custom-row input[type='color']::-webkit-color-swatch-wrapper {
    padding: 2px;
  }
  .pl-custom-row input[type='color']::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }
  .pl-custom-hex {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 0.85rem;
    color: #0a2d21;
    letter-spacing: 0.08em;
  }
</style>
