/* ==================================================================
   THE NORTHLANDER WAYFINDER · BACKEND
   ------------------------------------------------------------------
   A tiny Node/Express server that:
     - holds your API keys SECRETLY (never sent to the browser)
     - proxies Google Places + Eventbrite requests
     - serves the static site

   SETUP
     1. Install Node.js (v18+).
     2. In this /backend folder run:  npm install
     3. Create a file named  .env  in this folder containing:
            GOOGLE_PLACES_KEY=your_google_key_here
            EVENTBRITE_TOKEN=your_eventbrite_token_here
            SERVER_URL=http://localhost:3000
        On Render, set SERVER_URL to the public backend URL, e.g.
        https://northlander-backend.onrender.com (used by update.js
        to POST the freshly-fetched cache back into the server's
        in-memory store).
        Get keys at:
            Google  -> https://console.cloud.google.com  (enable "Places API")
            Eventbrite -> https://www.eventbrite.com/platform/api
     4. Run:  node server.js
     5. Open  http://localhost:3000

   DEPLOYING (so the site is live + automatic):
     - Any Node host works: Render, Railway, Fly.io, a VPS, etc.
     - Set the same environment variables in the host's dashboard.
     - The cron job in update.js can run daily to refresh content.
   ================================================================== */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_KEY = process.env.GOOGLE_PLACES_KEY;
const EVENTBRITE_TOKEN = process.env.EVENTBRITE_TOKEN;

/* Station coordinates for each stop, in route order. Used by
   /walking-distance to find the origin for the Distance Matrix call.
   Keep in sync with build-static.js and site/data.js. */
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

/* In-memory live data cache. Populated by POST /update-data (called
   by update.js after it fetches fresh content from Google + Eventbrite)
   and read by GET /live-data.json. Held in memory instead of a file
   so it works on platforms with ephemeral filesystems like Render. */
let liveData = null;
let liveDataUpdated = null;

/* CORS: use the cors npm package so the Vercel front end can fetch
   from this Render backend. Applied before every route so static
   files and JSON endpoints all carry the headers, and preflight
   OPTIONS requests are handled automatically. */
app.use(cors());

/* Serve the static site from the sibling /site folder */
app.use(express.static(path.join(__dirname, '..', 'site')));

/* ---- /api/places : proxy to Google Places Nearby Search ---- */
app.get('/api/places', async (req, res) => {
  const { lat, lng, type } = req.query;
  if(!GOOGLE_KEY) return res.status(500).json({error:'Google key not configured'});
  try{
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`
      + `?location=${lat},${lng}&radius=8000&type=${type}&key=${GOOGLE_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  }catch(err){
    res.status(502).json({error:'Places upstream failed', detail:String(err)});
  }
});

/* ---- /api/events : proxy to Eventbrite search ---- */
app.get('/api/events', async (req, res) => {
  const { lat, lng, radius } = req.query;
  if(!EVENTBRITE_TOKEN) return res.status(500).json({error:'Eventbrite token not configured'});
  try{
    const url = `https://www.eventbriteapi.com/v3/events/search/`
      + `?location.latitude=${lat}&location.longitude=${lng}`
      + `&location.within=${radius || '25km'}&expand=venue&sort_by=date`;
    const r = await fetch(url, {
      headers:{ Authorization:`Bearer ${EVENTBRITE_TOKEN}` }
    });
    const data = await r.json();
    res.json(data);
  }catch(err){
    res.status(502).json({error:'Events upstream failed', detail:String(err)});
  }
});

/* ---- /api/photo : proxy a Google Places photo (keeps key hidden) ---- */
app.get('/api/photo', async (req, res) => {
  const { ref } = req.query;
  if(!GOOGLE_KEY) return res.status(500).json({error:'Google key not configured'});
  if(!ref) return res.status(400).json({error:'Missing photo ref'});
  try{
    const url = `https://maps.googleapis.com/maps/api/place/photo`
      + `?maxwidth=800&photo_reference=${encodeURIComponent(ref)}&key=${GOOGLE_KEY}`;
    const r = await fetch(url);                 // Google redirects to the image
    const buf = Buffer.from(await r.arrayBuffer());
    res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  }catch(err){
    res.status(502).json({error:'Photo upstream failed', detail:String(err)});
  }
});

/* ---- /walking-distance : walking time and distance from a stop's
   station to a listing's coordinates, via Google Distance Matrix.
   GET /walking-distance?stopId=union&lat=43.6432&lng=-79.4246
   Returns { walkMins, walkDistance } or nulls on any failure so
   callers (build-static.js, Airtable automation) never break. ---- */
app.get('/walking-distance', async (req, res) => {
  const { stopId, lat, lng } = req.query;
  const stop = STOPS.find(s => s.id === stopId);
  if (!GOOGLE_KEY || !stop || !lat || !lng) {
    return res.json({ walkMins: null, walkDistance: null });
  }
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json`
      + `?origins=${stop.lat},${stop.lng}`
      + `&destinations=${encodeURIComponent(lat + ',' + lng)}`
      + `&mode=walking&key=${GOOGLE_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    const el = data.rows && data.rows[0] && data.rows[0].elements && data.rows[0].elements[0];
    if (!el || el.status !== 'OK' || !el.duration) {
      return res.json({ walkMins: null, walkDistance: null });
    }
    res.json({
      walkMins: Math.round(el.duration.value / 60),
      walkDistance: el.distance ? el.distance.text : null
    });
  } catch (err) {
    res.json({ walkMins: null, walkDistance: null });
  }
});

/* update.js POSTs the freshly-fetched cache here. We parse the JSON
   body inline so we do not have to register the express.json()
   parser globally for routes that do not need it. */
app.post('/update-data', (req, res) => {
  express.json({ limit: '2mb' })(req, res, () => {
    liveData = req.body;
    liveDataUpdated = new Date().toISOString();
    console.log('Live data updated in memory at', liveDataUpdated);
    res.json({ status: 'ok', updated: liveDataUpdated });
  });
});

app.get('/live-data.json', (req, res) => {
  if (!liveData) {
    return res.status(404).json({ error: 'Live data not yet generated. Run the update job first.' });
  }
  res.json({ updated: liveDataUpdated, stops: liveData });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', updated: liveDataUpdated, hasData: liveData !== null });
});

app.listen(PORT, () => {
  console.log(`Northlander Wayfinder running at http://localhost:${PORT}`);
});
