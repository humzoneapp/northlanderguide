/* ==================================================================
   THE NORTHLANDER WAYFINDER — APP LOGIC
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
   HERO SCENE — fill in the pine ridge and rail ties procedurally so
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

/* Small per-card illustrated tile — used when a listing has no photo.
   A simple coloured scene keyed to the category so cards never show
   a broken image box. */
function cardArt(cat, seed){
  const palettes = {
    restaurants:['#d96c2c','#8a3d12'], accommodations:['#3f6f88','#21465a'],
    parks:['#2a7d57','#12492f'],       attractions:['#dca33c','#8a6312']
  };
  const [c1,c2] = palettes[cat] || palettes.attractions;
  const n = seed % 3;
  const icon = cat==='restaurants' ? '\u{1F37D}' : cat==='accommodations' ? '\u{1F6CF}'
             : cat==='parks' ? '\u{1F332}' : '\u{1F4CD}';
  return `
  <svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><linearGradient id="cg${cat}${seed}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient></defs>
    <rect width="400" height="220" fill="url(#cg${cat}${seed})"/>
    <circle cx="${90+n*120}" cy="60" r="46" fill="#ffffff" opacity=".10"/>
    <circle cx="${300-n*90}" cy="170" r="70" fill="#000000" opacity=".10"/>
    <text x="200" y="128" font-size="56" text-anchor="middle">${icon}</text>
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
   INTERACTIVE MAP (Leaflet) — with graceful fallback
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
      m.bindPopup(`<div class="map-pop"><b>${s.name}</b>
          <div class="pop-hook">${s.hook}</div>
          <button onclick="selectStop('${s.id}')">Open guide \u2192</button></div>`);
      markers[s.id]=m;
    });
    map.fitBounds(L.latLngBounds(line).pad(0.12));
  }catch(err){ console.warn('Map failed:', err); renderRouteFallback(); }
}
function renderRouteFallback(){
  const el = document.getElementById('leafmap');
  el.classList.add('map-fallback'); el.style.height='auto';
  el.innerHTML = `<div class="fallback-note">Interactive map unavailable — tap a stop below.</div>
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
   STOP PANEL — list view, or detail view if activeDetail is set
------------------------------------------------------------------- */
function renderStop(){
  if(activeDetail !== null){ renderDetail(); return; }
  const s = activeStop;
  const i = STOPS.indexOf(s);
  document.getElementById('stopPanel').innerHTML = `
    <div class="stop">
      <div class="stop-hero">
        <div class="ord-badge">${i+1}</div>
        ${ s.image
            ? `<img class="stop-photo" src="${s.image}" alt="${s.name}"
                 onerror="this.outerHTML='<div class=&quot;stop-art&quot;>'+document.getElementById('art${i}').innerHTML+'</div>'">
               <div id="art${i}" style="display:none">${stopArt(i)}</div>`
            : stopArt(i) }
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
   DETAIL VIEW — one listing, back button, more cards below
------------------------------------------------------------------- */
function renderDetail(){
  const items = activeStop[activeCat] || [];
  const it = items[activeDetail];
  if(!it){ activeDetail=null; renderStop(); return; }
  const others = items.map((x,i)=>({x,i})).filter(o=>o.i!==activeDetail);

  document.getElementById('stopPanel').innerHTML = `
    <div class="stop detail">
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
   SHARE — shares the stop, or the detail if one is open
------------------------------------------------------------------- */
function shareCurrent(mode){
  let url = location.origin + location.pathname + '#stop=' + activeStop.id;
  let title = `Things to do at ${activeStop.name} on the Northlander train`;
  let text = activeStop.hook;
  if(activeDetail !== null){
    const it = (activeStop[activeCat]||[])[activeDetail];
    if(it){
      url += '&cat='+activeCat+'&place='+slug(it.name);
      title = `${it.name} — ${activeStop.name}`;
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
