<script>
  import { updateTrip } from '$lib/stores/trips.js';
  import { DIRECTIONS, todayLocalISO } from '$lib/data/schedule.js';
  import { createEventDispatcher } from 'svelte';

  /** @type {{ id: string, departureDate?: string|null, direction?: 'northbound'|'southbound' }} */
  export let trip;

  const dispatch = createEventDispatcher();

  /* Local copy so the input feels snappy; we persist on change. */
  let dateDraft = trip.departureDate || '';
  let direction = trip.direction || 'northbound';

  /* Re-seed if the parent reloads the trip (e.g. after rename). */
  $: dateDraft = trip.departureDate || '';
  $: direction = trip.direction || 'northbound';

  async function commitDate() {
    const next = dateDraft || null;
    if ((trip.departureDate || null) === next) return;
    const updated = await updateTrip(trip.id, { departureDate: next });
    if (updated) dispatch('update', updated);
  }

  async function pickDirection(dir) {
    if (dir === direction) return;
    direction = dir;
    const updated = await updateTrip(trip.id, { direction: dir });
    if (updated) dispatch('update', updated);
  }

  function useToday() {
    dateDraft = todayLocalISO();
    commitDate();
  }
</script>

<div class="strip">
  <label class="field">
    <span class="kicker">Departure</span>
    <div class="field-input">
      <input
        type="date"
        bind:value={dateDraft}
        on:change={commitDate}
        aria-label="Departure date"
      />
      {#if !dateDraft}
        <button type="button" class="use-today" on:click={useToday}>Use today</button>
      {/if}
    </div>
  </label>

  <fieldset class="field">
    <legend class="kicker">Direction</legend>
    <div class="toggle" role="radiogroup" aria-label="Train direction">
      {#each DIRECTIONS as d}
        <button
          type="button"
          role="radio"
          aria-checked={direction === d.id}
          class="toggle-btn"
          class:is-active={direction === d.id}
          on:click={() => pickDirection(d.id)}
        >
          <span class="block leading-tight">{d.label}</span>
          <span class="toggle-sub">{d.from} <span class="opacity-70">to</span> {d.to}</span>
        </button>
      {/each}
    </div>
  </fieldset>
</div>

<style>
  .strip {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
    padding: 14px 16px;
    margin-bottom: 18px;
    background: #fbf6ea;
    border: 1.5px dashed rgba(139, 106, 58, 0.55);
    border-radius: 4px;
  }
  @media (min-width: 540px) {
    .strip {
      grid-template-columns: auto 1fr;
      gap: 22px;
      align-items: center;
    }
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  .field-input {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  input[type='date'] {
    background: #fffdf6;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 6px 8px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 0.95rem;
    color: #0a2d21;
    outline: none;
    transition: border-color 0.15s;
  }
  input[type='date']:focus {
    border-color: #7d3a1e;
  }
  .use-today {
    background: transparent;
    border: 0;
    color: #7d3a1e;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 0.9rem;
    cursor: pointer;
    padding: 4px 0;
  }
  .use-today:hover {
    color: #0a2d21;
    text-decoration: underline;
  }

  .toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .toggle-btn {
    background: #fffdf6;
    border: 1.5px solid #8b6a3a;
    border-radius: 3px;
    padding: 8px 12px;
    cursor: pointer;
    text-align: left;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 0.92rem;
    font-weight: 600;
    color: #0a2d21;
    line-height: 1.2;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .toggle-btn:hover {
    border-color: #7d3a1e;
  }
  .toggle-btn.is-active {
    background: #0a2d21;
    color: #f3ece0;
    border-color: #0a2d21;
  }
  .toggle-sub {
    display: block;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-size: 0.78rem;
    margin-top: 2px;
    color: rgba(10, 45, 33, 0.7);
  }
  .toggle-btn.is-active .toggle-sub {
    color: rgba(243, 236, 224, 0.85);
  }
</style>
