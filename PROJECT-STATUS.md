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
- **Cache-Control headers** (in `vercel.json`):
  - `listings-data.js`, `stop-pages-data.js`, `events-data.js`: `max-age=0, must-revalidate` so browsers check for a fresh copy on every visit (Vercel still returns 304 when nothing changed).
  - `app.js`, `stop-page.js`, `stop-explorer.js`, `app-submit-event.js`, `styles.css`, `stop-page.css`: `max-age=300, must-revalidate` so code changes reach visitors within 5 minutes rather than up to a year (Vercel's default).
  - HTML stays on Vercel's default no-cache.
- **Pagination on events grid** (homepage + stop pages): 9 dated cards per page (~3 rows on desktop). Numbered Prev/1 2 3/Next bar collapses to `1 ... 4 5 6 ... 12` when total pages exceeds 7. Recurring events stay pinned outside the page window so they are always visible. Filter changes reset to page 1; page clicks alone do not touch other filters. Clamped recovery snaps a stale page back into range when filters narrow the result set.
- **Multi-month events**: an event spanning Start Date through End Date (e.g. May to September at RBC Amphitheatre) now appears under every month chip the date range covers, not just the start month. `monthKeysForEvent` walks start to end; both filter matching and chip discovery use it. When a month filter is active, multi-month events are grouped under the chosen month so the filtered view reads naturally.
- **Friendlier filter UI** on both homepage (`.hev-filters`) and stop pages (`.sp-evfilters`): two-tier layout with a full-width "When" chip row on top and a flex row below for What / Price / Walk time. Each section has a Phosphor icon next to a conversational label. Bottom row uses `justify-content:space-between` so the three sections sit on equal gaps and Walk time keeps all four chips on one line on desktop. Card has 10px rounded corners + soft shadow. Active chips get a subtle crimson glow. "Clear filters" replaces the plain reset link.
- **Table of contents** on stop pages: sticky horizontal nav between the breadcrumb and the editorial intro listing nine sections (Overview, Getting There, Seasons, Where to Go, What's On, Good to Know, Continue, Pack List, Tips) each with a Phosphor icon. Click smoothly scrolls to the target section with offset for the sticky topbar + TOC bar. `IntersectionObserver` highlights the chip for the section currently in view. On mobile the row scrolls horizontally with momentum and the active chip auto-centres on tap. Backdrop blur so headings can be seen scrolling beneath.
- **Back-to-top button** visible from page load on both home and stop pages (no scroll-gated fade-in). Click uses `window.scrollTo({behavior:'smooth'})` so the scroll works on mobile, where `href="#top"` hash navigation can stall behind a sticky URL bar. The `.toback` back-to-all-stops arrow keeps its scroll-gated fade so it does not crowd the hero on first view.

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
- **Auto-cleanup of stale Airtable rows**: after every events sync (cron, manual, or repository_dispatch), `cleanupStaleEvents()` queries the Events table for rows where `End Date != BLANK AND End Date < today (Toronto) AND NOT Recurring`, then DELETEs them in batches of 10 via the REST endpoint. Runs after the publish step and is wrapped in try/catch so a cleanup failure cannot mask a successful sync. Recurring events are excluded (they keep recurring past their listed End Date). Both approved and unapproved stale rows are deleted so community-submitted past events that were never reviewed get cleaned out along with old approved ones.
- **Family-friendly badge** on event cards. New Airtable `Family Friendly` checkbox at `fldZyf84pYPDFUxs3` flows through sync as `ev.familyFriendly`. Homepage (`.hev-family`) and stop-page (`.sp-event-family`) cards render a small pine-green pill with the `ph-users-three` icon and "Family friendly" label, sharing a meta row with the walk-time badge under the description. Row only renders when at least one badge is present; pill uses #3f6e44 on a 10% tint to stay readable without competing with the rust accents used elsewhere.

### Auto-enrichment
- `backend/enrich-listing.js` exports `enrichRecord(recordId, { onlyFillEmpty, forceClaude })`. Uses Google Places (Find Place + Place Details + Distance Matrix) + Claude Haiku 4.5 for Description/Tag/Best For.
- Strict prompt: structured Places data only, no reviews / no editorial summary / no general knowledge / no town or street / no decor / no ambiance / no superlatives / no historical dates / no audience claims / 3+ category-typical attributes for substance / per-row variety.
- Best For enforced in code via `BEST_FOR_ALLOWED_TYPES` whitelist (Day Trip on bookstores etc. is filtered before Claude ever sees the choice list).
- `backend/backfill-listings.js` with flags `--dry-run`, `--limit N`, `--needs-review`, `--force-claude`. Runs server-side via `.github/workflows/backfill-listings.yml` because the Anthropic key only lives in GitHub secrets.
- `api/enrich-listing.js` Vercel function exists and is deployed. Not yet wired to an Airtable automation - currently triggered manually via the Actions tab.
- 610 active listings have been auto-enriched under the strict prompt, then `Needs Review` was bulk-cleared and a full sync published them.

### Image pipeline

- Listing cards prefer the **stable local image paths** baked into `images/listings/*.jpg` over Airtable's signed attachment URLs (`v5.airtableusercontent.com/...`). The Airtable URLs expire roughly every 2 hours; before the fix, every listing card image would silently fail to load for any returning visitor after the URL TTL, leaving cards looking empty. Both `imageBlock` (card grid) and `detailImageBlock` (detail gallery) check `item.image` / `item.images` first, fall through to `item.photos` only as a fallback for very newly-added listings that have not yet been image-cached.
- 604 of 612 listings currently have local image paths. The 8 without will use the SVG illustrated fallback (or a temporary Airtable URL until the next photo build).
- Data files use `?v=N` in script tags (`/listings-data.js?v=3` etc.) for one-shot cache busts. Combined with the `Cache-Control: max-age=0, must-revalidate` headers in `vercel.json`, this gives us both a forced bust on deploy and ongoing freshness without long-cached stale copies.

### Stops + homepage
- 16 stops in canonical order; STOP_ID slug map kept in sync between `backend/sync-from-airtable.js`, `backend/enrich-listing.js`, `site/data.js`.
- Don't Forget Items section uses Phosphor light icons.

### Plan a Trip page (/plan)
- `/plan` (`site/plan/index.html` + `site/plan-page.css`) is a vintage-railway-poster + travel-magazine landing page for converting NorthlanderGuide.com visitors into Northlander.app users. Twelve chapter-titled sections: cinematic hero with `images/northlander-plan-my-trip.jpeg`, editorial opening with pull-quote and stats sidebar, full-bleed scrolling photo marquee of every stop, scrapbook of three tilted polaroid trip cards (Muskoka Weekend, Lakeside in North Bay, Cochrane in Winter), six-feature grid, two pricing tickets (Carry-On free / First Class $9.99 one-time), why-upgrade scenarios, forest-green inspirational ticker band, three-step "How It Works", full-bleed Use Cases tiles backed by real stop photos, journal-spread app preview, full-bleed testimonial, trust grid, FAQ accordion, full-bleed final CTA. Sticky chapter TOC mirrors the stop-page `.sp-toc` pattern.
- Pricing tickets are typographic only (no illustration art). Both share warm cream paper; Carry-On has a rust vertical "Northlander Pass" stub on the left, First Class has a forest-green stub plus a rust "Best Value" sticker overhanging the top-right corner. Every feature has a one-line italic Fraunces description under the bold Spline feature name. Carry-On's price reads "Free / always" so its header column height matches First Class's "$9.99 / one-time".
- Tasteful motion (all gated behind `prefers-reduced-motion: reduce`): hero stamp, Best Value sticker, and final-CTA stamp sway gently; the chapter-divider train icon bobs; polaroids lift and straighten on hover; feature, use-case, and trust icons each get a small hover transform; step numbers lift; hero CTAs press up.
- `/plan` loads `/data.js` and `/stop-explorer.js` so the topbar "Explore Stops" button opens the explorer modal AND the "More" dropdown works (the dropdown handler lives in `stop-explorer.js`, not in `app.js`). Do not add a second dropdown handler inline; it races with the explorer one and immediately closes the menu after it opens. Back-to-top uses `window.scrollTo({behavior:'smooth'})` because the native `href="#top"` is unreliable behind the sticky topbar.

### Plan a Trip nav pill + stop-page CTA
- "Plan a Trip" topnav pill is in `site/index.html`, `site/stops/index.html`, `site/submit-event/index.html`, plus the mobile menu on each. Styles live in `site/styles.css` selected as `a.topnav-plan` (not `.topnav-plan`) so the rule out-specifies the earlier `.topnav a:hover{color:var(--gold)}` and the text doesn't pick up the gold link-hover. Default border is the dashed logo gold; hover flips the background to rusty brown `poster-crimson` while the text stays ivory.
- Each stop page (`site/stop-page.js`, between the "Continue Your Journey" and "Before You Board" sections) renders a "Plan Your Trip" CTA card pointing at `/plan`. Styles live in `site/styles.css` under `.sp-plan-trip-cta`.

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
- New listings added in Airtable since the last static photo build will fall back to Airtable URLs in `item.photos` until `backend/build-static.js` is re-run. Those fallback URLs expire after ~2 hours, so brand-new listings can briefly look image-less to returning visitors. Re-running the photo build resolves it; consider wiring it into the listings sync workflow once we trust the script not to thrash.
