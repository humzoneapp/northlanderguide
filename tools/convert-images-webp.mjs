/* ==================================================================
   One-time conversion of site/images JPGs to WebP.

   What it does:
     - Walks site/images recursively, finds every .jpg / .jpeg
     - Reads pixel width via `sips`
     - Calls Google's cwebp at quality 80; resizes to a max width
       of 1600px when the source is wider (passes 0 for height so
       cwebp preserves aspect ratio)
     - Writes the .webp next to the original, deletes the original
       on success

   Quality 80 was chosen over q72 (the previous JPEG setting from
   backend/build-static.js) because WebP at q80 already produces
   smaller files than JPEG q72 at equivalent visual quality, and
   the audit traced the bandwidth bill to 905 listings over 150KB
   plus 10 hero JPEGs in the 2-3MB range.

   Requires cwebp on PATH or at CWEBP env var. macOS sips is used
   only to read dimensions, not to encode.

   Re-run after pulling a fresh batch of listing photos via
   backend/build-static.js, or after replacing a hero JPEG:
     node tools/convert-images-webp.mjs

   The script is idempotent: files that are already .webp are
   skipped, and rerunning on a folder mid-conversion picks up where
   the last run stopped.
   ================================================================== */

import { readdirSync, statSync, unlinkSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const imagesRoot = join(root, 'site', 'images');

const CWEBP = process.env.CWEBP || '/tmp/libwebp-1.4.0-mac-arm64/bin/cwebp';
const QUALITY = 80;
const MAX_WIDTH = 1600;

/* Skip dirs that are not source photos. PWA / favicon assets live in
   northlander-app/static, not here, but a future split could reuse
   this script. */
const SKIP_DIRS = new Set(['.', '..']);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) { walk(full, acc); continue; }
    const ext = extname(name).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') acc.push(full);
  }
  return acc;
}

function pixelWidth(file) {
  try {
    const out = execFileSync('sips', ['-g', 'pixelWidth', file], { encoding: 'utf8' });
    const m = out.match(/pixelWidth:\s*(\d+)/);
    return m ? Number(m[1]) : null;
  } catch (_) {
    return null;
  }
}

function convertOne(file) {
  const out = file.replace(/\.(jpe?g)$/i, '.webp');
  if (existsSync(out)) {
    /* Already converted in a previous run; treat as no-op and let
       the caller decide whether to drop the source. */
    return { skipped: true, out };
  }
  const w = pixelWidth(file);
  const args = ['-q', String(QUALITY), '-quiet', '-mt'];
  if (w && w > MAX_WIDTH) args.push('-resize', String(MAX_WIDTH), '0');
  args.push(file, '-o', out);
  execFileSync(CWEBP, args, { stdio: 'ignore' });
  return { skipped: false, out };
}

function main() {
  const files = walk(imagesRoot);
  console.log(`Found ${files.length} JPG / JPEG files under site/images/`);

  let converted = 0, skipped = 0, failed = 0, originalBytes = 0, webpBytes = 0;
  const t0 = Date.now();

  for (const file of files) {
    try {
      const srcSize = statSync(file).size;
      const { skipped: wasSkipped, out } = convertOne(file);
      const outSize = statSync(out).size;
      if (wasSkipped) {
        skipped++;
      } else {
        converted++;
      }
      originalBytes += srcSize;
      webpBytes += outSize;
      unlinkSync(file);
    } catch (e) {
      failed++;
      console.warn(`failed: ${file}: ${e.message}`);
    }
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const origMB = (originalBytes / 1024 / 1024).toFixed(1);
  const webpMB = (webpBytes / 1024 / 1024).toFixed(1);
  const pct = originalBytes ? Math.round((1 - webpBytes / originalBytes) * 100) : 0;
  console.log(
    `\nDone in ${secs}s: ${converted} converted, ${skipped} already-webp skipped, ${failed} failed.`
  );
  console.log(`Bytes: ${origMB}MB JPEG -> ${webpMB}MB WebP (${pct}% smaller).`);
}

main();
