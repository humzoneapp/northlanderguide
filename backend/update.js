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

/* Tiny promise-based sleep so we can space out Place Details
   calls. Google Places allows generous QPS but we throttle here to
   stay polite and avoid 429s during the nightly cron run. */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/* Fetch the full Place Details record for one place_id. The
   Nearby Search response is sparse; Place Details returns the
   richer photos array, website, phone number, an editorial summary
   and accurate weekday_text. We request only the fields we use to
   keep the bill down. Returns null on any error so the caller can
   fall back gracefully. */
async function getPlaceDetails(placeId){
  if(!placeId) return null;
  try{
    const url = `https://maps.googleapis.com/maps/api/place/details/json`
      + `?place_id=${encodeURIComponent(placeId)}`
      + `&fields=photos,website,formatted_phone_number,editorial_summary,opening_hours`
      + `&key=${GOOGLE_KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    return d.result || null;
  }catch(err){
    console.warn('  Details lookup failed for', placeId, ':', String(err));
    return null;
  }
}

async function getPlaces(lat, lng, type, stopId){
  /* Union Station is the busy southern terminus, so we surface
     more options for it (20 results per category) than the other
     15 stops (8 each). */
  const limit = stopId === 'union' ? 20 : 8;
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`
    + `?location=${lat},${lng}&radius=8000&type=${type}&key=${GOOGLE_KEY}`;
  const r = await fetch(url);
  const d = await r.json();
  const results = (d.results || []).slice(0, limit);

  /* For each Nearby Search result, do a follow-up Place Details
     call to fetch the full photos array plus website / phone /
     editorial summary / weekday_text. 100ms pause between calls
     keeps the rate well under quota. Falls back to the single
     Nearby photo (and to Nearby's own opening_hours if any) when
     Details fails or returns nothing. */
  const out = [];
  for(const p of results){
    await delay(100);
    const details = await getPlaceDetails(p.place_id);
    const detailsPhotos = (details && details.photos) || [];
    let photos;
    if(detailsPhotos.length){
      photos = detailsPhotos.slice(0, 10);
    } else {
      photos = (p.photos && p.photos[0]) ? [p.photos[0]] : [];
    }
    /* Prefer Details' weekday_text (it is always present when the
       place publishes hours). Fall back to Nearby Search if Details
       did not include opening_hours. */
    const wt = (details && details.opening_hours && details.opening_hours.weekday_text)
            || (p.opening_hours && p.opening_hours.weekday_text)
            || null;
    out.push({
      name: p.name,
      tag: TYPE_TAG[type] || 'Attraction',
      desc: p.vicinity || 'Local listing.',
      rating: p.rating ? String(p.rating) : 'NR',
      /* `image` is the single hero photo (back-compat for the card
         thumbnail). `images` is the full gallery for the detail
         view swipeable gallery. Both come from the Place Details
         photo set when available, falling back to the Nearby
         Search single photo otherwise. Up to 10 photos. */
      image: photos[0] ? '/api/photo?ref=' + encodeURIComponent(photos[0].photo_reference) : null,
      images: photos.map(photo => '/api/photo?ref=' + encodeURIComponent(photo.photo_reference)),
      /* Geographic coordinates so the front end can compute an
         approximate walking time from the station via Haversine. */
      lat: p.geometry && p.geometry.location ? p.geometry.location.lat : null,
      lng: p.geometry && p.geometry.location ? p.geometry.location.lng : null,
      /* Today's opening hours from weekday_text. The array is
         Monday-first (index 0 = Monday, index 6 = Sunday) while
         JS Date.getDay() is Sunday-first, so we shift accordingly.
         Captures whatever day the update job runs on, e.g.
         "Monday: 9:00 AM - 5:00 PM". */
      hours: wt ? wt[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] : null,
      /* New fields from Place Details: rich editorial summary and
         direct contact info for the action row on the detail view. */
      website: (details && details.website) || null,
      phone: (details && details.formatted_phone_number) || null,
      description: (details && details.editorial_summary && details.editorial_summary.overview) || null
    });
  }
  return out;
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
      out[id].restaurants    = await getPlaces(c.lat, c.lng, PLACE_TYPES.restaurants,    id);
      out[id].accommodations = await getPlaces(c.lat, c.lng, PLACE_TYPES.accommodations, id);
      out[id].parks          = await getPlaces(c.lat, c.lng, PLACE_TYPES.parks,          id);
      out[id].attractions    = await getPlaces(c.lat, c.lng, PLACE_TYPES.attractions,    id);
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
