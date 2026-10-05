const CACHE='tianyu-shell-r12-20261005';
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
 if(!u.pathname.endsWith('/')&&!/\.(html|png|jpg|webp|css|js|mjs|json)$/.test(u.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),key=normalized(event.request),hit=await cache.match(key);
  const update=fetch(event.request).then(async r=>{if(r.ok)await cache.put(key,r.clone());return r});
  event.waitUntil(update.catch(()=>{}));
  // Render previously loaded pages immediately, while refreshing their cache in the background.
  return hit||update;
 })());
});

let downloading=false,downloadListeners=[];
async function manifest(cache){const key=new URL('offline-manifest.json',ROOT).href;let r=await cache.match(key);if(!r){r=await fetch(key,{cache:'reload'});if(!r.ok)throw Error('离线清单加载失败，请联网后重试。');await cache.put(key,r.clone())}return r.json()}
async function downloadStatus(cache,m){let done=0;for(const file of m.files)if(await cache.match(normalized(new URL(file.path,ROOT).href)))done++;return {done,total:m.files.length,bytes:m.bytes,busy:downloading}}
self.addEventListener('message',event=>{
 const port=event.ports[0];if(!port||!['OFFLINE_STATUS','OFFLINE_DOWNLOAD'].includes(event.data?.type))return;
 event.waitUntil((async()=>{try{
 const cache=await caches.open(CACHE),m=await manifest(cache);
 if(event.data.type==='OFFLINE_STATUS'){port.postMessage(await downloadStatus(cache,m));if(downloading)downloadListeners.push(port);else port.close();return}
 downloadListeners.push(port);if(downloading){port.postMessage(await downloadStatus(cache,m));return}downloading=true;
 const notify=async error=>{const state={...await downloadStatus(cache,m),...(error?{error}:{} )};for(const p of downloadListeners)p.postMessage(state)};
 await notify();let index=0,failed=0;
 async function run(){while(index<m.files.length){const file=m.files[index++],url=new URL(file.path,ROOT).href,key=normalized(url);if(!await cache.match(key)){try{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);let r;try{r=await fetch(url,{cache:'reload',signal:controller.signal})}finally{clearTimeout(timeout)}if(!r.ok)throw Error('download');await cache.put(key,r)}catch{failed++}}await notify()}}
 await Promise.all([run(),run(),run()]);downloading=false;await notify(failed?'部分文件未下载成功，请保持联网后再次点击下载。':undefined);for(const p of downloadListeners)p.close();downloadListeners=[];
 }catch(e){downloading=false;port.postMessage({error:e.message||'下载失败，请重新下载。'});for(const p of downloadListeners)p.close();downloadListeners=[];port.close()}})());
});
