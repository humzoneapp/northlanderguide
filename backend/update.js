/* ==================================================================
   THE NORTHLANDER WAYFINDER · DAILY AUTO-UPDATE JOB
   ------------------------------------------------------------------
   This is what makes the site "automatic". Run it on a schedule
   (e.g. once a day) and it rebuilds  live-data.json  with fresh
   places and events for every stop. The front-end can then load
   that file instead of hitting the APIs on every visit. Faster,
   cheaper, and it keeps you within free API quotas.

   HOW TO SCHEDULE IT
     - On a VPS / Linux host, add a crontab line:
           0 4 * * *  cd /path/to/backend && node update.js
       (runs every day at 4 a.m.)
     - On Render / Railway, use their "Cron Job" feature.
     - On GitHub Actions, use a scheduled workflow.

   The front-end change to use the cached file is noted at the
   bottom of this file.
   ================================================================== */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const GOOGLE_KEY = process.env.GOOGLE_PLACES_KEY;
const EVENTBRITE_TOKEN = process.env.EVENTBRITE_TOKEN;

/* Same coordinates as api.js. Keep these two lists in sync. */
const STOP_COORDS = {
  union:{lat:43.6453,lng:-79.3806}, langstaff:{lat:43.84,lng:-79.428},
  gormley:{lat:43.946,lng:-79.365}, washago:{lat:44.735,lng:-79.345},
  gravenhurst:{lat:44.917,lng:-79.37}, bracebridge:{lat:45.04,lng:-79.31},
  huntsville:{lat:45.327,lng:-79.216}, southriver:{lat:45.837,lng:-79.38},
  temagami:{lat:47.064,lng:-79.79}, northbay:{lat:46.309,lng:-79.461},
  temiskaming:{lat:47.509,lng:-79.677}, englehart:{lat:47.821,lng:-79.868},
  kirklandlake:{lat:48.147,lng:-80.037}, matheson:{lat:48.534,lng:-80.464},
  timmins:{lat:48.4758,lng:-81.3305}, cochrane:{lat:49.066,lng:-81.015}
};

const PLACE_TYPES = {
  restaurants:'restaurant', accommodations:'lodging',
  parks:'park', attractions:'tourist_attraction'
};
const TYPE_TAG = {
  restaurant:'Restaurant', lodging:'Stay',
  park:'Park', tourist_attraction:'Attraction'
};

async function getPlaces(lat, lng, type){
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`
    + `?location=${lat},${lng}&radius=8000&type=${type}&key=${GOOGLE_KEY}`;
  const r = await fetch(url);
  const d = await r.json();
  return (d.results || []).slice(0,6).map(p => ({
    name:p.name,
    tag:TYPE_TAG[type] || 'Attraction',
    desc:p.vicinity || 'Local listing.',
    rating:p.rating ? String(p.rating) : 'NR',
    image:(p.photos && p.photos[0])
      ? `/api/photo?ref=${encodeURIComponent(p.photos[0].photo_reference)}`
      : null
  }));
}

async function getEvents(lat, lng){
  const url = `https://www.eventbriteapi.com/v3/events/search/`
    + `?location.latitude=${lat}&location.longitude=${lng}`
    + `&location.within=25km&expand=venue&sort_by=date`;
  const r = await fetch(url, { headers:{ Authorization:`Bearer ${EVENTBRITE_TOKEN}` }});
  const d = await r.json();
  return (d.events || []).slice(0,8).map(e => {
    const s = new Date(e.start.local);
    return {
      d:String(s.getDate()).padStart(2,'0'),
      m:s.toLocaleString('en',{month:'short'}),
      name:e.name.text,
      where:e.venue ? e.venue.name : 'See event page',
      desc:(e.summary || '').slice(0,120)
    };
  });
}

async function run(){
  const out = {};
  for(const [id, c] of Object.entries(STOP_COORDS)){
    console.log('Updating', id, '...');
    out[id] = { restaurants:[], accommodations:[], parks:[], attractions:[], events:[] };
    try{
      out[id].restaurants    = await getPlaces(c.lat, c.lng, PLACE_TYPES.restaurants);
      out[id].accommodations = await getPlaces(c.lat, c.lng, PLACE_TYPES.accommodations);
      out[id].parks          = await getPlaces(c.lat, c.lng, PLACE_TYPES.parks);
      out[id].attractions    = await getPlaces(c.lat, c.lng, PLACE_TYPES.attractions);
      out[id].events         = await getEvents(c.lat, c.lng);
    }catch(err){
      console.warn('  skipped (error):', String(err));
    }
  }
  /* POST the freshly-fetched cache to the running server instead
     of writing live-data.json to disk. On Render the filesystem is
     ephemeral, so an in-memory store on the server side is the
     only place the data can live reliably between requests.
     SERVER_URL points to the deployed backend; defaults to local
     so the same script works in development. */
  const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
  const response = await fetch(`${serverUrl}/update-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(out)
  });
  const result = await response.json();
  console.log('Data sent to server:', result);
}

run();

/* ------------------------------------------------------------------
   To make the front-end use this cached file, add this to app.js
   at the end of the init section:

     fetch('live-data.json')
       .then(r => r.json())
       .then(cache => {
         STOPS.forEach(s => {
           const c = cache.stops[s.id];
           if(!c) return;
           if(c.restaurants?.length) s.restaurants = c.restaurants;
           if(c.parks?.length)       s.parks       = c.parks;
           if(c.attractions?.length) s.attractions = c.attractions;
           if(c.events?.length)      s.events      = c.events;
         });
         renderStop(); renderCalendar();
       })
       .catch(() => {});   // falls back to curated data.js silently
------------------------------------------------------------------- */
