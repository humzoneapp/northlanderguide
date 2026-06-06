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
</script>

<svelte:window on:keydown={onKey} />

<div>
  <div class="header-row">
    <div>
      <div class="kicker">Album</div>
      <h3 class="font-serif font-bold text-forest text-xl">Trip photos</h3>
    </div>
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
      <ul class="grid">
        {#each visiblePhotos as p, i (p.id)}
          <li>
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
        <textarea
          bind:value={captionDraft}
          on:blur={saveOpenMeta}
          maxlength="240"
          placeholder="Add a caption..."
          rows="2"
          class="caption-input"
        ></textarea>
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
          <button
            type="button"
            class="lightbox-remove"
            on:click={removeOpen}
          >Remove from album</button>
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
    transition: background 0.15s, border-color 0.15s;
  }
  .upload-btn:hover:not(:disabled) {
    background: #0a2d21;
    border-color: #0a2d21;
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
  .tile {
    position: relative;
    aspect-ratio: 1 / 1;
    background: #ede0cc;
    border: 0;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .tile:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 14px rgba(40, 30, 20, 0.16);
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
  .caption-input {
    width: 100%;
    background: transparent;
    border: 0;
    outline: none;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 16px;
    color: #241f1a;
    resize: vertical;
    min-height: 48px;
  }
  .caption-input::placeholder {
    color: rgba(90, 79, 61, 0.55);
  }
  .lightbox-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
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
  .lightbox-remove {
    background: transparent;
    border: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #7d3a1e;
    cursor: pointer;
    padding: 4px 6px;
  }
  .lightbox-remove:hover {
    color: #5e2a14;
  }
</style>
