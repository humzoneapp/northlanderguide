<script>
  /* ==================================================================
     /install - Add Northlander to your home screen.

     Static marketing + how-to page with side-by-side iOS / Android
     installation steps. Linked from the Guide and the App's
     navigation. The iOS card is intentionally the left-hand
     position because iOS is the platform most users need explicit
     instructions for (Apple only allows install from Safari and
     hides the option two taps deep in the share sheet).
     ================================================================== */
</script>

<svelte:head>
  <title>Install Northlander - Northlander.app</title>
  <meta
    name="description"
    content="Add Northlander to your iPhone or Android home screen for offline access to your trip, route, packing list and bookings."
  />
</svelte:head>

<header class="install-hero">
  <div class="install-hero-inner">
    <div class="install-icon-frame">
      <img src="/icon-512.png" alt="" width="160" height="160" />
    </div>
    <div class="kicker kicker-light">Take Northlander with you</div>
    <h1>Pin the app to your<br />home screen.</h1>
    <p class="install-lede">
      Two taps on iPhone, two on Android. No app store, no account, works
      on the train when signal drops.
    </p>
  </div>
</header>

<main class="install">
  <section class="install-cards" aria-label="How to install">
    <article class="install-card">
      <div class="install-card-head">
        <div class="install-platform">
          <svg class="install-platform-glyph" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M17.05 12.04c-.03-2.74 2.24-4.05 2.34-4.12-1.27-1.86-3.25-2.12-3.95-2.14-1.68-.17-3.28.99-4.13.99-.86 0-2.18-.97-3.58-.94-1.84.03-3.54 1.07-4.49 2.71-1.91 3.31-.49 8.21 1.37 10.9.9 1.32 1.97 2.8 3.37 2.75 1.36-.06 1.87-.88 3.51-.88 1.63 0 2.1.88 3.54.85 1.46-.02 2.39-1.34 3.28-2.66 1.04-1.53 1.46-3.01 1.48-3.09-.03-.01-2.84-1.09-2.87-4.33Zm-2.7-7.96c.74-.9 1.25-2.15 1.11-3.4-1.07.04-2.38.72-3.15 1.6-.69.78-1.3 2.06-1.14 3.27 1.2.09 2.42-.61 3.18-1.47Z"
            />
          </svg>
          <span>iOS &middot; iPhone</span>
        </div>
        <h2>From Safari</h2>
        <p class="install-card-sub">
          Apple only lets you install from Safari, not Chrome or Firefox.
        </p>
      </div>

      <ol class="install-steps">
        <li>
          <span class="install-step-num">1</span>
          <span class="install-step-body">
            Tap the <strong>Share</strong> button
            <span class="install-step-glyph" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3a1 1 0 0 1 .7.29l4 4-1.41 1.42L13 6.41V15h-2V6.41L8.7 8.71 7.3 7.3l4-4A1 1 0 0 1 12 3Zm-7 9h3v2H6v6h12v-6h-2v-2h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"/></svg>
            </span>
            at the bottom of Safari.
          </span>
        </li>
        <li>
          <span class="install-step-num">2</span>
          <span class="install-step-body">
            Scroll the share sheet and tap
            <strong>Add to Home Screen</strong>.
          </span>
        </li>
        <li>
          <span class="install-step-num">3</span>
          <span class="install-step-body">
            Tap <strong>Add</strong> in the top right to confirm.
          </span>
        </li>
        <li>
          <span class="install-step-num">4</span>
          <span class="install-step-body">
            Open <strong>Northlander</strong> from your home screen like
            any other app.
          </span>
        </li>
      </ol>
    </article>

    <article class="install-card">
      <div class="install-card-head">
        <div class="install-platform">
          <svg class="install-platform-glyph" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M17.6 9.48 19.13 6.85a.5.5 0 0 0-.86-.5l-1.55 2.67a10.6 10.6 0 0 0-9.44 0L5.73 6.35a.5.5 0 0 0-.86.5l1.53 2.63A8.85 8.85 0 0 0 2.4 16h19.2a8.85 8.85 0 0 0-4-6.52ZM7.4 13.6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm9.2 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
            />
          </svg>
          <span>Android</span>
        </div>
        <h2>From Chrome</h2>
        <p class="install-card-sub">
          Edge, Brave and other Chromium browsers work the same way.
        </p>
      </div>

      <ol class="install-steps">
        <li>
          <span class="install-step-num">1</span>
          <span class="install-step-body">
            Tap the
            <span class="install-step-glyph" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>
            </span>
            menu in the top right of Chrome.
          </span>
        </li>
        <li>
          <span class="install-step-num">2</span>
          <span class="install-step-body">
            Tap <strong>Install app</strong> (or
            <strong>Add to Home Screen</strong> on older Chrome).
          </span>
        </li>
        <li>
          <span class="install-step-num">3</span>
          <span class="install-step-body">
            Tap <strong>Install</strong> when Chrome confirms.
          </span>
        </li>
        <li>
          <span class="install-step-num">4</span>
          <span class="install-step-body">
            Open <strong>Northlander</strong> from your home screen.
          </span>
        </li>
      </ol>
    </article>
  </section>

  <section class="install-why" aria-label="Why install">
    <h2>Why pin it</h2>
    <ul class="install-benefits">
      <li>
        <svg class="install-benefit-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/>
        </svg>
        <h3>One-tap launch</h3>
        <p>Skip the browser, open straight to your trip.</p>
      </li>
      <li>
        <svg class="install-benefit-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M3 20 9 9l5 6 2-3 5 8H3Zm15-12a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/>
        </svg>
        <h3>Works offline</h3>
        <p>Route, packing list and bookings cached for the train.</p>
      </li>
      <li>
        <svg class="install-benefit-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z"/>
        </svg>
        <h3>Full screen</h3>
        <p>No browser chrome, all your itinerary, none of the URL bar.</p>
      </li>
      <li>
        <svg class="install-benefit-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 1 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-4Zm0 11h7c-.5 4-3.3 7.4-7 8.7V12H5V6.3l7-3.5V12Z"/>
        </svg>
        <h3>Stays on your phone</h3>
        <p>Your trip data never leaves your device unless you share it.</p>
      </li>
    </ul>
  </section>

  <section class="install-cta">
    <p>
      Already installed? <a href="/">Open Northlander</a> to start a trip,
      or <a href="https://northlanderguide.com">browse the Guide</a>.
    </p>
  </section>
</main>

<style>
  /* ----- Hero ----- */
  .install-hero {
    background: theme('colors.forest');
    color: theme('colors.ivory');
    padding: 4.5rem 1.25rem 5.5rem;
    text-align: center;
    background-image:
      radial-gradient(circle at 30% 25%, rgba(201, 168, 76, 0.10), transparent 55%),
      repeating-linear-gradient(45deg, rgba(245, 240, 232, 0.03) 0, rgba(245, 240, 232, 0.03) 1px, transparent 1px, transparent 9px);
  }
  .install-hero-inner {
    max-width: 720px;
    margin: 0 auto;
  }
  .install-icon-frame {
    width: 160px;
    height: 160px;
    margin: 0 auto 1.75rem;
    border-radius: 38px;
    background: theme('colors.ivory');
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.32), 0 2px 0 rgba(201, 168, 76, 0.20);
    padding: 0;
    overflow: hidden;
    display: grid;
    place-items: center;
  }
  .install-icon-frame img { width: 100%; height: 100%; display: block; }
  .install-hero h1 {
    font-family: theme('fontFamily.serif');
    font-weight: 900;
    font-size: clamp(2.25rem, 5vw, 3.4rem);
    line-height: 1.05;
    margin: 0.65rem 0 1rem;
    color: theme('colors.ivory');
  }
  .install-lede {
    font-family: theme('fontFamily.serif');
    font-style: italic;
    font-size: clamp(1.05rem, 1.6vw, 1.25rem);
    line-height: 1.55;
    color: rgba(245, 240, 232, 0.85);
    max-width: 520px;
    margin: 0 auto;
  }

  /* ----- Main column ----- */
  .install {
    max-width: 1080px;
    margin: 0 auto;
    padding: 3.5rem 1.25rem 1.25rem;
  }

  /* ----- Two install cards ----- */
  .install-cards {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
    margin-bottom: 4rem;
  }
  @media (min-width: 820px) {
    .install-cards { grid-template-columns: 1fr 1fr; gap: 2rem; }
  }
  .install-card {
    background: theme('colors.cream');
    border: 1px solid rgba(125, 58, 30, 0.10);
    border-radius: 18px;
    padding: 2rem 1.75rem 2.25rem;
    box-shadow: 0 10px 28px rgba(80, 50, 20, 0.12);
    position: relative;
    /* Entrance: each card fades and lifts on mount, staggered by
       child position so they read left-to-right. Hover state below
       (desktop only) gives a subtle reward when the cursor lands. */
    opacity: 0;
    transform: translateY(14px);
    animation: install-card-in 0.55s ease-out forwards;
  }
  .install-card:nth-child(2) { animation-delay: 0.12s; }
  @keyframes install-card-in {
    to { opacity: 1; transform: translateY(0); }
  }
  @media (hover: hover) {
    .install-card {
      transition: transform 0.28s ease, box-shadow 0.28s ease;
    }
    .install-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 18px 36px rgba(80, 50, 20, 0.18);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .install-card {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }
  .install-card-head { margin-bottom: 1.5rem; }
  .install-platform {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-family: theme('fontFamily.sans');
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.72rem;
    color: theme('colors.rust');
    margin-bottom: 0.4rem;
  }
  .install-platform-glyph { width: 18px; height: 18px; }
  .install-card h2 {
    font-family: theme('fontFamily.serif');
    font-weight: 900;
    font-size: 1.85rem;
    line-height: 1.1;
    color: theme('colors.forest');
    margin: 0.1rem 0 0.3rem;
  }
  .install-card-sub {
    font-size: 0.95rem;
    color: theme('colors.muted');
    margin: 0;
  }

  /* ----- Numbered steps ----- */
  .install-steps {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .install-steps li {
    display: grid;
    grid-template-columns: 38px 1fr;
    gap: 0.85rem;
    align-items: start;
  }
  .install-step-num {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: theme('colors.forest');
    color: theme('colors.gold');
    font-family: theme('fontFamily.serif');
    font-weight: 900;
    font-size: 1.05rem;
    display: grid;
    place-items: center;
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.10);
  }
  .install-step-body {
    padding-top: 0.25rem;
    color: theme('colors.ink');
    line-height: 1.55;
  }
  .install-step-body strong { color: theme('colors.forest'); font-weight: 600; }
  .install-step-glyph {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    margin: 0 0.1rem;
    border-radius: 5px;
    background: theme('colors.forest');
    color: theme('colors.ivory');
    vertical-align: -0.35rem;
  }
  .install-step-glyph svg { width: 14px; height: 14px; }

  /* ----- Why install ----- */
  .install-why { text-align: center; margin-bottom: 3.5rem; }
  .install-why h2 {
    font-family: theme('fontFamily.serif');
    font-weight: 900;
    font-size: clamp(1.65rem, 3vw, 2.1rem);
    color: theme('colors.forest');
    margin: 0 0 2rem;
  }
  .install-benefits {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  @media (min-width: 640px) {
    .install-benefits { grid-template-columns: 1fr 1fr; gap: 2rem 2.25rem; }
  }
  @media (min-width: 980px) {
    .install-benefits { grid-template-columns: repeat(4, 1fr); }
  }
  .install-benefits li {
    text-align: center;
    padding: 0 0.25rem;
  }
  .install-benefit-icon {
    width: 32px;
    height: 32px;
    color: theme('colors.gold');
    margin-bottom: 0.5rem;
  }
  .install-benefits h3 {
    font-family: theme('fontFamily.serif');
    font-weight: 700;
    font-size: 1.1rem;
    color: theme('colors.forest');
    margin: 0.25rem 0 0.35rem;
  }
  .install-benefits p {
    font-size: 0.95rem;
    color: theme('colors.muted');
    margin: 0;
    line-height: 1.5;
  }

  /* ----- CTA footer ----- */
  .install-cta {
    text-align: center;
    padding: 1rem 1rem 0;
    border-top: 1px solid rgba(125, 58, 30, 0.15);
  }
  .install-cta p { margin: 0; color: theme('colors.muted'); font-size: 0.95rem; }
  .install-cta a {
    color: theme('colors.rust');
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: theme('colors.gold');
  }
  .install-cta a:hover { color: theme('colors.forest'); }
</style>
