<script>
  /* ==================================================================
     Trip page = cinematic itinerary by default.

     This page absorbed what used to live at /trips/[id]/itinerary.
     The page now opens with the magazine-spread itinerary (forest
     cover, narrative band, full-bleed stop scenes) and the older
     trip-detail cards (Packing, Bookings, Budget, Photos, Diary,
     Events, Schedule + Identity) collapse into the "Trip kit"
     drawer rail below the sign off.

     /trips/[id]/itinerary now just redirects here.
     /trips/[id]/print stays as the dedicated print-friendly view.
     ================================================================== */

  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  /* ---------- Trip data ---------- */
  import {
    getTrip,
    renameTrip,
    changeTripColor,
    updateTrip,
    deleteTrip,
    setTripCover,
    clearTripCover,
    setTripTheme,
    clearTripTheme,
    LEATHER_COLORS
  } from '$lib/stores/trips.js';
  import { listBookings, BOOKING_KINDS, sortByStartTime } from '$lib/stores/bookings.js';
  import { listDiaryEntries, addDiaryEntry } from '$lib/stores/diary.js';
  import { listPhotos, addPhoto } from '$lib/stores/photos.js';
  import { listPackingItems, addPackingItem } from '$lib/stores/packing.js';
  import { listBudgetEntries, addBudgetEntry, totalOf, formatAmount } from '$lib/stores/budget.js';

  /* ---------- Stop + schedule helpers ---------- */
  import {
    getStopsByIds,
    stopGuideUrl,
    stopImageUrl
  } from '$lib/data/stops.js';
  import {
    arrivalClock,
    arrivalMinutes,
    clockToMinutes,
    departureFor,
    formatTripDate,
    DIRECTIONS,
    travelDuration,
    travelMinutes,
    todayLocalISO
  } from '$lib/data/schedule.js';

  /* ---------- Components ---------- */
  import Suitcase from '$lib/components/Suitcase.svelte';
  import ScheduleStrip from '$lib/components/ScheduleStrip.svelte';
  import TripRoutePicker from '$lib/components/TripRoutePicker.svelte';
  import PackingList from '$lib/components/PackingList.svelte';
  import BookingChecklist from '$lib/components/BookingChecklist.svelte';
  import TravelDiary from '$lib/components/TravelDiary.svelte';
  import EventsAlongRoute from '$lib/components/EventsAlongRoute.svelte';
  import BudgetTracker from '$lib/components/BudgetTracker.svelte';
  import PhotoAlbum from '$lib/components/PhotoAlbum.svelte';
  import ShareModal from '$lib/components/ShareModal.svelte';
  import AddPlanModal from '$lib/components/AddPlanModal.svelte';
  import Drawer from '$lib/components/Drawer.svelte';
  import RouteMap from '$lib/components/RouteMap.svelte';
  import BookingKindIcon from '$lib/components/BookingKindIcon.svelte';

  /** @type {{ id: string, name: string, color: string, strap: string, colorId?: string, stopIds?: string[], departureDate?: string|null, direction?: string } | null} */
  let trip = null;
  let loading = true;

  /* The five row collections we read up here so the cinematic
     scenes can render them; the drawer components mount their own
     copies for editing. Counts here drive the cover stats and the
     drawer badges. */
  let bookings = [];
  let diary = [];
  let photos = [];
  let packingCount = 0;
  let budgetEntries = [];

  /* Modal flags */
  let showStopPicker = false;
  let showShareModal = false;
  let showAddPlan = false;
  let addPlanStop = '';
  let addPlanKind = 'all';

  /* Inline rename state on the cover H1 */
  let editingName = false;
  let nameDraft = '';
  /** @type {HTMLInputElement | undefined} */
  let nameInput;

  let confirmingDelete = false;

  /* Custom-leather drafts for the trip-page color editor. Mirror the
     same shape as NewTripModal so the user can keep tinting an
     existing suitcase after creation. Initialised from the trip's
     stored colors on mount + whenever the trip row changes. */
  let customBodyDraft = '#7d3a1e';
  let customStrapDraft = '#5e2a14';
  $: if (trip && trip.colorId === 'custom') {
    /* Only mirror the saved colors back into the drafts when the trip
       is already a custom one. For preset trips we keep the drafts
       at their last-edited values so clicking Custom doesn't snap
       the picker back to the preset hue. */
    if (trip.color)  customBodyDraft  = trip.color;
    if (trip.strap)  customStrapDraft = trip.strap;
  }

  /* Cover theme.
       Default behavior: the suitcase color the user picked when they
       tagged the trip becomes the banner background, so the page
       inherits the leather palette automatically. Forest green and
       fully-custom colors are explicit overrides via the Cover-theme
       picker in the Trip details drawer.

       Resolution order:
         - coverBg:    user-picked  > trip.color (suitcase body) > forest
         - coverAccent: user-picked > #c9a84c (gentle gold)

       The gradient bottom is a darker shade of the top, computed from
       coverBg, so the blend stays in one color family rather than
       fading to an out-of-palette forest. */
  const FOREST = '#0a2d21';
  const DEFAULT_COVER_ACCENT = '#c9a84c';

  function darkenHex(hex, factor = 0.55) {
    if (!hex || typeof hex !== 'string') return hex;
    const h = hex.length === 4
      ? '#' + [...hex.slice(1)].map((c) => c + c).join('')
      : hex;
    if (h.length !== 7) return hex;
    const r = Math.max(0, Math.min(255, Math.round(parseInt(h.slice(1, 3), 16) * factor)));
    const g = Math.max(0, Math.min(255, Math.round(parseInt(h.slice(3, 5), 16) * factor)));
    const b = Math.max(0, Math.min(255, Math.round(parseInt(h.slice(5, 7), 16) * factor)));
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  }

  $: effectiveCoverBg     = (trip && (trip.coverBg     || trip.color)) || FOREST;
  $: effectiveCoverAccent = (trip &&  trip.coverAccent) || DEFAULT_COVER_ACCENT;
  $: effectiveCoverBgDark = darkenHex(effectiveCoverBg, 0.55);

  let themeBgDraft     = FOREST;
  let themeAccentDraft = DEFAULT_COVER_ACCENT;
  $: if (trip) {
    themeBgDraft     = effectiveCoverBg;
    themeAccentDraft = effectiveCoverAccent;
  }

  $: coverThemeStyle = trip
    ? `--cover-bg-top:${effectiveCoverBg};--cover-bg-bot:${effectiveCoverBgDark};--cover-accent:${effectiveCoverAccent};`
    : '';

  async function saveTheme(field, value) {
    if (!trip) return;
    if (field === 'bg')     themeBgDraft     = value;
    if (field === 'accent') themeAccentDraft = value;
    /* Persist whatever the user just picked. A coverBg that matches
       the suitcase color collapses back to null so we don't store
       redundant data. */
    const bgNoise     = themeBgDraft     === (trip.color || FOREST);
    const accentNoise = themeAccentDraft === DEFAULT_COVER_ACCENT;
    const updated = await setTripTheme(trip.id, {
      coverBg:     bgNoise     ? null : themeBgDraft,
      coverAccent: accentNoise ? null : themeAccentDraft
    });
    if (updated) trip = updated;
  }
  /* Preset shortcut: explicit forest-green background. The leather
     stays whatever the user picked - this only touches the cover
     theme, not the suitcase. */
  async function applyForestTheme() {
    if (!trip) return;
    themeBgDraft     = FOREST;
    themeAccentDraft = DEFAULT_COVER_ACCENT;
    const updated = await setTripTheme(trip.id, {
      coverBg: FOREST,
      coverAccent: null
    });
    if (updated) trip = updated;
  }
  /* Clear any custom overrides so the cover falls back to the
     trip's suitcase color (the new default). */
  async function resetTheme() {
    if (!trip) return;
    const updated = await clearTripTheme(trip.id);
    if (updated) trip = updated;
  }

  /* Custom cover photo for the banner. Built from trip.coverBlob
     when present; revoked whenever the row swaps out or the page
     unmounts so we don't leak object URLs across navigations. */
  let coverObjectUrl = '';
  let coverUploadBusy = false;
  /** @type {HTMLInputElement | undefined} */
  let coverFileInput;

  $: refreshCoverUrl(trip);
  function refreshCoverUrl(t) {
    if (typeof URL === 'undefined') return;
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    coverObjectUrl = '';
    if (t && t.coverBlob) {
      try {
        coverObjectUrl = URL.createObjectURL(t.coverBlob);
      } catch (_) {
        coverObjectUrl = '';
      }
    }
  }

  /* The trip's "cover" stop is the arriving stop (last one in the
     route). When the user hasn't picked stops yet, fall back to
     null and the banner uses a quiet cream placeholder. */
  $: arrivingStop = stops.length > 0 ? stops[stops.length - 1] : null;
  $: departingStop = stops.length > 0 ? stops[0] : null;
  /* Banner image precedence: user upload > arriving stop hero >
     nothing (placeholder gradient). */
  $: bannerImage = coverObjectUrl
    ? coverObjectUrl
    : arrivingStop
      ? stopImageUrl(arrivingStop)
      : '';

  async function handleCoverUpload(event) {
    if (!trip || coverUploadBusy) return;
    const file = event.target.files?.[0];
    if (!file) return;
    coverUploadBusy = true;
    try {
      const updated = await setTripCover(trip.id, file);
      if (updated) trip = updated;
    } catch (err) {
      console.error(err);
    } finally {
      coverUploadBusy = false;
      if (coverFileInput) coverFileInput.value = '';
    }
  }
  async function handleCoverReset() {
    if (!trip || coverUploadBusy) return;
    coverUploadBusy = true;
    try {
      const updated = await clearTripCover(trip.id);
      if (updated) trip = updated;
    } finally {
      coverUploadBusy = false;
    }
  }

  /* Quick-action state for the closed-drawer inline inputs. The
     header form for Packing lives outside the drawer body so the
     user can drop a "toothbrush" without expanding the panel. */
  let quickPackingDraft = '';
  let quickPackingBusy = false;

  async function quickAddPacking() {
    if (!trip || quickPackingBusy) return;
    const clean = quickPackingDraft.trim();
    if (!clean) return;
    quickPackingBusy = true;
    try {
      await addPackingItem(trip.id, clean);
      quickPackingDraft = '';
      const rows = await listPackingItems(trip.id);
      packingCount = rows.length;
    } finally {
      quickPackingBusy = false;
    }
  }

  /* Ledger quick-add: label + amount in two compact inputs.
     Category defaults to 'other' so the user can drop quick
     receipts; they can refine the category inside the drawer. */
  let quickLedgerLabel = '';
  let quickLedgerAmount = '';
  let quickLedgerBusy = false;
  async function quickAddLedger() {
    if (!trip || quickLedgerBusy) return;
    const label = quickLedgerLabel.trim();
    const amount = Number(quickLedgerAmount);
    if (!label || !Number.isFinite(amount) || amount <= 0) return;
    quickLedgerBusy = true;
    try {
      await addBudgetEntry(trip.id, { label, amount, category: 'other' });
      quickLedgerLabel = '';
      quickLedgerAmount = '';
      budgetEntries = await listBudgetEntries(trip.id);
    } finally {
      quickLedgerBusy = false;
    }
  }

  /* Diary quick-add: a single line input that creates an unpinned
     entry. The user can pin it to a stop later inside the drawer. */
  let quickDiaryDraft = '';
  let quickDiaryBusy = false;
  async function quickAddDiary() {
    if (!trip || quickDiaryBusy) return;
    const clean = quickDiaryDraft.trim();
    if (!clean) return;
    quickDiaryBusy = true;
    try {
      await addDiaryEntry(trip.id, { text: clean, stopId: null });
      quickDiaryDraft = '';
      diary = await listDiaryEntries(trip.id);
    } finally {
      quickDiaryBusy = false;
    }
  }

  /* Photos quick-add: file picker wrapped in a styled label so the
     button itself triggers the native picker. addPhoto handles
     the resize + thumb pipeline inside the photos store, so the
     quick path here is just "fire and forget per file". Photos
     count + photoUrls refresh after so the cover stats and any
     pinned scene strips stay current. */
  let quickPhotoBusy = false;
  async function quickAddPhotos(event) {
    const input = event.currentTarget;
    if (!trip || quickPhotoBusy || !input || !input.files) return;
    const files = Array.from(input.files).slice(0, 12);
    if (files.length === 0) return;
    quickPhotoBusy = true;
    try {
      for (const f of files) {
        try { await addPhoto(trip.id, f, {}); } catch (e) { /* skip one bad file */ }
      }
      const next = await listPhotos(trip.id);
      photos = next;
      /* Refresh object URLs for any stop-pinned new photos so they
         show up in scene strips on the next render. */
      const nextUrls = new Map();
      for (const p of next) {
        if (p.stopId) nextUrls.set(p.id, URL.createObjectURL(p.thumb));
      }
      for (const u of photoUrls.values()) URL.revokeObjectURL(u);
      photoUrls = nextUrls;
    } finally {
      quickPhotoBusy = false;
      input.value = '';
    }
  }

  /* Object URLs for the per-stop polaroid strips. Built once on
     load and revoked on destroy so blobs don't leak across nav. */
  let photoUrls = new Map();

  $: tripId = $page.params.id;
  $: stops = trip ? deriveStops(trip) : [];
  $: dirMeta = trip ? DIRECTIONS.find((d) => d.id === (trip.direction || 'northbound')) || DIRECTIONS[0] : null;
  $: depClock = trip ? departureFor(trip.direction || 'northbound') : '09:00';
  $: unassigned = bookings.filter((b) => !b.stopId);
  $: bookedCount = bookings.filter((b) => b.status === 'booked').length;
  $: pendingCount = bookings.length - bookedCount;
  $: tripDateLine = trip && trip.departureDate ? formatTripDate(trip.departureDate) : '';
  $: countdown = daysUntil(trip && trip.departureDate);
  $: budgetTotal = totalOf(budgetEntries);

  /* First five stop photos for the cover collage. Tilts vary by
     index so the cluster looks scattered. */
  $: collagePhotos = stops.slice(0, 5).map((s, idx) => ({
    src: stopImageUrl(s),
    name: s.name,
    tilt: ((idx % 5) - 2) * 4
  }));

  onMount(load);

  async function load() {
    loading = true;
    trip = (await getTrip(tripId)) || null;
    loading = false;
    if (!trip) return;

    [bookings, diary, photos, packingCount, budgetEntries] = await Promise.all([
      listBookings(trip.id),
      listDiaryEntries(trip.id),
      listPhotos(trip.id),
      listPackingItems(trip.id).then((rows) => rows.length),
      listBudgetEntries(trip.id)
    ]);

    /* Per-stop polaroid thumbnails. We only need ones pinned to
       a stop for the scene strips - loose photos don't appear
       in the cinematic view. */
    const next = new Map();
    for (const p of photos) {
      if (p.stopId) next.set(p.id, URL.createObjectURL(p.thumb));
    }
    photoUrls = next;
  }

  onDestroy(() => {
    for (const u of photoUrls.values()) URL.revokeObjectURL(u);
    photoUrls.clear();
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
  });

  /* ---------- Derived helpers ---------- */

  function deriveStops(t) {
    const forward = getStopsByIds(t.stopIds || []);
    return (t.direction === 'southbound') ? forward.slice().reverse() : forward;
  }

  function bookingsAt(stopId) { return bookings.filter((b) => b.stopId === stopId); }
  function diaryAt(stopId)    { return diary.filter((d) => d.stopId === stopId); }
  function photosAt(stopId)   { return photos.filter((p) => p.stopId === stopId); }
  function thumbUrl(p)        { return photoUrls.get(p.id) || ''; }

  /* Friendly kind label for the chip beside each chronological
     scene line. Mirrors the AddPlanModal vocabulary so a user
     who picked "Eat" in the modal sees "Eat" beside the
     restaurant in the scene. */
  const KIND_CHIPS = {
    train:    'Travel',
    room:     'Sleep',
    meal:     'Eat',
    activity: 'Do',
    other:    'Other'
  };
  function kindChip(kind) {
    return KIND_CHIPS[kind] || 'Other';
  }

  /* Window between this stop's arrival and the next stop's
     departure. Drives the "About 2h 25m before the next train"
     copy in empty-state scenes. */
  function hereDuration(i) {
    if (i >= stops.length - 1) return 'End of the line';
    const a = travelMinutes(stops[i].offsetMinutes, trip.direction || 'northbound');
    const b = travelMinutes(stops[i + 1].offsetMinutes, trip.direction || 'northbound');
    const delta = Math.max(0, b - a);
    if (delta < 60) return `About ${delta}m before the next train`;
    const h = Math.floor(delta / 60);
    const m = delta % 60;
    return `About ${h}h${m ? ' ' + m + 'm' : ''} before the next train`;
  }

  /* Soft conflict check. A booking pinned to a non-departure stop with
     a startTime earlier than the train's projected arrival there is
     physically impossible on the day of arrival, so we flag it. We
     skip the first scene (the train departs from there, so any clock
     could be pre-trip prep) and skip untimed rows. Returns the
     formatted arrival clock when in conflict, else ''. */
  function arrivalConflictClock(b, stop, sceneIndex) {
    if (sceneIndex === 0) return '';
    if (!b || !b.startTime) return '';
    const arrive = arrivalMinutes(stop.offsetMinutes, depClock, trip.direction || 'northbound');
    if (arrive == null) return '';
    const start = clockToMinutes(b.startTime);
    if (start == null) return '';
    if (start >= arrive) return '';
    return arrivalClock(stop.offsetMinutes, depClock, trip.direction || 'northbound');
  }

  function daysUntil(yyyymmdd) {
    if (!yyyymmdd) return null;
    const today = todayLocalISO();
    const a = new Date(today);
    const b = new Date(yyyymmdd);
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  /* ---------- Actions ---------- */

  function startRename() {
    if (!trip) return;
    nameDraft = trip.name;
    editingName = true;
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
    const updated =
      colorId === 'custom'
        ? await changeTripColor(trip.id, 'custom', { body: customBodyDraft, strap: customStrapDraft })
        : await changeTripColor(trip.id, colorId);
    if (updated) trip = updated;
  }

  /* Live-save handler for the two custom inputs. Fires on every
     <input> event so the dashboard suitcase tints alongside the
     drag of the OS color wheel. */
  async function saveCustomColor(field, value) {
    if (!trip) return;
    if (field === 'body')  customBodyDraft  = value;
    if (field === 'strap') customStrapDraft = value;
    const updated = await changeTripColor(trip.id, 'custom', {
      body: customBodyDraft,
      strap: customStrapDraft
    });
    if (updated) trip = updated;
  }

  async function handleDelete() {
    if (!trip) return;
    await deleteTrip(trip.id);
    await goto('/');
  }

  async function saveStops(event) {
    if (!trip) return;
    const stopIds = event.detail.stopIds || [];
    const dir = event.detail.direction || trip.direction || 'northbound';
    const updated = await updateTrip(trip.id, { stopIds, direction: dir });
    if (updated) trip = updated;
    showStopPicker = false;
  }

  async function openAddPlan(stopId = '', kind = 'all') {
    addPlanStop = stopId;
    addPlanKind = kind;
    showAddPlan = true;
  }
  async function closeAddPlan() {
    showAddPlan = false;
    /* Refetch so scenes + counts refresh without a page reload. */
    if (trip) {
      const [b, p] = await Promise.all([
        listBookings(trip.id),
        listPackingItems(trip.id).then((r) => r.length)
      ]);
      bookings = b;
      packingCount = p;
    }
  }

  function kindLabel(id) {
    return (BOOKING_KINDS.find((k) => k.id === id) || BOOKING_KINDS[4]).label;
  }
</script>

<svelte:head>
  <title>{trip ? trip.name + ' - Northlander' : 'Trip - Northlander'}</title>
</svelte:head>

{#if loading}
  <p class="status">Standing by at the platform...</p>
{:else if !trip}
  <!-- ===== Trip not found ===== -->
  <section class="not-found">
    <div class="kicker kicker-light">Hmm.</div>
    <h1>That suitcase has left the station.</h1>
    <p>We couldn't find a trip at this address. It may have been deleted on another device.</p>
    <a href="/" class="btn-primary cover-add">Back to your platform</a>
  </section>
{:else}
  <!-- ===== Breadcrumb (inside the forest band so it sits over the gradient) ===== -->
  <nav class="crumbs">
    <div class="crumbs-inner">
      <a href="/">Platform</a>
      <span class="crumbs-sep">/</span>
      <span class="crumbs-now">{trip.name}</span>
    </div>
  </nav>

  <!-- ===== Editorial cover banner =====
       The arriving stop's hero photo (or the user's custom upload)
       sits behind a forest gradient overlay. A boarding-pass header
       runs across the top: FROM Toronto Union -> TO Bracebridge,
       date and direction. The user's name, countdown and stats sit
       below in the cream/ivory editorial style. A small "Change
       cover" button in the corner lets the user swap the banner
       image at any time. -->
  <header class="cover" class:has-image={!!bannerImage} style={coverThemeStyle}>
    <div
      class="cover-bg"
      class:has-image={!!bannerImage}
      style={bannerImage ? `background-image:url('${bannerImage}')` : ''}
      aria-hidden="true"
    ></div>
    <div class="cover-veil" aria-hidden="true"></div>

    {#if departingStop && arrivingStop}
      <div class="cover-ticket" aria-label="Route">
        <span class="cover-ticket-end">
          <span class="cover-ticket-kicker">From</span>
          <span class="cover-ticket-name">{departingStop.name}</span>
        </span>
        <span class="cover-ticket-arrow" aria-hidden="true">
          <svg viewBox="0 0 80 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <path d="M2 7 H68" stroke-dasharray="3 3"/>
            <path d="M62 2 L72 7 L62 12"/>
          </svg>
        </span>
        <span class="cover-ticket-end">
          <span class="cover-ticket-kicker">To</span>
          <span class="cover-ticket-name">{arrivingStop.name}</span>
        </span>
      </div>
    {/if}

    <input
      bind:this={coverFileInput}
      type="file"
      accept="image/*"
      class="cover-file-input"
      on:change={handleCoverUpload}
      tabindex="-1"
      aria-hidden="true"
    />
    {#if stops.length > 0}
      <div class="cover-photo-actions">
        <button
          type="button"
          class="cover-photo-btn"
          on:click={() => coverFileInput?.click()}
          disabled={coverUploadBusy}
          aria-label={coverObjectUrl ? 'Replace cover photo' : 'Upload a cover photo'}
          title={coverObjectUrl ? 'Replace cover photo' : 'Upload a cover photo'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14.5 4 H9.5 L7.5 6.5 H4 a1 1 0 0 0 -1 1 V18 a1 1 0 0 0 1 1 H20 a1 1 0 0 0 1 -1 V7.5 a1 1 0 0 0 -1 -1 H16.5 Z"/>
            <circle cx="12" cy="13" r="3.5"/>
          </svg>
          <span>{coverUploadBusy ? 'Uploading...' : (coverObjectUrl ? 'Replace cover' : 'Upload cover')}</span>
        </button>
        {#if coverObjectUrl}
          <button
            type="button"
            class="cover-photo-reset"
            on:click={handleCoverReset}
            disabled={coverUploadBusy}
            title="Use the arriving stop's photo instead"
          >Reset</button>
        {/if}
      </div>
    {/if}

    <div class="cover-inner" class:is-empty={stops.length === 0}>
      <div class="cover-text">
        <div class="kicker kicker-light">A Northlander Itinerary</div>

        {#if editingName}
          <form class="cover-name-form" on:submit|preventDefault={saveRename}>
            <input
              bind:this={nameInput}
              bind:value={nameDraft}
              type="text"
              maxlength="60"
              class="cover-name-input"
              on:blur={saveRename}
              on:keydown={(e) => e.key === 'Escape' && cancelRename()}
            />
            <span class="cover-name-hint">Enter to save</span>
          </form>
        {:else}
          <button
            type="button"
            on:click={startRename}
            class="cover-name-btn"
            aria-label="Rename trip"
          >
            <h1>{trip.name}</h1>
            <span class="cover-name-hint">Tap to rename</span>
          </button>
        {/if}

        {#if stops.length > 0}
          {#if tripDateLine}
            <div class="cover-date">{tripDateLine}  ·  {dirMeta?.label || 'Northbound'}</div>
          {/if}

          {#if countdown != null}
            <div class="cover-countdown">
              {#if countdown > 1}
                <strong>{countdown}</strong> days until you board
              {:else if countdown === 1}
                <strong>Tomorrow.</strong> Final checks on the platform.
              {:else if countdown === 0}
                <strong>Today.</strong> Safe travels.
              {:else}
                You've been. This is your record.
              {/if}
            </div>
          {:else}
            <div class="cover-countdown italic-soft">
              Pick a departure date in your trip kit and we'll count it down.
            </div>
          {/if}

          <ul class="cover-stats">
            <li><b>{stops.length}</b><span>{stops.length === 1 ? 'Stop' : 'Stops'}</span></li>
            <li><b>{bookings.length}</b><span>Plans</span></li>
            <li><b>{bookedCount}</b><span>Booked</span></li>
            <li><b>{photos.length}</b><span>Photos</span></li>
            <li><b>{diary.length}</b><span>Notes</span></li>
          </ul>
        {:else}
          <!-- Empty-trip welcome. This is the entire page until
               the user picks a route - one warm prompt, one button.
               Everything below the cover stays hidden until both
               departing and arriving stops are saved. -->
          <div class="cover-welcome">
            <p class="cover-welcome-lede">
              Where to first?
            </p>
            <p class="cover-welcome-sub">
              Tell us where the journey begins and ends. The rest of
              your itinerary - packing, plans, photos, the ledger -
              will open once you pick your route.
            </p>
          </div>
        {/if}

        <div class="it-actions" class:it-actions--solo={stops.length === 0}>
          {#if stops.length === 0}
            <button
              type="button"
              class="btn-primary cover-add cover-pick-route"
              on:click={() => (showStopPicker = true)}
              aria-label="Pick where the journey begins and ends"
            >
              <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="6" cy="12" r="2.5"/>
                <circle cx="18" cy="12" r="2.5"/>
                <path d="M8.5 12 L15.5 12" stroke-dasharray="2 2"/>
              </svg>
              <span>Pick your route</span>
            </button>
          {:else}
            <button
              type="button"
              class="btn-primary cover-edit"
              on:click={() => (showStopPicker = true)}
              aria-label="Edit the stops on this route"
            >
              <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="6" cy="6" r="2"/>
                <circle cx="6" cy="18" r="2"/>
                <circle cx="18" cy="12" r="2"/>
                <path d="M6 8 L6 16"/>
                <path d="M8 6 L16 11"/>
                <path d="M8 18 L16 13"/>
              </svg>
              <span>Edit route</span>
            </button>
          {/if}
          {#if stops.length > 0}
          <a
            href={`/trips/${trip.id}/recap`}
            class="btn-primary cover-recap"
            aria-label="See a recap of this trip"
          >
            <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 4 H20 V20 H4 Z"/>
              <path d="M4 9 L20 9"/>
              <path d="M9 4 L9 9"/>
            </svg>
            <span>Recap</span>
          </a>
          <a
            href={`/trips/${trip.id}/print`}
            target="_blank"
            rel="noopener"
            class="btn-primary cover-print"
            aria-label="Open the print-ready version in a new tab"
          >
            <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14 2 H6 a2 2 0 0 0 -2 2 v16 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2 -2 V8 Z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="13" y2="17"/>
            </svg>
            <span>Export PDF</span>
          </a>
          <button
            type="button"
            class="btn-primary cover-share"
            on:click={() => (showShareModal = true)}
            aria-label="Share your trip as a poster"
          >
            <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            <span>Share</span>
          </button>
          {/if}
        </div>
      </div>

      <!-- Polaroid collage of stops -->
      {#if collagePhotos.length > 0}
        <div class="collage" aria-hidden="true">
          {#each collagePhotos as p, i}
            <figure class="collage-card" style="--rot:{p.tilt}deg;--i:{i}">
              <img src={p.src} alt="" loading="lazy" />
              <figcaption>{p.name}</figcaption>
            </figure>
          {/each}
        </div>
      {/if}
    </div>
  </header>

  <!-- ===== Onboarding gate =====
       Until the user has picked a Departing + Arriving stop, the rest
       of the page stays hidden. The banner above carries the only
       call to action ("Pick your route"). The moment stops are
       saved, the narrative band, scenes, route map, trip kit,
       sign-off and danger zone reveal together as a single unfold. -->
  {#if stops.length > 0}

  <!-- ===== Narrative band ===== -->
    <section class="narrative">
      <div class="narrative-inner">
        <div class="kicker">The Story So Far</div>
        <h2 class="narrative-line">
          {#if bookings.length === 0 && diary.length === 0}
            Your route is set. Now the fun part: what you'll eat, where you'll sleep, and what you'll do at each stop.
          {:else}
            {stops.length} stops between {stops[0].name} and {stops[stops.length - 1].name}, with {bookings.length} {bookings.length === 1 ? 'plan' : 'plans'} stitched in.
          {/if}
        </h2>
        <p class="narrative-hint">
          Tap a prompt at any stop below to drop a plan in, or open a drawer in your trip kit to manage packing, the ledger, your photo album, and more.
        </p>
      </div>
    </section>

  <!-- ===== Route map (chapter-jump nav) ===== -->
  <RouteMap
    {stops}
    direction={trip.direction || 'northbound'}
    departureClock={depClock}
  />

    <!-- ===== Stop scenes ===== -->
    <section class="scenes">
      {#each stops as stop, i}
        {@const stopBookings = bookingsAt(stop.id)}
        {@const stopDiary = diaryAt(stop.id)}
        {@const stopPhotos = photosAt(stop.id)}
        {@const orderedBookings = sortByStartTime(stopBookings)}
        {@const isLast = i === stops.length - 1}
        {@const isEmpty = stopBookings.length === 0 && stopDiary.length === 0 && stopPhotos.length === 0}

        <article id="scene-{i}" class="scene" style="--bg:url('{stopImageUrl(stop)}')">
          <div class="scene-bg" aria-hidden="true"></div>
          <div class="scene-veil" aria-hidden="true"></div>

          <div class="scene-inner">
            <div class="scene-sign">
              <span class="scene-num">{i + 1} of {stops.length}</span>
              <div class="scene-clock">{arrivalClock(stop.offsetMinutes, depClock, trip.direction || 'northbound')}</div>
              <span class="scene-clock-kicker">{i === 0 ? 'Departure' : 'Arrival'}</span>
            </div>

            <div class="scene-head">
              <div>
                <div class="kicker kicker-light">Chapter {i + 1}</div>
                <h2 class="scene-name">{stop.name}</h2>
                <div class="scene-region">{stop.region}</div>
              </div>
              <a
                href={stopGuideUrl(stop)}
                target="_blank"
                rel="noopener"
                class="scene-explore"
              >
                <span>Open on the Guide</span>
                <svg viewBox="0 0 24 24" class="scene-explore-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </a>
            </div>

            <div class="scene-body">
              {#if isEmpty}
                <div class="scene-empty">
                  <p class="scene-empty-line">
                    {#if i === 0}
                      Your journey starts here.
                    {:else if isLast}
                      Last stop. Make it count.
                    {:else}
                      {hereDuration(i)}.
                    {/if}
                  </p>
                  <p class="scene-empty-sub">
                    {#if i === 0}
                      Grab a coffee, check the platform board, and step on.
                    {:else if isLast}
                      Stay overnight? Wander? Catch the connecting train? It's up to you.
                    {:else}
                      Eat something local. Walk to a viewpoint. Sit by the water. Whatever fits in the window.
                    {/if}
                  </p>
                  <div class="scene-prompts">
                    <button
                      type="button"
                      class="prompt prompt-eat"
                      on:click={() => openAddPlan(stop.id, 'eat')}
                    >
                      <span class="prompt-kicker">Eat</span>
                      <span class="prompt-label">Find a restaurant in {stop.name}</span>
                    </button>
                    <button
                      type="button"
                      class="prompt prompt-sleep"
                      on:click={() => openAddPlan(stop.id, 'stay')}
                    >
                      <span class="prompt-kicker">Sleep</span>
                      <span class="prompt-label">Find a place to stay</span>
                    </button>
                    <button
                      type="button"
                      class="prompt prompt-do"
                      on:click={() => openAddPlan(stop.id, 'do')}
                    >
                      <span class="prompt-kicker">Do</span>
                      <span class="prompt-label">See what's nearby</span>
                    </button>
                  </div>
                </div>
              {:else}
                <div class="scene-when">
                  {#if !isLast}
                    {hereDuration(i)}
                  {:else}
                    End of the line
                  {/if}
                </div>

                <div class="scene-group">
                  <div class="group-head">
                    <span class="group-label">Schedule for {stop.name}</span>
                    <span class="group-rule" aria-hidden="true"></span>
                  </div>
                  <ul class="scene-list scene-list-timeline">
                    {#each orderedBookings as b}
                      {@const conflictAt = arrivalConflictClock(b, stop, i)}
                      <li class:is-booked={b.status === 'booked'} class:is-untimed={!b.startTime} class:is-conflict={!!conflictAt}>
                        <div class="line-main">
                          <span class="line-time" class:placeholder={!b.startTime}>
                            {b.startTime || 'Open'}
                          </span>
                          <span class="line-kind">
                            <BookingKindIcon kind={b.kind} size="1em" />
                            <span class="line-kind-label">{kindChip(b.kind)}</span>
                          </span>
                          <span class="line-title">{b.title}</span>
                          <span class="line-status" class:is-booked={b.status === 'booked'}>
                            {b.status === 'booked' ? 'Booked' : 'Pending'}
                          </span>
                        </div>
                        {#if conflictAt}
                          <div class="line-conflict" role="note">
                            <svg viewBox="0 0 24 24" class="line-conflict-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                              <path d="M12 2 L22 20 L2 20 Z"/>
                              <line x1="12" y1="9" x2="12" y2="14"/>
                              <circle cx="12" cy="17.5" r="0.6" fill="currentColor"/>
                            </svg>
                            <span>Train doesn't arrive at {stop.name} until {conflictAt}.</span>
                          </div>
                        {/if}
                        {#if b.kind === 'room' && (b.checkIn || b.checkOut || b.address || b.contact || b.confirmation)}
                          <div class="line-room">
                            {#if b.checkIn || b.checkOut}
                              <span class="line-room-dates">
                                {b.checkIn ? 'In ' + b.checkIn : ''}{b.checkIn && b.checkOut ? '  ·  ' : ''}{b.checkOut ? 'Out ' + b.checkOut : ''}
                              </span>
                            {/if}
                            {#if b.address}<span>{b.address}</span>{/if}
                            {#if b.contact}<span>{b.contact}</span>{/if}
                            {#if b.confirmation}<span>Conf. {b.confirmation}</span>{/if}
                          </div>
                        {/if}
                        {#if b.notes}
                          <p class="line-notes">{b.notes}</p>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </div>

                {#if stopDiary.length > 0}
                  <div class="scene-group">
                    <div class="group-head">
                      <span class="group-label">Notes from the journey</span>
                      <span class="group-rule" aria-hidden="true"></span>
                    </div>
                    <ul class="scene-diary">
                      {#each stopDiary as d}
                        <li>{d.text}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if stopPhotos.length > 0}
                  <div class="scene-group">
                    <div class="group-head">
                      <span class="group-label">Polaroids</span>
                      <span class="group-rule" aria-hidden="true"></span>
                    </div>
                    <div class="scene-photos">
                      {#each stopPhotos.slice(0, 6) as p, idx}
                        <figure class="mini-polaroid" style="--rot:{((idx % 5) - 2) * 3}deg">
                          <img src={thumbUrl(p)} alt={p.caption || stop.name} loading="lazy" />
                        </figure>
                      {/each}
                      {#if stopPhotos.length > 6}
                        <span class="scene-photos-more">+{stopPhotos.length - 6} in your album</span>
                      {/if}
                    </div>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        </article>

        {#if !isLast}
          <div class="connector" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="connector-train" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="4" width="16" height="14" rx="3"/>
              <path d="M4 11 L20 11"/>
              <circle cx="8.5" cy="20" r="1.4"/>
              <circle cx="15.5" cy="20" r="1.4"/>
              <path d="M7 17 L7 19"/>
              <path d="M17 17 L17 19"/>
            </svg>
            <div class="connector-rail" aria-hidden="true"></div>
            <span class="connector-time">
              {travelDuration(
                Math.abs((stops[i + 1].offsetMinutes || 0) - (stop.offsetMinutes || 0))
              )}
              to {stops[i + 1].name}
            </span>
          </div>
        {/if}
      {/each}
    </section>

  {#if unassigned.length > 0}
    <!-- ===== Loose plans ===== -->
    <section class="loose">
      <div class="loose-inner">
        <div class="kicker">Loose plans</div>
        <h2>Not pinned to a stop yet</h2>
        <p>Open the Plans drawer below to pin these to the right stop.</p>
        <ul class="loose-list">
          {#each unassigned as b}
            <li>
              {#if b.startTime}<span class="loose-time">{b.startTime}</span>{/if}
              <span class="line-title">{b.title}</span>
              <span class="loose-kind">{kindLabel(b.kind)}</span>
              <span class="line-status" class:is-booked={b.status === 'booked'}>
                {b.status === 'booked' ? 'Booked' : 'Pending'}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    </section>
  {/if}

  <!-- ===== Trip kit (drawers) ===== -->
  <section class="kit">
    <div class="kit-inner">
      <div class="kit-head">
        <div class="kicker">Your trip kit</div>
        <h2>Everything else that travels with you.</h2>
        <p>Tap any drawer to open it. These are the working surfaces - lists you tick off, ledgers you balance, photos you drop in along the way.</p>
      </div>

      <Drawer
        title="Pack the suitcase"
        kicker="What's going in"
        count={packingCount}
        countLabel={packingCount === 1 ? 'item' : 'items'}
      >
        <svelte:fragment slot="quick">
          <form class="quick-pack-form" on:submit|preventDefault={quickAddPacking}>
            <input
              type="text"
              bind:value={quickPackingDraft}
              maxlength="60"
              placeholder="Add an item..."
              aria-label="Quick-add packing item"
              class="quick-pack-input"
              disabled={quickPackingBusy}
            />
          </form>
        </svelte:fragment>
        <PackingList tripId={trip.id} />
      </Drawer>

      <Drawer
        title="Plans &amp; reservations"
        kicker="Tickets, rooms, tables"
        count={bookings.length}
        countLabel={pendingCount > 0 ? `${pendingCount} pending` : 'all booked'}
      >
        <svelte:fragment slot="quick">
          <button
            type="button"
            class="quick-plan-btn"
            on:click={() => openAddPlan('', 'all')}
          >
            <span class="quick-plus" aria-hidden="true">+</span>
            <span>Plan</span>
          </button>
        </svelte:fragment>
        <BookingChecklist
          tripId={trip.id}
          stopIds={trip.stopIds || []}
          direction={trip.direction || 'northbound'}
          departureClock={depClock}
        />
      </Drawer>

      <Drawer
        title="The ledger"
        kicker="What it costs"
        count={budgetEntries.length}
        countLabel={budgetEntries.length > 0 ? formatAmount(budgetTotal) : ''}
      >
        <svelte:fragment slot="quick">
          <form class="quick-ledger-form" on:submit|preventDefault={quickAddLedger}>
            <input
              type="text"
              bind:value={quickLedgerLabel}
              maxlength="80"
              placeholder="Log a cost..."
              aria-label="Quick-log label"
              class="quick-ledger-label"
              disabled={quickLedgerBusy}
            />
            <input
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0"
              bind:value={quickLedgerAmount}
              placeholder="$"
              aria-label="Quick-log amount"
              class="quick-ledger-amount"
              disabled={quickLedgerBusy}
            />
          </form>
        </svelte:fragment>
        <BudgetTracker tripId={trip.id} />
      </Drawer>

      <Drawer
        title="Polaroids"
        kicker="What you saw"
        count={photos.length}
        countLabel={photos.length === 1 ? 'photo' : 'photos'}
      >
        <svelte:fragment slot="quick">
          <label class="quick-photo-btn" class:is-busy={quickPhotoBusy}>
            <span class="quick-plus" aria-hidden="true">+</span>
            <span>{quickPhotoBusy ? 'Uploading...' : 'Photo'}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              class="quick-photo-input"
              aria-label="Quick-add photos"
              on:change={quickAddPhotos}
              disabled={quickPhotoBusy}
            />
          </label>
        </svelte:fragment>
        <PhotoAlbum tripId={trip.id} stopIds={trip.stopIds || []} />
      </Drawer>

      <Drawer
        title="Travel diary"
        kicker="What you wrote"
        count={diary.length}
        countLabel={diary.length === 1 ? 'note' : 'notes'}
      >
        <svelte:fragment slot="quick">
          <form class="quick-diary-form" on:submit|preventDefault={quickAddDiary}>
            <input
              type="text"
              bind:value={quickDiaryDraft}
              maxlength="280"
              placeholder="Jot a note..."
              aria-label="Quick-add diary note"
              class="quick-diary-input"
              disabled={quickDiaryBusy}
            />
          </form>
        </svelte:fragment>
        <TravelDiary tripId={trip.id} stopIds={trip.stopIds || []} />
      </Drawer>

      <Drawer
        title="Happening nearby"
        kicker="Events on your dates"
      >
        <EventsAlongRoute
          tripId={trip.id}
          stopIds={trip.stopIds || []}
          departureDate={trip.departureDate || null}
        />
      </Drawer>

      <Drawer
        title="Trip details"
        kicker="Dates, route, leather"
      >
        <div class="details-grid">
          <div class="details-col">
            <div class="kicker details-kicker">Schedule</div>
            <ScheduleStrip {trip} on:update={(e) => (trip = e.detail)} />
          </div>

          <div class="details-col">
            <div class="kicker details-kicker">Route</div>
            <p class="details-meta">
              {#if trip.stopIds && trip.stopIds.length > 0}
                {trip.stopIds.length} {trip.stopIds.length === 1 ? 'stop' : 'stops'} chosen.
              {:else}
                No stops chosen yet.
              {/if}
            </p>
            <button
              type="button"
              class="details-btn"
              on:click={() => (showStopPicker = true)}
            >{trip.stopIds && trip.stopIds.length > 0 ? 'Change stops' : 'Pick stops'}</button>
          </div>

          <div class="details-col details-col-leather">
            <div class="kicker details-kicker">Leather</div>
            <div class="details-suitcase">
              <Suitcase color={trip.color} strap={trip.strap} label="" />
            </div>
            <div class="leather-row">
              {#each LEATHER_COLORS as c}
                <button
                  type="button"
                  class="pl-swatch"
                  class:is-selected={trip.colorId === c.id}
                  style="background:{c.body};border-color:{trip.colorId === c.id ? c.strap : 'transparent'}"
                  on:click={() => pickColor(c.id)}
                  aria-label={c.name}
                  aria-pressed={trip.colorId === c.id}
                ></button>
              {/each}
              <!-- Custom swatch: dashed-empty circle. Tap to reveal
                   body + strap/buckle inputs below. Saves live as
                   the user moves either picker. -->
              <button
                type="button"
                class="pl-swatch pl-swatch-custom"
                class:is-selected={trip.colorId === 'custom'}
                on:click={() => pickColor('custom')}
                aria-label="Custom leather"
                aria-pressed={trip.colorId === 'custom'}
              >
                <svg viewBox="0 0 24 24" class="pl-swatch-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 8 L12 16 M8 12 L16 12" />
                </svg>
              </button>
            </div>

            {#if trip.colorId === 'custom'}
              <div class="leather-custom-pickers">
                <label class="leather-custom-pick">
                  <span class="kicker">Body</span>
                  <span class="leather-custom-row">
                    <input
                      type="color"
                      value={customBodyDraft}
                      on:input={(e) => saveCustomColor('body', e.currentTarget.value)}
                      aria-label="Suitcase body color"
                    />
                    <span class="leather-custom-hex">{customBodyDraft.toUpperCase()}</span>
                  </span>
                </label>
                <label class="leather-custom-pick">
                  <span class="kicker">Strap &amp; buckle</span>
                  <span class="leather-custom-row">
                    <input
                      type="color"
                      value={customStrapDraft}
                      on:input={(e) => saveCustomColor('strap', e.currentTarget.value)}
                      aria-label="Strap and buckle color"
                    />
                    <span class="leather-custom-hex">{customStrapDraft.toUpperCase()}</span>
                  </span>
                </label>
              </div>
            {/if}

            <!-- Cover theme: optional per-trip palette for the banner
                 gradient + primary button. Defaults to forest + gold;
                 users can hand-pick or one-tap "Use suitcase colors"
                 to tint the page with their leather choice. -->
            <div class="theme-block">
              <div class="kicker details-kicker">Cover theme</div>
              <div class="leather-custom-pickers">
                <label class="leather-custom-pick">
                  <span class="kicker">Background</span>
                  <span class="leather-custom-row">
                    <input
                      type="color"
                      value={themeBgDraft}
                      on:input={(e) => saveTheme('bg', e.currentTarget.value)}
                      aria-label="Cover background color"
                    />
                    <span class="leather-custom-hex">{themeBgDraft.toUpperCase()}</span>
                  </span>
                </label>
                <label class="leather-custom-pick">
                  <span class="kicker">Button</span>
                  <span class="leather-custom-row">
                    <input
                      type="color"
                      value={themeAccentDraft}
                      on:input={(e) => saveTheme('accent', e.currentTarget.value)}
                      aria-label="Primary button color"
                    />
                    <span class="leather-custom-hex">{themeAccentDraft.toUpperCase()}</span>
                  </span>
                </label>
              </div>
              <p class="theme-hint">
                By default the banner picks up your suitcase colour. Pick your own here, or jump back to forest green.
              </p>
              <div class="theme-presets">
                <button type="button" class="theme-preset" on:click={applyForestTheme}>
                  Use forest green
                </button>
                <button type="button" class="theme-reset" on:click={resetTheme}>
                  Reset to suitcase
                </button>
              </div>
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  </section>

  <!-- ===== Sign off =====
       Closes the page with an editorial signature. Same italic
       Fraunces vocabulary as the home dashboard's "Stay curious"
       line so the two pages read as one publication. -->
  <section class="foot">
    <h2>Bon voyage.</h2>
    <p>Open this on your phone the morning you board.</p>
    <div class="it-actions foot-actions">
      <a
        href={`/trips/${trip.id}/print`}
        target="_blank"
        rel="noopener"
        class="btn-primary cover-print"
      >Save as PDF</a>
    </div>
  </section>

  <!-- ===== Danger zone ===== -->
  <section class="danger">
    <div class="danger-inner">
      <div>
        <div class="kicker">Danger zone</div>
        <p>Deleting a suitcase removes its packing list, bookings and notes. There's no undo.</p>
      </div>
      {#if confirmingDelete}
        <div class="danger-actions">
          <button
            type="button"
            on:click={() => (confirmingDelete = false)}
            class="danger-cancel"
          >Cancel</button>
          <button
            type="button"
            on:click={handleDelete}
            class="btn-primary danger-confirm"
          >Yes, delete the suitcase</button>
        </div>
      {:else}
        <button
          type="button"
          on:click={() => (confirmingDelete = true)}
          class="danger-link"
        >Delete this trip</button>
      {/if}
    </div>
  </section>

  {/if}<!-- end onboarding gate -->

  <!-- ===== Modals ===== -->
  {#if showStopPicker}
    <TripRoutePicker
      selected={trip.stopIds || []}
      direction={trip.direction || 'northbound'}
      on:save={saveStops}
      on:close={() => (showStopPicker = false)}
    />
  {/if}

  {#if showShareModal}
    <ShareModal {trip} on:close={() => (showShareModal = false)} />
  {/if}

  {#if showAddPlan}
    <AddPlanModal
      tripId={trip.id}
      stopIds={trip.stopIds || []}
      initialStop={addPlanStop}
      initialKind={addPlanKind}
      existingBookings={bookings}
      direction={trip.direction || 'northbound'}
      on:close={closeAddPlan}
    />
  {/if}
{/if}

<style>
  .status {
    text-align: center;
    padding: 80px 24px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #c9a84c;
    background: #0a2d21;
    margin: 0;
  }
  .not-found {
    text-align: center;
    padding: 80px 24px;
    color: #f3ece0;
    background: #0a2d21;
  }
  .not-found h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2rem, 5vw, 3rem);
    margin: 14px 0 12px;
  }
  .not-found p {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #cad7cf;
    margin: 0 0 24px;
  }

  /* ===== Breadcrumb ===== */
  .crumbs {
    background: #0a2d21;
    color: #cad7cf;
    padding: 18px 24px 0;
  }
  .crumbs-inner {
    max-width: 1180px;
    margin: 0 auto;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
  }
  .crumbs-inner a {
    color: #c9a84c;
    text-decoration: none;
  }
  .crumbs-inner a:hover { color: #f5f0e8; }
  .crumbs-sep {
    color: #7d3a1e;
    margin: 0 8px;
  }
  .crumbs-now { color: #f5f0e8; }

  /* ===== Cover banner =====
     The arriving stop's photo (or a user upload) sits behind a
     forest gradient veil that keeps text legible while leaving
     enough of the photo visible to set the mood. When there's no
     image yet (empty trip), the cover falls back to the original
     forest-gradient look. */
  .cover {
    position: relative;
    /* Three CSS custom properties drive the per-trip cover theme.
       The default values here match the canonical forest + gold;
       the trip page overrides them via inline style so the banner
       inherits the user's suitcase color out of the box. The
       gradient blends from coverBgTop down to coverBgBot - both
       in the same color family so the result stays editorial
       rather than muddy. */
    --cover-bg-top: #0a2d21;
    --cover-bg-bot: #06231a;
    --cover-accent: #c9a84c;
    background: linear-gradient(180deg, var(--cover-bg-top) 0%, var(--cover-bg-bot) 100%);
    color: #f5f0e8;
    padding: 56px 24px 64px;
    overflow: hidden;
  }
  .cover-bg {
    position: absolute;
    inset: 0;
    background-position: center;
    background-size: cover;
    z-index: 0;
  }
  .cover-bg.has-image { background-color: #0a2d21; }
  /* Editorial overlay over the banner image. Uses color-mix so the
     veil tints the photo with the user's chosen theme color
     instead of forcing a forest cast - that way the suitcase color
     reaches the page even when a real photo sits behind it. */
  .cover-veil {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--cover-bg-top) 55%, transparent) 0%,
        color-mix(in srgb, var(--cover-bg-bot) 88%, transparent) 100%
      ),
      radial-gradient(ellipse at 70% 12%, rgba(196, 134, 15, 0.18), transparent 60%);
  }
  .cover.has-image .cover-veil {
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--cover-bg-top) 45%, transparent) 0%,
        color-mix(in srgb, var(--cover-bg-bot) 92%, transparent) 100%
      ),
      radial-gradient(ellipse at 50% 12%, rgba(0, 0, 0, 0.28), transparent 70%);
  }

  /* Boarding-pass ticket header at the top of the cover. Forest
     dark band with gold dashed border and a dashed arrow between
     the two stop names. */
  .cover-ticket {
    position: relative;
    z-index: 3;
    max-width: 1180px;
    margin: 0 auto 28px;
    background: color-mix(in srgb, var(--cover-bg-bot) 78%, transparent);
    border: 1.5px solid #c9a84c;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--cover-bg-bot) 90%, transparent);
    padding: 12px 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    color: #f5f0e8;
    flex-wrap: wrap;
  }
  .cover-ticket-end {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 120px;
  }
  .cover-ticket-kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.28em;
    font-size: 10px;
    font-weight: 800;
    color: #c9a84c;
  }
  .cover-ticket-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: clamp(1.05rem, 2.2vw, 1.4rem);
    color: #f5f0e8;
    text-align: center;
  }
  .cover-ticket-arrow {
    color: #c9a84c;
    width: 80px;
    flex: none;
  }
  .cover-ticket-arrow svg { width: 100%; height: auto; display: block; }
  @media (max-width: 540px) {
    .cover-ticket { padding: 10px 14px; gap: 8px; }
    .cover-ticket-arrow { transform: rotate(90deg); width: 36px; }
    .cover-ticket-end { min-width: 0; }
  }

  /* Discreet "Change cover" button in the top-right corner. */
  .cover-file-input { display: none; }
  .cover-photo-actions {
    position: absolute;
    top: 12px;
    right: 16px;
    z-index: 4;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .cover-photo-btn {
    background: rgba(10, 45, 33, 0.62);
    color: #f5f0e8;
    border: 1px dashed rgba(201, 168, 76, 0.65);
    padding: 5px 12px 5px 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
    transition: background 0.15s, border-color 0.15s;
  }
  .cover-photo-btn svg { width: 14px; height: 14px; }
  .cover-photo-btn:hover:not(:disabled) {
    background: rgba(10, 45, 33, 0.85);
    border-color: #c9a84c;
  }
  .cover-photo-btn:disabled { opacity: 0.6; cursor: progress; }
  .cover-photo-reset {
    background: transparent;
    border: 0;
    color: rgba(245, 240, 232, 0.78);
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
  }
  .cover-photo-reset:hover { color: #c9a84c; }
  .cover-inner {
    max-width: 1180px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr;
    gap: 36px;
    position: relative;
    z-index: 2;
  }
  @media (min-width: 880px) {
    .cover-inner {
      grid-template-columns: 1.1fr 1fr;
      align-items: center;
    }
    /* When the trip is empty there's no polaroid collage in the
       right column, so we collapse back to a single column to
       avoid the lopsided "text + blank" look. */
    .cover-inner.is-empty {
      grid-template-columns: 1fr;
    }
  }

  /* Welcome card that replaces the leg + date + countdown + stats
     when the trip is empty. Italic Fraunces lede + Spline sub gives
     the cover a "this is where it begins" feeling rather than a row
     of zeros. */
  .cover-welcome {
    margin: 14px 0 22px;
    max-width: 60ch;
    border-top: 1px dashed rgba(201, 168, 76, 0.45);
    border-bottom: 1px dashed rgba(201, 168, 76, 0.45);
    padding: 18px 0;
  }
  .cover-welcome-lede {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: clamp(20px, 3vw, 28px);
    line-height: 1.2;
    color: #c9a84c;
    margin: 0 0 10px;
  }
  .cover-welcome-sub {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.55;
    color: rgba(245, 240, 232, 0.78);
    margin: 0;
  }
  .kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .kicker-light { color: #c4860f; }

  /* H1 + inline rename */
  .cover-name-btn {
    background: transparent;
    border: 0;
    padding: 0;
    text-align: left;
    cursor: pointer;
    color: inherit;
    display: block;
    width: 100%;
  }
  .cover-name-btn h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2.6rem, 7vw, 5rem);
    line-height: 0.95;
    margin: 12px 0 6px;
    letter-spacing: -0.015em;
    overflow-wrap: anywhere;
    color: #f5f0e8;
    transition: color 160ms ease;
  }
  .cover-name-btn:hover h1 { color: #c4860f; }
  .cover-name-hint {
    display: block;
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(202, 215, 207, 0.55);
    margin-bottom: 10px;
  }
  .cover-name-form { margin: 12px 0 6px; }
  .cover-name-input {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2.4rem, 6vw, 4.4rem);
    line-height: 1;
    background: transparent;
    color: #f5f0e8;
    border: 0;
    border-bottom: 2px solid #c4860f;
    outline: none;
    width: 100%;
    padding-bottom: 6px;
  }

  /* Direction leg + date + countdown */
  .cover-leg {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #cad7cf;
    font-weight: 600;
  }
  .cover-leg .leg-soft { opacity: 0.7; }
  .cover-leg .dot {
    margin: 0 8px;
    color: #c4860f;
  }
  .cover-date {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(18px, 2.4vw, 22px);
    color: #c9a84c;
    margin: 10px 0 4px;
  }
  .cover-countdown {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(20px, 3vw, 28px);
    color: #f5f0e8;
    line-height: 1.2;
    margin: 14px 0 20px;
  }
  .cover-countdown strong {
    font-weight: 900;
    color: #c4860f;
  }
  .cover-countdown.italic-soft {
    font-style: italic;
    color: #cad7cf;
    font-size: clamp(15px, 2vw, 18px);
  }

  /* Stats grid */
  .cover-stats {
    list-style: none;
    padding: 22px 0 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: 16px;
    border-top: 1px dashed rgba(201, 168, 76, 0.45);
  }
  .cover-stats li { display: flex; flex-direction: column; }
  .cover-stats b {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(26px, 3.6vw, 34px);
    color: #c9a84c;
    line-height: 1;
  }
  .cover-stats span {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    font-weight: 700;
    color: #cad7cf;
    margin-top: 4px;
  }

  /* Action row */
  .it-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 26px;
  }
  /* Primary gold - the main action. Defaults to the same gentle
     #c9a84c the Recap pill uses; if the trip has a custom theme,
     the cover element's --cover-accent variable overrides. */
  .cover-add {
    background: var(--cover-accent, #c9a84c);
    border-color: var(--cover-accent, #c9a84c);
    color: #0a2d21;
    font-weight: 700;
    padding: 0.85rem 1.4rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 8px 18px rgba(201, 168, 76, 0.32);
  }
  .cover-add:hover {
    background: #f5f0e8;
    border-color: #f5f0e8;
    color: #0a2d21;
  }
  .cover-add-plus {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 20px;
    line-height: 1;
  }
  /* Quiet outline - secondary actions */
  .cover-edit,
  .cover-print,
  .cover-share {
    background: transparent;
    border: 2px solid rgba(201, 168, 76, 0.45);
    color: #c9a84c;
    padding: 0.7rem 1.1rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
  }
  .cover-edit:hover,
  .cover-print:hover,
  .cover-share:hover {
    background: rgba(201, 168, 76, 0.12);
    border-color: #c9a84c;
    color: #f5f0e8;
  }
  /* Recap pops in gold so the post-trip view is easy to spot */
  .cover-recap {
    background: #c9a84c;
    border-color: #c9a84c;
    color: #0a2d21;
    padding: 0.7rem 1.1rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
  }
  .cover-recap:hover {
    background: #f5f0e8;
    border-color: #f5f0e8;
    color: #0a2d21;
  }
  .cover-edit-icon {
    width: 16px;
    height: 16px;
  }

  /* Polaroid collage */
  .collage {
    position: relative;
    min-height: 280px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 14px;
  }
  .collage-card {
    background: #fbf6ea;
    padding: 8px 8px 12px;
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.4);
    margin: 0;
    transform: rotate(var(--rot, 0deg)) translateY(calc(var(--i, 0) * -4px));
    transition: transform 0.35s cubic-bezier(.2,.7,.3,1);
  }
  .collage-card:hover {
    transform: rotate(0deg) translateY(-8px);
    z-index: 4;
  }
  .collage-card img {
    width: clamp(110px, 16vw, 180px);
    height: clamp(110px, 16vw, 180px);
    object-fit: cover;
    background: #ede0cc;
    display: block;
  }
  .collage-card figcaption {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #0a2d21;
    text-align: center;
    padding-top: 6px;
  }

  /* ===== Narrative band ===== */
  .narrative {
    background: #fbf6ea;
    padding: 40px 24px;
    border-bottom: 2px solid #7d3a1e;
  }
  .narrative-inner {
    max-width: 920px;
    margin: 0 auto;
  }
  .narrative-line {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    font-size: clamp(1.6rem, 3.5vw, 2.4rem);
    color: #0a2d21;
    line-height: 1.15;
    margin: 8px 0 14px;
  }
  .narrative-hint {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    font-size: 16px;
    line-height: 1.55;
    margin: 0;
    max-width: 60ch;
  }
  .narrative-cta {
    display: inline-block;
    background: #6e2e17;
    color: #f3ece0;
    border: 2px solid #6e2e17;
    padding: 0.65rem 1.1rem;
    border-radius: 4px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
  }
  .narrative-cta:hover {
    background: #884023;
    border-color: #884023;
  }

  /* ===== Stop scenes ===== */
  .scenes {
    background: #0a2d21;
    padding: 0;
  }
  .scene {
    position: relative;
    color: #f5f0e8;
    overflow: hidden;
    /* Leave space at the top so RouteMap pin jumps don't land
       under the sticky topbar (~56px) or hug the connector. */
    scroll-margin-top: 72px;
  }
  .scene-bg {
    position: absolute;
    inset: 0;
    background-image: var(--bg);
    background-size: cover;
    background-position: center center;
    transform: scale(1.05);
  }
  .scene-veil {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(180deg, rgba(10, 30, 20, 0.85) 0%, rgba(10, 30, 20, 0.72) 40%, rgba(10, 30, 20, 0.92) 100%),
      radial-gradient(circle at 80% 20%, rgba(196, 134, 15, 0.25), transparent 55%);
  }
  .scene-inner {
    position: relative;
    z-index: 2;
    max-width: 1080px;
    margin: 0 auto;
    padding: 56px 24px 64px;
  }

  .scene-sign {
    display: inline-flex;
    align-items: baseline;
    gap: 14px;
    padding: 8px 16px;
    background: rgba(245, 240, 232, 0.12);
    border: 1px dashed rgba(201, 168, 76, 0.5);
    border-radius: 3px;
    margin-bottom: 18px;
  }
  .scene-num {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #c4860f;
    font-weight: 700;
  }
  .scene-clock {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 22px;
    color: #f5f0e8;
    line-height: 1;
  }
  .scene-clock-kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #cad7cf;
    font-weight: 700;
  }

  .scene-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 20px;
    flex-wrap: wrap;
    border-bottom: 1px dashed rgba(201, 168, 76, 0.35);
    padding-bottom: 18px;
    margin-bottom: 26px;
  }
  .scene-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2.4rem, 7vw, 4.4rem);
    line-height: 0.92;
    margin: 8px 0 4px;
    letter-spacing: -0.015em;
    text-shadow: 0 4px 22px rgba(0, 0, 0, 0.5);
  }
  .scene-region {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #c9a84c;
    font-weight: 700;
  }
  .scene-explore {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #c4860f;
    color: #0a2d21;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 10px 16px;
    border-radius: 3px;
    text-decoration: none;
    transition: background 0.15s, color 0.15s, transform 0.15s;
    box-shadow: 0 6px 14px rgba(196, 134, 15, 0.35);
  }
  .scene-explore:hover {
    background: #f5f0e8;
    color: #0a2d21;
    transform: translateY(-2px);
  }
  .scene-explore-icon { width: 16px; height: 16px; }

  /* Empty state */
  .scene-empty { margin-top: 8px; }
  .scene-empty-line {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(1.6rem, 3.5vw, 2.4rem);
    color: #c9a84c;
    margin: 0 0 8px;
    line-height: 1.05;
  }
  .scene-empty-sub {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(15px, 2vw, 18px);
    color: #f5f0e8;
    opacity: 0.88;
    margin: 0 0 24px;
    max-width: 56ch;
  }
  .scene-prompts {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }
  @media (min-width: 640px) {
    .scene-prompts {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .prompt {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: rgba(245, 240, 232, 0.08);
    border: 1.5px dashed rgba(201, 168, 76, 0.55);
    padding: 16px 18px;
    text-decoration: none;
    color: #f5f0e8;
    transition: background 0.18s, border-color 0.18s, transform 0.18s;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .prompt:hover {
    background: rgba(196, 134, 15, 0.18);
    border-color: #c9a84c;
    transform: translateY(-2px);
  }
  .prompt-kicker {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #c4860f;
    font-weight: 700;
  }
  .prompt-label {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 16px;
    color: #f5f0e8;
    line-height: 1.3;
  }

  /* Plans groups */
  .scene-when {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #c4860f;
    font-weight: 700;
    margin-bottom: 18px;
  }
  .scene-group { margin-top: 22px; }
  .group-head {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 10px;
  }
  .group-label {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-style: italic;
    font-size: 18px;
    color: #c9a84c;
    flex: 0 0 auto;
  }
  .group-rule {
    flex: 1;
    height: 0;
    border-top: 1px dashed rgba(201, 168, 76, 0.35);
  }
  .scene-list { list-style: none; padding: 0; margin: 0; }
  .scene-list li {
    padding: 12px 0;
    border-bottom: 1px solid rgba(245, 240, 232, 0.08);
  }
  .scene-list li:last-child { border-bottom: 0; }
  /* Timeline rows lay out time | kind chip | title | status across
     four tracks. Untimed rows tuck under a thin "Open" placeholder
     so the column still aligns. */
  .scene-list-timeline li {
    display: block;
  }
  .scene-list-timeline .line-main {
    display: grid;
    grid-template-columns: 64px auto 1fr auto;
    align-items: baseline;
    gap: 14px;
  }
  .line-time {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-style: italic;
    font-size: clamp(18px, 2vw, 22px);
    color: #c9a84c;
    letter-spacing: 0.01em;
    line-height: 1;
    white-space: nowrap;
  }
  .line-time.placeholder {
    color: rgba(201, 168, 76, 0.45);
    font-weight: 600;
    font-style: italic;
  }
  .line-kind {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #c4860f;
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .line-kind-label {
    line-height: 1;
  }
  .scene-list-timeline .is-untimed { opacity: 0.85; }

  /* Mobile: stack time + kind above title so things don't crunch. */
  @media (max-width: 640px) {
    .scene-list-timeline .line-main {
      grid-template-columns: 1fr auto;
      grid-template-areas:
        "time     status"
        "kind     status"
        "title    title";
      gap: 4px 12px;
    }
    .scene-list-timeline .line-time   { grid-area: time; }
    .scene-list-timeline .line-kind   { grid-area: kind; }
    .scene-list-timeline .line-title  { grid-area: title; margin-top: 2px; }
    .scene-list-timeline .line-status { grid-area: status; align-self: start; }
  }

  .line-main {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 14px;
  }
  .line-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    font-size: clamp(17px, 2.3vw, 22px);
    color: #f5f0e8;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .scene-list li.is-booked .line-title {
    text-decoration: line-through;
    text-decoration-color: #c9a84c;
    text-decoration-thickness: 1.5px;
    color: #cad7cf;
  }
  .line-status {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1.5px dashed #c4860f;
    color: #c4860f;
    background: rgba(196, 134, 15, 0.16);
    white-space: nowrap;
    flex: 0 0 auto;
  }
  .line-status.is-booked {
    background: #c9a84c;
    color: #0a2d21;
    border-color: #c9a84c;
  }
  .line-room {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin-top: 6px;
    padding-left: 12px;
    border-left: 2px solid #c4860f;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    color: #cad7cf;
  }
  .line-room-dates {
    color: #c9a84c;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .line-notes {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #f5f0e8;
    opacity: 0.85;
    margin: 6px 0 0;
    white-space: pre-wrap;
  }
  .line-conflict {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 6px 0 0;
    padding: 4px 10px 4px 8px;
    background: rgba(110, 46, 23, 0.22);
    border: 1px dashed rgba(201, 168, 76, 0.6);
    border-radius: 999px;
    color: #f0c060;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    line-height: 1.25;
  }
  .line-conflict-icon {
    width: 14px;
    height: 14px;
    flex: none;
  }
  .scene-list-timeline li.is-conflict .line-time {
    color: #f0c060;
  }

  .scene-diary {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .scene-diary li {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(15px, 2vw, 17px);
    color: #f5f0e8;
    line-height: 1.55;
    padding-left: 14px;
    border-left: 2px solid #c4860f;
    white-space: pre-wrap;
  }

  .scene-photos {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    align-items: center;
  }
  .mini-polaroid {
    background: #fbf6ea;
    padding: 6px 6px 10px;
    box-shadow: 0 10px 18px rgba(0, 0, 0, 0.4);
    margin: 0;
    transform: rotate(var(--rot, 0deg));
    transition: transform 0.3s ease;
  }
  .mini-polaroid:hover { transform: rotate(0deg) translateY(-3px); }
  .mini-polaroid img {
    width: 88px;
    height: 88px;
    object-fit: cover;
    background: #ede0cc;
    display: block;
  }
  .scene-photos-more {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #c9a84c;
    font-size: 14px;
  }

  /* ===== Connector ===== */
  .connector {
    background: #0a2d21;
    color: #c4860f;
    padding: 28px 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    flex-wrap: wrap;
    border-top: 1px solid rgba(201, 168, 76, 0.25);
    border-bottom: 1px solid rgba(201, 168, 76, 0.25);
  }
  .connector-train { width: 24px; height: 24px; color: #c4860f; }
  .connector-rail {
    width: clamp(40px, 12vw, 120px);
    height: 0;
    border-top: 2px dashed #c4860f;
  }
  .connector-time {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(15px, 2vw, 18px);
    color: #f5f0e8;
  }

  /* ===== Loose plans ===== */
  .loose {
    background: #fbf6ea;
    padding: 48px 24px;
  }
  .loose-inner { max-width: 920px; margin: 0 auto; }
  .loose h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    color: #0a2d21;
    font-size: clamp(1.6rem, 3.5vw, 2.2rem);
    margin: 8px 0 8px;
  }
  .loose p {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 0 0 16px;
  }
  .loose-list {
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-direction: column; gap: 10px;
  }
  .loose-list li {
    background: #fffdf6;
    border-left: 4px solid #c4860f;
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
  }
  .loose-list .line-title { color: #0a2d21; font-size: 16px; }
  .loose-time {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-style: italic;
    color: #6e2e17;
    font-size: 15px;
    margin-right: 6px;
  }
  .loose-kind {
    font-family: 'Spline Sans', sans-serif;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
    font-weight: 700;
  }
  .loose-list .line-status {
    color: #6e2e17;
    border-color: #c4860f;
  }

  /* ===== Sign off ===== */
  .foot {
    background: linear-gradient(180deg, #0e3b2c 0%, #0a2d21 100%);
    color: #f5f0e8;
    padding: 56px 24px;
    text-align: center;
  }
  .foot h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: clamp(1.8rem, 5vw, 2.6rem);
    color: #c9a84c;
    margin: 0 0 6px;
  }
  .foot p {
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #cad7cf;
    margin: 0 0 28px;
  }
  .foot-actions { justify-content: center; margin-top: 0; }

  /* ===== Trip kit ===== */
  .kit {
    background:
      radial-gradient(circle at 20% 0%, rgba(196, 134, 15, 0.06), transparent 55%),
      #f3ece0;
    padding: 56px 24px 32px;
  }
  .kit-inner {
    max-width: 920px;
    margin: 0 auto;
  }
  .kit-head {
    margin-bottom: 24px;
  }
  .kit-head h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    color: #0a2d21;
    font-size: clamp(1.8rem, 3.5vw, 2.4rem);
    margin: 6px 0 8px;
    line-height: 1.15;
  }
  .kit-head p {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 0;
    max-width: 60ch;
  }

  /* Quick-pack inline input in the closed Packing drawer header.
     Compact dashed pill that mirrors the time pill in
     BookingChecklist. Submitting (Enter) adds the item and the
     input stays focused for the next one. */
  .quick-pack-form {
    display: inline-flex;
    align-items: center;
    margin: 0;
  }
  .quick-pack-input {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #0a2d21;
    background: transparent;
    border: 1.5px dashed rgba(125, 58, 30, 0.45);
    border-radius: 999px;
    padding: 5px 14px;
    width: 180px;
    max-width: 40vw;
    outline: none;
    transition: border-color 140ms ease, background 140ms ease;
  }
  .quick-pack-input::placeholder {
    color: rgba(90, 79, 61, 0.65);
    font-style: italic;
  }
  .quick-pack-input:hover,
  .quick-pack-input:focus-visible {
    border-color: #7d3a1e;
    background: rgba(125, 58, 30, 0.06);
  }
  .quick-pack-input:disabled {
    opacity: 0.5;
  }

  /* Quick-plan button in the closed Plans drawer header. Rust pill
     so it reads as a primary action without competing with the
     amber cover button. */
  .quick-plan-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #6e2e17;
    border: 1.5px solid #6e2e17;
    color: #f3ece0;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 6px 14px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 140ms ease, border-color 140ms ease;
  }
  .quick-plan-btn:hover {
    background: #884023;
    border-color: #884023;
  }
  .quick-plus {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 15px;
    line-height: 1;
  }

  /* Ledger quick-action: two compact inputs side by side. The label
     takes the long lane, the amount sits in a tight 80px lane with
     a $ placeholder. Same dashed pill aesthetic as the packing
     input so the rail of quick-actions reads as one family. */
  .quick-ledger-form {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
  }
  .quick-ledger-label,
  .quick-ledger-amount {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #0a2d21;
    background: transparent;
    border: 1.5px dashed rgba(125, 58, 30, 0.45);
    border-radius: 999px;
    padding: 5px 12px;
    outline: none;
    transition: border-color 140ms ease, background 140ms ease;
  }
  .quick-ledger-label { width: 160px; max-width: 36vw; }
  .quick-ledger-amount {
    width: 78px;
    text-align: right;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
  }
  .quick-ledger-label::placeholder,
  .quick-ledger-amount::placeholder {
    color: rgba(90, 79, 61, 0.65);
    font-style: italic;
  }
  .quick-ledger-label:hover,
  .quick-ledger-label:focus-visible,
  .quick-ledger-amount:hover,
  .quick-ledger-amount:focus-visible {
    border-color: #7d3a1e;
    background: rgba(125, 58, 30, 0.06);
  }
  /* Hide native number spinner for the slim pill look. */
  .quick-ledger-amount::-webkit-outer-spin-button,
  .quick-ledger-amount::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .quick-ledger-amount { -moz-appearance: textfield; }

  /* Diary quick-action: single text input, wider lane than packing
     because a thought tends to run longer than an item name. */
  .quick-diary-form {
    display: inline-flex;
    align-items: center;
    margin: 0;
  }
  .quick-diary-input {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 14px;
    color: #0a2d21;
    background: transparent;
    border: 1.5px dashed rgba(125, 58, 30, 0.45);
    border-radius: 999px;
    padding: 5px 14px;
    width: 240px;
    max-width: 50vw;
    outline: none;
    transition: border-color 140ms ease, background 140ms ease;
  }
  .quick-diary-input::placeholder {
    color: rgba(90, 79, 61, 0.65);
  }
  .quick-diary-input:hover,
  .quick-diary-input:focus-visible {
    border-color: #7d3a1e;
    background: rgba(125, 58, 30, 0.06);
  }

  /* Photos quick-action: styled file-picker label. Wraps the hidden
     file input so tapping the label opens the native picker, and
     the same rust-pill identity as the Plans quick-action signals
     "primary action" without competing with the cover. */
  .quick-photo-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #6e2e17;
    border: 1.5px solid #6e2e17;
    color: #f3ece0;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 6px 14px;
    border-radius: 999px;
    cursor: pointer;
    transition: background 140ms ease, border-color 140ms ease, opacity 140ms ease;
  }
  .quick-photo-btn:hover {
    background: #884023;
    border-color: #884023;
  }
  .quick-photo-btn.is-busy {
    opacity: 0.6;
    cursor: progress;
  }
  .quick-photo-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Mobile: tuck the quick-action below the title row so a tight
     header stays one line. */
  @media (max-width: 640px) {
    .quick-pack-input { width: 100%; max-width: none; }
    .quick-ledger-form { flex-wrap: wrap; }
    .quick-ledger-label { width: 100%; max-width: none; }
    .quick-ledger-amount { flex: 1 1 auto; text-align: left; }
    .quick-diary-input { width: 100%; max-width: none; }
  }

  /* Trip details drawer body */
  .details-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 22px;
    padding-top: 8px;
  }
  @media (min-width: 720px) {
    .details-grid {
      grid-template-columns: 1.2fr 1fr 1fr;
    }
  }
  .details-col {
    min-width: 0;
  }
  .details-col-leather {
    text-align: center;
  }
  .details-kicker {
    margin-bottom: 8px;
    color: #7d3a1e;
  }
  .details-meta {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 0 0 10px;
  }
  .details-btn {
    background: #6e2e17;
    color: #f3ece0;
    border: 2px solid #6e2e17;
    padding: 0.55rem 1rem;
    border-radius: 4px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .details-btn:hover {
    background: #884023;
    border-color: #884023;
  }
  .details-suitcase {
    max-width: 140px;
    margin: 0 auto 10px;
  }
  .leather-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
  .pl-swatch {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border-width: 2px;
    border-style: solid;
    cursor: pointer;
    transition: transform 160ms ease, box-shadow 160ms ease;
  }
  .pl-swatch:hover { transform: translateY(-2px); }
  .pl-swatch.is-selected {
    box-shadow: 0 0 0 3px #c9a84c, 0 6px 12px rgba(40, 20, 5, 0.25);
  }
  .pl-swatch-custom {
    background: #fbf6ea;
    border-style: dashed;
    border-color: #7d3a1e;
    color: #7d3a1e;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pl-swatch-custom.is-selected {
    border-style: solid;
    border-color: #5e2a14;
  }
  .pl-swatch-icon {
    width: 16px;
    height: 16px;
  }

  /* Body + strap inputs revealed when the trip's leather is custom. */
  .leather-custom-pickers {
    margin-top: 14px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
  }
  .leather-custom-pick {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1 1 130px;
    min-width: 0;
    max-width: 180px;
  }
  .leather-custom-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #fbf6ea;
    border: 1px solid #8b6a3a;
    padding: 4px 8px 4px 4px;
    border-radius: 3px;
  }
  .leather-custom-row input[type='color'] {
    width: 28px;
    height: 28px;
    border: 1px solid #8b6a3a;
    background: transparent;
    padding: 0;
    cursor: pointer;
    border-radius: 2px;
  }
  .leather-custom-row input[type='color']::-webkit-color-swatch-wrapper {
    padding: 2px;
  }
  .leather-custom-row input[type='color']::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }
  .leather-custom-hex {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 0.78rem;
    color: #0a2d21;
    letter-spacing: 0.06em;
  }

  /* Cover-theme block: sits below the leather swatch picker in the
     Trip details drawer. Two color inputs (background + button)
     wired through CSS variables on the cover element, plus two
     preset shortcuts. */
  .theme-block {
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px dashed rgba(125, 58, 30, 0.3);
  }
  .theme-hint {
    margin-top: 12px;
    text-align: center;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12px;
    color: #5a4f3d;
    line-height: 1.35;
  }
  .theme-presets {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
  .theme-preset,
  .theme-reset {
    background: transparent;
    border: 1.5px solid #7d3a1e;
    color: #7d3a1e;
    padding: 6px 12px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12px;
    cursor: pointer;
    border-radius: 3px;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .theme-preset:hover {
    background: #7d3a1e;
    color: #f5f0e8;
  }
  .theme-reset {
    border-color: rgba(125, 58, 30, 0.4);
    border-style: dashed;
    color: #5a4f3d;
  }
  .theme-reset:hover {
    border-color: #5a4f3d;
    color: #0a2d21;
  }

  /* ===== Danger zone ===== */
  .danger {
    background: #f3ece0;
    padding: 24px 24px 64px;
  }
  .danger-inner {
    max-width: 920px;
    margin: 0 auto;
    border-top: 1px dashed rgba(125, 58, 30, 0.4);
    padding-top: 24px;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
  .danger p {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 4px 0 0;
  }
  .danger-link {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    color: #6e2e17;
    background: transparent;
    border: 0;
    cursor: pointer;
    font-size: 14px;
  }
  .danger-link:hover { color: #0a2d21; }
  .danger-actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .danger-cancel {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    background: transparent;
    border: 0;
    cursor: pointer;
    font-size: 14px;
  }
  .danger-cancel:hover { color: #6e2e17; }
  .danger-confirm {
    background: #5e2a14;
    border-color: #5e2a14;
  }
  .danger-confirm:hover {
    background: #7d3a1e;
    border-color: #7d3a1e;
  }
</style>
