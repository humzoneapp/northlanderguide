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

### Data pipeline
- Listings synced from Airtable (`tblfVQcLjEv0a4sCJ`) to `site/listings-data.js` and stop-page content to `site/stop-pages-data.js`. Cron at `15 6,18 * * *` UTC.
- Sync filter: `AND({Active}=TRUE(), NOT({Needs Review}))` - unreviewed auto-enriched rows never ship.
- Sync hardening: `fetchWithRetry`, atomic temp-file writes with marker+size validation, hard-abort guard at <100 listings, backup/restore on failure, `timeout-minutes: 10`.
- Instant tip publish path: Airtable approval > Vercel `/api/trigger-tip-sync` > GitHub `repository_dispatch` > `sync-tips.yml` > regex-replaces only the `STOP_TIPS_DATA` block.

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

## In progress (this session)

- Events: Airtable Events table exists at `tblPPmCZ7gBlvNGk2` with Approved checkbox gate. Building `sync-events.js` and stop-page rendering. Homepage events grid and submit-event form to follow.
- Eventbrite integration deprecated. Removing the live fetch path; keeping the source field on Events for future imports.

## Known follow-ups

- Backfill workflow uses `actions/checkout@v4` and `actions/setup-node@v4` which are deprecated for Node 20. Will need Node 24 by 2026-09-16.
- Event submission form not built yet (planned for next session).
- Homepage events panel (`#eventPanel`) still uses the legacy `activeStop.events` shape with no live data source on prod.
