<script>
  import { onMount, tick, createEventDispatcher } from 'svelte';
  import {
    listDiaryEntries,
    addDiaryEntry,
    updateDiaryEntry,
    deleteDiaryEntry
  } from '$lib/stores/diary.js';
  import { getStopsByIds, getStop } from '$lib/data/stops.js';
  import { sanitizeDiaryHtml, renderDiaryText } from '$lib/utils/diary-html.js';
  import EmojiPicker from './EmojiPicker.svelte';

  /** @type {string} */
  export let tripId;
  /** @type {string[]} - the trip's currently selected stops, so the
      "associate with stop" dropdown only offers stops in the suitcase */
  export let stopIds = [];
  /** @type {string} - When set, the feed narrows to notes pinned to
      this stop and new notes auto-pin here. The composer drops its
      stop dropdown and per-entry stop pills since the surrounding
      scene already names the stop. */
  export let stopFilter = '';
  /** @type {number} - Bump from the parent to force a refetch when
      an outside surface has mutated the diary while this view is
      mounted. See BookingChecklist for the same pattern. */
  export let refreshKey = 0;
  /** @type {boolean} - Suppress the in-component header when the
      parent already prints its own (e.g. inside a Drawer). */
  export let hideHeader = false;

  const dispatch = createEventDispatcher();

  /** @type {import('$lib/stores/diary.js').DiaryEntry[]} */
  let entries = [];
  let loaded = false;
  let saving = false;

  /* Add-entry form state. The manual date input was retired
     2026-06-06; createdAt (set by the diary store on save) is the
     timestamp on every note now. */
  let draftStopId = '';

  /* Inline edit state. */
  let editingId = null;
  let editStopId = '';

  /* Rich-text editors are contenteditable divs the user types into.
     We read innerHTML on save, sanitize via sanitizeDiaryHtml, and
     persist that. Each editor remembers the last selection range so
     toolbar buttons + the EmojiPicker can insert at the caret even
     after focus has moved to a toolbar button. */
  /** @type {HTMLDivElement | undefined} */
  let composerEl;
  /** @type {HTMLDivElement | undefined} */
  let editEl;
  /** @type {Range | null} */
  let savedRange = null;
  /** @type {HTMLDivElement | undefined} */
  let activeEditor = null;
  /** Picker visibility flags - one per editor since composer + edit
      share the same picker component but never both at once. */
  let composerHasContent = false;
  let editHasContent = false;
  let composerPickerOpen = false;
  let editPickerOpen = false;

  function rememberSelection(targetEl) {
    if (typeof window === 'undefined') return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    /* Only remember selections that live inside the editor. */
    if (targetEl && (targetEl === range.commonAncestorContainer || targetEl.contains(range.commonAncestorContainer))) {
      savedRange = range.cloneRange();
      activeEditor = targetEl;
    }
  }

  function restoreSelection() {
    if (!savedRange || typeof window === 'undefined') return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  function runCmd(cmd) {
    if (activeEditor) activeEditor.focus();
    restoreSelection();
    /* execCommand is deprecated but still ships everywhere; for a
       three-button toolbar (bold / italic / unordered list) it's the
       least-friction option. */
    try { document.execCommand(cmd, false); } catch (_) {}
    if (activeEditor === composerEl) composerHasContent = !!composerEl?.innerText.trim();
    if (activeEditor === editEl) editHasContent = !!editEl?.innerText.trim();
  }

  function insertAtCaret(html) {
    if (activeEditor) activeEditor.focus();
    restoreSelection();
    try { document.execCommand('insertHTML', false, html); } catch (_) {}
    if (activeEditor === composerEl) composerHasContent = !!composerEl?.innerText.trim();
    if (activeEditor === editEl) editHasContent = !!editEl?.innerText.trim();
  }

  function onPickerPick(e) {
    const { html } = e.detail || {};
    if (!html) return;
    insertAtCaret(html);
    composerPickerOpen = false;
    editPickerOpen = false;
  }

  $: tripId, refreshKey, refresh();
  $: tripStops = getStopsByIds(stopIds);
  $: visibleEntries = stopFilter ? entries.filter((e) => e.stopId === stopFilter) : entries;

  onMount(refresh);

  async function refresh() {
    if (!tripId) {
      entries = [];
      loaded = true;
      return;
    }
    entries = await listDiaryEntries(tripId);
    loaded = true;
  }

  async function handleAdd() {
    if (saving) return;
    if (!composerEl) return;
    const sanitized = sanitizeDiaryHtml(composerEl.innerHTML);
    /* Sanitized content can still be empty (e.g. paragraph tags
       with no text). innerText catches that case too. */
    if (!sanitized || !composerEl.innerText.trim()) return;
    saving = true;
    try {
      await addDiaryEntry(tripId, {
        text: sanitized,
        stopId: stopFilter || draftStopId || null
      });
      composerEl.innerHTML = '';
      composerHasContent = false;
      draftStopId = '';
      composerPickerOpen = false;
      await refresh();
      dispatch('change');
    } finally {
      saving = false;
    }
  }

  async function startEdit(entry) {
    editingId = entry.id;
    editStopId = entry.stopId || '';
    await tick();
    if (editEl) {
      /* Seed the editor with the existing content. Legacy plain-text
         entries get their newlines converted to <br> via the same
         renderer the feed uses. */
      editEl.innerHTML = renderDiaryText(entry.text);
      editEl.focus();
      activeEditor = editEl;
      editHasContent = !!editEl.innerText.trim();
    }
  }

  async function commitEdit() {
    if (editingId == null) return;
    if (!editEl) return;
    const id = editingId;
    const sanitized = sanitizeDiaryHtml(editEl.innerHTML);
    const hasText = !!editEl.innerText.trim();
    const stopId = stopFilter || editStopId || null;
    editingId = null;
    editEl.innerHTML = '';
    editHasContent = false;
    editStopId = '';
    editPickerOpen = false;
    if (sanitized && hasText) {
      await updateDiaryEntry(id, { text: sanitized, stopId });
      await refresh();
      dispatch('change');
    }
  }

  function cancelEdit() {
    editingId = null;
    if (editEl) editEl.innerHTML = '';
    editHasContent = false;
    editStopId = '';
    editPickerOpen = false;
  }

  async function remove(id) {
    await deleteDiaryEntry(id);
    await refresh();
    dispatch('change');
  }

  function stopNameOrNull(id) {
    const s = id ? getStop(id) : null;
    return s ? s.name : null;
  }

  /* Always show date + time stamped on the note when it was saved.
     The date input on the composer was retired 2026-06-06; the
     timestamp is whatever moment the user tapped Add note. The
     short kicker reads e.g. "Sat, Jun 12 . 10:30 AM". For same-day
     entries we still tag with Today / Yesterday for warmth. */
  function formatEntryDate(entry) {
    if (!entry || !entry.createdAt) return '';
    const dt = new Date(entry.createdAt);
    const now = new Date();
    const time = dt.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
    const sameDay = dt.toDateString() === now.toDateString();
    if (sameDay) return `Today  .  ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (dt.toDateString() === yesterday.toDateString()) return `Yesterday  .  ${time}`;
    const sameYear = dt.getFullYear() === now.getFullYear();
    const date = dt.toLocaleDateString('en-CA', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: sameYear ? undefined : 'numeric'
    });
    return `${date}  .  ${time}`;
  }
</script>

<div>
  {#if !hideHeader}
  <div class="flex items-baseline justify-between mb-3">
    <div>
      <div class="kicker">Journey</div>
      <h3 class="font-serif font-bold text-forest text-xl">Travel Diary</h3>
    </div>
    {#if loaded && visibleEntries.length > 0}
      <span class="font-serif italic text-rust text-sm flex-none">
        {visibleEntries.length} {visibleEntries.length === 1 ? 'note' : 'notes'}
      </span>
    {/if}
  </div>
  {/if}

  {#if loaded}
    <!-- Add-entry composer. The textarea was retired 2026-06-06 in
         favour of a contenteditable div + tiny toolbar (B / I /
         bullet / emoji-sticker) so users can add the lightest touch
         of formatting and drop in Northlander stickers without
         leaving the diary. Sanitization on save (see
         diary-html.js) keeps the stored HTML safe to {@html}. -->
    <form on:submit|preventDefault={handleAdd} class="diary-add">
      <div class="diary-toolbar" aria-label="Format">
        <button
          type="button"
          class="diary-tool"
          on:mousedown|preventDefault={() => { rememberSelection(composerEl); runCmd('bold'); }}
          aria-label="Bold"
          title="Bold (Cmd/Ctrl+B)"
        ><strong>B</strong></button>
        <button
          type="button"
          class="diary-tool"
          on:mousedown|preventDefault={() => { rememberSelection(composerEl); runCmd('italic'); }}
          aria-label="Italic"
          title="Italic (Cmd/Ctrl+I)"
        ><em>I</em></button>
        <button
          type="button"
          class="diary-tool"
          on:mousedown|preventDefault={() => { rememberSelection(composerEl); runCmd('insertUnorderedList'); }}
          aria-label="Bullet list"
          title="Bullet list"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="5" cy="6" r="1" fill="currentColor"/>
            <circle cx="5" cy="12" r="1" fill="currentColor"/>
            <circle cx="5" cy="18" r="1" fill="currentColor"/>
            <line x1="9" y1="6" x2="20" y2="6"/>
            <line x1="9" y1="12" x2="20" y2="12"/>
            <line x1="9" y1="18" x2="20" y2="18"/>
          </svg>
        </button>
        <span class="diary-tool-sep" aria-hidden="true"></span>
        <div class="diary-tool-emoji-wrap">
          <button
            type="button"
            class="diary-tool"
            class:is-active={composerPickerOpen}
            on:mousedown|preventDefault={() => { rememberSelection(composerEl); composerPickerOpen = !composerPickerOpen; }}
            aria-label="Sticker or emoji"
            aria-expanded={composerPickerOpen}
            title="Stickers + emoji"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9"/>
              <circle cx="9" cy="10" r="0.8" fill="currentColor"/>
              <circle cx="15" cy="10" r="0.8" fill="currentColor"/>
              <path d="M8.5 14 q3.5 3 7 0"/>
            </svg>
          </button>
          <EmojiPicker open={composerPickerOpen} on:pick={onPickerPick} on:close={() => (composerPickerOpen = false)} />
        </div>
      </div>
      <div
        bind:this={composerEl}
        contenteditable="true"
        class="diary-rich"
        class:is-empty={!composerHasContent}
        data-placeholder="Pin a thought, a meal, a view from the window..."
        role="textbox"
        aria-multiline="true"
        on:focus={() => { activeEditor = composerEl; rememberSelection(composerEl); }}
        on:input={() => { composerHasContent = !!composerEl?.innerText.trim(); rememberSelection(composerEl); }}
        on:keyup={() => rememberSelection(composerEl)}
        on:mouseup={() => rememberSelection(composerEl)}
        on:keydown={(e) => {
          if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); rememberSelection(composerEl); runCmd('bold'); }
          if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); rememberSelection(composerEl); runCmd('italic'); }
        }}
      ></div>
      <div class="diary-add-row">
        {#if !stopFilter && tripStops.length > 0}
          <label class="diary-stop-pick">
            <span class="sr-only">Pin to a stop</span>
            <select bind:value={draftStopId} class="diary-select">
              <option value="">Anywhere on the trip</option>
              {#each tripStops as s}
                <option value={s.id}>At {s.name}</option>
              {/each}
            </select>
          </label>
        {:else if !stopFilter}
          <span class="font-serif italic text-muted text-sm">Add stops to your trip to pin notes to a place.</span>
        {:else}
          <span class="font-serif italic text-muted text-sm">Pinned to this stop.</span>
        {/if}
        <button
          type="submit"
          class="btn-primary disabled:opacity-50"
          disabled={saving || !composerHasContent}
        >
          {saving ? 'Pinning...' : 'Add note'}
        </button>
      </div>
    </form>

    <!-- Entries feed -->
    {#if visibleEntries.length === 0}
      <p class="font-serif italic text-muted mt-4">
        {#if stopFilter}
          Nothing here yet. Drop a thought in the composer above.
        {:else}
          No notes yet. The first one is always the hardest. Try: "Toronto Union, finally."
        {/if}
      </p>
    {:else}
      <ol class="diary-feed">
        {#each visibleEntries as entry (entry.id)}
          <li class="diary-entry" class:is-editing={editingId === entry.id}>
            {#if editingId === entry.id}
              <div class="diary-toolbar" aria-label="Format">
                <button
                  type="button"
                  class="diary-tool"
                  on:mousedown|preventDefault={() => { rememberSelection(editEl); runCmd('bold'); }}
                  aria-label="Bold"
                ><strong>B</strong></button>
                <button
                  type="button"
                  class="diary-tool"
                  on:mousedown|preventDefault={() => { rememberSelection(editEl); runCmd('italic'); }}
                  aria-label="Italic"
                ><em>I</em></button>
                <button
                  type="button"
                  class="diary-tool"
                  on:mousedown|preventDefault={() => { rememberSelection(editEl); runCmd('insertUnorderedList'); }}
                  aria-label="Bullet list"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="5" cy="6" r="1" fill="currentColor"/>
                    <circle cx="5" cy="12" r="1" fill="currentColor"/>
                    <circle cx="5" cy="18" r="1" fill="currentColor"/>
                    <line x1="9" y1="6" x2="20" y2="6"/>
                    <line x1="9" y1="12" x2="20" y2="12"/>
                    <line x1="9" y1="18" x2="20" y2="18"/>
                  </svg>
                </button>
                <span class="diary-tool-sep" aria-hidden="true"></span>
                <div class="diary-tool-emoji-wrap">
                  <button
                    type="button"
                    class="diary-tool"
                    class:is-active={editPickerOpen}
                    on:mousedown|preventDefault={() => { rememberSelection(editEl); editPickerOpen = !editPickerOpen; }}
                    aria-label="Sticker or emoji"
                    aria-expanded={editPickerOpen}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9"/>
                      <circle cx="9" cy="10" r="0.8" fill="currentColor"/>
                      <circle cx="15" cy="10" r="0.8" fill="currentColor"/>
                      <path d="M8.5 14 q3.5 3 7 0"/>
                    </svg>
                  </button>
                  <EmojiPicker open={editPickerOpen} on:pick={onPickerPick} on:close={() => (editPickerOpen = false)} />
                </div>
              </div>
              <div
                bind:this={editEl}
                contenteditable="true"
                class="diary-rich"
                class:is-empty={!editHasContent}
                data-placeholder="Edit your note..."
                role="textbox"
                aria-multiline="true"
                on:focus={() => { activeEditor = editEl; rememberSelection(editEl); }}
                on:input={() => { editHasContent = !!editEl?.innerText.trim(); rememberSelection(editEl); }}
                on:keyup={() => rememberSelection(editEl)}
                on:mouseup={() => rememberSelection(editEl)}
                on:keydown={(e) => {
                  if (e.key === 'Escape') cancelEdit();
                  if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); rememberSelection(editEl); runCmd('bold'); }
                  if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); rememberSelection(editEl); runCmd('italic'); }
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitEdit(); }
                }}
              ></div>
              <div class="diary-add-row">
                {#if !stopFilter && tripStops.length > 0}
                  <select bind:value={editStopId} class="diary-select">
                    <option value="">Anywhere on the trip</option>
                    {#each tripStops as s}
                      <option value={s.id}>At {s.name}</option>
                    {/each}
                  </select>
                {/if}
                <div class="ml-auto flex items-center gap-3">
                  <button type="button" class="font-serif italic text-muted hover:text-rust text-sm" on:click={cancelEdit}>Cancel</button>
                  <button type="button" class="btn-primary" on:click={commitEdit} disabled={!editHasContent}>Save note</button>
                </div>
              </div>
            {:else}
              <div class="diary-meta">
                <span class="diary-date">{formatEntryDate(entry)}</span>
                {#if entry.stopId && stopNameOrNull(entry.stopId)}
                  <span class="diary-stop-pill">{stopNameOrNull(entry.stopId)}</span>
                {/if}
                {#if entry.updatedAt > entry.createdAt + 1000}
                  <span class="diary-edited">edited</span>
                {/if}
              </div>
              <div class="diary-text">{@html renderDiaryText(entry.text)}</div>
              <div class="diary-actions">
                <button type="button" class="diary-action" on:click={() => startEdit(entry)}>Edit</button>
                <button type="button" class="diary-action" on:click={() => remove(entry.id)}>Delete</button>
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  {/if}
</div>

<style>
  .diary-add {
    background: #fbf6ea;
    border: 1.5px dashed rgba(139, 106, 58, 0.55);
    border-radius: 4px;
    padding: 14px 16px;
    margin-bottom: 18px;
  }
  /* ===== Toolbar =====
     Sits above the contenteditable composer + edit form. Small rust
     buttons that don't fight the editorial type below. */
  .diary-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .diary-tool {
    background: transparent;
    border: 1px solid rgba(139, 106, 58, 0.45);
    border-radius: 4px;
    color: #5a4f3d;
    width: 28px;
    height: 28px;
    padding: 0;
    cursor: pointer;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 13px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
  }
  .diary-tool strong { font-weight: 900; }
  .diary-tool em { font-style: italic; font-weight: 600; }
  .diary-tool:hover {
    background: rgba(125, 58, 30, 0.08);
    border-color: #7d3a1e;
    color: #5e2a14;
  }
  .diary-tool.is-active {
    background: #5e2a14;
    border-color: #5e2a14;
    color: #fffdf6;
  }
  .diary-tool-sep {
    width: 1px;
    height: 16px;
    background: rgba(139, 106, 58, 0.45);
    margin: 0 4px;
  }
  .diary-tool-emoji-wrap {
    position: relative;
    display: inline-block;
  }

  /* ===== Rich-text composer =====
     contenteditable div styled to feel like the previous textarea
     while giving us a place to render the inline-SVG stickers and
     bold/italic/list formatting. */
  .diary-rich {
    width: 100%;
    min-height: 72px;
    background: transparent;
    outline: none;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 16px;
    line-height: 1.55;
    color: #241f1a;
  }
  /* Placeholder via :empty + data-placeholder; contenteditable
     doesn't support the native placeholder attribute. */
  .diary-rich.is-empty:before {
    content: attr(data-placeholder);
    color: rgba(90, 79, 61, 0.55);
    font-style: italic;
    pointer-events: none;
  }
  .diary-rich :global(ul),
  .diary-rich :global(ol) {
    padding-left: 1.4em;
    margin: 4px 0;
  }
  .diary-rich :global(li) {
    margin: 2px 0;
  }
  .diary-rich :global(.sticker) {
    display: inline-flex;
    align-items: center;
    vertical-align: -3px;
    margin: 0 2px;
    color: #7d3a1e;
    user-select: none;
  }
  .diary-add-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .diary-stop-pick {
    flex: 1;
    min-width: 0;
  }
  .diary-select {
    background: #fffdf6;
    border: 1px solid #8b6a3a;
    border-radius: 3px;
    padding: 6px 10px;
    font-family: 'Spline Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #0a2d21;
    cursor: pointer;
    outline: none;
    max-width: 100%;
  }
  .diary-select:focus {
    border-color: #7d3a1e;
  }

  .diary-feed {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .diary-entry {
    position: relative;
    background: #fbf6ea;
    border-left: 4px solid #c4860f;
    padding: 14px 16px 12px;
    box-shadow: 0 4px 12px rgba(80, 50, 20, 0.06);
  }
  .diary-entry.is-editing {
    border-left-color: #7d3a1e;
    background: #fffdf6;
  }
  .diary-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 6px;
  }
  .diary-date {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  .diary-stop-pill {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #0a2d21;
    background: rgba(196, 134, 15, 0.18);
    border: 1px dashed #c4860f;
    border-radius: 999px;
    padding: 2px 10px;
  }
  .diary-edited {
    font-family: 'Spline Sans', sans-serif;
    font-size: 10px;
    color: rgba(90, 79, 61, 0.7);
    font-style: italic;
    text-transform: lowercase;
  }
  .diary-text {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 16px;
    line-height: 1.6;
    color: #241f1a;
    margin: 0 0 8px;
  }
  .diary-text :global(ul),
  .diary-text :global(ol) {
    padding-left: 1.4em;
    margin: 4px 0;
  }
  .diary-text :global(li) { margin: 2px 0; }
  .diary-text :global(.sticker) {
    display: inline-flex;
    align-items: center;
    vertical-align: -3px;
    margin: 0 2px;
    color: #7d3a1e;
  }
  .diary-actions {
    display: flex;
    gap: 14px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .diary-entry:hover .diary-actions,
  .diary-entry:focus-within .diary-actions {
    opacity: 1;
  }
  .diary-action {
    background: transparent;
    border: 0;
    padding: 0;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #7d3a1e;
    cursor: pointer;
    transition: color 0.15s;
  }
  .diary-action:hover {
    color: #0a2d21;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
</style>
