<script>
  import Suitcase from '$lib/components/Suitcase.svelte';
  import NewTripModal from '$lib/components/NewTripModal.svelte';
  import { trips } from '$lib/stores/trips.js';

  let showNewModal = false;

  /* Stable per-card rotation so trips always sit at the same angle
     regardless of how many other trips share the platform. Cycle
     through six values keyed by index. */
  const tilts = [-3, 0, 4, -2, 3, -4];
  const offsets = [8, -6, 10, 4, -4, 6];

  function summarize(stopIds) {
    if (!stopIds || stopIds.length === 0) return 'No stops yet';
    if (stopIds.length === 1) return `${stopIds.length} stop`;
    return `${stopIds.length} stops`;
  }
</script>

<svelte:head>
  <title>Northlander.app: Pack your Northern Ontario train trip</title>
  <meta
    name="description"
    content="Pack your Northlander train trip into one suitcase. Route, stops, packing list, bookings and itinerary, available offline."
  />
</svelte:head>

<!-- ===== HERO ===== -->
<section class="px-6 pt-12 pb-6 max-w-[1080px] mx-auto text-center md:text-left">
  <div class="kicker">Your Northlander Suitcases</div>
  <h1 class="font-serif font-black text-forest text-[clamp(2.2rem,6vw,3.6rem)] leading-[1.02] tracking-tight mt-2">
    Pack a <em class="italic text-rust font-medium">trip</em>. Open it anywhere.
  </h1>
  <p class="font-serif italic text-rust text-[clamp(1rem,1.6vw,1.3rem)] mt-4 max-w-[42ch] mx-auto md:mx-0">
    {#if $trips.length === 0}
      Tag your first suitcase. Pack stops, packing items and bookings into one place that works offline.
    {:else if $trips.length === 1}
      One suitcase ready. Tap it to keep packing, or start a fresh trip from Toronto Union.
    {:else}
      {$trips.length} suitcases ready. Tap one to keep packing, or start a fresh trip from Toronto Union.
    {/if}
  </p>
</section>

<!-- ===== STATION PLATFORM ===== -->
<section class="relative mt-6 overflow-hidden">
  <!-- Warm kraft paper band, same texture as the /plan scrapbook so
       the app reads as a sibling of the Guide. -->
  <div class="relative bg-gradient-to-b from-[#ede0cc] to-[#e3d2b3] bg-linen border-t-[3px] border-b-[3px] border-forest">
    <!-- platform planks at the bottom for that station-floor feel -->
    <div
      class="absolute left-0 right-0 bottom-0 h-8 border-t-2 border-[#5a3920]"
      style="background-image: repeating-linear-gradient(90deg, #6b4528 0 90px, #5a3920 90px 91px, #6b4528 91px 180px);"
      aria-hidden="true"
    ></div>

    <div class="relative z-10 max-w-[1080px] mx-auto px-6 pt-14 pb-20">
      {#if $trips.length === 0}
        <!-- Welcoming empty state. One big invitation card so the
             user has nothing else to do but tag a trip. -->
        <div class="flex justify-center">
          <button
            type="button"
            class="trunk-new relative bg-transparent border-0 cursor-pointer text-center p-0 group max-w-[280px]"
            on:click={() => (showNewModal = true)}
            aria-label="Start your first trip"
          >
            <div class="aspect-[10/8] flex items-center justify-center rounded-xl border-[2.5px] border-dashed border-forest bg-cream/60 transition-colors group-hover:bg-cream group-hover:border-rust">
              <div class="text-center px-4">
                <div class="font-serif font-black text-forest text-[56px] leading-none mb-3">+</div>
                <div class="font-serif italic text-rust text-lg">Start your first trip</div>
              </div>
            </div>
            <div class="trunk-tag mt-3 mx-auto bg-[#e8d6a8] border border-[#8b6a3a] rounded px-3 py-2 shadow-tag max-w-[200px]">
              <span class="block uppercase tracking-[0.2em] text-[9px] font-bold text-rust">Welcome aboard</span>
              <strong class="block font-serif font-bold text-forest text-base leading-tight">Tag a suitcase</strong>
              <span class="block font-serif italic text-muted text-xs mt-1">Free, no credit card</span>
            </div>
          </button>
        </div>
      {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 items-end">
          {#each $trips as trip, i (trip.id)}
            <a
              href={`/trips/${trip.id}`}
              class="trunk relative block no-underline text-left group"
              style="--rot:{tilts[i % tilts.length]}deg; --y:{offsets[i % offsets.length]}px"
            >
              <div class="trunk-svg drop-shadow-[0_8px_14px_rgba(40,20,5,0.32)]">
                <Suitcase color={trip.color} strap={trip.strap} label="" />
              </div>
              <div class="trunk-tag mt-[-12px] mx-auto bg-[#e8d6a8] border border-[#8b6a3a] rounded px-3 py-2 shadow-tag relative z-10 max-w-[180px]">
                <span class="block uppercase tracking-[0.2em] text-[9px] font-bold text-rust">Trip</span>
                <strong class="block font-serif font-bold text-forest text-base leading-tight">{trip.name}</strong>
                <span class="block font-serif italic text-muted text-xs mt-1">{summarize(trip.stopIds)}</span>
              </div>
            </a>
          {/each}

          <!-- New Trip slot at the end of the row -->
          <button
            type="button"
            class="trunk-new relative bg-transparent border-0 cursor-pointer text-center p-0 group"
            on:click={() => (showNewModal = true)}
            aria-label="Start a new trip"
          >
            <div class="aspect-[10/8] flex items-center justify-center rounded-xl border-[2.5px] border-dashed border-forest bg-cream/40 transition-colors group-hover:bg-cream group-hover:border-rust">
              <div class="text-center">
                <div class="font-serif font-black text-forest text-[44px] leading-none mb-2">+</div>
                <div class="font-serif italic text-rust text-base">New trip</div>
              </div>
            </div>
            <div class="trunk-tag mt-3 mx-auto bg-[#e8d6a8] border border-[#8b6a3a] rounded px-3 py-2 shadow-tag max-w-[180px]">
              <span class="block uppercase tracking-[0.2em] text-[9px] font-bold text-rust">Open</span>
              <strong class="block font-serif font-bold text-forest text-base leading-tight">Start packing</strong>
              <span class="block font-serif italic text-muted text-xs mt-1">Free, no credit card</span>
            </div>
          </button>
        </div>
      {/if}
    </div>
  </div>
</section>

<!-- ===== HOW IT WORKS QUICK PITCH ===== -->
<section class="max-w-[1080px] mx-auto px-6 mt-16">
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <article class="border-l-4 border-rust pl-5 py-2">
      <div class="kicker mb-1">01</div>
      <h3 class="font-serif font-bold text-forest text-lg mb-1">Browse the Guide</h3>
      <p class="font-serif text-base text-ink/85 leading-snug">Find your stops, restaurants and events on NorthlanderGuide.com. Tap the plus to drop them in your suitcase.</p>
    </article>
    <article class="border-l-4 border-rust pl-5 py-2">
      <div class="kicker mb-1">02</div>
      <h3 class="font-serif font-bold text-forest text-lg mb-1">Pack your bag</h3>
      <p class="font-serif text-base text-ink/85 leading-snug">Add packing items, check off bookings, set a budget. Boarding and arrival times appear automatically.</p>
    </article>
    <article class="border-l-4 border-rust pl-5 py-2">
      <div class="kicker mb-1">03</div>
      <h3 class="font-serif font-bold text-forest text-lg mb-1">Take it with you</h3>
      <p class="font-serif text-base text-ink/85 leading-snug">Your trip lives on your phone. Works offline. Edits sync when you're back in signal.</p>
    </article>
  </div>
</section>

{#if showNewModal}
  <NewTripModal on:close={() => (showNewModal = false)} />
{/if}

<style>
  /* Per-trip rotation/offset driven by CSS variables set inline.
     Each trip card stays at the same angle regardless of how many
     siblings join or leave the platform. The hover state lifts the
     trunk slightly and straightens the tag like you're picking it up. */
  .trunk {
    transform: rotate(var(--rot, 0deg)) translateY(var(--y, 0px));
  }
  .trunk-tag {
    transform: rotate(-2deg);
    transition: transform 0.2s ease;
  }
  .trunk:hover .trunk-tag {
    transform: rotate(0deg) translateY(-2px);
  }
  .trunk-svg {
    transition: transform 0.25s ease;
  }
  .trunk:hover .trunk-svg {
    transform: translateY(-4px);
  }
</style>
