# Northlander Wayfinder - Project Status

Shipped-state notes so future sessions can pick up without re-discovering
what's already wired. Keep this short; details belong in the code.

## Shipped and live on northlanderguide.com

### Frontend
- Hero with painted-train image, headline, kicker, two CTAs ("Browse the Route" + "Explore Stops" - both open the stop-explorer modal)
- 16 stop pages with map (Leaflet), listings grid, fun-facts ticker, getting-here, getting-around
- Listing cards now render Description between name and address
- Sort/filter pills on home and stop pages: Featured / Closest / Top Rated (mutually exclusive) + Local Deals (toggle). Featured pill hidden when no listing in the current category is Featured.
- Local Deals filter also hides non-deal markers on the stop-page Leaflet map.
- Tip submission form with honeypot + dual-confirmation checkboxes.
- Header dropdown and footer organised into three columns: Explore, Get Involved, Resources. Mobile menu carries the same links.

### Data pipeline
- Listings synced from Airtable (`tblfVQcLjEv0a4sCJ`) to `site/listings-data.js` and stop-page content to `site/stop-pages-data.js`. Cron at `15 6,18 * * *` UTC.
- Sync filter: `AND({Active}=TRUE(), NOT({Needs Review}))` - unreviewed auto-enriched rows never ship.
- Sync hardening: `fetchWithRetry`, atomic temp-file writes with marker+size validation, hard-abort guard at <100 listings, backup/restore on failure, `timeout-minutes: 10`.
- Instant tip publish path: Airtable approval > Vercel `/api/trigger-tip-sync` > GitHub `repository_dispatch` > `sync-tips.yml` > regex-replaces only the `STOP_TIPS_DATA` block.

### Events
- Airtable Events table at `tblPPmCZ7gBlvNGk2` is the single source of truth. Schema: Event Name, Stop, Category, Start/End Date, Start/End Time, Venue Name, Address, Description, Image URL (text), Event URL, Ticket URL, Price, Free, Source, Featured, Recurring, Recurrence Pattern, Approved, Submitted By, Submitter Email.
- `backend/sync-events.js` reads Approved=true events, drops stale one-offs (cutoff = Toronto time), keeps recurring regardless, sorts Featured-first then by start date, writes `site/events-data.js` keyed by stop slug.
- `.github/workflows/sync-events.yml` runs at 7:15am and 7:15pm UTC (offset from listings sync by an hour), plus `workflow_dispatch` and `repository_dispatch: event-approved` for future instant publish on Approve.
- Stop pages: "What's On in [stop]" renders a responsive grid of approved events with image, date range + optional time, venue, description (clamped 3 lines), price or Free badge, and a More info link out. Empty state for stops with no events.
- Homepage: route-wide grid grouped by Month YYYY, Featured first within each month, with a separate "Ongoing & Recurring" section. Section heading is "Events Along the Route".
- Community submission has TWO entry points sharing one backend:
  - **Modal** triggered from header link, footer link, mobile menu, hero/stop-page CTA buttons, and the homepage CTA card. Uses native `<dialog>` with backdrop click + escape to close. The modal HTML lives in `site/index.html` so it is only available on the home page.
  - **Dedicated indexable page** at `/submit-event/` (folder route). Static HTML with full form, JSON-LD `WebPage` + `BreadcrumbList` schema, canonical URL, OG tags. Crawlers and no-JS visitors land here.
  - Every `.submit-event-trigger` anchor has `href="/submit-event/"` so the link works without JS. The home-page JS (`initSubmitEventModal`) intercepts the click and opens the modal instead when the dialog is present.
  - Both forms POST the same payload to `/api/submit-event`. Honeypot + dual-confirm checkboxes, server-side validation, every Airtable field except admin-only ones (Approved, Featured, Recurring, Recurrence Pattern). Rows arrive with Approved=false and Source="Community Submission" - admin reviews in Airtable then ticks Approved.
- Stop-page "What's On" section now includes a "Submit an event at [stop]" button that navigates to `/submit-event/`.
- **Image upload** alongside the URL field on both modal and dedicated page. Client-side resize to 1200px JPEG 85%, 8 MB raw file cap, ~4 MB base64 server cap. New `Image Upload` multipleAttachments field at `fldE7jR2Q7jDmFVAH` on the Events table. Sync prefers the uploaded attachment's CDN URL and falls back to `Image URL` when empty, so existing rows with only a URL still work.
- **Walking distance from train station** on each event. New `Walk Mins` number field at `fldRq2ec4LMvKnLE3`. `backend/sync-events.js` reads the cached value, geocodes `"Venue, Address"` against Google Distance Matrix in walking mode from the row's stop coordinates when blank, and PATCHes the result back so subsequent syncs cost zero API calls. Event cards (homepage + stop pages) show "X min walk" badge styled like listing cards. `GOOGLE_PLACES_KEY` wired into the sync-events workflow; optional - cached values still publish if the key is missing.
- **Filter bar** above the events grid on both the homepage (`.hev-filters`) and stop pages (`.sp-evfilters`). Month chips (only months that have events plus a Recurring chip when present), Category dropdown (9 Airtable categories), Price chips (Any / Free / Paid), Walking distance chips (Any / 15 / 30 / 60 min or less), and a Reset link when any filter is active. State is scope-local: `window.eventFilters` on the homepage, closure variable on each stop page render.
- Eventbrite live fetch dropped. The local `backend/server.js` Eventbrite proxy still exists but is unused. Source field kept on Events so future imports can flag origin.

### Auto-enrichment
- `backend/enrich-listing.js` exports `enrichRecord(recordId, { onlyFillEmpty, forceClaude })`. Uses Google Places (Find Place + Place Details + Distance Matrix) + Claude Haiku 4.5 for Description/Tag/Best For.
- Strict prompt: structured Places data only, no reviews / no editorial summary / no general knowledge / no town or street / no decor / no ambiance / no superlatives / no historical dates / no audience claims / 3+ category-typical attributes for substance / per-row variety.
- Best For enforced in code via `BEST_FOR_ALLOWED_TYPES` whitelist (Day Trip on bookstores etc. is filtered before Claude ever sees the choice list).
- `backend/backfill-listings.js` with flags `--dry-run`, `--limit N`, `--needs-review`, `--force-claude`. Runs server-side via `.github/workflows/backfill-listings.yml` because the Anthropic key only lives in GitHub secrets.
- `api/enrich-listing.js` Vercel function exists and is deployed. Not yet wired to an Airtable automation - currently triggered manually via the Actions tab.
- 610 active listings have been auto-enriched under the strict prompt, then `Needs Review` was bulk-cleared and a full sync published them.

### Stops + homepage
- 16 stops in canonical order; STOP_ID slug map kept in sync between `backend/sync-from-airtable.js`, `backend/enrich-listing.js`, `site/data.js`.
- Don't Forget Items section uses Phosphor light icons.

## Env vars and secrets

- Vercel: `WEBHOOK_SECRET`, `GITHUB_PAT`, `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` (used by submit-tip and trigger-tip-sync; enrich-listing function is dormant).
- GitHub Actions: `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `GOOGLE_PLACES_KEY`. Anthropic key lives under secret name `NorthlanderGuide` (the workflow falls back to that name if `ANTHROPIC_API_KEY` is unset).
- Local `backend/.env`: Airtable creds + Google Places. No Anthropic key locally.

## House style (codified in prompts and CLAUDE conduct)

- **No em dashes anywhere** - not in code, prose, commit messages, or AI-generated descriptions.
- No emojis unless explicitly requested.
- Listing descriptions: honest, verifiable, no invention. Concrete factual nouns, no adjectives, no place names, no decor, no ambiance.

## Known follow-ups

- Backfill, sync-listings, sync-events, sync-tips, enrich-listing and backfill-listings workflows all use `actions/checkout@v4` and `actions/setup-node@v4`. Both run on Node 20 which is deprecated for Actions; needs Node 24 by 2026-09-16.
- `api/enrich-listing.js` Vercel function is deployed but dormant. No Airtable automation points at it yet, so new listings are enriched only via manual GitHub workflow dispatch. Wire-up is documented in earlier session notes if/when ready.
- `backend/server.js` Eventbrite proxy is dead code now; safe to delete if we never reintroduce live Eventbrite imports.
- "Submit a Listing" and "Advertise" links (header and footer) currently point at `#` placeholders. Same Airtable-backed pattern as Submit an Event would let us ship these quickly.
- The dedicated `/submit-event/` page is not linked in the XML sitemap (no sitemap exists yet). Should be added when we build one.
