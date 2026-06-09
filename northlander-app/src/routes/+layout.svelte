<script>
  import '../app.css';
  import Toasts from '$lib/components/Toasts.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  /* Mobile hamburger state. Inline links on desktop; collapsed
     into a hamburger button below 640px that opens a drop-down
     panel under the topbar. */
  let menuOpen = false;
  function toggleMenu() { menuOpen = !menuOpen; }
  function closeMenu() { menuOpen = false; }

  /* Close the menu whenever the route changes so a link tap doesn't
     leave the panel hanging open on the next page. */
  $: $page.url.pathname, (menuOpen = false);

  onMount(() => {
    function onKey(e) {
      if (e.key === 'Escape') closeMenu();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* Floating scroll-to-top button. Appears once the user has
     scrolled past ~600px and clears when they're back near the
     top. Mobile-first - the desktop browser scroll-bar already
     gives the user a one-flick path back. */
  let showScrollTop = false;
  function onScroll() {
    if (typeof window === 'undefined') return;
    showScrollTop = window.scrollY > 600;
  }
  function scrollToTop() {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  onMount(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  });
</script>

<div class="topbar flex items-center justify-between gap-4">
  <a href="/" class="topbar-brand no-underline text-ivory">
    Northlander<span>.app</span>
  </a>

  <!-- Inline link cluster on desktop / tablet. Hidden on mobile in
       favour of the hamburger below. -->
  <nav class="topbar-nav flex items-center gap-5">
    <a
      href="/"
      class="topbar-link inline-flex items-center gap-1.5"
      aria-label="Home"
    >
      <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 11 L12 3 L21 11"/>
        <path d="M5 10 V20 H10 V14 H14 V20 H19 V10"/>
      </svg>
      <span>Home</span>
    </a>
    <a
      href="/bucket"
      class="topbar-link inline-flex items-center gap-1.5"
      aria-label="Bucket list"
    >
      <svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 3 L18 3 L18 21 L12 17 L6 21 Z"/>
      </svg>
      <span>Bucket</span>
    </a>
    <a
      href="https://northlanderguide.com"
      target="_blank"
      rel="noopener"
      class="topbar-link"
    >
      The Guide
    </a>
  </nav>

  <!-- Mobile-only hamburger. Shown via CSS below 640px and hidden
       above. Tap toggles the drop-down panel; Escape / route
       change closes it. -->
  <button
    type="button"
    class="topbar-burger"
    class:is-open={menuOpen}
    on:click={toggleMenu}
    aria-expanded={menuOpen}
    aria-label={menuOpen ? 'Close menu' : 'Open menu'}
    aria-controls="topbar-menu"
  >
    <span class="topbar-burger-bar"></span>
    <span class="topbar-burger-bar"></span>
    <span class="topbar-burger-bar"></span>
  </button>
</div>

<!-- Drop-down panel anchored under the topbar. Only rendered
     while menuOpen is true so it doesn't catch taps when closed. -->
{#if menuOpen}
  <div class="topbar-sheet" id="topbar-menu" role="menu">
    <a href="/" class="topbar-sheet-link" role="menuitem" on:click={closeMenu}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 11 L12 3 L21 11"/>
        <path d="M5 10 V20 H10 V14 H14 V20 H19 V10"/>
      </svg>
      <span>Home</span>
    </a>
    <a href="/bucket" class="topbar-sheet-link" role="menuitem" on:click={closeMenu}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 3 L18 3 L18 21 L12 17 L6 21 Z"/>
      </svg>
      <span>Bucket</span>
    </a>
    <a
      href="https://northlanderguide.com"
      target="_blank"
      rel="noopener"
      class="topbar-sheet-link"
      role="menuitem"
      on:click={closeMenu}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 4 H17 a2 2 0 0 1 2 2 V20 H7 a2 2 0 0 1 -2 -2 Z"/>
        <path d="M5 18 V4"/>
        <path d="M9 8 L15 8 M9 12 L15 12"/>
      </svg>
      <span>The Guide</span>
    </a>
  </div>
{/if}

<main class="page-main">
  <slot />
</main>

<footer class="border-t border-[#d9cfba] bg-ivory-soft py-10 px-6 text-center">
  <p class="font-serif italic text-muted text-sm">
    Built for the Ontario Northland Northlander route. Independent, made by travellers.
  </p>
  <p class="footer-disclaimer">
    Independent &middot; Not affiliated with Ontario Northland Railway. Confirm all train times,
    fares, addresses, and schedules at
    <a href="https://www.ontarionorthland.ca/en/northlander" target="_blank" rel="noopener">ontarionorthland.ca</a>
    before relying on them.
  </p>
  <nav class="footer-legal" aria-label="Legal">
    <a href="/privacy">Privacy</a>
    <span class="footer-legal-sep" aria-hidden="true">&middot;</span>
    <a href="/terms">Terms</a>
    <span class="footer-legal-sep" aria-hidden="true">&middot;</span>
    <a href="https://northlanderguide.com" target="_blank" rel="noopener">The Guide</a>
  </nav>
</footer>

<style>
  .topbar-link {
    color: #f3ece0;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    text-decoration: none;
    opacity: 0.82;
    transition: opacity 0.15s, color 0.15s;
  }
  .topbar-link:hover {
    opacity: 1;
  }

  /* Hamburger button: shown only on mobile via the media query
     below. Three stacked rust-tinted bars; animates into an X on
     open. */
  .topbar-burger {
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 5px;
    width: 36px;
    height: 36px;
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .topbar-burger-bar {
    width: 20px;
    height: 2px;
    background: #f3ece0;
    border-radius: 1px;
    transition: transform 200ms cubic-bezier(.2,.7,.3,1), opacity 160ms ease;
    transform-origin: center;
  }
  .topbar-burger.is-open .topbar-burger-bar:nth-child(1) {
    transform: translateY(7px) rotate(45deg);
  }
  .topbar-burger.is-open .topbar-burger-bar:nth-child(2) {
    opacity: 0;
  }
  .topbar-burger.is-open .topbar-burger-bar:nth-child(3) {
    transform: translateY(-7px) rotate(-45deg);
  }

  /* Drop-down sheet anchored just under the topbar. Forest band
     with rust-bordered links so it reads as a vertical mirror of
     the desktop nav. */
  .topbar-sheet {
    position: sticky;
    top: 52px;
    z-index: 90;
    background: #0a2d21;
    border-bottom: 1px solid rgba(125, 58, 30, 0.45);
    padding: 6px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.32);
  }
  .topbar-sheet-link {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    color: #f3ece0;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 13.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    text-decoration: none;
    border-radius: 4px;
    transition: background 160ms ease;
  }
  .topbar-sheet-link:hover {
    background: rgba(201, 168, 76, 0.12);
  }
  .topbar-sheet-link svg {
    color: #c9a84c;
    flex: 0 0 auto;
  }

  /* Mobile: hide the inline nav, show the burger. */
  @media (max-width: 640px) {
    .topbar-nav { display: none; }
    .topbar-burger { display: inline-flex; }
  }

  /* Tiny legal-link row under the footer tagline. Same italic
     vocabulary; quiet rust links so they don't compete with the
     editorial tagline above. */
  .footer-legal {
    margin-top: 12px;
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 10px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .footer-legal a {
    color: #7d3a1e;
    text-decoration: none;
    transition: color 140ms ease;
  }
  .footer-legal a:hover { color: #0a2d21; }
  .footer-legal-sep { color: rgba(125, 58, 30, 0.4); }

  /* Permanent independence disclaimer below the tagline. Sits on
     every page so users on the trip page or share preview always
     see the "we are not the railway, verify with them" line. */
  .footer-disclaimer {
    margin-top: 14px;
    max-width: 640px;
    margin-left: auto;
    margin-right: auto;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 12.5px;
    line-height: 1.55;
    color: #5a4f3d;
  }
  .footer-disclaimer a {
    color: #7d3a1e;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .footer-disclaimer a:hover { color: #0a2d21; }

  /* Floating scroll-to-top button. Anchored bottom-right with
     safe-area insets so iOS Safari's home indicator doesn't
     overlap. Rust filled, gold ring for the boarding-pass
     vocabulary. Fades in / out via Svelte's mount cycle. */
  .scroll-top {
    position: fixed;
    right: calc(env(safe-area-inset-right, 0) + 18px);
    bottom: calc(env(safe-area-inset-bottom, 0) + 22px);
    z-index: 240;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: #7d3a1e;
    border: 2px solid #c9a84c;
    color: #fbf6ea;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 10px 24px rgba(40, 30, 15, 0.32);
    transition: transform 160ms cubic-bezier(.2,.7,.3,1), background 160ms ease;
    animation: scroll-top-in 220ms cubic-bezier(.2,.7,.3,1) both;
  }
  .scroll-top:hover {
    background: #0a2d21;
    transform: translateY(-2px);
  }
  .scroll-top:active {
    transform: translateY(0);
  }
  @keyframes scroll-top-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .scroll-top { animation: none; transition: background 160ms ease; }
    .scroll-top:hover { transform: none; }
  }

  /* Sticky-footer pattern: page is a flex column at least the full
     viewport height. Main grows to fill remaining space so a short
     page (e.g. the empty-trip onboarding) doesn't leave a stretch
     of body-coloured wash below the footer. */
  :global(html), :global(body) {
    min-height: 100%;
  }
  :global(body) {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
  }
  .page-main {
    flex: 1 0 auto;
  }
</style>

<!-- Floating scroll-to-top button. Visible on every page once the
     user has scrolled far enough that "scroll back manually" feels
     long. -->
{#if showScrollTop}
  <button
    type="button"
    class="scroll-top"
    on:click={scrollToTop}
    aria-label="Scroll back to the top"
    title="Back to top"
  >
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 14 12 8 18 14"/>
    </svg>
  </button>
{/if}

<!-- Mounted once at the root so every page can pushToast() without
     needing its own toast container. -->
<Toasts />
