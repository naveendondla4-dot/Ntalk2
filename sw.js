const CACHE='ntalk-v3';
const ASSETS=['./','./index.html','./style.css','./app.js','./config.js','./manifest.json','./icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./favicon.ico'];

self.addEventListener('install',e=>{
 e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
 e.waitUntil(
  caches.keys()
   .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
   .then(()=>self.clients.claim())
 );
});

// Only handle same-origin GETs. Supabase API/realtime/storage calls (cross-origin)
// must always hit the network, otherwise users see stale chats and profiles.
self.addEventListener('fetch',e=>{
 const req=e.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;

 // network-first so deployed updates show up; fall back to cache when offline
 e.respondWith(
  fetch(req)
   .then(res=>{
    if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}
    return res;
   })
   .catch(()=>caches.match(req).then(r=>r||caches.match('./index.html')))
 );
});
