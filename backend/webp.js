/* ==================================================================
   Convert downloaded image buffers to WebP via Google's cwebp.

   Both sync-events.js (CI) and build-static.js (local) use this so
   newly-fetched listing + event photos land on disk in the same WebP
   format the one-time bandwidth pass already standardised on. Quality
   80 mirrors tools/convert-images-webp.mjs.

   cwebp lookup order:
     1. $CWEBP env var
     2. /opt/homebrew/bin/cwebp (brew on Apple Silicon)
     3. /usr/local/bin/cwebp   (brew on Intel + apt on Ubuntu)
     4. /usr/bin/cwebp         (apt fallback)
   If none resolves, callers receive a clear error so the workflow
   can fail fast rather than silently shipping JPGs into a .webp URL.
   ================================================================== */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CANDIDATES = [
  process.env.CWEBP,
  '/opt/homebrew/bin/cwebp',
  '/usr/local/bin/cwebp',
  '/usr/bin/cwebp'
].filter(Boolean);

let cachedCwebp = null;
function findCwebp() {
  if (cachedCwebp !== null) return cachedCwebp;
  for (const c of CANDIDATES) {
    try {
      if (fs.existsSync(c)) { cachedCwebp = c; return c; }
    } catch (_) { /* keep looking */ }
  }
  cachedCwebp = '';
  return '';
}

/** Encode an image buffer (jpg/png/etc) to a WebP buffer at q80.
 *  Throws if cwebp can't be found - the caller should install it
 *  (apt-get install -y webp on CI, brew install webp locally). */
function bufferToWebp(buf, { quality = 80 } = {}) {
  const cwebp = findCwebp();
  if (!cwebp) {
    throw new Error(
      'cwebp not found. Install with `brew install webp` (macOS) or `apt-get install -y webp` (Ubuntu / CI), '
      + 'or set CWEBP=/path/to/cwebp.'
    );
  }
  const tmpIn = path.join(os.tmpdir(), `nl-webp-${process.pid}-${Date.now()}.bin`);
  const tmpOut = tmpIn + '.webp';
  try {
    fs.writeFileSync(tmpIn, buf);
    execFileSync(cwebp, ['-q', String(quality), '-quiet', '-mt', tmpIn, '-o', tmpOut], {
      stdio: 'ignore'
    });
    return fs.readFileSync(tmpOut);
  } finally {
    try { fs.unlinkSync(tmpIn); } catch (_) {}
    try { fs.unlinkSync(tmpOut); } catch (_) {}
  }
}

module.exports = { bufferToWebp, findCwebp };
