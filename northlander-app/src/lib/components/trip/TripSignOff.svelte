<script>
  /* ==================================================================
     Sign-off band.

     Forest gradient block that closes the trip page with a small
     italic "Bon voyage." line + a single "Save as PDF" link. Carries
     the id="trip-foot" anchor that the TOC chip scrolls to. Same
     reveal-on-scroll treatment as the rest of the page: the parent
     IntersectionObserver adds .is-pre-reveal + .is-revealed to the
     .foot element, so the animation styles below use :global() to
     match through Svelte's scoping.

     Lifted out of trip-page/+page.svelte on 2026-06-09.
     ================================================================== */

  /** Trip id - used to build the print link target. */
  export let tripId;
</script>

<section id="trip-foot" class="foot">
  <h2>Bon voyage.</h2>
  <p>Open this on your phone the morning you board.</p>
  <div class="foot-actions">
    <a
      href={`/trips/${tripId}/print`}
      target="_blank"
      rel="noopener"
      class="btn-primary foot-print"
    >Save as PDF</a>
  </div>
</section>

<style>
  .foot {
    position: relative;
    background: linear-gradient(180deg, #0e3b2c 0%, #0a2d21 100%);
    color: #f5f0e8;
    padding: 64px 24px;
    text-align: center;
    overflow: hidden;
  }
  .foot h2 {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: clamp(1.8rem, 5vw, 2.6rem);
    color: #c9a84c;
    margin: 0 0 8px;
  }
  .foot p {
    font-family: 'Spline Sans', system-ui, sans-serif;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #cad7cf;
    margin: 0 0 28px;
  }
  .foot-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
  }
  /* Same outline-on-forest treatment as the cover Export-PDF link. */
  .foot-print {
    background: transparent;
    border: 2px solid rgba(201, 168, 76, 0.45);
    color: #c9a84c;
    padding: 0.7rem 1.1rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
  }
  .foot-print:hover {
    background: rgba(201, 168, 76, 0.12);
    border-color: #c9a84c;
    color: #f5f0e8;
  }

  /* Reveal-on-scroll. The parent observer adds .is-pre-reveal /
     .is-revealed via document.querySelectorAll('.foot'), so the
     selectors below need :global() to reach through Svelte scoping. */
  :global(.foot) {
    transition: opacity 700ms cubic-bezier(.2,.7,.3,1), transform 700ms cubic-bezier(.2,.7,.3,1);
  }
  :global(.foot.is-pre-reveal) {
    opacity: 0;
    transform: translateY(28px);
  }
  :global(.foot.is-pre-reveal.is-revealed) {
    opacity: 1;
    transform: translateY(0);
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.foot.is-pre-reveal) {
      opacity: 1;
      transform: none;
      transition: none;
    }
  }
</style>
