/* ==================================================================
   Vintage trip-share poster generator.
   Renders a 1080x1080 PNG (Instagram square) using the Canvas API.
   Pure canvas so the loaded Fraunces + Spline Sans fonts work
   without SVG-with-fonts-in-canvas headaches.
   ================================================================== */

import {
  arrivalClock,
  departureFor,
  formatTripDate,
  DIRECTIONS
} from '$lib/data/schedule.js';
import { getStopsByIds } from '$lib/data/stops.js';

const W = 1080;
const H = 1080;
const PAD = 56;

const C = {
  cream:  '#fbf6ea',
  paper:  '#f3e6c8',
  forest: '#0a2d21',
  rust:   '#7d3a1e',
  gold:   '#c9a84c',
  amber:  '#c4860f',
  ink:    '#241f1a',
  muted:  '#5a4f3d'
};

/* Ensure web fonts are available before drawing. Skipping this step
   leads to a sad system-font fallback. */
async function loadFonts() {
  const fonts = [
    '900 96px Fraunces',
    '900 72px Fraunces',
    '900 56px Fraunces',
    'italic 500 30px Fraunces',
    'italic 500 22px Fraunces',
    '700 22px Fraunces',
    '900 32px "Spline Sans"',
    '700 16px "Spline Sans"',
    '600 18px "Spline Sans"'
  ];
  try {
    await Promise.all(fonts.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
  } catch (err) {
    /* Best-effort: fall through to system fonts. */
  }
}

/* Diagonal linen texture so the background reads as paper. */
function drawLinen(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(45, 30, 20, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -H; i < W + H; i += 9) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
  }
  ctx.stroke();
  ctx.restore();
}

/* Forest band with a double-gold rule. Used at the top and bottom
   of the poster, same trick as the /plan boarding pass header. */
function drawBand(ctx, y, height) {
  ctx.fillStyle = C.forest;
  ctx.fillRect(PAD, y, W - PAD * 2, height);
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y + height - 6);
  ctx.lineTo(W - PAD, y + height - 6);
  ctx.moveTo(PAD, y + height - 2);
  ctx.lineTo(W - PAD, y + height - 2);
  ctx.stroke();
}

/* Pick the largest of three font sizes that fits the trip name in
   the available width. Lets long names stay legible without
   spilling off the card. */
function fitName(ctx, name, maxW) {
  const candidates = [
    '900 96px Fraunces',
    '900 72px Fraunces',
    '900 56px Fraunces'
  ];
  for (const f of candidates) {
    ctx.font = f;
    if (ctx.measureText(name).width <= maxW) return f;
  }
  return candidates[candidates.length - 1];
}

/* Truncate a label to fit a width, ellipsizing the tail. */
function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + '...').width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + '...';
}

function drawStamp(ctx, x, y, r, lines) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.18); // ~-10deg
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.forest;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r - 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = C.forest;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 14px "Spline Sans"';
  ctx.fillText(lines[0], 0, -22);
  ctx.font = '900 22px Fraunces';
  ctx.fillText(lines[1], 0, 0);
  ctx.font = '900 12px "Spline Sans"';
  ctx.fillText(lines[2], 0, 22);
  ctx.restore();
}

/**
 * Render the poster and return a PNG Blob (or null on error).
 *
 * @param {{ id: string, name: string, departureDate?: string|null, direction?: string, stopIds?: string[], color?: string }} trip
 * @returns {Promise<Blob|null>}
 */
export async function generatePosterBlob(trip) {
  if (typeof document === 'undefined') return null;

  await loadFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const direction = trip.direction === 'southbound' ? 'southbound' : 'northbound';
  const dirMeta = DIRECTIONS.find((d) => d.id === direction) || DIRECTIONS[0];
  const departure = departureFor(direction);
  const stopsForward = getStopsByIds(trip.stopIds || []);
  const stops = direction === 'southbound' ? stopsForward.slice().reverse() : stopsForward;
  const dateLine = trip.departureDate ? formatTripDate(trip.departureDate) : null;

  /* ----- background ----- */
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, W, H);
  drawLinen(ctx);

  /* ----- top forest band ----- */
  const headerY = PAD;
  const headerH = 96;
  drawBand(ctx, headerY, headerH);
  ctx.fillStyle = C.cream;
  ctx.font = '900 32px "Spline Sans"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('NORTHLANDER RAILWAY', W / 2, headerY + 50);
  ctx.fillStyle = C.gold;
  ctx.font = '700 16px "Spline Sans"';
  ctx.fillText(
    `${dirMeta.from.toUpperCase()}  ·  ${dirMeta.to.toUpperCase()}  ·  ${dirMeta.label.toUpperCase()}`,
    W / 2,
    headerY + 78
  );

  /* ----- trip name ----- */
  const titleMaxW = W - PAD * 2 - 80;
  const titleFont = fitName(ctx, trip.name, titleMaxW);
  ctx.fillStyle = C.forest;
  ctx.font = titleFont;
  ctx.textAlign = 'center';
  ctx.fillText(trip.name, W / 2, 270);

  /* date / departure line under the title */
  ctx.fillStyle = C.rust;
  ctx.font = 'italic 500 30px Fraunces';
  const dateText = dateLine
    ? `${dateLine}  ·  Departure ${arrivalClock(0, departure, direction)}`
    : `Departure ${arrivalClock(0, departure, direction)}`;
  ctx.fillText(ellipsize(ctx, dateText, titleMaxW), W / 2, 320);

  /* ----- stamp in the corner ----- */
  drawStamp(ctx, W - PAD - 90, 200, 78, ['Boarding Pass', 'The North', 'All Seasons']);

  /* ----- route ----- */
  const routeTop = 400;
  const routeBottom = H - 220;
  const railX = 200;
  const innerH = routeBottom - routeTop;
  const count = Math.max(1, stops.length);
  const rowH = Math.min(96, innerH / count);
  const dotR = rowH > 70 ? 18 : 14;

  if (stops.length === 0) {
    ctx.fillStyle = C.muted;
    ctx.font = 'italic 500 30px Fraunces';
    ctx.textAlign = 'center';
    ctx.fillText('Your suitcase is empty.', W / 2, routeTop + innerH / 2 - 18);
    ctx.fillStyle = C.rust;
    ctx.font = 'italic 500 22px Fraunces';
    ctx.fillText('Add stops on northlander.app to fill this in.', W / 2, routeTop + innerH / 2 + 18);
  } else {
    /* dashed railway line */
    ctx.strokeStyle = C.rust;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(railX, routeTop + dotR);
    ctx.lineTo(railX, routeTop + dotR + (count - 1) * rowH);
    ctx.stroke();
    ctx.setLineDash([]);

    const labelMaxW = W - railX - 70 - PAD;

    stops.forEach((stop, i) => {
      const y = routeTop + dotR + i * rowH;

      /* gold-haloed station dot */
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.arc(railX, y, dotR + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.forest;
      ctx.beginPath();
      ctx.arc(railX, y, dotR, 0, Math.PI * 2);
      ctx.fill();

      /* name */
      ctx.fillStyle = C.forest;
      ctx.font = rowH > 70 ? '900 36px Fraunces' : '900 28px Fraunces';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ellipsize(ctx, stop.name, labelMaxW), railX + 50, y - 8);

      /* region + arrival clock */
      ctx.fillStyle = C.muted;
      ctx.font = '700 16px "Spline Sans"';
      const region = stop.region || '';
      const time = arrivalClock(stop.offsetMinutes, departure, direction);
      const meta = region + (region && time ? '  ·  ' : '') + time;
      ctx.fillText(ellipsize(ctx, meta, labelMaxW), railX + 50, y + 20);
    });
  }

  /* ----- bottom forest band ----- */
  const footY = H - PAD - 110;
  const footH = 110;
  drawBand(ctx, footY, footH);

  ctx.fillStyle = C.gold;
  ctx.font = '900 30px Fraunces';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Packed with Northlander.app', W / 2, footY + 50);

  ctx.fillStyle = C.cream;
  ctx.font = '600 18px "Spline Sans"';
  ctx.fillText('northlanderguide.com  ·  northlander.app', W / 2, footY + 82);

  return await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
  });
}

/**
 * Hand the poster off to the user. Uses the Web Share API when the
 * platform supports sharing files (most modern mobile browsers),
 * otherwise downloads the PNG.
 *
 * @param {Blob} blob
 * @param {string} filename - without extension
 * @param {string} title    - share-sheet title
 */
export async function deliverPoster(blob, filename, title) {
  if (!blob) return;
  const safe = String(filename || 'northlander-trip').replace(/[^a-z0-9-_]+/gi, '-');
  const file = new File([blob], `${safe}.png`, { type: 'image/png' });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (err) {
      /* User cancelled or share failed - fall through to download. */
      if (err && err.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
