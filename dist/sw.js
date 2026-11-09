const CACHE='looku-shell-customer-stores-1';
const SHELL=['/','/index.html','/app','/welcome.js','/landing.css','/style.css','/vendor/bootstrap-components.css','/app.js','/features.js','/bookings.js','/wishlist.js','/merchant-payment.js','/shopping.js','/community.js','/social.js','/pinterest.js','/email-auth.js','/admin.js','/support.js','/device.js','/wallet.js','/local-wallet.js','/api/payments/client.js','/model.js','/look-prompt.js','/garments.js','/stores.json','/app.webmanifest','/icon-192.png','/icon-512.png','/orchid-portrait.webp','/orchid-detail.webp','/looku-orchid.webp','/orchid-turn.webp','/sample1.webp','/sample2.webp','/sample3.webp','/sample4.webp','/orchid-frames.glb'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await Promise.all(SHELL.map(async path=>{
  const response=await fetch(new Request(path,{cache:'reload',redirect:'error'}));
  if(!response.ok||((path.endsWith('.js')||path.endsWith('.css'))&&response.headers.get('Content-Type')?.includes('text/html')))throw Error('Offline setup incomplete');
  await cache.put(path,response);
 }));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('looku-shell-')&&key!==CACHE)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 const sharedLaunch=u.pathname==='/app' && ['share_url','share_text','share_title'].some(key=>u.searchParams.has(key));
 if(event.request.method!=='GET'||u.origin!==self.location.origin||!SHELL.includes(u.pathname)||(u.search&&!sharedLaunch))return;
 event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(u.pathname)||fetch(event.request)));
});
