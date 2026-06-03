<script>
  import { onMount, tick, createEventDispatcher } from 'svelte';
  import {
    listBudgetEntries,
    addBudgetEntry,
    updateBudgetEntry,
    deleteBudgetEntry,
    totalOf,
    breakdownByCategory,
    formatAmount,
    BUDGET_CATEGORIES
  } from '$lib/stores/budget.js';

  /** @type {string} */
  export let tripId;
  /** @type {string} - When set, the list narrows to entries pinned to
      this stop and new lines auto-pin here. The surrounding scene
      already names the stop, so no extra label is shown per row. */
  export let stopFilter = '';

  const dispatch = createEventDispatcher();

  /** @type {import('$lib/stores/budget.js').BudgetEntry[]} */
  let entries = [];
  let loaded = false;
  let saving = false;

  /* Quick-add row state. */
  let newLabel = '';
  let newAmount = '';
  let newCategory = 'other';

  /* Inline-edit state. */
  let editingId = null;
  let editLabel = '';
  let editAmount = '';
  let editCategory = 'other';
  /** @type {HTMLInputElement | undefined} */
  let editLabelInput;

  $: tripId, refresh();
  $: visibleEntries = stopFilter ? entries.filter((e) => e.stopId === stopFilter) : entries;
  $: total = totalOf(visibleEntries);
  $: breakdown = breakdownByCategory(visibleEntries);

  onMount(refresh);

  async function refresh() {
    if (!tripId) {
      entries = [];
      loaded = true;
      return;
    }
    entries = await listBudgetEntries(tripId);
    loaded = true;
  }

  async function handleAdd() {
    if (saving) return;
    const label = newLabel.trim();
    const amt = Number(newAmount);
    if (!label || Number.isNaN(amt)) return;
    saving = true;
    try {
      await addBudgetEntry(tripId, {
        label,
        amount: amt,
        category: newCategory,
        stopId: stopFilter || null
      });
      newLabel = '';
      newAmount = '';
      newCategory = 'other';
      await refresh();
      dispatch('change');
    } finally {
      saving = false;
    }
  }

  async function startEdit(entry) {
    editingId = entry.id;
    editLabel = entry.label;
    editAmount = String(entry.amount);
    editCategory = entry.category;
    await tick();
    editLabelInput?.focus();
  }

  async function commitEdit() {
    if (editingId == null) return;
    const id = editingId;
    const patch = {
      label: editLabel,
      amount: editAmount,
      category: editCategory
    };
    editingId = null;
    editLabel = '';
    editAmount = '';
    editCategory = 'other';
    if (patch.label.trim() && !Number.isNaN(Number(patch.amount))) {
      await updateBudgetEntry(id, patch);
      await refresh();
      dispatch('change');
    }
  }

  function cancelEdit() {
    editingId = null;
    editLabel = '';
    editAmount = '';
    editCategory = 'other';
  }

  async function remove(id) {
    await deleteBudgetEntry(id);
    await refresh();
    dispatch('change');
  }

  function catLabel(id) {
    return (BUDGET_CATEGORIES.find((c) => c.id === id) || BUDGET_CATEGORIES[4]).label;
  }
  function catColor(id) {
    return (BUDGET_CATEGORIES.find((c) => c.id === id) || BUDGET_CATEGORIES[4]).color;
  }
</script>

<div>
  <div class="header-row">
    <div>
      <div class="kicker">Ledger</div>
      <h3 class="font-serif font-bold text-forest text-xl">Budget tracker</h3>
    </div>
    <div class="total">
      <span class="kicker total-kicker">Total</span>
      <span class="total-amount">{formatAmount(total)}</span>
    </div>
  </div>

  {#if loaded && visibleEntries.length > 0}
    <!-- Per-category breakdown chips. Hidden when nothing's logged. -->
    <div class="breakdown">
      {#each BUDGET_CATEGORIES as c}
        {#if breakdown[c.id] > 0}
          <span class="breakdown-chip" style="border-color:{c.color};color:{c.color}">
            <strong>{c.label}</strong>
            <span>{formatAmount(breakdown[c.id])}</span>
          </span>
        {/if}
      {/each}
    </div>
  {/if}

  {#if loaded}
    {#if visibleEntries.length === 0}
      <p class="empty">
        {#if stopFilter}
          No spend logged here yet. Drop a line below.
        {:else}
          No spend logged yet. Train fare, that pasty in Huntsville, the cabin deposit. Drop a line below.
        {/if}
      </p>
    {:else}
      <ul class="ledger">
        {#each visibleEntries as entry (entry.id)}
          <li class="row" class:is-editing={editingId === entry.id}>
            {#if editingId === entry.id}
              <input
                bind:this={editLabelInput}
                bind:value={editLabel}
                type="text"
                maxlength="80"
                class="edit-label"
                on:keydown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                  if (e.key === 'Escape') cancelEdit();
                }}
              />
              <select bind:value={editCategory} class="edit-cat">
                {#each BUDGET_CATEGORIES as c}
                  <option value={c.id}>{c.label}</option>
                {/each}
              </select>
              <input
                bind:value={editAmount}
                type="number"
                step="0.01"
                min="0"
                inputmode="decimal"
                class="edit-amount"
                on:keydown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                  if (e.key === 'Escape') cancelEdit();
                }}
              />
              <div class="edit-actions">
                <button type="button" class="row-action" on:click={cancelEdit}>Cancel</button>
                <button type="button" class="row-save" on:click={commitEdit}>Save</button>
              </div>
            {:else}
              <button type="button" class="row-label" on:click={() => startEdit(entry)}>
                {entry.label}
              </button>
              <span class="row-cat" style="--cat:{catColor(entry.category)}">{catLabel(entry.category)}</span>
              <span class="row-amount">{formatAmount(entry.amount)}</span>
              <button
                type="button"
                class="row-remove"
                on:click={() => remove(entry.id)}
                aria-label={`Remove ${entry.label}`}
              >&times;</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <!-- Quick-add row. Same pattern as the other checklists. -->
    <form on:submit|preventDefault={handleAdd} class="add-row">
      <input
        bind:value={newLabel}
        type="text"
        maxlength="80"
        placeholder="What did you spend on?"
        class="add-label"
      />
      <select bind:value={newCategory} class="add-cat" aria-label="Category">
        {#each BUDGET_CATEGORIES as c}
          <option value={c.id}>{c.label}</option>
        {/each}
      </select>
      <input
        bind:value={newAmount}
        type="number"
        step="0.01"
        min="0"
        inputmode="decimal"
        placeholder="0.00"
        class="add-amount"
        aria-label="Amount in CAD"
      />
      <button
        type="submit"
        class="add-btn"
        disabled={saving || !newLabel.trim() || Number.isNaN(Number(newAmount))}
      >Add</button>
    </form>
  {/if}
</div>

<style>
  .header-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 6px;
  }
  .total {
    text-align: right;
  }
  .total-kicker {
    display: block;
    color: #5a4f3d;
  }
  .total-amount {
    display: block;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(1.6rem, 4vw, 2.2rem);
    color: #7d3a1e;
    line-height: 1;
  }

  .breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0 14px;
  }
  .breakdown-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    border: 1.5px dashed currentColor;
    border-radius: 999px;
    padding: 3px 10px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    background: rgba(251, 246, 234, 0.7);
  }
  .breakdown-chip strong {
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 10.5px;
  }
  .breakdown-chip span {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    color: #0a2d21;
  }

  .empty {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    margin: 4px 0 14px;
  }

  .ledger {
    list-style: none;
    padding: 0;
    margin: 0 0 14px;
    border-top: 1px solid rgba(139, 106, 58, 0.35);
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px dashed rgba(139, 106, 58, 0.35);
  }
  .row.is-editing {
    grid-template-columns: 1fr auto auto auto;
    background: #fffdf6;
  }
  .row-label {
    text-align: left;
    background: transparent;
    border: 0;
    padding: 2px 0;
    font-family: 'Spline Sans', sans-serif;
    font-size: 14.5px;
    color: #241f1a;
    cursor: text;
    min-width: 0;
    overflow-wrap: anywhere;
    transition: color 0.15s;
  }
  .row-label:hover {
    color: #7d3a1e;
  }
  .row-cat {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--cat, #5a4f3d);
    white-space: nowrap;
  }
  .row-amount {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 16px;
    color: #0a2d21;
    text-align: right;
    min-width: 90px;
  }
  .row-remove {
    background: transparent;
    border: 0;
    color: rgba(139, 106, 58, 0.55);
    font-size: 20px;
    line-height: 1;
    padding: 2px 6px;
    cursor: pointer;
    transition: color 0.15s;
  }
  .row-remove:hover {
    color: #7d3a1e;
  }

  .edit-label,
  .edit-amount,
  .edit-cat {
    background: #fffdf6;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 6px 8px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 14px;
    color: #0a2d21;
    outline: none;
    min-width: 0;
  }
  .edit-label:focus,
  .edit-amount:focus,
  .edit-cat:focus {
    border-color: #7d3a1e;
  }
  .edit-amount {
    width: 110px;
    text-align: right;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
  }
  .edit-cat {
    width: 130px;
  }
  .edit-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .row-action {
    background: transparent;
    border: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    cursor: pointer;
    padding: 4px 2px;
  }
  .row-action:hover {
    color: #7d3a1e;
  }
  .row-save {
    background: #6e2e17;
    color: #f3ece0;
    border: 0;
    border-radius: 3px;
    padding: 5px 12px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
  }

  .add-row {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    align-items: center;
    gap: 10px;
    padding-top: 12px;
    border-top: 2px dashed rgba(139, 106, 58, 0.45);
  }
  .add-label {
    background: transparent;
    border: 0;
    padding: 4px 0;
    font-family: 'Spline Sans', sans-serif;
    font-size: 1rem;
    color: #241f1a;
    outline: none;
    min-width: 0;
  }
  .add-label::placeholder {
    color: rgba(90, 79, 61, 0.55);
    font-style: italic;
  }
  .add-cat {
    background: #fbf6ea;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 6px 8px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: #0a2d21;
    cursor: pointer;
    outline: none;
  }
  .add-amount {
    width: 110px;
    background: #fffdf6;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 6px 8px;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 14px;
    color: #0a2d21;
    text-align: right;
    outline: none;
  }
  .add-amount:focus,
  .add-cat:focus {
    border-color: #7d3a1e;
  }
  .add-btn {
    background: transparent;
    border: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 700;
    color: #7d3a1e;
    cursor: pointer;
    padding: 4px 10px;
    transition: color 0.15s;
  }
  .add-btn:hover:not(:disabled) {
    color: #0a2d21;
  }
  .add-btn:disabled {
    color: rgba(125, 58, 30, 0.4);
    cursor: not-allowed;
  }

  @media (max-width: 540px) {
    .row,
    .add-row {
      grid-template-columns: 1fr auto;
      grid-template-rows: auto auto;
      row-gap: 6px;
    }
    .row-label,
    .add-label {
      grid-column: 1 / -1;
    }
    .row-cat,
    .add-cat {
      grid-column: 1;
    }
    .row-amount,
    .add-amount {
      grid-column: 2;
    }
    .row-remove,
    .add-btn {
      grid-column: 1 / -1;
      justify-self: end;
    }
  }
</style>
