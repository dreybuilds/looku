const labels = {
  storefronts:'Merchant storefronts',
  bookings:'Stylist and beauty booking requests', donate:'Closet donations', sale:'Closet sales',
  look:'Published looks', shops:'Affiliate store directory', support:'New support requests',
  pinterest:'Pinterest tools', advice:'Online styling advice', backup:'New wardrobe backups',
  boutique:'Demo boutique orders', mpesa:'M-Pesa top-ups', funding:'Wishlist contribution links',
  preview:'Retailer product previews', social:'New social profile tags',
  merchant:'Wishlist merchant checkout', wishlist:'Save new wishlist items'
};
const key='admin/features';
export async function settings(store){
  const record=await store.get(key);
  const stored=record?await record.json():{};
  const enabled=Object.fromEntries(Object.keys(labels).map(id=>[id,stored[id]!==false]));
  return {enabled,revision:record?.etag||''};
}
export async function featureControls(request,store,data){
  const current=await settings(store);
  const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  if(request.method==='GET')return reply(200,{...current,labels});
  if(typeof data.id!=='string'||!Object.hasOwn(labels,data.id)||typeof data.enabled!=='boolean')return reply(400,{error:'Choose a feature and its new state.'});
  if(data.revision===current.revision){
    const saved=await store.put(key,JSON.stringify({...current.enabled,[data.id]:data.enabled}),{onlyIf:current.revision?{etagMatches:current.revision}:{etagDoesNotMatch:'*'}});
    if(saved)return reply(200,{ok:true});
  }
  return reply(409,{error:'These settings changed. Reopen App features to see the latest state.'});
}
export async function paused(store,id){
  return !(await settings(store)).enabled[id];
}
export const pausedReply=()=>Response.json({error:'This feature is currently paused.'},{status:403,headers:{'Cache-Control':'no-store'}});
export function requiredFeatures(path,method){
  const kind=path.match(/^\/api\/community\/(look|donate|sale)(?:\/|$)/)?.[1];
  if(kind&&method!=='DELETE')return [kind];
  if(path.startsWith('/api/pinterest/')&&method!=='DELETE')return ['import','publish'].includes(path.split('/').pop())?['pinterest','look']:['pinterest'];
  if(path==='/api/community/profile'&&method==='POST')return ['social'];
  if(path==='/api/affiliates')return ['shops'];
  if(path==='/api/stylist/gpt')return ['advice'];
  if(path==='/api/payments/orders'&&method==='POST')return ['boutique'];
  if(path==='/api/wardrobe-backup'&&['PUT','POST'].includes(method))return ['backup'];
  if(path==='/api/bookings'&&method==='POST')return ['bookings'];
  return [];
}
