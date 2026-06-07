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
  import { createTrip } from '$lib/stores/trips.js';

  const dispatch = createEventDispatcher();

  let name = '';
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
      const trip = await createTrip({ name: trimmed });
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

      <label class="block mb-6">
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
</style>
