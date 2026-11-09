import {privySubject} from './privy.mjs';
import {session} from './account.mjs';
import {paused,pausedReply} from './features.mjs';

const prefix='merchant-stores/';
const reserved=new Set(['mine','admin','www','api','app','mail','email','support','help','account','accounts','store','stores','shop','shops','looku','lookuwear','assets','static','cdn','auth','login','payments','checkout','dev','test','staging']);
const slugPattern=/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
const productPattern=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const error=(status,message)=>reply(status,{error:message});
const fits=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export const validStoreSlug=slug=>typeof slug==='string'&&slugPattern.test(slug)&&!reserved.has(slug);
export function tenantSlug(hostname){
  const match=hostname.match(/^([a-z0-9-]+)\.lookuwear\.xyz$/);
  return match&&!['www','admin'].includes(match[1])?match[1]:null;
}
function publicStore(row){
  return {slug:row.slug,name:row.name,description:row.description,contact:row.contact,status:row.status};
}
async function identity(req,store){
  return await privySubject(req)||(await session(req,store))?.address;
}
async function body(req){
  if(!req.body||Number(req.headers.get('content-length'))>100000)throw Error('Request too large.');
  const reader=req.body.getReader();let size=0;const chunks=[];
  for(;;){
    const {done,value}=await reader.read();if(done)break;
    size+=value.length;if(size>100000){await reader.cancel();throw Error('Request too large.')}
    chunks.push(value);
  }
  return JSON.parse(await new Blob(chunks).text());
}
async function storePage(store,cursor,owner,admin=false){
  const page=await store.list({prefix,limit:20,cursor:cursor||undefined});
  const records=await Promise.all(page.objects.map(async ({key})=>{
    const record=await store.get(key);if(!record)return null;
    const row=await record.json();
    if(!admin&&(owner?row.owner!==owner:row.status!=='approved'))return null;
    return {...publicStore(row),...(owner||admin?{revision:record.etag}:{})};
  }));
  return reply(200,{items:records.filter(Boolean),next:page.truncated?page.cursor:null});
}
export async function merchantStores(req,{ORDERS:store}){
  const url=new URL(req.url);
  const parts=url.pathname.slice('/api/merchant-stores'.length).split('/').filter(Boolean);
  const [slug,resource,productId]=parts;
  const tenant=tenantSlug(url.hostname);
  if(tenant&&(req.method!=='GET'||slug!==tenant))return error(404,'Store not found.');
  if(parts.length>3||(resource&&resource!=='products')||(productId&&!productPattern.test(productId)))return error(404,'Not found.');
  const owner=tenant?null:await identity(req,store);
  if(req.method==='GET'){
    if(productId)return error(404,'Not found.');
    if(!slug)return await paused(store,'storefronts')?reply(200,{items:[],next:null}):storePage(store,url.searchParams.get('cursor'));
    if(slug==='mine')return owner?storePage(store,url.searchParams.get('cursor'),owner):error(401,'Sign in to manage your stores.');
  }
  if(slug&&!validStoreSlug(slug))return error(404,'Store not found.');
  const key=slug?prefix+slug:null,record=key?await store.get(key):null;
  const row=record?await record.json():null,mine=!!owner&&row?.owner===owner;
  if(req.method==='GET'){
    if(!row||!mine&&(row.status!=='approved'||await paused(store,'storefronts')))return error(404,'This store is not available.');
    if(!resource)return reply(200,{...publicStore(row),mine,...(mine?{revision:record.etag}:{})});
    const page=await store.list({prefix:'merchant-products/'+slug+'/',limit:12,cursor:url.searchParams.get('cursor')||undefined});
    const products=await Promise.all(page.objects.map(async ({key})=>{
      const entry=await store.get(key);if(!entry)return null;
      const product=await entry.json();
      if(!mine&&product.status!=='available')return null;
      return {...product,...(mine?{revision:entry.etag}:{})};
    }));
    return reply(200,{items:products.filter(Boolean),next:page.truncated?page.cursor:null});
  }
  if(!owner)return error(401,'Sign in to create or manage your store.');
  if(req.method!=='POST'||req.headers.get('origin')!==url.origin||req.headers.get('x-looku-action')!=='merchant-store')return error(403,'Make changes from your Looku store manager.');
  let data;try{data=await body(req)}catch{return error(400,'Invalid store request.')}
  if(!data||typeof data!=='object')return error(400,'Invalid store request.');
  if(!slug){
    if(await paused(store,'storefronts'))return pausedReply();
    if(!validStoreSlug(data.slug))return error(400,'Choose 3–32 lowercase letters, numbers or hyphens. This address may be reserved.');
    return saveStore(store,owner,data);
  }
  if(!mine)return error(404,'Store not found.');
  if(row.status==='suspended')return error(403,'This store is suspended. Contact Looku support.');
  if(!resource)return saveStore(store,owner,data,row,record);
  if(row.status!=='approved')return error(403,'Your store needs approval before you publish products.');
  if(await paused(store,'storefronts'))return pausedReply();
  if(!productPattern.test(data.id)||productId&&productId!==data.id)return error(400,'Invalid product.');
  const productKey='merchant-products/'+slug+'/'+data.id;
  const existing=await store.get(productKey);
  if(existing?.etag!==data.revision)return error(409,'This product changed. Refresh your store.');
  if(!fits(data.title,100)||typeof data.description!=='string'||data.description.length>1000||
    !Number.isSafeInteger(data.price)||data.price<1||data.price>99999999||
    !['available','sold-out','hidden'].includes(data.status)||typeof data.photo!=='string'||data.photo.length>80000||
    !/^data:image\/webp;base64,UklGR[A-Za-z0-9+/]+=*$/.test(data.photo))return error(400,'Add a product title, photo, price in whole KSh and availability.');
  const product={id:data.id,title:data.title.trim(),description:data.description.trim(),price:data.price,photo:data.photo,status:data.status};
  const saved=await store.put(productKey,JSON.stringify(product),{onlyIf:existing?{etagMatches:existing.etag}:{etagDoesNotMatch:'*'}});
  return saved?reply(existing?200:201,{ok:true}):error(409,'This product changed. Refresh your store.');
}
async function saveStore(store,owner,data,row,record){
  if(!fits(data.name,80)||typeof data.description!=='string'||data.description.length>800||!fits(data.contact,160)||!/^[^\s@?<>&#]+@[^\s@?<>&#]+\.[^\s@?<>&#]+$/.test(data.contact))return error(400,'Enter a store name, description and public contact email.');
  if(row&&data.revision!==record.etag)return error(409,'Your store changed. Refresh before saving.');
  const slug=row?.slug||data.slug;
  const next={slug,owner,name:data.name.trim(),description:data.description.trim(),contact:data.contact.trim(),status:row?.status==='approved'?'approved':'pending'};
  const saved=await store.put(prefix+slug,JSON.stringify(next),{onlyIf:record?{etagMatches:record.etag}:{etagDoesNotMatch:'*'}});
  if(saved)return reply(record?200:201,{slug});
  // A retry after an uncertain create must not claim another merchant's address.
  if(!record){
    const existing=await (await store.get(prefix+slug))?.json();
    if(existing?.owner===owner)return reply(200,{slug});
  }
  return error(409,'That store address is taken, or the record changed. Choose another address or refresh.');
}
export async function adminStores(req,store,data){
  if(req.method==='GET')return storePage(store,new URL(req.url).searchParams.get('cursor'),null,true);
  if(!validStoreSlug(data.slug)||!['approved','rejected','suspended'].includes(data.status))return error(400,'Choose a store and a decision.');
  const key=prefix+data.slug,record=await store.get(key);
  if(!record||record.etag!==data.revision)return error(409,'This store changed. Refresh the list.');
  const row=await record.json();
  const saved=await store.put(key,JSON.stringify({...row,status:data.status}),{onlyIf:{etagMatches:record.etag}});
  return saved?reply(200,{ok:true}):error(409,'This store changed. Refresh the list.');
}
