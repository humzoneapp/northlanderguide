/* ==================================================================
   THE NORTHLANDER WAYFINDER — BACKEND
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
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_KEY = process.env.GOOGLE_PLACES_KEY;
const EVENTBRITE_TOKEN = process.env.EVENTBRITE_TOKEN;

/* CORS: allow the Vercel front end (and any other origin) to fetch
   from this Render backend. Runs before every route so static files
   and JSON endpoints all carry the headers. Handles preflight
   OPTIONS short-circuit. */
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

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

app.get('/live-data.json', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const dataFile = path.join(__dirname, '..', 'site', 'live-data.json');
  try {
    const data = fs.readFileSync(dataFile, 'utf8');
    res.header('Content-Type', 'application/json');
    res.send(data);
  } catch(e) {
    res.status(404).json({ error: 'Live data not yet generated' });
  }
});

app.get('/health', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const dataFile = path.join(__dirname, '..', 'site', 'live-data.json');
  let updated = null;
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    updated = data.updated || null;
  } catch(e) {
    updated = null;
  }
  res.json({ status: 'ok', updated });
});

app.listen(PORT, () => {
  console.log(`Northlander Wayfinder running at http://localhost:${PORT}`);
});
