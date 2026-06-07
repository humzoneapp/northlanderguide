<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { db, trips, listTrips, createTrip, LEATHER_COLORS } from '$lib/stores/trips.js';
  import { decodePayload } from '$lib/utils/share-link.js';
  import { getStop } from '$lib/data/stops.js';
  import { arrivalClock, departureFor, formatTripDate, DIRECTIONS } from '$lib/data/schedule.js';
  import Suitcase from '$lib/components/Suitcase.svelte';

  let loaded = false;
  let valid = false;
  let importing = false;
  let imported = false;

  /** @type {ReturnType<typeof import('$lib/utils/share-link.js').buildSharePayload> | null} */
  let payload = null;

  $: trip = payload?.trip || null;
  /* Prefer the dated `stops` shape when the share payload carries
     it (2026-06-07 forward). Falls back to the legacy `stopIds`
     for trips shared before the route + dates landed in the
     payload. */
  $: stops = (() => {
    if (!trip) return [];
    if (Array.isArray(trip.stops) && trip.stops.length > 0) {
      return trip.stops.map((e) => getStop(e.stopId)).filter(Boolean);
    }
    return (trip.stopIds || []).map((id) => getStop(id)).filter(Boolean);
  })();
  $: returnStops = (() => {
    if (!trip) return [];
    if (Array.isArray(trip.returnStops) && trip.returnStops.length > 0) {
      return trip.returnStops.map((e) => getStop(e.stopId)).filter(Boolean);
    }
    if (trip.returnStopId && trip.returnDate) {
      const s = getStop(trip.returnStopId);
      return s ? [s] : [];
    }
    return [];
  })();
  $: direction = (trip?.direction === 'southbound') ? 'southbound' : 'northbound';
  $: directionMeta = DIRECTIONS.find((d) => d.id === direction) || DIRECTIONS[0];
  $: depClock = departureFor(direction);
  $: counts = payload
    ? {
        stops: stops.length,
        packing: payload.packing.length,
        bookings: payload.bookings.length,
        diary: payload.diary.length,
        budget: payload.budget.length
      }
    : null;

  onMount(async () => {
    const token = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#/, '');
    if (!token) {
      loaded = true;
      return;
    }
    const decoded = await decodePayload(token);
    if (decoded && decoded.trip && Array.isArray(decoded.trip.stopIds || [])) {
      payload = decoded;
      valid = true;
    }
    loaded = true;
  });

  async function handleImport() {
    if (importing || !valid || !payload) return;
    importing = true;
    try {
      const srcTrip = payload.trip;
      const palette = LEATHER_COLORS.find((c) => c.id === srcTrip.colorId) || LEATHER_COLORS[0];
      /* The originator's name might collide with an existing suitcase
         on this device. createTrip + uniqueTripSlug handle the slug
         side; we hint the name too so the user can tell two apart in
         the dashboard. */
      const baseName = String(srcTrip.name || 'Shared trip').trim() || 'Shared trip';
      const existing = await listTrips();
      const usedNames = new Set(existing.map((t) => t.name));
      const name = usedNames.has(baseName) ? `${baseName} (shared)` : baseName;

      const created = await createTrip({ name, colorId: palette.id });

      /* Carry over the trip's route + departure metadata. createTrip
         only seeds name + color, so this second pass widens it.
         Includes the dated `stops` + multi-stop `returnStops` shapes
         (2026-06-07 forward) AND the legacy mirrors so older
         readers in the recipient's app keep working. */
      const stopsArr = Array.isArray(srcTrip.stops) && srcTrip.stops.length > 0
        ? srcTrip.stops
            .filter((s) => s && s.stopId)
            .map((s) => ({ stopId: String(s.stopId), date: s.date || '' }))
        : [];
      const returnStopsArr = Array.isArray(srcTrip.returnStops) && srcTrip.returnStops.length > 0
        ? srcTrip.returnStops
            .filter((s) => s && s.stopId)
            .map((s) => ({ stopId: String(s.stopId), date: s.date || '' }))
        : srcTrip.returnDate && srcTrip.returnStopId
          ? [{ stopId: String(srcTrip.returnStopId), date: srcTrip.returnDate }]
          : [];
      const stopIdsArr = stopsArr.length > 0
        ? stopsArr.map((s) => s.stopId)
        : (Array.isArray(srcTrip.stopIds) ? srcTrip.stopIds.slice() : []);
      const mirroredReturn = returnStopsArr[returnStopsArr.length - 1] || null;
      await db.trips.update(created.id, {
        stops: stopsArr,
        stopIds: stopIdsArr,
        returnStops: returnStopsArr,
        returnDate: mirroredReturn?.date || srcTrip.returnDate || null,
        returnStopId: mirroredReturn?.stopId || srcTrip.returnStopId || null,
        departureDate: srcTrip.departureDate || (stopsArr[0]?.date || null),
        direction: srcTrip.direction === 'southbound' ? 'southbound' : 'northbound',
        defaultPackingListName: srcTrip.defaultPackingListName || null,
        extraPackingLists: Array.isArray(srcTrip.extraPackingLists) ? srcTrip.extraPackingLists.slice() : [],
        budgetTarget: Number.isFinite(srcTrip.budgetTarget) ? Number(srcTrip.budgetTarget) : null,
        updatedAt: Date.now()
      });

      const now = Date.now();

      /* Bulk-insert child rows. Each row is stamped with the new
         tripId and a fresh updatedAt; createdAt is preserved on diary
         and budget rows so recap chronology survives the round-trip. */
      if (payload.packing.length) {
        await db.packingItems.bulkAdd(
          payload.packing.map((r) => ({
            tripId: created.id,
            name: String(r.name || '').trim() || 'Item',
            packed: !!r.packed,
            listName: r.listName || null,
            createdAt: now,
            updatedAt: now
          }))
        );
      }
      if (payload.bookings.length) {
        await db.bookings.bulkAdd(
          payload.bookings.map((r) => ({
            tripId: created.id,
            title: String(r.title || '').trim() || 'Booking',
            kind: r.kind || 'other',
            status: r.status === 'booked' ? 'booked' : 'pending',
            dueDate: r.dueDate || null,
            stopId: r.stopId || null,
            startTime: r.startTime || null,
            checkIn: r.checkIn || null,
            checkOut: r.checkOut || null,
            address: r.address || null,
            contact: r.contact || null,
            confirmation: r.confirmation || null,
            notes: r.notes || null,
            createdAt: now,
            updatedAt: now
          }))
        );
      }
      if (payload.diary.length) {
        await db.diaryEntries.bulkAdd(
          payload.diary.map((r) => ({
            tripId: created.id,
            text: String(r.text || ''),
            stopId: r.stopId || null,
            createdAt: Number(r.createdAt) || now,
            updatedAt: now
          }))
        );
      }
      if (payload.budget.length) {
        await db.budgetEntries.bulkAdd(
          payload.budget.map((r) => ({
            tripId: created.id,
            label: String(r.label || '').trim() || 'Entry',
            amount: Number(r.amount) || 0,
            category: r.category || 'other',
            stopId: r.stopId || null,
            spentDate: r.spentDate || null,
            createdAt: Number(r.createdAt) || now,
            updatedAt: now
          }))
        );
      }

      trips.set(await listTrips());
      imported = true;
      setTimeout(() => goto(`/trips/${created.id}`), 700);
    } catch (err) {
      console.error(err);
      importing = false;
    }
  }

  function clockAt(stop) {
    return arrivalClock(stop.offsetMinutes, depClock, direction);
  }
</script>

<svelte:head>
  <title>A shared trip - Northlander.app</title>
</svelte:head>

<section class="max-w-[720px] mx-auto px-6 pt-10 pb-20">
  {#if !loaded}
    <p class="font-serif italic text-muted">Unpacking the suitcase...</p>
  {:else if !valid}
    <div class="kicker mb-1">Hmm</div>
    <h1 class="font-serif font-black text-forest text-[clamp(2rem,5vw,2.6rem)] leading-[1.05]">
      That link didn't decode.
    </h1>
    <p class="font-serif italic text-rust mt-2">
      Shared trip links carry the whole trip in the URL. Ask the sender to copy and paste it again - sometimes a chat app trims it.
    </p>
    <a href="/" class="btn-primary inline-block mt-6">Back to your suitcases</a>
  {:else}
    <div class="kicker mb-1">A shared trip</div>
    <h1 class="font-serif font-black text-forest text-[clamp(2rem,5vw,2.8rem)] leading-[1.05]">
      Someone sent you a route.
    </h1>
    <p class="font-serif italic text-rust mt-2">
      Take a look. If it fits, drop the whole thing into your own suitcases.
    </p>

    <article class="share-card mt-6">
      <header class="share-card-head">
        <div class="share-card-suitcase">
          <Suitcase color={trip.color || '#7d3a1e'} strap={trip.strap || '#5e2a14'} label="" />
        </div>
        <div class="min-w-0">
          <h2 class="font-serif font-bold text-forest text-2xl leading-tight truncate">{trip.name || 'Untitled trip'}</h2>
          <p class="font-serif italic text-rust text-sm mt-0.5">
            {directionMeta.from} to {directionMeta.to}
          </p>
          {#if trip.departureDate}
            <p class="font-serif text-sm text-ink/80 mt-1">{formatTripDate(trip.departureDate)}</p>
          {/if}
        </div>
      </header>

      {#if stops.length > 0}
        <div class="share-route">
          <span class="kicker">The Route</span>
          <ol class="share-stops">
            {#each stops as s, i}
              <li>
                <span class="share-stop-num">{i + 1}</span>
                <span class="share-stop-name">{s.name}</span>
                <span class="share-stop-clock">{clockAt(s)}</span>
              </li>
            {/each}
          </ol>
        </div>
      {/if}

      <div class="share-stats">
        {#if counts.bookings > 0}
          <span class="share-stat"><strong>{counts.bookings}</strong> plan{counts.bookings === 1 ? '' : 's'}</span>
        {/if}
        {#if counts.packing > 0}
          <span class="share-stat"><strong>{counts.packing}</strong> packing</span>
        {/if}
        {#if counts.budget > 0}
          <span class="share-stat"><strong>{counts.budget}</strong> budget</span>
        {/if}
        {#if counts.diary > 0}
          <span class="share-stat"><strong>{counts.diary}</strong> note{counts.diary === 1 ? '' : 's'}</span>
        {/if}
        {#if counts.bookings + counts.packing + counts.budget + counts.diary === 0}
          <span class="share-stat italic text-muted">Just the route - nothing else packed yet</span>
        {/if}
      </div>

      <p class="font-serif italic text-muted text-sm mt-4">
        Photos stay private on the sender's device, so they don't travel with the link.
      </p>
    </article>

    <div class="mt-8 flex flex-wrap items-center justify-between gap-4">
      <a href="/" class="font-serif italic text-muted hover:text-rust">Not now</a>
      <button
        type="button"
        class="btn-primary disabled:opacity-50"
        on:click={handleImport}
        disabled={importing || imported}
      >
        {#if imported}
          Stowed
        {:else if importing}
          Stowing...
        {:else}
          Add to my suitcases
        {/if}
      </button>
    </div>
  {/if}
</section>

<style>
  .share-card {
    background: #fbf6ea;
    border-left: 4px solid #7d3a1e;
    box-shadow: 0 12px 28px rgba(40, 30, 15, 0.18);
    padding: 20px 22px 22px;
  }
  .share-card-head {
    display: grid;
    grid-template-columns: 60px 1fr;
    align-items: center;
    gap: 16px;
  }
  .share-card-suitcase {
    width: 60px;
  }
  .share-route {
    margin-top: 18px;
    border-top: 1px dashed rgba(125, 58, 30, 0.4);
    padding-top: 14px;
  }
  .share-stops {
    list-style: none;
    padding: 0;
    margin: 8px 0 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .share-stops li {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    align-items: center;
    gap: 10px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 0.95rem;
    color: #0a2d21;
  }
  .share-stop-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: #0a2d21;
    color: #c9a84c;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 0.8rem;
  }
  .share-stop-name {
    font-weight: 600;
  }
  .share-stop-clock {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    color: #7d3a1e;
    letter-spacing: 0.02em;
    font-size: 0.9rem;
  }
  .share-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px dashed rgba(125, 58, 30, 0.4);
  }
  .share-stat {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    padding: 4px 10px;
    border: 1px solid rgba(10, 45, 33, 0.25);
    border-radius: 999px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 0.85rem;
    color: #0a2d21;
    background: #fffdf6;
  }
  .share-stat strong {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    color: #7d3a1e;
  }
</style>
