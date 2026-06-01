<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { trips, createTrip, LEATHER_COLORS } from '$lib/stores/trips.js';
  import { addBooking, BOOKING_KINDS } from '$lib/stores/bookings.js';
  import { addBucketItem, deleteBucketItem } from '$lib/stores/bucket.js';
  import Suitcase from '$lib/components/Suitcase.svelte';

  /* Payload parsed from the URL. Defaults are deliberately gentle:
     a missing name falls back to "From the Guide" so the booking is
     still salvageable. */
  let payload = {
    name: 'From the Guide',
    kind: 'other',
    stop: '',
    address: '',
    url: '',
    source: 'guide',
    bucketId: null
  };

  let loaded = false;
  let saving = false;
  let saved = false;
  let savedBucket = false;
  let pickedTripId = '';
  let newTripName = '';
  let pickerMode = 'existing'; // 'existing' | 'new'

  $: existingTrips = $trips || [];
  $: kindLabel = (BOOKING_KINDS.find((k) => k.id === payload.kind) || BOOKING_KINDS[4]).label;

  onMount(() => {
    const url = $page.url;
    const get = (k) => (url.searchParams.get(k) || '').trim();
    const bucketIdRaw = get('bucketId');
    payload = {
      name: get('name').slice(0, 120) || 'From the Guide',
      kind: normalizeKind(get('kind')),
      stop: get('stop'),
      address: get('address').slice(0, 240),
      url: get('url').slice(0, 240),
      source: get('source') || 'guide',
      bucketId: bucketIdRaw && /^\d+$/.test(bucketIdRaw) ? Number(bucketIdRaw) : null
    };
    loaded = true;
    /* Default to the most recently updated trip; if there are none
       the picker auto-switches to "create new" with a sensible
       initial name. */
    if (existingTrips.length > 0) {
      pickedTripId = existingTrips[0].id;
    } else {
      pickerMode = 'new';
      newTripName = payload.stop ? `Trip to ${prettyStop(payload.stop)}` : 'My Northlander Trip';
    }
  });

  function normalizeKind(k) {
    return BOOKING_KINDS.some((b) => b.id === k) ? k : 'other';
  }

  function prettyStop(id) {
    /* The Guide uses lowercase ids like 'northbay'. Capitalise the
       first letter for the suggested trip name. */
    return String(id || '').replace(/(^|\s)\w/g, (c) => c.toUpperCase());
  }

  async function handleSave() {
    if (saving) return;
    saving = true;
    let tripId = pickedTripId;
    try {
      if (pickerMode === 'new' || !tripId) {
        const trimmed = (newTripName || '').trim() || 'My Northlander Trip';
        const t = await createTrip({ name: trimmed, colorId: LEATHER_COLORS[0].id });
        tripId = t.id;
      }
      const title = payload.address
        ? `${payload.name} - ${payload.address}`
        : payload.name;
      await addBooking(tripId, {
        title,
        kind: payload.kind,
        stopId: payload.stop || null
      });
      /* If this came from the bucket list, remove the wishlist row
         so the same place doesn't show up in both places. */
      if (payload.bucketId != null) {
        await deleteBucketItem(payload.bucketId);
      }
      saved = true;
      setTimeout(() => goto(`/trips/${tripId}`), 600);
    } catch (err) {
      console.error(err);
      saving = false;
    }
  }

  async function handleSaveForLater() {
    if (saving) return;
    saving = true;
    try {
      await addBucketItem({
        name: payload.name,
        kind: payload.kind,
        stopId: payload.stop || null,
        address: payload.address || null,
        url: payload.url || null,
        source: payload.source || 'guide'
      });
      savedBucket = true;
      setTimeout(() => goto('/bucket'), 600);
    } catch (err) {
      console.error(err);
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Add to a trip - Northlander.app</title>
</svelte:head>

<section class="max-w-[640px] mx-auto px-6 pt-10 pb-20">
  <div class="kicker mb-1">From the Guide</div>
  <h1 class="font-serif font-black text-forest text-[clamp(2rem,5vw,2.8rem)] leading-[1.05]">
    Drop this into a suitcase
  </h1>
  <p class="font-serif italic text-rust mt-2">
    NorthlanderGuide.com handed you this place. Pick the trip you want it in.
  </p>

  {#if loaded}
    <!-- Payload preview card -->
    <article class="mt-6 bg-cream border-l-4 border-rust shadow-ticket p-5">
      <div class="kicker">{kindLabel}</div>
      <h2 class="font-serif font-bold text-forest text-2xl mt-1">{payload.name}</h2>
      {#if payload.address}
        <p class="font-serif italic text-muted text-sm mt-1">{payload.address}</p>
      {/if}
      {#if payload.stop}
        <p class="font-serif text-sm text-ink/80 mt-2">
          Spotted at <strong class="capitalize">{prettyStop(payload.stop)}</strong> on the Guide.
        </p>
      {/if}
      {#if payload.url}
        <a
          href={payload.url}
          target="_blank"
          rel="noopener"
          class="inline-block mt-2 text-rust hover:text-forest text-sm font-semibold"
        >Open on the Guide &rarr;</a>
      {/if}
    </article>

    <!-- Trip picker -->
    <section class="mt-8">
      <span class="kicker block mb-3">Add to which suitcase?</span>

      {#if existingTrips.length > 0}
        <div class="picker-options">
          {#each existingTrips as t}
            <label class="picker-row" class:is-on={pickerMode === 'existing' && pickedTripId === t.id}>
              <input
                type="radio"
                name="trip-pick"
                value={t.id}
                class="sr-only"
                bind:group={pickedTripId}
                on:change={() => (pickerMode = 'existing')}
              />
              <div class="picker-suitcase">
                <Suitcase color={t.color} strap={t.strap} label="" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-serif font-bold text-forest text-lg leading-tight">{t.name}</div>
                <div class="kicker text-muted mt-0.5">
                  {t.stopIds && t.stopIds.length > 0 ? `${t.stopIds.length} stops` : 'No stops yet'}
                </div>
              </div>
            </label>
          {/each}

          <label class="picker-row picker-new" class:is-on={pickerMode === 'new'}>
            <input
              type="radio"
              name="trip-pick"
              value="__new__"
              class="sr-only"
              checked={pickerMode === 'new'}
              on:change={() => {
                pickerMode = 'new';
                if (!newTripName) newTripName = payload.stop ? `Trip to ${prettyStop(payload.stop)}` : 'My Northlander Trip';
              }}
            />
            <div class="picker-plus" aria-hidden="true">+</div>
            <div class="flex-1 min-w-0">
              <div class="font-serif font-bold text-forest text-lg leading-tight">Start a new trip</div>
              {#if pickerMode === 'new'}
                <input
                  type="text"
                  bind:value={newTripName}
                  maxlength="60"
                  placeholder="Trip name"
                  class="picker-new-input mt-1"
                />
              {:else}
                <div class="kicker text-muted mt-0.5">A fresh suitcase for this place</div>
              {/if}
            </div>
          </label>
        </div>
      {:else}
        <p class="font-serif italic text-muted mb-3">
          No suitcases yet. We'll tag one for you.
        </p>
        <label class="block">
          <span class="kicker block mb-1">Trip name</span>
          <input
            type="text"
            bind:value={newTripName}
            maxlength="60"
            placeholder="My Northlander Trip"
            class="picker-new-input"
          />
        </label>
      {/if}
    </section>

    <!-- Actions -->
    <div class="mt-8 flex flex-wrap items-center justify-between gap-4">
      <a href="/" class="font-serif italic text-muted hover:text-rust">Cancel</a>
      <div class="flex flex-wrap items-center gap-3 ml-auto">
        {#if payload.bucketId == null}
          <!-- Save-for-someday is hidden when the visit STARTED at the
               bucket list - we'd just push it back into the bucket. -->
          <button
            type="button"
            class="save-later"
            on:click={handleSaveForLater}
            disabled={saving || saved || savedBucket}
            title="Save to your bucket list instead of a trip"
          >
            {#if savedBucket}
              Saved
            {:else}
              Save for someday
            {/if}
          </button>
        {/if}
        <button
          type="button"
          class="btn-primary disabled:opacity-50"
          on:click={handleSave}
          disabled={saving || saved || savedBucket || (pickerMode === 'new' && !(newTripName || '').trim())}
        >
          {#if saved}
            Stowed
          {:else if saving}
            Stowing...
          {:else}
            Stow in suitcase
          {/if}
        </button>
      </div>
    </div>
  {/if}
</section>

<style>
  .picker-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .picker-row {
    display: grid;
    grid-template-columns: 60px 1fr;
    align-items: center;
    gap: 16px;
    padding: 12px 14px;
    background: #fbf6ea;
    border: 2px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, transform 0.15s;
  }
  .picker-row:hover {
    border-color: #7d3a1e;
  }
  .picker-row.is-on {
    border-color: #0a2d21;
    background: rgba(201, 168, 76, 0.15);
  }
  .picker-suitcase {
    width: 60px;
  }
  .picker-plus {
    width: 56px;
    height: 44px;
    border: 2px dashed #7d3a1e;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 28px;
    color: #7d3a1e;
    line-height: 1;
  }
  .picker-new-input {
    width: 100%;
    background: #fffdf6;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 6px 10px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 0.95rem;
    color: #0a2d21;
    outline: none;
  }
  .picker-new-input:focus {
    border-color: #7d3a1e;
  }

  .save-later {
    background: transparent;
    border: 2px dashed #7d3a1e;
    color: #7d3a1e;
    padding: 0.65rem 1.1rem;
    border-radius: 4px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 0.92rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .save-later:hover:not(:disabled) {
    background: #7d3a1e;
    color: #f5f0e8;
    border-style: solid;
  }
  .save-later:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
