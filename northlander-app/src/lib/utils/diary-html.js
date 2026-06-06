/* ==================================================================
   Diary HTML sanitizer.

   The travel diary composer is a `contenteditable` surface so it can
   hand the user bold / italic / bullets via execCommand and inline
   Northlander stickers. Whatever comes out of contenteditable is raw
   HTML the user (or their clipboard) put there, so we whitelist it
   strictly before it touches the database or the rendered feed.

   What's allowed:
     - `<b>`, `<strong>`, `<i>`, `<em>`, `<u>`     - emphasis
     - `<p>`, `<br>`                               - line breaks
     - `<ul>`, `<ol>`, `<li>`                      - lists
     - `<span class="sticker">` with an inline SVG inside it for
       the curated Northlander stickers (see `diary-stickers.js`)

   Everything else is unwrapped (children kept, tag dropped) or
   removed outright (e.g. `<script>`). All attributes are stripped
   except `class="sticker"` on `<span>` and the geometry attrs
   needed by the inline sticker SVG.

   Existing legacy plain-text diary entries (no HTML in `entry.text`)
   keep working: `renderDiaryText` escapes them and converts newlines
   to `<br>` for display.
   ================================================================== */

const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u',
  'p', 'br',
  'ul', 'ol', 'li',
  'span'
]);

/* The sticker SVG is small and uses only these primitives. Anything
   outside the set gets stripped (defense-in-depth against a paste
   carrying weird vector data). */
const ALLOWED_SVG_TAGS = new Set([
  'svg', 'g', 'path', 'circle', 'rect', 'line',
  'polyline', 'polygon', 'ellipse'
]);
const ALLOWED_SVG_ATTRS = new Set([
  'viewbox', 'width', 'height',
  'd', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'r', 'cx', 'cy', 'rx', 'ry',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'points', 'transform', 'aria-hidden'
]);

/**
 * Sanitize a diary HTML string. Returns a safe HTML string that the
 * feed can {@html} without further escaping. Empty / whitespace-only
 * input returns ''.
 *
 * @param {string} input
 * @returns {string}
 */
export function sanitizeDiaryHtml(input) {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (typeof DOMParser === 'undefined') {
    /* SSR fallback - strip every tag rather than ship raw HTML. */
    return trimmed.replace(/<[^>]+>/g, '');
  }
  const doc = new DOMParser().parseFromString(
    '<div id="root">' + trimmed + '</div>',
    'text/html'
  );
  const root = doc.getElementById('root');
  if (!root) return '';
  cleanNode(root);
  /* Collapse leftover empty paragraphs / breaks at the head + tail. */
  const html = root.innerHTML
    .replace(/^(\s|<br\s*\/?>|<p>\s*<\/p>)+/i, '')
    .replace(/(\s|<br\s*\/?>|<p>\s*<\/p>)+$/i, '');
  return html;
}

function cleanNode(node) {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === 3 /* TEXT_NODE */) continue;
    if (child.nodeType !== 1 /* ELEMENT_NODE */) {
      node.removeChild(child);
      continue;
    }
    const tag = child.tagName.toLowerCase();
    if (tag === 'span' && child.classList.contains('sticker')) {
      cleanSticker(child);
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      /* Unwrap: keep the children but drop the wrapper. Common case:
         pasted div / a / font from another editor. */
      while (child.firstChild) node.insertBefore(child.firstChild, child);
      node.removeChild(child);
      continue;
    }
    /* Strip every attribute. Lists and emphasis don't need any. */
    for (const attr of Array.from(child.attributes)) {
      child.removeAttribute(attr.name);
    }
    cleanNode(child);
  }
}

function cleanSticker(span) {
  /* Keep only the `class="sticker"` attribute on the wrapper. */
  for (const attr of Array.from(span.attributes)) {
    if (attr.name === 'class' && span.classList.contains('sticker')) continue;
    span.removeAttribute(attr.name);
  }
  /* Walk children: only inline-SVG is allowed. Everything else
     drops. */
  const children = Array.from(span.childNodes);
  let kept = 0;
  for (const child of children) {
    if (child.nodeType === 1 /* ELEMENT_NODE */ && child.tagName.toLowerCase() === 'svg') {
      cleanSvg(child);
      kept += 1;
    } else {
      span.removeChild(child);
    }
  }
  /* Belt-and-braces: stickers must always be inert when the user
     navigates over them in the editor. */
  span.setAttribute('contenteditable', 'false');
  /* Drop the entire wrapper if the SVG turned out to be empty. */
  if (kept === 0) span.parentNode?.removeChild(span);
}

function cleanSvg(svg) {
  /* Whitelist attrs on the svg itself + every descendant. Walk
     iteratively so we don't recurse into a removed subtree. */
  const stack = [svg];
  while (stack.length) {
    const node = stack.pop();
    const tag = node.tagName.toLowerCase();
    if (!ALLOWED_SVG_TAGS.has(tag)) {
      node.parentNode?.removeChild(node);
      continue;
    }
    for (const attr of Array.from(node.attributes)) {
      if (!ALLOWED_SVG_ATTRS.has(attr.name.toLowerCase())) {
        node.removeAttribute(attr.name);
      }
    }
    for (const child of Array.from(node.children)) {
      stack.push(child);
    }
  }
}

/**
 * Strict HTML escape for legacy plain-text entries. Returns a safe
 * fragment with line breaks converted to `<br>`. Used by the feed
 * when an existing entry has no HTML tags.
 */
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render whatever's in `entry.text` for the diary feed. Pre-rich
 * entries are plain text; we escape them and convert newlines to
 * `<br>`. Rich entries are already-sanitized HTML; we pass through.
 *
 * @param {string} text
 * @returns {string}
 */
export function renderDiaryText(text) {
  if (typeof text !== 'string' || !text) return '';
  /* Heuristic: anything containing a `<` is treated as HTML, then
     sanitized (so even an old plain-text entry that happened to
     include `<3` gets rendered safely). */
  if (/[<&]/.test(text)) {
    return sanitizeDiaryHtml(text);
  }
  return escapeHtml(text).replace(/\r?\n/g, '<br>');
}
