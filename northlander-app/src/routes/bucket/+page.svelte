<script>
  import { goto } from '$app/navigation';
  import {
    bucketItems,
    deleteBucketItem,
    BUCKET_KINDS
  } from '$lib/stores/bucket.js';
  import { getStop, stopGuideUrl } from '$lib/data/stops.js';

  function kindLabel(id) {
    return (BUCKET_KINDS.find((k) => k.id === id) || BUCKET_KINDS[4]).label;
  }

  function stopName(id) {
    const s = id ? getStop(id) : null;
    return s ? s.name : null;
  }

  /* Promote a bucket item into a trip booking by routing through
     the existing /add hand-off. The bucketId param tells /add to
     remove the bucket row after the trip save lands. */
  function addToTrip(item) {
    const params = new URLSearchParams({
      source: 'bucket',
      name: item.name || '',
      kind: item.kind || 'other'
    });
    if (item.stopId) params.set('stop', item.stopId);
    if (item.address) params.set('address', item.address);
    if (item.url) params.set('url', item.url);
    params.set('bucketId', String(item.id));
    goto(`/add?${params.toString()}`);
  }

  async function remove(id) {
    await deleteBucketItem(id);
  }
</script>

<svelte:head>
  <title>Bucket List - Northlander.app</title>
  <meta
    name="description"
    content="Places, plates and adventures along the Northlander route you want to come back to someday."
  />
</svelte:head>

<section class="px-6 pt-12 pb-6 max-w-[1080px] mx-auto">
  <div class="kicker">Wishlist</div>
  <h1 class="font-serif font-black text-forest text-[clamp(2rem,5vw,3rem)] leading-[1.05] mt-2">
    Your Bucket List
  </h1>
  <p class="font-serif italic text-rust mt-2 max-w-[60ch]">
    Places, plates and adventures for someday. Save anything from the Guide that catches your eye and pull it into a trip when you're ready.
  </p>
</section>

<section class="max-w-[1080px] mx-auto px-6 pb-20">
  {#if $bucketItems.length === 0}
    <!-- Empty state -->
    <div class="empty-card">
      <div class="kicker mb-2">Empty platform</div>
      <h2 class="font-serif font-bold text-forest text-2xl mb-2">
        Nothing here yet.
      </h2>
      <p class="font-serif italic text-muted mb-4">
        Open NorthlanderGuide.com, find a place you'd like to remember, and tap the + button on its listing card. Pick "Save for someday" instead of a trip and it'll land here.
      </p>
      <a href="https://northlanderguide.com" target="_blank" rel="noopener" class="btn-primary">
        Browse the Guide
      </a>
    </div>
  {:else}
    <ul class="bucket-grid">
      {#each $bucketItems as item (item.id)}
        <li class="bucket-card">
          <span class="bucket-icon" title={kindLabel(item.kind)} aria-label={kindLabel(item.kind)}>
            {#if item.kind === 'train'}
              <svg viewBox="0 0 24 24" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 11 L20 11"/>
                <circle cx="8.5" cy="20" r="1.4"/><circle cx="15.5" cy="20" r="1.4"/>
                <path d="M7 17 L7 19"/><path d="M17 17 L17 19"/>
              </svg>
            {:else if item.kind === 'room'}
              <svg viewBox="0 0 24 24" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 18 L3 10 L21 10 L21 18"/><path d="M3 18 L21 18"/>
                <path d="M7 10 L7 7 L11 7 L11 10"/>
              </svg>
            {:else if item.kind === 'meal'}
              <svg viewBox="0 0 24 24" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 3 L6 10 Q6 12 8 12 Q10 12 10 10 L10 3"/>
                <path d="M8 12 L8 21"/>
                <path d="M17 3 Q14 6 17 11 L17 21"/>
              </svg>
            {:else if item.kind === 'activity'}
              <svg viewBox="0 0 24 24" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
                <path d="M3 9 L3 11 Q5 11 5 13 Q5 15 3 15 L3 17 L21 17 L21 15 Q19 15 19 13 Q19 11 21 11 L21 9 Z"/>
                <path d="M9 9 L9 17 M15 9 L15 17" stroke-dasharray="2 2"/>
              </svg>
            {:else}
              <svg viewBox="0 0 24 24" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
                <path d="M6 3 L18 3 L18 21 L12 17 L6 21 Z"/>
              </svg>
            {/if}
          </span>

          <div class="bucket-body">
            <h3 class="bucket-name">{item.name}</h3>
            <div class="bucket-meta">
              <span class="kind-tag">{kindLabel(item.kind)}</span>
              {#if stopName(item.stopId)}
                {#if getStop(item.stopId)}
                  <a href={stopGuideUrl(getStop(item.stopId))} target="_blank" rel="noopener" class="stop-pill">
                    {stopName(item.stopId)}
                  </a>
                {:else}
                  <span class="stop-pill">{stopName(item.stopId)}</span>
                {/if}
              {/if}
            </div>
            {#if item.address}
              <p class="bucket-address">{item.address}</p>
            {/if}
            {#if item.notes}
              <p class="bucket-notes">{item.notes}</p>
            {/if}
            {#if item.url}
              <a href={item.url} target="_blank" rel="noopener" class="bucket-source">
                View on the Guide &rarr;
              </a>
            {/if}
          </div>

          <div class="bucket-actions">
            <button
              type="button"
              class="btn-primary bucket-add-btn"
              on:click={() => addToTrip(item)}
            >Add to a trip</button>
            <button
              type="button"
              class="bucket-remove"
              on:click={() => remove(item.id)}
              aria-label={`Remove ${item.name}`}
            >&times;</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .empty-card {
    background: #fbf6ea;
    border: 2px dashed rgba(139, 106, 58, 0.55);
    border-radius: 4px;
    padding: 36px 28px;
    text-align: center;
    max-width: 640px;
    margin: 0 auto;
  }

  .bucket-grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 16px;
    grid-template-columns: 1fr;
  }
  @media (min-width: 720px) {
    .bucket-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  .bucket-card {
    position: relative;
    background: #fbf6ea;
    border-left: 4px solid #7d3a1e;
    padding: 18px 20px;
    box-shadow: 0 4px 14px rgba(80, 50, 20, 0.07);
    display: grid;
    grid-template-columns: 36px 1fr;
    gap: 12px;
  }
  .bucket-icon {
    color: #7d3a1e;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 2px;
  }
  .bucket-body {
    min-width: 0;
  }
  .bucket-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 20px;
    color: #0a2d21;
    line-height: 1.2;
    margin: 0 0 6px;
    overflow-wrap: anywhere;
  }
  .bucket-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 6px;
  }
  .kind-tag {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .stop-pill {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #0a2d21;
    background: rgba(196, 134, 15, 0.18);
    border: 1px dashed #c4860f;
    border-radius: 999px;
    padding: 2px 10px;
    text-decoration: none;
    transition: background 0.15s;
  }
  .stop-pill:hover {
    background: rgba(196, 134, 15, 0.3);
  }
  .bucket-address {
    font-family: 'Spline Sans', sans-serif;
    font-size: 13px;
    color: #5a4f3d;
    margin: 0 0 6px;
  }
  .bucket-notes {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 14.5px;
    line-height: 1.55;
    color: #241f1a;
    opacity: 0.85;
    margin: 6px 0;
    white-space: pre-wrap;
  }
  .bucket-source {
    display: inline-block;
    margin-top: 4px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #7d3a1e;
    text-transform: uppercase;
    text-decoration: none;
  }
  .bucket-source:hover {
    color: #0a2d21;
  }

  .bucket-actions {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 8px;
    padding-top: 10px;
    border-top: 1px dashed rgba(139, 106, 58, 0.35);
  }
  .bucket-add-btn {
    padding: 0.55rem 1rem;
    font-size: 0.88rem;
  }
  .bucket-remove {
    background: transparent;
    border: 0;
    color: rgba(139, 106, 58, 0.55);
    font-size: 22px;
    line-height: 1;
    padding: 4px 8px;
    cursor: pointer;
    transition: color 0.15s;
  }
  .bucket-remove:hover {
    color: #7d3a1e;
  }
</style>
