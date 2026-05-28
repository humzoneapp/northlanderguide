/* ==================================================================
   THE NORTHLANDER WAYFINDER · DAILY AUTO-UPDATE JOB
   ------------------------------------------------------------------
   Runs on a schedule (Render cron) to refresh the in-memory cache
   on the backend server with fresh Google Places data for each of
   the 16 stops on the Northlander route.

   Resilience model: Nearby Search is the source of truth. Place
   Details is best-effort enrichment only. The POST always sends
   whatever Nearby Search produced, even if every Details call
   fails.

   How it works:
     PHASE 1: Nearby Search per stop and category, producing basic
       listings (name, tag, desc, rating, hero image, raw photos,
       lat/lng, place_id). One try/catch per category so a single
       failure does not skip neighbouring categories.
     PHASE 2: Iterate every basic listing and best-effort enrich
       with Place Details (extra photos, website, phone, editorial
       summary, today's hours). Any failure is swallowed silently
       so the basic listing survives.
     PHASE 3: POST the combined out object to /update-data on the
       backend server. Cron runs are visible via the per-step
       console.log lines.
   ================================================================== */

require('dotenv').config();

/* Sixteen stops on the Northlander route, in order from south
   (Toronto Union) to north (Cochrane). Keep in sync with the
   STOPS array in site/data.js. */
const STOPS = [
  { id: 'union',        lat: 43.6453, lng: -79.3806 },
  { id: 'langstaff',    lat: 43.84,   lng: -79.428  },
  { id: 'gormley',      lat: 43.946,  lng: -79.365  },
  { id: 'washago',      lat: 44.735,  lng: -79.345  },
  { id: 'gravenhurst',  lat: 44.917,  lng: -79.37   },
  { id: 'bracebridge',  lat: 45.04,   lng: -79.31   },
  { id: 'huntsville',   lat: 45.327,  lng: -79.216  },
  { id: 'southriver',   lat: 45.837,  lng: -79.38   },
  { id: 'temagami',     lat: 47.064,  lng: -79.79   },
  { id: 'northbay',     lat: 46.309,  lng: -79.461  },
  { id: 'temiskaming',  lat: 47.509,  lng: -79.677  },
  { id: 'englehart',    lat: 47.821,  lng: -79.868  },
  { id: 'kirklandlake', lat: 48.147,  lng: -80.037  },
  { id: 'matheson',     lat: 48.534,  lng: -80.464  },
  { id: 'timmins',      lat: 48.4758, lng: -81.3305 },
  { id: 'cochrane',     lat: 49.066,  lng: -81.015  }
];

async function run() {
  const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';

  // Wake up the server
  await fetch(`${serverUrl}/health`).catch(() => {});
  console.log('Server pinged, waiting 3s...');
  await new Promise(r => setTimeout(r, 3000));

  const out = {};

  // PHASE 1: Nearby Search for all stops
  for (const stop of STOPS) {
    out[stop.id] = { restaurants: [], accommodations: [], parks: [], attractions: [], events: [] };

    const categories = [
      { key: 'restaurants',    type: 'restaurant' },
      { key: 'accommodations', type: 'lodging' },
      { key: 'parks',          type: 'park' },
      { key: 'attractions',    type: 'tourist_attraction' }
    ];

    for (const cat of categories) {
      try {
        const limit = stop.id === 'union' ? 20 : 8;
        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${stop.lat},${stop.lng}&radius=5000&type=${cat.type}&key=${process.env.GOOGLE_PLACES_KEY}`;
        const r = await fetch(url);
        const d = await r.json();

        console.log(`${stop.id} ${cat.key}: ${(d.results||[]).length} results, status: ${d.status}`);

        const listings = (d.results || []).slice(0, limit).map(p => ({
          name: p.name,
          tag: cat.key,
          desc: p.vicinity || '',
          rating: p.rating ? String(p.rating) : 'NR',
          image: (p.photos && p.photos[0]) ? '/api/photo?ref=' + encodeURIComponent(p.photos[0].photo_reference) : null,
          images: (p.photos || []).slice(0, 10).map(ph => '/api/photo?ref=' + encodeURIComponent(ph.photo_reference)),
          lat: p.geometry && p.geometry.location ? p.geometry.location.lat : null,
          lng: p.geometry && p.geometry.location ? p.geometry.location.lng : null,
          place_id: p.place_id || null,
          website: null,
          phone: null,
          description: null,
          hours: null
        }));

        out[stop.id][cat.key] = listings;
      } catch(e) {
        console.log(`${stop.id} ${cat.key} FAILED:`, e.message);
      }
    }
  }

  console.log('Phase 1 complete. Stop count:', Object.keys(out).length);

  // PHASE 2: Enhance with Place Details (optional, non-blocking)
  for (const stopId of Object.keys(out)) {
    for (const cat of ['restaurants', 'accommodations', 'parks', 'attractions']) {
      for (const listing of out[stopId][cat]) {
        if (!listing.place_id) continue;
        try {
          await new Promise(r => setTimeout(r, 100));
          const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${listing.place_id}&fields=photos,website,formatted_phone_number,editorial_summary,opening_hours&key=${process.env.GOOGLE_PLACES_KEY}`;
          const r = await fetch(url);
          const d = await r.json();

          if (d.status === 'OK' && d.result) {
            const det = d.result;
            if (det.photos && det.photos.length > 1) {
              listing.images = det.photos.slice(0, 10).map(ph => '/api/photo?ref=' + encodeURIComponent(ph.photo_reference));
              listing.image = listing.images[0];
            }
            listing.website = det.website || null;
            listing.phone = det.formatted_phone_number || null;
            listing.description = det.editorial_summary ? det.editorial_summary.overview : null;
            listing.hours = det.opening_hours && det.opening_hours.weekday_text ? det.opening_hours.weekday_text[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] : null;
          }
        } catch(e) {
          // Details failed, keep basic data
        }
      }
    }
  }

  console.log('Phase 2 complete.');

  // PHASE 3: POST to server
  try {
    const response = await fetch(`${serverUrl}/update-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(out)
    });
    const result = await response.json();
    console.log('Data sent to server:', result);
  } catch(e) {
    console.log('POST to server failed:', e.message);
  }
}

run().catch(e => console.error('Run failed:', e));
