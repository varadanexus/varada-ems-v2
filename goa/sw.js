const CACHE='goa-afterglow-shell-v12-chat-files';
const BASE=new URL('./',self.location.href);
const SHELL=['./','index.html','style.css','config.js','app.js','pwa.js','layout.js','mobile.css','style.css?v=chat-files-v8','app.js?v=chat-files-v8','pwa.js?v=chat-files-v8','layout.js?v=chat-files-v8','mobile.css?v=chat-files-v8','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png','icons/badge-96.png'].map(p=>new URL(p,BASE).href);
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(SHELL);await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('goa-afterglow-shell-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 // Only this app's public static shell is cached. Trip APIs, sessions and files never are.
 if(event.request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname)||(url.search&&!SHELL.includes(url.href)))return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match(BASE.href)));return}
 if(!SHELL.includes(url.href))return;
 event.respondWith(fetch(event.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(event.request,copy))}return res}).catch(()=>caches.match(event.request)));
});
self.addEventListener('push',event=>{
 let payload={};try{payload=event.data?.json()||{}}catch{}
 const target=new URL(payload.url||'#overview',BASE);
 const safe=target.origin===BASE.origin&&target.pathname.startsWith(BASE.pathname)?target.href:BASE.href+'#overview';
 event.waitUntil(self.registration.showNotification(payload.title||'Goa Afterglow',{body:payload.body||'Your trip has an update.',icon:new URL('icons/icon-192.png',BASE).href,badge:new URL('icons/badge-96.png',BASE).href,tag:payload.tag||'goa-trip-update',data:{url:safe},lang:'en-IN'}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=new URL(event.notification.data?.url||'#overview',BASE);
 const safe=target.origin===BASE.origin&&target.pathname.startsWith(BASE.pathname)?target.href:BASE.href+'#overview';
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(w=>{const u=new URL(w.url);return u.origin===BASE.origin&&u.pathname.startsWith(BASE.pathname)});if(existing){await existing.navigate(safe);return existing.focus()}return self.clients.openWindow(safe)})());
});

