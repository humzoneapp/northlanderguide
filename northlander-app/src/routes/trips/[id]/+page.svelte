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
    updateTrip,
    setTripRoute,
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
  import { listBudgetEntries, totalOf } from '$lib/stores/budget.js';
  import { listUserEvents } from '$lib/stores/user-events.js';

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
  import ShareModal from '$lib/components/ShareModal.svelte';
  import AddPlanModal from '$lib/components/AddPlanModal.svelte';
  import TripChapter from '$lib/components/trip/TripChapter.svelte';
  import TripBeforeBoard from '$lib/components/trip/TripBeforeBoard.svelte';
  import CoverTicket from '$lib/components/trip/CoverTicket.svelte';
  import WrapCta from '$lib/components/trip/WrapCta.svelte';
  import CoverCollage from '$lib/components/trip/CoverCollage.svelte';
  import CoverActions from '$lib/components/trip/CoverActions.svelte';
  import CoverPhoto from '$lib/components/trip/CoverPhoto.svelte';
  import CoverTitleEdit from '$lib/components/trip/CoverTitleEdit.svelte';
  import CoverStats from '$lib/components/trip/CoverStats.svelte';
  import TodayBand from '$lib/components/trip/TodayBand.svelte';
  import TripSignOff from '$lib/components/trip/TripSignOff.svelte';
  import TripBackup from '$lib/components/trip/TripBackup.svelte';
  import TripDangerZone from '$lib/components/trip/TripDangerZone.svelte';
  import { pushToast } from '$lib/stores/toasts.js';
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
  /* User-added events surface inside EventsAlongRoute. We also
     load them at the page level so the per-chapter StopMap can pin
     them alongside bookings. */
  let userEventsAll = [];

  /* Modal flags */
  let showStopPicker = false;
  let showShareModal = false;
  let showAddPlan = false;
  let addPlanStop = '';
  let addPlanKind = 'all';
  let addPlanFromReturn = false;

  /* Inline rename state on the cover H1 */
  /* Custom cover photo for the banner. Built from trip.coverBlob
     when present; revoked whenever the row swaps out or the page
     unmounts so we don't leak object URLs across navigations. The
     CoverPhoto component owns its own file input - this state only
     drives the banner background + the pill's Upload/Replace label. */
  let coverObjectUrl = '';
  let coverUploadBusy = false;

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

  async function handleCoverUpload(file) {
    if (!trip || coverUploadBusy || !file) return;
    coverUploadBusy = true;
    try {
      const updated = await setTripCover(trip.id, file);
      if (updated) trip = updated;
    } catch (err) {
      console.error(err);
    } finally {
      coverUploadBusy = false;
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

  /* Parallax: shift the cover banner image up at 25% of scroll so
     the photo feels like it sits behind glass. Listener attached
     in onMount, torn down on destroy.

     Disabled below 720px because iOS Safari's URL bar collapses
     and re-expands during scroll, which jumps window.scrollY by
     60-80px on every direction change. With parallax on, the
     translateY transform fought the 80ms CSS transition on each
     URL-bar tick and the background image visibly twitched/
     vibrated. Decorative effect, not worth the seasickness on
     phones. Desktop is unaffected. */
  let coverParallax = 0;
  function handleScroll() {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 720) {
      coverParallax = 0;
      return;
    }
    coverParallax = Math.min(window.scrollY * 0.25, 240);
  }
  /* Trip-wide packing + budget UI (add/rename/delete lists, edit
     target) lives in TripBeforeBoard. The parent keeps only the
     aggregate ledger total since the cover banner tweens it into
     the "Spent" stat. */
  $: dirMeta = trip ? DIRECTIONS.find((d) => d.id === (trip.direction || 'northbound')) || DIRECTIONS[0] : null;
  $: depClock = trip ? departureFor(trip.direction || 'northbound') : '09:00';
  $: unassigned = bookings.filter((b) => !b.stopId);
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

  /* First five stop photos for the cover collage. Tilts vary by
     index so the cluster looks scattered. CoverCollage owns the
     open/closed state internally. */
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

  /* TodayBand's Jump CTA reuses the same STICKY_OFFSET so the
     scrolled-into-view chapter sits below the topbar + sticky TOC
     by the same amount as a TOC chip click. */
  function jumpToChapter(id) {
    if (typeof document === 'undefined') return;
    const target = document.getElementById(id);
    if (!target) return;
    const y = target.getBoundingClientRect().top + window.scrollY - STICKY_OFFSET;
    window.scrollTo({ top: y, behavior: 'smooth' });
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

    [bookings, diary, photos, packingRows, budgetEntries, userEventsAll] = await Promise.all([
      listBookings(trip.id),
      listDiaryEntries(trip.id),
      listPhotos(trip.id),
      listPackingItems(trip.id),
      listBudgetEntries(trip.id),
      listUserEvents(trip.id)
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

  /* Inline trip rename. CoverTitleEdit owns the edit state + input
     focus; this just persists the new name when the component asks. */
  async function handleRename(next) {
    if (!trip || !next || next === trip.name) return;
    const updated = await renameTrip(trip.id, next);
    if (updated) trip = updated;
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
  <!-- On the empty-trip "Pick your route" screen the cover banner
       is the only painted content, so we flip the body background
       to forest while this state is mounted. Any space between the
       cover and the footer reads as a continuous forest band
       instead of leaving a body-coloured gap. The rule only paints
       while this page is active; navigating away unmounts the
       <style> block and the body returns to ivory. -->
  {#if trip && stops.length === 0}
    <style>
      body { background-color: #0a2d21 !important; background-image: none !important; }
    </style>
  {/if}
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

  <!-- "Today on the route" band: only renders when today's date sits
       inside the trip window. Sits above the cover so a user opening
       the app during the trip greets "where am I right now" before
       the editorial cover. Self-hides for pre-trip + wrapped trips. -->
  <TodayBand
    {stops}
    {returnStops}
    direction={trip.direction || 'northbound'}
    wrapped={tripIsWrapped}
    on:jump={(e) => jumpToChapter(e.detail.id)}
  />

  <!-- ===== Editorial cover banner =====
       The arriving stop's hero photo (or the user's custom upload)
       sits behind a forest gradient overlay. A boarding-pass header
       runs across the top: FROM Toronto Union -> TO Bracebridge,
       date and direction. The user's name, countdown and stats sit
       below in the cream/ivory editorial style. A small "Change
       cover" button in the corner lets the user swap the banner
       image at any time. -->
  <header id="trip-top" class="cover" class:has-image={!!bannerImage} class:is-empty-cover={stops.length === 0}>
    <div
      class="cover-bg"
      class:has-image={!!bannerImage}
      style={`${bannerImage ? `background-image:url('${bannerImage}');` : ''}transform: translateY(${coverParallax}px) scale(1.08);`}
      aria-hidden="true"
    ></div>
    <div class="cover-veil" aria-hidden="true"></div>

    <CoverTicket
      {stops}
      {returnStops}
      direction={trip.direction || 'northbound'}
    />

    {#if stops.length > 0}
      <CoverPhoto
        hasCustomPhoto={!!coverObjectUrl}
        busy={coverUploadBusy}
        on:upload={(e) => handleCoverUpload(e.detail.file)}
        on:reset={handleCoverReset}
      />
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

        <CoverTitleEdit
          name={trip.name}
          on:save={(e) => handleRename(e.detail.name)}
        />

        {#if stops.length > 0}
          <CoverStats
            {tripDateLine}
            dirLabel={dirMeta?.label || 'Northbound'}
            {countdown}
            wrapped={tripIsWrapped}
            {stopsVisited}
            plansCount={bookings.length}
            spent={budgetTotal}
            showSpent={budgetEntries.length > 0}
          />

          <!-- Wrap-up CTA: surfaces after the trip's end date passes
               and disappears once the user stamps it Wrapped. -->
          {#if tripIsPast && !tripIsWrapped}
            <WrapCta endDate={tripEndDate} busy={wrapBusy} on:wrap={handleWrapTrip} />
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

        <CoverActions
          tripId={trip.id}
          stopCount={stops.length}
          on:pickRoute={() => (showStopPicker = true)}
          on:editRoute={() => (showStopPicker = true)}
          on:share={() => (showShareModal = true)}
        />
      </div>

      <CoverCollage photos={collagePhotos} />
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

    <!-- Pre-departure section: trip-wide packing lists + budget panel.
         All the inline rename / add-list / budget-edit state lives
         inside TripBeforeBoard; the parent reloads after each save. -->
    <TripBeforeBoard
      {trip}
      {packingRows}
      {budgetEntries}
      weatherStops={weatherStopsList}
      on:change={load}
    />

    <!-- ===== Stop scenes =====
         Each chapter is a TripChapter component instance; the
         shared chapter markup lives in src/lib/components/trip/
         TripChapter.svelte. Outbound chapters use the trip's
         direction; the return block below uses the opposite. -->
    <section class="scenes">
      {#each stops as stop, i}
        <TripChapter
          {stop}
          id={`scene-${i}`}
          kicker={i === 0 ? 'Departure' : `Stop ${i}`}
          kind="outbound"
          direction={trip.direction || 'northbound'}
          tripId={trip.id}
          stopIds={trip.stopIds || []}
          departureClock={depClock}
          refreshKey={dataVersion}
          {bookings}
          {diary}
          {photos}
          {budgetEntries}
          {userEventsAll}
          on:change={load}
          on:openAddPlan={(e) => openAddPlan(e.detail.stopId, e.detail.kind, e.detail.fromReturn)}
        />

        {#if i < stops.length - 1}
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
          <TripChapter
            {stop}
            id={`scene-return-${j}`}
            kicker={j === returnStops.length - 1 ? 'Return' : `Return ${j + 1}`}
            kind="return"
            direction={(trip.direction || 'northbound') === 'northbound' ? 'southbound' : 'northbound'}
            tripId={trip.id}
            stopIds={trip.stopIds || []}
            departureClock={depClock}
            refreshKey={dataVersion}
            {bookings}
            {diary}
            {photos}
            {budgetEntries}
            {userEventsAll}
            on:change={load}
            on:openAddPlan={(e) => openAddPlan(e.detail.stopId, e.detail.kind, e.detail.fromReturn)}
          />

          {#if j < returnStops.length - 1}
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

  <TripSignOff tripId={trip.id} />
  <TripBackup tripId={trip.id} />
  <TripDangerZone on:delete={handleDelete} />

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
    /* Outer gutter mirrors .crumbs so both bands push their inner
       content the same 24px from the viewport edge on wide
       screens. Without this the TOC's max-width container sat
       inset 24px further than the breadcrumb above it. */
    padding: 0 24px;
    position: sticky;
  }
  /* Fade-out gradient on the right edge of the TOC band on mobile
     so the last chip is visibly cropped - a "there's more, swipe
     left" affordance. Sits inside the band over the scrollable
     row but with pointer-events: none so it never blocks taps. */
  .trip-toc::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 48px;
    background: linear-gradient(to right, rgba(251, 246, 234, 0) 0%, rgba(251, 246, 234, 0.95) 75%, #fbf6ea 100%);
    pointer-events: none;
    z-index: 1;
    opacity: 0;
    transition: opacity 160ms ease;
  }
  .trip-toc.is-scrollable::after {
    opacity: 1;
  }
  .trip-toc-row {
    display: flex;
    align-items: center;
    gap: 6px;
    /* Vertical padding only - horizontal gutter lives on the
       sticky band so the row's max-width container behaves like
       .crumbs-inner. */
    padding: 10px 0;
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
    .trip-toc {
      top: 48px;
      /* Keep left gutter at 24px so the first chip lines up with
         the breadcrumb above. Drop the right gutter to 0 so the
         row can scroll right past the viewport edge - the fade
         gradient (::after) signals that more chips sit beyond. */
      padding: 0 0 0 24px;
    }
    /* Always show the fade on mobile so users see the "scroll for
       more" affordance whether or not the chips actually overflow
       (and they almost always do on phones). */
    .trip-toc::after {
      opacity: 1;
      width: 56px;
    }
    .trip-toc-row {
      padding: 8px 0;
      gap: 4px;
      /* Trailing padding inside the row so the user can keep
         flicking past the last chip without it sticking to the
         very edge. */
      padding-right: 32px;
    }
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
  /* Empty-trip cover stays at its natural content size. The body
     bg flips to forest via the <svelte:head> rule below so any
     space between the cover bottom and the cream footer reads as
     a continuous forest band, not a body-coloured gap. */
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

  /* Boarding-pass ticket strip styles live in CoverTicket.svelte. */

  /* Cover photo upload pill + reset link styles live in CoverPhoto.svelte. */
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

  /* H1 + inline rename styles live in CoverTitleEdit.svelte. */

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
  /* Cover dateline + countdown + stats grid styles live in
     CoverStats.svelte. */

  /* Cover action buttons live in CoverActions.svelte and the foot
     Save-as-PDF link lives in TripSignOff.svelte. */

  /* Wrap-up CTA styles live in WrapCta.svelte. */

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

  /* Cover collage styles live in CoverCollage.svelte. */

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
  /* Scene styles (.scene, .scene-head, .scene-name, .scene-meta,
     .scene-grid, .scene-aside, .scene-postcard, .browse-guide-btn,
     .scene-main > drawer spacing) all live in TripChapter.svelte
     since the chapter markup moved there. The reveal-on-scroll
     classes for .scene use :global() in TripChapter so the parent's
     IntersectionObserver still drives the animation. The other three
     bands (return divider, narrative, foot) still get their reveal
     transition styles below since they remain in this file. */
  /* Reveal styles for .scene and .foot live in their owning
     components (TripChapter, TripSignOff) since the markup moved
     there. The two bands still in this file get theirs here. */
  .return-divider,
  .narrative {
    transition: opacity 700ms cubic-bezier(.2,.7,.3,1), transform 700ms cubic-bezier(.2,.7,.3,1);
  }
  .return-divider.is-pre-reveal,
  .narrative.is-pre-reveal {
    opacity: 0;
    transform: translateY(28px);
  }
  .return-divider.is-pre-reveal.is-revealed,
  .narrative.is-pre-reveal.is-revealed {
    opacity: 1;
    transform: translateY(0);
  }
  @media (prefers-reduced-motion: reduce) {
    .return-divider.is-pre-reveal,
    .narrative.is-pre-reveal {
      opacity: 1;
      transform: none;
      transition: none;
    }
  }

  /* Before You Board styles (.before-board, .bb-*) all live in
     TripBeforeBoard.svelte since the section markup moved there. */

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
  /* Sign-off, Backup, and Danger Zone styles live in their owning
     components: TripSignOff, TripBackup, TripDangerZone. */
</style>
