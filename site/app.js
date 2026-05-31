/* ==================================================================
   THE NORTHLANDER WAYFINDER: APP LOGIC
   Map · search · stop panels · listing detail view · share · events
   ================================================================== */

document.getElementById('yr').textContent = new Date().getFullYear();

let activeStop = STOPS[0];
let activeCat  = 'restaurants';
/* Sort + filter state for the listings panel. Sorts are mutually
   exclusive (only one active at a time); the Local Deals toggle is a
   filter that stacks on top of whichever sort is selected. */
let activeSort = 'featured';
let activeDealsOnly = false;
let activeDetail = null;   // index of the listing being viewed, or null
/* Saved scroll position when opening a detail view, so the back
   button can restore the visitor to exactly where they were in
   the list instead of snapping to the top of the page. */
let savedScrollY = 0;

const CATS = [
  {key:'restaurants',    label:'Eat & Drink',  ic:'fork-knife'},
  {key:'accommodations', label:'Stay',         ic:'bed'},
  {key:'parks',          label:'Nature',       ic:'tree'},
  {key:'attractions',    label:'See & Do',     ic:'eye'},
  {key:'shops',          label:'Shop',         ic:'shop'},
  {key:'transportation', label:'Transport',    ic:'bus'}
];
/* Short label shown in the card tag pill. Used as a fallback when the
   listing has no .tag of its own (Airtable rows do not carry the
   Google-Places-derived tags that the original static build did). */
const TAG_BY_CAT = {
  restaurants:'Restaurant', accommodations:'Stay', parks:'Nature',
  attractions:'Attraction', shops:'Shop', transportation:'Transport'
};
function tagFor(it){ return it.tag || TAG_BY_CAT[activeCat] || 'Place'; }

/* Category header image shown above the listing cards. Keyed by the
   internal data key, not the display label. */
const CAT_HEADER_IMG = {
  restaurants:    'images/northlander-eat-and-drink.jpeg',
  accommodations: 'images/northlander-places-to-stay.jpeg',
  parks:          'images/northlander-nature-and-trails.jpeg',
  attractions:    'images/northlander-see-and-do.jpeg',
  shops:          'images/northlander-shop-local.jpeg',
  transportation: 'images/northlander-transportation.jpeg'
};
function catLabel(key){ return (CATS.find(c=>c.key===key)||{}).label || key; }

/* ------------------------------------------------------------------
   PHOSPHOR ICONS
   All UI icons are Phosphor Icons, loaded from the CDN stylesheets
   in index.html. icon(name) maps a semantic name to a Phosphor class
   and returns the <i> tag for templates. Light weight is the default;
   the fill weight (ph-fill) is reserved for active states.
------------------------------------------------------------------- */
const ICONS = {
  'fork-knife': 'ph-fork-knife',
  'bed':        'ph-bed',
  'tree':       'ph-tree',
  'pin':        'ph-map-pin',
  'eye':        'ph-eye',
  'star':       'ph-star',
  'arrow-left': 'ph-arrow-left',
  'arrow-right':'ph-arrow-right',
  'arrow-up':   'ph-arrow-up',
  'external':   'ph-arrow-square-out',
  'share':      'ph-share-network',
  'link':       'ph-link',
  'clock':      'ph-clock',
  'globe':      'ph-globe',
  'phone':      'ph-phone',
  'bus':        'ph-bus',
  'shop':       'ph-shopping-bag',
  'tag':        'ph-tag'
};
function icon(name){ const c = ICONS[name]; return c ? `<i class="ph-light ${c}" aria-hidden="true"></i>` : ''; }

/* a URL-safe slug from a listing name, used for shareable detail links */
function slug(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

/* ------------------------------------------------------------------
   DISTANCE FROM STATION
   Haversine great-circle distance in km between two coordinates,
   then a 5 km/h walking-speed conversion to minutes. The walk
   string rounds to the nearest 5 minutes for anything > 10 min and
   to the exact minute under 10. Listings may also carry a manual
   walkMins field (used by Featured slots) which overrides the
   geographic calculation.
------------------------------------------------------------------- */
function haversineKm(lat1, lng1, lat2, lng2){
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function walkFromStation(stop, item){
  let mins = null;
  if(item && typeof item.walkMins === 'number') mins = item.walkMins;
  else if(stop && item && stop.lat != null && stop.lng != null && item.lat != null && item.lng != null){
    const km = haversineKm(stop.lat, stop.lng, item.lat, item.lng);
    mins = (km / 5) * 60;
  }
  if(mins == null) return '';
  if(mins < 1) return 'At the station';
  const rounded = mins <= 10 ? Math.round(mins) : Math.round(mins/5) * 5;
  return 'About ' + rounded + ' min walk from station';
}

/* Format a listing's `hours` field into a short human line. Goal
   is "Open today: 11am to 10pm" (or "Closed today"), regardless of
   how messy the raw string is.
   - strips the "Monday: " day prefix Google adds (we already know
     it is today)
   - normalises en/em dashes and ASCII hyphens to "to"
   - collapses ":00 AM/PM" to "am/pm" so 11:00 AM becomes 11am
   - lowercases the AM/PM and drops the space before it
   - free text from curated Featured slots passes through
     untouched if it already starts with "Open" or "Closed".
   Regex uses unicode escapes (U+2013 en dash, U+2014 em dash) so
   no literal em dash sits in the source. */
function formatHours(hours){
  if(!hours) return '';
  const s = String(hours).trim();
  if(!s) return '';
  const m = s.match(/^[A-Z][a-z]+:\s*(.+)$/);
  let rest = m ? m[1].trim() : s;
  if(/^closed/i.test(rest)) return 'Closed today';
  rest = rest.replace(/\s+[\u2013\u2014-]\s+/g, ' to ');
  /* Drop ":00" minutes ("11:00 AM" becomes "11 AM"). */
  rest = rest.replace(/(\d+):00(?=\s*[AaPp][Mm])/g, '$1');
  /* Lowercase AM/PM and drop the space ("11 AM" becomes "11am"). */
  rest = rest.replace(/(\d+(?::\d+)?)\s*([AaPp][Mm])/g,
    (_, num, period) => num + period.toLowerCase());
  if(/^open/i.test(rest)) return rest;
  return 'Open today: ' + rest;
}

/* ------------------------------------------------------------------
   SEASONAL HERO IMAGE
   Picks one of four photos in site/images/ based on today's date,
   so the hero always matches the current season with no user
   interaction. Dates are calendar-based, not astronomical:
     Spring: Mar 20 - Jun 20
     Summer: Jun 21 - Sep 21
     Fall:   Sep 22 - Dec 20
     Winter: Dec 21 - Mar 19
------------------------------------------------------------------- */
function currentSeason(today){
  const d = today || new Date();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if ((m === 3 && day >= 20) || m === 4 || m === 5 || (m === 6 && day <= 20)) return 'spring';
  if ((m === 6 && day >= 21) || m === 7 || m === 8 || (m === 9 && day <= 21)) return 'summer';
  if ((m === 9 && day >= 22) || m === 10 || m === 11 || (m === 12 && day <= 20)) return 'fall';
  return 'winter';
}
function seasonalHeroImage(){
  return 'images/northlander-' + currentSeason() + '.jpeg';
}
function setSeasonalHero(){
  const img = document.getElementById('heroImg');
  if(!img) return;
  const season = currentSeason();
  const alts = {
    spring: 'Northlander train route in spring, fresh greens across a Northern Ontario landscape of lakes and forest.',
    summer: 'Northlander train route in summer, lush Northern Ontario lake and forest in full bloom.',
    fall:   'Northlander train route in fall, peak autumn colors across a Northern Ontario lake and forest.',
    winter: 'Northlander train route in winter, a snowy Northern Ontario landscape of frozen lakes and pines.'
  };
  img.src = seasonalHeroImage();
  img.alt = alts[season] || alts.fall;
}

/* ------------------------------------------------------------------
   REVEAL-ON-SCROLL
   IntersectionObserver-based fade + rise as elements enter the
   viewport. The CSS class .reveal handles the visual transition;
   here we just add .is-visible once each element first intersects.
   observeReveals() is idempotent and called after every render so
   dynamically inserted nodes get observed too. Users who prefer
   reduced motion are short-circuited to the visible state with no
   animation.
------------------------------------------------------------------- */
const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealObserver = REDUCE_MOTION ? null : new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting){
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { rootMargin:'0px 0px -8% 0px', threshold:0.08 });

function observeReveals(){
  const targets = document.querySelectorAll('.reveal:not(.is-visible)');
  if(REDUCE_MOTION || !revealObserver){
    targets.forEach(el=>el.classList.add('is-visible'));
    return;
  }
  targets.forEach(el=>revealObserver.observe(el));
}

/* ------------------------------------------------------------------
   STAT STRIP COUNT-UP
   When the stat strip first scrolls into view, the three numbers
   count up from zero to their targets (16 over 1s, 740 over 1.5s,
   11 over 0.8s) on an ease-out curve. Fires once via an
   IntersectionObserver that disconnects after the first
   intersection. Any non-digit prefix (the "~" on "~11") is
   preserved. Reduced-motion users skip the animation entirely and
   keep the final values that are already in the markup.
------------------------------------------------------------------- */
/* Render "<prefix><value>" with any non-digit prefix (the "~")
   wrapped in a .approx span so its small/raised/faint styling
   survives the count-up rewrite. */
function renderStatValue(el, prefix, value){
  el.innerHTML = (prefix ? '<span class="approx">' + prefix + '</span>' : '') + value;
}
function countUp(el, target, duration, prefix){
  const start = performance.now();
  function frame(now){
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    renderStatValue(el, prefix, Math.round(eased * target));
    if(t < 1) requestAnimationFrame(frame);
    else renderStatValue(el, prefix, target); // exact final value
  }
  requestAnimationFrame(frame);
}
function animateStats(){
  const strip = document.querySelector('.hero-stats');
  if(!strip) return;
  const nums = strip.querySelectorAll('b');
  if(REDUCE_MOTION || typeof IntersectionObserver === 'undefined') return;
  const durations = [1000, 1500, 800]; // 16, 740, ~11
  const io = new IntersectionObserver((entries, obs)=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      nums.forEach((b, i)=>{
        const raw = b.textContent.trim();
        const prefix = (raw.match(/^[^\d]*/) || [''])[0]; // e.g. "~"
        const target = parseInt(raw.replace(/[^\d]/g, ''), 10);
        if(!isNaN(target)) countUp(b, target, durations[i] || 1000, prefix);
      });
      obs.disconnect(); // play once per page load
    });
  }, { threshold: 0.4 });
  io.observe(strip);
}

/* ------------------------------------------------------------------
   HERO SCENE: fill in the pine ridge and rail ties procedurally so
   the header has real detail without any image files.
------------------------------------------------------------------- */
function buildHeroScene(){
  const pineG = document.querySelector('.hero-pines');
  const trackG = document.querySelector('.hero-track');
  if(pineG){
    let p = '';
    for(let x=-20; x<1480; x+=42){
      const baseY = 470 - 6*Math.sin(x/180);
      const h = 54 + ((x*13)%40);
      p += `<path d="M${x} ${baseY-h} L${x-20} ${baseY} L${x+20} ${baseY} Z"/>`;
      p += `<path d="M${x} ${baseY-h-16} L${x-15} ${baseY-h+24} L${x+15} ${baseY-h+24} Z"/>`;
    }
    pineG.innerHTML = p;
  }
  if(trackG){
    let t = '<rect x="0" y="556" width="1440" height="5" fill="#1a1410" opacity="0.7"/>';
    for(let x=0; x<1440; x+=46){
      t += `<rect x="${x}" y="548" width="10" height="22" rx="2" fill="#1a1410" opacity="0.55"/>`;
    }
    trackG.innerHTML = t;
  }
}

/* Thin progress bar: how far down the page = how far along the route */
function updateRouteBar(){
  const fill = document.getElementById('routebarFill');
  if(!fill) return;
  const h = document.documentElement;
  const max = h.scrollHeight - h.clientHeight;
  const pct = max > 0 ? Math.min(100, (h.scrollTop / max) * 100) : 0;
  fill.style.width = pct + '%';
}


/* ------------------------------------------------------------------
   STOP SCENES
   16 unique vintage-travel-poster style scenes, one per stop. Each
   scene is a self-contained SVG at viewBox 800x360 with
   preserveAspectRatio="xMidYMax slice" so the label overlay at the
   bottom never crops the hero subject.
   Style rules across the series: bold flat shapes, strong
   silhouettes, layered depth, the same warm poster palette.
   ------------------------------------------------------------------ */
const STOP_SCENES = {

  /* 1. Toronto Union: city skyline at dusk, CN Tower prominent
     center-right, rails fading into perspective. */
  union: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Toronto skyline at dusk">
    <defs>
      <linearGradient id="sky-union" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"    stop-color="#1a2438"/>
        <stop offset=".45"  stop-color="#8e3d22"/>
        <stop offset=".8"   stop-color="#c46f2c"/>
        <stop offset="1"    stop-color="#dca33c"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-union)"/>
    <circle cx="220" cy="230" r="34" fill="#f6e7c4"/>
    <g fill="#456f6c">
      <rect x="20"  y="208" width="42" height="80"/>
      <rect x="68"  y="190" width="36" height="98"/>
      <rect x="110" y="208" width="46" height="80"/>
      <rect x="160" y="186" width="40" height="102"/>
      <rect x="206" y="200" width="44" height="88"/>
      <rect x="254" y="218" width="40" height="70"/>
    </g>
    <g fill="#1f3d2d">
      <rect x="296" y="184" width="46" height="104"/>
      <rect x="348" y="200" width="36" height="88"/>
      <rect x="390" y="166" width="40" height="122"/>
      <rect x="436" y="196" width="36" height="92"/>
      <rect x="478" y="90"  width="14" height="198"/>
      <circle cx="485" cy="124" r="16"/>
      <polygon points="485,42 478,90 492,90"/>
      <rect x="510" y="200" width="40" height="88"/>
      <rect x="556" y="176" width="46" height="112"/>
      <rect x="608" y="198" width="40" height="90"/>
      <rect x="654" y="166" width="50" height="122"/>
      <rect x="710" y="200" width="40" height="88"/>
      <rect x="756" y="186" width="44" height="102"/>
    </g>
    <rect y="288" width="800" height="14" fill="#241f1a"/>
    <rect y="302" width="800" height="58" fill="#6b4528"/>
    <g fill="#241f1a">
      ${Array.from({length:16},(_,i)=>`<rect x="${i*52}" y="318" width="36" height="20"/>`).join('')}
    </g>
    <rect y="328" width="800" height="2.5" fill="#f3e6c8"/>
    <rect y="346" width="800" height="2.5" fill="#f3e6c8"/>
  </svg>`,

  /* 2. Langstaff: Oak Ridges Moraine, rolling green hills, kettle
     lake in the middle, round deciduous trees. */
  langstaff: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Oak Ridges Moraine">
    <defs>
      <linearGradient id="sky-lang" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f6e7c4"/>
        <stop offset="1" stop-color="#cfd9c8"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-lang)"/>
    <path d="M0 210 Q200 178 400 200 Q600 222 800 192 V270 H0 Z" fill="#7ea29e"/>
    <path d="M0 246 Q200 222 400 240 Q600 256 800 232 V300 H0 Z" fill="#2a7d57"/>
    <ellipse cx="400" cy="296" rx="170" ry="14" fill="#456f6c"/>
    <ellipse cx="400" cy="292" rx="160" ry="5" fill="#7ea29e" opacity=".55"/>
    <path d="M0 306 Q200 286 400 312 Q600 326 800 300 V360 H0 Z" fill="#1f3d2d"/>
    <g fill="#1d6347">
      <circle cx="80"  cy="276" r="22"/><circle cx="118" cy="276" r="18"/>
      <circle cx="158" cy="274" r="20"/>
      <circle cx="640" cy="264" r="20"/><circle cx="676" cy="270" r="18"/>
      <circle cx="714" cy="266" r="22"/><circle cx="754" cy="272" r="18"/>
    </g>
    <g fill="#3a2618">
      <rect x="78"  y="286" width="4" height="16"/>
      <rect x="116" y="286" width="4" height="16"/>
      <rect x="156" y="284" width="4" height="16"/>
      <rect x="638" y="274" width="4" height="16"/>
      <rect x="674" y="280" width="4" height="16"/>
      <rect x="712" y="276" width="4" height="16"/>
      <rect x="752" y="282" width="4" height="16"/>
    </g>
  </svg>`,

  /* 3. Gormley: orchard country on the moraine, rows of fruit trees,
     a wooden farm stand with a red roof. */
  gormley: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Orchard country">
    <defs>
      <linearGradient id="sky-gorm" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a9c8d4"/>
        <stop offset="1" stop-color="#f6e7c4"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-gorm)"/>
    <g fill="#f3e6c8" opacity=".85">
      <ellipse cx="180" cy="74" rx="60" ry="14"/>
      <ellipse cx="200" cy="68" rx="40" ry="10"/>
      <ellipse cx="580" cy="92" rx="54" ry="13"/>
      <ellipse cx="600" cy="86" rx="36" ry="9"/>
    </g>
    <rect y="220" width="800" height="40" fill="#dca33c"/>
    <rect y="260" width="800" height="34" fill="#c89525"/>
    <g fill="#2a7d57">
      ${Array.from({length:10},(_,i)=>`<circle cx="${40+i*80}" cy="232" r="14"/>`).join('')}
    </g>
    <g fill="#1d6347">
      ${[60,180,300,540,660,780].map(x=>`<circle cx="${x}" cy="284" r="22"/>`).join('')}
    </g>
    <g fill="#c46f2c">
      ${[60,180,300,540,660,780].flatMap(x=>[`<circle cx="${x-6}" cy="278" r="2.5"/>`,`<circle cx="${x+5}" cy="290" r="2.5"/>`,`<circle cx="${x+2}" cy="270" r="2.5"/>`]).join('')}
    </g>
    <g fill="#3a2618">
      ${[60,180,300,540,660,780].map(x=>`<rect x="${x-3}" y="298" width="6" height="14"/>`).join('')}
    </g>
    <g>
      <rect x="356" y="266" width="92" height="46" fill="#a85a22"/>
      <polygon points="356,266 402,238 448,266" fill="#8e3d22"/>
      <rect x="394" y="280" width="16" height="32" fill="#2a1f15"/>
      <rect x="364" y="274" width="20" height="14" fill="#f6e7c4"/>
      <rect x="420" y="274" width="20" height="14" fill="#f6e7c4"/>
      <rect x="368" y="252" width="68" height="6" fill="#f6e7c4"/>
    </g>
    <rect y="312" width="800" height="48" fill="#2a7d57"/>
  </svg>`,

  /* 4. Washago: gateway to cottage country. Two rivers meeting at a
     point of land, a single canoe on calm water, the first pines. */
  washago: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two rivers meeting at Washago">
    <defs>
      <linearGradient id="sky-wash" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#c4dde0"/>
        <stop offset="1" stop-color="#f3e6c8"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-wash)"/>
    <rect y="220" width="800" height="20" fill="#456f6c"/>
    <g fill="#1f3d2d">
      ${Array.from({length:26},(_,i)=>`<polygon points="${10+i*32},220 ${-4+i*32},242 ${24+i*32},242"/>`).join('')}
    </g>
    <rect y="240" width="800" height="120" fill="#456f6c"/>
    <path d="M0 240 L380 240 L420 280 L800 280 L800 240 Z" fill="#7ea29e" opacity=".35"/>
    <rect x="50"  y="270" width="190" height="2" fill="#7ea29e" opacity=".6"/>
    <rect x="500" y="300" width="220" height="2" fill="#7ea29e" opacity=".55"/>
    <rect x="200" y="332" width="260" height="2" fill="#7ea29e" opacity=".45"/>
    <g fill="#1f3d2d">
      <polygon points="80,212 50,290 110,290"/>
      <polygon points="118,202 86,290 150,290"/>
      <polygon points="700,202 670,290 730,290"/>
      <polygon points="744,212 716,290 772,290"/>
    </g>
    <g>
      <rect x="540" y="304" width="180" height="6" fill="#6b4528"/>
      <rect x="540" y="310" width="6" height="22" fill="#3a2618"/>
      <rect x="640" y="310" width="6" height="22" fill="#3a2618"/>
      <rect x="714" y="310" width="6" height="22" fill="#3a2618"/>
    </g>
    <g>
      <path d="M250 312 Q330 290 410 312 Q330 332 250 312 Z" fill="#8e3d22"/>
      <path d="M270 311 Q330 302 390 311" fill="none" stroke="#f6e7c4" stroke-width="1.5"/>
      <circle cx="335" cy="302" r="6" fill="#1f3d2d"/>
      <rect x="334" y="290" width="2" height="14" fill="#3a2618"/>
    </g>
  </svg>`,

  /* 5. Gravenhurst: RMS Segwun steamship hero on Lake Muskoka, with
     a Muskoka boathouse and dock in the foreground, warm sunset. */
  gravenhurst: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="RMS Segwun on Lake Muskoka">
    <defs>
      <linearGradient id="sky-grav" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"  stop-color="#dca33c"/>
        <stop offset=".55" stop-color="#c46f2c"/>
        <stop offset="1"  stop-color="#8e3d22"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-grav)"/>
    <circle cx="600" cy="170" r="48" fill="#f6e7c4" opacity=".95"/>
    <rect y="220" width="800" height="22" fill="#2c5258"/>
    <g fill="#1f3d2d">
      ${Array.from({length:22},(_,i)=>`<polygon points="${20+i*36},220 ${4+i*36},244 ${36+i*36},244"/>`).join('')}
    </g>
    <rect y="244" width="800" height="116" fill="#2c5258"/>
    <rect x="588" y="252" width="40" height="2" fill="#f6e7c4" opacity=".7"/>
    <rect x="582" y="262" width="50" height="2" fill="#f6e7c4" opacity=".55"/>
    <rect x="574" y="276" width="64" height="2" fill="#f6e7c4" opacity=".45"/>
    <rect x="566" y="292" width="80" height="2" fill="#f6e7c4" opacity=".3"/>
    <g>
      <path d="M250 282 L520 282 L500 308 L270 308 Z" fill="#f3e6c8"/>
      <rect x="270" y="308" width="230" height="6" fill="#8e3d22"/>
      <rect x="280" y="262" width="220" height="20" fill="#f3e6c8"/>
      <rect x="350" y="244" width="80" height="20" fill="#f3e6c8"/>
      <g fill="#2c5258">
        ${Array.from({length:11},(_,i)=>`<rect x="${288+i*20}" y="268" width="10" height="8"/>`).join('')}
      </g>
      <rect x="368" y="214" width="14" height="32" fill="#8e3d22"/>
      <rect x="408" y="214" width="14" height="32" fill="#8e3d22"/>
      <ellipse cx="378" cy="208" rx="14" ry="6" fill="#f3e6c8" opacity=".5"/>
      <ellipse cx="418" cy="206" rx="14" ry="6" fill="#f3e6c8" opacity=".5"/>
      <circle cx="492" cy="298" r="14" fill="#8e3d22"/>
      <circle cx="492" cy="298" r="9"  fill="#f3e6c8"/>
      <g stroke="#8e3d22" stroke-width="1.6">
        <line x1="492" y1="287" x2="492" y2="309"/>
        <line x1="481" y1="298" x2="503" y2="298"/>
        <line x1="484" y1="290" x2="500" y2="306"/>
        <line x1="500" y1="290" x2="484" y2="306"/>
      </g>
      <rect x="378" y="196" width="2" height="22" fill="#241f1a"/>
      <polygon points="380,196 396,200 380,204" fill="#c46f2c"/>
    </g>
    <g>
      <rect x="40"  y="288" width="140" height="48" fill="#6b4528"/>
      <polygon points="40,288 110,258 180,288" fill="#8e3d22"/>
      <rect x="58"  y="304" width="36" height="32" fill="#241f1a" opacity=".7"/>
      <rect x="118" y="304" width="36" height="32" fill="#241f1a" opacity=".7"/>
      <rect x="180" y="324" width="170" height="6" fill="#6b4528"/>
      <rect x="200" y="330" width="6" height="22" fill="#3a2618"/>
      <rect x="276" y="330" width="6" height="22" fill="#3a2618"/>
      <rect x="340" y="330" width="6" height="22" fill="#3a2618"/>
    </g>
  </svg>`,

  /* 6. Bracebridge: Bracebridge Falls at night, illuminated. Stars
     overhead, dark historic buildings either side, warm glow halo
     around the cascade. */
  bracebridge: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bracebridge Falls at night">
    <defs>
      <linearGradient id="sky-brace" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#13192c"/>
        <stop offset="1" stop-color="#2c5258"/>
      </linearGradient>
      <radialGradient id="brace-glow" cx="0.5" cy="0.62" r="0.42">
        <stop offset="0"   stop-color="#dca33c" stop-opacity="0.55"/>
        <stop offset="1"   stop-color="#dca33c" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-brace)"/>
    <g fill="#f3e6c8">
      <circle cx="60"  cy="38"  r="1.4"/><circle cx="140" cy="64"  r="1"/>
      <circle cx="218" cy="28"  r="1.5"/><circle cx="300" cy="78"  r="1"/>
      <circle cx="360" cy="48"  r="1.2"/><circle cx="450" cy="36"  r="1.6"/>
      <circle cx="540" cy="84"  r="1"/><circle cx="620" cy="50"  r="1.4"/>
      <circle cx="700" cy="30"  r="1"/><circle cx="760" cy="74"  r="1.5"/>
    </g>
    <g fill="#241f1a">
      <rect x="0"   y="220" width="80" height="120"/>
      <polygon points="0,220 40,194 80,220"/>
      <rect x="84"  y="200" width="60" height="140"/>
      <polygon points="84,200 114,176 144,200"/>
      <rect x="148" y="226" width="50" height="114"/>
      <rect x="200" y="240" width="46" height="100"/>
      <rect x="620" y="224" width="60" height="116"/>
      <polygon points="620,224 650,198 680,224"/>
      <rect x="684" y="208" width="58" height="132"/>
      <rect x="746" y="232" width="54" height="108"/>
      <polygon points="746,232 772,210 800,232"/>
    </g>
    <g fill="#dca33c">
      <rect x="22"  y="246" width="6" height="8"/><rect x="40"  y="246" width="6" height="8"/>
      <rect x="58"  y="246" width="6" height="8"/><rect x="22"  y="268" width="6" height="8"/>
      <rect x="40"  y="268" width="6" height="8"/>
      <rect x="100" y="232" width="6" height="8"/><rect x="120" y="232" width="6" height="8"/>
      <rect x="100" y="254" width="6" height="8"/><rect x="120" y="278" width="6" height="8"/>
      <rect x="160" y="248" width="6" height="8"/><rect x="180" y="248" width="6" height="8"/>
      <rect x="160" y="274" width="6" height="8"/>
      <rect x="640" y="248" width="6" height="8"/><rect x="660" y="248" width="6" height="8"/>
      <rect x="640" y="270" width="6" height="8"/>
      <rect x="702" y="234" width="6" height="8"/><rect x="722" y="234" width="6" height="8"/>
      <rect x="702" y="256" width="6" height="8"/><rect x="722" y="280" width="6" height="8"/>
      <rect x="760" y="254" width="6" height="8"/><rect x="780" y="254" width="6" height="8"/>
    </g>
    <rect width="800" height="360" fill="url(#brace-glow)"/>
    <rect x="276" y="196" width="248" height="14" fill="#2a1f15"/>
    <path d="M276 210 L524 210 L504 320 L296 320 Z" fill="#f6e7c4" opacity=".92"/>
    <path d="M308 218 L492 218 L478 320 L322 320 Z" fill="#f3e6c8"/>
    <ellipse cx="400" cy="312" rx="92" ry="9" fill="#f3e6c8" opacity=".45"/>
    <ellipse cx="310" cy="326" rx="22" ry="6" fill="#241f1a"/>
    <ellipse cx="400" cy="328" rx="44" ry="8" fill="#241f1a"/>
    <ellipse cx="492" cy="326" rx="22" ry="6" fill="#241f1a"/>
    <rect y="334" width="800" height="26" fill="#2c5258"/>
  </svg>`,

  /* 7. Huntsville: peak autumn Muskoka color. Layered ridges in
     reds/oranges/golds with a Group-of-Seven windswept pine, and a
     glimpse of a lake. */
  huntsville: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Huntsville in peak autumn">
    <defs>
      <linearGradient id="sky-hunt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a9c8d4"/>
        <stop offset="1" stop-color="#f6e7c4"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-hunt)"/>
    <path d="M0 196 Q200 174 400 188 Q600 204 800 178 V240 H0 Z" fill="#456f6c"/>
    <rect y="240" width="800" height="20" fill="#2c5258"/>
    <rect x="100" y="248" width="220" height="2" fill="#7ea29e" opacity=".6"/>
    <rect x="460" y="252" width="220" height="2" fill="#7ea29e" opacity=".6"/>
    <path d="M0 260 Q200 248 400 256 Q600 264 800 250 V360 H0 Z" fill="#1f3d2d"/>
    <g>
      <circle cx="100" cy="228" r="42" fill="#8e3d22"/>
      <circle cx="118" cy="216" r="22" fill="#a85a22"/>
      <rect x="96" y="256" width="8" height="22" fill="#3a2618"/>

      <circle cx="200" cy="234" r="36" fill="#c46f2c"/>
      <circle cx="186" cy="222" r="18" fill="#dca33c"/>
      <rect x="196" y="260" width="8" height="22" fill="#3a2618"/>

      <circle cx="296" cy="240" r="40" fill="#dca33c"/>
      <circle cx="312" cy="226" r="20" fill="#c89525"/>
      <rect x="292" y="268" width="8" height="22" fill="#3a2618"/>

      <circle cx="396" cy="238" r="38" fill="#a85a22"/>
      <circle cx="380" cy="224" r="18" fill="#8e3d22"/>
      <rect x="392" y="266" width="8" height="22" fill="#3a2618"/>

      <rect x="592" y="170" width="6" height="100" fill="#3a2618"/>
      <path d="M595 180 Q558 162 530 174 Q578 188 595 182 Z" fill="#1f3d2d"/>
      <path d="M595 196 Q554 184 526 200 Q576 206 595 198 Z" fill="#1f3d2d"/>
      <path d="M595 214 Q554 204 526 222 Q576 222 595 214 Z" fill="#1f3d2d"/>

      <circle cx="688" cy="240" r="40" fill="#c46f2c"/>
      <circle cx="702" cy="226" r="20" fill="#dca33c"/>
      <rect x="684" y="266" width="8" height="22" fill="#3a2618"/>

      <circle cx="772" cy="246" r="34" fill="#8e3d22"/>
      <circle cx="784" cy="234" r="16" fill="#a85a22"/>
      <rect x="768" y="270" width="8" height="22" fill="#3a2618"/>
    </g>
  </svg>`,

  /* 8. South River: the quiet back door to Algonquin. Misty boreal
     forest in receding layers, a narrow river, a single canoe on
     still water. */
  southriver: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="South River and the gateway to Algonquin">
    <defs>
      <linearGradient id="sky-sr" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#c2cbc6"/>
        <stop offset="1" stop-color="#e7decb"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-sr)"/>
    <!-- far mist layer of pines -->
    <g fill="#7ea29e" opacity=".55">
      ${Array.from({length:24},(_,i)=>`<polygon points="${(i*34)+10},176 ${(i*34)-10},226 ${(i*34)+30},226"/>`).join('')}
    </g>
    <rect y="226" width="800" height="16" fill="#cfd9c8" opacity=".7"/>
    <!-- mid pines -->
    <g fill="#456f6c">
      ${Array.from({length:18},(_,i)=>`<polygon points="${(i*46)+24},196 ${(i*46)-2},254 ${(i*46)+50},254"/>`).join('')}
    </g>
    <rect y="254" width="800" height="10" fill="#dfe4d4" opacity=".7"/>
    <!-- foreground pines -->
    <g fill="#1f3d2d">
      ${Array.from({length:14},(_,i)=>`<polygon points="${(i*60)+34},220 ${(i*60)-2},284 ${(i*60)+70},284"/>`).join('')}
    </g>
    <!-- river -->
    <rect y="284" width="800" height="76" fill="#456f6c"/>
    <rect x="60"  y="298" width="170" height="2" fill="#cfd9c8" opacity=".55"/>
    <rect x="320" y="318" width="220" height="2" fill="#cfd9c8" opacity=".45"/>
    <rect x="600" y="334" width="160" height="2" fill="#cfd9c8" opacity=".5"/>
    <!-- single canoe with paddler -->
    <g>
      <path d="M310 320 Q400 296 490 320 Q400 342 310 320 Z" fill="#3a2618"/>
      <path d="M334 318 Q400 308 466 318" fill="none" stroke="#f6e7c4" stroke-width="1.5"/>
      <circle cx="400" cy="308" r="7" fill="#8e3d22"/>
      <rect x="399" y="294" width="2" height="16" fill="#241f1a"/>
    </g>
    <!-- mist wisps -->
    <ellipse cx="180" cy="294" rx="120" ry="6" fill="#f3e6c8" opacity=".5"/>
    <ellipse cx="620" cy="302" rx="140" ry="5" fill="#f3e6c8" opacity=".4"/>
  </svg>`,

  /* 9. Temagami: ancient red and white pines silhouetted against a
     deep teal/purple dusk, reflected in a mirror-calm lake. A small
     fire tower on a distant ridge. */
  temagami: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Temagami old growth pines at dusk">
    <defs>
      <linearGradient id="sky-tem" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"   stop-color="#2c2546"/>
        <stop offset=".55" stop-color="#3f4d68"/>
        <stop offset="1"   stop-color="#7ea29e"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-tem)"/>
    <!-- moon -->
    <circle cx="660" cy="74" r="22" fill="#f6e7c4" opacity=".9"/>
    <!-- distant ridge with tiny fire tower -->
    <path d="M0 192 Q160 168 300 184 Q460 200 640 178 Q740 168 800 184 V210 H0 Z" fill="#2c2540"/>
    <g fill="#241f1a">
      <rect x="568" y="160" width="2" height="22"/>
      <rect x="572" y="160" width="2" height="22"/>
      <polygon points="566,158 576,158 571,148"/>
      <line x1="566" y1="160" x2="576" y2="180" stroke="#241f1a" stroke-width=".7"/>
      <line x1="576" y1="160" x2="566" y2="180" stroke="#241f1a" stroke-width=".7"/>
    </g>
    <!-- tall ancient pines: bigger, irregular, distinctive -->
    <g fill="#0e1c24">
      <rect x="118" y="60"  width="10" height="220"/>
      <path d="M123 60 Q90 90 80 130 Q108 122 123 116 Z"/>
      <path d="M123 110 Q88 138 76 178 Q108 172 123 168 Z"/>
      <path d="M123 160 Q86 188 78 226 Q108 220 123 218 Z"/>

      <rect x="206" y="76"  width="10" height="204"/>
      <path d="M211 76  Q244 100 254 140 Q224 134 211 128 Z"/>
      <path d="M211 124 Q244 152 256 188 Q224 184 211 180 Z"/>
      <path d="M211 174 Q244 200 256 232 Q226 230 211 228 Z"/>

      <rect x="402" y="44"  width="12" height="236"/>
      <path d="M408 44  Q372 78 360 124 Q392 116 408 112 Z"/>
      <path d="M408 104 Q372 138 360 184 Q392 176 408 172 Z"/>
      <path d="M408 164 Q372 198 360 244 Q392 236 408 232 Z"/>

      <rect x="568" y="92"  width="10" height="188"/>
      <path d="M573 92  Q606 118 614 152 Q586 148 573 144 Z"/>
      <path d="M573 140 Q606 164 614 196 Q586 192 573 188 Z"/>
      <path d="M573 184 Q606 208 614 240 Q586 238 573 234 Z"/>

      <rect x="688" y="68"  width="10" height="212"/>
      <path d="M693 68  Q726 96 736 134 Q706 128 693 124 Z"/>
      <path d="M693 122 Q726 148 736 184 Q706 182 693 178 Z"/>
      <path d="M693 174 Q726 200 736 236 Q706 232 693 230 Z"/>
    </g>
    <!-- mirror lake -->
    <rect y="280" width="800" height="80" fill="#161a26"/>
    <!-- reflection bars -->
    <rect x="40"  y="294" width="200" height="2" fill="#3f4d68" opacity=".7"/>
    <rect x="300" y="306" width="240" height="2" fill="#3f4d68" opacity=".6"/>
    <rect x="600" y="316" width="180" height="2" fill="#3f4d68" opacity=".55"/>
    <rect x="120" y="328" width="280" height="2" fill="#3f4d68" opacity=".45"/>
    <!-- soft reflections of pines (dim, inverted) -->
    <g fill="#0e1c24" opacity=".55">
      <rect x="118" y="280" width="10" height="60"/>
      <rect x="206" y="280" width="10" height="56"/>
      <rect x="402" y="280" width="12" height="70"/>
      <rect x="568" y="280" width="10" height="50"/>
      <rect x="688" y="280" width="10" height="64"/>
    </g>
  </svg>`,

  /* 10. North Bay: Lake Nipissing at golden hour. Heritage carousel
     by the waterfront, sandy beach, lake stretching to the horizon. */
  northbay: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="North Bay waterfront at golden hour">
    <defs>
      <linearGradient id="sky-nb" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"   stop-color="#dca33c"/>
        <stop offset=".65" stop-color="#f6e7c4"/>
        <stop offset="1"   stop-color="#f3e6c8"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-nb)"/>
    <circle cx="640" cy="150" r="38" fill="#fff4d6" opacity=".95"/>
    <!-- far shoreline -->
    <path d="M0 196 Q200 188 400 196 Q600 204 800 192 V216 H0 Z" fill="#456f6c"/>
    <!-- lake -->
    <rect y="216" width="800" height="80" fill="#2c5258"/>
    <rect x="60"  y="232" width="180" height="2" fill="#dca33c" opacity=".7"/>
    <rect x="520" y="238" width="200" height="2" fill="#dca33c" opacity=".7"/>
    <rect x="220" y="258" width="260" height="2" fill="#dca33c" opacity=".55"/>
    <rect x="120" y="280" width="280" height="2" fill="#dca33c" opacity=".4"/>
    <!-- sandy beach -->
    <path d="M0 296 Q400 286 800 298 V360 H0 Z" fill="#dca33c"/>
    <path d="M0 314 Q400 308 800 318 V360 H0 Z" fill="#c89525"/>
    <!-- carousel: cylindrical body + peaked roof + flag -->
    <g>
      <ellipse cx="200" cy="296" rx="84" ry="10" fill="#3a2618"/>
      <rect x="116" y="232" width="168" height="64" fill="#8e3d22"/>
      <g fill="#f6e7c4">
        <rect x="120" y="236" width="160" height="4"/>
        <rect x="120" y="292" width="160" height="4"/>
      </g>
      <g fill="#f3e6c8">
        ${Array.from({length:7},(_,i)=>`<rect x="${130+i*22}" y="244" width="14" height="46"/>`).join('')}
      </g>
      <g fill="#456f6c">
        ${Array.from({length:7},(_,i)=>`<circle cx="${137+i*22}" cy="268" r="4"/>`).join('')}
      </g>
      <polygon points="116,232 200,180 284,232" fill="#c46f2c"/>
      <polygon points="124,232 200,190 276,232" fill="#dca33c"/>
      <rect x="198" y="158" width="4" height="22" fill="#241f1a"/>
      <polygon points="202,158 220,164 202,170" fill="#8e3d22"/>
    </g>
    <!-- distant sailboats -->
    <g fill="#241f1a">
      <polygon points="510,246 510,228 524,246"/>
      <rect x="508" y="244" width="20" height="3"/>
      <polygon points="580,250 580,234 592,250"/>
      <rect x="578" y="248" width="18" height="3"/>
    </g>
  </svg>`,

  /* 11. Temiskaming Shores: dramatic Devil's Rock cliff rising from
     the lake on the left, unexpectedly lush farmland on the right. */
  temiskaming: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Lake Temiskaming and Devil's Rock">
    <defs>
      <linearGradient id="sky-tk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b8c7c4"/>
        <stop offset="1" stop-color="#f3e6c8"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-tk)"/>
    <!-- soft clouds -->
    <g fill="#f3e6c8" opacity=".75">
      <ellipse cx="600" cy="70"  rx="60" ry="12"/>
      <ellipse cx="620" cy="64"  rx="40" ry="9"/>
      <ellipse cx="300" cy="92"  rx="44" ry="10"/>
    </g>
    <!-- Devil's Rock cliff: dramatic vertical mass on left -->
    <g fill="#3a2618">
      <path d="M0 60 L260 60 L300 220 L210 254 L0 254 Z"/>
    </g>
    <g fill="#6b4528">
      <path d="M0 60 L260 60 L286 200 L210 226 L0 226 Z"/>
    </g>
    <g fill="#8a6a44">
      <path d="M0 60 L210 60 L240 180 L160 200 L0 200 Z"/>
    </g>
    <!-- darker fissure detail on cliff -->
    <path d="M150 60 L160 254 L154 256 L140 60 Z" fill="#241f1a" opacity=".4"/>
    <path d="M210 60 L226 230 L218 232 L198 60 Z" fill="#241f1a" opacity=".35"/>
    <!-- distant rolling farmland (right) -->
    <path d="M260 210 Q400 198 540 208 Q680 218 800 200 V250 H260 Z" fill="#7ea29e"/>
    <path d="M260 234 Q400 224 540 232 Q680 240 800 226 V270 H260 Z" fill="#2a7d57"/>
    <!-- pastoral fields rows -->
    <g fill="#1d6347" opacity=".75">
      <rect x="280" y="252" width="160" height="2"/>
      <rect x="460" y="256" width="180" height="2"/>
      <rect x="660" y="248" width="140" height="2"/>
    </g>
    <!-- distant barn -->
    <g>
      <rect x="540" y="234" width="30" height="22" fill="#8e3d22"/>
      <polygon points="540,234 555,222 570,234" fill="#6b4528"/>
    </g>
    <!-- lake -->
    <rect y="270" width="800" height="90" fill="#2c5258"/>
    <rect x="60"  y="286" width="180" height="2" fill="#7ea29e" opacity=".55"/>
    <rect x="320" y="298" width="220" height="2" fill="#7ea29e" opacity=".5"/>
    <rect x="540" y="324" width="200" height="2" fill="#7ea29e" opacity=".5"/>
    <!-- cliff reflection (faint) -->
    <path d="M0 270 L210 270 L184 322 L0 322 Z" fill="#3a2618" opacity=".45"/>
  </svg>`,

  /* 12. Englehart: High Falls cascading through the Englehart River
     gorge, with a railway bridge in the back and dense boreal
     forest on both sides. */
  englehart: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Englehart River gorge with High Falls">
    <defs>
      <linearGradient id="sky-eng" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a9c0bf"/>
        <stop offset="1" stop-color="#dfe4d4"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-eng)"/>
    <!-- railway bridge across in the back -->
    <g fill="#6b4528">
      <rect x="0"   y="156" width="800" height="6"/>
      <rect x="80"  y="162" width="4" height="36"/>
      <rect x="200" y="162" width="4" height="36"/>
      <rect x="320" y="162" width="4" height="36"/>
      <rect x="440" y="162" width="4" height="36"/>
      <rect x="560" y="162" width="4" height="36"/>
      <rect x="680" y="162" width="4" height="36"/>
    </g>
    <g stroke="#3a2618" stroke-width="2" fill="none">
      <path d="M80 162 L130 198 L200 162 L260 198 L320 162 L380 198 L440 162 L500 198 L560 162 L620 198 L680 162"/>
    </g>
    <!-- distant boreal -->
    <g fill="#2c5258">
      ${Array.from({length:22},(_,i)=>`<polygon points="${10+i*36},172 ${-4+i*36},206 ${24+i*36},206"/>`).join('')}
    </g>
    <!-- gorge walls (left and right) -->
    <path d="M0 200 L300 200 L260 360 L0 360 Z" fill="#3a2618"/>
    <path d="M0 200 L260 200 L226 360 L0 360 Z" fill="#6b4528"/>
    <path d="M800 200 L500 200 L540 360 L800 360 Z" fill="#3a2618"/>
    <path d="M800 200 L540 200 L574 360 L800 360 Z" fill="#6b4528"/>
    <!-- mid-foreground pines on cliff tops -->
    <g fill="#1f3d2d">
      <polygon points="60,196 36,236 84,236"/>
      <polygon points="120,190 96,236 144,236"/>
      <polygon points="170,196 146,236 194,236"/>
      <polygon points="620,196 596,236 644,236"/>
      <polygon points="680,190 656,236 704,236"/>
      <polygon points="740,196 716,236 764,236"/>
    </g>
    <!-- the waterfall: white cascade between the cliffs -->
    <path d="M300 204 L500 204 L516 360 L284 360 Z" fill="#2c5258"/>
    <path d="M310 204 L490 204 L506 360 L294 360 Z" fill="#f3e6c8" opacity=".95"/>
    <path d="M328 218 L472 218 L490 360 L310 360 Z" fill="#f6e7c4"/>
    <!-- spray -->
    <ellipse cx="400" cy="332" rx="100" ry="9" fill="#f3e6c8" opacity=".55"/>
    <!-- rocks at base -->
    <ellipse cx="320" cy="346" rx="22" ry="6" fill="#241f1a"/>
    <ellipse cx="400" cy="350" rx="40" ry="8" fill="#241f1a"/>
    <ellipse cx="480" cy="346" rx="22" ry="6" fill="#241f1a"/>
  </svg>`,

  /* 13. Kirkland Lake: gold mine headframe silhouetted against a
     dramatic sunset, underground tunnels with gold veins suggested
     below the surface. */
  kirklandlake: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Kirkland Lake gold mine headframe at sunset">
    <defs>
      <linearGradient id="sky-kl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"   stop-color="#dca33c"/>
        <stop offset=".4"  stop-color="#c46f2c"/>
        <stop offset=".75" stop-color="#8e3d22"/>
        <stop offset="1"   stop-color="#3a2618"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-kl)"/>
    <circle cx="180" cy="124" r="50" fill="#f6e7c4" opacity=".85"/>
    <!-- distant low buildings -->
    <g fill="#241f1a">
      <rect x="40"  y="216" width="50" height="40"/>
      <rect x="100" y="220" width="60" height="36"/>
      <rect x="180" y="208" width="40" height="48"/>
      <rect x="240" y="218" width="46" height="38"/>
      <rect x="616" y="220" width="48" height="36"/>
      <rect x="680" y="212" width="56" height="44"/>
      <rect x="742" y="220" width="50" height="36"/>
    </g>
    <!-- ground line: surface -->
    <rect y="256" width="800" height="6" fill="#1f0e08"/>
    <!-- HEADFRAME: tall vertical structure with trapezoidal top -->
    <g fill="#241f1a">
      <rect x="380" y="80"  width="60" height="180"/>
      <polygon points="380,80 410,40 440,80"/>
      <!-- pulley wheel at top -->
      <circle cx="410" cy="62" r="14" fill="#241f1a" stroke="#dca33c" stroke-width="2"/>
      <line x1="410" y1="48" x2="410" y2="76" stroke="#dca33c" stroke-width="1.6"/>
      <line x1="396" y1="62" x2="424" y2="62" stroke="#dca33c" stroke-width="1.6"/>
      <!-- diagonal bracing -->
      <line x1="380" y1="80"  x2="440" y2="260" stroke="#241f1a" stroke-width="3"/>
      <line x1="440" y1="80"  x2="380" y2="260" stroke="#241f1a" stroke-width="3"/>
      <!-- cable down -->
      <rect x="408" y="76" width="4" height="184" fill="#3a2618"/>
    </g>
    <!-- ore conveyor extending right -->
    <g fill="#241f1a">
      <rect x="440" y="208" width="200" height="14"/>
      <rect x="446" y="222" width="4"  height="34"/>
      <rect x="540" y="222" width="4"  height="34"/>
      <rect x="630" y="222" width="4"  height="34"/>
    </g>
    <!-- underground section (below surface) -->
    <rect y="262" width="800" height="98" fill="#1f0e08"/>
    <!-- tunnel openings -->
    <g fill="#0a0503">
      <ellipse cx="160" cy="304" rx="44" ry="18"/>
      <ellipse cx="640" cy="316" rx="50" ry="20"/>
    </g>
    <!-- gold veins in the rock -->
    <g stroke="#dca33c" stroke-width="2" fill="none" opacity=".85">
      <path d="M60 290 L120 310 L80 340"/>
      <path d="M240 286 L300 320"/>
      <path d="M420 274 L460 308 L420 342"/>
      <path d="M520 290 L560 322"/>
      <path d="M720 280 L760 318 L720 348"/>
    </g>
    <g fill="#dca33c">
      <circle cx="100" cy="320" r="1.5"/>
      <circle cx="280" cy="310" r="1.5"/>
      <circle cx="440" cy="320" r="1.5"/>
      <circle cx="560" cy="312" r="1.5"/>
      <circle cx="740" cy="328" r="1.5"/>
    </g>
  </svg>`,

  /* 14. Matheson: aerial-style poster view of 22 kettle lakes
     scattered through the boreal forest, with a highway curving
     through and a tiny coach bus marker. */
  matheson: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Aerial view of Matheson kettle lakes">
    <defs>
      <radialGradient id="sky-mat" cx="0.5" cy="0.4" r="0.8">
        <stop offset="0"  stop-color="#3a5a44"/>
        <stop offset="1"  stop-color="#1f3d2d"/>
      </radialGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-mat)"/>
    <!-- forest texture: scattered tiny triangles -->
    <g fill="#0e3b2c">
      ${Array.from({length:240},(_,i)=>{
        const x = (i*53)%800;
        const y = 30 + (i*97)%310;
        const s = 3 + (i%4);
        return `<polygon points="${x},${y-s} ${x-s},${y+s} ${x+s},${y+s}"/>`;
      }).join('')}
    </g>
    <g fill="#2a7d57" opacity=".55">
      ${Array.from({length:140},(_,i)=>{
        const x = (i*71+20)%790;
        const y = 30 + (i*61+13)%310;
        const s = 2 + (i%3);
        return `<polygon points="${x},${y-s} ${x-s},${y+s} ${x+s},${y+s}"/>`;
      }).join('')}
    </g>
    <!-- 22 kettle lakes: clean blue ellipses, varied sizes -->
    <g fill="#7ea29e">
      <ellipse cx="80"  cy="60"  rx="24" ry="14"/>
      <ellipse cx="170" cy="100" rx="32" ry="18"/>
      <ellipse cx="260" cy="60"  rx="20" ry="12"/>
      <ellipse cx="360" cy="84"  rx="36" ry="20"/>
      <ellipse cx="468" cy="58"  rx="22" ry="14"/>
      <ellipse cx="570" cy="92"  rx="30" ry="18"/>
      <ellipse cx="678" cy="64"  rx="24" ry="14"/>
      <ellipse cx="744" cy="110" rx="28" ry="16"/>
      <ellipse cx="100" cy="178" rx="34" ry="20"/>
      <ellipse cx="218" cy="206" rx="22" ry="14"/>
      <ellipse cx="318" cy="170" rx="30" ry="18"/>
      <ellipse cx="438" cy="208" rx="36" ry="22"/>
      <ellipse cx="554" cy="172" rx="24" ry="14"/>
      <ellipse cx="660" cy="206" rx="32" ry="18"/>
      <ellipse cx="754" cy="220" rx="20" ry="12"/>
      <ellipse cx="60"  cy="284" rx="28" ry="16"/>
      <ellipse cx="170" cy="320" rx="22" ry="13"/>
      <ellipse cx="276" cy="284" rx="36" ry="22"/>
      <ellipse cx="396" cy="318" rx="26" ry="16"/>
      <ellipse cx="510" cy="288" rx="32" ry="18"/>
      <ellipse cx="618" cy="326" rx="24" ry="14"/>
      <ellipse cx="730" cy="296" rx="30" ry="18"/>
    </g>
    <g fill="#456f6c" opacity=".7">
      <ellipse cx="170" cy="98"  rx="22" ry="6"/>
      <ellipse cx="360" cy="82"  rx="22" ry="6"/>
      <ellipse cx="438" cy="206" rx="22" ry="6"/>
      <ellipse cx="276" cy="284" rx="22" ry="6"/>
      <ellipse cx="510" cy="288" rx="22" ry="6"/>
    </g>
    <!-- highway: a curved poster-cream ribbon -->
    <path d="M0 350 Q120 290 250 320 Q400 360 540 286 Q660 230 800 270" stroke="#f3e6c8" stroke-width="4" fill="none" opacity=".9"/>
    <path d="M0 350 Q120 290 250 320 Q400 360 540 286 Q660 230 800 270" stroke="#241f1a" stroke-width="1" fill="none" stroke-dasharray="8 8"/>
    <!-- coach bus dot on the highway -->
    <g>
      <rect x="318" y="332" width="22" height="10" rx="2" fill="#8e3d22"/>
      <rect x="320" y="334" width="4" height="4" fill="#f6e7c4"/>
      <rect x="328" y="334" width="4" height="4" fill="#f6e7c4"/>
      <rect x="334" y="334" width="4" height="4" fill="#f6e7c4"/>
      <circle cx="324" cy="343" r="2" fill="#241f1a"/>
      <circle cx="336" cy="343" r="2" fill="#241f1a"/>
    </g>
  </svg>`,

  /* 15. Timmins: underground gold mine tunnel view, looking up
     toward a tiny daylight at the surface. Rock walls converging
     with gold veins, a miner's lamp providing warm focal light. */
  timmins: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Underground gold mine tunnel in Timmins">
    <defs>
      <radialGradient id="lamp-tim" cx="0.5" cy="0.7" r="0.45">
        <stop offset="0"   stop-color="#dca33c" stop-opacity="0.65"/>
        <stop offset="1"   stop-color="#dca33c" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="surf-tim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#dca33c"/>
        <stop offset="1" stop-color="#c46f2c"/>
      </linearGradient>
    </defs>
    <!-- background: the tunnel mouth opens upward to the surface -->
    <rect width="800" height="360" fill="#0a0503"/>
    <!-- tiny surface visible at the top: gold sunset sky with tiny skyline -->
    <rect x="320" y="0" width="160" height="40" fill="url(#surf-tim)"/>
    <g fill="#241f1a">
      <rect x="340" y="20" width="14" height="20"/>
      <rect x="360" y="14" width="10" height="26"/>
      <rect x="378" y="22" width="12" height="18"/>
      <rect x="394" y="10" width="10" height="30"/>
      <rect x="410" y="20" width="12" height="20"/>
      <rect x="428" y="14" width="10" height="26"/>
      <rect x="446" y="22" width="12" height="18"/>
      <rect x="462" y="18" width="10" height="22"/>
    </g>
    <!-- ground at the surface (top of tunnel rim) -->
    <rect x="0"   y="40" width="320" height="20" fill="#3a2618"/>
    <rect x="480" y="40" width="320" height="20" fill="#3a2618"/>
    <!-- rock walls converging toward the surface (perspective shaft) -->
    <path d="M0 60 L320 60 L500 200 L0 360 Z" fill="#241f1a"/>
    <path d="M800 60 L480 60 L300 200 L800 360 Z" fill="#241f1a"/>
    <!-- rock face highlights (lighter) -->
    <path d="M0 70  L80 76  L160 130 L200 230 L120 320 L0 360 Z" fill="#3a2618" opacity=".75"/>
    <path d="M800 70 L720 76 L640 130 L600 230 L680 320 L800 360 Z" fill="#3a2618" opacity=".75"/>
    <!-- gold veins through the rock -->
    <g stroke="#dca33c" stroke-width="2" fill="none" opacity=".9">
      <path d="M40 120 L120 140 L60 180 L140 210"/>
      <path d="M40 240 L130 280 L80 320"/>
      <path d="M760 130 L680 160 L740 200 L660 230"/>
      <path d="M770 270 L700 310 L760 340"/>
    </g>
    <g fill="#f6e7c4">
      <circle cx="120" cy="142" r="1.6"/><circle cx="60"  cy="180" r="1.4"/>
      <circle cx="130" cy="280" r="1.6"/><circle cx="80"  cy="320" r="1.4"/>
      <circle cx="680" cy="160" r="1.4"/><circle cx="740" cy="200" r="1.6"/>
      <circle cx="700" cy="310" r="1.6"/><circle cx="760" cy="340" r="1.4"/>
    </g>
    <!-- soft warm halo from a lamp -->
    <rect width="800" height="360" fill="url(#lamp-tim)"/>
    <!-- miner's lamp: small lantern hanging in foreground -->
    <g>
      <line x1="400" y1="200" x2="400" y2="246" stroke="#241f1a" stroke-width="2"/>
      <rect x="378" y="246" width="44" height="10" fill="#241f1a"/>
      <rect x="382" y="256" width="36" height="36" fill="#241f1a"/>
      <rect x="386" y="260" width="28" height="28" fill="#dca33c"/>
      <circle cx="400" cy="274" r="9" fill="#f6e7c4"/>
      <rect x="378" y="292" width="44" height="6" fill="#241f1a"/>
    </g>
    <!-- chunk of ore on the tunnel floor -->
    <g>
      <ellipse cx="400" cy="346" rx="80" ry="10" fill="#0a0503"/>
      <path d="M360 332 L440 332 L460 346 L340 346 Z" fill="#3a2618"/>
      <g stroke="#dca33c" stroke-width="1.4" fill="none">
        <path d="M368 338 L398 340"/>
        <path d="M408 336 L444 342"/>
      </g>
    </g>
  </svg>`,

  /* 16. Cochrane: end of the line. A polar bear silhouette on the
     ice beside James Bay, the Polar Bear Express train in the
     distance, aurora overhead. */
  cochrane: ()=>`
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Polar bear and Polar Bear Express in Cochrane">
    <defs>
      <linearGradient id="sky-coch" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"   stop-color="#0c1430"/>
        <stop offset=".55" stop-color="#162a4a"/>
        <stop offset="1"   stop-color="#1f3d2d"/>
      </linearGradient>
      <linearGradient id="aurora-coch" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"   stop-color="#7ea29e" stop-opacity="0"/>
        <stop offset=".55" stop-color="#2a7d57" stop-opacity=".75"/>
        <stop offset="1"   stop-color="#a8c9a4" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="aurora2-coch" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0"   stop-color="#7d4b8a" stop-opacity="0"/>
        <stop offset=".55" stop-color="#7d4b8a" stop-opacity=".55"/>
        <stop offset="1"   stop-color="#7d4b8a" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#sky-coch)"/>
    <!-- stars -->
    <g fill="#f6e7c4">
      <circle cx="60"  cy="30"  r="1.4"/><circle cx="140" cy="50"  r="1"/>
      <circle cx="200" cy="20"  r="1.5"/><circle cx="280" cy="64"  r="1"/>
      <circle cx="360" cy="36"  r="1.3"/><circle cx="440" cy="22"  r="1.6"/>
      <circle cx="520" cy="68"  r="1"/><circle cx="600" cy="42"  r="1.4"/>
      <circle cx="680" cy="24"  r="1"/><circle cx="740" cy="58"  r="1.5"/>
    </g>
    <!-- aurora ribbons -->
    <path d="M40 30 Q200 180 380 90 Q520 30 760 160" stroke="url(#aurora-coch)" stroke-width="50" fill="none" opacity=".75"/>
    <path d="M80 110 Q260 220 460 130 Q620 60 780 220" stroke="url(#aurora2-coch)" stroke-width="36" fill="none" opacity=".55"/>
    <!-- distant pines on horizon -->
    <g fill="#0a1810">
      ${Array.from({length:22},(_,i)=>`<polygon points="${20+i*36},204 ${4+i*36},234 ${36+i*36},234"/>`).join('')}
    </g>
    <!-- Polar Bear Express train in mid-distance, heading right -->
    <g>
      <rect x="510" y="216" width="200" height="20" fill="#8e3d22"/>
      <rect x="710" y="220" width="20"  height="16" fill="#241f1a"/>
      <rect x="730" y="208" width="40"  height="28" fill="#8e3d22"/>
      <rect x="736" y="200" width="14"  height="10" fill="#241f1a"/>
      <g fill="#dca33c">
        ${Array.from({length:8},(_,i)=>`<rect x="${520+i*24}" y="222" width="10" height="6"/>`).join('')}
      </g>
      <g fill="#241f1a">
        ${Array.from({length:8},(_,i)=>`<circle cx="${528+i*24}" cy="240" r="4"/>`).join('')}
        <circle cx="720" cy="240" r="4"/>
        <circle cx="744" cy="240" r="4"/>
        <circle cx="762" cy="240" r="4"/>
      </g>
      <rect y="244" width="800" height="2" fill="#3a2618"/>
    </g>
    <!-- ice / James Bay water -->
    <path d="M0 252 Q400 244 800 256 V310 H0 Z" fill="#456f6c"/>
    <path d="M0 268 L800 268 V360 H0 Z" fill="#cfd9d6"/>
    <!-- ice crack lines -->
    <g stroke="#7ea29e" stroke-width="1" fill="none" opacity=".7">
      <path d="M40 300 L200 320 L120 354"/>
      <path d="M480 296 L620 332 L580 358"/>
    </g>
    <!-- polar bear silhouette on ice (front-left): big simple shape -->
    <g fill="#f3e6c8">
      <!-- body -->
      <path d="M120 302
               C 120 286 150 280 196 280
               C 240 280 268 286 268 308
               L 268 326
               L 240 326
               L 236 320
               L 226 320
               L 222 326
               L 176 326
               L 172 320
               L 162 320
               L 158 326
               L 138 326
               C 124 326 120 314 120 308 Z"/>
      <!-- head + snout -->
      <circle cx="106" cy="298" r="20"/>
      <path d="M86 296 L72 302 L86 308 Z"/>
      <!-- ear -->
      <circle cx="110" cy="282" r="6"/>
    </g>
    <!-- bear eye and nose -->
    <g fill="#241f1a">
      <circle cx="102" cy="294" r="1.6"/>
      <circle cx="78"  cy="302" r="2.2"/>
    </g>
  </svg>`
};

/* Dispatch: pick the unique scene by stop id, fall back to a tiny
   generic procedural scene only if the id is unknown (kept around
   so the function never throws on a typo). */
function stopArt(stop, index){
  const id = stop && stop.id;
  if(STOP_SCENES[id]) return STOP_SCENES[id]();
  return genericScene(index);
}

/* Tiny procedural fallback. Not used in production today (every
   stop has its own scene above) but ensures the call never returns
   empty if a new id is added without a matching scene. */
function genericScene(index){
  const t = (index||0) / Math.max(1, STOPS.length-1);
  return `
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Northern Ontario landscape">
    <defs>
      <linearGradient id="gen-${index}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#dca33c"/>
        <stop offset="1" stop-color="#2c5258"/>
      </linearGradient>
    </defs>
    <rect width="800" height="360" fill="url(#gen-${index})"/>
    <circle cx="${160+t*480}" cy="120" r="40" fill="#f6e7c4"/>
    <path d="M0 230 Q200 200 400 224 Q600 246 800 218 V300 H0 Z" fill="#1f3d2d"/>
    <rect y="300" width="800" height="60" fill="#6b4528"/>
  </svg>`;
}

/* Small per-card illustrated tile, used when a listing has no photo.
   A soft warm gradient in the site's poster palette with a clean
   centered category icon. A card without a photo still reads as
   intentional, never broken or empty.

   Palettes pair a light warm tone with a deeper companion from the
   same poster family. Icons are simple flat SVG shapes (fork, bed,
   pine, pin) in a contrasting cream or rust so they read clearly. */
function cardArt(cat, seed){
  const palettes = {
    restaurants:    {bg1:'#f6e7c4', bg2:'#c46f2c', ic:'#8e3d22'},
    accommodations: {bg1:'#f6e7c4', bg2:'#c89525', ic:'#6b4528'},
    parks:          {bg1:'#7ea29e', bg2:'#1f3d2d', ic:'#f3e6c8'},
    attractions:    {bg1:'#c46f2c', bg2:'#8e3d22', ic:'#f3e6c8'},
    shops:          {bg1:'#f6e7c4', bg2:'#b07a3a', ic:'#6b4528'}
  };
  const p = palettes[cat] || palettes.attractions;

  // 400 x 220 viewBox. Icons are centered around (200, 110).
  // All shapes are drawn as primitive SVG (rect, polygon, path).
  // No emoji or text glyphs, so rendering is identical on every
  // device and the icons stay crisp at any size.
  const icons = {
    // Dinner fork: three chunky prongs, a clearly wider bowl,
    // and a long handle. The thicker bowl is what distinguishes a
    // dinner fork from a tuning fork.
    restaurants: `
      <g fill="${p.ic}">
        <rect x="184" y="58"  width="6"  height="44" rx="2"/>
        <rect x="197" y="58"  width="6"  height="44" rx="2"/>
        <rect x="210" y="58"  width="6"  height="44" rx="2"/>
        <rect x="178" y="100" width="44" height="20" rx="7"/>
        <rect x="194" y="118" width="12" height="62" rx="5"/>
      </g>`,
    // Bed: two pillows, mattress, two stubby legs.
    accommodations: `
      <g fill="${p.ic}">
        <rect x="155" y="92"  width="42"  height="22" rx="5" opacity=".88"/>
        <rect x="203" y="92"  width="42"  height="22" rx="5" opacity=".88"/>
        <rect x="142" y="110" width="116" height="34" rx="6"/>
        <rect x="140" y="142" width="10"  height="22" rx="2"/>
        <rect x="250" y="142" width="10"  height="22" rx="2"/>
      </g>`,
    // Pine tree: three stacked triangles plus a short trunk.
    parks: `
      <g fill="${p.ic}">
        <polygon points="200,62 174,108 226,108"/>
        <polygon points="200,92 168,138 232,138"/>
        <polygon points="200,122 160,168 240,168"/>
        <rect x="195" y="168" width="10" height="14" opacity=".7"/>
      </g>`,
    // Map pin: rounded teardrop with a punched circle. The hole
    // uses the gradient's darker stop so it reads through to the
    // background instead of looking like a separate dot.
    attractions: `
      <path d="M200 60 C 222 60 240 78 240 100 C 240 134 200 180 200 180 C 200 180 160 134 160 100 C 160 78 178 60 200 60 Z" fill="${p.ic}"/>
      <circle cx="200" cy="98" r="11" fill="${p.bg2}"/>`,
    // Shopping bag: a trapezoid body with a rounded handle arc.
    shops: `
      <path d="M166 96 h68 l7 78 a8 8 0 0 1-8 9 H167 a8 8 0 0 1-8-9 Z" fill="${p.ic}"/>
      <path d="M184 96 a16 16 0 0 1 32 0" fill="none" stroke="${p.ic}" stroke-width="7" stroke-linecap="round"/>`
  };

  const sid = `cg${cat}${seed}`;
  return `
  <svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${sid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${p.bg1}"/>
        <stop offset="1" stop-color="${p.bg2}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="220" fill="url(#${sid})"/>
    <circle cx="60"  cy="40"  r="80" fill="#fff" opacity=".06"/>
    <circle cx="340" cy="190" r="90" fill="#000" opacity=".05"/>
    ${icons[cat] || icons.attractions}
  </svg>`;
}

/* Returns the markup for an image area. When a photo is set, the
   illustrated fallback always renders underneath it; on load error
   we just add `.img-failed` to the photo so CSS can fade it out
   over the fallback. This hides the moment of swap instead of
   snapping content, per the "blur to mask imperfect transitions"
   principle (crossfade is the same idea, simpler). */
function imageBlock(item, cat, seed, cls){
  const fallback = cardArt(cat, seed);
  /* Prefer Airtable photos (full URLs), then the static build image. */
  const hero = (item && Array.isArray(item.photos) && item.photos.length)
    ? item.photos[0]
    : (item && item.image);
  if(hero){
    /* Loading state is just the neutral grey background on the
       container (CSS). The illustrated fallback is hidden by
       default and only revealed when the photo fails to load
       (onerror flips both the img and the parent's class). */
    /* Not loading="lazy": on mobile the slab is rendered while
       display:none, and WebKit never loads lazy images inserted into
       a hidden subtree, leaving photos blank on phones/iPad. */
    return `<div class="${cls}">
      <div class="img-fallback">${fallback}</div>
      <img src="${hero}" alt="${item.name||''}" decoding="async"
           onerror="this.classList.add('img-failed');this.parentNode.classList.add('show-fallback')">
    </div>`;
  }
  /* No image at all on the listing: show the illustrated fallback
     immediately (no point in showing a grey loading state for a
     photo that does not exist). */
  return `<div class="${cls} show-fallback"><div class="img-fallback">${fallback}</div></div>`;
}

/* ------------------------------------------------------------------
   DETAIL IMAGE / GALLERY
   For the detail view: render a swipeable gallery when the listing
   has 2+ photos (images array), otherwise fall back to the regular
   single-image block. Markup is built statically; setupGallery
   wires up the touch swipe, prev/next buttons, and dot indicators
   after the panel is in the DOM.
------------------------------------------------------------------- */
function detailImageBlock(item, cat, seed){
  const fallback = cardArt(cat, seed);
  /* Prefer Airtable photos (full URLs); fall back to the static build
     images array. Both are used directly as image src values. The array
     order is preserved exactly with no resorting, so the first photo is
     the cover and the gallery follows the Airtable attachment order. */
  const photos = (item && Array.isArray(item.photos)) ? item.photos.filter(Boolean) : [];
  const imgs = photos.length
    ? photos
    : ((item && Array.isArray(item.images)) ? item.images.filter(Boolean) : []);
  /* Single image path: behaviour identical to imageBlock. The
     illustrated fallback is hidden by default and only revealed
     if the photo errors out. */
  if(imgs.length <= 1){
    const single = (imgs[0]) || (item && item.image) || null;
    if(single){
      return `<div class="detail-img">
        <div class="img-fallback">${fallback}</div>
        <img src="${single}" alt="${item.name||''}" decoding="async"
             onerror="this.classList.add('img-failed');this.parentNode.classList.add('show-fallback')">
      </div>`;
    }
    return `<div class="detail-img show-fallback"><div class="img-fallback">${fallback}</div></div>`;
  }
  /* Multi-image gallery. If the first slide errors, the parent
     gets show-fallback (since the first slide is what is visible
     on load). Once any later slide loads we will not undo it,
     but visually the loaded slide will sit on top. */
  const slides = imgs.map((src,i) => `
    <img class="gallery-slide" src="${src}" alt="${(item.name||'')+ ' photo ' + (i+1)}"
         loading="${i===0?'eager':'lazy'}" decoding="async"
         onerror="this.classList.add('img-failed');${i===0?"this.closest('.detail-img').classList.add('show-fallback');":''}">`).join('');
  const dots = imgs.map((_,i) =>
    `<button class="gallery-dot${i===0?' active':''}" type="button" data-idx="${i}" aria-label="Show photo ${i+1}"></button>`
  ).join('');
  return `<div class="detail-img gallery" data-len="${imgs.length}" data-idx="0">
    <div class="img-fallback">${fallback}</div>
    <div class="gallery-track">${slides}</div>
    <button class="gallery-prev" type="button" aria-label="Previous photo">${icon('arrow-left')}</button>
    <button class="gallery-next" type="button" aria-label="Next photo">${icon('arrow-right')}</button>
    <div class="gallery-dots">${dots}</div>
  </div>`;
}
function setupGallery(root){
  const gallery = (root||document).querySelector('.gallery');
  if(!gallery) return;
  const track = gallery.querySelector('.gallery-track');
  const prevBtn = gallery.querySelector('.gallery-prev');
  const nextBtn = gallery.querySelector('.gallery-next');
  const dots = gallery.querySelectorAll('.gallery-dot');
  const len = parseInt(gallery.dataset.len, 10) || 1;
  let idx = 0;
  function go(newIdx){
    if(newIdx < 0) newIdx = len - 1;
    if(newIdx >= len) newIdx = 0;
    idx = newIdx;
    track.style.transform = 'translateX(-' + (idx * 100) + '%)';
    dots.forEach((d,i) => d.classList.toggle('active', i === idx));
    gallery.dataset.idx = idx;
  }
  prevBtn && prevBtn.addEventListener('click', e => { e.stopPropagation(); go(idx - 1); });
  nextBtn && nextBtn.addEventListener('click', e => { e.stopPropagation(); go(idx + 1); });
  dots.forEach((d,i) => d.addEventListener('click', e => { e.stopPropagation(); go(i); }));
  /* Touch swipe (mobile). Ignore vertical scrolls and tiny taps. */
  let startX = 0, startY = 0;
  gallery.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  gallery.addEventListener('touchend', e => {
    const dx = startX - e.changedTouches[0].clientX;
    const dy = startY - e.changedTouches[0].clientY;
    if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)){
      go(idx + (dx > 0 ? 1 : -1));
    }
  });
}

/* ------------------------------------------------------------------
   CUSTOM ROUTE MAP (illustrated SVG ribbon)
   Replaces the previous Leaflet+OpenStreetMap raster tiles with a
   hand-drawn vertical poster of the route. Stations are numbered
   ink circles; the route is a rust-coloured dashed line; a small
   train ring sits at the currently-selected stop and snaps along
   the route when the user picks a different chip. Click handlers
   on each station call openMapPreview() (the existing site-styled
   card flow), so the tap-to-preview UX is unchanged.

   Coordinate projection (lat/lng -> SVG):
     y = 880 - (lat - 43.6) * 145    (north = top)
     x = 200 + (lng + 80)  * 65      (slight east-west wobble)
   The SVG viewBox is 400 x 900; the container is responsive.
------------------------------------------------------------------- */
const ROUTE_VIEW = { w: 400, h: 900 };
function routeXY(stop){
  return {
    x: +(200 + (stop.lng + 80) * 65).toFixed(1),
    y: +(880 - (stop.lat - 43.6) * 145).toFixed(1)
  };
}

function buildRouteMap(){
  const pts = STOPS.map(s => Object.assign({ s }, routeXY(s)));

  /* Smooth-ish route line: connect each pair of stations with a
     quadratic curve through their midpoint, so the path has a
     hand-drawn quality instead of straight segments. */
  let d = `M${pts[0].x} ${pts[0].y}`;
  for(let i=1; i<pts.length; i++){
    const a = pts[i-1], b = pts[i];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    d += ` Q${a.x} ${a.y} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  d += ` L${pts[pts.length-1].x} ${pts[pts.length-1].y}`;

  const stations = pts.map((p,i) => `
    <g class="route-station" data-id="${p.s.id}" tabindex="0"
       role="button" aria-label="${p.s.name}, stop ${i+1}"
       transform="translate(${p.x}, ${p.y})">
      <circle class="route-halo" r="22"/>
      <circle class="route-dot" r="13"/>
      <text class="route-num" y="4" text-anchor="middle">${i+1}</text>
      <text class="route-label" x="20" y="4">${p.s.name}</text>
    </g>`).join('');

  /* Small decorative ink-textured tree clusters in the middle
     stretch so the empty cream paper does not feel sterile. */
  const trees = Array.from({length: 26}, (_,i) => {
    const tx = 30 + ((i * 73) % 340);
    const ty = 180 + ((i * 47) % 540);
    return `<polygon points="${tx},${ty} ${tx-5},${ty+9} ${tx+5},${ty+9}"/>`;
  }).join('');

  const first = pts[0];
  return `
    <svg viewBox="0 0 ${ROUTE_VIEW.w} ${ROUTE_VIEW.h}"
         preserveAspectRatio="xMidYMid meet"
         xmlns="http://www.w3.org/2000/svg"
         class="routemap-svg" role="img"
         aria-label="Illustrated map of the Northlander route, Toronto to Cochrane">

      <!-- Paper background -->
      <rect width="${ROUTE_VIEW.w}" height="${ROUTE_VIEW.h}" fill="#f6ecd2"/>

      <!-- James Bay hint at the top -->
      <path d="M0 0 Q120 38 200 24 Q300 18 400 0 L400 64 Q300 86 200 70 Q100 88 0 60 Z"
            fill="#7ea29e" opacity="0.32"/>
      <text x="200" y="42" text-anchor="middle"
            font-family="Fraunces, serif" font-style="italic"
            font-size="11" fill="#2c5258" letter-spacing="1">James Bay</text>

      <!-- Faint forest texture in the middle of the route -->
      <g fill="#1f3d2d" opacity="0.10">${trees}</g>

      <!-- Lake Ontario at the bottom -->
      <path d="M0 868 Q200 858 400 868 L400 900 L0 900 Z"
            fill="#456f6c" opacity="0.55"/>
      <text x="200" y="893" text-anchor="middle"
            font-family="Fraunces, serif" font-style="italic"
            font-size="11" fill="#f3e6c8" letter-spacing="1">Lake Ontario</text>

      <!-- Route line (rust, dashed) -->
      <path d="${d}" fill="none" stroke="#8e3d22"
            stroke-width="3.5" stroke-linecap="round"
            stroke-dasharray="2 7" opacity="0.85"/>

      <!-- Stations -->
      ${stations}

      <!-- Train ring at the active stop (snaps when user selects) -->
      <g class="route-train" transform="translate(${first.x}, ${first.y})" aria-hidden="true">
        <circle r="26" fill="#8e3d22" opacity="0.12"/>
        <circle r="20" fill="none" stroke="#8e3d22" stroke-width="2.5"/>
        <circle r="14.5" fill="none" stroke="#f6ecd2" stroke-width="1.5"/>
      </g>

      <!-- Compass / north indicator -->
      <g transform="translate(360, 90)" font-family="Fraunces, serif">
        <circle r="20" fill="#f3e6c8" stroke="#8e3d22" stroke-width="1.5"/>
        <text y="0" text-anchor="middle" font-size="16" font-weight="900" fill="#8e3d22">N</text>
        <text y="13" text-anchor="middle" font-size="6" fill="#6b4528" letter-spacing="2">NORTH</text>
      </g>
    </svg>`;
}

function updateRouteTrain(stopId){
  const train = document.querySelector('.route-train');
  if(!train) return;
  const stop = STOPS.find(s => s.id === stopId);
  if(!stop) return;
  const { x, y } = routeXY(stop);
  train.setAttribute('transform', `translate(${x}, ${y})`);
}

function initMap(){
  const host = document.getElementById('routemap');
  if(!host) return;
  host.innerHTML = buildRouteMap();
  /* Click + Enter/Space on a station opens the existing site
     preview card. The station is the focusable element with
     role=button. */
  host.querySelectorAll('.route-station').forEach(g => {
    const open = () => {
      const s = STOPS.find(x => x.id === g.dataset.id);
      if(s) openMapPreview(s);
    };
    g.addEventListener('click', open);
    g.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        open();
      }
    });
  });
  /* Click on the map background (away from a station) closes the
     preview, matching the previous Leaflet behaviour. */
  host.addEventListener('click', e => {
    if(!e.target.closest('.route-station')) closeMapPreview();
  });
  /* Park the train ring at whichever stop is currently active. */
  if(activeStop && activeStop.id) updateRouteTrain(activeStop.id);
}

/* ------------------------------------------------------------------
   STOP CHIPS
------------------------------------------------------------------- */
function renderChips(filter=''){
  const wrap = document.getElementById('stopChips');
  const f = filter.trim().toLowerCase();
  const list = STOPS.filter(s =>
    !f || s.name.toLowerCase().includes(f) || s.region.toLowerCase().includes(f));
  if(!list.length){ wrap.innerHTML = `<div class="empty">No stop matches \u201C${filter}\u201D.</div>`; return; }
  wrap.innerHTML = list.map(s=>{
    const i = STOPS.indexOf(s);
    return `<button class="chip ${s.id===activeStop.id?'active':''}" data-id="${s.id}">
      <span class="ord">${i+1}</span>${s.name}</button>`;
  }).join('');
  wrap.querySelectorAll('.chip').forEach(b=>b.addEventListener('click',()=>selectStop(b.dataset.id)));
}

/* ------------------------------------------------------------------
   STOP PANEL: list view, or detail view if activeDetail is set
------------------------------------------------------------------- */
function renderStop(){
  /* Tag the slab so CSS can hide the "Back to route" bar while a
     single listing detail is open (the detail's own "Back to
     <stop>" bar takes over), giving one clear back button per
     level on mobile. */
  const slab = document.getElementById('slab');
  if(slab) slab.classList.toggle('detail-listing', activeDetail !== null);
  if(activeDetail !== null){ renderDetail(); return; }
  const s = activeStop;
  const i = STOPS.indexOf(s);
  // Each of the 16 stops has its own poster scene keyed by id in
  // STOP_SCENES. stopArt() dispatches and falls back to a generic
  // landscape only if the id is unknown.
  const heroArt = stopArt(s, i);
  document.getElementById('stopPanel').innerHTML = `
    <div class="stop" data-stop="${s.id}">
      <div class="reveal">
        <div class="stop-hero">
          <div class="ord-badge">${i+1}</div>
          ${ s.image
              ? `<img class="stop-photo" src="${s.image}" alt="${s.name}"
                   fetchpriority="high" decoding="async"
                   onerror="this.outerHTML='<div class=&quot;stop-art&quot;>'+document.getElementById('art${i}').innerHTML+'</div>'">
                 <div id="art${i}" style="display:none">${heroArt}</div>`
              : heroArt }
          <div class="label">
            <div class="region">${s.region}</div>
            <h3>${s.name}</h3>
            <div class="hook">${s.hook}</div>
          </div>
        </div>
      </div>
      <div class="stop-meta">
        <span class="pill"><b>From Toronto:</b> ${s.time}</span>
        <span class="pill"><b>Stop:</b> ${i+1} of ${STOPS.length}</span>
      </div>
      <p class="stop-blurb">${s.blurb}</p>
      <div class="share-row">
        <button data-share="copy">${icon('link')}Copy link to this stop</button>
        <button data-share="x">${icon('share')}Share</button>
      </div>
      <div class="catfilter" id="catFilter">
        ${CATS.map(c=>{
          const count=(s[c.key]||[]).length;
          return `<button data-cat="${c.key}" class="${c.key===activeCat?'active':''}">
            <span class="ic">${icon(c.ic)}</span>${c.label}<span class="cnt">${count}</span></button>`;
        }).join('')}
      </div>
      <div class="sort-bar" id="sortBar" role="toolbar" aria-label="Sort and filter listings">
        <span class="sort-label">Show</span>
        ${hasFeaturedListings(s, activeCat) ? `<button class="sort-pill${activeSort==='featured'?' active':''}" data-sort="featured" type="button">
          <i class="ph-light ph-star" aria-hidden="true"></i><span>Featured</span></button>` : ''}
        <button class="sort-pill${activeSort==='closest'?' active':''}" data-sort="closest" type="button">
          <i class="ph-light ph-person-simple-walk" aria-hidden="true"></i><span>Closest</span></button>
        <button class="sort-pill${activeSort==='rated'?' active':''}" data-sort="rated" type="button">
          <i class="ph-light ph-trophy" aria-hidden="true"></i><span>Top Rated</span></button>
        <span class="sort-divider" aria-hidden="true"></span>
        <button class="deals-pill${activeDealsOnly?' active':''}" data-filter="deals" type="button" aria-pressed="${activeDealsOnly}">
          <i class="ph-light ph-tag" aria-hidden="true"></i><span>Local Deals</span></button>
      </div>
      <div class="cat-header">
        <img src="${CAT_HEADER_IMG[activeCat]||''}" alt="${catLabel(activeCat)}" decoding="async"
             onerror="this.closest('.cat-header').classList.add('img-failed')">
        <div class="cat-header-label">${catLabel(activeCat)}</div>
      </div>
      <div class="cards" id="cards"></div>
    </div>`;
  document.querySelectorAll('#catFilter button').forEach(b=>
    b.addEventListener('click',()=>{activeCat=b.dataset.cat;activeDetail=null;renderStop();}));
  document.querySelectorAll('[data-share]').forEach(b=>
    b.addEventListener('click',()=>shareCurrent(b.dataset.share)));
  document.querySelectorAll('#sortBar .sort-pill').forEach(b=>
    b.addEventListener('click',()=>{
      activeSort=b.dataset.sort;
      document.querySelectorAll('#sortBar .sort-pill').forEach(x=>x.classList.toggle('active',x.dataset.sort===activeSort));
      renderCards();
    }));
  const dealsBtn=document.querySelector('#sortBar .deals-pill');
  if(dealsBtn) dealsBtn.addEventListener('click',()=>{
    activeDealsOnly=!activeDealsOnly;
    dealsBtn.classList.toggle('active',activeDealsOnly);
    dealsBtn.setAttribute('aria-pressed',String(activeDealsOnly));
    renderCards();
  });
  renderCards();
  observeReveals();
}

/* Combined list of listings for the currently active stop +
   category. Filled Featured slots from the curated data.js come
   first, followed by the organic Google Places listings. Empty
   Featured slots (name === '') are skipped, so the placeholder
   blocks in data.js stay invisible until a paid listing is
   inserted. The Local Deals filter and the active sort are applied
   on top before returning. */
function parseRatingNum(r){
  if (r == null || r === 'NR') return -Infinity;
  const n = parseFloat(r);
  return isNaN(n) ? -Infinity : n;
}
/* True if the stop+category has at least one Featured slot filled by a
   paid listing (curated in data.js) or any organic listing flagged
   featured in Airtable. Used to hide the Featured sort pill until the
   first business actually buys into the Featured tier. */
function hasFeaturedListings(stop, catKey){
  const slot = (stop.featured && stop.featured[catKey] || []);
  if (slot.some(it => it && it.name && it.name.trim())) return true;
  const organic = stop[catKey] || [];
  return organic.some(it => it && it.featured === true);
}
function applyFilterSort(arr){
  let out = arr;
  if (activeDealsOnly) out = out.filter(it => it && it.discountOffered === true);
  if (activeSort === 'closest') {
    out = out.slice().sort((a, b) => {
      const aw = (typeof a.walkMins === 'number') ? a.walkMins : Infinity;
      const bw = (typeof b.walkMins === 'number') ? b.walkMins : Infinity;
      return aw - bw;
    });
  } else if (activeSort === 'rated') {
    out = out.slice().sort((a, b) => parseRatingNum(b.rating) - parseRatingNum(a.rating));
  }
  return out;
}
function listingsForActive(){
  const featured = (activeStop.featured && activeStop.featured[activeCat] || [])
    .filter(it => it && it.name && it.name.trim());
  const organic = activeStop[activeCat] || [];
  return applyFilterSort(featured.concat(organic));
}

/* Shared markup for a single listing tile (used by the directory
   grid and by the "More near X" grid inside the detail view). */
function cardMarkup(it, idx, imgCls){
  const walk = walkFromStation(activeStop, it);
  const hrs = formatHours(it.hours);
  const ratingHtml = (!it.rating || it.rating === 'NR')
    ? 'New'
    : icon('star') + Number(it.rating).toFixed(1);
  const blurb = (it.desc && it.desc.trim()) ? it.desc : '';
  return `
    <div class="reveal">
      <button class="card${it.featured ? ' card-featured' : ''}" data-idx="${idx}">
        ${imageBlock(it, activeCat, idx, imgCls)}
        <div class="card-body">
          <div class="toprow">
            <span class="tag${it.featured ? ' tag-featured' : ''}">${tagFor(it)}</span>
            ${ratingHtml ? `<span class="rating">${ratingHtml}</span>` : ''}
          </div>
          <h4>${it.name}</h4>
          ${it.address ? `<div class="desc">${it.address}</div>` : ''}
          ${blurb ? `<p class="description">${blurb}</p>` : ''}
          ${walk ? `<div class="walk-line">${icon('pin')}${walk}</div>` : ''}
          ${it.discountOffered ? `<span class="discount-badge">${icon('tag')}Discount</span>` : ''}
          ${hrs ? `<div class="hours-line">${icon('clock')}${hrs}</div>` : ''}
          <span class="card-cta">View details ${icon('arrow-right')}</span>
        </div>
      </button>
      <a href="/stops/${activeStop.id}" class="stop-page-link"><i class="ph-light ph-map-pin icon-sm" aria-hidden="true"></i> Explore ${activeStop.name}</a>
    </div>`;
}

function renderCards(){
  const items = listingsForActive();
  const wrap = document.getElementById('cards');
  if(!items.length){
    const msg = activeDealsOnly
      ? 'No local deals in this category yet. Toggle Local Deals off to see all listings.'
      : 'No listings here yet.';
    wrap.innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }
  wrap.innerHTML = items.map((it,idx)=>cardMarkup(it, idx, 'card-img')).join('');
  wrap.querySelectorAll('.card').forEach(c=>
    c.addEventListener('click',()=>openDetail(parseInt(c.dataset.idx,10))));
  observeReveals();
}

/* Build a Google Maps URL for a listing. When the listing carries
   coordinates (lat/lng from the Places backend) it opens turn-by-turn
   directions; otherwise it falls back to a name + description search.
   The maps.google.com links open the Maps app on mobile and a new
   browser tab on desktop. */
function mapsUrl(it){
  if(it && it.lat != null && it.lng != null){
    return 'https://www.google.com/maps/dir/?api=1&destination='
      + encodeURIComponent(it.lat + ',' + it.lng);
  }
  const query = [it && it.name, it && it.address].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
}

/* ------------------------------------------------------------------
   DETAIL VIEW: one listing, back button, more cards below
------------------------------------------------------------------- */
function renderDetail(){
  const items = listingsForActive();
  const it = items[activeDetail];
  if(!it){ activeDetail=null; renderStop(); return; }
  const others = items.map((x,i)=>({x,i})).filter(o=>o.i!==activeDetail);
  const walk = walkFromStation(activeStop, it);
  const hrs = formatHours(it.hours);
  const ratingHtml = (!it.rating || it.rating === 'NR')
    ? 'New'
    : icon('star') + Number(it.rating).toFixed(1);

  document.getElementById('stopPanel').innerHTML = `
    <div class="stop detail" data-stop="${activeStop.id}">
      <button class="backbtn" id="backBtn">${icon('arrow-left')}Back to ${activeStop.name}</button>
      <div class="detail-hero">
        ${detailImageBlock(it, activeCat, activeDetail)}
      </div>
      <div class="detail-body">
        <div class="toprow">
          <span class="tag${it.featured ? ' tag-featured' : ''}">${tagFor(it)}</span>
          ${ratingHtml ? `<span class="rating">${ratingHtml}</span>` : ''}
        </div>
        <h3>${it.name}</h3>
        ${walk ? `<div class="walk-line">${icon('pin')}${walk}</div>` : ''}
        ${hrs ? `<div class="hours-line">${icon('clock')}${hrs}</div>` : ''}
        ${it.discountOffered && it.discountDetails ? `<div class="discount-line">${icon('tag')}${it.discountDetails}</div>` : ''}
        <div class="action-row">
          ${it.website ? `<a class="action-btn" href="${it.website}" target="_blank" rel="noopener" aria-label="Visit ${it.name} website">${icon('globe')}<span class="action-label">Website</span></a>` : ''}
          ${it.phone ? `<a class="action-btn" href="tel:${it.phone.replace(/[^\d+]/g,'')}" aria-label="Call ${it.name}">${icon('phone')}<span class="action-label">Call</span></a>` : ''}
          <a class="action-btn" href="${mapsUrl(it)}" target="_blank" rel="noopener" aria-label="Open ${it.name} in Google Maps">${icon('pin')}<span class="action-label">Map</span></a>
        </div>
        <div class="detail-loc">${icon('pin')} ${it.address ? it.address : catLabel(activeCat) + ' \u00B7 ' + activeStop.name + ', ' + activeStop.region}</div>
        ${it.desc ? `<p class="detail-desc">${it.desc}</p>` : ''}
        <div class="share-row">
          <button data-share="copy">${icon('link')}Copy link</button>
          <button data-share="x">${icon('share')}Share</button>
        </div>
      </div>
      ${ others.length ? `
        <div class="more">
          <h4 class="more-head">More ${catLabel(activeCat).toLowerCase()} near ${activeStop.name}</h4>
          <div class="cards" id="moreCards"></div>
        </div>` : '' }
    </div>`;

  document.getElementById('backBtn').addEventListener('click',()=>{
    activeDetail=null; renderStop();
    /* Restore the visitor's scroll position from before they opened
       this detail view. Wait one frame so the new list DOM is in
       place before we set scrollY. */
    requestAnimationFrame(()=>window.scrollTo({top: savedScrollY, behavior: 'auto'}));
  });
  document.querySelectorAll('[data-share]').forEach(b=>
    b.addEventListener('click',()=>shareCurrent(b.dataset.share)));

  const mc = document.getElementById('moreCards');
  if(mc){
    mc.innerHTML = others.map(o=>cardMarkup(o.x, o.i, 'card-img')).join('');
    mc.querySelectorAll('.card').forEach(c=>
      c.addEventListener('click',()=>openDetail(parseInt(c.dataset.idx,10))));
  }
  /* Wire up the swipeable gallery in the detail hero, if there is one. */
  setupGallery(document.getElementById('stopPanel'));
  observeReveals();
}

function openDetail(idx){
  /* Save the current scroll so the back button in the detail view
     can restore exactly where the user was in the list. */
  savedScrollY = window.scrollY;
  activeDetail = idx;
  renderStop();
  const it = listingsForActive()[idx];
  if(it) history.replaceState(null,'','#stop='+activeStop.id+'&cat='+activeCat+'&place='+slug(it.name));
  /* Scroll the stop nav (rail + slab) to the top so the detail's
     back bar and image are in view. The old #explore section no
     longer exists after the rail/slab rebuild. */
  const target = document.getElementById('stopnav');
  if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
}

/* ------------------------------------------------------------------
   EVENTS - route-wide grid, grouped by month
   Pulls all approved events from window.EVENTS_DATA across every
   stop, sorts by start date, groups by "Month YYYY", with recurring
   events surfaced as their own section at the bottom. Idempotent:
   safe to call multiple times.
------------------------------------------------------------------- */
function escHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

function formatEventDate(ev){
  if(!ev.startDate) return ev.recurring ? (ev.recurrencePattern || 'Recurring') : '';
  const fmt = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m-1, d));
    return dt.toLocaleDateString('en-CA', { month:'short', day:'numeric', timeZone:'UTC' });
  };
  const start = fmt(ev.startDate);
  const end = ev.endDate && ev.endDate !== ev.startDate ? ' - ' + fmt(ev.endDate) : '';
  const time = ev.startTime ? ', ' + ev.startTime : '';
  return start + end + time;
}

function monthKeyForEvent(ev){
  if(!ev.startDate) return 'recurring';
  const [y, m] = ev.startDate.split('-').map(Number);
  return y * 100 + m;
}

/* Every month an event spans, from Start Date through End Date. A
   May-Sept run returns [202605, 202606, 202607, 202608, 202609]. Used
   for both filter matching ("show me everything happening in July",
   even if it started in May) and for month-chip discovery so a chip
   appears for every relevant month. */
function monthKeysForEvent(ev){
  if(!ev.startDate) return [];
  const [sy, sm] = ev.startDate.split('-').map(Number);
  const endIso = ev.endDate || ev.startDate;
  const [ey, em] = endIso.split('-').map(Number);
  const keys = [];
  let y = sy, m = sm;
  /* Hard guard on a runaway loop in case bad data lands a > 5-year
     span: cap at 60 iterations and stop. */
  for (let i = 0; i < 60; i++) {
    keys.push(y * 100 + m);
    if (y > ey || (y === ey && m >= em)) break;
    m++;
    if (m > 12) { y++; m = 1; }
  }
  return keys;
}

function monthLabel(key){
  const y = Math.floor(key / 100);
  const m = key % 100;
  const dt = new Date(Date.UTC(y, m-1, 1));
  return dt.toLocaleDateString('en-CA', { month:'long', year:'numeric', timeZone:'UTC' });
}

function eventCardHtml(ev){
  const when = formatEventDate(ev);
  const link = ev.eventUrl || ev.ticketUrl || '';
  const tag  = link ? 'a' : 'div';
  const href = link ? ` href="${escHtml(link)}" target="_blank" rel="noopener"` : '';
  const priceLabel = ev.free ? 'Free' : (ev.price || '');
  const stopName = ev.stop || '';
  const walk = (typeof ev.walkMins === 'number')
    ? `<span class="hev-walk"><i class="ph-light ph-person-simple-walk" aria-hidden="true"></i> ${ev.walkMins} min walk</span>`
    : '';
  const family = ev.familyFriendly
    ? `<span class="hev-family" aria-label="Family friendly"><i class="ph-light ph-users-three" aria-hidden="true"></i> Family friendly</span>`
    : '';
  /* Walk + family sit on a single meta row beneath the description.
     The row only renders when at least one badge is present. */
  const metaRow = (walk || family)
    ? `<div class="hev-meta">${walk}${family}</div>`
    : '';
  return `<${tag} class="hev-card"${href}>
    ${ev.imageUrl
      ? `<div class="hev-img" style="background-image:url('${escHtml(ev.imageUrl)}')"></div>`
      : `<div class="hev-img hev-img--blank"><i class="ph-light ph-calendar" aria-hidden="true"></i></div>`}
    <div class="hev-body">
      ${when ? `<div class="hev-when">${escHtml(when)}</div>` : ''}
      <h4 class="hev-name">${escHtml(ev.name)}</h4>
      <div class="hev-stop">${escHtml(stopName)}${ev.venue ? ` \u00B7 ${escHtml(ev.venue)}` : ''}</div>
      ${ev.description ? `<p class="hev-desc">${escHtml(ev.description)}</p>` : ''}
      ${metaRow}
      <div class="hev-foot">
        ${priceLabel ? `<span class="hev-price">${escHtml(priceLabel)}</span>` : '<span></span>'}
        ${link ? `<span class="hev-cta">More info <i class="ph-light ph-arrow-up-right" aria-hidden="true"></i></span>` : ''}
      </div>
    </div>
  </${tag}>`;
}

/* The nine Airtable categories. Order matches the picker so the
   chip / dropdown reads the same as the submission form. */
const EVENT_CATEGORIES = [
  'Music & Live Performance', 'Food & Drink', 'Outdoor & Adventure',
  'Arts & Culture', 'Festivals & Fairs', 'Markets & Shopping',
  'Sports & Recreation', 'Community & Family', 'History & Heritage'
];

/* Filter state for the homepage event grid. Reset when "All" is
   clicked on every dimension. */
window.eventFilters = window.eventFilters || {
  month: 'all',     // 'all' | numeric key (YYYYMM) | 'recurring'
  category: 'all',  // 'all' | one of EVENT_CATEGORIES
  price: 'all',     // 'all' | 'free' | 'paid'
  walk: 'all',      // 'all' | 15 | 30 | 60
  page: 1           // 1-indexed current page of dated events
};

const HEV_PAGE_SIZE = 9;

/* Smart page list: show all when <= 7 total. Otherwise compress with
   ellipsis around the current page so the bar stays one line. */
function eventsPageList(current, total) {
  if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const ordered = Array.from(pages).filter(n => n >= 1 && n <= total).sort((a,b) => a-b);
  const out = [];
  for (let i = 0; i < ordered.length; i++) {
    if (i && ordered[i] - ordered[i-1] > 1) out.push('...');
    out.push(ordered[i]);
  }
  return out;
}

function eventsPaginationHtml(current, total) {
  if (total <= 1) return '';
  const items = eventsPageList(current, total);
  const btns = items.map(p => {
    if (p === '...') return '<span class="hev-pageellipsis">...</span>';
    return `<button type="button" class="hev-pagebtn${p === current ? ' is-active' : ''}" data-page="${p}">${p}</button>`;
  }).join('');
  return `<nav class="hev-pagination" aria-label="Event pagination">
    <button type="button" class="hev-pagebtn hev-pagenav" data-page="${current - 1}" ${current === 1 ? 'disabled' : ''} aria-label="Previous page">
      <i class="ph-light ph-caret-left" aria-hidden="true"></i> Prev
    </button>
    ${btns}
    <button type="button" class="hev-pagebtn hev-pagenav" data-page="${current + 1}" ${current === total ? 'disabled' : ''} aria-label="Next page">
      Next <i class="ph-light ph-caret-right" aria-hidden="true"></i>
    </button>
  </nav>`;
}

function eventMatchesFilters(ev, f) {
  if (f.month !== 'all') {
    if (f.month === 'recurring') {
      if (!(ev.recurring || !ev.startDate)) return false;
    } else {
      if (ev.recurring || !ev.startDate) return false;
      /* Multi-month events appear in every month they span, not just
         their start month. An event running May through September
         shows up under June / July / August chips too. */
      if (!monthKeysForEvent(ev).includes(f.month)) return false;
    }
  }
  if (f.category !== 'all' && ev.category !== f.category) return false;
  if (f.price === 'free' && !ev.free) return false;
  if (f.price === 'paid' && ev.free) return false;
  if (f.walk !== 'all') {
    if (typeof ev.walkMins !== 'number') return false;
    if (ev.walkMins > f.walk) return false;
  }
  return true;
}

function eventsFilterBarHtml(allEvents, f) {
  /* Build the set of month keys that actually have events, sorted asc.
     Includes every month an event spans (not just start month) so a
     chip appears for every relevant month of long-running events.
     Recurring is its own pseudo-month chip when present. */
  const monthSet = new Set();
  let hasRecurring = false;
  for (const ev of allEvents) {
    if (ev.recurring || !ev.startDate) { hasRecurring = true; continue; }
    for (const k of monthKeysForEvent(ev)) monthSet.add(k);
  }
  const monthKeys = Array.from(monthSet).sort((a,b)=>a-b);

  const monthShort = key => {
    const y = Math.floor(key/100), m = key%100;
    return new Date(Date.UTC(y, m-1, 1)).toLocaleDateString('en-CA', {month:'short', timeZone:'UTC'});
  };
  const chip = (group, value, label, active) =>
    `<button type="button" class="hev-chip${active ? ' is-active' : ''}" data-filter-group="${group}" data-filter-value="${escHtml(String(value))}">${escHtml(label)}</button>`;

  const monthChips = [chip('month', 'all', 'Any time', f.month === 'all')]
    .concat(monthKeys.map(k => chip('month', k, monthShort(k), f.month === k)))
    .concat(hasRecurring ? [chip('month', 'recurring', 'Recurring', f.month === 'recurring')] : [])
    .join('');

  const categoryOpts = ['<option value="all">Any category</option>']
    .concat(EVENT_CATEGORIES.map(c => `<option value="${escHtml(c)}"${f.category === c ? ' selected' : ''}>${escHtml(c)}</option>`))
    .join('');

  const priceChips = [
    chip('price', 'all', 'Any', f.price === 'all'),
    chip('price', 'free', 'Free', f.price === 'free'),
    chip('price', 'paid', 'Paid', f.price === 'paid')
  ].join('');

  const walkChips = [
    chip('walk', 'all', 'Any', f.walk === 'all'),
    chip('walk', 15, 'Under 15 min', f.walk === 15),
    chip('walk', 30, 'Under 30 min', f.walk === 30),
    chip('walk', 60, 'Under 1 hr', f.walk === 60)
  ].join('');

  const anyActive = f.month !== 'all' || f.category !== 'all' || f.price !== 'all' || f.walk !== 'all';

  return `
    <div class="hev-filters" id="eventFilters">
      <div class="hev-filters-head">
        <h3 class="hev-filters-title">Find events</h3>
        ${anyActive ? `<button type="button" class="hev-reset" id="eventFiltersReset"><i class="ph-light ph-x" aria-hidden="true"></i> Clear filters</button>` : ''}
      </div>

      <section class="hev-filter-section hev-filter-section--full">
        <div class="hev-filter-section-label">
          <i class="ph-light ph-calendar-blank" aria-hidden="true"></i>
          <span>When</span>
        </div>
        <div class="hev-chip-row">${monthChips}</div>
      </section>

      <div class="hev-filter-grid">
        <section class="hev-filter-section">
          <div class="hev-filter-section-label">
            <i class="ph-light ph-tag" aria-hidden="true"></i>
            <span>What</span>
          </div>
          <select class="hev-select" id="eventCategorySelect">${categoryOpts}</select>
        </section>

        <section class="hev-filter-section">
          <div class="hev-filter-section-label">
            <i class="ph-light ph-currency-circle-dollar" aria-hidden="true"></i>
            <span>Price</span>
          </div>
          <div class="hev-chip-row">${priceChips}</div>
        </section>

        <section class="hev-filter-section">
          <div class="hev-filter-section-label">
            <i class="ph-light ph-person-simple-walk" aria-hidden="true"></i>
            <span>Walk time</span>
          </div>
          <div class="hev-chip-row">${walkChips}</div>
        </section>
      </div>
    </div>`;
}

/* Sort an array of events: featured first, then start date asc, then
   name. Used for both the flat dated list and each month bucket. */
function sortEventsList(arr) {
  return arr.sort((a,b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    const ad = a.startDate || '9999-12-31';
    const bd = b.startDate || '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });
}

/* Render a filtered + paginated event set into `target`. Recurring
   events live outside the page window so they are always visible at
   the bottom; only the dated events paginate. Returns the page count
   needed for pagination controls. */
function renderEventsGridInto(target, events, page, activeMonthFilter) {
  const dated = [];
  const recurring = [];
  for (const ev of events) {
    if (ev.recurring || !ev.startDate) recurring.push(ev);
    else dated.push(ev);
  }
  sortEventsList(dated);
  sortEventsList(recurring);

  const totalPages = Math.max(1, Math.ceil(dated.length / HEV_PAGE_SIZE));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const slice = dated.slice((clamped - 1) * HEV_PAGE_SIZE, clamped * HEV_PAGE_SIZE);

  /* Bucket key: if the user picked a specific month, use that month
     as the header for every event in the slice (multi-month events
     get listed under the chosen month). With no month filter, use the
     event's start month so the timeline reads naturally. */
  const buckets = new Map();
  for (const ev of slice) {
    const k = (typeof activeMonthFilter === 'number') ? activeMonthFilter : monthKeyForEvent(ev);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(ev);
  }
  const monthKeys = Array.from(buckets.keys()).sort((a,b) => a - b);

  const monthsHtml = monthKeys.map(k => `
    <div class="hev-month">
      <h3 class="hev-month-label">${escHtml(monthLabel(k))}</h3>
      <div class="hev-grid">${buckets.get(k).map(eventCardHtml).join('')}</div>
    </div>
  `).join('');
  const recurringHtml = recurring.length ? `
    <div class="hev-month">
      <h3 class="hev-month-label">Ongoing &amp; Recurring</h3>
      <div class="hev-grid">${recurring.map(eventCardHtml).join('')}</div>
    </div>
  ` : '';
  target.innerHTML = monthsHtml + recurringHtml + eventsPaginationHtml(clamped, totalPages);
  return { totalPages, page: clamped };
}

function renderEvents(){
  const wrap = document.getElementById('eventPanel');
  if(!wrap) return;

  /* Flatten every stop's events into a single array. window.EVENTS_DATA
     is keyed by stop slug, each value is an array of event objects. */
  const data = window.EVENTS_DATA || {};
  const all = [];
  for (const sid of Object.keys(data)) {
    for (const ev of (data[sid] || [])) all.push(ev);
  }

  if(!all.length){
    wrap.innerHTML = `<div class="hev-empty">
      <i class="ph-light ph-calendar" aria-hidden="true"></i>
      <p>No events listed yet. Know about something happening along the route?</p>
      <a href="#submit-event">Submit an event</a>
    </div>`;
    return;
  }

  /* First render: filter bar + grid container. Subsequent filter
     changes only touch #eventGrid so the bar's interaction state is
     preserved. */
  const filtered = all.filter(ev => eventMatchesFilters(ev, window.eventFilters));
  wrap.innerHTML = eventsFilterBarHtml(all, window.eventFilters)
    + '<div id="eventGrid">'
    + (filtered.length
        ? ''
        : `<div class="hev-empty"><i class="ph-light ph-funnel" aria-hidden="true"></i>
            <p>No events match these filters. Try widening your selection.</p></div>`)
    + '</div>';
  if (filtered.length) {
    const activeMonth = (typeof window.eventFilters.month === 'number') ? window.eventFilters.month : null;
    const result = renderEventsGridInto(document.getElementById('eventGrid'), filtered, window.eventFilters.page || 1, activeMonth);
    /* If the user landed on a stale page (filter narrowed the list),
       snap eventFilters.page back to the clamped value so the active
       pagination button reflects reality. */
    window.eventFilters.page = result.page;
  }
  observeReveals();

  /* Delegated handlers for chips + dropdown + reset + pagination. */
  const bar = document.getElementById('eventFilters');
  if (!bar) return;
  bar.addEventListener('click', e => {
    const chip = e.target.closest('button[data-filter-group]');
    if (chip) {
      const group = chip.getAttribute('data-filter-group');
      let val = chip.getAttribute('data-filter-value');
      if (group === 'month' && val !== 'all' && val !== 'recurring') val = parseInt(val, 10);
      if (group === 'walk' && val !== 'all') val = parseInt(val, 10);
      window.eventFilters[group] = val;
      window.eventFilters.page = 1; /* filter change resets pagination */
      renderEvents();
      return;
    }
    if (e.target.id === 'eventFiltersReset') {
      window.eventFilters = { month:'all', category:'all', price:'all', walk:'all', page:1 };
      renderEvents();
    }
  });
  const sel = document.getElementById('eventCategorySelect');
  if (sel) sel.addEventListener('change', () => {
    window.eventFilters.category = sel.value;
    window.eventFilters.page = 1;
    renderEvents();
  });

  /* Pagination handler: page buttons live inside #eventGrid, so the
     delegated listener has to sit on the wrap (not the bar). Scroll
     the events section to the top of the grid on page change so the
     visitor sees the new first card without manual scrolling. */
  const grid = document.getElementById('eventGrid');
  if (grid) {
    grid.addEventListener('click', e => {
      const btn = e.target.closest('button.hev-pagebtn');
      if (!btn || btn.disabled) return;
      const p = parseInt(btn.getAttribute('data-page'), 10);
      if (!Number.isFinite(p) || p < 1) return;
      window.eventFilters.page = p;
      renderEvents();
      const head = document.querySelector('#events .section-head');
      if (head) head.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  }
}

/* ------------------------------------------------------------------
   SHARE: shares the stop, or the detail if one is open
------------------------------------------------------------------- */
function shareCurrent(mode){
  let url = location.origin + location.pathname + '#stop=' + activeStop.id;
  let title = `Things to do at ${activeStop.name} on the Northlander train`;
  let text = activeStop.hook;
  if(activeDetail !== null){
    const it = (activeStop[activeCat]||[])[activeDetail];
    if(it){
      url += '&cat='+activeCat+'&place='+slug(it.name);
      title = `${it.name}, ${activeStop.name}`;
      text = it.desc;
    }
  }
  if(mode==='x' && navigator.share){
    navigator.share({title,text,url}).catch(()=>{}); return;
  }
  navigator.clipboard.writeText(url).then(()=>toast('Link copied to clipboard'))
    .catch(()=>toast('Could not copy link'));
}
function toast(msg){
  let t = document.querySelector('.toast');
  if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);}
  t.textContent=msg;t.classList.add('show');
  clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2200);
}

/* ------------------------------------------------------------------
   SELECT A STOP
------------------------------------------------------------------- */
function selectStop(id,scroll=true){
  const s = STOPS.find(x=>x.id===id);
  if(!s) return;
  activeStop = s;
  activeCat = 'restaurants';
  activeDetail = null;
  /* Mark the new stop active in the rail, then re-render the
     slab and the events list. */
  updateRailActive(id);
  renderStop();
  renderEvents();
  history.replaceState(null,'','#stop='+id);
  /* On mobile, picking a stop slides the rail off and brings the
     slab over the screen. On desktop both are visible so the
     class just sits there as state without visual effect. */
  openSlab();
  if(scroll){
    const stopnav = document.getElementById('stopnav');
    if(stopnav) stopnav.scrollIntoView({behavior:'smooth', block:'start'});
  }
}
window.selectStop = selectStop;

/* ------------------------------------------------------------------
   STOPNAV: rail + slab open/close
   The rail is a vertical list of all 16 stops; clicking one calls
   selectStop() which updates the slab. openSlab/closeSlab toggle
   the .detail-open class on the .stopnav container. Desktop is
   always-open (both columns visible), mobile uses the class to
   slide the rail off and the slab in.
------------------------------------------------------------------- */
function buildRail(){
  const rail = document.getElementById('rail');
  if(!rail) return;
  rail.innerHTML = `
    <header class="rail-head">
      <span class="kicker">The Route</span>
      <h2>All 16 stops</h2>
    </header>
    <ul class="rail-stops" role="presentation">
      ${STOPS.map((s,i)=>`
        <li>
          <button class="rail-stop" type="button"
                  role="tab" data-id="${s.id}"
                  aria-selected="${s.id === activeStop.id ? 'true' : 'false'}"
                  aria-controls="slab">
            <span class="rail-circle" aria-hidden="true">${i+1}</span>
            <span class="rail-text">
              <span class="rail-name">${s.name}</span>
              <span class="rail-region">${s.region}</span>
            </span>
          </button>
        </li>`).join('')}
    </ul>
  `;
  const list = rail.querySelector('.rail-stops');
  /* Hide the mobile "Tap to start" hint immediately if the visitor
     has tapped a stop on a previous visit. */
  if (list) {
    try { if (localStorage.getItem('railTapped') === '1') list.classList.add('tapped'); }
    catch(e) {}
  }
  rail.querySelectorAll('.rail-stop').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if (list) list.classList.add('tapped');
      try { localStorage.setItem('railTapped','1'); } catch(e) {}
      selectStop(btn.dataset.id);
    });
  });
}
function updateRailActive(id){
  document.querySelectorAll('.rail-stop').forEach(btn=>{
    btn.setAttribute('aria-selected', btn.dataset.id === id ? 'true' : 'false');
  });
}
function openSlab(){
  const stopnav = document.getElementById('stopnav');
  if(stopnav) stopnav.classList.add('detail-open');
}
function closeSlab(){
  const stopnav = document.getElementById('stopnav');
  if(stopnav) stopnav.classList.remove('detail-open');
}
/* Mobile-only Back button on the slab returns to the rail. */
const slabBack = document.getElementById('slabBack');
if(slabBack){
  slabBack.addEventListener('click', ()=>{
    closeSlab();
    /* Scroll back to the top of the stopnav so the rail is in view. */
    const stopnav = document.getElementById('stopnav');
    if(stopnav) stopnav.scrollIntoView({behavior:'smooth', block:'start'});
  });
}

/* Back-to-top button: visible from page load, JS smooth-scroll on
   click. The smooth scroll matters on mobile where href="#top" can
   stutter behind a sticky URL bar. */
const toTop = document.querySelector('.totop');
if (toTop) {
  toTop.classList.add('show');
  toTop.addEventListener('click', e => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

window.addEventListener('scroll',()=>{
  updateRouteBar();
},{passive:true});

/* ------------------------------------------------------------------
   MAP PREVIEW CARD
   Tapping or clicking a pin opens a small site-styled card with the
   stop's image (or illustrated fallback), name, hook, and an
   "Open guide" button. The button closes the card, selects that
   stop in the directory, and smooth-scrolls to the explore section.
   Only one preview is ever open; tapping another pin replaces it.
------------------------------------------------------------------- */
const mapPreview = document.getElementById('mapPreview');
const mapPreviewClose = document.getElementById('mapPreviewClose');
const mapPreviewOpen = document.getElementById('mapPreviewOpen');
const mapPreviewImg = document.getElementById('mapPreviewImg');
const mapPreviewName = document.getElementById('mapPreviewName');
const mapPreviewHook = document.getElementById('mapPreviewHook');
const mapPreviewNum = document.getElementById('mapPreviewNum');
let currentPreviewStop = null;

function openMapPreview(s){
  if(!mapPreview || !s) return;
  currentPreviewStop = s;
  const i = STOPS.indexOf(s);
  mapPreviewNum.textContent = i+1;
  mapPreviewName.textContent = s.name;
  mapPreviewHook.textContent = s.hook;

  // Image when set; on error, swap in the illustrated fallback.
  // No image set? Render the illustration directly.
  const fallback = stopArt(s, i);
  if(s.image){
    const img = document.createElement('img');
    img.src = s.image;
    img.alt = s.name;
    img.loading = 'lazy';
    img.onerror = ()=>{ mapPreviewImg.innerHTML = fallback; };
    mapPreviewImg.innerHTML = '';
    mapPreviewImg.appendChild(img);
  } else {
    mapPreviewImg.innerHTML = fallback;
  }

  mapPreview.classList.add('open');
  mapPreview.setAttribute('aria-hidden','false');
}

function closeMapPreview(){
  if(!mapPreview) return;
  mapPreview.classList.remove('open');
  mapPreview.setAttribute('aria-hidden','true');
  currentPreviewStop = null;
}

if(mapPreview){
  mapPreviewClose.addEventListener('click', closeMapPreview);

  mapPreviewOpen.addEventListener('click', ()=>{
    if(!currentPreviewStop) return;
    const id = currentPreviewStop.id;
    closeMapPreview();
    selectStop(id);
    const explore = document.getElementById('explore');
    if(explore) explore.scrollIntoView({behavior:'smooth', block:'start'});
  });

  // Escape closes the preview.
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && mapPreview.classList.contains('open')) closeMapPreview();
  });

  // Tap anywhere outside the card (and outside a route-map station)
  // closes it. Station clicks are excluded so the station's own
  // handler can swap in the new stop's preview instead of
  // triggering a close.
  document.addEventListener('click', e=>{
    if(!mapPreview.classList.contains('open')) return;
    if(mapPreview.contains(e.target)) return;
    if(e.target.closest('.route-station')) return;
    closeMapPreview();
  });
}

/* Mobile hamburger menu: toggles a slide-down drawer that lists
   the same three sections as the desktop nav. Tapping any link
   closes the menu (the browser then handles the smooth scroll via
   the anchor href). */
const hamburgerBtn = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobilemenu');
function setMobileMenu(open){
  if(!hamburgerBtn || !mobileMenu) return;
  hamburgerBtn.classList.toggle('open', open);
  mobileMenu.classList.toggle('open', open);
  hamburgerBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  mobileMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
}
if(hamburgerBtn && mobileMenu){
  hamburgerBtn.addEventListener('click', (e)=>{
    // Stop propagation so the document-level outside-click handler
    // below does not immediately close the menu we just opened.
    e.stopPropagation();
    setMobileMenu(!hamburgerBtn.classList.contains('open'));
  });
  mobileMenu.querySelectorAll('a').forEach(a=>{
    a.addEventListener('click', ()=>setMobileMenu(false));
  });
  // Tap anywhere outside the menu (and outside the hamburger button)
  // closes the menu. Escape key also closes it for keyboard users.
  document.addEventListener('click', (e)=>{
    if(!mobileMenu.classList.contains('open')) return;
    if(hamburgerBtn.contains(e.target)) return;
    if(mobileMenu.contains(e.target)) return;
    setMobileMenu(false);
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && mobileMenu.classList.contains('open')) setMobileMenu(false);
  });
}

function fromHash(){
  const h = location.hash;
  const ms = h.match(/stop=([\w]+)/);
  if(ms && STOPS.find(s=>s.id===ms[1])) activeStop = STOPS.find(s=>s.id===ms[1]);
  const mc = h.match(/cat=([\w]+)/);
  if(mc && CATS.find(c=>c.key===mc[1])) activeCat = mc[1];
  const mp = h.match(/place=([\w-]+)/);
  if(mp){
    /* Search the combined list (featured + organic) so deep-links
       to Featured listings resolve the same way as organic ones. */
    const items = listingsForActive();
    const idx = items.findIndex(x=>slug(x.name)===mp[1]);
    if(idx>=0) activeDetail = idx;
  }
}

setSeasonalHero();
buildHeroScene();
mergeStaticListings();
fromHash();
buildRail();
renderStop();
renderEvents();
updateRouteBar();
observeReveals();
animateStats();
/* On desktop, open the slab on initial load so the visitor lands
   on a real stop immediately (default = Toronto Union via
   activeStop default, or the deep-linked stop from the hash). On
   mobile, leave the slab closed so the rail is the entry view. */
if(window.matchMedia('(min-width: 768px)').matches){
  openSlab();
}

/* ------------------------------------------------------------------
   STATIC LISTINGS
   Listings and their photos are baked into site/listings-data.js by
   backend/build-static.js, with local image paths under
   images/listings/. We merge them into the STOPS array before the
   first render so the directory shows real photos with zero backend
   dependency. Curated blurbs, facts, events and featured slots in
   data.js are left untouched. To refresh content, re-run the build
   script and commit the regenerated files.
------------------------------------------------------------------- */
function mergeStaticListings(){
  const data = window.LISTINGS_DATA;
  if(!data) return;
  STOPS.forEach(s => {
    const c = data[s.id];
    if(!c) return;
    ['restaurants','accommodations','parks','attractions','shops'].forEach(cat => {
      if(Array.isArray(c[cat]) && c[cat].length) s[cat] = c[cat];
    });
  });
}

/* ------------------------------------------------------------------
   EVENT SUBMISSION MODAL
   Wires every .submit-event-trigger link to open the <dialog id="evModal">.
   No-JS visitors and crawlers follow the link to /submit-event/ instead,
   which is a real indexable page with the same form.
------------------------------------------------------------------- */
(function initSubmitEventModal(){
  const modal = document.getElementById('evModal');
  const closeBtn = document.getElementById('evModalClose');
  if (!modal || typeof modal.showModal !== 'function') return; // no <dialog> support: links fall through to /submit-event/

  function open(){
    modal.showModal();
    /* Focus the first input for keyboard users. */
    const first = modal.querySelector('input, select, textarea');
    if (first) try { first.focus(); } catch(e){}
  }
  function close(){ try { modal.close(); } catch(e){} }

  /* Intercept any .submit-event-trigger anchor click, open the modal,
     prevent the navigation. */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('.submit-event-trigger');
    if (!a) return;
    e.preventDefault();
    open();
  });

  if (closeBtn) closeBtn.addEventListener('click', close);
  /* Click on the dialog backdrop (the <dialog> itself, not its inner card) closes it. */
  modal.addEventListener('click', e => {
    if (e.target === modal) close();
  });
})();

/* ------------------------------------------------------------------
   EVENT SUBMISSION FORM
   POSTs to /api/submit-event which writes to Airtable with
   Approved=false. Admin reviews in Airtable, ticks Approved, then the
   sync-events workflow publishes the row to events-data.js.
------------------------------------------------------------------- */
/* Shared client-side image resize: max 1200px long edge, JPEG 85%.
   Keeps the payload around 0.5-2 MB for typical phone photos and
   stays well under the 4 MB server cap. Used by both the modal
   handler below and the dedicated /submit-event/ page handler. */
window.resizeEventImage = async function resizeEventImage(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read image.'));
      i.src = url;
    });
    let w = img.naturalWidth, h = img.naturalHeight;
    const max = 1200;
    if (w > max || h > max) {
      if (w >= h) { h = Math.round(h * max / w); w = max; }
      else { w = Math.round(w * max / h); h = max; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Could not encode image.');
    const base64 = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(new Error('Could not encode image.'));
      fr.readAsDataURL(blob);
    });
    const filename = (file.name || 'event').replace(/\.[^.]+$/, '') + '.jpg';
    return { base64, contentType: 'image/jpeg', filename };
  } finally { URL.revokeObjectURL(url); }
};

(function initEventForm(){
  const form = document.getElementById('evForm');
  if (!form) return;
  const $ = id => document.getElementById(id);
  const human = $('evHuman'), consent = $('evConsent'), submit = $('evSubmit'), msg = $('evMsg');
  const fileEl = $('evImageFile');
  const fileLabel = $('evImageFileLabel');
  const fileClear = $('evImageFileClear');
  const filePreview = $('evImageFilePreview');
  let imagePayload = null;

  function syncSubmit(){ submit.disabled = !(human.checked && consent.checked); }
  human.addEventListener('change', syncSubmit);
  consent.addEventListener('change', syncSubmit);

  fileEl.addEventListener('change', async () => {
    const f = fileEl.files && fileEl.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      msg.textContent = 'Please choose an image under 8 MB.';
      fileEl.value = '';
      return;
    }
    msg.textContent = 'Preparing image...';
    try {
      imagePayload = await window.resizeEventImage(f);
      filePreview.src = 'data:image/jpeg;base64,' + imagePayload.base64;
      filePreview.hidden = false;
      fileClear.hidden = false;
      fileLabel.textContent = 'Replace image';
      msg.textContent = '';
    } catch (err) {
      imagePayload = null;
      msg.textContent = 'Could not read that image. Try another.';
      fileEl.value = '';
    }
  });

  fileClear.addEventListener('click', () => {
    imagePayload = null;
    fileEl.value = '';
    filePreview.src = ''; filePreview.hidden = true;
    fileClear.hidden = true;
    fileLabel.textContent = 'Upload an image';
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.classList.remove('ok');

    const payload = {
      name: $('evName').value.trim(),
      stop: $('evStop').value,
      category: $('evCategory').value,
      startDate: $('evStartDate').value,
      endDate: $('evEndDate').value,
      startTime: $('evStartTime').value.trim(),
      endTime: $('evEndTime').value.trim(),
      venue: $('evVenue').value.trim(),
      address: $('evAddress').value.trim(),
      description: $('evDescription').value.trim(),
      imageUrl: $('evImageUrl').value.trim(),
      eventUrl: $('evEventUrl').value.trim(),
      ticketUrl: $('evTicketUrl').value.trim(),
      price: $('evPrice').value.trim(),
      free: $('evFree').checked,
      submittedBy: $('evSubmittedBy').value.trim(),
      submitterEmail: $('evEmail').value.trim(),
      human: true, consent: true,
      url: $('evUrl').value
    };
    if (imagePayload) payload.image = imagePayload;

    if (!payload.name)         { msg.textContent = 'Event name is required.'; return; }
    if (!payload.stop)         { msg.textContent = 'Please pick a stop.'; return; }
    if (!payload.startDate)    { msg.textContent = 'Start date is required.'; return; }
    if (!payload.description)  { msg.textContent = 'Description is required.'; return; }
    if (!payload.submitterEmail){msg.textContent = 'Your email is required.'; return; }

    submit.disabled = true;
    msg.textContent = 'Submitting...';
    try {
      const res = await fetch('/api/submit-event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        form.reset();
        fileClear.click();
        msg.classList.add('ok');
        msg.textContent = 'Thank you. Your event has been submitted for review.';
        submit.disabled = true;
      } else {
        let data = {};
        try { data = await res.json(); } catch(e){}
        msg.textContent = data.error || 'Could not submit right now. Please try again later.';
        submit.disabled = false;
      }
    } catch (err) {
      msg.textContent = 'Could not submit right now. Please try again later.';
      submit.disabled = false;
    }
  });
})();
