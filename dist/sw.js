const CACHE='looku-shell-personal-business-v1';
const SHELL=['/experience.js','/landing.js','/fonts/dm-sans-400-normal.ttf','/fonts/dm-sans-500-normal.ttf','/fonts/dm-sans-600-normal.ttf','/fonts/dm-sans-700-normal.ttf','/fonts/dm-serif-display-400-italic.ttf','/fonts/dm-serif-display-400-normal.ttf','/earnings.js','/','/index.html','/app','/welcome.js','/landing.css','/style.css','/ui.css','/ui.js','/vendor/bootstrap-components.css','/merchant-stores.js','/store-branding.js','/app.js','/features.js','/bookings.js','/wishlist.js','/merchant-payment.js','/shopping.js','/community.js','/social.js','/pinterest.js','/inspiration.js','/inspiration-data.js','/pinterest-board.html','/pinterest-board.js','/email-auth.js','/admin.js','/support.js','/device.js','/wallet.js','/stellar-wallet.js','/local-wallet.js','/api/payments/client.js','/model.js','/style-options.js','/choice-picker.js','/look-prompt.js','/garments.js','/stores.json','/app.webmanifest','/icon-192.png','/icon-512.png','/orchid-portrait.webp','/orchid-detail.webp','/looku-orchid.webp','/orchid-turn.webp','/sample1.webp','/sample2.webp','/sample3.webp','/sample4.webp','/orchid-frames.glb'];
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
 const modeLaunch=['/','/app'].includes(u.pathname)&&['personal','business'].includes(u.searchParams.get('mode'))&&[...u.searchParams.keys()].every(key=>key==='mode');
 if(event.request.method!=='GET'||u.origin!==self.location.origin||!SHELL.includes(u.pathname)||(u.search&&!sharedLaunch&&!modeLaunch))return;
 event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(u.pathname)||fetch(event.request)));
});
