<script>
  /* ==================================================================
     Per-chapter map.

     Lazy-loads Leaflet, drops a Carto Voyager tile layer (muted earth
     tones that sit nicely against the cream paper UI), and pins every
     booking + user event with a geocodable address onto the chapter's
     stop. Tapping a pin opens a popover with name, kind, address, and
     time (when present). Train station itself is pinned at the
     stop's known lat/lng with a gold star to anchor the view.

     The map only initializes when the parent calls `init()` (typically
     when the Drawer wrapping it opens) - Leaflet needs a visible,
     sized container to draw correctly. After init, it tears down on
     destroy + reinitializes if the data changes.
     ================================================================== */

  import { onMount, onDestroy, tick, createEventDispatcher } from 'svelte';
  import { loadLeaflet } from '$lib/utils/leaflet-loader.js';
  import { geocode } from '$lib/utils/geocode.js';
  import { BOOKING_KINDS } from '$lib/stores/bookings.js';

  /** @type {{ lat: number, lng: number, name: string }} */
  export let stop;
  /** @type {Array} */
  export let bookings = [];
  /** @type {Array} */
  export let userEvents = [];

  const dispatch = createEventDispatcher();

  let mapEl;
  let L = null;
  let map = null;
  let layer = null;
  let busy = false;
  let initted = false;
  let pinCount = 0;

  /* Bookings + user events refresh under our feet from the parent.
     Re-render markers whenever the data changes after init. */
  $: if (initted && map && L) renderMarkers();

  function kindLabel(id) {
    const k = BOOKING_KINDS.find((x) => x.id === id);
    return k ? k.label : 'Plan';
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Format HH:MM 24h to a friendly 12h string for popups. */
  function formatTime(hhmm) {
    if (!hhmm || typeof hhmm !== 'string') return '';
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return hhmm;
    const h = Number(m[1]);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
    return `${h12}:${m[2]} ${period}`;
  }

  /* Custom Leaflet marker = rust circle with a forest dot + a tag
     letter for the kind. SVG inlined so it inherits the brand
     palette without dragging in a marker image asset. */
  function rustIcon(label = '') {
    return L.divIcon({
      className: 'nl-marker',
      iconSize: [32, 40],
      iconAnchor: [16, 38],
      popupAnchor: [0, -34],
      html: `
        <span class="nl-marker-shell" aria-hidden="true">
          <svg viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 0 C7 0 0 7 0 16 c0 9 16 24 16 24 s16 -15 16 -24 c0 -9 -7 -16 -16 -16 Z" fill="#7d3a1e" stroke="#c9a84c" stroke-width="2"/>
            <circle cx="16" cy="16" r="8" fill="#fbf6ea"/>
          </svg>
          <span class="nl-marker-letter">${escapeHtml(label)}</span>
        </span>
      `
    });
  }
  function stationIcon() {
    return L.divIcon({
      className: 'nl-marker nl-marker--station',
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -16],
      html: `
        <span class="nl-marker-shell nl-marker-shell--station" aria-hidden="true">
          <svg viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg">
            <circle cx="19" cy="19" r="17" fill="#0a2d21" stroke="#c9a84c" stroke-width="2"/>
            <path d="M19 9 L21 16 L28 16 L22 20 L24 27 L19 23 L14 27 L16 20 L10 16 L17 16 Z" fill="#c9a84c"/>
          </svg>
        </span>
      `
    });
  }

  async function renderMarkers() {
    if (!map || !L) return;
    /* Wipe the previous layer group and start fresh. Cheap because
       each chapter rarely has more than a handful of pins. */
    if (layer) {
      layer.remove();
      layer = null;
    }
    layer = L.layerGroup().addTo(map);
    pinCount = 0;

    /* Anchor the view on the train station itself. */
    L.marker([stop.lat, stop.lng], { icon: stationIcon() })
      .addTo(layer)
      .bindPopup(`
        <div class="nl-pop">
          <span class="nl-pop-kicker">Train station</span>
          <strong class="nl-pop-title">${escapeHtml(stop.name)}</strong>
        </div>
      `);

    /* Geocode every booking + user event that carries an address.
       Bookings without addresses fall through (their map pin would
       be at the station anyway). */
    busy = true;
    try {
      const bookingHits = await Promise.all(
        (bookings || []).map(async (b) => {
          if (!b.address) return null;
          const loc = await geocode(b.address);
          if (!loc) return null;
          return { kind: 'booking', row: b, loc };
        })
      );
      const eventHits = await Promise.all(
        (userEvents || []).map(async (e) => {
          const query = [e.venue, e.address].filter(Boolean).join(', ');
          if (!query) return null;
          const loc = await geocode(query);
          if (!loc) return null;
          return { kind: 'event', row: e, loc };
        })
      );

      const hits = [...bookingHits, ...eventHits].filter(Boolean);
      pinCount = hits.length;

      for (const hit of hits) {
        const { row, loc, kind } = hit;
        const letter = kind === 'event'
          ? 'E'
          : (kindLabel(row.kind || 'other')[0] || '?');
        const title = kind === 'event' ? row.name : row.title;
        const subtitle = kind === 'event'
          ? `${kindLabel('activity')} - ${row.venue || row.address || ''}`
          : kindLabel(row.kind || 'other');
        const timeStr = kind === 'event'
          ? formatTime(row.startTime)
          : formatTime(row.startTime);
        const addr = kind === 'event' ? (row.address || row.venue || '') : (row.address || '');
        const url = kind === 'event' ? row.url : null;

        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr || `${loc.lat},${loc.lng}`)}`;

        L.marker([loc.lat, loc.lng], { icon: rustIcon(letter) })
          .addTo(layer)
          .bindPopup(`
            <div class="nl-pop">
              <span class="nl-pop-kicker">${escapeHtml(subtitle)}</span>
              <strong class="nl-pop-title">${escapeHtml(title || '')}</strong>
              ${timeStr ? `<span class="nl-pop-time">${escapeHtml(timeStr)}</span>` : ''}
              ${addr ? `<span class="nl-pop-addr">${escapeHtml(addr)}</span>` : ''}
              <div class="nl-pop-actions">
                <a href="${mapUrl}" target="_blank" rel="noopener">Open in Maps &rarr;</a>
                ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Visit site &rarr;</a>` : ''}
              </div>
            </div>
          `);
      }

      /* Auto-fit if we have any pins; otherwise stay zoomed on the
         station. Padding keeps markers off the edges of the map. */
      if (hits.length > 0) {
        const group = L.featureGroup([
          L.marker([stop.lat, stop.lng]),
          ...hits.map((h) => L.marker([h.loc.lat, h.loc.lng]))
        ]);
        map.fitBounds(group.getBounds(), { padding: [24, 24], maxZoom: 15 });
      } else {
        map.setView([stop.lat, stop.lng], 13);
      }
    } finally {
      busy = false;
      dispatch('rendered', { pinCount });
    }
  }

  export async function init() {
    if (initted) {
      /* Already up - just invalidate size in case the container's
         dimensions changed (drawer reopened, viewport resized). */
      await tick();
      if (map) map.invalidateSize();
      return;
    }
    if (!mapEl || !stop) return;
    try {
      L = await loadLeaflet();
      await tick();
      map = L.map(mapEl, {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: true
      }).setView([stop.lat, stop.lng], 13);

      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          subdomains: 'abcd',
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }
      ).addTo(map);

      initted = true;
      await renderMarkers();
    } catch (err) {
      /* Map failed to load - leave the placeholder visible. */
      initted = false;
    }
  }

  onMount(() => {
    /* Caller decides when to init() - usually when the wrapping
       Drawer opens. We just sit waiting. */
  });

  onDestroy(() => {
    if (map) {
      map.remove();
      map = null;
    }
  });
</script>

<div class="stop-map-wrap" class:is-empty={initted && pinCount === 0}>
  <div class="stop-map" bind:this={mapEl} aria-label={`Map of ${stop?.name || ''}`}></div>
  {#if !initted}
    <button type="button" class="stop-map-init" on:click={init}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 21 C7 14 4 11 4 8 a8 8 0 0 1 16 0 c0 3 -3 6 -8 13 Z"/>
        <circle cx="12" cy="8" r="2.5"/>
      </svg>
      <span>Show map of {stop?.name || 'this stop'}</span>
    </button>
  {/if}
  {#if initted && busy}
    <span class="stop-map-busy" aria-hidden="true">Pinning your plans...</span>
  {/if}
  {#if initted && !busy && pinCount === 0}
    <p class="stop-map-empty">
      Pin a booking with an address (or add a user event with a venue)
      and it'll appear on this map.
    </p>
  {/if}
</div>

<style>
  .stop-map-wrap {
    position: relative;
    border: 1.5px solid rgba(125, 58, 30, 0.35);
    border-radius: 6px;
    background: #fbf6ea;
    overflow: hidden;
  }
  .stop-map {
    width: 100%;
    height: 360px;
    background: #f3ece0;
  }
  .stop-map-init {
    position: absolute;
    inset: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: rgba(251, 246, 234, 0.94);
    border: 0;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #7d3a1e;
    cursor: pointer;
    transition: background 160ms ease;
  }
  .stop-map-init:hover {
    background: rgba(251, 246, 234, 1);
    color: #0a2d21;
  }
  .stop-map-busy {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(10, 45, 33, 0.85);
    color: #fbf6ea;
    border-radius: 999px;
    padding: 4px 12px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    pointer-events: none;
    z-index: 600;
  }
  .stop-map-empty {
    margin: 0;
    padding: 12px 14px;
    background: #fbf6ea;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    color: #5a4f3d;
    font-size: 13.5px;
    border-top: 1px dashed rgba(125, 58, 30, 0.3);
  }

  /* Custom marker chrome (the divIcon Leaflet draws). Inline-flex
     so the letter sits centred on the rust pin. */
  :global(.nl-marker .nl-marker-shell) {
    position: relative;
    display: inline-flex;
    align-items: flex-start;
    justify-content: center;
    width: 32px;
    height: 40px;
  }
  :global(.nl-marker .nl-marker-shell--station) {
    width: 38px;
    height: 38px;
  }
  :global(.nl-marker svg) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  :global(.nl-marker .nl-marker-letter) {
    position: relative;
    margin-top: 6px;
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: 14px;
    color: #0a2d21;
    line-height: 1;
    pointer-events: none;
  }

  /* Popup card styling. Leaflet's default popups are white with a
     blue tip; we override colours to read like the rest of the app. */
  :global(.leaflet-popup-content-wrapper) {
    background: #fbf6ea;
    color: #0a2d21;
    border-radius: 4px;
    box-shadow: 0 10px 24px rgba(40, 30, 15, 0.32);
    border: 1.5px solid #c9a84c;
  }
  :global(.leaflet-popup-tip) {
    background: #fbf6ea;
    border: 1px solid #c9a84c;
  }
  :global(.leaflet-popup-content) {
    margin: 14px 16px;
    line-height: 1.45;
    color: #0a2d21;
  }
  :global(.nl-pop) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 200px;
  }
  :global(.nl-pop-kicker) {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #7d3a1e;
  }
  :global(.nl-pop-title) {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 15px;
    color: #0a2d21;
  }
  :global(.nl-pop-time) {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: #c4860f;
    letter-spacing: 0.04em;
  }
  :global(.nl-pop-addr) {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #5a4f3d;
  }
  :global(.nl-pop-actions) {
    display: flex;
    gap: 12px;
    margin-top: 6px;
    padding-top: 8px;
    border-top: 1px dashed rgba(125, 58, 30, 0.3);
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  :global(.nl-pop-actions a) {
    color: #7d3a1e;
    text-decoration: none;
  }
  :global(.nl-pop-actions a:hover) {
    color: #0a2d21;
  }
  /* Zoom controls in the rust + cream palette. */
  :global(.leaflet-bar a),
  :global(.leaflet-bar a:hover) {
    background: #fbf6ea;
    color: #7d3a1e;
    border-bottom-color: rgba(125, 58, 30, 0.25);
  }
  :global(.leaflet-control-attribution) {
    background: rgba(251, 246, 234, 0.84);
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 10px;
  }
  :global(.leaflet-control-attribution a) {
    color: #7d3a1e;
  }
</style>
