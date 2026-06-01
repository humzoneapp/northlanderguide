<script>
  import '../app.css';
</script>

<div class="topbar flex items-center justify-between">
  <a href="/" class="topbar-brand no-underline text-ivory">
    Northlander<span>.app</span>
  </a>
  <a
    href="https://northlanderguide.com"
    target="_blank"
    rel="noopener"
    class="text-ivory text-[0.8rem] font-semibold tracking-widest uppercase opacity-80 hover:opacity-100"
  >
    The Guide
  </a>
</div>

<main>
  <slot />
</main>

<footer class="mt-20 border-t border-[#d9cfba] bg-ivory-soft py-10 px-6 text-center">
  <p class="font-serif italic text-muted text-sm">
    Built for the Ontario Northland Northlander route. Independent, made by travellers.
  </p>
</footer>
