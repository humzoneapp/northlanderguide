/* ==================================================================
   Render static/icon-source.png to the raster sizes the PWA + iOS need.

   Source artwork: static/icon-source.png (the master, high-resolution
   train-cabin icon). Re-export from your design tool over this file
   when the icon changes and re-run this script.

   Outputs (committed to static/):
     - icon-192.png            Android home screen
     - icon-512.png            Android splash / store
     - apple-touch-icon.png    iOS home screen (180x180, PNG required;
                               iOS doesn't accept SVG for this slot)

   Implementation: shells out to macOS sips for a deterministic
   downscale with no native node dependencies. If you're not on macOS,
   any equivalent (rsvg-convert + ImageMagick) will do; just replace
   the `sips` invocation.

   Re-run after editing static/icon-source.png:
     node tools/build-icons.mjs
   ================================================================== */

import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = join(root, 'static', 'icon-source.png');

const targets = [
  { file: 'icon-192.png',         size: 192 },
  { file: 'icon-512.png',         size: 512 },
  { file: 'apple-touch-icon.png', size: 180 }
];

for (const { file, size } of targets) {
  const out = join(root, 'static', file);
  execFileSync('sips', ['-Z', String(size), src, '--out', out], { stdio: 'ignore' });
  console.log(`wrote static/${file} (${size}x${size})`);
}
