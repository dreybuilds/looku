import {walletReceipts} from './wallet-receipts.mjs';
import {StrKey} from '@stellar/stellar-sdk';

const ownerEmail='nzauaudrey@gmail.com';
const ownerKey='admin/owner';
const affiliateKey='admin/affiliates';
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const error=(status,message)=>reply(status,{error:message});
const write=(store,key,data,etag)=>store.put(key,JSON.stringify(data),{onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'}});
const conflict=()=>error(409,'This record changed. Refresh and try again.');
const httpsLink=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&value.length<=2000}catch{return false}};

export async function affiliates(store){
 const record=await store.get(affiliateKey);
 return {items:record?await record.json():[],revision:record?.etag||''};
}
export async function admin(req,env){
 const store=env.ORDERS,url=new URL(req.url),path=url.pathname.slice('/api/admin/'.length);
 const id=req.headers.get('oai-authenticated-user-id'),email=req.headers.get('oai-authenticated-user-email');
 const identity=id&&email?.trim().toLowerCase()===ownerEmail;
 if(!identity)return path==='access'&&req.method==='GET'?reply(200,{state:id?'unavailable':'sign-in'}):error(403,'Owner access required.');
 if(path==='access'&&req.method==='GET')return reply(200,{state:'admin'});
 if(req.method!=='GET'&&(req.method!=='POST'||req.headers.get('Origin')!==url.origin||req.headers.get('X-Looku-Action')!=='admin'))return error(403,'Open the admin workspace to make changes.');
 let data={};
 if(req.method==='POST'){
   try{data=await req.json()}catch{return error(400,'Invalid request.')}
   if(!data||typeof data!=='object')return error(400,'Invalid request.');
 }
 const cursor=url.searchParams.get('cursor')||undefined;
 if(path==='affiliates'){
   const {items,revision}=await affiliates(store);
   if(req.method==='GET')return reply(200,{items,revision});
   if(data.revision!==revision)return conflict();
   const existing=items.find(x=>x.id===data.id);
   if(data.id&&!existing)return error(404,'Partner not found.');
   let next=items.filter(x=>x.id!==data.id);
   if(data.remove!==true){
     if(typeof data.name!=='string'||!data.name.trim()||data.name.length>80||typeof data.url!=='string'||!httpsLink(data.url)||next.length>=100)return error(400,'Use a partner name and an HTTPS referral link (100 partners maximum).');
     next.push({id:existing?.id||crypto.randomUUID(),name:data.name.trim(),url:data.url});
   }
   return await write(store,affiliateKey,next,revision)?reply(200,{ok:true}):conflict();
 }
 if(path==='accounts'&&req.method==='GET'){
   const owner=await (await store.get(ownerKey))?.json();
   const page=await store.list({prefix:'wallet-accounts/',limit:20,cursor});
   const rows=await Promise.all(page.objects.map(async x=>{const obj=await store.get(x.key);if(!obj)return null;const {address,createdAt,suspended}=await obj.json();return {address,createdAt,suspended:!!suspended,self:address===owner?.address,revision:obj.etag}}));
   return reply(200,{items:rows.filter(Boolean),next:page.truncated?page.cursor:null});
 }
 if(path==='accounts'&&req.method==='POST'){
   const owner=await (await store.get(ownerKey))?.json();
   if(!StrKey.isValidEd25519PublicKey(data.address||'')||data.address===owner?.address||typeof data.suspended!=='boolean')return error(400,'Choose another valid wallet account.');
   const key='wallet-accounts/'+data.address,obj=await store.get(key);
   if(!obj||obj.etag!==data.revision)return conflict();
   return await write(store,key,{...await obj.json(),suspended:data.suspended},obj.etag)?reply(200,{ok:true}):conflict();
 }
 if(path==='receipts'&&req.method==='GET'){
   const address=url.searchParams.get('address');
   if(!StrKey.isValidEd25519PublicKey(address||''))return error(400,'Choose a wallet account.');
   return reply(200,await walletReceipts(store,address,cursor));
 }
 const review=path.match(/^review\/(sale|donate)(?:\/([a-f0-9]{64}))?$/);
 if(review){
   const prefix='community/'+review[1]+'/';
   if(req.method==='GET'&&!review[2]){
     const page=await store.list({prefix,limit:12,cursor});
     const rows=await Promise.all(page.objects.map(async x=>{const obj=await store.get(x.key);if(!obj)return null;const {id,title,pieces,price,status}=await obj.json();return {id,title,pieces,price,status:status||'pending',revision:obj.etag}}));
     return reply(200,{items:rows.filter(Boolean),next:page.truncated?page.cursor:null});
   }
   if(req.method==='POST'&&review[2]&&['approved','rejected'].includes(data.status)){
     const key=prefix+review[2],obj=await store.get(key);
     if(!obj||obj.etag!==data.revision)return conflict();
     return await write(store,key,{...await obj.json(),status:data.status,reviewedAt:new Date().toISOString()},obj.etag)?reply(200,{ok:true}):conflict();
   }
 }
 return error(404,'Unknown admin action.');
}
