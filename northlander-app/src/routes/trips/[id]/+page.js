/* Trip data lives in IndexedDB on the user's device. There's no
   point pre-rendering or server-rendering this route - the server
   has no access to the user's trips, and any SSR'd HTML would be
   replaced as soon as the client hydrates. */
export const ssr = false;
export const prerender = false;
