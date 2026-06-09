<script>
  /* ==================================================================
     Before You Board.

     The trip-wide pre-departure block that sits between the narrative
     band and the per-stop chapters. Two concerns live here:

       1. Packing lists - one default "Packing list" plus any extra
          named bags the user has added (Mom / Kids / Camera bag etc.).
          Each list is a Drawer accordion with an inline Rename / Delete
          link in its footer; a dashed "Add another packing list" pill
          adds new ones via an inline name input.

       2. Trip budget - flat panel (NOT a Drawer, lifted out on
          2026-06-07 so the live figure stays visible) with the target
          on the right and a small spent / target / progress-bar below.

     Lifted out of trip-page/+page.svelte on 2026-06-09 so the page
     stops being a 3500-line scroll. All the pre-departure state
     (rename list draft, add-list draft, budget edit draft) lives
     locally here. The parent passes the trip row + the live data
     arrays and gets a single `change` event after any DB write, on
     which it calls its own `load()` to refetch everything.
     ================================================================== */

  import { createEventDispatcher } from 'svelte';
  import {
    addTripPackingList,
    renameTripPackingList,
    deleteTripPackingList,
    setTripBudgetTarget,
  } from '$lib/stores/trips.js';
  import { totalOf, formatAmount } from '$lib/stores/budget.js';

  import Drawer from '$lib/components/Drawer.svelte';
  import PackingList from '$lib/components/PackingList.svelte';

  /** Trip row from the DB. The component reads trip.id, trip.budgetTarget,
      trip.extraPackingLists, trip.defaultPackingListName, trip.stopIds. */
  export let trip;
  /** Live packing rows, used only to compute the per-list count badges. */
  export let packingRows = [];
  /** Live budget rows, summed for the budget panel's "spent" figure. */
  export let budgetEntries = [];
  /** Concat of outbound + return stops, passed to PackingList so its
      weather-aware suggestions read the full route. */
  export let weatherStops = [];

  const dispatch = createEventDispatcher();

  /* ----- Packing-list derived state ----- */
  $: defaultPackingListLabel = (trip && trip.defaultPackingListName) || 'Packing list';
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

  /* ----- Inline "Add another packing list" form ----- */
  let addingPackingList = false;
  let newPackingListName = '';
  async function commitNewPackingList() {
    if (!trip) return;
    const clean = newPackingListName.trim();
    if (!clean) {
      addingPackingList = false;
      return;
    }
    await addTripPackingList(trip.id, clean);
    newPackingListName = '';
    addingPackingList = false;
    dispatch('change');
  }

  /* ----- Inline rename for a packing list. renamingListKey holds the
       current name (''=default list, name=extra list) or null when no
       row is being edited. */
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
    await renameTripPackingList(trip.id, cur, next);
    dispatch('change');
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
    await deleteTripPackingList(trip.id, name);
    dispatch('change');
  }

  /* ----- Trip budget derived state ----- */
  $: tripBudgetTarget = trip && Number.isFinite(trip.budgetTarget) ? Number(trip.budgetTarget) : null;
  $: budgetSpent = totalOf(budgetEntries);
  $: budgetRemaining = tripBudgetTarget != null ? Math.round((tripBudgetTarget - budgetSpent) * 100) / 100 : null;
  $: budgetOverspent = budgetRemaining != null && budgetRemaining < 0;
  $: budgetPercent = (tripBudgetTarget && tripBudgetTarget > 0)
    ? Math.min(100, Math.max(0, (budgetSpent / tripBudgetTarget) * 100))
    : 0;

  /* ----- Inline-edit state for the trip budget target ----- */
  let editingBudgetTarget = false;
  let budgetTargetDraft = '';
  function startEditBudgetTarget() {
    budgetTargetDraft = tripBudgetTarget != null ? String(tripBudgetTarget) : '';
    editingBudgetTarget = true;
  }
  async function commitBudgetTarget() {
    if (!trip) return;
    editingBudgetTarget = false;
    /* <input type="number"> bind coerces the draft to a Number, so a
       .trim() call would throw and the save would silently fail.
       Coerce to string first before trimming + parsing. */
    const raw = String(budgetTargetDraft ?? '').trim();
    const num = raw === '' ? NaN : Number(raw);
    const v = Number.isFinite(num) && num >= 0 ? num : null;
    await setTripBudgetTarget(trip.id, v);
    budgetTargetDraft = '';
    dispatch('change');
  }
  function cancelBudgetTarget() {
    editingBudgetTarget = false;
    budgetTargetDraft = '';
  }
</script>

<section id="trip-pack" class="before-board">
  <div class="before-board-inner">
    <div class="before-board-head">
      <div class="kicker">Before You Board</div>
      <h2>Pack the whole trip in one place.</h2>
    </div>

    <!-- Default (unnamed) packing list. Always present, can't be
         deleted - it's the bag every trip starts with. -->
    <Drawer
      kicker="Pack the bag"
      title={defaultPackingListLabel}
      count={defaultPackingCount}
      countLabel={defaultPackingCount === 1 ? 'item' : 'items'}
    >
      <PackingList
        tripId={trip.id}
        stopIds={trip.stopIds || []}
        {weatherStops}
        on:change={() => dispatch('change')}
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

    <!-- Extra named lists. Each gets its own accordion + a Delete-list
         link inside the body for the two-step confirm. -->
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
          {weatherStops}
          on:change={() => dispatch('change')}
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

    <!-- Add another packing list. Inline name input keeps the flow
         lightweight (no second modal); Enter or blur commits. -->
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
         Trip-wide target the user sets here. Per-chapter ledger rows
         roll up into Spent and subtract from Remaining live. The bar
         and tag flip to amber when spending crosses the target. -->
    <section class="bb-budget-flat" aria-labelledby="bb-budget-title">
      <header class="bb-budget-flat-head">
        <div class="bb-budget-flat-text">
          <span class="bb-budget-flat-kicker">Trip budget</span>
          <h3 id="bb-budget-title" class="bb-budget-flat-title">Budget</h3>
        </div>
        <!-- Live figure pinned to the title line. Tap opens the inline
             editor so the user can adjust the target or top up. When
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

<style>
  .before-board {
    background: #fbf6ea;
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

  /* Add-another-packing-list pill. Dashed rust to mirror the route
     picker's secondary button; the inline form swaps in when active. */
  .bb-add-list {
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

  /* Rename / delete link inside a list's footer. Quiet italic so it
     doesn't compete with the actual items. */
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

  /* Budget panel - flat block (not a Drawer) so the running figure
     stays visible without unfurling. Header mirrors a Drawer summary
     row so it still reads as the same kind of thing as the lists
     above it. */
  .bb-budget-flat {
    background: #fbf6ea;
    border: 1px solid rgba(125, 58, 30, 0.18);
    border-radius: 4px;
    padding: 14px 18px 18px;
  }
  .bb-budget-flat-head {
    display: flex;
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
  .bb-budget-sub-sep { color: rgba(125, 58, 30, 0.45); }

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
  .bb-budget-edit-hint {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12.5px;
    color: #5a4f3d;
  }

  /* Forest progress bar; flips to amber when the user crosses the
     target. */
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
  .bb-budget-bar-fill.is-over { background: #c4860f; }
</style>
