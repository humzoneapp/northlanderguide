<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import Suitcase from '$lib/components/Suitcase.svelte';
  import RouteList from '$lib/components/RouteList.svelte';
  import ScheduleStrip from '$lib/components/ScheduleStrip.svelte';
  import StopPickerModal from '$lib/components/StopPickerModal.svelte';
  import PackingList from '$lib/components/PackingList.svelte';
  import BookingChecklist from '$lib/components/BookingChecklist.svelte';
  import TravelDiary from '$lib/components/TravelDiary.svelte';
  import EventsAlongRoute from '$lib/components/EventsAlongRoute.svelte';
  import ShareModal from '$lib/components/ShareModal.svelte';
  import {
    getTrip,
    renameTrip,
    changeTripColor,
    updateTrip,
    deleteTrip,
    LEATHER_COLORS
  } from '$lib/stores/trips.js';

  /** @type {{ id: string, name: string, color: string, strap: string, colorId?: string, stopIds?: string[] } | null} */
  let trip = null;
  let loading = true;
  let editingName = false;
  let nameDraft = '';
  let confirmingDelete = false;
  let showStopPicker = false;
  let showShareModal = false;

  /** @type {HTMLInputElement | undefined} */
  let nameInput;

  $: tripId = $page.params.id;

  onMount(load);

  async function load() {
    loading = true;
    trip = (await getTrip(tripId)) || null;
    loading = false;
  }

  function startRename() {
    if (!trip) return;
    nameDraft = trip.name;
    editingName = true;
    /* let the input render before focusing */
    queueMicrotask(() => nameInput?.focus());
  }

  async function saveRename() {
    if (!trip) return;
    const next = nameDraft.trim();
    editingName = false;
    if (!next || next === trip.name) return;
    const updated = await renameTrip(trip.id, next);
    if (updated) trip = updated;
  }

  function cancelRename() {
    editingName = false;
    nameDraft = '';
  }

  async function pickColor(colorId) {
    if (!trip) return;
    const updated = await changeTripColor(trip.id, colorId);
    if (updated) trip = updated;
  }

  async function handleDelete() {
    if (!trip) return;
    const id = trip.id;
    await deleteTrip(id);
    await goto('/');
  }

  async function saveStops(event) {
    if (!trip) return;
    const stopIds = event.detail.stopIds || [];
    const updated = await updateTrip(trip.id, { stopIds });
    if (updated) trip = updated;
    showStopPicker = false;
  }
</script>

<svelte:head>
  <title>{trip ? trip.name + ' - Northlander' : 'Trip - Northlander'}</title>
</svelte:head>

{#if loading}
  <div class="max-w-[860px] mx-auto px-6 py-16 text-center font-serif italic text-muted">
    Standing by at the platform...
  </div>
{:else if !trip}
  <!-- ===== Trip not found ===== -->
  <section class="max-w-[640px] mx-auto px-6 py-20 text-center">
    <div class="kicker">Hmm.</div>
    <h1 class="font-serif font-black text-forest text-[clamp(2rem,5vw,3rem)] leading-[1.05] mt-3">
      That suitcase has left the station.
    </h1>
    <p class="font-serif italic text-rust mt-3">
      We couldn't find a trip at this address. It may have been deleted on another device.
    </p>
    <a href="/" class="btn-primary mt-6">Back to your platform</a>
  </section>
{:else}
  <!-- ===== Breadcrumb ===== -->
  <nav class="max-w-[1080px] mx-auto px-6 pt-6 text-[11px] uppercase tracking-[0.18em] font-bold text-muted">
    <a href="/" class="text-muted hover:text-rust no-underline">Platform</a>
    <span class="mx-2 text-rust">/</span>
    <span class="text-ink">{trip.name}</span>
  </nav>

  <!-- ===== Trip hero ===== -->
  <section class="max-w-[1080px] mx-auto px-6 pt-6 pb-10">
    <div class="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-10 items-center">
      <!-- Suitcase visual -->
      <div class="mx-auto md:mx-0 max-w-[240px]">
        <Suitcase color={trip.color} strap={trip.strap} label="" />
      </div>

      <!-- Editable trip name + color picker -->
      <div>
        <div class="kicker mb-2">Trip Suitcase</div>

        {#if editingName}
          <form on:submit|preventDefault={saveRename} class="flex flex-wrap items-center gap-3">
            <input
              bind:this={nameInput}
              bind:value={nameDraft}
              type="text"
              maxlength="60"
              class="font-serif font-black text-forest text-[clamp(1.8rem,4vw,2.6rem)] bg-transparent border-b-2 border-rust focus:outline-none focus:border-forest flex-1 min-w-[200px]"
              on:blur={saveRename}
              on:keydown={(e) => e.key === 'Escape' && cancelRename()}
            />
            <span class="text-muted text-xs font-serif italic">Enter to save</span>
          </form>
        {:else}
          <button
            type="button"
            on:click={startRename}
            class="text-left bg-transparent border-0 p-0 cursor-pointer group"
            aria-label="Rename trip"
          >
            <h1 class="font-serif font-black text-forest text-[clamp(2rem,5vw,3rem)] leading-[1.02] group-hover:text-rust transition-colors">
              {trip.name}
            </h1>
            <span class="kicker text-muted/70 group-hover:text-rust">Tap to rename</span>
          </button>
        {/if}

        <div class="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span class="kicker block mb-2">Leather</span>
            <div class="flex flex-wrap gap-3">
              {#each LEATHER_COLORS as c}
                <button
                  type="button"
                  class="pl-swatch group relative w-10 h-10 rounded-full border-2 transition"
                  class:is-selected={trip.colorId === c.id}
                  style="background:{c.body};border-color:{trip.colorId === c.id ? c.strap : 'transparent'}"
                  on:click={() => pickColor(c.id)}
                  aria-label={c.name}
                  aria-pressed={trip.colorId === c.id}
                ></button>
              {/each}
            </div>
          </div>
          <button
            type="button"
            class="btn-primary flex items-center gap-2"
            on:click={() => (showShareModal = true)}
            aria-label="Share your trip as a poster"
          >
            <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            <span>Share trip</span>
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- ===== Trip contents ===== -->
  <section class="max-w-[1080px] mx-auto px-6">
    <div class="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-6">
      <!-- Route -->
      <article class="bg-cream border-l-4 border-rust p-5 shadow-ticket">
        <div class="flex items-center justify-between mb-2 gap-3">
          <div>
            <div class="kicker mb-1">Route</div>
            <h3 class="font-serif font-bold text-forest text-xl">Stops on this trip</h3>
          </div>
          <button
            type="button"
            on:click={() => (showStopPicker = true)}
            class="font-serif italic text-rust hover:text-forest text-sm whitespace-nowrap underline decoration-dashed underline-offset-4"
          >
            {trip.stopIds && trip.stopIds.length > 0 ? 'Change stops' : 'Add stops'}
          </button>
        </div>
        <ScheduleStrip {trip} on:update={(e) => (trip = e.detail)} />
        <RouteList
          stopIds={trip.stopIds || []}
          departureDate={trip.departureDate || null}
          direction={trip.direction || 'northbound'}
        />
      </article>

      <!-- Right column: Packing + Bookings stacked -->
      <div class="grid grid-cols-1 gap-6">
        <article class="bg-cream border-l-4 border-rust p-5 shadow-ticket">
          <PackingList tripId={trip.id} />
        </article>

        <article class="bg-cream border-l-4 border-rust p-5 shadow-ticket">
          <BookingChecklist tripId={trip.id} />
        </article>
      </div>
    </div>
  </section>

  <!-- ===== Journey: travel diary ===== -->
  <section class="max-w-[1080px] mx-auto px-6 mt-8">
    <article class="bg-cream border-l-4 border-rust p-5 shadow-ticket">
      <TravelDiary tripId={trip.id} stopIds={trip.stopIds || []} />
    </article>
  </section>

  <!-- ===== Events along your route ===== -->
  <section class="max-w-[1080px] mx-auto px-6 mt-8">
    <article class="bg-cream border-l-4 border-rust p-5 shadow-ticket">
      <EventsAlongRoute
        tripId={trip.id}
        stopIds={trip.stopIds || []}
        departureDate={trip.departureDate || null}
      />
    </article>
  </section>

  {#if showStopPicker}
    <StopPickerModal
      selected={trip.stopIds || []}
      direction={trip.direction || 'northbound'}
      on:save={saveStops}
      on:close={() => (showStopPicker = false)}
    />
  {/if}

  {#if showShareModal}
    <ShareModal {trip} on:close={() => (showShareModal = false)} />
  {/if}

  <!-- ===== Danger zone ===== -->
  <section class="max-w-[1080px] mx-auto px-6 mt-12 mb-20">
    <div class="border-t border-dashed border-[#8b6a3a]/40 pt-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="kicker text-muted mb-1">Danger zone</div>
        <p class="font-serif italic text-muted">Deleting a suitcase removes its packing list, bookings and notes. There's no undo.</p>
      </div>
      {#if confirmingDelete}
        <div class="flex items-center gap-3">
          <button
            type="button"
            on:click={() => (confirmingDelete = false)}
            class="font-serif italic text-muted hover:text-rust text-sm"
          >Cancel</button>
          <button
            type="button"
            on:click={handleDelete}
            class="btn-primary"
            style="background:#5e2a14;border-color:#5e2a14"
          >Yes, delete the suitcase</button>
        </div>
      {:else}
        <button
          type="button"
          on:click={() => (confirmingDelete = true)}
          class="font-serif font-semibold text-rust hover:text-forest"
        >Delete this trip</button>
      {/if}
    </div>
  </section>
{/if}

<style>
  .pl-swatch:hover {
    transform: translateY(-2px);
  }
  .pl-swatch.is-selected {
    box-shadow: 0 0 0 3px #c9a84c, 0 6px 12px rgba(40, 20, 5, 0.25);
  }
</style>
