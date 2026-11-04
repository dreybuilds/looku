// Retire the shopper service worker previously registered on this origin.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('looku-shell-'))await caches.delete(key);
 await self.clients.claim();
 await self.registration.unregister();
 for(const client of await self.clients.matchAll({type:'window'}))await client.navigate(self.location.origin+'/');
})()));
