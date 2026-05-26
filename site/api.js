/* ==================================================================
   THE NORTHLANDER WAYFINDER — LIVE DATA INTEGRATION (OPTIONAL)
   ------------------------------------------------------------------
   This file makes the directory AUTO-UPDATING. It is NOT loaded by
   default — the site runs fine on curated data.js content alone.

   To activate live data:
     1. Read the steps in each section below.
     2. Add this line to index.html, AFTER data.js and BEFORE app.js:
            <script src="api.js"></script>
     3. Provide your API keys where marked.

   IMPORTANT — why this is structured this way:
   - Google Places & Eventbrite API keys must NOT be exposed in
     front-end code (anyone could copy and abuse them). The functions
     below are written to call YOUR OWN small backend endpoint, which
     holds the key secretly. A ready-to-deploy backend is in
     /backend/server.js.
   - "Scraping" Google Maps / Yelp / TripAdvisor directly is against
     their terms of service and breaks constantly. The official APIs
     below are the supported, stable, legal way to do this.
   ================================================================== */


/* ------------------------------------------------------------------
   SECTION 1 — RESTAURANTS / PARKS / ATTRACTIONS via Google Places
   ------------------------------------------------------------------
   Each STOP needs a latitude/longitude. Fill these in (look them up
   once on Google Maps). Then this function fetches live places.
------------------------------------------------------------------- */

const STOP_COORDS = {
  union:        {lat:43.6453, lng:-79.3806},
  langstaff:    {lat:43.8400, lng:-79.4280},
  gormley:      {lat:43.9460, lng:-79.3650},
  washago:      {lat:44.7350, lng:-79.3450},
  gravenhurst:  {lat:44.9170, lng:-79.3700},
  bracebridge:  {lat:45.0400, lng:-79.3100},
  huntsville:   {lat:45.3270, lng:-79.2160},
  southriver:   {lat:45.8370, lng:-79.3800},
  temagami:     {lat:47.0640, lng:-79.7900},
  northbay:     {lat:46.3090, lng:-79.4610},
  temiskaming:  {lat:47.5090, lng:-79.6770},
  englehart:    {lat:47.8210, lng:-79.8680},
  kirklandlake: {lat:48.1470, lng:-80.0370},
  matheson:     {lat:48.5340, lng:-80.4640},
  timmins:      {lat:48.4758, lng:-81.3305},
  cochrane:     {lat:49.0660, lng:-81.0150}
};

/* Maps our category keys to Google Places "type" values */
const PLACE_TYPES = {
  restaurants:    'restaurant',
  accommodations: 'lodging',
  parks:          'park',
  attractions:    'tourist_attraction'
};

/* Calls YOUR backend (see /backend/server.js), which holds the
   Google API key secretly and proxies the Places "Nearby Search". */
async function fetchPlaces(stopId, category){
  const coords = STOP_COORDS[stopId];
  if(!coords) return null;
  try{
    const res = await fetch(
      `/api/places?lat=${coords.lat}&lng=${coords.lng}&type=${PLACE_TYPES[category]}`
    );
    if(!res.ok) throw new Error('Places request failed');
    const data = await res.json();
    /* Normalise Google's response into our card format */
    return data.results.slice(0,6).map(p => ({
      name: p.name,
      tag:  category === 'restaurants' ? 'Restaurant'
          : category === 'parks'       ? 'Park'
          : category === 'accommodations' ? 'Stay' : 'Attraction',
      desc: p.vicinity || p.formatted_address || 'Local listing.',
      rating: p.rating ? String(p.rating) : 'NR',
      /* Real photo: Places returns a photo_reference which our backend
         turns into an image URL. Empty -> the site shows its illustrated
         fallback tile, so a card is never broken. */
      image: (p.photos && p.photos[0])
        ? `/api/photo?ref=${encodeURIComponent(p.photos[0].photo_reference)}`
        : null
    }));
  }catch(err){
    console.warn('Live places unavailable, using curated data:', err);
    return null;  /* fall back to data.js content */
  }
}


/* ------------------------------------------------------------------
   SECTION 2 — EVENTS via Eventbrite (or a municipal calendar feed)
   ------------------------------------------------------------------
   Eventbrite's API lets you search events by location + date range.
   Again, the key lives in your backend, not here.
------------------------------------------------------------------- */

async function fetchEvents(stopId){
  const coords = STOP_COORDS[stopId];
  if(!coords) return null;
  try{
    const res = await fetch(
      `/api/events?lat=${coords.lat}&lng=${coords.lng}&radius=25km`
    );
    if(!res.ok) throw new Error('Events request failed');
    const data = await res.json();
    return data.events.slice(0,8).map(e => {
      const start = new Date(e.start.local);
      return {
        d: String(start.getDate()).padStart(2,'0'),
        m: start.toLocaleString('en',{month:'short'}),
        name: e.name.text,
        where: e.venue ? e.venue.name : 'See event page',
        desc: (e.summary || '').slice(0,120)
      };
    });
  }catch(err){
    console.warn('Live events unavailable, using curated data:', err);
    return null;
  }
}


/* ------------------------------------------------------------------
   SECTION 3 — HOOK INTO THE APP
   ------------------------------------------------------------------
   When the user opens a stop, try live data; if it fails, the
   curated data.js content already on screen simply stays.
------------------------------------------------------------------- */

async function refreshStopWithLiveData(stop){
  /* listings */
  for(const cat of ['restaurants','accommodations','parks','attractions']){
    const live = await fetchPlaces(stop.id, cat);
    if(live && live.length) stop[cat] = live;
  }
  /* events */
  const liveEvents = await fetchEvents(stop.id);
  if(liveEvents && liveEvents.length) stop.events = liveEvents;

  /* re-render if this is still the stop on screen */
  if(typeof activeStop !== 'undefined' && activeStop.id === stop.id){
    renderStop();
    renderCalendar();
  }
}

/* Auto-refresh the first stop on load, then others on demand.
   To refresh ALL stops on a schedule, call this from your backend
   cron job and write results to a static JSON file instead. */
if(typeof STOPS !== 'undefined'){
  refreshStopWithLiveData(STOPS[0]);
}
