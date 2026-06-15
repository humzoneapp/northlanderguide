/* ==================================================================
   Build site/sitemap.xml from data.js.

   Stable surface pages (home, events, stops index, plan-a-trip,
   submit-event, privacy, terms) are listed by hand. Stop pages
   are derived from STOPS in site/data.js so adding a stop only
   requires one source-of-truth edit; re-running this script picks
   the new id up automatically.

   Re-run after adding a stop or surface page:
     node tools/build-sitemap.mjs
   ================================================================== */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dataJs = readFileSync(join(root, 'site', 'data.js'), 'utf8');
const stopIds = [...new Set(
  [...dataJs.matchAll(/id:"([a-z]+)"/g)].map(m => m[1])
)];

const BASE = 'https://northlanderguide.com';
const today = new Date().toISOString().slice(0, 10);

/* changefreq + priority intentionally pinned per page type, not per
   stop, so the file diff is small when content changes. Search
   engines treat these as hints rather than promises. */
const surfaces = [
  { path: '/',              priority: '1.0',  changefreq: 'weekly'  },
  { path: '/events',        priority: '0.9',  changefreq: 'daily'   },
  { path: '/stops',         priority: '0.8',  changefreq: 'weekly'  },
  { path: '/plan-a-trip',   priority: '0.9',  changefreq: 'monthly' },
  { path: '/submit-event',  priority: '0.5',  changefreq: 'monthly' },
  { path: '/privacy',       priority: '0.3',  changefreq: 'yearly'  },
  { path: '/terms',         priority: '0.3',  changefreq: 'yearly'  }
];

const stopEntries = stopIds.map(id => ({
  path: `/stops/${id}`,
  priority: '0.8',
  changefreq: 'weekly'
}));

const entries = [...surfaces, ...stopEntries];

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries.map(e => [
    '  <url>',
    `    <loc>${BASE}${e.path}</loc>`,
    `    <lastmod>${today}</lastmod>`,
    `    <changefreq>${e.changefreq}</changefreq>`,
    `    <priority>${e.priority}</priority>`,
    '  </url>'
  ].join('\n')),
  '</urlset>',
  ''
].join('\n');

writeFileSync(join(root, 'site', 'sitemap.xml'), xml);
console.log(`wrote site/sitemap.xml: ${entries.length} URLs (${stopIds.length} stops + ${surfaces.length} surfaces)`);
