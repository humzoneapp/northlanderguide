<script>
  /* ==================================================================
     First-run trip wizard.

     Sits at the top of /trips/[id] when a trip is freshly created.
     Three steps light up as the user completes them:
       1. Name the trip      - done the moment we render (trips
                                always have a name on creation)
       2. Pick your stops    - done when trip.stopIds.length > 0
       3. Drop your first plan - done when bookingsCount > 0

     The wizard auto-hides once all three are done, and stays
     hidden after explicit dismissal (per-trip localStorage key,
     so dismissing on one trip doesn't suppress the coach on the
     user's next trip).

     Action buttons dispatch events the parent already knows how
     to handle: 'pickStops' opens the existing StopPickerModal,
     'addPlan' opens the AddPlanModal with no preset. We don't own
     those modals here - the parent already mounts them.
     ================================================================== */

  import { createEventDispatcher, onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  export let trip;
  export let bookingsCount = 0;

  const dispatch = createEventDispatcher();

  let dismissed = false;
  let mounted = false;

  $: stopsDone = Array.isArray(trip?.stopIds) && trip.stopIds.length > 0;
  $: planDone = bookingsCount > 0;
  $: allDone = stopsDone && planDone;
  $: stopsLabel = stopsDone
    ? `${trip.stopIds.length} ${trip.stopIds.length === 1 ? 'stop' : 'stops'} on the route`
    : '';
  $: planLabel = planDone
    ? `${bookingsCount} ${bookingsCount === 1 ? 'plan' : 'plans'} dropped in`
    : '';

  /* Show the wizard only after we've checked localStorage so
     we don't briefly flash the band for users who already
     dismissed it. */
  $: visible = mounted && !dismissed && !allDone;

  onMount(() => {
    try {
      const key = storageKey();
      if (key && localStorage.getItem(key) === 'true') {
        dismissed = true;
      }
    } catch (e) {
      /* localStorage can throw in private mode - that's fine,
         we just show the wizard. */
    }
    mounted = true;
  });

  function storageKey() {
    if (!trip || !trip.id) return '';
    return `northlander.wizard.dismissed.${trip.id}`;
  }

  function dismiss() {
    try {
      const key = storageKey();
      if (key) localStorage.setItem(key, 'true');
    } catch (e) { /* ignore */ }
    dismissed = true;
  }
</script>

{#if visible}
  <section class="wizard-band" transition:fade={{ duration: 180 }}>
    <div class="wizard-inner">
      <header class="wizard-head">
        <div class="head-text">
          <p class="eyebrow">Welcome aboard</p>
          <h2>Three quick steps and your trip is ready.</h2>
          <p class="lede">
            Pick where you're stopping, drop your first plan, and the
            itinerary starts writing itself.
          </p>
        </div>
        <button type="button" class="skip" on:click={dismiss}>
          Skip the coach
        </button>
      </header>

      <ol class="steps">
        <li class="step" class:is-done={true}>
          <div class="step-mark">
            <span class="check" aria-hidden="true">&#10003;</span>
          </div>
          <div class="step-body">
            <h3>Name your trip</h3>
            <p class="meta">
              Tagged as <em>&ldquo;{trip?.name || 'untitled'}&rdquo;</em>
            </p>
          </div>
        </li>

        <li
          class="step"
          class:is-done={stopsDone}
          class:is-active={!stopsDone}
        >
          <div class="step-mark">
            {#if stopsDone}
              <span class="check" aria-hidden="true">&#10003;</span>
            {:else}
              <span class="num">2</span>
            {/if}
          </div>
          <div class="step-body">
            <h3>Pick your stops</h3>
            {#if stopsDone}
              <p class="meta">{stopsLabel}</p>
              <button
                type="button"
                class="secondary"
                on:click={() => dispatch('pickStops')}
              >
                Edit stops
              </button>
            {:else}
              <p class="meta">
                Choose the train stations you'll get off at along the
                Northlander route.
              </p>
              <button
                type="button"
                class="primary"
                on:click={() => dispatch('pickStops')}
              >
                Choose stops
              </button>
            {/if}
          </div>
        </li>

        <li
          class="step"
          class:is-done={planDone}
          class:is-active={stopsDone && !planDone}
          class:is-locked={!stopsDone}
        >
          <div class="step-mark">
            {#if planDone}
              <span class="check" aria-hidden="true">&#10003;</span>
            {:else}
              <span class="num">3</span>
            {/if}
          </div>
          <div class="step-body">
            <h3>Drop your first plan</h3>
            {#if planDone}
              <p class="meta">{planLabel}</p>
              <button
                type="button"
                class="secondary"
                on:click={() => dispatch('addPlan')}
              >
                Add another
              </button>
            {:else if stopsDone}
              <p class="meta">
                Browse restaurants, places to stay, and things to do at
                every stop you picked.
              </p>
              <button
                type="button"
                class="primary"
                on:click={() => dispatch('addPlan')}
              >
                Browse places
              </button>
            {:else}
              <p class="meta">
                Pick a stop first and we'll show you what's nearby.
              </p>
            {/if}
          </div>
        </li>
      </ol>
    </div>
  </section>
{/if}

<style>
  /* Forest band so the wizard reads as a continuation of the
     cinematic itinerary cover - same palette, same paper feel. */
  .wizard-band {
    background:
      radial-gradient(circle at 20% 0%, rgba(196, 134, 15, 0.12), transparent 55%),
      radial-gradient(circle at 80% 100%, rgba(125, 58, 30, 0.18), transparent 60%),
      linear-gradient(180deg, #0a2d21 0%, #0f3a2b 100%);
    color: #f5f0e8;
    padding: 36px 24px 40px;
    border-radius: 18px;
    margin-bottom: 24px;
    box-shadow: 0 18px 40px rgba(10, 45, 33, 0.25);
    position: relative;
    overflow: hidden;
  }
  .wizard-inner {
    max-width: 1080px;
    margin: 0 auto;
    position: relative;
  }

  .wizard-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 28px;
  }
  .head-text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .eyebrow {
    font-family: 'Spline Sans', system-ui, sans-serif;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-size: 11px;
    color: #c9a84c;
    margin: 0 0 8px;
  }
  .wizard-head h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    font-size: clamp(22px, 3vw, 30px);
    line-height: 1.2;
    margin: 0 0 8px;
    color: #f5f0e8;
  }
  .lede {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: rgba(245, 240, 232, 0.72);
    margin: 0;
    font-size: 15px;
    line-height: 1.5;
    max-width: 56ch;
  }

  .skip {
    flex: 0 0 auto;
    background: transparent;
    border: 1px solid rgba(245, 240, 232, 0.25);
    color: rgba(245, 240, 232, 0.7);
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 8px 14px;
    border-radius: 999px;
    cursor: pointer;
    transition: all 160ms ease;
  }
  .skip:hover {
    border-color: rgba(245, 240, 232, 0.5);
    color: #f5f0e8;
  }

  /* Three cream cards on a forest field. The active step gets an
     amber accent border so the user's eye knows where to go. */
  .steps {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
  .step {
    background: #f5f0e8;
    color: #0a2d21;
    border-radius: 14px;
    padding: 22px 22px 24px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    position: relative;
    transition: transform 200ms ease, box-shadow 200ms ease;
    border: 2px solid transparent;
  }
  .step.is-active {
    border-color: #c4860f;
    box-shadow: 0 12px 28px rgba(196, 134, 15, 0.28);
    transform: translateY(-2px);
  }
  .step.is-done {
    background: rgba(245, 240, 232, 0.88);
  }
  .step.is-locked {
    opacity: 0.62;
  }

  .step-mark {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: #0a2d21;
    color: #c9a84c;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 18px;
    box-shadow: inset 0 0 0 2px rgba(201, 168, 76, 0.35);
  }
  .step.is-done .step-mark {
    background: #2f6147;
    color: #f5f0e8;
    box-shadow: inset 0 0 0 2px rgba(245, 240, 232, 0.4);
  }
  .step-mark .check {
    font-size: 18px;
    line-height: 1;
  }
  .step-mark .num {
    line-height: 1;
  }

  .step-body {
    flex: 1 1 auto;
    min-width: 0;
  }
  .step-body h3 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 600;
    font-size: 18px;
    line-height: 1.25;
    margin: 0 0 6px;
    color: #0a2d21;
  }
  .step-body .meta {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    color: rgba(10, 45, 33, 0.72);
    margin: 0 0 12px;
  }
  .step-body .meta em {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #0a2d21;
  }

  /* Primary action mirrors the amber cover button on the
     itinerary so the same vocabulary repeats across the app. */
  .step-body .primary {
    background: #c4860f;
    border: 2px solid #c4860f;
    color: #0a2d21;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
    padding: 8px 16px;
    border-radius: 999px;
    cursor: pointer;
    transition: all 160ms ease;
  }
  .step-body .primary:hover {
    background: #d59a26;
    border-color: #d59a26;
  }
  .step-body .secondary {
    background: transparent;
    border: 2px solid rgba(10, 45, 33, 0.25);
    color: #0a2d21;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.06em;
    padding: 7px 14px;
    border-radius: 999px;
    cursor: pointer;
    transition: all 160ms ease;
  }
  .step-body .secondary:hover {
    border-color: #0a2d21;
    background: rgba(10, 45, 33, 0.06);
  }

  /* Mobile - stack the cards and shrink the head text gracefully. */
  @media (max-width: 760px) {
    .wizard-band {
      padding: 28px 18px 32px;
      border-radius: 14px;
    }
    .wizard-head {
      flex-direction: column;
      gap: 14px;
      margin-bottom: 22px;
    }
    .skip {
      align-self: flex-start;
    }
    .steps {
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .step {
      padding: 18px 18px 20px;
    }
  }
</style>
