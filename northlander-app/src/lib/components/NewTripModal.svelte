<script>
  /* ==================================================================
     "Start a new trip" modal.

     Pared down to just a name input. The suitcase leather picker is
     gone - the user never sees the suitcase again after creating the
     trip, so asking them to choose a color upfront was friction
     without payoff. createTrip still seeds the trip row with a
     default color in case any old data path needs it; the user can
     change it later if and when we surface a useful place to.
     ================================================================== */

  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { createTrip, TRIP_MOODS } from '$lib/stores/trips.js';

  const dispatch = createEventDispatcher();

  let name = '';
  /** @type {string} - trip mood id; '' means no mood set. */
  let moodId = '';
  let submitting = false;
  /** @type {HTMLInputElement | undefined} */
  let nameInput;

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
      const trip = await createTrip({ name: trimmed, moodId: moodId || null });
      dispatch('close');
      await goto(`/trips/${trip.id}`);
    } catch (err) {
      console.error(err);
      submitting = false;
    }
  }
</script>

<svelte:window on:keydown={onKey} />

<div
  class="fixed inset-0 z-[200] flex items-center justify-center px-4"
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

  <div class="relative z-10 w-full max-w-[460px] bg-cream shadow-ticket pl-card">
    <header class="bg-[#4a1f0e] text-ivory px-6 py-3 flex justify-between items-center border-b-[3px] border-double border-gold">
      <span id="new-trip-title" class="font-serif font-black uppercase tracking-[0.18em] text-[15px]">Start a New Trip</span>
      <button
        type="button"
        class="text-gold text-xl leading-none hover:text-ivory"
        on:click={close}
        aria-label="Close"
      >&times;</button>
    </header>

    <form on:submit|preventDefault={handleSubmit} class="px-6 py-7 bg-linen">
      <p class="font-serif italic text-muted text-center mb-5 text-[15px]">
        Give your trip a name. You can pick stops, plans and photos on the next page.
      </p>

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

      <!-- Mood picker. Optional - skipping just stores no mood and
           the home card falls back to the standard wax-seal initial.
           Picking one stamps the home polaroid with a small mood
           icon so the dashboard reads at a glance. -->
      <div class="mb-6">
        <span class="kicker block mb-2">What kind of trip?</span>
        <div class="mood-row">
          <button
            type="button"
            class="mood-chip"
            class:is-active={moodId === ''}
            on:click={() => (moodId = '')}
          >
            <span class="mood-glyph mood-glyph--blank" aria-hidden="true">&middot;</span>
            <span>Skip</span>
          </button>
          {#each TRIP_MOODS as m}
            <button
              type="button"
              class="mood-chip"
              class:is-active={moodId === m.id}
              on:click={() => (moodId = m.id)}
              title={m.label}
            >
              <span class="mood-glyph" aria-hidden="true">{@html m.glyph}</span>
              <span>{m.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="flex items-center justify-between gap-4 pt-2 border-t border-dashed border-[#8b6a3a]/45">
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
          {submitting ? 'Starting...' : 'Start Trip'}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .pl-card {
    -webkit-mask-image:
      radial-gradient(circle 8px at 0% 50%, transparent 7px, black 8px),
      radial-gradient(circle 8px at 100% 50%, transparent 7px, black 8px);
    mask-image:
      radial-gradient(circle 8px at 0% 50%, transparent 7px, black 8px),
      radial-gradient(circle 8px at 100% 50%, transparent 7px, black 8px);
  }
  .mood-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .mood-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #fffdf6;
    color: #5a4f3d;
    border: 1.5px solid rgba(139, 106, 58, 0.45);
    padding: 7px 12px;
    border-radius: 999px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
  }
  .mood-chip:hover {
    border-color: #7d3a1e;
    color: #0a2d21;
  }
  .mood-chip.is-active {
    background: #7d3a1e;
    color: #fffdf6;
    border-color: #7d3a1e;
  }
  .mood-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: currentColor;
  }
  .mood-glyph :global(svg) { width: 16px; height: 16px; }
  .mood-glyph--blank {
    font-size: 14px;
    line-height: 1;
    opacity: 0.5;
  }
</style>
