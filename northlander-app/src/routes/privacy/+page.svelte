<script>
  /* ==================================================================
     Privacy Policy.

     Plain-language summary of what Northlander.app does and does NOT
     collect, plus a forward-looking section that flags what will
     change when the paid tier ships (email accounts + payment).
     Effective date is set inline so future revisions can bump it
     without a database. Last reviewed: 2026-06-09.
     ================================================================== */
</script>

<svelte:head>
  <title>Privacy - Northlander.app</title>
  <meta name="description" content="What Northlander.app stores, what it shares, and what changes when accounts and the paid plan ship." />
</svelte:head>

<header class="legal-hero">
  <div class="legal-hero-inner">
    <div class="kicker kicker-light">Privacy Policy</div>
    <h1>What Northlander remembers,<br />and what it doesn't.</h1>
    <p class="legal-eyebrow">Effective 9 June 2026 &middot; Last reviewed 9 June 2026</p>
  </div>
</header>

<main class="legal">
  <article class="legal-inner">
    <p class="legal-lede">
      Northlander.app is built around the idea that your trip
      belongs to you. Today, the app runs entirely on your device.
      In a future paid plan we'll offer optional accounts to sync
      across devices; this page tells you what changes when we do.
    </p>

    <section>
      <h2>1. What we collect today</h2>
      <p><strong>Nothing on a server.</strong> Every trip, packing list, booking, photo, diary entry, ledger row, user event, and bucket-list item you create lives only inside your browser's local storage (specifically <em>IndexedDB</em>) on the device you used to create it.</p>
      <p>The app does not send your trip data, your photos, your text, or your spending to us or to anyone else. There are no analytics scripts, no advertising trackers, no fingerprinting libraries, no third-party "tag manager".</p>
    </section>

    <section>
      <h2>2. Where your data physically sits</h2>
      <ul>
        <li><strong>IndexedDB (named "northlander")</strong> : holds your trips and every child row (packing, bookings, diary, budget, photos, user events).</li>
        <li><strong>sessionStorage</strong> : short-lived cache for weather forecasts and geocoded addresses so we don't re-fetch them on every page change.</li>
        <li><strong>localStorage</strong> : one or two flags (whether you've dismissed the onboarding overlay, etc).</li>
      </ul>
      <p>You can wipe all of it any time by clearing your browser's site data for <em>northlander.app</em>, or by deleting individual trips through the app's interface.</p>
    </section>

    <section>
      <h2>3. Third-party services the app talks to</h2>
      <p>The app fetches a handful of read-only services so it can show train schedules, maps, weather, and Guide listings. None of these calls carry your trip data:</p>
      <ul>
        <li><strong>NorthlanderGuide.com</strong> : loads listing, event and packing-suggestion data files via cross-origin script tags. We send no information about you.</li>
        <li><strong>Open-Meteo</strong> (open-meteo.com) : fetches the daily weather forecast for each stop on your route by latitude / longitude only. Open-Meteo is a free, no-key weather API; their privacy policy is at <a href="https://open-meteo.com/en/terms" target="_blank" rel="noopener">open-meteo.com/en/terms</a>.</li>
        <li><strong>OpenStreetMap Nominatim</strong> (nominatim.openstreetmap.org) : geocodes booking and event addresses into map coordinates. Sees the address text you submit and your IP address (standard for any web request). Their privacy policy is at <a href="https://wiki.osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noopener">osmfoundation.org/wiki/Privacy_Policy</a>.</li>
        <li><strong>Carto basemaps</strong> : supplies the map tiles you see on each chapter's map. Sees the map tile coordinates and your IP address.</li>
      </ul>
      <p>The QR code on the Share modal is encoded entirely in your browser. Stop hero photos (the share poster's polaroids) come through a same-origin <code>/stop-images/</code> path that's served by the Guide; no third-party image proxy is involved.</p>
      <p>We do not maintain analytics or logs of these calls. The third parties listed above may log standard web-server access information per their own policies.</p>
    </section>

    <section>
      <h2>4. Photos and uploads</h2>
      <p>Photos you upload (to the trip cover or to the per-stop album) are resized in your browser and stored as Blobs inside IndexedDB on your device. They are not uploaded anywhere. If you use the device "Share" sheet to post a polaroid to Instagram / X / etc., that share happens through your operating system : the photo travels directly from your device to the app you picked.</p>
    </section>

    <section>
      <h2>5. Sharing a trip</h2>
      <p>The "Share" button can produce either a vintage-poster PNG drawn on your device, or a shareable URL containing a compressed snapshot of your route, packing list, bookings, diary, budget, and user events. The URL is generated entirely client-side; the data lives in the URL's fragment (the bit after <code>#</code>), which browsers do not send to web servers. Photos do NOT travel in the URL.</p>
      <p>If you copy and send that URL to a friend, anyone with the link can view + import the trip. Don't share it publicly if it contains private information.</p>
    </section>

    <section>
      <h2>6. What changes with the paid plan</h2>
      <p>We'll soon add an optional paid tier with email-based accounts so you can sync your trips across devices. When that ships, this section will be updated. Plain-English plan:</p>
      <ul>
        <li>An account requires an email address and a password (or a passwordless magic link).</li>
        <li>Payment will go through a regulated processor (Stripe or similar). We do not see your card number.</li>
        <li>Account holders' trip data will be encrypted in transit and at rest on our servers.</li>
        <li>You'll be able to delete your account and all server-side data with one click.</li>
        <li>The free tier will keep working without an account.</li>
      </ul>
    </section>

    <section>
      <h2>7. Children</h2>
      <p>Northlander.app is intended for general audiences and does not knowingly collect personal information from anyone, including children under 13. When accounts launch, we won't allow account creation by users under 13 without verified parental consent.</p>
    </section>

    <section>
      <h2>8. Your rights</h2>
      <p>Because all of your data currently sits on your device, you can review, edit and delete it directly inside the app at any time. You can also export a full backup of any trip as a <code>.northlander.json</code> file using the Backup band on the trip page.</p>
      <p>If you're in a jurisdiction with specific data rights (GDPR, CCPA, PIPEDA, etc.) and you'd like a copy or deletion of any data we hold once accounts ship, reach us at the address below.</p>
    </section>

    <section>
      <h2>9. Changes to this policy</h2>
      <p>If we change what we collect or how we use it, we'll update this page and bump the "Last reviewed" date at the top. Material changes will be flagged inside the app the next time you open it.</p>
    </section>

    <section>
      <h2>10. Contact</h2>
      <p>Questions, requests, or anything else: <a href="mailto:hello@northlanderguide.com">hello@northlanderguide.com</a>.</p>
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
