<script>
  import { goto } from '$app/navigation';
  import {
    bucketItems,
    deleteBucketItem,
    BUCKET_KINDS,
    db
  } from '$lib/stores/bucket.js';
  import { getStop, stopGuideUrl } from '$lib/data/stops.js';
  import { pushToast } from '$lib/stores/toasts.js';

  /* Filter + sort state. Kind filter is a tab row; query is a
     case-insensitive substring match across name / address / notes;
     sort flips between newest-first and A-Z. */
  let kindFilter = 'all';
  let query = '';
  let sortMode = 'newest';

  /* Kind tabs: All + every BUCKET_KINDS entry with its display label. */
  const TABS = [{ id: 'all', label: 'All' }, ...BUCKET_KINDS.map((k) => ({ id: k.id, label: k.label }))];

  $: visibleItems = (() => {
    const rows = Array.isArray($bucketItems) ? $bucketItems.slice() : [];
    const q = String(query || '').trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
      if (!q) return true;
      const blob = [r.name, r.address, r.notes].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(q);
    });
    if (sortMode === 'az') {
      filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    } else {
      filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return filtered;
  })();

  /* Per-kind counts so each tab can show how many items live in it.
     Computed once per render of the bucket so the chips don't
     animate on every keystroke. */
  $: kindCounts = (() => {
    const out = { all: 0 };
    for (const k of BUCKET_KINDS) out[k.id] = 0;
    for (const r of $bucketItems || []) {
      out.all += 1;
      if (out[r.kind] != null) out[r.kind] += 1;
    }
    return out;
  })();

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

  async function remove(item) {
    /* Snapshot before delete so Undo can restore via db.put(). */
    const snapshot = { ...item };
    await deleteBucketItem(item.id);
    pushToast({
      message: `Removed "${item.name}" from your bucket.`,
      undo: async () => {
        await db.bucketItems.put(snapshot);
      }
    });
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

{#if $bucketItems.length > 0}
  <!-- Filter / search / sort controls. Only render when there's
       something to filter so an empty bucket doesn't show a row
       of dead controls. -->
  <section class="max-w-[1080px] mx-auto px-6 pb-2">
    <div class="bucket-controls">
      <div class="bucket-tabs" role="tablist" aria-label="Filter by kind">
        {#each TABS as t}
          <button
            type="button"
            class="bucket-tab"
            class:is-active={kindFilter === t.id}
            on:click={() => (kindFilter = t.id)}
            role="tab"
            aria-selected={kindFilter === t.id}
          >
            {t.label}
            <span class="bucket-tab-count">{kindCounts[t.id] || 0}</span>
          </button>
        {/each}
      </div>
      <div class="bucket-tools">
        <label class="bucket-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"/>
            <path d="M20 20 L16.5 16.5"/>
          </svg>
          <input
            type="search"
            placeholder="Search the bucket..."
            bind:value={query}
            aria-label="Search bucket items"
          />
        </label>
        <label class="bucket-sort">
          <span class="bucket-sort-label">Sort</span>
          <select bind:value={sortMode} aria-label="Sort bucket items">
            <option value="newest">Newest first</option>
            <option value="az">A to Z</option>
          </select>
        </label>
      </div>
    </div>
  </section>
{/if}

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
  {:else if visibleItems.length === 0}
    <div class="empty-card">
      <h2 class="font-serif font-bold text-forest text-xl mb-2">No matches.</h2>
      <p class="font-serif italic text-muted mb-4">
        Try a different category or clear the search.
      </p>
      <button
        type="button"
        class="btn-primary"
        on:click={() => { kindFilter = 'all'; query = ''; }}
      >Clear filters</button>
    </div>
  {:else}
    <ul class="bucket-grid">
      {#each visibleItems as item (item.id)}
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
              on:click={() => remove(item)}
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

  /* Filter / search / sort row. Mirrors the Guide's events filter
     pattern: pill tabs for category, an inline search field, and
     a small sort dropdown. */
  .bucket-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding: 12px 14px;
    background: rgba(251, 246, 234, 0.6);
    border: 1px solid rgba(125, 58, 30, 0.18);
    border-radius: 6px;
  }
  .bucket-tabs {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
    flex: 1 1 auto;
  }
  .bucket-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1.5px solid rgba(125, 58, 30, 0.35);
    color: #5a4f3d;
    padding: 6px 12px;
    border-radius: 999px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
  }
  .bucket-tab:hover {
    background: rgba(125, 58, 30, 0.08);
    color: #0a2d21;
    border-color: #7d3a1e;
  }
  .bucket-tab.is-active {
    background: #7d3a1e;
    color: #fffdf6;
    border-color: #7d3a1e;
  }
  .bucket-tab-count {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 11px;
    opacity: 0.85;
  }
  .bucket-tools {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex: 0 1 auto;
  }
  .bucket-search {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #fffdf6;
    border: 1.5px solid rgba(139, 106, 58, 0.45);
    border-radius: 999px;
    padding: 5px 12px;
    color: #7d3a1e;
  }
  .bucket-search input {
    background: transparent;
    border: 0;
    outline: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 13.5px;
    color: #0a2d21;
    min-width: 0;
    width: 180px;
  }
  .bucket-search input::placeholder { color: rgba(90, 79, 61, 0.55); font-style: italic; }
  .bucket-sort {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .bucket-sort-label {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .bucket-sort select {
    background: #fffdf6;
    border: 1.5px solid rgba(139, 106, 58, 0.45);
    border-radius: 999px;
    padding: 5px 10px;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 13px;
    color: #0a2d21;
  }
  @media (max-width: 640px) {
    .bucket-search input { width: 140px; }
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
