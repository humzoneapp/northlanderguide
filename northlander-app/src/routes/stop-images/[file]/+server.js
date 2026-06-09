/* ==================================================================
   Stop hero image proxy + prerender.

   Build-time SvelteKit endpoint that pulls each stop's hero photo
   from the Guide once, writes the bytes into the static build
   output, and serves it at /stop-images/<file>. Vercel then serves
   the result from its CDN as a normal static asset - zero
   serverless invocations at runtime, same-origin from the browser.

   This replaced an earlier vercel.json rewrite that adapter-vercel
   silently ignores (the Build Output API takes precedence over
   project-level rewrites). With prerender = true, the endpoint
   runs once per stop during `vite build`; the response body lands
   in .vercel/output/static/stop-images/<file> and is never
   regenerated at runtime.

   Build depends on the Guide being reachable when we deploy. That's
   a deliberate trade - if the Guide is down at deploy time we want
   the deploy to fail loudly, not silently ship broken polaroids.
   ================================================================== */

import { error } from '@sveltejs/kit';
import { STOPS } from '$lib/data/stops.js';

export const prerender = true;

/* Only allow the filenames the stop catalog actually advertises -
   prerender entries() returns this same list, so any request for a
   different filename is either typo or hostile. */
const ALLOWED_FILES = new Set(
  STOPS.map((s) =>
    String(s.image || '').replace(/^\/+/, '').replace(/^images\//, '')
  ).filter(Boolean)
);

/* Tell the prerenderer which paths to crawl. SvelteKit calls this
   once at build time and walks each returned `{ file }` through the
   GET handler below. */
export function entries() {
  return [...ALLOWED_FILES].map((file) => ({ file }));
}

export async function GET({ params, fetch }) {
  const file = String(params.file || '');
  if (!ALLOWED_FILES.has(file)) {
    throw error(404, 'unknown stop image');
  }
  const upstream = `https://www.northlanderguide.com/images/${file}`;
  const res = await fetch(upstream);
  if (!res.ok) {
    throw error(res.status, `upstream returned ${res.status}`);
  }
  const body = await res.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': res.headers.get('content-type') || 'image/jpeg',
      /* Year-long immutable cache - file content for a given path
         never changes (the filename is derived from the stop id). */
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
