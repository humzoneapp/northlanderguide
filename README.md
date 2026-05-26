# The Northlander Wayfinder

An online travel directory for the **Northlander train route** between Toronto
Union Station and Timmins, Ontario — restaurants, parks, attractions and a
local events calendar for every one of the 16 stops.

Mobile-first, warm/rustic Northern Ontario styling, and built to be shareable:
an interactive route map, search, themed per-stop illustrations, and a
"copy link to this stop" feature.

---

## Features

- Interactive route map (Leaflet) with all 16 stops, plus a graceful
  fallback list if the map can't load.
- Search stops by name or region.
- Four categories per stop: **Eat & Drink, Stay, Parks & Nature, Attractions.**
- Tap any listing card to open a **detail view** — full info, a back
  button, and the rest of that category's listings below it.
- Shareable links: every stop and every detail view has its own URL
  (e.g. `#stop=huntsville&cat=accommodations&place=deerhurst-resort`).
- Events calendar per stop.
- Image slots on every town header and every card.

## A note on images

Every town and every card has an image slot. Where a listing has an
`image` value, that photo shows; where it doesn't, the site shows a
tasteful illustrated tile instead — so **there are never broken images.**

To fill in real photos, the two clean options are:

1. **Google Places photos** — automatic. When the live-data integration
   is switched on (see below), photos come through the Places API with
   usage handled. This is the easiest route to a photo-rich site.
2. **Your own / licensed photos** — add an `image:"https://..."` field
   to any listing in `data.js`, or a stop's `image:` for its header.

> Avoid grabbing random images from the web. Many carry licenses that
> legally require visible photographer credit, and using the wrong photo
> for a place looks unprofessional. Use Places photos or images you own.

## Project structure

```
northlander-wayfinder/
├── site/              ← the website. THIS is what deploys to Vercel.
│   ├── index.html
│   ├── styles.css
│   ├── data.js        ← curated content for all 16 stops
│   ├── app.js         ← map, search, stop panels, events
│   └── api.js         ← optional live-data integration
├── backend/           ← optional. Runs the live-data API job. Deploys separately.
│   ├── server.js
│   ├── update.js      ← the daily auto-update job
│   └── package.json
├── vercel.json        ← tells Vercel to deploy the /site folder
├── .gitignore
└── README.md
```

The **site** runs entirely on its own — open `site/index.html` and it works.
The **backend** is only needed if you later want live, auto-refreshing data.

---

## Deploying the site to Vercel

You already have GitHub + Vercel, so this is quick.

### 1. Put the project on GitHub
In Terminal:
```
cd path/to/northlander-wayfinder
git init
git add .
git commit -m "Northlander Wayfinder directory"
```
Create a new empty repo on github.com, then run the two lines it gives you:
```
git remote add origin https://github.com/YOUR-USERNAME/northlander-wayfinder.git
git push -u origin main
```

### 2. Deploy on Vercel
Vercel dashboard → **Add New → Project** → import the repo → **Deploy**.
`vercel.json` already tells Vercel to publish the `/site` folder and ignore
the backend. You get a live URL in ~30 seconds.

### 3. Updating the live site
Any change you push to GitHub redeploys automatically:
```
git add .
git commit -m "describe your change"
git push
```
Vercel rebuilds within seconds.

---

## Working on it with Claude Code

```
cd path/to/northlander-wayfinder
claude
```
Ask it to make changes ("add restaurants to Huntsville", "tweak the colours")
and it edits the files directly. To preview locally:
```
cd site
python3 -m http.server 8000
```
then open http://localhost:8000 (the interactive map needs a server like this —
opening the file directly shows the route-list fallback instead).

---

## Optional: live, auto-updating data

The site ships with curated content. To make listings/events refresh
automatically:

1. **Get API keys**
   - Google Places: https://console.cloud.google.com (enable "Places API")
   - Eventbrite: https://www.eventbrite.com/platform/api

2. **Install the backend**
   ```
   cd backend
   npm install
   ```

3. **Add keys** — create `backend/.env` (already git-ignored, never committed):
   ```
   GOOGLE_PLACES_KEY=your_key_here
   EVENTBRITE_TOKEN=your_token_here
   ```

4. **Run / schedule** — `node update.js` rebuilds `site/live-data.json`.
   Schedule it daily with cron, or with Vercel's Cron Jobs feature.
   Then add the front-end snippet noted at the bottom of `update.js`.

> Note: the backend needs a Node host (Render, Railway, a VPS). Vercel's static
> deployment of `/site` does not run it. The static site works fine without it.

---

## Adding Google Ads

1. Apply at https://adsense.google.com and get the site approved.
2. Paste the AdSense script tag into the marked `<head>` comment in
   `site/index.html`.
3. Replace each `<div class="adslot" data-ad>` with your AdSense ad unit code.

---

## The 16 stops

Toronto Union · Langstaff · Gormley · Washago · Gravenhurst · Bracebridge ·
Huntsville · South River · Temagami · North Bay · Temiskaming Shores ·
Englehart · Kirkland Lake (Swastika) · Matheson · Timmins-Porcupine ·
Cochrane (connection)

---

## Notes

- The Northlander has not yet resumed service (launch expected later in 2026);
  schedule details follow Ontario Northland's proposed timetable.
- Curated listings are real places but should be verified before launch.
- Independent directory — not affiliated with Ontario Northland.
