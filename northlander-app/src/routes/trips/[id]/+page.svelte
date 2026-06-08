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
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  /* ---------- Trip data ---------- */
  import {
    getTrip,
    renameTrip,
    updateTrip,
    setTripRoute,
    addTripPackingList,
    renameTripPackingList,
    deleteTripPackingList,
    setTripBudgetTarget,
    wrapTrip,
    unwrapTrip,
    deleteTrip,
    setTripCover,
    clearTripCover
  } from '$lib/stores/trips.js';
  import { listBookings, BOOKING_KINDS } from '$lib/stores/bookings.js';
  import { listDiaryEntries } from '$lib/stores/diary.js';
  import { listPhotos } from '$lib/stores/photos.js';
  import { listPackingItems } from '$lib/stores/packing.js';
  import { listBudgetEntries, totalOf, formatAmount } from '$lib/stores/budget.js';

  /* ---------- Stop + schedule helpers ---------- */
  import {
    getStopsByIds,
    stopImageUrl
  } from '$lib/data/stops.js';
  import {
    arrivalClock,
    departureFor,
    departTimeAt,
    trainTimeFor,
    formatTripDate,
    DIRECTIONS,
    OFFICIAL_SCHEDULE_URL,
    NORTHBOUND_DEPARTURE,
    SOUTHBOUND_DEPARTURE,
    travelDuration,
    travelMinutes,
    todayLocalISO
  } from '$lib/data/schedule.js';

  /* ---------- Components ---------- */
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
  import WeatherStrip from '$lib/components/WeatherStrip.svelte';
  import WeatherParticles from '$lib/components/WeatherParticles.svelte';
  import DayPlan from '$lib/components/DayPlan.svelte';
  import { pushToast } from '$lib/stores/toasts.js';
  import { downloadTripBackup } from '$lib/utils/backup.js';
  import { pullToRefresh } from '$lib/utils/pull-to-refresh.js';

  /** @type {{ id: string, name: string, color: string, strap: string, colorId?: string, stopIds?: string[], departureDate?: string|null, direction?: string } | null} */
  let trip = null;
  let loading = true;

  /* Trip-level snapshots that drive the cover stats. The per-chapter
     components mount their own copies and edit through the stores;
     they fire on:change to call load() back so these stay in sync. */
  let bookings = [];
  let diary = [];
  let photos = [];
  /** @type {Array<{ id: number, name: string, listName?: string|null, packed: boolean }>} */
  let packingRows = [];
  /* Monotonic counter the chapter accordions watch as `refreshKey`.
     load() bumps it after every refetch so BookingChecklist /
     TravelDiary / PhotoAlbum / BudgetTracker instances pull from
     IndexedDB even when their tripId hasn't changed (e.g. after
     AddPlanModal writes a new booking without closing). */
  let dataVersion = 0;
  let budgetEntries = [];

  /* Modal flags */
  let showStopPicker = false;
  let showShareModal = false;
  let showAddPlan = false;
  let addPlanStop = '';
  let addPlanKind = 'all';
  let addPlanFromReturn = false;

  /* Inline rename state on the cover H1 */
  let editingName = false;
  let nameDraft = '';
  /** @type {HTMLInputElement | undefined} */
  let nameInput;

  let confirmingDelete = false;

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
  /* Station the user ends at on the return leg. Defaults to the
     departing stop when the user didn't pick a different one in
     the route picker. */
  $: returningStop = trip && trip.returnStopId
    ? (getStopsByIds([trip.returnStopId])[0] || departingStop)
    : departingStop;
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

  $: tripId = $page.params.id;
  $: stops = trip ? deriveStops(trip) : [];
  /* Return leg, derived separately so the cover ticket + the chapter
     section can iterate it without confusing it with the outbound
     leg. Each entry mirrors the outbound shape (`stayStart` /
     `stayEnd`) so the same chapter component pattern works. */
  $: returnStops = trip ? deriveReturnStops(trip) : [];
  /* Cover Stops stat: outbound stops the user gets off at + every
     return entry. Departing station isn't a "stop" they visit
     (they board there). */
  $: stopsVisited = Math.max(0, stops.length - 1) + returnStops.length;

  /* Weather-stop list threaded into PackingPickerModal so it can
     synthesize a "For the forecast" suggestion group when rain /
     snow / hot / cold is expected. We only include stops that
     have a date - undated stops can't be forecast against. */
  $: weatherStopsList = [...stops, ...returnStops]
    .filter((s) => s && s.id && s.stayStart)
    .map((s) => ({ stopId: s.id, date: s.stayStart }));

  /* Trip-state helpers used by the wrap-up CTA. The end date is
     the LAST date on the route - return leg's final entry if there
     is one, else the last outbound entry, else the departure date.
     "Past" = end date is strictly before today's local date. */
  $: tripEndDate = (() => {
    if (returnStops.length > 0) return returnStops[returnStops.length - 1].stayStart || null;
    if (stops.length > 0) return stops[stops.length - 1].stayStart || trip?.departureDate || null;
    return trip?.departureDate || null;
  })();
  $: tripIsPast = (() => {
    if (!tripEndDate || !/^\d{4}-\d{2}-\d{2}$/.test(tripEndDate)) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = tripEndDate.split('-').map(Number);
    const end = new Date(y, m - 1, d);
    end.setHours(23, 59, 59, 999);
    return end.getTime() < today.getTime();
  })();
  $: tripIsWrapped = !!trip?.wrappedAt;
  let wrapBusy = false;

  async function handleWrapTrip() {
    if (!trip || wrapBusy) return;
    wrapBusy = true;
    const updated = await wrapTrip(trip.id);
    if (updated) trip = updated;
    wrapBusy = false;
    pushToast({
      message: 'Trip wrapped. Locked into your archive.',
      kind: 'success',
      undo: async () => {
        const reset = await unwrapTrip(trip.id);
        if (reset) trip = reset;
      }
    });
  }

  /* Animated count-up stores for the cover stats - each starts at
     0 on first paint and tweens to the live value over 700ms.
     Subsequent changes (user adds a booking) animate the delta so
     the cover feels alive. */
  const animStops = tweened(0, { duration: 700, easing: cubicOut });
  const animPlans = tweened(0, { duration: 700, easing: cubicOut });
  const animBooked = tweened(0, { duration: 700, easing: cubicOut });
  const animPhotos = tweened(0, { duration: 700, easing: cubicOut });
  const animNotes = tweened(0, { duration: 700, easing: cubicOut });
  const animSpent = tweened(0, { duration: 800, easing: cubicOut });
  $: animStops.set(stopsVisited);
  $: animPlans.set(bookings.length);
  $: animBooked.set(bookedCount);
  $: animPhotos.set(photos.length);
  $: animNotes.set(diary.length);
  $: animSpent.set(budgetTotal || 0);

  /* Parallax: shift the cover banner image up at 25% of scroll so
     the photo feels like it sits behind glass. Listener attached
     in onMount, torn down on destroy. */
  let coverParallax = 0;
  function handleScroll() {
    if (typeof window === 'undefined') return;
    coverParallax = Math.min(window.scrollY * 0.25, 240);
  }
  /* Cover stat aggregates across every list. Per-list counts for
     the Drawer badges are derived inline where they're rendered. */
  $: packingCount = packingRows.length;
  $: defaultPackingCount = packingRows.filter((p) => !p.listName).length;
  $: extraPackingLists = (trip && Array.isArray(trip.extraPackingLists))
    ? trip.extraPackingLists
    : [];
  function packingCountFor(listName) {
    if (!Array.isArray(packingRows)) return 0;
    return listName
      ? packingRows.filter((p) => p.listName === listName).length
      : packingRows.filter((p) => !p.listName).length;
  }

  /* Per-stop counts that drive the Drawer count badges inside each
     chapter. Reactive on the parent's loaded data so they stay in
     sync with the on:change refresh path. */

  /* Display name for the default (unnamed) packing list. Falls
     back to "Packing list" when the user hasn't renamed it yet. */
  $: defaultPackingListLabel = (trip && trip.defaultPackingListName) || 'Packing list';

  /* Trip-wide budget target lives on the trip row. Empty / null
     means "no target set". budgetSpent comes from the live
     budgetEntries array; budgetRemaining is target - spent and
     can go negative when the user blows through it. */
  $: tripBudgetTarget = trip && Number.isFinite(trip.budgetTarget) ? Number(trip.budgetTarget) : null;
  $: budgetSpent = totalOf(budgetEntries);
  $: budgetRemaining = tripBudgetTarget != null ? Math.round((tripBudgetTarget - budgetSpent) * 100) / 100 : null;
  $: budgetOverspent = budgetRemaining != null && budgetRemaining < 0;
  $: budgetPercent = (tripBudgetTarget && tripBudgetTarget > 0)
    ? Math.min(100, Math.max(0, (budgetSpent / tripBudgetTarget) * 100))
    : 0;

  /* Inline-edit state for the trip budget target. */
  let editingBudgetTarget = false;
  let budgetTargetDraft = '';
  function startEditBudgetTarget() {
    budgetTargetDraft = tripBudgetTarget != null ? String(tripBudgetTarget) : '';
    editingBudgetTarget = true;
  }
  async function commitBudgetTarget() {
    if (!trip) return;
    editingBudgetTarget = false;
    /* The <input type="number"> bind coerces budgetTargetDraft to a
       Number under the hood, so calling .trim() throws and the
       save silently fails. Coerce to a string first (or accept the
       Number directly) before deciding what to persist. */
    const raw = String(budgetTargetDraft ?? '').trim();
    const num = raw === '' ? NaN : Number(raw);
    const v = Number.isFinite(num) && num >= 0 ? num : null;
    const updated = await setTripBudgetTarget(trip.id, v);
    if (updated) trip = updated;
    budgetTargetDraft = '';
  }
  function cancelBudgetTarget() {
    editingBudgetTarget = false;
    budgetTargetDraft = '';
  }

  /* Inline "Add another packing list" form on the trip page. */
  let addingPackingList = false;
  let newPackingListName = '';

  /* Inline rename: the key being edited (''=default list, name=
     extra list), plus the current input draft. */
  let renamingListKey = null;
  let renameListDraft = '';
  function startRenameList(currentName) {
    renamingListKey = currentName || '';
    renameListDraft = currentName || defaultPackingListLabel;
  }
  function cancelRenameList() {
    renamingListKey = null;
    renameListDraft = '';
  }
  async function commitRenameList() {
    if (renamingListKey === null) return;
    const cur = renamingListKey;
    const next = renameListDraft.trim();
    renamingListKey = null;
    renameListDraft = '';
    if (!trip || !next) return;
    if (cur && next === cur) return;
    if (!cur && next === defaultPackingListLabel) return;
    const updated = await renameTripPackingList(trip.id, cur, next);
    if (updated) trip = updated;
    packingRows = await listPackingItems(trip.id);
  }
  async function commitNewPackingList() {
    if (!trip) return;
    const clean = newPackingListName.trim();
    if (!clean) {
      addingPackingList = false;
      return;
    }
    const updated = await addTripPackingList(trip.id, clean);
    if (updated) trip = updated;
    newPackingListName = '';
    addingPackingList = false;
  }
  async function removePackingList(name) {
    if (!trip) return;
    const count = packingCountFor(name);
    const msg = count > 0
      ? `Delete the "${name}" list and its ${count} ${count === 1 ? 'item' : 'items'}? This can't be undone.`
      : `Delete the "${name}" list?`;
    const ok = typeof window !== 'undefined' && window.confirm
      ? window.confirm(msg)
      : true;
    if (!ok) return;
    const updated = await deleteTripPackingList(trip.id, name);
    if (updated) trip = updated;
    /* Refresh packing rows so the cover stat + remaining drawer
       counts reflect the deletion. */
    packingRows = await listPackingItems(trip.id);
  }
  $: dirMeta = trip ? DIRECTIONS.find((d) => d.id === (trip.direction || 'northbound')) || DIRECTIONS[0] : null;
  $: depClock = trip ? departureFor(trip.direction || 'northbound') : '09:00';
  $: unassigned = bookings.filter((b) => !b.stopId);
  $: bookedCount = bookings.filter((b) => b.status === 'booked').length;
  $: pendingCount = bookings.length - bookedCount;
  $: tripDateLine = trip && trip.departureDate ? formatTripDate(trip.departureDate) : '';
  /* Live countdown to the train's scheduled departure time. Updates
     once a minute via tickerNow so the display creeps in real time
     without burning a frame budget. The reactive declaration reads
     tickerNow + trip.direction + trip.departureDate so any of them
     changing recomputes. */
  let tickerNow = Date.now();
  $: countdown = computeCountdown(trip, tickerNow);
  /* Stamp date: the trip's departure month/year if set, otherwise
     the month we're in. Powers the "Now Boarding"-style postmark
     on the sign-off. */
  $: stampDate = (() => {
    const d = trip && trip.departureDate
      ? new Date(trip.departureDate + 'T00:00:00')
      : new Date();
    return d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }).toUpperCase();
  })();
  $: budgetTotal = totalOf(budgetEntries);

  /* Cover collage starts open on desktop, collapsed on mobile.
     Mobile users can tap the toggle pill to reveal. Default is set
     reactively based on viewport width on first paint. */
  let collageOpen = typeof window !== 'undefined' ? window.innerWidth >= 720 : true;

  /* First five stop photos for the cover collage. Tilts vary by
     index so the cluster looks scattered. */
  $: collagePhotos = stops.slice(0, 5).map((s, idx) => ({
    src: stopImageUrl(s),
    name: s.name,
    tilt: ((idx % 5) - 2) * 4
  }));

  /* Inline SVG glyphs for the TOC chips. Kept tiny so they sit
     inside a 14px row without throwing off the pill height. */
  const TOC_ICONS = {
    top: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6 L4 20 L20 20"/><path d="M4 6 L12 14 L16 10 L20 14"/></svg>',
    pack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8 V6 a2 2 0 0 1 2 -2 H15 a2 2 0 0 1 2 2 V8"/><rect x="5" y="8" width="14" height="13" rx="2"/><path d="M9 12 H15"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21 C7 14 4 11 4 8 a8 8 0 0 1 16 0 c0 3 -3 6 -8 13 Z"/><circle cx="12" cy="8" r="2.5"/></svg>',
    depart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="14" rx="3"/><path d="M4 11 L20 11"/><circle cx="8.5" cy="20" r="1.4"/><circle cx="15.5" cy="20" r="1.4"/></svg>',
    returnLeg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 H10 a4 4 0 0 0 -4 4 v3"/><path d="M9 16 L4 13 L9 10"/></svg>',
    foot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9 L15 12 L9 15 Z" fill="currentColor"/></svg>'
  };

  /* Reactive list of TOC chips. Always begins with Top + Pack, then
     one chip per outbound stop (named after the stop), then one per
     return stop, then Sign off. Stop names get truncated CSS-side
     so a long station name doesn't blow the chip width up. */
  $: tocItems = (() => {
    if (!trip) return [];
    const items = [
      { id: 'trip-top', label: 'Top', icon: TOC_ICONS.top },
      { id: 'trip-pack', label: 'Pack', icon: TOC_ICONS.pack }
    ];
    stops.forEach((s, i) => {
      items.push({
        id: `scene-${i}`,
        label: s.name,
        icon: i === 0 ? TOC_ICONS.depart : TOC_ICONS.stop
      });
    });
    returnStops.forEach((s, j) => {
      items.push({
        id: `scene-return-${j}`,
        label: s.name,
        icon: TOC_ICONS.returnLeg
      });
    });
    items.push({ id: 'trip-foot', label: 'Sign off', icon: TOC_ICONS.foot });
    return items;
  })();

  /* Smooth scroll on chip tap with an offset that accounts for the
     sticky topbar AND the sticky TOC itself. Mirrors the Guide's
     pattern at site/stop-page.js:752+. */
  const STICKY_OFFSET = 112;
  function handleTocClick(e, id) {
    if (typeof document === 'undefined') return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const y = target.getBoundingClientRect().top + window.scrollY - STICKY_OFFSET;
    window.scrollTo({ top: y, behavior: 'smooth' });
    /* Centre the tapped chip in the horizontal scroll bar so the
       user can see which one they hit on a narrow viewport. */
    const chip = e.currentTarget;
    if (chip && chip.scrollIntoView) {
      chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  /* IntersectionObserver that flips .is-active on the chip whose
     section is currently in view. Held at component scope so we can
     tear it down + rebuild it every time tocItems changes (a stop
     gets added / removed / renamed). */
  let tocObserver = null;
  function rebuildTocObserver() {
    if (typeof document === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    if (tocObserver) {
      tocObserver.disconnect();
      tocObserver = null;
    }
    const nav = document.getElementById('tripToc');
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll('.trip-toc-link'));
    if (!links.length) return;
    const sections = links
      .map((a) => document.getElementById(a.getAttribute('href').slice(1)))
      .filter(Boolean);
    if (!sections.length) return;
    tocObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        links.forEach((a) => {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + id);
        });
      });
    }, {
      /* Same offset trick as the Guide: a section is "active" only
         when its top sits inside the upper third of the viewport,
         well below the sticky topbar + TOC. */
      rootMargin: `-${STICKY_OFFSET + 20}px 0px -55% 0px`,
      threshold: 0
    });
    sections.forEach((s) => tocObserver.observe(s));
  }

  /* Bump the observer whenever the chip set changes (route edited,
     packing list renamed, etc). Wrapped in a microtask so the
     freshly-rendered chips are in the DOM by the time we query. */
  $: if (typeof window !== 'undefined' && Array.isArray(tocItems)) {
    Promise.resolve().then(rebuildTocObserver);
  }

  /* Reveal-on-scroll: every .scene starts at opacity 0 + a small
     translateY, and the observer adds .is-revealed as the section
     comes into the viewport so it eases in. Held at component scope
     so it can be rebuilt when chapters change. */
  let revealObserver = null;
  function rebuildRevealObserver() {
    if (typeof document === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    if (revealObserver) {
      revealObserver.disconnect();
      revealObserver = null;
    }
    const scenes = Array.from(document.querySelectorAll('.scene, .return-divider, .foot, .narrative'));
    if (!scenes.length) return;
    /* Opt scenes into the pre-reveal hidden state only NOW that we
       know the observer is about to attach. If JS or the observer
       fail (or the queue runs before the scenes mount), the CSS
       default is fully visible so chapters never disappear. */
    scenes.forEach((s) => s.classList.add('is-pre-reveal'));
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    scenes.forEach((s) => revealObserver.observe(s));
  }
  $: if (typeof window !== 'undefined' && Array.isArray(stops)) {
    Promise.resolve().then(rebuildRevealObserver);
  }

  let ptrHandle = null;

  onMount(() => {
    /* Tick the countdown once a minute. The page already does most
       of its work in load(); the ticker is just a wall-clock pulse. */
    const tickerId = setInterval(() => { tickerNow = Date.now(); }, 60_000);
    load();
    /* Parallax scroll listener. Passive so it never blocks scroll. */
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', handleScroll, { passive: true });
    }
    /* Pull-to-refresh: dragging down from the top reloads the trip
       + every child row so external mutations (file restore, other
       tabs, the share import path) reflect immediately. */
    if (typeof document !== 'undefined') {
      ptrHandle = pullToRefresh(document.body, { onRefresh: load });
    }
    return () => {
      clearInterval(tickerId);
      if (tocObserver) {
        tocObserver.disconnect();
        tocObserver = null;
      }
      if (revealObserver) {
        revealObserver.disconnect();
        revealObserver = null;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('scroll', handleScroll);
      }
      if (ptrHandle) {
        ptrHandle.destroy();
        ptrHandle = null;
      }
    };
  });

  async function load() {
    /* Only show the platform-loading state on the very first load.
       Subsequent calls (the on:change refresh path from PackingList,
       BookingChecklist, etc.) skip the loading flip so the page
       doesn't yank to the top while the user is mid-scroll editing
       a packing item or a budget line. */
    if (!trip) loading = true;
    trip = (await getTrip(tripId)) || null;
    loading = false;
    if (!trip) return;

    [bookings, diary, photos, packingRows, budgetEntries] = await Promise.all([
      listBookings(trip.id),
      listDiaryEntries(trip.id),
      listPhotos(trip.id),
      listPackingItems(trip.id),
      listBudgetEntries(trip.id)
    ]);
    dataVersion += 1;
  }

  onDestroy(() => {
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
  });

  /* ---------- Derived helpers ---------- */

  /* Build the chapter list. When the trip has the dated `stops`
     shape, use it (each chapter knows its arrival date + stay window
     to the next chapter / return date). Older trips fall back to
     `stopIds` with direction applied. */
  function deriveStops(t) {
    if (Array.isArray(t.stops) && t.stops.length > 0) {
      const firstReturnDate = (Array.isArray(t.returnStops) && t.returnStops.length > 0)
        ? (t.returnStops[0].date || '')
        : (t.returnDate || '');
      return t.stops
        .map((entry, i, arr) => {
          const stop = getStopsByIds([entry.stopId])[0];
          if (!stop) return null;
          const stayStart = entry.date || '';
          const next = arr[i + 1];
          const stayEnd = next ? (next.date || '') : firstReturnDate;
          return { ...stop, date: stayStart, stayStart, stayEnd };
        })
        .filter(Boolean);
    }
    const forward = getStopsByIds(t.stopIds || []);
    const oriented = (t.direction === 'southbound') ? forward.slice().reverse() : forward;
    return oriented.map((s) => ({ ...s, date: '', stayStart: '', stayEnd: '' }));
  }

  /* Walk the return leg the same way deriveStops walks the outbound
     leg: each entry knows its arrival date and the stayEnd is the
     NEXT return entry's date (or null on the last one, since the
     trip ends there). Falls back to the legacy single-entry shape
     when the trip predates multi-stop returns. */
  function deriveReturnStops(t) {
    let raw = Array.isArray(t.returnStops) ? t.returnStops : null;
    if ((!raw || raw.length === 0) && t.returnDate) {
      raw = [{ stopId: t.returnStopId || (Array.isArray(t.stops) && t.stops[0]?.stopId) || '', date: t.returnDate }];
    }
    if (!raw || raw.length === 0) return [];
    return raw
      .map((entry, i, arr) => {
        const stop = getStopsByIds([entry.stopId])[0];
        if (!stop) return null;
        const stayStart = entry.date || '';
        const next = arr[i + 1];
        const stayEnd = next ? (next.date || '') : '';
        return { ...stop, date: stayStart, stayStart, stayEnd, isReturn: true };
      })
      .filter(Boolean);
  }

  /* Window between this stop's arrival and the next stop's
     departure. Drives the "About 2h 25m before the next train"
     copy in chapter heads. */
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

  /* Short date for the cover ticket chip: "May 15". Empty string
     when the YYYY-MM-DD isn't well-formed so the chip drops the
     date row instead of showing "Invalid Date". */
  function formatDateShort(yyyymmdd) {
    if (!yyyymmdd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return '';
    try {
      return new Date(yyyymmdd + 'T12:00:00').toLocaleDateString('en-CA', {
        month: 'short',
        day: 'numeric'
      });
    } catch (_) {
      return '';
    }
  }

  /* "Mon, May 15" or "Mon, May 15 to Tue, May 16" for a multi-day
     stay. Falls back to '' so the header can drop the date row when
     a legacy trip has no per-stop date. */
  function formatStayLabel(stop) {
    if (!stop || !stop.stayStart) return '';
    const fmt = (s) => {
      try {
        return new Date(s + 'T00:00:00').toLocaleDateString('en-CA', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        });
      } catch (_) {
        return s;
      }
    };
    const start = fmt(stop.stayStart);
    if (!stop.stayEnd || stop.stayEnd === stop.stayStart) return start;
    return `${start} to ${fmt(stop.stayEnd)}`;
  }

  /* Live countdown: returns `{ days, hours, minutes }` or `null`
     when no departure date is set, or `{ past: true }` once the
     train has left. Anchored at the train's actual scheduled
     departure time (18:30 northbound / 22:15 southbound), not
     midnight, so the count is accurate to the boarding moment. */
  function computeCountdown(t, nowMs) {
    if (!t || !t.departureDate) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.departureDate);
    if (!m) return null;
    const time = (t.direction === 'southbound' ? SOUTHBOUND_DEPARTURE : NORTHBOUND_DEPARTURE);
    const [h, min] = String(time).split(':').map(Number);
    const dep = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(h) || 0,
      Number(min) || 0,
      0,
      0
    ).getTime();
    const diff = dep - nowMs;
    if (diff <= 0) return { past: true };
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return { days, hours, minutes };
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

  async function handleDelete() {
    if (!trip) return;
    await deleteTrip(trip.id);
    await goto('/');
  }

  async function saveStops(event) {
    if (!trip) return;
    const detail = event.detail || {};
    const updated = await setTripRoute(trip.id, {
      stops: detail.stops || [],
      returnStops: Array.isArray(detail.returnStops) ? detail.returnStops : undefined,
      returnDate: detail.returnDate || '',
      returnStopId: detail.returnStopId || ''
    });
    if (updated) trip = updated;
    showStopPicker = false;
  }

  /* `fromReturn` flips the direction passed to AddPlanModal so train
     times printed inside the modal track the return leg when the
     user opens it from a return-chapter pill. */
  async function openAddPlan(stopId = '', kind = 'all', fromReturn = false) {
    addPlanStop = stopId;
    addPlanKind = kind;
    addPlanFromReturn = fromReturn;
    showAddPlan = true;
  }
  async function closeAddPlan() {
    showAddPlan = false;
    /* Refetch so scenes + counts refresh without a page reload. */
    if (trip) {
      const [b, p] = await Promise.all([
        listBookings(trip.id),
        listPackingItems(trip.id)
      ]);
      bookings = b;
      packingRows = p;
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

  <!-- ===== Trip table of contents =====
       Sticky pill row that lets the user jump straight to any chapter
       without scrolling through the page. Mirrors the Guide's
       stop-page .sp-toc pattern: horizontally scrolling on mobile,
       active chip auto-centres on tap, IntersectionObserver flips
       the .is-active class as a section comes into view. -->
  <nav class="trip-toc" id="tripToc" aria-label="Jump to a chapter">
    <div class="trip-toc-row">
      {#each tocItems as t}
        <a
          class="trip-toc-link"
          href={`#${t.id}`}
          data-trip-toc={t.id}
          on:click={(e) => handleTocClick(e, t.id)}
        >
          <span class="trip-toc-icon" aria-hidden="true">{@html t.icon}</span>
          <span class="trip-toc-label">{t.label}</span>
        </a>
      {/each}
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
  <header id="trip-top" class="cover" class:has-image={!!bannerImage}>
    <div
      class="cover-bg"
      class:has-image={!!bannerImage}
      style={`${bannerImage ? `background-image:url('${bannerImage}');` : ''}transform: translateY(${coverParallax}px) scale(1.08);`}
      aria-hidden="true"
    ></div>
    <div class="cover-veil" aria-hidden="true"></div>

    <!-- Weather particle overlay: gold rain streaks on rainy days,
         snowflakes on snow days, nothing otherwise. Reads the first
         outbound stop's forecast so the cover sets the mood. -->
    {#if stops.length > 0 && stops[0].stayStart}
      <WeatherParticles stop={stops[0]} date={stops[0].stayStart} />
    {/if}

    {#if stops.length > 0}
      <div class="cover-ticket" aria-label="Route">
        {#each stops as s, i}
          {@const tripDir = trip.direction || 'northbound'}
          {@const stopTime = trainTimeFor(s.id, tripDir)}
          <span class="cover-ticket-end">
            <span class="cover-ticket-kicker">
              {#if i === 0}
                Depart
              {:else}
                Stop {i}
              {/if}
            </span>
            <span class="cover-ticket-name">{s.name}</span>
            {#if i === 0 && stopTime?.depart}
              <span class="cover-ticket-time">{stopTime.depart}</span>
            {:else if i > 0 && stopTime?.arrive}
              <span class="cover-ticket-time">{stopTime.arrive}</span>
            {/if}
            {#if s.stayStart}
              <span class="cover-ticket-date">{formatDateShort(s.stayStart)}</span>
            {/if}
          </span>
          {#if i < stops.length - 1 || returnStops.length > 0}
            <span class="cover-ticket-arrow" aria-hidden="true">
              <svg viewBox="0 0 60 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                <path d="M2 7 H48" stroke-dasharray="3 3"/>
                <path d="M42 2 L52 7 L42 12"/>
              </svg>
            </span>
          {/if}
        {/each}
        {#if returnStops.length > 0}
          {@const returnDir = (trip.direction || 'northbound') === 'northbound' ? 'southbound' : 'northbound'}
          {#each returnStops as rs, j}
            {@const returnTime = trainTimeFor(rs.id, returnDir)}
            <span class="cover-ticket-end cover-ticket-end--return">
              <span class="cover-ticket-kicker">
                {j === returnStops.length - 1 ? 'Return' : `Return ${j + 1}`}
              </span>
              <span class="cover-ticket-name">{rs.name}</span>
              {#if returnTime?.arrive}
                <span class="cover-ticket-time">{returnTime.arrive}</span>
              {/if}
              {#if rs.stayStart}
                <span class="cover-ticket-date">{formatDateShort(rs.stayStart)}</span>
              {/if}
            </span>
            {#if j < returnStops.length - 1}
              <span class="cover-ticket-arrow" aria-hidden="true">
                <svg viewBox="0 0 60 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                  <path d="M2 7 H48" stroke-dasharray="3 3"/>
                  <path d="M42 2 L52 7 L42 12"/>
                </svg>
              </span>
            {/if}
          {/each}
        {/if}
      </div>
      <!-- Schedule reference. The Proposed Service Schedule on
           ontarionorthland.ca is the source of truth; we surface a
           small confirm-on-the-Guide link directly under the route
           so users see it the same time they see the times. -->
      <p class="cover-ticket-note">
        Schedule subject to change.
        <a href={OFFICIAL_SCHEDULE_URL} target="_blank" rel="noopener">
          Confirm on ontarionorthland.ca &rarr;
        </a>
      </p>
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

    <!-- Wrapped-trip stamp: tilted passport cancellation pinned to
         the cover when the user has explicitly wrapped the trip.
         Sits above everything else in the cover so it reads as a
         closing mark. -->
    {#if tripIsWrapped}
      <div class="wrapped-stamp" aria-hidden="true">
        <span class="wrapped-stamp-ring">
          <span class="wrapped-stamp-top">NORTHLANDER</span>
          <span class="wrapped-stamp-big">Wrapped</span>
          <span class="wrapped-stamp-bot">Bon voyage</span>
        </span>
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

          {#if countdown == null}
            <div class="cover-countdown italic-soft">
              Pick a departure date in Before You Board below and we'll count it down.
            </div>
          {:else if countdown.past}
            <div class="cover-countdown italic-soft">
              You've been. This is your record.
            </div>
          {:else}
            {@const d = countdown.days}
            {@const h = countdown.hours}
            {@const m = countdown.minutes}
            <div class="cover-countdown">
              <strong>
                {#if d > 0}{d} {d === 1 ? 'day' : 'days'}, {/if}
                {#if d > 0 || h > 0}{h} {h === 1 ? 'hr' : 'hrs'}, {/if}
                {m} {m === 1 ? 'min' : 'mins'}
              </strong>
              until you board
            </div>
          {/if}

          <ul class="cover-stats">
            <li>
              <b>{Math.round($animStops)}</b>
              <span>{stopsVisited === 1 ? 'Stop' : 'Stops'}</span>
            </li>
            <li><b>{Math.round($animPlans)}</b><span>Plans</span></li>
            <li><b>{Math.round($animBooked)}</b><span>Booked</span></li>
            <li><b>{Math.round($animPhotos)}</b><span>Photos</span></li>
            <li><b>{Math.round($animNotes)}</b><span>Notes</span></li>
            {#if budgetEntries.length > 0}
              <li><b>{formatAmount($animSpent)}</b><span>Spent</span></li>
            {/if}
          </ul>

          <!-- Wrap-up CTA: surfaces after the trip's end date passes
               and is dismissed once the user stamps it Wrapped. The
               band frames the moment as ceremonial - last note,
               favourite photo, lock in the spend total - rather
               than just "delete the trip". -->
          {#if tripIsPast && !tripIsWrapped}
            <div class="wrap-cta" role="note">
              <div class="wrap-cta-text">
                <span class="wrap-cta-kicker">Your trip wrapped {tripEndDate ? formatDateShort(tripEndDate) : 'recently'}</span>
                <p class="wrap-cta-body">
                  Add a closing note, pick a favourite photo, lock in the spend total.
                  Then stamp it <em>Wrapped</em> and it slides into your archive.
                </p>
              </div>
              <button
                type="button"
                class="wrap-cta-btn"
                on:click={handleWrapTrip}
                disabled={wrapBusy}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9"/>
                  <path d="M7 12 L10 15 L17 8"/>
                </svg>
                <span>{wrapBusy ? 'Wrapping...' : 'Wrap up this trip'}</span>
              </button>
            </div>
          {/if}
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
            href={`/trips/${trip.id}/logbook`}
            class="btn-primary cover-recap"
            aria-label="Open this trip's logbook"
          >
            <svg viewBox="0 0 24 24" class="cover-edit-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 4 H17 a2 2 0 0 1 2 2 V20 H7 a2 2 0 0 1 -2 -2 Z"/>
              <path d="M5 18 V4"/>
              <path d="M9 8 L15 8"/>
              <path d="M9 12 L15 12"/>
            </svg>
            <span>Logbook</span>
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

      <!-- Polaroid collage of stops. Collapsed behind a chip on
           small viewports so the cover doesn't dominate scroll. -->
      {#if collagePhotos.length > 0}
        <button
          type="button"
          class="collage-toggle"
          on:click={() => (collageOpen = !collageOpen)}
          aria-expanded={collageOpen}
          aria-controls="cover-collage"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="14" height="14" rx="2"/>
            <rect x="7" y="8" width="14" height="12" rx="2" fill="#fbf6ea"/>
          </svg>
          <span>{collageOpen ? 'Hide route photos' : 'See route photos'}</span>
        </button>
        <div
          id="cover-collage"
          class="collage"
          class:is-open={collageOpen}
          aria-hidden="true"
        >
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
          {:else if stops.length === 1}
            Departing {stops[0].name} with {bookings.length} {bookings.length === 1 ? 'plan' : 'plans'} stitched in.
          {:else}
            {stops.length - 1} {stops.length - 1 === 1 ? 'stop' : 'stops'} after {stops[0].name}, with {bookings.length} {bookings.length === 1 ? 'plan' : 'plans'} stitched in.
          {/if}
        </h2>
        <p class="narrative-hint">
          Every chapter below holds its own plans, notes, photos, spend, and events. Pack once for the whole trip in the section just below, then write each chapter as you go.
        </p>
      </div>
    </section>

    <!-- ===== Before you board =====
         One trip-wide section between the narrative and the chapters.
         Dates + direction now live in the route picker (cover Edit
         action). All that stays here is the one bag the user packs
         for the whole journey, tucked into a Drawer accordion so
         the section stays scannable as the list grows. -->
    <section id="trip-pack" class="before-board">
      <div class="before-board-inner">
        <div class="before-board-head">
          <div class="kicker">Before You Board</div>
          <h2>Pack the whole trip in one place.</h2>
        </div>
        <!-- Default (unnamed) packing list. Always present, can't
             be deleted - it's the bag every trip starts with. The
             user can give it a name from the body link. -->
        <Drawer
          kicker="Pack the bag"
          title={defaultPackingListLabel}
          count={defaultPackingCount}
          countLabel={defaultPackingCount === 1 ? 'item' : 'items'}
        >
          <PackingList
            tripId={trip.id}
            stopIds={trip.stopIds || []}
            weatherStops={weatherStopsList}
            on:change={load}
          />
          <div class="bb-list-foot">
            {#if renamingListKey === ''}
              <form class="bb-rename-form" on:submit|preventDefault={commitRenameList}>
                <input
                  type="text"
                  bind:value={renameListDraft}
                  maxlength="40"
                  placeholder="Name this list"
                  class="bb-add-list-input"
                  on:blur={commitRenameList}
                  on:keydown={(e) => { if (e.key === 'Escape') cancelRenameList(); }}
                />
              </form>
            {:else}
              <button
                type="button"
                class="bb-list-delete"
                on:click={() => startRenameList('')}
              >Rename this list</button>
            {/if}
          </div>
        </Drawer>

        <!-- Extra named lists (Mom / Kids / Camera bag etc.). Each
             gets its own accordion + a small Delete-list link inside
             the body for the two-step confirm. -->
        {#each extraPackingLists as name (name)}
          {@const listCount = packingCountFor(name)}
          <Drawer
            kicker="Another bag"
            title={name}
            count={listCount}
            countLabel={listCount === 1 ? 'item' : 'items'}
          >
            <PackingList
              tripId={trip.id}
              stopIds={trip.stopIds || []}
              listName={name}
              weatherStops={weatherStopsList}
              on:change={load}
            />
            <div class="bb-list-foot">
              {#if renamingListKey === name}
                <form class="bb-rename-form" on:submit|preventDefault={commitRenameList}>
                  <input
                    type="text"
                    bind:value={renameListDraft}
                    maxlength="40"
                    placeholder="Rename this list"
                    class="bb-add-list-input"
                    on:blur={commitRenameList}
                    on:keydown={(e) => { if (e.key === 'Escape') cancelRenameList(); }}
                  />
                </form>
              {:else}
                <button
                  type="button"
                  class="bb-list-delete"
                  on:click={() => startRenameList(name)}
                >Rename</button>
                <button
                  type="button"
                  class="bb-list-delete"
                  on:click={() => removePackingList(name)}
                >Delete this list</button>
              {/if}
            </div>
          </Drawer>
        {/each}

        <!-- Add another packing list. Inline name input keeps the
             flow lightweight (no second modal); pressing Enter or
             blurring commits. -->
        <div class="bb-add-list">
          {#if addingPackingList}
            <form on:submit|preventDefault={commitNewPackingList}>
              <input
                type="text"
                bind:value={newPackingListName}
                maxlength="40"
                placeholder="Name this list (Mom, Kids, Camera bag...)"
                class="bb-add-list-input"
                on:blur={commitNewPackingList}
                on:keydown={(e) => { if (e.key === 'Escape') { addingPackingList = false; newPackingListName = ''; } }}
                autofocus
              />
            </form>
          {:else}
            <button
              type="button"
              class="bb-add-list-btn"
              on:click={() => (addingPackingList = true)}
            >
              <span class="bb-add-list-plus" aria-hidden="true">+</span>
              <span>Add another packing list</span>
            </button>
          {/if}
        </div>

        <!-- ===== Trip budget =====
             Trip-wide target the user sets here; per-chapter ledger
             rows roll up into the Spent stat and subtract from
             Remaining live. budgetRemaining can go negative when
             the user blows through, in which case the badge + the
             progress bar flip to amber. Lifted OUT of a Drawer on
             2026-06-07 so the running figure stays visible at a
             glance instead of hiding behind an accordion. -->
        <section class="bb-budget-flat" aria-labelledby="bb-budget-title">
          <header class="bb-budget-flat-head">
            <div class="bb-budget-flat-text">
              <span class="bb-budget-flat-kicker">Trip budget</span>
              <h3 id="bb-budget-title" class="bb-budget-flat-title">Budget</h3>
            </div>
            <!-- Live figure pinned to the title line. Shows whatever
                 the user has left to spend (or how far over budget
                 they've gone). Tapping opens the inline editor so
                 they can adjust the target / add more funds. When
                 no target is set, this slot carries the Set CTA. -->
            <div class="bb-budget-headline">
              {#if editingBudgetTarget}
                <form class="bb-budget-inline-edit" on:submit|preventDefault={commitBudgetTarget}>
                  <span class="bb-budget-inline-prefix" aria-hidden="true">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputmode="decimal"
                    bind:value={budgetTargetDraft}
                    class="bb-budget-inline-input"
                    placeholder={tripBudgetTarget != null ? String(tripBudgetTarget) : '2000'}
                    on:blur={commitBudgetTarget}
                    on:keydown={(e) => { if (e.key === 'Escape') cancelBudgetTarget(); }}
                    autofocus
                  />
                </form>
              {:else if tripBudgetTarget == null}
                <button
                  type="button"
                  class="bb-budget-set"
                  on:click={startEditBudgetTarget}
                >Set a budget</button>
              {:else}
                <button
                  type="button"
                  class="bb-budget-headline-btn"
                  class:is-over={budgetOverspent}
                  on:click={startEditBudgetTarget}
                  title={budgetOverspent ? 'Tap to add more funds' : 'Tap to adjust the target'}
                >
                  <span class="bb-budget-headline-figure">
                    {formatAmount(budgetOverspent ? -budgetRemaining : budgetRemaining)}
                  </span>
                  <span class="bb-budget-headline-tag">{budgetOverspent ? 'over' : 'left'}</span>
                  <svg viewBox="0 0 24 24" width="13" height="13" class="bb-budget-headline-edit" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M4 20 H8 L18 10 L14 6 L4 16 Z"/>
                  </svg>
                </button>
              {/if}
            </div>
          </header>

          {#if editingBudgetTarget}
            <p class="bb-budget-edit-hint">
              Type the new target amount. Press <strong>Enter</strong> to save, or <strong>Escape</strong> to cancel.
              Leave blank to clear the target entirely.
            </p>
          {:else if tripBudgetTarget == null}
            <p class="bb-budget-hint">
              Drop in a target and every spend you log in a chapter ledger
              subtracts from it. Useful for "I have $2,000 for this trip."
            </p>
          {:else}
            <!-- Supplementary stats: how much spent / of what target.
                 The live "left" / "over" figure sits in the headline
                 above so it's always in view. -->
            <div class="bb-budget-substats" class:is-over={budgetOverspent}>
              <span class="bb-budget-sub">
                <strong>{formatAmount(budgetSpent)}</strong> spent
              </span>
              <span class="bb-budget-sub-sep" aria-hidden="true">&middot;</span>
              <span class="bb-budget-sub">
                of <strong>{formatAmount(tripBudgetTarget)}</strong> target
              </span>
            </div>
            <div class="bb-budget-bar" aria-hidden="true">
              <span class="bb-budget-bar-fill" style="width: {budgetPercent}%;" class:is-over={budgetOverspent}></span>
            </div>
            <p class="bb-budget-hint">
              Logged from each chapter's <em>Spending</em> drawer. Tap the figure above to adjust your target or add more funds.
            </p>
          {/if}
        </section>
      </div>
    </section>

    <!-- ===== Stop scenes ===== -->
    <section class="scenes">
      {#each stops as stop, i}
        {@const isLast = i === stops.length - 1}
        {@const tripDir = trip.direction || 'northbound'}
        {@const stopTime = trainTimeFor(stop.id, tripDir)}
        {@const trainLine = i === 0
          ? (stopTime?.depart ? `Departs ${stopTime.depart}` : '')
          : (stopTime?.arrive ? `Arrives ${stopTime.arrive}` : '')}
        {@const dayCount = bookings.filter((b) => b.stopId === stop.id).length
          + diary.filter((d) => d.stopId === stop.id).length
          + budgetEntries.filter((e) => e.stopId === stop.id).length}

        <article id="scene-{i}" class="scene">
          <div class="scene-inner">
            <header class="scene-head">
              <div class="kicker">{i === 0 ? 'Departure' : `Stop ${i}`}</div>
              <h2 class="scene-name">{stop.name}</h2>
              <div class="scene-meta">
                <span class="scene-meta-region">{stop.region}</span>
                {#if stop.stayStart}
                  <span class="scene-meta-sep" aria-hidden="true">·</span>
                  <span class="scene-meta-date">{formatStayLabel(stop)}</span>
                {/if}
                {#if trainLine}
                  <span class="scene-meta-sep" aria-hidden="true">·</span>
                  <span class="scene-meta-time">{trainLine}</span>
                {/if}
                {#if stop.stayStart}
                  <WeatherStrip {stop} date={stop.stayStart} />
                {/if}
              </div>
            </header>

            <div class="scene-grid">
              <div class="scene-main">
                <!-- Day plan timeline: stitches this chapter's bookings,
                     diary entries and spending into one chronological
                     view so the user can see their day at a glance.
                     dayCount const is declared above as a direct
                     child of the {#each} block (Svelte 4 rule). -->
                <Drawer
                  kicker="Day plan"
                  title="What's happening"
                  count={dayCount}
                  countLabel={dayCount === 1 ? 'item' : 'items'}
                >
                  <DayPlan
                    bookings={bookings.filter((b) => b.stopId === stop.id)}
                    diary={diary.filter((d) => d.stopId === stop.id)}
                    budgetEntries={budgetEntries.filter((e) => e.stopId === stop.id)}
                  />
                </Drawer>

                <!-- Count expressions read `bookings` directly inside
                     the prop so Svelte tracks the array as a reactive
                     dep. {@const x = bookingsAt(stop.id)} only fires
                     when the each block iterates, NOT when bookings
                     changes, so the badge would lock to a stale count
                     after the first render. -->
                <Drawer
                  kicker="Bookings"
                  title="Booking checklist"
                  count={bookings.filter((b) => b.stopId === stop.id).length}
                  countLabel={bookings.filter((b) => b.stopId === stop.id).length === 1 ? 'plan' : 'plans'}
                >
                  <BookingChecklist
                    tripId={trip.id}
                    stopIds={trip.stopIds || []}
                    stopFilter={stop.id}
                    direction={trip.direction || 'northbound'}
                    departureClock={depClock}
                    refreshKey={dataVersion}
                    hideHeader={true}
                    on:change={load}
                  />
                  <button
                    type="button"
                    class="browse-guide-btn"
                    on:click={() => openAddPlan(stop.id, 'all')}
                  >
                    <span class="browse-guide-plus" aria-hidden="true">+</span>
                    Browse the Guide for {stop.name}
                  </button>
                </Drawer>

                <Drawer
                  kicker="Journey"
                  title="Travel Diary"
                  count={diary.filter((d) => d.stopId === stop.id).length}
                  countLabel={diary.filter((d) => d.stopId === stop.id).length === 1 ? 'note' : 'notes'}
                >
                  <TravelDiary
                    tripId={trip.id}
                    stopIds={trip.stopIds || []}
                    stopFilter={stop.id}
                    refreshKey={dataVersion}
                    hideHeader={true}
                    on:change={load}
                  />
                </Drawer>

                <Drawer
                  kicker="Album"
                  title="Polaroids"
                  count={photos.filter((p) => p.stopId === stop.id).length}
                  countLabel={photos.filter((p) => p.stopId === stop.id).length === 1 ? 'photo' : 'photos'}
                >
                  <PhotoAlbum
                    tripId={trip.id}
                    stopIds={trip.stopIds || []}
                    stopFilter={stop.id}
                    refreshKey={dataVersion}
                    hideHeader={true}
                    on:change={load}
                  />
                </Drawer>

                <Drawer
                  kicker="Ledger"
                  title="Spending"
                  count={budgetEntries.filter((e) => e.stopId === stop.id).length}
                  countLabel={budgetEntries.filter((e) => e.stopId === stop.id).length === 1 ? 'entry' : 'entries'}
                >
                  <BudgetTracker
                    tripId={trip.id}
                    stopFilter={stop.id}
                    refreshKey={dataVersion}
                    hideHeader={true}
                    on:change={load}
                  />
                </Drawer>

                <Drawer
                  kicker="From the Guide"
                  title="Happening at {stop.name}"
                >
                  <EventsAlongRoute
                    tripId={trip.id}
                    stopIds={[stop.id]}
                    departureDate={stop.stayStart || trip.departureDate || null}
                    endDate={stop.stayEnd || trip.returnDate || null}
                  />
                </Drawer>
              </div>

              <aside class="scene-aside">
                <figure class="scene-postcard">
                  <img src={stopImageUrl(stop)} alt={stop.name} loading="lazy" decoding="async" />
                </figure>
                <p class="scene-aside-hook">{stop.hook}</p>
                <a
                  class="scene-aside-guide"
                  href={`https://northlanderguide.com/stops/${stop.id}/`}
                  target="_blank"
                  rel="noopener"
                >Open {stop.name} on the Guide  &rarr;</a>
              </aside>
            </div>
          </div>
        </article>

        {#if !isLast}
          <div class="chapter-divider" aria-hidden="true">
            <div class="chapter-divider-rule"></div>
            <div class="chapter-divider-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="4" width="16" height="14" rx="3"/>
                <path d="M4 11 L20 11"/>
                <circle cx="8.5" cy="20" r="1.4"/>
                <circle cx="15.5" cy="20" r="1.4"/>
                <path d="M7 17 L7 19"/>
                <path d="M17 17 L17 19"/>
              </svg>
            </div>
            <span class="chapter-divider-time">
              {travelDuration(
                Math.abs((stops[i + 1].offsetMinutes || 0) - (stop.offsetMinutes || 0))
              )} to {stops[i + 1].name}
            </span>
            <!-- Postmark on the right: arrival date stamp tilted like
                 a passport cancellation. Only renders when the next
                 stop carries a date the user picked. -->
            {#if stops[i + 1].stayStart}
              <span class="postmark" aria-hidden="true">
                <span class="postmark-ring">
                  <span class="postmark-arc postmark-arc--top">NORTHLANDER</span>
                  <span class="postmark-stop">{stops[i + 1].name}</span>
                  <span class="postmark-arc postmark-arc--bot">{formatDateShort(stops[i + 1].stayStart)}</span>
                </span>
              </span>
            {/if}
          </div>
        {/if}
      {/each}
    </section>

    {#if returnStops.length > 0}
      <!-- Return-trip break: a heavier divider that announces the
           train has turned around. Each return entry then gets its
           own chapter using the same five-drawer scene pattern, but
           on the opposite direction (so train times read off the
           return-leg schedule). -->
      <div class="return-divider" aria-hidden="true">
        <span class="return-divider-rule"></span>
        <span class="return-divider-label">Return Trip</span>
        <span class="return-divider-rule"></span>
      </div>

      <section class="scenes scenes--return">
        {#each returnStops as stop, j}
          {@const isLastReturn = j === returnStops.length - 1}
          {@const tripDir = trip.direction || 'northbound'}
          {@const returnDir = tripDir === 'northbound' ? 'southbound' : 'northbound'}
          {@const stopTime = trainTimeFor(stop.id, returnDir)}
          {@const trainLine = stopTime?.arrive ? `Arrives ${stopTime.arrive}` : ''}
          {@const dayCount = bookings.filter((b) => b.stopId === stop.id).length
            + diary.filter((d) => d.stopId === stop.id).length
            + budgetEntries.filter((e) => e.stopId === stop.id).length}

          <article id="scene-return-{j}" class="scene scene--return">
            <div class="scene-inner">
              <header class="scene-head">
                <div class="kicker">
                  {isLastReturn ? 'Return' : `Return ${j + 1}`}
                </div>
                <h2 class="scene-name">{stop.name}</h2>
                <div class="scene-meta">
                  <span class="scene-meta-region">{stop.region}</span>
                  {#if stop.stayStart}
                    <span class="scene-meta-sep" aria-hidden="true">·</span>
                    <span class="scene-meta-date">{formatStayLabel(stop)}</span>
                  {/if}
                  {#if trainLine}
                    <span class="scene-meta-sep" aria-hidden="true">·</span>
                    <span class="scene-meta-time">{trainLine}</span>
                  {/if}
                  {#if stop.stayStart}
                    <WeatherStrip {stop} date={stop.stayStart} />
                  {/if}
                </div>
              </header>

              <div class="scene-grid">
                <div class="scene-main">
                  <Drawer
                    kicker="Day plan"
                    title="What's happening"
                    count={dayCount}
                    countLabel={dayCount === 1 ? 'item' : 'items'}
                  >
                    <DayPlan
                      bookings={bookings.filter((b) => b.stopId === stop.id)}
                      diary={diary.filter((d) => d.stopId === stop.id)}
                      budgetEntries={budgetEntries.filter((e) => e.stopId === stop.id)}
                    />
                  </Drawer>

                  <Drawer
                    kicker="Bookings"
                    title="Booking checklist"
                    count={bookings.filter((b) => b.stopId === stop.id).length}
                    countLabel={bookings.filter((b) => b.stopId === stop.id).length === 1 ? 'plan' : 'plans'}
                  >
                    <BookingChecklist
                      tripId={trip.id}
                      stopIds={trip.stopIds || []}
                      stopFilter={stop.id}
                      direction={returnDir}
                      departureClock={depClock}
                      refreshKey={dataVersion}
                      hideHeader={true}
                      on:change={load}
                    />
                    <button
                      type="button"
                      class="browse-guide-btn"
                      on:click={() => openAddPlan(stop.id, 'all', true)}
                    >
                      <span class="browse-guide-plus" aria-hidden="true">+</span>
                      Browse the Guide for {stop.name}
                    </button>
                  </Drawer>

                  <Drawer
                    kicker="Journey"
                    title="Travel Diary"
                    count={diary.filter((d) => d.stopId === stop.id).length}
                    countLabel={diary.filter((d) => d.stopId === stop.id).length === 1 ? 'note' : 'notes'}
                  >
                    <TravelDiary
                      tripId={trip.id}
                      stopIds={trip.stopIds || []}
                      stopFilter={stop.id}
                      refreshKey={dataVersion}
                      hideHeader={true}
                      on:change={load}
                    />
                  </Drawer>

                  <Drawer
                    kicker="Album"
                    title="Polaroids"
                    count={photos.filter((p) => p.stopId === stop.id).length}
                    countLabel={photos.filter((p) => p.stopId === stop.id).length === 1 ? 'photo' : 'photos'}
                  >
                    <PhotoAlbum
                      tripId={trip.id}
                      stopIds={trip.stopIds || []}
                      stopFilter={stop.id}
                      refreshKey={dataVersion}
                      hideHeader={true}
                      on:change={load}
                    />
                  </Drawer>

                  <Drawer
                    kicker="Ledger"
                    title="Spending"
                    count={budgetEntries.filter((e) => e.stopId === stop.id).length}
                    countLabel={budgetEntries.filter((e) => e.stopId === stop.id).length === 1 ? 'entry' : 'entries'}
                  >
                    <BudgetTracker
                      tripId={trip.id}
                      stopFilter={stop.id}
                      refreshKey={dataVersion}
                      hideHeader={true}
                      on:change={load}
                    />
                  </Drawer>

                  <Drawer
                    kicker="From the Guide"
                    title="Happening at {stop.name}"
                  >
                    <EventsAlongRoute
                      tripId={trip.id}
                      stopIds={[stop.id]}
                      departureDate={stop.stayStart || null}
                      endDate={stop.stayEnd || null}
                    />
                  </Drawer>
                </div>

                <aside class="scene-aside">
                  <figure class="scene-postcard">
                    <img src={stopImageUrl(stop)} alt={stop.name} loading="lazy" decoding="async" />
                  </figure>
                  <p class="scene-aside-hook">{stop.hook}</p>
                  <a
                    class="scene-aside-guide"
                    href={`https://northlanderguide.com/stops/${stop.id}/`}
                    target="_blank"
                    rel="noopener"
                  >Open {stop.name} on the Guide  &rarr;</a>
                </aside>
              </div>
            </div>
          </article>

          {#if !isLastReturn}
            <div class="chapter-divider" aria-hidden="true">
              <div class="chapter-divider-rule"></div>
              <div class="chapter-divider-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="4" y="4" width="16" height="14" rx="3"/>
                  <path d="M4 11 L20 11"/>
                  <circle cx="8.5" cy="20" r="1.4"/>
                  <circle cx="15.5" cy="20" r="1.4"/>
                  <path d="M7 17 L7 19"/>
                  <path d="M17 17 L17 19"/>
                </svg>
              </div>
              <span class="chapter-divider-time">
                {travelDuration(
                  Math.abs((returnStops[j + 1].offsetMinutes || 0) - (stop.offsetMinutes || 0))
                )} to {returnStops[j + 1].name}
              </span>
              {#if returnStops[j + 1].stayStart}
                <span class="postmark" aria-hidden="true">
                  <span class="postmark-ring">
                    <span class="postmark-arc postmark-arc--top">NORTHLANDER</span>
                    <span class="postmark-stop">{returnStops[j + 1].name}</span>
                    <span class="postmark-arc postmark-arc--bot">{formatDateShort(returnStops[j + 1].stayStart)}</span>
                  </span>
                </span>
              {/if}
            </div>
          {/if}
        {/each}
      </section>
    {/if}

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

  <!-- ===== Sign off =====
       Closes the page with an editorial signature - forest band
       with a small vintage stamp pinned in the top-right corner.
       Stamp uses the Guide's circular double-border pattern
       (plan-page.css:1110-1142) at a smaller scale, rotated -8deg
       so it reads as something pressed onto the page. -->
  <section id="trip-foot" class="foot">
    <span class="foot-stamp" aria-hidden="true">
      <span class="foot-stamp-line foot-stamp-line--top">Northlander</span>
      <span class="foot-stamp-line foot-stamp-line--big">Bon</span>
      <span class="foot-stamp-line foot-stamp-line--big">Voyage</span>
      <span class="foot-stamp-line foot-stamp-line--bot">{stampDate}</span>
    </span>
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

  <!-- ===== Backup ===== -->
  <section class="backup">
    <div class="backup-inner">
      <div>
        <div class="kicker">Backup</div>
        <p>Download a single file with every plan, photo and note from this trip. Hand it to yourself if you switch devices or wipe browser data.</p>
      </div>
      <button
        type="button"
        class="backup-btn"
        on:click={async () => {
          if (!trip) return;
          const ok = await downloadTripBackup(trip.id);
          if (ok) pushToast({ message: 'Backup downloaded.', kind: 'success' });
          else pushToast({ message: 'Backup failed.', kind: 'warn' });
        }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 12 V19 a2 2 0 0 0 2 2 H18 a2 2 0 0 0 2 -2 V12"/>
          <polyline points="8 12 12 16 16 12"/>
          <line x1="12" y1="3" x2="12" y2="16"/>
        </svg>
        <span>Download backup</span>
      </button>
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
      stops={trip.stops || (trip.stopIds || []).map((id) => ({ stopId: id, date: '' }))}
      returnStops={trip.returnStops || []}
      returnDate={trip.returnDate || ''}
      returnStopId={trip.returnStopId || ''}
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
      stopIds={
        /* Stop chips show every stop the user visits, outbound +
           return, de-duplicated since the user might re-visit the
           same station on the way back. */
        Array.from(new Set([
          ...(trip.stopIds || []),
          ...returnStops.map((s) => s.id)
        ]))
      }
      initialStop={addPlanStop}
      initialKind={addPlanKind}
      existingBookings={bookings}
      direction={addPlanFromReturn
        ? ((trip.direction || 'northbound') === 'northbound' ? 'southbound' : 'northbound')
        : (trip.direction || 'northbound')}
      on:change={load}
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
    /* Bottom padding so the breadcrumb row doesn't butt directly
       against the sticky TOC underneath. */
    padding: 18px 24px 16px;
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

  /* ===== Trip table of contents =====
     Sticky pill row that mirrors the Guide's stop-page TOC pattern
     (site/stop-page.css .sp-toc) but recoloured for the App's cream
     paper background. Sits just under the forest topbar at top:52px
     and scrolls horizontally on mobile so a 16-stop trip's chips
     can all be reached with a flick. */
  .trip-toc {
    position: sticky;
    top: 52px;
    z-index: 60;
    background: #fbf6ea;
    border-top: 1px solid rgba(125, 58, 30, 0.18);
    border-bottom: 1px solid rgba(125, 58, 30, 0.22);
    box-shadow: 0 4px 14px rgba(40, 30, 20, 0.06);
    backdrop-filter: blur(6px);
  }
  .trip-toc-row {
    display: flex;
    align-items: center;
    gap: 6px;
    /* Horizontal padding matches the breadcrumb band above (24px)
       so both rows' content edges line up at the same viewport
       offset. */
    padding: 10px 24px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    max-width: 1180px;
    margin: 0 auto;
    scroll-behavior: smooth;
  }
  .trip-toc-row::-webkit-scrollbar { display: none; }

  .trip-toc-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    background: transparent;
    color: #5a4f3d;
    text-decoration: none;
    padding: 8px 14px;
    border-radius: 999px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    line-height: 1;
    transition: background 140ms ease, color 140ms ease;
    border: 1.5px solid transparent;
    white-space: nowrap;
  }
  .trip-toc-link:hover {
    background: rgba(125, 58, 30, 0.08);
    color: #0a2d21;
  }
  .trip-toc-link.is-active {
    background: #7d3a1e;
    color: #fffdf6;
    box-shadow: 0 3px 10px rgba(125, 58, 30, 0.32);
  }
  .trip-toc-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: #7d3a1e;
  }
  .trip-toc-link.is-active .trip-toc-icon { color: #fffdf6; }
  .trip-toc-icon :global(svg) {
    width: 100%;
    height: 100%;
  }
  /* Truncate long station names so a 16-stop trip's TOC stays
     readable. The chip can still grow to accommodate its content
     but tops out around 130px on each label. */
  .trip-toc-label {
    max-width: 130px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 720px) {
    .trip-toc { top: 48px; }
    /* Keep the TOC's left edge aligned with the breadcrumb on
       narrow viewports too (both use 24px gutters). */
    .trip-toc-row { padding: 8px 24px; gap: 4px; }
    .trip-toc-link { padding: 7px 11px; font-size: 12px; }
  }

  /* ===== Cover banner =====
     The arriving stop's photo (or a user upload) sits behind a
     forest gradient veil that keeps text legible while leaving
     enough of the photo visible to set the mood. When there's no
     image yet (empty trip), the cover falls back to the original
     forest-gradient look. */
  .cover {
    position: relative;
    background: linear-gradient(180deg, #0a2d21 0%, #16543e 100%);
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
    /* Parallax: the inline transform is updated on scroll. The
       extra 8% scale gives translateY room to move without
       exposing the edge of the photo. */
    will-change: transform;
    transition: transform 80ms linear;
  }
  .cover-bg.has-image { background-color: #0a2d21; }
  @media (prefers-reduced-motion: reduce) {
    .cover-bg { transition: none; transform: none !important; }
  }
  /* Editorial overlay: deeper at the bottom for text legibility,
     warmer amber at the top for atmosphere. */
  .cover-veil {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background:
      linear-gradient(180deg, rgba(10, 45, 33, 0.55) 0%, rgba(10, 45, 33, 0.85) 100%),
      radial-gradient(ellipse at 70% 12%, rgba(196, 134, 15, 0.25), transparent 60%);
  }
  .cover.has-image .cover-veil {
    background:
      linear-gradient(180deg, rgba(10, 45, 33, 0.45) 0%, rgba(10, 45, 33, 0.88) 100%),
      radial-gradient(ellipse at 50% 12%, rgba(0, 0, 0, 0.35), transparent 70%);
  }

  /* Boarding-pass ticket header at the top of the cover. Forest
     dark band with gold dashed border and a dashed arrow between
     the two stop names. */
  .cover-ticket {
    position: relative;
    z-index: 3;
    max-width: 1180px;
    margin: 0 auto 28px;
    background: rgba(10, 45, 33, 0.72);
    border: 1.5px solid #c9a84c;
    box-shadow: inset 0 0 0 2px rgba(10, 45, 33, 0.85);
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
    font-size: clamp(1rem, 1.9vw, 1.3rem);
    color: #f5f0e8;
    text-align: center;
    line-height: 1.15;
  }
  /* Same large font as the station name so the train time reads as
     part of the boarding-pass identity, not as metadata. */
  .cover-ticket-time {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-style: italic;
    font-size: clamp(1rem, 1.9vw, 1.3rem);
    color: #c9a84c;
    text-align: center;
    line-height: 1.15;
    margin-top: 2px;
  }
  .cover-ticket-date {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12.5px;
    color: #ede0cc;
    margin-top: 2px;
  }
  /* Schedule reference line beneath the cover ticket. Quiet italic
     so it doesn't compete with the route summary; the link uses
     gold to match the ticket frame. */
  .cover-ticket-note {
    position: relative;
    z-index: 3;
    max-width: 1180px;
    margin: 8px auto 28px;
    text-align: center;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12.5px;
    color: #ede0cc;
    opacity: 0.85;
  }
  .cover-ticket-note a {
    color: #c9a84c;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .cover-ticket-note a:hover { color: #f5f0e8; }
  .cover-ticket-arrow {
    color: #c9a84c;
    width: 60px;
    flex: none;
  }
  .cover-ticket-arrow svg { width: 100%; height: auto; display: block; }
  @media (max-width: 720px) {
    .cover-ticket { padding: 12px 14px; gap: 10px 12px; }
    .cover-ticket-arrow { transform: rotate(90deg); width: 30px; }
    .cover-ticket-end { min-width: 0; flex-basis: 100%; }
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
  /* Cover trip-name stays white on hover; the underline below the
     title is the only affordance that the H1 is editable. */
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
    /* "until you board" sits on the parent and reads in amber so
       the bigger ivory numbers carry the visual weight. Was the
       other way around until 2026-06-07; the amber numbers washed
       out against the forest band. */
    color: #c4860f;
    line-height: 1.2;
    margin: 14px 0 20px;
  }
  .cover-countdown strong {
    font-weight: 900;
    color: #f5f0e8;
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
  /* Primary gold - the main action. Matches the Recap button's
     softer #c9a84c tone rather than the harsher amber, so the
     primary CTA reads warm and editorial rather than aggressive. */
  .cover-add {
    background: #c9a84c;
    border-color: #c9a84c;
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

  /* Wrap-up CTA: ceremonial cream band on the cover after the
     trip's end date. Single button stamps the trip Wrapped, slides
     into the user's archive. Sits in the flow above the cover
     action row so it's hard to miss. */
  .wrap-cta {
    margin: 22px 0 6px;
    background: rgba(251, 246, 234, 0.92);
    border: 1.5px solid #c9a84c;
    border-radius: 6px;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    box-shadow: 0 6px 16px rgba(40, 30, 15, 0.18);
  }
  .wrap-cta-text {
    flex: 1 1 220px;
    min-width: 0;
  }
  .wrap-cta-kicker {
    display: block;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #7d3a1e;
    margin-bottom: 4px;
  }
  .wrap-cta-body {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #0a2d21;
    font-size: 14px;
    line-height: 1.45;
    margin: 0;
  }
  .wrap-cta-body em {
    font-style: normal;
    font-weight: 700;
    color: #7d3a1e;
  }
  .wrap-cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #c9a84c;
    color: #0a2d21;
    border: 2px solid #c9a84c;
    padding: 9px 18px;
    border-radius: 4px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12.5px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 160ms ease, transform 160ms ease, box-shadow 160ms ease;
    box-shadow: 0 3px 8px rgba(40, 30, 15, 0.22);
  }
  .wrap-cta-btn:hover:not(:disabled) {
    background: #d8b863;
    transform: translateY(-1px);
    box-shadow: 0 6px 14px rgba(40, 30, 15, 0.3);
  }
  .wrap-cta-btn:disabled { opacity: 0.6; cursor: progress; }

  /* Wrapped stamp: tilted passport cancellation pinned to the
     cover's top-right corner. Larger than the chapter postmarks
     because this is the trip's closing mark. */
  .wrapped-stamp {
    position: absolute;
    top: 60px;
    right: 28px;
    transform: rotate(-12deg);
    z-index: 3;
    pointer-events: none;
  }
  .wrapped-stamp-ring {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 140px;
    height: 140px;
    border: 4px solid #c9a84c;
    border-radius: 50%;
    background: rgba(125, 58, 30, 0.18);
    box-shadow: inset 0 0 0 6px rgba(251, 246, 234, 0.5), inset 0 0 0 7px rgba(201, 168, 76, 0.6);
    color: #c9a84c;
    font-family: 'Spline Sans', system-ui, sans-serif;
  }
  .wrapped-stamp-top,
  .wrapped-stamp-bot {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: #c9a84c;
  }
  .wrapped-stamp-top { margin-top: 12px; }
  .wrapped-stamp-bot { margin-bottom: 12px; }
  .wrapped-stamp-big {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 900;
    font-size: 26px;
    color: #f5f0e8;
    text-shadow: 0 1px 2px rgba(10, 45, 33, 0.4);
    line-height: 1;
    margin: 4px 0;
  }
  @media (max-width: 720px) {
    .wrapped-stamp {
      top: 12px;
      right: 12px;
      transform: rotate(-10deg) scale(0.7);
      transform-origin: top right;
    }
  }

  /* Toggle pill that collapses the cover collage on mobile. Only
     visible below 720px - desktop users always see the photos. */
  .collage-toggle {
    display: none;
    align-items: center;
    gap: 6px;
    margin: 12px auto 0;
    background: transparent;
    border: 1.5px dashed rgba(201, 168, 76, 0.7);
    color: #c9a84c;
    padding: 7px 14px;
    border-radius: 999px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease;
  }
  .collage-toggle:hover {
    background: #c9a84c;
    color: #0a2d21;
  }
  @media (max-width: 720px) {
    .collage-toggle { display: inline-flex; }
    .collage:not(.is-open) {
      display: none;
    }
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
    --base-tilt: var(--rot, 0deg);
    --base-lift: calc(var(--i, 0) * -4px);
    transform: rotate(var(--base-tilt)) translateY(var(--base-lift));
    transition: transform 0.35s cubic-bezier(.2,.7,.3,1);
    /* Gentle ambient sway: each card stagger-floats so the cluster
       reads as something pinned to a board in a passing breeze.
       The hover transform takes over by overriding `transform`. */
    animation: cover-card-float 7s ease-in-out infinite;
    animation-delay: calc(var(--i, 0) * -1.6s);
    transform-origin: 50% 100%;
  }
  .collage-card:hover {
    transform: rotate(0deg) translateY(-8px);
    z-index: 4;
    animation: none;
  }
  @keyframes cover-card-float {
    0%   { transform: rotate(var(--base-tilt)) translateY(var(--base-lift)) rotate(0deg); }
    50%  { transform: rotate(var(--base-tilt)) translateY(calc(var(--base-lift) - 6px)) rotate(0.8deg); }
    100% { transform: rotate(var(--base-tilt)) translateY(var(--base-lift)) rotate(0deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .collage-card { animation: none; }
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
  /* ===== Stop scenes =====
     Each scene is now an editorial chapter: a publication heading
     (kicker + display H2 + dashed rule), then a two-column body
     (65/35) with the timeline on the left and a flat postcard +
     stop-hook pull-quote on the right. Disciplined spacing, 2px
     solid rules, no rotation, no shadows inside content. Type
     and color tokens ported from the Guide's stop-page and /plan
     editorial pattern. */
  .scenes {
    background: #fbf6ea;
    background-image:
      repeating-linear-gradient(45deg, rgba(45, 30, 20, 0.03) 0, rgba(45, 30, 20, 0.03) 1px, transparent 1px, transparent 8px);
    color: #241f1a;
    /* Horizontal padding lives on the OUTER container so it doesn't
       get added on top of the centered max-width gap on wide
       viewports. Mirrors .before-board so chapter headings align
       exactly with "Pack the whole trip in one place." */
    padding: 0 24px;
  }
  .scene {
    position: relative;
    color: #241f1a;
    scroll-margin-top: 72px;
    /* Default is visible. The reveal-on-scroll animation only runs
       when JS adds .is-pre-reveal (immediately, then .is-revealed
       on intersection). If JS or the observer fail, scenes still
       show - they just don't animate in. Earlier opacity:0 default
       hid scenes entirely when the observer didn't fire on time. */
    transition: opacity 700ms cubic-bezier(.2,.7,.3,1), transform 700ms cubic-bezier(.2,.7,.3,1);
  }
  .scene.is-pre-reveal {
    opacity: 0;
    transform: translateY(28px);
  }
  .scene.is-pre-reveal.is-revealed {
    opacity: 1;
    transform: translateY(0);
  }
  /* Same pattern for the return-divider + foot + narrative bands. */
  .return-divider,
  .narrative,
  .foot {
    transition: opacity 700ms cubic-bezier(.2,.7,.3,1), transform 700ms cubic-bezier(.2,.7,.3,1);
  }
  .return-divider.is-pre-reveal,
  .narrative.is-pre-reveal,
  .foot.is-pre-reveal {
    opacity: 0;
    transform: translateY(28px);
  }
  .return-divider.is-pre-reveal.is-revealed,
  .narrative.is-pre-reveal.is-revealed,
  .foot.is-pre-reveal.is-revealed {
    opacity: 1;
    transform: translateY(0);
  }
  @media (prefers-reduced-motion: reduce) {
    .scene.is-pre-reveal,
    .return-divider.is-pre-reveal,
    .narrative.is-pre-reveal,
    .foot.is-pre-reveal {
      opacity: 1;
      transform: none;
      transition: none;
    }
  }
  .scene-inner {
    max-width: 1100px;
    margin: 0 auto;
    padding: 28px 0 56px;
  }

  /* Editorial section heading. Kicker (rust caps) + display H2 +
     metadata row (region · date · train time). No bottom rule -
     the Drawer accordions beneath provide their own visual
     separators. */
  .scene-head {
    padding-bottom: 16px;
    margin-bottom: 18px;
  }
  .scene-head .kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    color: #7d3a1e;
    font-size: 11px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .scene-name {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    font-size: clamp(2rem, 4.5vw, 3.2rem);
    line-height: 1.02;
    margin: 0 0 12px;
    letter-spacing: -0.01em;
    color: #0a2d21;
  }
  .scene-meta {
    display: inline-flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 10px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    font-weight: 700;
  }
  .scene-meta-region { color: #c4860f; letter-spacing: 0.32em; }
  .scene-meta-sep { color: rgba(125, 58, 30, 0.4); }
  .scene-meta-date {
    color: #7d3a1e;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 14.5px;
    letter-spacing: 0;
    text-transform: none;
    font-weight: 600;
  }
  /* Train time slot on the chapter meta row. Inherits the same
     italic Fraunces voice as the date so they read as a pair. */
  .scene-meta-time {
    color: #7d3a1e;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 14.5px;
    letter-spacing: 0;
    text-transform: none;
    font-weight: 600;
  }

  /* Two-column body: 65/35 like stop-page.css:84. Main holds the
     timeline (or empty state); aside holds a flat postcard and a
     rust-rule sidebar with the stop's editorial hook. Mobile
     collapses to a single column with the aside dropping below. */
  .scene-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 32px;
    align-items: start;
  }
  @media (min-width: 880px) {
    .scene-grid {
      grid-template-columns: 65% 35%;
      gap: 48px;
    }
  }

  .scene-aside {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .scene-postcard {
    margin: 0;
    background: #ede0cc;
    border: 2px solid #0a2d21;
  }
  .scene-postcard img {
    display: block;
    width: 100%;
    height: 200px;
    object-fit: cover;
  }
  .scene-aside-hook {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: 17px;
    line-height: 1.4;
    color: #7d3a1e;
    margin: 0;
    padding-left: 18px;
    border-left: 2px solid #7d3a1e;
  }
  .scene-aside-guide {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6e2e17;
    text-decoration: none;
    border-bottom: 1.5px dashed #c4860f;
    padding-bottom: 2px;
    align-self: flex-start;
  }
  .scene-aside-guide:hover { color: #0a2d21; border-color: #0a2d21; }

  /* Browse-the-Guide pill under each Schedule list. Opens the
     AddPlanModal pre-scoped to this stop with the category tabs
     (All / Eat / Sleep / Do / Shop) so the user can drop a Guide
     listing straight into the chapter. */
  .browse-guide-btn {
    margin-top: 16px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: 1.5px dashed #7d3a1e;
    color: #7d3a1e;
    padding: 8px 16px;
    border-radius: 999px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease;
  }
  .browse-guide-btn:hover {
    background: #7d3a1e;
    color: #fffdf6;
  }
  .browse-guide-plus {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 16px;
    line-height: 1;
  }

  /* Per-chapter Drawer stack. Each section (Booking checklist /
     Travel notes / Polaroids / Spending / Happening) lives in its
     own collapsed accordion so the chapter reads as five quiet
     ledger lines instead of five stacked editorial sections with
     dashed rules. The Drawer component handles its own border +
     shadow; the .scene-main wrapper just needs to space them. */
  .scene-main > :global(details.drawer) {
    margin-bottom: 10px;
  }
  .scene-main > :global(details.drawer:last-of-type) {
    margin-bottom: 0;
  }

  /* ===== Before You Board =====
     One trip-wide section between the narrative and the chapters.
     Dates live in the route picker now, so this section is just the
     trip-wide PackingList. */
  .before-board {
    background: #fbf6ea;
    /* Bottom padding shrinks so the next chapter sits right under
       the packing list rather than across a wall of cream; horizontal
       padding stays at 24px to align with .scene-inner. */
    padding: 56px 24px 28px;
  }
  .before-board-inner {
    max-width: 1100px;
    margin: 0 auto;
  }
  .before-board-head {
    margin-bottom: 22px;
  }
  .before-board-head h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    font-size: clamp(1.6rem, 3.4vw, 2.2rem);
    color: #0a2d21;
    margin: 6px 0 0;
    line-height: 1.2;
  }

  /* ===== Add another packing list =====
     Dashed-rust pill that mirrors the route picker's secondary
     button. Tap reveals an inline name input so the user names
     the list without a second modal. Pressing Enter or blurring
     commits via commitNewPackingList. */
  .bb-add-list {
    /* Equal breathing room above (Drawer to pill) and below (pill to
       Budget panel) so the dashed pill sits in symmetrical space. */
    margin-top: 28px;
    margin-bottom: 28px;
  }
  .bb-add-list-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: 1.5px dashed #7d3a1e;
    color: #7d3a1e;
    padding: 8px 16px;
    border-radius: 4px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease;
  }
  .bb-add-list-btn:hover {
    background: #7d3a1e;
    color: #fffdf6;
  }
  .bb-add-list-plus {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 16px;
    line-height: 1;
  }
  .bb-add-list-input {
    width: 100%;
    max-width: 380px;
    background: #fffdf6;
    border: 1.5px solid #8b6a3a;
    border-radius: 3px;
    padding: 9px 12px;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 15px;
    color: #0a2d21;
    outline: none;
  }
  .bb-add-list-input:focus { border-color: #7d3a1e; }

  /* "Delete this list" link inside a named accordion's body. Quiet
     italic so it doesn't compete with the items themselves. */
  .bb-list-foot {
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px dashed rgba(125, 58, 30, 0.3);
    text-align: right;
    display: flex;
    justify-content: flex-end;
    gap: 14px;
    flex-wrap: wrap;
  }
  .bb-list-delete {
    background: transparent;
    border: 0;
    color: #7d3a1e;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    cursor: pointer;
    padding: 4px 6px;
  }
  .bb-list-delete:hover { color: #6e2e17; text-decoration: underline; }
  .bb-rename-form {
    flex: 1;
    margin: 0;
  }
  .bb-rename-form .bb-add-list-input {
    max-width: none;
  }

  /* ===== Trip budget panel =====
     Lives in its own flat block in Before You Board (not a Drawer
     since 2026-06-07; the figure should stay visible without
     unfurling). The header mirrors a Drawer summary row so the
     band still reads as "the same kind of thing" alongside the
     packing-list accordions above it. */
  .bb-budget-flat {
    background: #fbf6ea;
    border: 1px solid rgba(125, 58, 30, 0.18);
    border-radius: 4px;
    padding: 14px 18px 18px;
  }
  .bb-budget-flat-head {
    display: flex;
    /* Pin the headline figure / button to the bottom of the text
       block so it sits on the "Budget" h3 baseline, not floating
       up at the midpoint of the kicker + title stack. */
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .bb-budget-flat-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .bb-budget-flat-kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #c4860f;
  }
  .bb-budget-flat-title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 20px;
    color: #0a2d21;
    margin: 0;
    line-height: 1.1;
  }

  /* Live figure pinned to the title line. Big, tappable, always
     visible. Updates as the user spends; tapping opens the inline
     editor so they can adjust the target or top up. */
  .bb-budget-headline {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
  }
  .bb-budget-headline-btn {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    background: transparent;
    border: 0;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    color: #0a2d21;
    transition: background 140ms ease, transform 140ms ease;
  }
  .bb-budget-headline-btn:hover {
    background: rgba(201, 168, 76, 0.18);
    transform: translateY(-1px);
  }
  .bb-budget-headline-figure {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(22px, 3vw, 28px);
    color: #0a2d21;
    line-height: 1;
  }
  .bb-budget-headline-btn.is-over .bb-budget-headline-figure {
    color: #c4860f;
  }
  .bb-budget-headline-tag {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
    align-self: center;
  }
  .bb-budget-headline-btn.is-over .bb-budget-headline-tag { color: #c4860f; }
  .bb-budget-headline-edit {
    color: #7d3a1e;
    margin-left: 2px;
    opacity: 0.7;
    align-self: center;
  }
  .bb-budget-headline-btn:hover .bb-budget-headline-edit { opacity: 1; }

  /* Inline edit form. Same slot as the headline figure so swapping
     between view and edit doesn't shift any other layout. */
  .bb-budget-inline-edit {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .bb-budget-inline-prefix {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 22px;
    color: #7d3a1e;
    line-height: 1;
  }
  .bb-budget-inline-input {
    width: 110px;
    background: #fffdf6;
    border: 1.5px solid #8b6a3a;
    border-radius: 3px;
    padding: 6px 10px;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 22px;
    color: #0a2d21;
    outline: none;
    -moz-appearance: textfield;
  }
  .bb-budget-inline-input::-webkit-outer-spin-button,
  .bb-budget-inline-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .bb-budget-inline-input:focus { border-color: #7d3a1e; }

  /* Sub-stats: small italic "$X spent of $Y target" line under the
     headline so the user can see both halves of the math without
     unfurling anything. */
  .bb-budget-substats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    font-size: 13.5px;
    margin: 4px 0 10px;
  }
  .bb-budget-substats strong {
    font-style: normal;
    font-weight: 700;
    color: #0a2d21;
  }
  .bb-budget-substats.is-over strong { color: #c4860f; }
  .bb-budget-sub-sep {
    color: rgba(125, 58, 30, 0.45);
  }

  .bb-budget {
    padding: 4px 2px 6px;
  }
  /* Bigger, brighter rust button with a gold ring so it reads as a
     real call-to-action against the cream paper panel. Earlier
     spec was a narrower rust pill with cream text - the contrast
     held but the button itself looked dim against the warm linen
     background. */
  .bb-budget-set {
    background: #7d3a1e;
    color: #ffffff;
    border: 2px solid #c9a84c;
    padding: 11px 22px;
    border-radius: 4px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 13.5px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 2px 0 rgba(74, 31, 14, 0.35);
    transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
  }
  .bb-budget-set:hover {
    background: #8e4524;
    border-color: #d8b863;
    transform: translateY(-1px);
  }
  .bb-budget-hint {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    font-size: 13px;
    line-height: 1.5;
    margin: 10px 0 0;
    max-width: 60ch;
  }
  .bb-budget-hint em {
    font-style: italic;
    color: #7d3a1e;
  }
  .bb-budget-edit {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .bb-budget-edit-prefix {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 20px;
    color: #7d3a1e;
  }
  .bb-budget-input {
    background: #fffdf6;
    border: 1.5px solid #8b6a3a;
    border-radius: 3px;
    padding: 8px 12px;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 20px;
    color: #0a2d21;
    outline: none;
    width: 140px;
  }
  .bb-budget-input:focus { border-color: #7d3a1e; }
  .bb-budget-edit-hint {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12.5px;
    color: #5a4f3d;
  }
  .bb-budget-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 16px;
    padding-bottom: 12px;
  }
  .bb-budget-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .bb-budget-stat-kicker {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    font-weight: 800;
    color: #7d3a1e;
  }
  .bb-budget-stat-num {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(20px, 3vw, 26px);
    color: #0a2d21;
    line-height: 1.05;
    background: transparent;
    border: 0;
    padding: 0;
    text-align: left;
  }
  .bb-budget-target-btn {
    cursor: pointer;
    border-bottom: 1px dashed rgba(125, 58, 30, 0.4);
    transition: color 140ms ease, border-color 140ms ease;
  }
  .bb-budget-target-btn:hover { color: #7d3a1e; border-color: #7d3a1e; }
  .bb-budget-stat-spent { color: #c4860f; }
  .bb-budget-stat-left { color: #0a2d21; }
  .bb-budget-stat-left.is-over { color: #c4860f; }
  /* Progress bar below the stats. Forest fill normally; flips to
     amber when the user has burned past 100%. */
  .bb-budget-bar {
    height: 8px;
    background: rgba(125, 58, 30, 0.12);
    border-radius: 4px;
    overflow: hidden;
  }
  .bb-budget-bar-fill {
    display: block;
    height: 100%;
    background: #0a2d21;
    border-radius: 4px;
    transition: width 240ms ease, background 240ms ease;
  }
  .bb-budget-bar-fill.is-over {
    background: #c4860f;
  }

  /* ===== Chapter divider =====
     Direct port of the Guide's pl-divider pattern (plan-page.css
     405-418). A thin forest rule across the cream page with a
     42px circular forest badge centered, holding a train icon.
     Italic Fraunces travel-time floats above the rule. 48px
     vertical margin keeps section rhythm. */
  /* Chapter divider: a thin forest rule with a 42px circular forest
     badge centered on it, and the italic travel-time on its own
     line below the badge (so it never collides with the icon).
     Mirrors the Guide's pl-divider pattern. */
  .chapter-divider {
    position: relative;
    max-width: 1080px;
    margin: 48px auto;
    padding: 0 24px;
    text-align: center;
  }
  .chapter-divider-rule {
    position: absolute;
    left: 24px;
    right: 24px;
    top: 21px;
    height: 1px;
    background: rgba(10, 45, 33, 0.35);
    z-index: 0;
  }
  .chapter-divider-badge {
    position: relative;
    z-index: 1;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: #0a2d21;
    color: #c9a84c;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 6px 14px rgba(40, 30, 20, 0.18);
  }
  .chapter-divider-badge svg { width: 20px; height: 20px; }
  .chapter-divider-time {
    display: block;
    margin-top: 14px;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: 14px;
    color: #5a4f3d;
    white-space: nowrap;
  }

  /* Postmark stamp pinned to the right side of each chapter divider.
     Reads as a passport cancellation: small forest-bordered circle,
     stop name in italic Fraunces in the middle, the arriving date
     below, the brand wordmark curved across the top. Tilted -8deg
     so it feels stamped rather than typeset. */
  .postmark {
    position: absolute;
    top: 50%;
    right: 24px;
    transform: translateY(-50%) rotate(-8deg);
    z-index: 2;
    pointer-events: none;
  }
  .postmark-ring {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 88px;
    height: 88px;
    border: 2px solid #7d3a1e;
    border-radius: 50%;
    background: rgba(251, 246, 234, 0.35);
    box-shadow: inset 0 0 0 4px rgba(251, 246, 234, 0.7), inset 0 0 0 5px rgba(125, 58, 30, 0.4);
    color: #7d3a1e;
    font-family: 'Spline Sans', system-ui, sans-serif;
  }
  .postmark-arc {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 7.5px;
    font-weight: 800;
    letter-spacing: 0.28em;
    text-transform: uppercase;
  }
  .postmark-arc--top { top: 10px; }
  .postmark-arc--bot { bottom: 10px; }
  .postmark-stop {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.04em;
    color: #0a2d21;
    text-align: center;
    max-width: 70px;
    line-height: 1.05;
    text-transform: none;
    padding: 0 6px;
    overflow-wrap: anywhere;
  }
  /* On narrow viewports the postmark would overlap the divider
     label. Hide it below 720px - the time line still reads clearly. */
  @media (max-width: 720px) {
    .postmark { display: none; }
  }

  /* Return-trip break: a heavier divider with a forest small-caps
     label centered between two gold rules so the user can see at
     a glance that the train has turned around. */
  .return-divider {
    max-width: 1080px;
    margin: 56px auto 40px;
    padding: 0 24px;
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .return-divider-rule {
    flex: 1;
    height: 0;
    border-top: 1px dashed rgba(201, 168, 76, 0.7);
  }
  .return-divider-label {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: #0a2d21;
    background: #fbf6ea;
    padding: 6px 14px;
    border: 1.5px solid #c9a84c;
    border-radius: 999px;
    white-space: nowrap;
  }

  /* Return cover-ticket chips wear a forest kicker so the user can
     see which chips belong to the return leg at a glance. */
  .cover-ticket-end--return .cover-ticket-kicker {
    color: #c9a84c;
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

  /* ===== Sign off =====
     Forest band bookend with the Bon voyage signature and a small
     vintage stamp pinned in the corner. The stamp is a direct port
     of the Guide's pl-pass-stamp (plan-page.css:1110-1142): circular
     double-border ring, amber fill, dotted inner ring, rotated. */
  .foot {
    position: relative;
    background: linear-gradient(180deg, #0e3b2c 0%, #0a2d21 100%);
    color: #f5f0e8;
    padding: 64px 24px;
    text-align: center;
    overflow: hidden;
  }
  .foot h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: clamp(1.8rem, 5vw, 2.6rem);
    color: #c9a84c;
    margin: 0 0 8px;
  }
  .foot p {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #cad7cf;
    margin: 0 0 28px;
  }
  .foot-actions { justify-content: center; margin-top: 0; }

  .foot-stamp {
    position: absolute;
    top: 24px;
    right: 32px;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    border: 3px double #c9a84c;
    background: radial-gradient(circle, rgba(196, 134, 15, 0.08) 0%, transparent 65%);
    box-shadow:
      0 6px 14px rgba(0, 0, 0, 0.3),
      inset 0 0 0 6px transparent,
      inset 0 0 0 7px rgba(201, 168, 76, 0.35);
    color: #c9a84c;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    transform: rotate(-8deg);
    font-family: 'Fraunces', Georgia, serif;
    line-height: 1;
    text-align: center;
    user-select: none;
  }
  .foot-stamp::before,
  .foot-stamp::after {
    content: '';
    position: absolute;
    left: 50%;
    width: 26px;
    height: 1px;
    background: #c9a84c;
    opacity: 0.7;
    transform: translateX(-50%);
  }
  .foot-stamp::before { top: 18px; }
  .foot-stamp::after  { bottom: 18px; }
  .foot-stamp-line {
    display: block;
  }
  .foot-stamp-line--top {
    font-size: 8.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-weight: 700;
    margin-top: 4px;
  }
  .foot-stamp-line--big {
    font-style: italic;
    font-weight: 700;
    font-size: 17px;
  }
  .foot-stamp-line--bot {
    font-size: 8.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-weight: 700;
    margin-bottom: 4px;
  }
  @media (max-width: 720px) {
    .foot-stamp {
      width: 78px; height: 78px;
      top: 14px; right: 14px;
    }
    .foot-stamp-line--big { font-size: 14px; }
  }

  /* ===== Backup band =====
     Sits above the danger zone so users see the "download a copy"
     option before the "delete this trip" one. Same cream/dashed
     vocabulary as the rest of the page. */
  .backup {
    background: #f3ece0;
    padding: 24px 24px 0;
  }
  .backup-inner {
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
  .backup p {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 4px 0 0;
    max-width: 60ch;
  }
  .backup-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    color: #7d3a1e;
    border: 1.5px solid #7d3a1e;
    padding: 9px 16px;
    border-radius: 4px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease, transform 160ms ease;
  }
  .backup-btn:hover {
    background: #7d3a1e;
    color: #fffdf6;
    transform: translateY(-1px);
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
