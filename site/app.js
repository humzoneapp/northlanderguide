/* ==================================================================
   THE NORTHLANDER WAYFINDER: APP LOGIC
   Map · search · stop panels · listing detail view · share · events
   ================================================================== */

document.getElementById('yr').textContent = new Date().getFullYear();

let activeStop = STOPS[0];
let activeCat  = 'restaurants';
let activeDetail = null;   // index of the listing being viewed, or null

const CATS = [
  {key:'restaurants',    label:'Eat & Drink',     ic:'\u{1F37D}'},
  {key:'accommodations', label:'Stay',            ic:'\u{1F6CF}'},
  {key:'parks',          label:'Parks & Nature',  ic:'\u{1F332}'},
  {key:'attractions',    label:'Attractions',     ic:'\u{1F4CD}'}
];
function catLabel(key){ return (CATS.find(c=>c.key===key)||{}).label || key; }

/* a URL-safe slug from a listing name, used for shareable detail links */
function slug(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

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


/* Toronto Union: a WPA poster scene of the downtown skyline at
   sunset, with Lake Ontario, the CN Tower silhouette, and a
   locomotive on the rails. Flat color, geometric shapes, no
   gradients. Used in the stop card hero for Toronto Union only;
   the other 15 stops keep stopArt() output. */
function unionPosterArt(){
  return `
  <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Toronto Union sunset poster">
    <!-- Sky bands -->
    <rect width="800" height="360" fill="#eed3a0"/>
    <rect width="800" height="170" fill="#dca33c"/>
    <rect width="800" height="92"  fill="#c46f2c"/>
    <rect width="800" height="40"  fill="#8e3d22"/>

    <!-- Cream sun rising over the lake -->
    <circle cx="612" cy="118" r="40" fill="#f6e7c4"/>

    <!-- Distant skyline (faded teal) -->
    <g fill="#7ea29e">
      <rect x="0"   y="208" width="56" height="60"/>
      <rect x="60"  y="186" width="40" height="82"/>
      <rect x="104" y="198" width="50" height="70"/>
      <rect x="160" y="174" width="38" height="94"/>
      <rect x="204" y="194" width="48" height="74"/>
      <rect x="256" y="208" width="40" height="60"/>
    </g>

    <!-- Mid skyline (deeper teal) plus CN Tower silhouette -->
    <g fill="#456f6c">
      <rect x="298" y="184" width="48" height="84"/>
      <rect x="352" y="166" width="38" height="102"/>
      <rect x="396" y="200" width="44" height="68"/>
      <!-- CN Tower base + pod + antenna -->
      <rect x="470" y="78"  width="14" height="190"/>
      <circle cx="477" cy="110" r="16"/>
      <polygon points="477,28 470,78 484,78"/>
      <rect x="498" y="194" width="40" height="74"/>
      <rect x="544" y="172" width="46" height="96"/>
      <rect x="594" y="202" width="40" height="66"/>
    </g>

    <!-- Foreground skyline (deep forest) -->
    <g fill="#1f3d2d">
      <rect x="638" y="204" width="48" height="64"/>
      <rect x="690" y="188" width="40" height="80"/>
      <rect x="734" y="198" width="50" height="70"/>
    </g>

    <!-- Lake Ontario, flat dark teal -->
    <rect y="268" width="800" height="46" fill="#2c5258"/>
    <!-- Lake highlights -->
    <rect x="60"  y="282" width="140" height="2" fill="#7ea29e" opacity="0.7"/>
    <rect x="280" y="292" width="180" height="2" fill="#7ea29e" opacity="0.6"/>
    <rect x="540" y="284" width="160" height="2" fill="#7ea29e" opacity="0.7"/>

    <!-- Rail embankment, warm brown -->
    <rect y="314" width="800" height="46" fill="#6b4528"/>
    <!-- Ties -->
    <g fill="#3a2618">
      <rect x="0"   y="326" width="30" height="22"/>
      <rect x="48"  y="326" width="30" height="22"/>
      <rect x="96"  y="326" width="30" height="22"/>
      <rect x="144" y="326" width="30" height="22"/>
      <rect x="192" y="326" width="30" height="22"/>
      <rect x="240" y="326" width="30" height="22"/>
      <rect x="288" y="326" width="30" height="22"/>
      <rect x="336" y="326" width="30" height="22"/>
      <rect x="384" y="326" width="30" height="22"/>
      <rect x="432" y="326" width="30" height="22"/>
      <rect x="480" y="326" width="30" height="22"/>
      <rect x="528" y="326" width="30" height="22"/>
      <rect x="576" y="326" width="30" height="22"/>
      <rect x="624" y="326" width="30" height="22"/>
      <rect x="672" y="326" width="30" height="22"/>
      <rect x="720" y="326" width="30" height="22"/>
      <rect x="768" y="326" width="30" height="22"/>
    </g>
    <!-- Steel rails -->
    <rect y="332" width="800" height="2" fill="#241f1a"/>
    <rect y="346" width="800" height="2" fill="#241f1a"/>

    <!-- Locomotive silhouette on the right, heading north (left) -->
    <g fill="#8e3d22">
      <rect x="92"  y="276" width="160" height="38"/>
      <rect x="70"  y="290" width="22"  height="24"/>
      <rect x="118" y="252" width="42"  height="26"/>
    </g>
    <rect x="148" y="226" width="8" height="28" fill="#8e3d22"/>
    <circle cx="152" cy="222" r="9"  fill="#f6e7c4"/>
    <circle cx="164" cy="214" r="6"  fill="#f6e7c4" opacity="0.75"/>
    <circle cx="174" cy="208" r="5"  fill="#f6e7c4" opacity="0.55"/>
    <g fill="#241f1a">
      <circle cx="118" cy="318" r="10"/>
      <circle cx="170" cy="318" r="10"/>
      <circle cx="222" cy="318" r="10"/>
    </g>
  </svg>`;
}

function stopArt(index){
  const t = index / (STOPS.length - 1);
  const sky1 = mix('#e8a14a','#3f6f88', t);
  const sky2 = mix('#f6d9a0','#9fbfc4', t);
  const hill = mix('#1d6347','#0e3b2c', t);
  const hill2= mix('#2a7d57','#155340', t);
  return `
  <svg viewBox="0 0 800 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Northern Ontario landscape">
    <defs>
      <linearGradient id="sky${index}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${sky1}"/>
        <stop offset="1" stop-color="${sky2}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="300" fill="url(#sky${index})"/>
    <circle cx="${140+t*500}" cy="78" r="34" fill="#fff3da" opacity="${.85-t*.3}"/>
    <path d="M0 200 Q150 150 320 195 T640 185 T800 200 V300 H0 Z" fill="${hill2}" opacity=".7"/>
    <path d="M0 235 Q200 185 420 230 T800 225 V300 H0 Z" fill="${hill}"/>
    ${pines(hill)}
    <path d="M0 262 Q400 248 800 264 V300 H0 Z" fill="${mix('#5a8fa0','#2c5563',t)}" opacity=".9"/>
    <rect x="0" y="278" width="800" height="6" fill="#2a1f15" opacity=".55"/>
    ${Array.from({length:27},(_,i)=>`<rect x="${i*30}" y="274" width="7" height="14" fill="#2a1f15" opacity=".4"/>`).join('')}
  </svg>`;
}
function pines(c){
  const xs=[70,120,165,640,690,735,400,445];
  return xs.map(x=>{
    const h=34+((x*7)%26);
    return `<path d="M${x} ${250-h} L${x-13} 252 L${x+13} 252 Z" fill="${c}"/>
            <path d="M${x} ${262-h} L${x-10} 244 L${x+10} 244 Z" fill="${c}"/>
            <rect x="${x-2}" y="250" width="4" height="9" fill="#3a2a1c"/>`;
  }).join('');
}
function mix(a,b,t){
  const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const [r1,g1,b1]=p(a),[r2,g2,b2]=p(b);
  const c=(x,y)=>Math.round(x+(y-x)*t).toString(16).padStart(2,'0');
  return `#${c(r1,r2)}${c(g1,g2)}${c(b1,b2)}`;
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
    attractions:    {bg1:'#c46f2c', bg2:'#8e3d22', ic:'#f3e6c8'}
  };
  const p = palettes[cat] || palettes.attractions;

  // 400 x 220 viewBox. Icons are centered around (200, 110).
  const icons = {
    restaurants: `
      <g fill="${p.ic}">
        <rect x="183" y="62"  width="4"  height="44" rx="1.5"/>
        <rect x="198" y="62"  width="4"  height="44" rx="1.5"/>
        <rect x="213" y="62"  width="4"  height="44" rx="1.5"/>
        <rect x="180" y="104" width="40" height="8"  rx="2"/>
        <rect x="196" y="110" width="8"  height="56" rx="3"/>
      </g>`,
    accommodations: `
      <g fill="${p.ic}">
        <rect x="142" y="110" width="116" height="34" rx="6"/>
        <rect x="140" y="142" width="10"  height="22" rx="2"/>
        <rect x="250" y="142" width="10"  height="22" rx="2"/>
        <rect x="155" y="92"  width="42"  height="22" rx="5" opacity=".88"/>
        <rect x="203" y="92"  width="42"  height="22" rx="5" opacity=".88"/>
      </g>`,
    parks: `
      <g fill="${p.ic}">
        <polygon points="200,62 174,108 226,108"/>
        <polygon points="200,92 168,138 232,138"/>
        <polygon points="200,122 160,168 240,168"/>
      </g>
      <rect x="195" y="168" width="10" height="18" fill="${p.ic}" opacity=".7"/>`,
    attractions: `
      <path d="M200 62 C 222 62 238 80 238 102 C 238 134 200 178 200 178 C 200 178 162 134 162 102 C 162 80 178 62 200 62 Z" fill="${p.ic}"/>
      <circle cx="200" cy="100" r="11" fill="${p.bg2}"/>`
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

/* Returns the markup for an image area: real photo if `image` set,
   otherwise the illustrated fallback. */
function imageBlock(item, cat, seed, cls){
  if(item && item.image){
    return `<div class="${cls}"><img src="${item.image}" alt="${item.name||''}"
            loading="lazy" onerror="this.parentNode.innerHTML=\`${cardArt(cat,seed).replace(/`/g,'')}\`"></div>`;
  }
  return `<div class="${cls}">${cardArt(cat, seed)}</div>`;
}

/* ------------------------------------------------------------------
   INTERACTIVE MAP (Leaflet) with graceful fallback
------------------------------------------------------------------- */
let map, markers={};
function initMap(){
  if(typeof L === 'undefined'){ renderRouteFallback(); return; }
  try{
    map = L.map('leafmap',{scrollWheelZoom:false}).setView([46.3,-79.9], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'\u00A9 OpenStreetMap contributors', maxZoom:13
    }).addTo(map);
    const line = STOPS.map(s=>[s.lat,s.lng]);
    L.polyline(line,{color:'#d96c2c',weight:4,opacity:.85,dashArray:'2 8'}).addTo(map);
    STOPS.forEach((s,i)=>{
      const icon = L.divIcon({ className:'',
        html:`<div style="background:#0e3b2c;color:#fff;width:26px;height:26px;
              border-radius:50%;border:2.5px solid #d96c2c;display:flex;
              align-items:center;justify-content:center;font:700 12px Spline Sans,sans-serif;
              box-shadow:0 2px 6px rgba(0,0,0,.4)">${i+1}</div>`,
        iconSize:[26,26], iconAnchor:[13,13] });
      const m = L.marker([s.lat,s.lng],{icon}).addTo(map);
      // Desktop hover: short name tooltip. CSS hides tooltips on
      // touch devices via (hover: none) so a tap shows the preview
      // card instead of a transient tooltip.
      m.bindTooltip(s.name, {
        className:'map-tip', direction:'top', offset:[0,-14], opacity:1,
      });
      // Tap/click on the marker: show the site-styled preview card.
      m.on('click', ()=>openMapPreview(s));
      markers[s.id]=m;
    });
    // Tap the map background (not a marker) to dismiss the preview.
    map.on('click', closeMapPreview);
    map.fitBounds(L.latLngBounds(line).pad(0.12));

    // Desktop scroll zoom, gated by Ctrl/Cmd so a plain mousewheel
    // scroll over the map still scrolls the page. Mobile pinch zoom
    // (touchZoom) is on by default and untouched here.
    const mapEl = document.getElementById('leafmap');
    mapEl.addEventListener('wheel', (e)=>{
      if(!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = mapEl.getBoundingClientRect();
      const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
      const latlng = map.containerPointToLatLng(point);
      const delta = e.deltaY < 0 ? 1 : -1;
      map.setZoomAround(latlng, map.getZoom() + delta);
    }, {passive:false});
  }catch(err){ console.warn('Map failed:', err); renderRouteFallback(); }
}
function renderRouteFallback(){
  const el = document.getElementById('leafmap');
  el.classList.add('map-fallback'); el.style.height='auto';
  el.innerHTML = `<div class="fallback-note">Interactive map unavailable. Tap a stop below.</div>
    <ol class="fallback-route">
      ${STOPS.map((s,i)=>`<li data-id="${s.id}">
        <span class="fb-num">${i+1}</span>
        <span class="fb-body"><b>${s.name}</b><em>${s.hook}</em></span></li>`).join('')}
    </ol>`;
  el.querySelectorAll('li').forEach(li=>li.addEventListener('click',()=>selectStop(li.dataset.id)));
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
  if(activeDetail !== null){ renderDetail(); return; }
  const s = activeStop;
  const i = STOPS.indexOf(s);
  // Stage 1 redesign: Toronto Union uses a custom WPA-poster scene
  // (skyline + lake + locomotive) instead of the generic landscape.
  // Other 15 stops keep the existing stopArt(i) output.
  const heroArt = s.id === 'union' ? unionPosterArt() : stopArt(i);
  document.getElementById('stopPanel').innerHTML = `
    <div class="stop" data-stop="${s.id}">
      <div class="stop-hero">
        <div class="ord-badge">${i+1}</div>
        ${ s.image
            ? `<img class="stop-photo" src="${s.image}" alt="${s.name}"
                 onerror="this.outerHTML='<div class=&quot;stop-art&quot;>'+document.getElementById('art${i}').innerHTML+'</div>'">
               <div id="art${i}" style="display:none">${heroArt}</div>`
            : heroArt }
        <div class="label">
          <div class="region">${s.region}</div>
          <h3>${s.name}</h3>
          <div class="hook">${s.hook}</div>
        </div>
      </div>
      <div class="stop-meta">
        <span class="pill"><b>From Toronto:</b> ${s.time}</span>
        <span class="pill"><b>Stop:</b> ${i+1} of ${STOPS.length}</span>
      </div>
      <p class="stop-blurb">${s.blurb}</p>
      <div class="share-row">
        <button data-share="copy">\u{1F517} Copy link to this stop</button>
        <button data-share="x">Share</button>
      </div>
      <div class="catfilter" id="catFilter">
        ${CATS.map(c=>{
          const count=(s[c.key]||[]).length;
          return `<button data-cat="${c.key}" class="${c.key===activeCat?'active':''}">
            <span class="ic">${c.ic}</span>${c.label}<span class="cnt">${count}</span></button>`;
        }).join('')}
      </div>
      <div class="cards" id="cards"></div>
    </div>`;
  document.querySelectorAll('#catFilter button').forEach(b=>
    b.addEventListener('click',()=>{activeCat=b.dataset.cat;activeDetail=null;renderStop();}));
  document.querySelectorAll('[data-share]').forEach(b=>
    b.addEventListener('click',()=>shareCurrent(b.dataset.share)));
  renderCards();
}

function renderCards(){
  const items = activeStop[activeCat] || [];
  const wrap = document.getElementById('cards');
  if(!items.length){ wrap.innerHTML = `<div class="empty">No listings here yet.</div>`; return; }
  wrap.innerHTML = items.map((it,idx)=>`
    <button class="card" data-idx="${idx}">
      ${imageBlock(it, activeCat, idx, 'card-img')}
      <div class="card-body">
        <div class="toprow">
          <span class="tag">${it.tag}</span>
          <span class="rating">${it.rating==='NR'?'New':'\u2605 '+it.rating}</span>
        </div>
        <h4>${it.name}</h4>
        <div class="desc">${it.desc}</div>
        <span class="card-cta">View details \u2192</span>
      </div>
    </button>`).join('');
  wrap.querySelectorAll('.card').forEach(c=>
    c.addEventListener('click',()=>openDetail(parseInt(c.dataset.idx,10))));
}

/* ------------------------------------------------------------------
   DETAIL VIEW: one listing, back button, more cards below
------------------------------------------------------------------- */
function renderDetail(){
  const items = activeStop[activeCat] || [];
  const it = items[activeDetail];
  if(!it){ activeDetail=null; renderStop(); return; }
  const others = items.map((x,i)=>({x,i})).filter(o=>o.i!==activeDetail);

  document.getElementById('stopPanel').innerHTML = `
    <div class="stop detail" data-stop="${activeStop.id}">
      <button class="backbtn" id="backBtn">\u2190 Back to ${activeStop.name}</button>
      <div class="detail-hero">
        ${imageBlock(it, activeCat, activeDetail, 'detail-img')}
      </div>
      <div class="detail-body">
        <div class="toprow">
          <span class="tag">${it.tag}</span>
          <span class="rating">${it.rating==='NR'?'New':'\u2605 '+it.rating}</span>
        </div>
        <h3>${it.name}</h3>
        <div class="detail-loc">\u{1F4CD} ${catLabel(activeCat)} \u00B7 ${activeStop.name}, ${activeStop.region}</div>
        <p class="detail-desc">${it.details || it.desc}</p>
        <div class="share-row">
          <button data-share="copy">\u{1F517} Copy link</button>
          <button data-share="x">Share</button>
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
    document.getElementById('explore').scrollIntoView({behavior:'smooth',block:'start'});
  });
  document.querySelectorAll('[data-share]').forEach(b=>
    b.addEventListener('click',()=>shareCurrent(b.dataset.share)));

  const mc = document.getElementById('moreCards');
  if(mc){
    mc.innerHTML = others.map(o=>`
      <button class="card" data-idx="${o.i}">
        ${imageBlock(o.x, activeCat, o.i, 'card-img')}
        <div class="card-body">
          <div class="toprow">
            <span class="tag">${o.x.tag}</span>
            <span class="rating">${o.x.rating==='NR'?'New':'\u2605 '+o.x.rating}</span>
          </div>
          <h4>${o.x.name}</h4>
          <div class="desc">${o.x.desc}</div>
          <span class="card-cta">View details \u2192</span>
        </div>
      </button>`).join('');
    mc.querySelectorAll('.card').forEach(c=>
      c.addEventListener('click',()=>openDetail(parseInt(c.dataset.idx,10))));
  }
}

function openDetail(idx){
  activeDetail = idx;
  renderStop();
  const it = (activeStop[activeCat]||[])[idx];
  history.replaceState(null,'','#stop='+activeStop.id+'&cat='+activeCat+'&place='+slug(it.name));
  document.getElementById('explore').scrollIntoView({behavior:'smooth',block:'start'});
}

/* ------------------------------------------------------------------
   EVENTS
------------------------------------------------------------------- */
function renderEvents(){
  const evts = activeStop.events || [];
  const wrap = document.getElementById('eventPanel');
  if(!evts.length){
    wrap.innerHTML = `<div class="evlist"><div class="empty">No events listed yet for ${activeStop.name}.</div></div>`;
    return;
  }
  wrap.innerHTML = `<div class="evlist">
    ${evts.map(e=>`
      <div class="evcard">
        <div class="date"><div class="d">${e.d}</div><div class="m">${e.m}</div></div>
        <div>
          <h4>${e.name}</h4>
          <div class="where">\u{1F4CD} ${e.where} \u00B7 ${activeStop.name}</div>
          <div class="edesc">${e.desc}</div>
        </div>
      </div>`).join('')}
  </div>`;
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
  renderChips(document.getElementById('searchInput').value);
  renderStop();
  renderEvents();
  history.replaceState(null,'','#stop='+id);
  if(markers[id] && markers[id].openPopup) markers[id].openPopup();
  if(scroll) document.getElementById('explore').scrollIntoView({behavior:'smooth',block:'start'});
}
window.selectStop = selectStop;

/* ------------------------------------------------------------------
   INIT  (+ deep-link support: #stop=huntsville&cat=restaurants&place=...)
------------------------------------------------------------------- */
document.getElementById('searchInput').addEventListener('input',e=>renderChips(e.target.value));

const toTop = document.querySelector('.totop');

window.addEventListener('scroll',()=>{
  toTop.classList.toggle('show', window.scrollY>600);
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
  const fallback = s.id === 'union' ? unionPosterArt() : stopArt(i);
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

  // Tap anywhere outside the card (and outside a marker) closes it.
  // Marker clicks are excluded so the marker's own handler can swap
  // in the new stop's preview instead of triggering a close.
  document.addEventListener('click', e=>{
    if(!mapPreview.classList.contains('open')) return;
    if(mapPreview.contains(e.target)) return;
    if(e.target.closest('.leaflet-marker-icon')) return;
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
  hamburgerBtn.addEventListener('click', ()=>{
    setMobileMenu(!hamburgerBtn.classList.contains('open'));
  });
  mobileMenu.querySelectorAll('a').forEach(a=>{
    a.addEventListener('click', ()=>setMobileMenu(false));
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
    const items = activeStop[activeCat] || [];
    const idx = items.findIndex(x=>slug(x.name)===mp[1]);
    if(idx>=0) activeDetail = idx;
  }
}

buildHeroScene();
fromHash();
renderChips();
renderStop();
renderEvents();
initMap();
updateRouteBar();
