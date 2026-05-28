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
   fall back gracefully (the listing is still produced from the
   Nearby Search row alone). */
async function getPlaceDetails(placeId){
  if(!placeId) return null;
  try{
    const url = `https://maps.googleapis.com/maps/api/place/details/json`
      + `?place_id=${encodeURIComponent(placeId)}`
      + `&fields=photos,website,formatted_phone_number,editorial_summary,opening_hours`
      + `&key=${GOOGLE_KEY}`;
    const r = await fetch(url);
    if(!r.ok){
      console.warn('  [Details HTTP error] place_id=' + placeId
        + ' status=' + r.status + ' ' + r.statusText);
      return null;
    }
    const d = await r.json();
    /* Google returns status=OK on success. ZERO_RESULTS is also
       benign for a Details call (place exists but no fields).
       Anything else is a real error worth surfacing. */
    if(d.status && d.status !== 'OK' && d.status !== 'ZERO_RESULTS'){
      console.warn('  [Details API error] place_id=' + placeId
        + ' status=' + d.status
        + ' error_message=' + (d.error_message || '(none)'));
      return null;
    }
    return d.result || null;
  }catch(err){
    console.warn('  [Details fetch threw] place_id=' + placeId
      + ' error=' + (err && err.stack ? err.stack : String(err)));
    return null;
  }
}

/* Reverse-map Google place types back to the category names the
   front end uses, so log lines read "union restaurants: 8 results"
   instead of "union restaurant: 8 results". */
const TYPE_LABELS = {
  restaurant: 'restaurants',
  lodging: 'accommodations',
  park: 'parks',
  tourist_attraction: 'attractions'
};

async function getPlaces(lat, lng, type, stopId){
  /* Union Station is the busy southern terminus, so we surface
     more options for it (20 results per category) than the other
     15 stops (8 each). */
  const limit = stopId === 'union' ? 20 : 8;
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`
    + `?location=${lat},${lng}&radius=8000&type=${type}&key=${GOOGLE_KEY}`;
  const r = await fetch(url);
  const d = await r.json();
  /* Surface Google API errors at the Nearby Search level so we
     do not silently produce an empty stop when the key is bad,
     the quota is exhausted, etc. */
  if(d.status && d.status !== 'OK' && d.status !== 'ZERO_RESULTS'){
    console.warn('  [Nearby API error] ' + stopId + ' ' + (TYPE_LABELS[type] || type)
      + ' status=' + d.status
      + ' error_message=' + (d.error_message || '(none)'));
  }
  const results = (d.results || []).slice(0, limit);
  console.log('  ' + stopId + ' ' + (TYPE_LABELS[type] || type)
    + ': ' + results.length + ' results from Nearby Search');

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

/* Transportation runs across multiple Google Places types (taxi
   stands, transit stations, car rentals, bus stations), since
   Google does not have a single "transportation" type. We aggregate
   raw Nearby Search results across all four types, dedupe by
   place_id, cap the total (union gets more, like every other
   category), then enrich each kept result with the same Place
   Details lookup the other categories use. */
async function getTransportation(lat, lng, stopId){
  const limit = stopId === 'union' ? 20 : 8;
  const types = ['taxi_stand', 'transit_station', 'car_rental', 'bus_station'];
  const tagFor = {
    taxi_stand: 'Taxi',
    transit_station: 'Transit',
    car_rental: 'Car rental',
    bus_station: 'Bus'
  };

  /* Raw Nearby Search across each type. Tag each result with the
     search type so we can label the listing later. */
  let raw = [];
  for(const t of types){
    try{
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`
        + `?location=${lat},${lng}&radius=8000&type=${t}&key=${GOOGLE_KEY}`;
      const r = await fetch(url);
      const d = await r.json();
      if(d.status && d.status !== 'OK' && d.status !== 'ZERO_RESULTS'){
        console.warn('  [Nearby API error] ' + stopId + ' transportation/' + t
          + ' status=' + d.status
          + ' error_message=' + (d.error_message || '(none)'));
      }
      const typeResults = (d.results || []).map(p => Object.assign({}, p, {_searchType: t}));
      console.log('  ' + stopId + ' transportation/' + t + ': ' + typeResults.length + ' results from Nearby Search');
      raw = raw.concat(typeResults);
    }catch(err){
      console.warn('  [Nearby fetch threw] ' + stopId + ' transportation/' + t
        + ' error=' + (err && err.stack ? err.stack : String(err)));
    }
  }

  /* Dedupe by place_id (a single station often matches both
     transit_station and bus_station). */
  const seen = new Set();
  const unique = [];
  for(const p of raw){
    if(p.place_id && !seen.has(p.place_id)){
      seen.add(p.place_id);
      unique.push(p);
    }
  }
  const trimmed = unique.slice(0, limit);
  console.log('  ' + stopId + ' transportation: ' + trimmed.length + ' deduped results, enriching with Details...');

  /* Enrich each kept result with Place Details (photos, contact,
     hours, summary). Same 100ms gating as getPlaces. */
  const out = [];
  for(const p of trimmed){
    await delay(100);
    const details = await getPlaceDetails(p.place_id);
    const detailsPhotos = (details && details.photos) || [];
    const photos = detailsPhotos.length
      ? detailsPhotos.slice(0, 10)
      : ((p.photos && p.photos[0]) ? [p.photos[0]] : []);
    const wt = (details && details.opening_hours && details.opening_hours.weekday_text)
            || (p.opening_hours && p.opening_hours.weekday_text)
            || null;
    out.push({
      name: p.name,
      tag: tagFor[p._searchType] || 'Transit',
      desc: p.vicinity || 'Local transit option.',
      rating: p.rating ? String(p.rating) : 'NR',
      image: photos[0] ? '/api/photo?ref=' + encodeURIComponent(photos[0].photo_reference) : null,
      images: photos.map(photo => '/api/photo?ref=' + encodeURIComponent(photo.photo_reference)),
      lat: p.geometry && p.geometry.location ? p.geometry.location.lat : null,
      lng: p.geometry && p.geometry.location ? p.geometry.location.lng : null,
      hours: wt ? wt[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] : null,
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
  try{
    /* Render's free tier puts the web service to sleep after a few
       minutes of inactivity. Ping /health first so the service is
       warming up while we make the Google Places calls. Three
       seconds is enough for a cold container to be ready to accept
       the data POST at the end of this run; without it, the POST
       sometimes lands before the server is up. */
    const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
    await fetch(`${serverUrl}/health`).catch(() => {});
    console.log('Server pinged, waiting for wake-up...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const out = {};
    for(const [id, c] of Object.entries(STOP_COORDS)){
      console.log('Updating', id, '...');
      out[id] = { restaurants:[], accommodations:[], parks:[], attractions:[], transportation:[], events:[] };
      try{
        out[id].restaurants    = await getPlaces(c.lat, c.lng, PLACE_TYPES.restaurants,    id);
        out[id].accommodations = await getPlaces(c.lat, c.lng, PLACE_TYPES.accommodations, id);
        out[id].parks          = await getPlaces(c.lat, c.lng, PLACE_TYPES.parks,          id);
        out[id].attractions    = await getPlaces(c.lat, c.lng, PLACE_TYPES.attractions,    id);
        out[id].transportation = await getTransportation(c.lat, c.lng,                     id);
        out[id].events         = await getEvents(c.lat, c.lng);
      }catch(err){
        console.warn('  skipped (error):', err && err.stack ? err.stack : String(err));
      }
    }

    /* Total listings collected across all stops, broken down by
       stop. Tells us at a glance whether each stop has data before
       we ship the POST. */
    console.log('Total listings collected:', JSON.stringify(Object.keys(out).map(k => k + ':' + Object.values(out[k]).flat().length)));

    /* POST the freshly-fetched cache to the running server instead
       of writing live-data.json to disk. On Render the filesystem is
       ephemeral, so an in-memory store on the server side is the
       only place the data can live reliably between requests.
       Reuses the serverUrl declared at the top of run() for the
       keep-alive ping. */
    const response = await fetch(`${serverUrl}/update-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(out)
    });
    const result = await response.json();
    console.log('Data sent to server:', result);
  }catch(err){
    console.error('FATAL: update run aborted ->', err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
  }
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
