<script>
  import Suitcase from '$lib/components/Suitcase.svelte';

  /* Scaffold sample trips. Real trips will come from IndexedDB
     (Dexie) in a later turn. Each trip carries a name, route summary
     and a leather color so the SVG suitcase can be tinted per trip. */
  const sampleTrips = [
    {
      id: 'muskoka-weekend',
      name: 'Muskoka Weekend',
      stops: 'Toronto Union, Gravenhurst, Bracebridge',
      duration: '2 days',
      color: '#7d3a1e',
      strap: '#5e2a14'
    },
    {
      id: 'fall-north-bay',
      name: 'Lakeside in North Bay',
      stops: 'Toronto Union, Washago, Huntsville, North Bay',
      duration: '4 days',
      color: '#c4860f',
      strap: '#7d4e0a'
    },
    {
      id: 'cochrane-winter',
      name: 'Cochrane in Winter',
      stops: 'Toronto Union, North Bay, Temiskaming, Cochrane',
      duration: '6 days',
      color: '#1f3d2d',
      strap: '#0a2d21'
    }
  ];

  function openTrip(id) {
    /* Route is not built yet - this is the scaffold. */
    console.log('open trip', id);
  }

  function newTrip() {
    console.log('new trip');
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
    Three suitcases, three journeys. Tap one to keep packing, or start a fresh trip from Toronto Union.
  </p>
</section>

<!-- ===== STATION PLATFORM (sample trips) ===== -->
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
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 items-end">
        {#each sampleTrips as trip, i}
          <button
            type="button"
            class="trunk relative bg-transparent border-0 cursor-pointer text-left p-0 group"
            data-i={i}
            on:click={() => openTrip(trip.id)}
            aria-label={`Open trip ${trip.name}`}
          >
            <div class="trunk-svg drop-shadow-[0_8px_14px_rgba(40,20,5,0.32)]">
              <Suitcase color={trip.color} strap={trip.strap} label={trip.duration} />
            </div>
            <div class="trunk-tag mt-[-12px] mx-auto bg-[#e8d6a8] border border-[#8b6a3a] rounded px-3 py-2 shadow-tag relative z-10 max-w-[180px]">
              <span class="block uppercase tracking-[0.2em] text-[9px] font-bold text-rust">Trip</span>
              <strong class="block font-serif font-bold text-forest text-base leading-tight">{trip.name}</strong>
              <span class="block font-serif italic text-muted text-xs mt-1 truncate">{trip.stops}</span>
            </div>
          </button>
        {/each}

        <!-- New Trip card - same shape but dashed and empty so it
             reads as an invitation, not an artefact. -->
        <button
          type="button"
          class="trunk-new relative bg-transparent border-0 cursor-pointer text-center p-0 group"
          on:click={newTrip}
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
            <span class="block font-serif italic text-muted text-xs mt-1">No credit card needed</span>
          </div>
        </button>
      </div>
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

<style>
  /* Slight rotation per trunk so the row reads as a real station
     platform with bags set down at different angles. The :nth-child
     selector indexes into the grid items so the New Trip card
     stays straight. */
  .trunk:nth-child(1) { transform: rotate(-3deg) translateY(8px); }
  .trunk:nth-child(2) { transform: translateY(-6px); }
  .trunk:nth-child(3) { transform: rotate(4deg) translateY(10px); }
  .trunk-tag {
    transform: rotate(-2deg);
    transition: transform 0.2s ease;
  }
  .trunk:hover .trunk-tag {
    transform: rotate(0deg) translateY(-2px);
  }
  .trunk:hover .trunk-svg {
    transform: translateY(-4px);
  }
  .trunk-svg {
    transition: transform 0.25s ease;
  }
</style>
