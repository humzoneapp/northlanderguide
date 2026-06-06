/* ==================================================================
   Northlander diary stickers.

   A small curated set of inline-SVG icons in the App's vintage
   railway-poster vocabulary, surfaced from the EmojiPicker so users
   can drop a "train", a "pine", a "polaroid" etc. into a diary
   entry without leaving the editor. They're stored on the entry as
   `<span class="sticker">{svg}</span>` and rendered in the feed via
   the sanitizer's allowlist.

   Each sticker carries a `name` (kebab-case, used in aria-labels),
   a `label` (human-readable for the picker), and an `svg` string
   ready to drop into the contenteditable. The SVGs use
   `currentColor` so they take on the surrounding text colour - a
   sticker in a forest paragraph reads forest; a sticker in rust
   reads rust. 18x18 keeps them inline with body type without
   pushing the line height.

   Added 2026-06-06. Keep additions disciplined; ten or so is
   plenty for a journal.
   ================================================================== */

/* Common attrs every sticker SVG declares the same way so the
   sanitizer's whitelist (see diary-html.js) doesn't strip anything
   we want to keep. */
const SVG_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const SVG_CLOSE = '</svg>';

function svg(inner) {
  return SVG_OPEN + inner + SVG_CLOSE;
}

export const NORTHLANDER_STICKERS = [
  {
    name: 'train',
    label: 'Train',
    svg: svg(
      '<rect x="4" y="4" width="16" height="14" rx="3"/>' +
      '<path d="M4 11 L20 11"/>' +
      '<circle cx="8.5" cy="20" r="1.4"/>' +
      '<circle cx="15.5" cy="20" r="1.4"/>' +
      '<path d="M7 17 L7 19"/>' +
      '<path d="M17 17 L17 19"/>'
    )
  },
  {
    name: 'pine',
    label: 'Pine',
    svg: svg(
      '<polygon points="12 3 7 10 10 10 6 16 11 16 8 21 16 21 13 16 18 16 14 10 17 10"/>'
    )
  },
  {
    name: 'mountain',
    label: 'Mountain',
    svg: svg(
      '<polyline points="3 19 9 9 13 15 17 11 21 19"/>' +
      '<circle cx="16" cy="6" r="2"/>'
    )
  },
  {
    name: 'lake',
    label: 'Lake',
    svg: svg(
      '<path d="M3 12 q3 -3 6 0 t6 0 t6 0"/>' +
      '<path d="M3 17 q3 -3 6 0 t6 0 t6 0"/>'
    )
  },
  {
    name: 'sun',
    label: 'Sun',
    svg: svg(
      '<circle cx="12" cy="12" r="4"/>' +
      '<line x1="12" y1="3" x2="12" y2="6"/>' +
      '<line x1="12" y1="18" x2="12" y2="21"/>' +
      '<line x1="3" y1="12" x2="6" y2="12"/>' +
      '<line x1="18" y1="12" x2="21" y2="12"/>' +
      '<line x1="5.5" y1="5.5" x2="7.5" y2="7.5"/>' +
      '<line x1="16.5" y1="16.5" x2="18.5" y2="18.5"/>' +
      '<line x1="5.5" y1="18.5" x2="7.5" y2="16.5"/>' +
      '<line x1="16.5" y1="7.5" x2="18.5" y2="5.5"/>'
    )
  },
  {
    name: 'moon',
    label: 'Moon',
    svg: svg(
      '<path d="M20 14 a8 8 0 1 1 -10 -10 a6 6 0 0 0 10 10 z"/>'
    )
  },
  {
    name: 'lantern',
    label: 'Lantern',
    svg: svg(
      '<rect x="8" y="6" width="8" height="11" rx="1"/>' +
      '<path d="M8 9 L16 9"/>' +
      '<path d="M8 14 L16 14"/>' +
      '<path d="M12 3 L12 6"/>' +
      '<path d="M10 17 L14 17"/>' +
      '<path d="M11 17 L11 20"/>' +
      '<path d="M13 17 L13 20"/>'
    )
  },
  {
    name: 'polaroid',
    label: 'Polaroid',
    svg: svg(
      '<rect x="4" y="4" width="16" height="16" rx="1"/>' +
      '<rect x="6" y="6" width="12" height="9"/>' +
      '<circle cx="12" cy="10.5" r="2"/>'
    )
  },
  {
    name: 'compass',
    label: 'Compass',
    svg: svg(
      '<circle cx="12" cy="12" r="9"/>' +
      '<polygon points="12 6 14 12 12 18 10 12" fill="currentColor" stroke="none"/>'
    )
  },
  {
    name: 'ticket',
    label: 'Ticket',
    svg: svg(
      '<path d="M3 8 a2 2 0 0 1 2 -2 h14 a2 2 0 0 1 2 2 v1 a2 2 0 0 0 0 4 v1 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 v-1 a2 2 0 0 0 0 -4 z"/>' +
      '<path d="M10 6 L10 18" stroke-dasharray="2 2"/>'
    )
  }
];

/* Quick lookup by name for the sanitizer / sticker insertion paths. */
export function getSticker(name) {
  return NORTHLANDER_STICKERS.find((s) => s.name === name) || null;
}

/* Curated native emojis grouped lightly so the picker doesn't
   become a typeahead. We deliberately avoid the full unicode set;
   travel + nature + a handful of expressive ones is plenty. */
export const CURATED_EMOJI = [
  /* Travel / journey */
  '\u{1F683}', '\u{1F69E}', '\u{1F6E4}️', '\u{1F5FA}️',
  '\u{1F4CD}', '\u{1F9F3}', '\u{1F392}', '\u{1F39F}️',
  /* Weather + sky */
  '\u{2600}️', '\u{1F319}', '\u{2728}', '\u{2601}️',
  '\u{1F327}️', '\u{1F328}️', '\u{1F308}',
  /* Outdoors */
  '\u{1F332}', '\u{1F343}', '\u{1F342}', '\u{1F30A}',
  '\u{1F303}', '\u{26F0}️', '\u{26FA}',
  /* Food + drink */
  '\u{2615}', '\u{1F375}', '\u{1F35C}', '\u{1F37D}️',
  '\u{1F35E}', '\u{1F37A}', '\u{1F377}',
  /* Mood */
  '\u{2764}️', '\u{1F496}', '\u{1F60A}', '\u{1F60D}',
  '\u{1F60C}', '\u{1F970}', '\u{1F62E}\u{200D}\u{1F4A8}',
  '\u{1F389}', '\u{1F44C}'
];
