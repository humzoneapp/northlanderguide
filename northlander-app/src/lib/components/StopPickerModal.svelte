<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { STOPS, routeIndex } from '$lib/data/stops.js';
  import { arrivalClock, travelDuration } from '$lib/data/schedule.js';

  /** @type {string[]} - currently selected stop ids on the trip */
  export let selected = [];

  const dispatch = createEventDispatcher();

  /* Local working set so we don't commit changes until the user
     presses Save. Use a Set for O(1) toggle. */
  let working = new Set(selected || []);
  let submitting = false;

  $: count = working.size;

  onMount(() => {
    /* Re-seed from the prop in case the modal is reopened on the
       same instance later. */
    working = new Set(selected || []);
  });

  function toggle(id) {
    if (working.has(id)) working.delete(id);
    else working.add(id);
    /* Re-assign so Svelte detects the change. */
    working = new Set(working);
  }

  function clearAll() {
    working = new Set();
  }

  function close() {
    if (submitting) return;
    dispatch('close');
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  async function handleSave() {
    if (submitting) return;
    submitting = true;
    /* Always emit stops in canonical route order so the user can't
       accidentally end up with Cochrane before Toronto. */
    const ordered = STOPS.map((s) => s.id).filter((id) => working.has(id));
    dispatch('save', { stopIds: ordered });
  }
</script>

<svelte:window on:keydown={onKey} />

<div
  class="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
  role="dialog"
  aria-modal="true"
  aria-labelledby="stop-picker-title"
>
  <button
    type="button"
    class="absolute inset-0 bg-forest/70 backdrop-blur-sm cursor-default"
    on:click={close}
    aria-label="Close"
  ></button>

  <div class="relative z-10 w-full max-w-[640px] max-h-full bg-cream shadow-ticket pl-card flex flex-col">
    <!-- Forest railway header band -->
    <header class="bg-forest text-ivory px-6 py-3 flex justify-between items-center border-b-[3px] border-double border-gold flex-none">
      <div>
        <span id="stop-picker-title" class="font-serif font-black uppercase tracking-[0.18em] text-[15px] block">
          Choose Your Stops
        </span>
        <span class="text-gold font-serif italic text-[12px]">Toronto Union to Cochrane, northbound</span>
      </div>
      <button
        type="button"
        class="text-gold text-xl leading-none hover:text-ivory"
        on:click={close}
        aria-label="Close"
      >&times;</button>
    </header>

    <!-- Scrollable stop list -->
    <div class="overflow-y-auto bg-linen flex-1">
      <ol class="divide-y divide-dashed divide-[#8b6a3a]/35">
        {#each STOPS as stop, i}
          {@const checked = working.has(stop.id)}
          <li>
            <label
              class="flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors"
              class:is-on={checked}
            >
              <input
                type="checkbox"
                class="sr-only"
                checked={checked}
                on:change={() => toggle(stop.id)}
              />
              <!-- Custom check token, styled as a vintage punch -->
              <span
                class="check-token mt-1 flex-none w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
                aria-hidden="true"
              >
                {#if checked}
                  <svg viewBox="0 0 16 16" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 8 7 12 13 4"></polyline>
                  </svg>
                {/if}
              </span>

              <div class="flex-1 min-w-0">
                <div class="flex items-baseline justify-between gap-3">
                  <div class="font-serif font-bold text-forest text-lg leading-tight truncate">{stop.name}</div>
                  <div class="font-serif italic text-rust text-sm flex-none">
                    {stop.offsetMinutes === 0 ? '9:00 AM' : arrivalClock(stop.offsetMinutes)}
                  </div>
                </div>
                <div class="kicker text-muted mt-0.5">{stop.region}<span class="mx-2 text-rust/60">·</span>{travelDuration(stop.offsetMinutes)}</div>
                <p class="font-serif text-sm text-ink/80 italic leading-snug mt-1">{stop.hook}</p>
              </div>
            </label>
          </li>
        {/each}
      </ol>
    </div>

    <!-- Footer: count + actions -->
    <footer class="bg-cream border-t-[3px] border-double border-gold/40 px-6 py-3 flex items-center justify-between gap-4 flex-none">
      <div class="font-serif italic text-muted text-sm">
        {#if count === 0}
          No stops yet.
        {:else if count === 1}
          1 stop selected.
        {:else}
          {count} stops selected, in route order.
        {/if}
        {#if count > 0}
          <button
            type="button"
            class="ml-3 text-rust hover:text-forest underline"
            on:click={clearAll}
          >Clear</button>
        {/if}
      </div>
      <div class="flex items-center gap-3">
        <button
          type="button"
          on:click={close}
          class="font-serif italic text-muted hover:text-rust text-sm"
          disabled={submitting}
        >Cancel</button>
        <button
          type="button"
          on:click={handleSave}
          class="btn-primary disabled:opacity-50"
          disabled={submitting}
        >Save Stops</button>
      </div>
    </footer>
  </div>
</div>

<style>
  /* Scalloped left/right edges so the modal reads as a real ticket. */
  .pl-card {
    -webkit-mask-image:
      radial-gradient(circle 8px at 0% 50%, transparent 7px, black 8px),
      radial-gradient(circle 8px at 100% 50%, transparent 7px, black 8px);
    mask-image:
      radial-gradient(circle 8px at 0% 50%, transparent 7px, black 8px),
      radial-gradient(circle 8px at 100% 50%, transparent 7px, black 8px);
  }
  label:hover {
    background: rgba(125, 58, 30, 0.05);
  }
  label.is-on {
    background: rgba(201, 168, 76, 0.12);
  }
  .check-token {
    border-color: #8b6a3a;
    color: transparent;
  }
  label.is-on .check-token {
    border-color: #0a2d21;
    background: #c9a84c;
    color: #0a2d21;
  }
</style>
