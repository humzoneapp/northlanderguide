<script>
  /* ==================================================================
     Terms of Service.

     Same hero + body styling as the Privacy page for editorial
     consistency. Written in plain language while still covering
     the things a TOS normally covers: scope, acceptable use,
     intellectual property, disclaimers, liability cap, governing
     law (Ontario), and a forward-looking section for the paid tier
     so we don't have to rewrite this when accounts ship.
     ================================================================== */
</script>

<svelte:head>
  <title>Terms - Northlander.app</title>
  <meta name="description" content="The plain-English terms of using Northlander.app, including the free tier today and the paid plan that's coming." />
</svelte:head>

<header class="legal-hero">
  <div class="legal-hero-inner">
    <div class="kicker kicker-light">Terms of Service</div>
    <h1>The plain-English<br />terms for using Northlander.app.</h1>
    <p class="legal-eyebrow">Effective 9 June 2026 &middot; Last reviewed 9 June 2026</p>
  </div>
</header>

<main class="legal">
  <article class="legal-inner">
    <p class="legal-lede">
      By using Northlander.app you agree to these terms. They're
      meant to be readable. If anything's unclear, write to us at
      <a href="mailto:hello@northlanderguide.com">hello@northlanderguide.com</a>.
    </p>

    <section>
      <h2>1. What this app is</h2>
      <p>Northlander.app is a free, browser-based trip planner for the Ontario Northland Northlander train route between Toronto Union and Cochrane. It is independent of Ontario Northland and is not affiliated with, endorsed by, or operated by them.</p>
      <p>The companion site NorthlanderGuide.com provides editorial content (stop descriptions, restaurants, attractions, events) that this app pulls in as suggestions. NorthlanderGuide.com is operated by the same independent travellers behind this app.</p>
    </section>

    <section>
      <h2>2. The free plan (today)</h2>
      <p>Right now, every feature in the app is free. There is no account, no payment, and no advertising. Your trip data lives only on your device.</p>
    </section>

    <section>
      <h2>3. The paid plan (coming)</h2>
      <p>We'll soon offer an optional paid plan with email-based accounts so your trips can sync across devices. When that ships:</p>
      <ul>
        <li>The free tier will keep working as today.</li>
        <li>The paid tier will be a recurring subscription billed through a regulated processor (Stripe or similar).</li>
        <li>You'll be able to cancel any time. Cancellation takes effect at the end of your current billing period; we don't refund unused portions of a period.</li>
        <li>Account deletion wipes all of your server-side data within 30 days.</li>
      </ul>
      <p>This section will be updated with specific pricing and payment terms before billing turns on.</p>
    </section>

    <section>
      <h2>4. Your trip data is yours</h2>
      <p>You retain ownership of everything you create inside the app: trip names, packing lists, bookings, diary entries, photos, ledger rows. We claim no rights over your content.</p>
      <p>You can export any trip as a <code>.northlander.json</code> file at any time and re-import it on a different device or in a future browser. You can delete any trip at any time.</p>
    </section>

    <section>
      <h2>5. What you agree not to do</h2>
      <ul>
        <li>Don't use the app to harass others, infringe anyone's rights, or violate any law.</li>
        <li>Don't probe, scan, or interfere with the app's infrastructure or third-party services it depends on (OpenStreetMap, Open-Meteo, Carto, etc).</li>
        <li>Don't redistribute or scrape NorthlanderGuide.com's editorial content (restaurant descriptions, hooks, events) for commercial use without our written permission.</li>
        <li>Don't impersonate Ontario Northland Railway, the Northlander brand, or the operators of this app.</li>
      </ul>
    </section>

    <section>
      <h2>6. Train times and trip information</h2>
      <p>The schedule, station names, and route information are reproduced from the public Proposed Service Schedule on <a href="https://www.ontarionorthland.ca/en/northlander" target="_blank" rel="noopener">ontarionorthland.ca</a>. Times can change without notice. <strong>Always confirm with Ontario Northland Railway before boarding.</strong> We are not responsible for missed trains, schedule changes, service disruptions, or any consequence of relying on the times shown in the app.</p>
    </section>

    <section>
      <h2>7. Third-party content</h2>
      <p>Listings, events, and suggestions pulled from NorthlanderGuide.com or other third-party sources are provided for convenience. We do not verify hours, prices, availability, or accuracy. Confirm directly with each venue before relying on the information.</p>
      <p>External links open in a new tab; we have no control over the content or practices of linked sites.</p>
    </section>

    <section>
      <h2>8. No warranty</h2>
      <p>The app is provided "as is" and "as available", without warranty of any kind, express or implied. To the maximum extent permitted by law, we disclaim all warranties of merchantability, fitness for a particular purpose, and non-infringement.</p>
    </section>

    <section>
      <h2>9. Limitation of liability</h2>
      <p>To the maximum extent permitted by law, we are not liable for any indirect, incidental, consequential, special, or punitive damages, or any loss of profits, revenue, data, or opportunity, arising from your use of the app &mdash; even if we were advised of the possibility of such damages. Our total liability to you for any claim arising from the app will not exceed the amount you paid us in the previous 12 months (which, on the free plan, is zero).</p>
    </section>

    <section>
      <h2>10. Changes to the service or these terms</h2>
      <p>We may update the app, add or remove features, or change these terms at any time. If we make a material change to these terms, we'll surface it inside the app on your next visit and update the "Last reviewed" date at the top of this page.</p>
    </section>

    <section>
      <h2>11. Governing law</h2>
      <p>These terms are governed by the laws of the Province of Ontario, Canada. Any dispute relating to the app or these terms will be brought exclusively in the courts of Ontario.</p>
    </section>

    <section>
      <h2>12. Contact</h2>
      <p>Anything legal-shaped, billing-related (once that exists), or just confusing: <a href="mailto:hello@northlanderguide.com">hello@northlanderguide.com</a>.</p>
    </section>
  </article>
</main>

<style>
  .legal-hero {
    background:
      radial-gradient(ellipse at 70% 0%, rgba(196, 134, 15, 0.2), transparent 55%),
      linear-gradient(180deg, #0a2d21 0%, #163e2e 100%);
    color: #f5f0e8;
    padding: 56px 24px 48px;
  }
  .legal-hero-inner {
    max-width: 920px;
    margin: 0 auto;
  }
  .legal-hero h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 900;
    font-size: clamp(2rem, 5vw, 3rem);
    line-height: 1.05;
    margin: 8px 0 14px;
    letter-spacing: -0.01em;
  }
  .legal-eyebrow {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #c9a84c;
    margin: 0;
  }
  .legal {
    background: #fbf6ea;
    padding: 40px 24px 80px;
  }
  .legal-inner {
    max-width: 760px;
    margin: 0 auto;
  }
  .legal-lede {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 18px;
    line-height: 1.6;
    color: #0a2d21;
    padding: 18px 0;
    border-top: 1px dashed rgba(125, 58, 30, 0.4);
    border-bottom: 1px dashed rgba(125, 58, 30, 0.4);
    margin: 0 0 24px;
  }
  .legal section {
    margin-top: 32px;
  }
  .legal h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 800;
    font-size: 22px;
    line-height: 1.2;
    color: #0a2d21;
    margin: 0 0 12px;
  }
  .legal p,
  .legal li {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 15.5px;
    line-height: 1.65;
    color: #241f1a;
    margin: 0 0 12px;
  }
  .legal ul {
    margin: 0 0 12px 22px;
    padding: 0;
  }
  .legal li { margin-bottom: 8px; }
  .legal a {
    color: #7d3a1e;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .legal a:hover { color: #0a2d21; }
  .legal em {
    font-style: italic;
    color: #5a4f3d;
  }
  .legal code {
    background: rgba(125, 58, 30, 0.08);
    color: #7d3a1e;
    padding: 1px 6px;
    border-radius: 3px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 13.5px;
  }
  .legal strong { color: #0a2d21; }
</style>
