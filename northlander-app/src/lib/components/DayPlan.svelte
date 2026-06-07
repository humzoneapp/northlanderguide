<script>
  /* ==================================================================
     Day plan timeline.

     Stitches a chapter's bookings, diary entries, and spending into
     one vertical timeline so the user can see their day at a glance
     without flipping between drawers. Sort key is:
       1. Booking startTime (HH:MM) when present
       2. Otherwise createdAt timestamp

     Pure read surface - all writes still happen in the dedicated
     drawers above. The timeline is a summary view.
     ================================================================== */

  import BookingKindIcon from './BookingKindIcon.svelte';
  import { BOOKING_KINDS } from '$lib/stores/bookings.js';
  import { BUDGET_CATEGORIES, formatAmount } from '$lib/stores/budget.js';
  import { renderDiaryText } from '$lib/utils/diary-html.js';

  /** @type {Array} */
  export let bookings = [];
  /** @type {Array} */
  export let diary = [];
  /** @type {Array} */
  export let budgetEntries = [];

  /* Build the unified, sorted list. Each entry carries its kind so
     the markup can branch on icon + label format. Bookings without
     a startTime sort by createdAt next to the rest. */
  $: items = buildItems(bookings, diary, budgetEntries);

  function buildItems(bks, dy, bg) {
    const out = [];
    if (Array.isArray(bks)) {
      for (const b of bks) {
        out.push({
          kind: 'booking',
          row: b,
          time: b.startTime || null,
          sortTimeMin: timeToMin(b.startTime),
          createdAt: b.createdAt || 0
        });
      }
    }
    if (Array.isArray(dy)) {
      for (const d of dy) {
        out.push({
          kind: 'diary',
          row: d,
          time: null,
          sortTimeMin: null,
          createdAt: d.createdAt || 0
        });
      }
    }
    if (Array.isArray(bg)) {
      for (const e of bg) {
        out.push({
          kind: 'spend',
          row: e,
          time: null,
          sortTimeMin: null,
          createdAt: e.createdAt || 0
        });
      }
    }
    /* Items with an explicit time anchor sort by clock; items
       without slot in by creation order. */
    out.sort((a, b) => {
      if (a.sortTimeMin != null && b.sortTimeMin != null) return a.sortTimeMin - b.sortTimeMin;
      if (a.sortTimeMin != null) return -1;
      if (b.sortTimeMin != null) return 1;
      return a.createdAt - b.createdAt;
    });
    return out;
  }

  function timeToMin(hhmm) {
    if (!hhmm || typeof hhmm !== 'string') return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function formatClock(hhmm) {
    if (!hhmm) return '';
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return hhmm;
    const h = Number(m[1]);
    const mm = m[2];
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
    return `${h12}:${mm} ${period}`;
  }

  function bookingKindLabel(id) {
    const k = BOOKING_KINDS.find((x) => x.id === id);
    return k ? k.label : 'Plan';
  }
  function budgetCategoryLabel(id) {
    const c = BUDGET_CATEGORIES.find((x) => x.id === id);
    return c ? c.label : 'Other';
  }
  function budgetCategoryColor(id) {
    const c = BUDGET_CATEGORIES.find((x) => x.id === id);
    return c ? c.color : '#5a4f3d';
  }

  /* Diary entries can carry rich HTML (stickers, bold, etc) - keep
     it inline but render through the same sanitizer the diary uses
     so the timeline excerpt matches the body. */
  function diaryExcerpt(entry) {
    const html = renderDiaryText(entry?.text || '');
    /* Strip tags for a one-line preview - we render the safe HTML
     too on hover-like expansion if we add it later, but the timeline
     prefers a clean text excerpt for density. */
    const text = html.replace(/<[^>]+>/g, '').trim();
    return text.length > 140 ? text.slice(0, 137).trimEnd() + '...' : text;
  }
</script>

{#if items.length === 0}
  <p class="empty">
    Nothing's lined up for this stop yet. Pin a booking, drop a note, or log a spend in the drawers below and they'll show up here in chronological order.
  </p>
{:else}
  <ol class="timeline">
    {#each items as item (item.kind + '-' + item.row.id)}
      <li class="item">
        <span class="rail" aria-hidden="true">
          <span class="dot dot-{item.kind}"></span>
        </span>
        <div class="body">
          <header class="row-head">
            <span class="time">
              {item.time ? formatClock(item.time) : '—'}
            </span>
            {#if item.kind === 'booking'}
              <span class="kind-pill" title={bookingKindLabel(item.row.kind)}>
                <BookingKindIcon kind={item.row.kind} size={14} />
              </span>
            {:else if item.kind === 'spend'}
              <span
                class="kind-pill kind-pill--spend"
                style={`background: ${budgetCategoryColor(item.row.category)}; color: #fffdf6;`}
                title={budgetCategoryLabel(item.row.category)}
              >$</span>
            {:else}
              <span class="kind-pill kind-pill--diary" title="Diary entry">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 4 H18 a2 2 0 0 1 2 2 V20 H6 a2 2 0 0 1 -2 -2 Z"/>
                  <path d="M4 18 V4"/>
                </svg>
              </span>
            {/if}
          </header>

          {#if item.kind === 'booking'}
            <h4 class="title">{item.row.title}</h4>
            {#if item.row.address}
              <p class="meta">{item.row.address}</p>
            {/if}
          {:else if item.kind === 'spend'}
            <h4 class="title">{item.row.label}</h4>
            <p class="meta">{budgetCategoryLabel(item.row.category)} &middot; {formatAmount(item.row.amount)}</p>
          {:else}
            {@const excerpt = diaryExcerpt(item.row)}
            <p class="excerpt">{excerpt}</p>
          {/if}
        </div>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .empty {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 4px 0;
    line-height: 1.5;
  }
  .timeline {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .item {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 8px 0 14px;
    position: relative;
  }
  /* Dashed gold vertical rail that ties the dots together. Drawn
     on the rail column so it doesn't bleed past the last item. */
  .rail {
    flex: 0 0 auto;
    width: 18px;
    align-self: stretch;
    display: flex;
    justify-content: center;
    position: relative;
    padding-top: 6px;
  }
  .rail::before {
    content: '';
    position: absolute;
    top: 16px;
    bottom: -6px;
    left: 50%;
    border-left: 1.5px dashed rgba(201, 168, 76, 0.6);
    transform: translateX(-50%);
  }
  .item:last-child .rail::before { display: none; }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #c9a84c;
    border: 2px solid #7d3a1e;
    box-shadow: 0 2px 4px rgba(40, 30, 15, 0.16);
    z-index: 1;
  }
  .dot-spend { background: #c4860f; }
  .dot-diary { background: #fbf6ea; }
  .body {
    flex: 1;
    min-width: 0;
  }
  .row-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }
  .time {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #7d3a1e;
    flex: 0 0 auto;
  }
  .kind-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(125, 58, 30, 0.12);
    color: #7d3a1e;
  }
  .kind-pill--diary { background: rgba(10, 45, 33, 0.08); color: #0a2d21; }
  .kind-pill--spend {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 12px;
  }
  .title {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 15px;
    color: #0a2d21;
    margin: 0;
    line-height: 1.25;
  }
  .meta {
    margin: 2px 0 0;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    color: #5a4f3d;
  }
  .excerpt {
    margin: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #241f1a;
    font-size: 14px;
    line-height: 1.5;
  }
</style>
