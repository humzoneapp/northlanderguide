/* The /share route reads a payload out of the URL fragment and writes
   to IndexedDB on accept. Both are browser-only, so prerender + SSR
   are off. */
export const ssr = false;
export const prerender = false;
