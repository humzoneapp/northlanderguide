<script>
  /* Inline SVG suitcase used as the trip card "icon".
     Color tokens are CSS custom properties so each trip can carry
     its own leather color without re-rendering the SVG. */

  /** @type {string} */
  export let color = '#7d3a1e';   // body leather
  /** @type {string} */
  export let strap = '#5e2a14';   // strap and trim
  /** @type {string} */
  export let label = '';          // text inside the luggage tag

  /** @type {string} */
  let title = label ? `Suitcase tagged ${label}` : 'A vintage suitcase';
</script>

<svg
  viewBox="0 0 200 160"
  xmlns="http://www.w3.org/2000/svg"
  class="block w-full h-auto"
  role="img"
  aria-label={title}
>
  <!-- shadow -->
  <ellipse cx="100" cy="146" rx="62" ry="6" fill="rgba(40,20,5,0.22)" />

  <!-- handle -->
  <rect
    x="86" y="14" width="28" height="14" rx="3"
    fill="none" stroke={strap} stroke-width="3"
  />

  <!-- body -->
  <rect
    x="22" y="30" width="156" height="108" rx="10"
    fill={color}
  />
  <!-- top highlight -->
  <rect x="22" y="30" width="156" height="14" rx="10" fill="rgba(255,255,255,0.08)" />
  <!-- bottom shadow band -->
  <rect x="22" y="124" width="156" height="14" rx="10" fill="rgba(0,0,0,0.18)" />

  <!-- center strap -->
  <rect x="22" y="76" width="156" height="14" fill={strap} />
  <!-- buckle -->
  <rect x="92" y="74" width="16" height="18" rx="2" fill="#d6c2a0" stroke={strap} stroke-width="1.5" />
  <rect x="96" y="79" width="8" height="8" fill={strap} />

  <!-- corner clasps -->
  <rect x="34" y="56" width="10" height="14" rx="1.5" fill="#d6c2a0" stroke={strap} stroke-width="1" />
  <rect x="156" y="56" width="10" height="14" rx="1.5" fill="#d6c2a0" stroke={strap} stroke-width="1" />

  <!-- luggage tag string -->
  <line x1="100" y1="28" x2="142" y2="48" stroke={strap} stroke-width="1.5" stroke-dasharray="3 2" />

  <!-- luggage tag -->
  <g transform="rotate(8 142 56)">
    <rect x="120" y="44" width="44" height="22" rx="3" fill="#e8d6a8" stroke={strap} stroke-width="1.2" />
    <circle cx="124" cy="55" r="2" fill="none" stroke={strap} stroke-width="1" />
    {#if label}
      <text
        x="142" y="59"
        font-family="Fraunces, Georgia, serif"
        font-size="9"
        font-weight="700"
        text-anchor="middle"
        fill="#0a2d21"
      >{label}</text>
    {/if}
  </g>
</svg>
