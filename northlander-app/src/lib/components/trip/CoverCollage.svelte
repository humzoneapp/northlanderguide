<script>
  /* ==================================================================
     Cover polaroid collage.

     Cluster of up to five tilted polaroids - one per stop - that sits
     at the bottom of the cover hero. Collapsed behind a toggle pill
     on mobile so the cover doesn't dominate scroll; always open on
     desktop. Each card carries a gentle ambient sway via CSS keyframes
     (overridden on hover).

     Lifted out of trip-page/+page.svelte on 2026-06-09 as part of the
     cover-breakup pass. Owns its own open/closed state - the parent
     just hands it the photo list.
     ================================================================== */

  /** @type {{ src: string, name: string, tilt: number }[]} */
  export let photos = [];

  /* Default to open everywhere so the polaroid cluster reads as
     part of the cover on phones too - previously the collage hid
     behind a "See route photos" toggle below 720px, which meant the
     mobile cover carried strictly less information than the desktop
     one. The toggle pill stays available on mobile (CSS shows it
     below 720px) so the user can still collapse the cluster when
     they want to scroll past it. */
  let open = true;
</script>

{#if photos.length > 0}
  <button
    type="button"
    class="collage-toggle"
    on:click={() => (open = !open)}
    aria-expanded={open}
    aria-controls="cover-collage"
  >
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="14" height="14" rx="2"/>
      <rect x="7" y="8" width="14" height="12" rx="2" fill="#fbf6ea"/>
    </svg>
    <span>{open ? 'Hide route photos' : 'See route photos'}</span>
  </button>
  <div
    id="cover-collage"
    class="collage"
    class:is-open={open}
    aria-hidden="true"
  >
    {#each photos as p, i}
      <figure class="collage-card" style="--rot:{p.tilt}deg;--i:{i}">
        <img src={p.src} alt="" loading="lazy" />
        <figcaption>{p.name}</figcaption>
      </figure>
    {/each}
  </div>
{/if}

<style>
  /* Toggle pill that collapses the collage on mobile. Only visible
     below 720px - desktop users always see the polaroids. */
  .collage-toggle {
    display: none;
    align-items: center;
    gap: 6px;
    margin: 12px auto 0;
    background: transparent;
    border: 1.5px dashed rgba(201, 168, 76, 0.7);
    color: #c9a84c;
    padding: 7px 14px;
    border-radius: 999px;
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease;
  }
  .collage-toggle:hover {
    background: #c9a84c;
    color: #0a2d21;
  }
  @media (max-width: 720px) {
    .collage-toggle { display: inline-flex; }
    .collage:not(.is-open) {
      display: none;
    }
  }

  .collage {
    position: relative;
    min-height: 280px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 14px;
  }
  .collage-card {
    background: #fbf6ea;
    padding: 8px 8px 12px;
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.4);
    margin: 0;
    --base-tilt: var(--rot, 0deg);
    --base-lift: calc(var(--i, 0) * -4px);
    transform: rotate(var(--base-tilt)) translateY(var(--base-lift));
    transition: transform 0.35s cubic-bezier(.2,.7,.3,1);
    /* Gentle ambient sway: each card stagger-floats so the cluster
       reads as something pinned to a board in a passing breeze. */
    animation: cover-card-float 7s ease-in-out infinite;
    animation-delay: calc(var(--i, 0) * -1.6s);
    transform-origin: 50% 100%;
  }
  .collage-card:hover {
    transform: rotate(0deg) translateY(-8px);
    z-index: 4;
    animation: none;
  }
  @keyframes cover-card-float {
    0%   { transform: rotate(var(--base-tilt)) translateY(var(--base-lift)) rotate(0deg); }
    50%  { transform: rotate(var(--base-tilt)) translateY(calc(var(--base-lift) - 6px)) rotate(0.8deg); }
    100% { transform: rotate(var(--base-tilt)) translateY(var(--base-lift)) rotate(0deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .collage-card { animation: none; }
  }
  .collage-card img {
    width: clamp(110px, 16vw, 180px);
    height: clamp(110px, 16vw, 180px);
    object-fit: cover;
    background: #ede0cc;
    display: block;
  }
  .collage-card figcaption {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #0a2d21;
    text-align: center;
    padding-top: 6px;
  }
  /* Compact mobile cluster: smaller cards, tighter gap, no min-height
     so the collage doesn't double the cover's vertical footprint now
     that it ships open by default on phones. */
  @media (max-width: 720px) {
    .collage {
      min-height: 0;
      gap: 10px;
      padding: 4px 0 2px;
    }
    .collage-card {
      padding: 5px 5px 8px;
    }
    .collage-card img {
      width: clamp(82px, 22vw, 110px);
      height: clamp(82px, 22vw, 110px);
    }
    .collage-card figcaption {
      font-size: 11.5px;
      padding-top: 4px;
    }
  }
</style>
