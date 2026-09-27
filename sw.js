const CACHE='vokabeltrainer-v9';
const FILES=['./','./index.html','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys()
    .then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x))))
    .then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const isPage = req.mode==='navigate' || /\/(index\.html)?$/.test(new URL(req.url).pathname);
  if(isPage){
    // Erst das Netz fragen, damit Aktualisierungen sofort ankommen; offline aus dem Speicher
    e.respondWith(
      fetch(req).then(r=>{
        if(r&&r.ok){ const copy=r.clone(); caches.open(CACHE).then(c=>c.put('./index.html',copy)); }
        return r;
      }).catch(()=>caches.match('./index.html',{ignoreSearch:true}))
    );
    return;
  }
  e.respondWith(
    caches.match(req,{ignoreSearch:true}).then(hit=>hit||fetch(req).then(r=>{
      if(r&&r.ok&&new URL(req.url).origin===location.origin){
        const copy=r.clone(); caches.open(CACHE).then(c=>c.put(req,copy));
      }
      return r;
    }).catch(()=>caches.match('./index.html',{ignoreSearch:true})))
  );
});
