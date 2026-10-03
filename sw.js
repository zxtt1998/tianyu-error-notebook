const CACHE='tianyu-shell-r5-20261003';
const ROOT=new URL('./',self.location.href);
const normalized=request=>{const u=new URL(typeof request==='string'?request:request.url);u.search='';if(u.pathname.endsWith('/index.html'))u.pathname=u.pathname.slice(0,-10);return u.href};
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await Promise.all(['./','technical/','practical/'].map(async p=>{try{const url=new URL(p,ROOT).href,r=await fetch(url,{cache:'reload'});if(r.ok)await cache.put(normalized(url),r)}catch{}}));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('tianyu-shell-')&&k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==ROOT.origin||!u.pathname.startsWith(ROOT.pathname))return;
 if(!u.pathname.endsWith('/')&&!/\.(html|png|jpg|webp|css|js)$/.test(u.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),key=normalized(event.request),hit=await cache.match(key);
  const update=fetch(event.request).then(async r=>{if(r.ok)await cache.put(key,r.clone());return r});
  event.waitUntil(update.catch(()=>{}));
  // Render previously loaded pages immediately, while refreshing their cache in the background.
  return hit||update;
 })());
});
