<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { generatePosterBlob, deliverPoster } from '$lib/utils/poster.js';
  import { buildSharePayload, encodePayload, buildShareUrl } from '$lib/utils/share-link.js';
  import { listPackingItems } from '$lib/stores/packing.js';
  import { listBookings } from '$lib/stores/bookings.js';
  import { listDiaryEntries } from '$lib/stores/diary.js';
  import { listBudgetEntries } from '$lib/stores/budget.js';
  import { listPhotos } from '$lib/stores/photos.js';
  import { generateQrMatrix } from '$lib/utils/qr.js';

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

  /* Encode the share URL into a QR matrix client-side. Recomputed
     whenever the URL changes (shouldn't happen mid-modal, but a
     reactive declaration is cheap and means the first render
     doesn't show a blank box for one tick). */
  $: qr = shareUrl ? generateQrMatrix(shareUrl) : null;

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

  /* Per-platform share for the trip poster. Same intent as the
     photo lightbox: try the device share sheet first (which lists
     every installed app the user might post to), fall through to
     each platform's web intent on desktop. Instagram has no
     web posting API so we download the poster and pop a new tab
     to instagram.com so the user can post from the IG app. */
  let platformBusy = false;
  async function shareToPlatform(platform) {
    if (platformBusy || !posterBlob) return;
    platformBusy = true;
    try {
      const filename = `${trip.id || 'trip'}-northlander.png`;
      const text = `My ${trip.name || 'Northlander trip'} - planned with Northlander.app`;
      const file = new File([posterBlob], filename, { type: 'image/png' });
      const canFile =
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] });
      if (canFile && typeof navigator.share === 'function') {
        try {
          await navigator.share({ files: [file], title: text, text });
          return;
        } catch (_) {
          /* User cancelled or share failed; fall through. */
        }
      }
      const sharedUrl = shareUrl || 'https://northlander.app/';
      if (platform === 'x') {
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(sharedUrl)}`,
          '_blank',
          'noopener,noreferrer'
        );
      } else if (platform === 'facebook') {
        window.open(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(sharedUrl)}&quote=${encodeURIComponent(text)}`,
          '_blank',
          'noopener,noreferrer'
        );
      } else if (platform === 'instagram') {
        await deliverPoster(posterBlob, trip.id, text);
        window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
      } else {
        await deliverPoster(posterBlob, trip.id, text);
      }
    } finally {
      platformBusy = false;
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
    <header class="bg-[#4a1f0e] text-ivory px-6 py-3 flex justify-between items-center border-b-[3px] border-double border-gold flex-none">
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

      <!-- Branded share row. Same idea as the photo lightbox: try
           navigator.share with the poster file first; on desktop
           fall through to per-platform web intents so the user
           can still post the trip link with one tap. -->
      <div class="share-row" role="group" aria-label="Share to social">
        <button
          type="button"
          class="share-icon share-x"
          on:click={() => shareToPlatform('x')}
          disabled={platformBusy || !posterBlob}
          title="Share to X (Twitter)"
          aria-label="Share to X"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M17.53 3H20.5l-6.49 7.41L21.75 21h-6.05l-4.74-6.2L5.3 21H2.31l6.94-7.92L1.81 3h6.2l4.27 5.65L17.53 3zm-1.06 16.2h1.67L7.6 4.7H5.82l10.65 14.5z"/>
          </svg>
        </button>
        <button
          type="button"
          class="share-icon share-instagram"
          on:click={() => shareToPlatform('instagram')}
          disabled={platformBusy || !posterBlob}
          title="Share to Instagram"
          aria-label="Share to Instagram"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5"/>
            <circle cx="12" cy="12" r="4"/>
            <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none"/>
          </svg>
        </button>
        <button
          type="button"
          class="share-icon share-facebook"
          on:click={() => shareToPlatform('facebook')}
          disabled={platformBusy || !posterBlob}
          title="Share to Facebook"
          aria-label="Share to Facebook"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H8.08V12h2.36V9.96c0-2.33 1.39-3.62 3.52-3.62.7 0 1.43.12 2.04.24v2.43h-1.15c-1.13 0-1.48.7-1.48 1.42V12h2.52l-.4 2.89h-2.12v6.99A10 10 0 0 0 22 12z"/>
          </svg>
        </button>
        <button
          type="button"
          class="share-icon share-native"
          on:click={() => shareToPlatform('native')}
          disabled={platformBusy || !posterBlob}
          title="More share options"
          aria-label="More share options"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 12 V19 a2 2 0 0 0 2 2 H18 a2 2 0 0 0 2 -2 V12"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
        </button>
      </div>

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

        <!-- QR code so anyone with a phone next to you can scan
             instead of asking you to text the link. Encoded entirely
             in-browser via qrcode-generator and rendered as inline
             SVG - no external service in the critical path. -->
        {#if qr}
          {@const margin = 2}
          {@const side = qr.size + margin * 2}
          <div class="qr-block">
            <svg
              class="qr-img"
              width="180"
              height="180"
              viewBox="0 0 {side} {side}"
              role="img"
              aria-label="QR code for the shareable trip link"
              shape-rendering="crispEdges"
            >
              <rect width={side} height={side} fill="#fbf6ea" />
              {#each qr.cells as row, r}
                {#each row as cell, c}
                  {#if cell}
                    <rect x={c + margin} y={r + margin} width="1" height="1" fill="#0a2d21" />
                  {/if}
                {/each}
              {/each}
            </svg>
            <p class="qr-hint font-serif italic text-muted text-[12.5px]">
              Point a phone camera at this to open the trip on theirs.
            </p>
          </div>
        {/if}
      </div>
    </div>

    <footer class="bg-[#4a1f0e] border-t-[3px] border-double border-gold/55 px-6 py-3 flex items-center justify-between gap-3 flex-none">
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

  /* Share row recoloured 2026-06-07 to the app palette. Mirror of
     the PhotoAlbum lightbox styling so a user who's seen one knows
     what the other does. Centered under the poster preview. */
  .share-row {
    margin: 14px auto 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .share-icon {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1.5px solid transparent;
    cursor: pointer;
    transition: transform 180ms cubic-bezier(.2,.7,.3,1), background 180ms ease, color 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
    padding: 0;
    box-shadow: 0 2px 6px rgba(40, 30, 15, 0.12);
  }
  .share-icon:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 14px rgba(40, 30, 15, 0.22);
  }
  .share-icon:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 6px rgba(40, 30, 15, 0.12);
  }
  .share-icon:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }
  .share-x {
    background: #0a2d21;
    color: #f5f0e8;
    border-color: #0a2d21;
  }
  .share-x:hover:not(:disabled) {
    background: #133e30;
    border-color: #133e30;
  }
  .share-instagram {
    background: #c9a84c;
    color: #0a2d21;
    border-color: #c9a84c;
  }
  .share-instagram:hover:not(:disabled) {
    background: #d8b863;
    border-color: #d8b863;
  }
  .share-facebook {
    background: #7d3a1e;
    color: #f5f0e8;
    border-color: #7d3a1e;
  }
  .share-facebook:hover:not(:disabled) {
    background: #8e4524;
    border-color: #8e4524;
  }
  .share-native {
    background: #fbf6ea;
    color: #7d3a1e;
    border-color: #c9a84c;
  }
  .share-native:hover:not(:disabled) {
    background: #c9a84c;
    color: #0a2d21;
    border-color: #c9a84c;
  }

  /* QR block. Centered under the link field, framed with the same
     gold-on-cream paper aesthetic as the polaroid frames. */
  .qr-block {
    margin: 14px auto 0;
    text-align: center;
  }
  .qr-img {
    display: inline-block;
    width: 160px;
    height: 160px;
    background: #fbf6ea;
    padding: 8px;
    border: 1.5px solid rgba(201, 168, 76, 0.65);
    border-radius: 4px;
    box-shadow: 0 6px 14px rgba(40, 30, 15, 0.16);
  }
  .qr-hint {
    margin: 8px 0 0;
  }
</style>
