const CACHE='vokabeltrainer-v12';
const FONTS=['literata-latin-400-normal','literata-latin-ext-400-normal','literata-cyrillic-400-normal',
  'literata-latin-400-italic','literata-latin-ext-400-italic','literata-cyrillic-400-italic',
  'literata-latin-600-normal','literata-latin-ext-600-normal','literata-cyrillic-600-normal',
  'ibm-plex-sans-latin-400-normal','ibm-plex-sans-latin-600-normal',
  'ibm-plex-sans-latin-ext-400-normal','ibm-plex-sans-latin-ext-600-normal'].map(f=>'./fonts/'+f+'.woff2');
const FILES=['./index.html','./manifest.webmanifest','./icon.svg','./apple-touch-icon.png','./kurzbefehl.html'].concat(FONTS);
const APP='./index.html';

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys()
    .then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x))))
    .then(()=>self.clients.claim()));
});

// Die App selbst ist „/“ oder „/index.html“; jede andere Seite (etwa die Kurzbefehl-Anleitung) liegt unter
// ihrer eigenen Adresse im Speicher. Früher überschrieb jede Navigation den Eintrag der App, offline startete
// dann womöglich die Anleitung statt der App.
const isApp=url=>/\/(index\.html)?$/.test(new URL(url).pathname);

// Netz zuerst, damit Aktualisierungen ankommen, aber höchstens 2,5 s warten; danach aus dem Speicher.
// Die Antwort aus dem Netz wird im Hintergrund weiter abgelegt, auch wenn der Speicher schon geantwortet hat.
function page(e){
  const req=e.request, key=isApp(req.url)?APP:req;
  const net=fetch(req).then(r=>{
    // nur vollständige, erfolgreiche Antworten ablegen
    if(r&&r.ok&&r.type==='basic'){ const copy=r.clone(); e.waitUntil(caches.open(CACHE).then(c=>c.put(key,copy))); }
    return r;
  });
  e.waitUntil(net.catch(()=>{}));
  const cached=()=>caches.match(key,{ignoreSearch:true}).then(hit=>hit||caches.match(APP));
  const late=new Promise(res=>setTimeout(()=>cached().then(hit=>{ if(hit) res(hit); }),2500));
  return Promise.race([net.catch(()=>cached()), late]).then(r=>r||cached());
}

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  if(new URL(req.url).origin!==location.origin) return;
  if(req.mode==='navigate'||isApp(req.url)){ e.respondWith(page(e)); return; }
  e.respondWith(
    caches.match(req,{ignoreSearch:true}).then(hit=>hit||fetch(req).then(r=>{
      if(r&&r.ok&&r.type==='basic'){ const copy=r.clone(); e.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy))); }
      return r;
    }))
  );
});
