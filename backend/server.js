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
