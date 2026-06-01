<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { generatePosterBlob, deliverPoster } from '$lib/utils/poster.js';

  /** @type {{ id: string, name: string, [key: string]: any }} */
  export let trip;

  const dispatch = createEventDispatcher();

  let previewUrl = '';
  /** @type {Blob | null} */
  let posterBlob = null;
  let busy = true;
  let error = '';

  $: canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    posterBlob &&
    navigator.canShare({
      files: [new File([posterBlob], 'trip.png', { type: 'image/png' })]
    });

  onMount(async () => {
    busy = true;
    try {
      posterBlob = await generatePosterBlob(trip);
      if (posterBlob) {
        previewUrl = URL.createObjectURL(posterBlob);
      } else {
        error = "We couldn't draw your poster. Try again?";
      }
    } catch (err) {
      console.error(err);
      error = "We couldn't draw your poster. Try again?";
    } finally {
      busy = false;
    }
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  });

  function close() {
    if (busy) return;
    dispatch('close');
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  async function handleShare() {
    if (!posterBlob || busy) return;
    busy = true;
    try {
      await deliverPoster(posterBlob, trip.id, `${trip.name} - Northlander`);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window on:keydown={onKey} />

<div
  class="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
  role="dialog"
  aria-modal="true"
  aria-labelledby="share-title"
>
  <button
    type="button"
    class="absolute inset-0 bg-forest/70 backdrop-blur-sm cursor-default"
    on:click={close}
    aria-label="Close"
  ></button>

  <div class="relative z-10 w-full max-w-[560px] max-h-full bg-cream shadow-ticket pl-card flex flex-col">
    <header class="bg-forest text-ivory px-6 py-3 flex justify-between items-center border-b-[3px] border-double border-gold flex-none">
      <div>
        <span id="share-title" class="font-serif font-black uppercase tracking-[0.18em] text-[15px] block">
          Share Your Trip
        </span>
        <span class="text-gold font-serif italic text-[12px]">A keepsake poster for your suitcase</span>
      </div>
      <button
        type="button"
        class="text-gold text-xl leading-none hover:text-ivory"
        on:click={close}
        aria-label="Close"
      >&times;</button>
    </header>

    <div class="bg-linen p-5 overflow-y-auto flex-1">
      <div class="poster-frame mx-auto">
        {#if busy && !previewUrl}
          <div class="poster-loading">
            <span class="font-serif italic text-muted">Drawing your poster...</span>
          </div>
        {:else if error}
          <div class="poster-loading">
            <span class="font-serif italic text-rust">{error}</span>
          </div>
        {:else if previewUrl}
          <img
            src={previewUrl}
            alt={`Share poster for ${trip.name}`}
            class="block w-full h-auto"
          />
        {/if}
      </div>

      <p class="text-center font-serif italic text-muted text-sm mt-3">
        1080 by 1080 pixels, perfect for Instagram or iMessage.
      </p>
    </div>

    <footer class="bg-cream border-t-[3px] border-double border-gold/40 px-6 py-3 flex items-center justify-between gap-4 flex-none">
      <button
        type="button"
        on:click={close}
        class="font-serif italic text-muted hover:text-rust text-sm"
        disabled={busy}
      >Close</button>

      <div class="flex items-center gap-3">
        <button
          type="button"
          class="btn-primary disabled:opacity-50"
          on:click={handleShare}
          disabled={busy || !posterBlob}
        >
          {canShareFiles ? 'Share Poster' : 'Download Poster'}
        </button>
      </div>
    </footer>
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
  .poster-frame {
    width: 100%;
    max-width: 420px;
    aspect-ratio: 1 / 1;
    background: #fbf6ea;
    border: 4px solid #0a2d21;
    box-shadow: 0 12px 28px rgba(40, 30, 15, 0.28);
    overflow: hidden;
  }
  .poster-loading {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
  }
</style>
