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
import { getStopsByIds, stopImageUrl } from '$lib/data/stops.js';

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

/* Pick up to three stops to feature as polaroids - the departure,
   a middle stop, and the destination - so the collage tells the
   trip's story at a glance without crowding the right column. For
   very short trips we return whatever stops exist. */
function pickCollageStops(stops) {
  if (!Array.isArray(stops) || stops.length === 0) return [];
  if (stops.length <= 3) return stops.slice();
  const last = stops.length - 1;
  const idxs = [0, Math.round(last / 2), last];
  const seen = new Set();
  const out = [];
  for (const i of idxs) {
    if (seen.has(i)) continue;
    seen.add(i);
    out.push(stops[i]);
  }
  return out;
}

/* Load an image into a canvas-drawable bitmap. Stop hero images
   come from /stop-images/* which is a Vercel rewrite to the Guide
   (see stops.js + vercel.json) so the fetch is same-origin and
   never needs a CORS-friendly proxy. Returns null on any failure
   so the caller can drop in a forest-tile placeholder. */
async function loadImage(url) {
  if (!url || typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(blob); }
      catch (_) { /* fall through to <img> path */ }
    }
    return await new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(blob);
      img.onload = () => {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      };
      img.src = objectUrl;
    });
  } catch (_) {
    return null;
  }
}

/* Draw a tilted polaroid frame at (cx, cy) with a photo image
   inside and a stop-name caption below. Photo is "cover"-cropped
   into the photo box so the aspect ratio is consistent regardless
   of source. Falls back to a forest-tile + giant initial when the
   image failed to load (CORS error, 404, etc). */
function drawPolaroid(ctx, { cx, cy, w, h, tilt, img, label }) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  /* Drop shadow under the frame so the polaroid pops off the
     linen paper. */
  ctx.shadowColor = 'rgba(35, 25, 15, 0.32)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 10;

  /* Cream paper frame with a hairline gold inner rule that reads
     as "polaroid border" without competing with the photo. */
  ctx.fillStyle = '#fffdf6';
  ctx.fillRect(-w / 2, -h / 2, w, h);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = 'rgba(201, 168, 76, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);

  /* Photo box: top portion of the polaroid. Standard polaroid
     ratio leaves more space at the bottom for the caption. */
  const padInside = 14;
  const photoW = w - padInside * 2;
  const photoH = h - padInside * 2 - 56; /* 56px caption strip */
  const photoX = -w / 2 + padInside;
  const photoY = -h / 2 + padInside;

  if (img) {
    /* Cover-crop: scale the image so it fills the photo box without
       letterboxing, then center-crop the overflow. */
    const sAR = img.width / img.height;
    const dAR = photoW / photoH;
    let sx = 0;
    let sy = 0;
    let sw = img.width;
    let sh = img.height;
    if (sAR > dAR) {
      sw = img.height * dAR;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / dAR;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, photoX, photoY, photoW, photoH);
  } else {
    /* Fallback: forest tile with a giant Fraunces initial in the
       middle so the polaroid still reads as something. */
    ctx.fillStyle = C.forest;
    ctx.fillRect(photoX, photoY, photoW, photoH);
    ctx.fillStyle = C.gold;
    ctx.font = '900 96px Fraunces';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      (label || '?').trim().charAt(0).toUpperCase(),
      photoX + photoW / 2,
      photoY + photoH / 2
    );
  }

  /* Caption strip with the stop name in italic Fraunces, hand-
     written feel. Truncated so a long station name doesn't blow
     out the bottom of the polaroid. */
  ctx.fillStyle = C.ink;
  ctx.font = 'italic 700 22px Fraunces';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const captionY = -h / 2 + padInside + photoH + 30;
  ctx.fillText(
    ellipsize(ctx, label || '', photoW - 8),
    0,
    captionY
  );

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

  /* Preload up to four stop hero images for the polaroid collage.
     We pick from across the route so the collage tells the trip's
     story at a glance: the departure, two middle stops, the
     destination. Loads run in parallel and resolve to null on
     failure so a slow / blocked image never blocks the poster. */
  const collageStops = pickCollageStops(stops);
  const collageImages = await Promise.all(
    collageStops.map((s) => loadImage(stopImageUrl(s)))
  );

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

    /* Narrower label column: the polaroid collage now lives in the
       right half (~520-1024), so station labels need to terminate
       before that boundary. Was W - railX - 70 - PAD = 754; now
       capped so a long station name ellipsizes instead of running
       under the photos. */
    const labelMaxW = 460;

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

      /* name - slightly smaller so the narrower column doesn't
         truncate names that previously fit. */
      ctx.fillStyle = C.forest;
      ctx.font = rowH > 70 ? '900 30px Fraunces' : '900 24px Fraunces';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ellipsize(ctx, stop.name, labelMaxW), railX + 50, y - 8);

      /* region + arrival clock */
      ctx.fillStyle = C.muted;
      ctx.font = '700 14px "Spline Sans"';
      const region = stop.region || '';
      const time = arrivalClock(stop.offsetMinutes, departure, direction);
      const meta = region + (region && time ? '  ·  ' : '') + time;
      ctx.fillText(ellipsize(ctx, meta, labelMaxW), railX + 50, y + 18);
    });

    /* ----- polaroid collage =====
       Up to three tilted polaroids scattered down the right half
       so the shareable image carries some actual photography (the
       stops' hero photos), not just typography. Positions are
       deliberately staggered to read as something a real traveller
       laid down on the page rather than a tidy grid - and the
       bottom polaroid intentionally slides a corner under the foot
       band so it reads as tucked-into-the-ticket. */
    if (collageStops.length > 0) {
      const SLOTS = [
        { cx: 840, cy: 480, w: 250, h: 290, tilt:  0.06 },
        { cx: 770, cy: 660, w: 230, h: 270, tilt: -0.08 },
        { cx: 880, cy: 780, w: 220, h: 240, tilt:  0.05 }
      ];
      collageStops.forEach((stop, i) => {
        const slot = SLOTS[i];
        if (!slot) return;
        drawPolaroid(ctx, {
          ...slot,
          img: collageImages[i],
          label: stop.name
        });
      });
    }
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
