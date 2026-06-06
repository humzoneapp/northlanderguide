<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { generatePosterBlob, deliverPoster } from '$lib/utils/poster.js';
  import { buildSharePayload, encodePayload, buildShareUrl } from '$lib/utils/share-link.js';
  import { listPackingItems } from '$lib/stores/packing.js';
  import { listBookings } from '$lib/stores/bookings.js';
  import { listDiaryEntries } from '$lib/stores/diary.js';
  import { listBudgetEntries } from '$lib/stores/budget.js';
  import { listPhotos } from '$lib/stores/photos.js';

  /** @type {{ id: string, name: string, [key: string]: any }} */
  export let trip;

  const dispatch = createEventDispatcher();

  let previewUrl = '';
  /** @type {Blob | null} */
  let posterBlob = null;
  let busy = true;
  let error = '';

  let shareUrl = '';
  let linkBusy = false;
  let linkCopied = false;
  let linkError = '';
  let photoCount = 0;

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

    /* Build the share URL once on open. Done in parallel with the
       poster so the copy button is ready when the user is. We also
       count photos so we can warn the sender that those won't travel
       with the link. */
    try {
      const [packing, bookings, diary, budget, photos] = await Promise.all([
        listPackingItems(trip.id),
        listBookings(trip.id),
        listDiaryEntries(trip.id),
        listBudgetEntries(trip.id),
        listPhotos(trip.id)
      ]);
      photoCount = photos.length;
      const token = await encodePayload(
        buildSharePayload({ trip, packing, bookings, diary, budget })
      );
      shareUrl = buildShareUrl(token);
    } catch (err) {
      console.error(err);
      linkError = "We couldn't build a link. Try the poster instead.";
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

  async function handleCopyLink() {
    if (!shareUrl || linkBusy) return;
    linkBusy = true;
    linkError = '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        /* execCommand fallback for older mobile browsers. */
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      linkCopied = true;
      setTimeout(() => (linkCopied = false), 1800);
    } catch (err) {
      console.error(err);
      linkError = "Copy didn't work. Long-press the field below to grab it.";
    } finally {
      linkBusy = false;
    }
  }
</script>

<svelte:window on:keydown={onKey} />

<div
  class="fixed inset-0 z-[200] flex items-center justify-center px-4 py-6"
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
    <header class="bg-[#6e2e17] text-ivory px-6 py-3 flex justify-between items-center border-b-[3px] border-double border-gold flex-none">
      <div>
        <span id="share-title" class="font-serif font-black uppercase tracking-[0.18em] text-[15px] block">
          Share Your Trip
        </span>
        <span class="text-gold font-serif italic text-[12px]">A keepsake poster for your trip</span>
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

      <div class="link-block">
        <div class="link-head">
          <span class="kicker">Or send a route link</span>
          <p class="font-serif italic text-muted text-[13px] mt-1">
            Recipients can drop the whole route, packing list, plans, diary and budget into their own app.
            {#if photoCount > 0}
              Your {photoCount} {photoCount === 1 ? 'photo' : 'photos'} stay on this device.
            {:else}
              Photos stay on your device.
            {/if}
          </p>
        </div>
        <div class="link-row">
          <input
            type="text"
            class="link-input"
            readonly
            value={shareUrl}
            placeholder={linkError ? '' : 'Building link...'}
            aria-label="Shareable trip link"
          />
        </div>
        {#if linkError}
          <p class="font-serif italic text-rust text-[13px] mt-2">{linkError}</p>
        {/if}
      </div>
    </div>

    <footer class="bg-[#5e2a14] border-t-[3px] border-double border-gold/55 px-6 py-3 flex items-center justify-between gap-3 flex-none">
      <button
        type="button"
        on:click={close}
        class="font-serif italic text-[#ede0cc] hover:text-ivory text-sm"
        disabled={busy}
      >Close</button>

      <div class="flex items-center gap-3 flex-wrap justify-end">
        <button
          type="button"
          class="copy-link disabled:opacity-50"
          on:click={handleCopyLink}
          disabled={!shareUrl || linkBusy}
        >
          {#if linkCopied}
            Copied!
          {:else}
            Copy link
          {/if}
        </button>
        <button
          type="button"
          class="btn-primary disabled:opacity-50 share-cta"
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

  .link-block {
    margin: 18px auto 0;
    max-width: 420px;
    padding-top: 14px;
    border-top: 1px dashed rgba(125, 58, 30, 0.45);
  }
  .link-head { text-align: center; }
  .link-row {
    margin-top: 8px;
    display: flex;
    align-items: stretch;
  }
  .link-input {
    flex: 1;
    min-width: 0;
    background: #fffdf6;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 6px 10px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 0.85rem;
    color: #0a2d21;
    outline: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .link-input:focus {
    border-color: #7d3a1e;
  }

  .copy-link {
    background: transparent;
    border: 2px dashed #7d3a1e;
    color: #7d3a1e;
    padding: 0.55rem 1rem;
    border-radius: 4px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 0.92rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .copy-link:hover:not(:disabled) {
    background: #7d3a1e;
    color: #f5f0e8;
    border-style: solid;
  }
  .copy-link:disabled {
    cursor: not-allowed;
  }
  /* Rust footer band needs a green primary so the share CTA is
     readable; matches the boarding-pass identity used by the
     route + packing pickers. */
  .share-cta {
    background: #0a2d21;
    border-color: #0a2d21;
    color: #f5f0e8;
  }
  .share-cta:hover:not(:disabled) {
    background: #1f3d2d;
    border-color: #1f3d2d;
  }
</style>
