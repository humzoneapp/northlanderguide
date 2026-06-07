<script>
  import { onMount, onDestroy, tick, createEventDispatcher } from 'svelte';
  import {
    listPhotos,
    addPhoto,
    updatePhoto,
    deletePhoto,
    totalBytes,
    formatBytes
  } from '$lib/stores/photos.js';
  import { getStop, getStopsByIds } from '$lib/data/stops.js';

  /** @type {string} */
  export let tripId;
  /** @type {string[]} - stops on the trip, available for tagging */
  export let stopIds = [];
  /** @type {string} - When set, the grid narrows to photos pinned to
      this stop and new uploads auto-tag here. The per-tile stop chip
      and the lightbox tag dropdown hide since the surrounding scene
      already names the stop. */
  export let stopFilter = '';
  /** @type {number} - Bump from the parent to force a refetch when
      an outside surface has mutated the album while this view is
      mounted. */
  export let refreshKey = 0;
  /** @type {boolean} - When true, suppress only the in-component
      kicker + title (the Drawer parent owns that text). The right
      side of the header row (photo count + Add photos button)
      stays visible so the upload affordance isn't lost. */
  export let hideHeader = false;

  const dispatch = createEventDispatcher();

  /** @type {import('$lib/stores/photos.js').Photo[]} */
  let photos = [];
  let loaded = false;
  let bytes = 0;

  /* Upload state - shown above the grid while files are processing. */
  let uploadActive = false;
  let uploadDone = 0;
  let uploadTotal = 0;
  let uploadError = '';

  /* Object-URL cache. We hand the same URL to the grid + the lightbox
     and revoke them all when the component unmounts so blobs don't
     leak across navigations. Keys are photo ids; values are
     { thumbUrl, fullUrl }. */
  let urlCache = new Map();

  /* Lightbox state. */
  let lightboxIndex = -1;
  let captionDraft = '';
  let tagDraft = '';

  /** @type {HTMLInputElement | undefined} */
  let fileInput;

  $: tripId, refreshKey, refresh();
  $: tripStops = getStopsByIds(stopIds);
  $: visiblePhotos = stopFilter ? photos.filter((p) => p.stopId === stopFilter) : photos;
  $: openPhoto = lightboxIndex >= 0 && lightboxIndex < visiblePhotos.length ? visiblePhotos[lightboxIndex] : null;

  onMount(refresh);

  onDestroy(() => {
    for (const v of urlCache.values()) {
      if (v.thumbUrl) URL.revokeObjectURL(v.thumbUrl);
      if (v.fullUrl) URL.revokeObjectURL(v.fullUrl);
    }
    urlCache.clear();
  });

  async function refresh() {
    if (!tripId) {
      photos = [];
      bytes = 0;
      loaded = true;
      return;
    }
    photos = await listPhotos(tripId);
    bytes = await totalBytes(tripId);
    syncUrlCache();
    loaded = true;
  }

  /* Build object URLs for any photo we haven't cached, and revoke
     URLs for photos that have left the list. */
  function syncUrlCache() {
    const next = new Map();
    for (const p of photos) {
      const prev = urlCache.get(p.id);
      next.set(p.id, prev || {
        thumbUrl: URL.createObjectURL(p.thumb),
        fullUrl: URL.createObjectURL(p.blob)
      });
    }
    for (const [id, urls] of urlCache.entries()) {
      if (!next.has(id)) {
        if (urls.thumbUrl) URL.revokeObjectURL(urls.thumbUrl);
        if (urls.fullUrl) URL.revokeObjectURL(urls.fullUrl);
      }
    }
    urlCache = next;
  }

  function thumbUrlFor(p) {
    const u = urlCache.get(p.id);
    return u ? u.thumbUrl : '';
  }
  function fullUrlFor(p) {
    const u = urlCache.get(p.id);
    return u ? u.fullUrl : '';
  }

  async function handlePick(event) {
    const files = Array.from(event?.target?.files || []);
    if (files.length === 0) return;
    await uploadFiles(files);
    /* Reset the input so picking the same file again still fires. */
    if (fileInput) fileInput.value = '';
  }

  async function uploadFiles(files) {
    uploadActive = true;
    uploadDone = 0;
    uploadTotal = files.length;
    uploadError = '';
    const meta = stopFilter ? { stopId: stopFilter } : {};
    for (const f of files) {
      try {
        const id = await addPhoto(tripId, f, meta);
        if (id == null) uploadError = 'Some photos could not be decoded.';
      } catch (err) {
        uploadError = 'Photo upload failed. Try fewer at a time?';
      }
      uploadDone += 1;
    }
    await refresh();
    uploadActive = false;
    dispatch('change');
  }

  async function openLightbox(i) {
    if (i < 0 || i >= visiblePhotos.length) return;
    lightboxIndex = i;
    const p = visiblePhotos[i];
    captionDraft = p.caption || '';
    tagDraft = p.stopId || stopFilter || '';
    await tick();
    /* No focus call here - the close X is the natural first focusable. */
  }

  function closeLightbox() {
    lightboxIndex = -1;
    captionDraft = '';
    tagDraft = '';
  }

  function next() {
    if (lightboxIndex < visiblePhotos.length - 1) {
      openLightbox(lightboxIndex + 1);
    }
  }
  function prev() {
    if (lightboxIndex > 0) {
      openLightbox(lightboxIndex - 1);
    }
  }

  function onKey(e) {
    if (lightboxIndex < 0) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  }

  async function saveOpenMeta() {
    if (!openPhoto) return;
    const id = openPhoto.id;
    const updated = await updatePhoto(id, {
      caption: captionDraft,
      stopId: tagDraft || null
    });
    if (updated) {
      const idx = photos.findIndex((p) => p.id === id);
      if (idx >= 0) {
        photos[idx] = updated;
        photos = [...photos];
      }
      dispatch('change');
    }
  }

  async function removeOpen() {
    if (!openPhoto) return;
    const id = openPhoto.id;
    const i = lightboxIndex;
    closeLightbox();
    await deletePhoto(id);
    await refresh();
    dispatch('change');
    /* Reopen the neighbour if there is one so the user can keep flipping. */
    if (visiblePhotos.length > 0) {
      const nextIdx = Math.min(i, visiblePhotos.length - 1);
      openLightbox(nextIdx);
    }
  }

  function stopNameFor(id) {
    const s = id ? getStop(id) : null;
    return s ? s.name : null;
  }

  /* Quick-delete from a grid tile without opening the lightbox.
     Native confirm gives the two-step safety; same UX as the
     dashboard polaroid corner delete. */
  async function deleteFromTile(p, ev) {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    if (!p) return;
    const ok = typeof window !== 'undefined' && window.confirm
      ? window.confirm('Remove this photo from the album?')
      : true;
    if (!ok) return;
    await deletePhoto(p.id);
    await refresh();
    dispatch('change');
  }

  /* Share: prefer navigator.share with the photo as a file so the
     native sheet covers Instagram, WhatsApp, Messages, Mail etc.
     in one tap on mobile. Fall back to download on desktop +
     browsers without file-share support. */
  let shareBusy = false;
  async function shareOpen() {
    if (shareBusy || !openPhoto) return;
    shareBusy = true;
    try {
      const p = openPhoto;
      const filename = p.caption
        ? `${p.caption.replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)}.jpg`
        : `northlander-${p.id}.jpg`;
      const file = new File([p.blob], filename, { type: 'image/jpeg' });
      const canFile = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (canFile && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            files: [file],
            title: p.caption || 'A polaroid from the Northlander',
            text: p.caption || ''
          });
          return;
        } catch (_) {
          /* User cancelled or sheet failed; fall through to download. */
        }
      }
      downloadOpen();
    } finally {
      shareBusy = false;
    }
  }

  /* Per-platform share buttons. On iOS/Android the only honest path
     to "post to Instagram" or X is via `navigator.share({files})`
     because no public web API lets the browser upload a photo into
     those apps directly. So every brand button first tries the
     native share sheet (which on iOS routes through the user's
     Share Extension list, where Instagram / X / Facebook live).
     On desktop where file share isn't supported we fall through:
     - X opens the tweet intent with the caption pre-filled.
     - Facebook opens the URL sharer with the Northlander.app URL.
     - Instagram has no web post API at all, so we download the
       image (so the user can drag it into the IG web composer)
       and pop a new tab to instagram.com. */
  async function shareToPlatform(platform) {
    if (shareBusy || !openPhoto) return;
    shareBusy = true;
    try {
      const p = openPhoto;
      const caption = (p.caption || 'A polaroid from the Northlander').trim();
      const filename = p.caption
        ? `${p.caption.replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)}.jpg`
        : `northlander-${p.id}.jpg`;
      const file = new File([p.blob], filename, { type: 'image/jpeg' });
      const canFile = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (canFile && typeof navigator.share === 'function') {
        try {
          await navigator.share({ files: [file], title: caption, text: caption });
          return;
        } catch (_) {
          /* User cancelled or sheet failed; fall through to platform
             web intent. */
        }
      }
      const tripUrl = 'https://northlander.app/';
      if (platform === 'x') {
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(tripUrl)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      } else if (platform === 'facebook') {
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(tripUrl)}&quote=${encodeURIComponent(caption)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      } else if (platform === 'instagram') {
        /* IG has no web posting endpoint - download so the user can
           drag the file into the Instagram desktop composer. */
        downloadOpen();
        window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
      } else {
        downloadOpen();
      }
    } finally {
      shareBusy = false;
    }
  }

  function downloadOpen() {
    if (!openPhoto) return;
    const url = fullUrlFor(openPhoto);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    const caption = openPhoto.caption || '';
    a.download = caption
      ? `${caption.replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)}.jpg`
      : `northlander-${openPhoto.id}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
</script>

<svelte:window on:keydown={onKey} />

<div>
  <div class="header-row">
    {#if !hideHeader}
      <div>
        <div class="kicker">Album</div>
        <h3 class="font-serif font-bold text-forest text-xl">Trip photos</h3>
      </div>
    {/if}
    <div class="header-meta">
      {#if loaded && visiblePhotos.length > 0}
        <span class="meta-pill">
          <strong>{visiblePhotos.length}</strong>
          {visiblePhotos.length === 1 ? 'photo' : 'photos'}
        </span>
        {#if !stopFilter}
          <span class="meta-pill">{formatBytes(bytes)}</span>
        {/if}
      {/if}
      <button
        type="button"
        class="upload-btn"
        on:click={() => fileInput?.click()}
        disabled={uploadActive}
      >
        {uploadActive ? `Uploading ${uploadDone} of ${uploadTotal}` : 'Add photos'}
      </button>
    </div>
  </div>

  <input
    type="file"
    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
    multiple
    bind:this={fileInput}
    on:change={handlePick}
    hidden
  />

  {#if uploadError}
    <p class="upload-error">{uploadError}</p>
  {/if}

  {#if loaded}
    {#if visiblePhotos.length === 0}
      <p class="empty">
        {#if stopFilter}
          No photos here yet. Tap Add photos to drop a few from this stop.
        {:else}
          Your album is empty. Drop a few photos in and they'll travel with the trip - we resize on the way in so storage stays light.
        {/if}
      </p>
    {:else}
      <p class="tip-line">Tap a polaroid to add a caption or share it. The X removes one quickly.</p>
      <ul class="grid">
        {#each visiblePhotos as p, i (p.id)}
          <li>
            <div class="tile-wrap">
              <button
                type="button"
                class="tile"
                on:click={() => openLightbox(i)}
                aria-label={p.caption || `Open photo ${i + 1}`}
              >
                <img src={thumbUrlFor(p)} alt={p.caption || ''} loading="lazy" />
                {#if p.caption}
                  <span class="caption-overlay">{p.caption}</span>
                {/if}
                {#if !stopFilter && stopNameFor(p.stopId)}
                  <span class="tile-stop">{stopNameFor(p.stopId)}</span>
                {/if}
              </button>
              <button
                type="button"
                class="tile-delete"
                on:click={(ev) => deleteFromTile(p, ev)}
                aria-label={`Remove photo ${i + 1} from album`}
                title="Remove from album"
              >&times;</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

{#if openPhoto}
  <div
    class="lightbox"
    role="dialog"
    aria-modal="true"
    aria-label="Photo viewer"
  >
    <button class="lightbox-backdrop" on:click={closeLightbox} aria-label="Close"></button>
    <div class="lightbox-shell">
      <button
        class="lightbox-close"
        on:click={closeLightbox}
        aria-label="Close"
      >&times;</button>

      <div class="lightbox-stage">
        <button
          class="nav-btn nav-prev"
          on:click={prev}
          disabled={lightboxIndex === 0}
          aria-label="Previous photo"
        >&larr;</button>
        <img src={fullUrlFor(openPhoto)} alt={openPhoto.caption || ''} />
        <button
          class="nav-btn nav-next"
          on:click={next}
          disabled={lightboxIndex === visiblePhotos.length - 1}
          aria-label="Next photo"
        >&rarr;</button>
      </div>

      <div class="lightbox-meta">
        <span class="lightbox-counter">
          Photo {lightboxIndex + 1} of {visiblePhotos.length}
        </span>
        <label class="caption-label">
          <span class="caption-label-text">Caption or note</span>
          <textarea
            bind:value={captionDraft}
            on:blur={saveOpenMeta}
            maxlength="500"
            placeholder="What was this moment? A meal, a view, a thought..."
            rows="3"
            class="caption-input"
          ></textarea>
        </label>
        <div class="lightbox-actions">
          {#if !stopFilter && tripStops.length > 0}
            <select
              bind:value={tagDraft}
              on:change={saveOpenMeta}
              class="tag-select"
              aria-label="Tag a stop"
            >
              <option value="">Pin to a stop...</option>
              {#each tripStops as s}
                <option value={s.id}>At {s.name}</option>
              {/each}
            </select>
          {/if}

          <!-- Branded share row. Tapping any platform first tries
               navigator.share with the file (which on iOS / Android
               opens the system sheet listing X / IG / FB / Messages
               etc. all at once); when that's unavailable each button
               falls through to the platform's web intent. -->
          <div class="share-row" role="group" aria-label="Share to social">
            <button
              type="button"
              class="share-icon share-x"
              on:click={() => shareToPlatform('x')}
              disabled={shareBusy}
              title="Share to X (Twitter)"
              aria-label="Share to X"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M17.53 3H20.5l-6.49 7.41L21.75 21h-6.05l-4.74-6.2L5.3 21H2.31l6.94-7.92L1.81 3h6.2l4.27 5.65L17.53 3zm-1.06 16.2h1.67L7.6 4.7H5.82l10.65 14.5z"/>
              </svg>
            </button>
            <button
              type="button"
              class="share-icon share-instagram"
              on:click={() => shareToPlatform('instagram')}
              disabled={shareBusy}
              title="Share to Instagram"
              aria-label="Share to Instagram"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="5"/>
                <circle cx="12" cy="12" r="4"/>
                <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none"/>
              </svg>
            </button>
            <button
              type="button"
              class="share-icon share-facebook"
              on:click={() => shareToPlatform('facebook')}
              disabled={shareBusy}
              title="Share to Facebook"
              aria-label="Share to Facebook"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H8.08V12h2.36V9.96c0-2.33 1.39-3.62 3.52-3.62.7 0 1.43.12 2.04.24v2.43h-1.15c-1.13 0-1.48.7-1.48 1.42V12h2.52l-.4 2.89h-2.12v6.99A10 10 0 0 0 22 12z"/>
              </svg>
            </button>
            <button
              type="button"
              class="share-icon share-native"
              on:click={shareOpen}
              disabled={shareBusy}
              title="More share options"
              aria-label="More share options"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 12 V19 a2 2 0 0 0 2 2 H18 a2 2 0 0 0 2 -2 V12"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
            </button>
          </div>

          <div class="lightbox-side-actions">
            <button
              type="button"
              class="lightbox-download"
              on:click={downloadOpen}
              title="Save a copy to your device"
              aria-label="Download photo"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 12 V19 a2 2 0 0 0 2 2 H18 a2 2 0 0 0 2 -2 V12"/>
                <polyline points="8 12 12 16 16 12"/>
                <line x1="12" y1="3" x2="12" y2="16"/>
              </svg>
              <span>Download</span>
            </button>
            <button
              type="button"
              class="lightbox-remove"
              on:click={removeOpen}
            >Remove from album</button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .header-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    /* Push the row down from whatever sits above (the Drawer's
       dashed gold divider when this album is mounted in a chapter)
       so the Add photos button isn't pressed against the rule. */
    margin-top: 14px;
    margin-bottom: 12px;
  }
  .header-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .meta-pill {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #7d3a1e;
  }
  .meta-pill strong {
    font-weight: 700;
    font-style: normal;
  }
  .upload-btn {
    background: #6e2e17;
    color: #f3ece0;
    border: 2px solid #6e2e17;
    padding: 0.55rem 1rem;
    border-radius: 4px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(40, 30, 15, 0.12);
    transition: background 180ms ease, border-color 180ms ease, transform 180ms cubic-bezier(.2,.7,.3,1), box-shadow 180ms ease;
  }
  .upload-btn:hover:not(:disabled) {
    background: #0a2d21;
    border-color: #0a2d21;
    transform: translateY(-1px);
    box-shadow: 0 5px 12px rgba(40, 30, 15, 0.2);
  }
  .upload-btn:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 6px rgba(40, 30, 15, 0.12);
  }
  .upload-btn:disabled {
    opacity: 0.6;
    cursor: progress;
  }
  .upload-error {
    background: rgba(125, 58, 30, 0.12);
    border: 1px solid #7d3a1e;
    color: #5e2a14;
    padding: 8px 12px;
    border-radius: 3px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    margin-bottom: 12px;
  }
  .empty {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 4px 0;
  }

  .grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
  /* Hint line above the grid pointing at the lightbox + corner X. */
  .tip-line {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    font-size: 12.5px;
    margin: 4px 0 12px;
  }
  /* Wrap holds the tile button + the corner X as siblings so we
     can position the X without nesting button-in-button. */
  .tile-wrap {
    position: relative;
  }
  .tile {
    position: relative;
    aspect-ratio: 1 / 1;
    background: #ede0cc;
    border: 0;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    width: 100%;
  }
  .tile-wrap:hover .tile {
    transform: translateY(-2px);
    box-shadow: 0 6px 14px rgba(40, 30, 20, 0.16);
  }
  /* Corner delete - hover-revealed on devices that support hover;
     always visible on touch (@media hover: none) so iPad users
     can find it without a long-press. */
  .tile-delete {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1.5px solid #6e2e17;
    background: #fffdf6;
    color: #6e2e17;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(20, 14, 6, 0.2);
    opacity: 0;
    transition: opacity 140ms ease, background 140ms ease, color 140ms ease;
    z-index: 2;
  }
  .tile-wrap:hover .tile-delete,
  .tile-wrap:focus-within .tile-delete {
    opacity: 1;
  }
  .tile-delete:hover {
    background: #6e2e17;
    color: #fffdf6;
  }
  @media (hover: none) {
    .tile-delete { opacity: 1; }
  }
  .tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .caption-overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 18px 10px 8px;
    background: linear-gradient(180deg, transparent, rgba(10, 45, 33, 0.85));
    color: #f3ece0;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12.5px;
    line-height: 1.3;
    text-align: left;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .tile-stop {
    position: absolute;
    top: 6px;
    left: 6px;
    background: rgba(196, 134, 15, 0.85);
    color: #0a2d21;
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 999px;
  }

  /* ===== Lightbox ===== */
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .lightbox-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(10, 30, 20, 0.85);
    backdrop-filter: blur(4px);
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .lightbox-shell {
    position: relative;
    z-index: 1;
    max-width: 100%;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(960px, 100%);
  }
  .lightbox-close {
    position: absolute;
    top: -42px;
    right: 0;
    background: transparent;
    border: 0;
    color: #f3ece0;
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
    padding: 4px 10px;
  }
  .lightbox-close:hover {
    color: #c9a84c;
  }

  .lightbox-stage {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fbf6ea;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }
  .lightbox-stage img {
    max-width: 100%;
    max-height: 72vh;
    object-fit: contain;
    display: block;
  }
  .nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(10, 30, 20, 0.6);
    color: #f3ece0;
    border: 0;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    transition: background 0.15s, transform 0.15s;
  }
  .nav-btn:hover:not(:disabled) {
    background: #7d3a1e;
  }
  .nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .nav-prev {
    left: 8px;
  }
  .nav-next {
    right: 8px;
  }

  .lightbox-meta {
    background: #fbf6ea;
    padding: 12px 16px;
    border-top: 2px solid #7d3a1e;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lightbox-counter {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
    color: #7d3a1e;
  }
  .caption-label {
    display: block;
    margin: 6px 0;
  }
  .caption-label-text {
    display: block;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    font-weight: 800;
    color: #c4860f;
    margin-bottom: 6px;
  }
  .caption-input {
    width: 100%;
    background: transparent;
    border: 1px dashed rgba(201, 168, 76, 0.45);
    border-radius: 4px;
    padding: 8px 10px;
    outline: none;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 16px;
    color: #241f1a;
    resize: vertical;
    min-height: 72px;
    transition: border-color 140ms ease;
  }
  .caption-input:focus { border-color: #c9a84c; }
  .caption-input::placeholder {
    color: rgba(90, 79, 61, 0.55);
  }
  .lightbox-actions {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 14px;
    flex-wrap: wrap;
  }
  .tag-select {
    background: #fffdf6;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 6px 10px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #0a2d21;
    cursor: pointer;
    outline: none;
  }
  .tag-select:focus {
    border-color: #7d3a1e;
  }
  /* Share row recoloured 2026-06-07 to live in the app's vintage
     palette (forest / gold / rust / cream) instead of each platform's
     brand colour. Distinct enough to recognize at a glance, plus
     they actually look at home inside the cream lightbox meta panel.
     Every chip lifts a touch on hover for a unified motion language. */
  .share-row {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .share-icon {
    width: 36px;
    height: 36px;
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
  /* X: deep forest, the darkest chip in the row. */
  .share-x {
    background: #0a2d21;
    color: #f5f0e8;
    border-color: #0a2d21;
  }
  .share-x:hover:not(:disabled) {
    background: #133e30;
    border-color: #133e30;
  }
  /* Instagram: gold, the warmest chip - reads as the IG-energy in
     palette without leaning on the magenta gradient. */
  .share-instagram {
    background: #c9a84c;
    color: #0a2d21;
    border-color: #c9a84c;
  }
  .share-instagram:hover:not(:disabled) {
    background: #d8b863;
    border-color: #d8b863;
  }
  /* Facebook: rust, distinct from forest + gold. */
  .share-facebook {
    background: #7d3a1e;
    color: #f5f0e8;
    border-color: #7d3a1e;
  }
  .share-facebook:hover:not(:disabled) {
    background: #8e4524;
    border-color: #8e4524;
  }
  /* Native share: cream paper with gold ring + rust glyph so it
     stands apart from the three solid-filled platform chips. */
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

  /* Download + Remove sit in a secondary row beside the social
     icons. Both have solid filled hover states so the text never
     dissolves into the background - earlier dashed-gold treatment
     turned ivory-on-12pc-gold which was hard to read on a dark
     lightbox shell. */
  .lightbox-side-actions {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }
  /* Download lives on the cream lightbox-meta band, so the earlier
     gold-on-cream treatment was effectively invisible (low contrast
     in both states). Now: solid rust filled with ivory text by
     default; on hover it flips to forest fill so it still feels
     like a touch lighting up. Sits in palette with the new share
     icon row above it. */
  .lightbox-download {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 999px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 180ms ease, color 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
    background: #7d3a1e;
    color: #f5f0e8;
    border: 1.5px solid #7d3a1e;
    box-shadow: 0 2px 6px rgba(40, 30, 15, 0.12);
  }
  .lightbox-download:hover {
    background: #0a2d21;
    border-color: #0a2d21;
    transform: translateY(-1px);
    box-shadow: 0 5px 12px rgba(40, 30, 15, 0.2);
  }
  .lightbox-remove {
    background: transparent;
    border: 1.5px solid transparent;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #c4860f;
    cursor: pointer;
    padding: 5px 12px;
    border-radius: 999px;
    transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
  }
  .lightbox-remove:hover {
    background: #7d3a1e;
    color: #f5f0e8;
    border-color: #7d3a1e;
  }
</style>
