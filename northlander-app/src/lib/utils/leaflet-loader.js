/* ==================================================================
   Lazy Leaflet loader.

   Pulls Leaflet's JS + CSS from a CDN the first time it's asked for
   and resolves to the global L. Idempotent - subsequent calls
   return the same in-flight promise so two simultaneous maps don't
   inject the assets twice. Refuses on SSR (no window).
   ================================================================== */

const LEAFLET_VERSION = '1.9.4';
const JS_URL  = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const CSS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;

let leafletPromise = null;

export function loadLeaflet() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Leaflet requires a browser window'));
  }
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    /* Inject the stylesheet once - tile alignment + popup chrome
       all depend on Leaflet's base CSS. */
    if (!document.getElementById('leaflet-cdn-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-cdn-css';
      link.rel = 'stylesheet';
      link.href = CSS_URL;
      link.crossOrigin = '';
      document.head.appendChild(link);
    }
    /* Then the script. Resolves the in-flight promise with the
       global L on load; rejects + clears the cache on failure so
       subsequent calls can retry. */
    const script = document.createElement('script');
    script.src = JS_URL;
    script.crossOrigin = '';
    script.onload = () => {
      if (window.L) resolve(window.L);
      else {
        leafletPromise = null;
        reject(new Error('Leaflet loaded but L is not on window'));
      }
    };
    script.onerror = () => {
      leafletPromise = null;
      reject(new Error('Failed to load Leaflet from CDN'));
    };
    document.head.appendChild(script);
  });

  return leafletPromise;
}
