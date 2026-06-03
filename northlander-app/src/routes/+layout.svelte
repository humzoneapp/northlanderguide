<script>
  import '../app.css';
</script>

<div class="topbar flex items-center justify-between gap-4">
  <a href="/" class="topbar-brand no-underline text-ivory">
    Northlander<span>.app</span>
  </a>
  <nav class="flex items-center gap-5">
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
</div>

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
</style>

<main>
  <slot />
</main>

<footer class="mt-20 border-t border-[#d9cfba] bg-ivory-soft py-10 px-6 text-center">
  <p class="font-serif italic text-muted text-sm">
    Built for the Ontario Northland Northlander route. Independent, made by travellers.
  </p>
</footer>
