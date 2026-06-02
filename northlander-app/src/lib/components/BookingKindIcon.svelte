<script>
  /* ==================================================================
     Single SVG glyph for each booking kind.

     The shapes were authored inline in BookingChecklist first, then
     copied into the print and itinerary views. Extracting them here
     keeps the five kinds visually consistent across every surface
     and removes a class of "I tweaked one icon and forgot the others"
     drift.

     Stroke uses currentColor so callers control colour with CSS
     (the parent's `color` property). Size is set on the host SVG
     element so the icon scales with the parent's font size when
     `size` is the default "1em".
     ================================================================== */

  /** @type {'train' | 'room' | 'meal' | 'activity' | 'other'} */
  export let kind = 'other';
  export let size = '1.25em';
  export let title = '';
</script>

<svg
  viewBox="0 0 24 24"
  style="width:{size};height:{size};display:inline-block;vertical-align:middle"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={title ? 'img' : 'presentation'}
  aria-label={title || undefined}
  aria-hidden={title ? undefined : true}
>
  {#if kind === 'train'}
    <rect x="4" y="3" width="16" height="14" rx="3" />
    <path d="M4 11 L20 11" />
    <circle cx="8.5" cy="20" r="1.4" />
    <circle cx="15.5" cy="20" r="1.4" />
    <path d="M7 17 L7 19" />
    <path d="M17 17 L17 19" />
  {:else if kind === 'room'}
    <path d="M3 18 L3 10 L21 10 L21 18" />
    <path d="M3 18 L21 18" />
    <path d="M7 10 L7 7 L11 7 L11 10" />
  {:else if kind === 'meal'}
    <path d="M6 3 L6 10 Q6 12 8 12 Q10 12 10 10 L10 3" />
    <path d="M8 12 L8 21" />
    <path d="M17 3 Q14 6 17 11 L17 21" />
  {:else if kind === 'activity'}
    <path d="M3 9 L3 11 Q5 11 5 13 Q5 15 3 15 L3 17 L21 17 L21 15 Q19 15 19 13 Q19 11 21 11 L21 9 Z" />
    <path d="M9 9 L9 17 M15 9 L15 17" stroke-dasharray="2 2" />
  {:else}
    <path d="M6 3 L18 3 L18 21 L12 17 L6 21 Z" />
  {/if}
</svg>
