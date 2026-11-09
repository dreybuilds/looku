import {merchantStores} from './merchant-stores.mjs';
import {stellarWallet} from '../payments/account-wallet.mjs';
import {wishlistMpesa} from './wishlist-mpesa.mjs';
import {privySubject} from './privy.mjs';
import {wishlistFunding} from './wishlist-funding.mjs';
import {settings,requiredFeatures,paused,pausedReply} from './features.mjs';
import {bookings} from './bookings.mjs';
import {support} from './support.mjs';
import {demoSelection} from '../payments/demo-order.mjs';
import {admin,affiliates} from './admin.mjs';
import {indexPaidOrder} from './wallet-receipts.mjs';
import {community} from './community.mjs';
import {account,session} from './account.mjs';
// R2's conditional writes choose one signed envelope per order before any broadcast.
import { makeChain, nativeAsset, HttpError } from '../payments/chain.mjs';
import { ITEM, SKU, NETWORK, BASE } from '../payments/common.mjs';
import { StrKey } from '@stellar/stellar-sdk';
import assets from 'looku:public';
import {backup} from './backup.mjs';
import {pinterestAccount} from './pinterest-account.mjs';
import {searchPins} from './pinterest.mjs';
const json=(status,obj,headers={})=>Response.json(obj,{status,headers:{'Cache-Control':'no-store',...headers}});
const encoded=obj=>btoa(JSON.stringify(obj));
function terms(chain){return {scheme:'exact',network:NETWORK,asset:nativeAsset,amount:'10000000',payTo:chain.merchant,maxTimeoutSeconds:120,extra:{areFeesSponsored:true}}}
function receipt(row){const {id,status,merchant,platform,address,purchaseTx,payoutTx}=row;return {id,status,merchant,platform,address,purchaseTx,payoutTx,selection:row.selection||null,item:ITEM.name,sku:SKU,amount:ITEM.amount,commission:ITEM.commission,currency:ITEM.currency,network:NETWORK}}
async function load(bucket,id){
 const key='orders/'+id,r=await bucket.get(key);if(!r)throw new HttpError(404,'Receipt not found.');
 let etag=r.etag;const row=await r.json();
 async function update(fields){const next={...row,...fields};const written=await bucket.put(key,JSON.stringify(next),{onlyIf:{etagMatches:etag}});if(!written)throw new HttpError(409,'Order updated. Refresh the receipt.');etag=written.etag;Object.assign(row,fields)}
 return {row,update}
}
async function reconcile(chain,order){
 const {row,update}=order;
 if(row.merchant!==chain.merchant||row.platform!==chain.platform)throw new HttpError(409,'The merchant configuration changed. Check the original receipt.');
 if(row.status==='confirming_purchase'){
 const out=await chain.reconcile(row.purchaseXdr);
 if(out.status==='SUCCESS')await update({status:'payout_pending',purchaseTx:out.hash});
 if(out.status==='FAILED')await update({status:'failed'});
 }
 if(row.status==='payout_pending'){
 if(!row.payoutXdr)await update({payoutXdr:await chain.prepareCommission(row.id)});
 const out=await chain.reconcile(row.payoutXdr);
 if(out.status==='SUCCESS')await update({status:'complete',payoutTx:out.hash,paidAt:new Date().toISOString()});
 if(out.status==='FAILED')await update({payoutXdr:null});
 }
}
function matches(a,b){return a&&typeof a==='object'&&Object.keys(a).length===Object.keys(b).length&&Object.entries(b).every(([k,v])=>typeof v==='object'?matches(a[k],v):a[k]===v)}
async function handle(request,env){
 const url=new URL(request.url),p=url.pathname;
 if(/^\/store\/[a-z0-9-]+\/?$/.test(p)&&assets['/storefront.html']&&request.method==='GET')return new Response(assets['/storefront.html'][1],{headers:{'Content-Type':'text/html; charset=utf-8'}});
 if(p==='/api/merchant-stores'||p.startsWith('/api/merchant-stores/'))return merchantStores(request,env);
 if(Object.hasOwn(assets,p)&&['GET','HEAD'].includes(request.method)){const [type,text]=assets[p];return new Response(request.method==='HEAD'?null:(type.startsWith('image/')||type==='model/gltf-binary')?Uint8Array.from(atob(text),c=>c.charCodeAt(0)):text,{headers:{'Content-Type':type,'X-Content-Type-Options':'nosniff'}})}
 if(p==='/api/features'&&request.method==='GET')return json(200,{enabled:(await settings(env.ORDERS)).enabled});
 const required=requiredFeatures(p,request.method);
 if(required.length){
   const {enabled}=await settings(env.ORDERS);
   if(required.some(key=>!enabled[key]))return pausedReply();
 }
 if(p==='/api/stellar-wallet'||p.startsWith('/api/stellar-wallet/')){
   const owner=await privySubject(request)||(await session(request,env.ORDERS))?.address;
   return stellarWallet(request,env,owner);
 }
 if(p==='/api/bookings')return bookings(request,env);
 if(p==='/api/wishlist-mpesa'||p.startsWith('/api/wishlist-mpesa/')){
   const owner=p==='/api/wishlist-mpesa'?null:await privySubject(request)||(await session(request,env.ORDERS))?.address;
   try{return await wishlistMpesa(request,env,owner)}catch{return json(503,{error:'Unable to confirm the M-Pesa order. Retry the same request.'})}
 }
 if(p.startsWith('/api/wishlist-funding/'))return wishlistFunding(request,env.ORDERS);
 if(p==='/api/support')return support(request,env);
 if(p.startsWith('/api/admin/'))return admin(request,env,async id=>{
   const order=await load(env.ORDERS,id);
   if(order.row.status==='payout_pending')await reconcile(makeChain(env),order);
   await indexPaidOrder(env.ORDERS,order.row);
   return json(200,{status:order.row.status});
 });
 if(p==='/api/affiliates'&&request.method==='GET')return json(200,{items:(await affiliates(env.ORDERS)).items});
 if(p==='/api/community'||p.startsWith('/api/community/'))return community(request,env);
 if(p==='/api/account'||p.startsWith('/api/account/')||p==='/api/stylist/gpt')return account(request,env);
 if(p==='/api/wardrobe-backup')return backup(request,env);
 if(p==='/api/pinterest/search')return searchPins(request,env);
 if(p.startsWith('/api/pinterest/'))return pinterestAccount(request,env);
 if(!p.startsWith(BASE+'/'))return json(404,{error:'Not found'});
 if(request.headers.has('origin')&&request.headers.get('origin')!==url.origin)throw new HttpError(403,'Use checkout from the looku studio.');
 const chain=makeChain(env),offer=terms(chain),bucket=env.ORDERS;
 if(p===BASE+'/catalog'&&request.method==='GET')return json(200,{items:[ITEM],network:NETWORK,asset:nativeAsset,merchant:chain.merchant,platform:chain.platform});
 if(p===BASE+'/orders'&&request.method==='POST'){
 const {sku,address,details}=await request.json();
 let selection;try{selection=demoSelection(details)}catch(error){throw new HttpError(400,error.message)}
 if(sku!==SKU||!StrKey.isValidEd25519PublicKey(address||''))throw new HttpError(400,'Choose the demo jacket and a valid Stellar address.');
 if((await (await bucket.get('wallet-accounts/'+address))?.json())?.suspended)throw new HttpError(403,'Wallet account suspended.');
 const row={id:crypto.randomUUID(),selection,status:'awaiting_signature',address,merchant:chain.merchant,platform:chain.platform,purchaseTx:null,payoutTx:null,
   amount:ITEM.amount,commission:ITEM.commission,currency:ITEM.currency,network:NETWORK,createdAt:new Date().toISOString()};
 await bucket.put('orders/'+row.id,JSON.stringify(row));return json(201,receipt(row));
 }
 const route=p.match(/^\/api\/payments\/orders\/([a-f0-9-]{36})(\/checkout)?$/);
 if(!route)throw new HttpError(404,'Unknown route.');
 const order=await load(bucket,route[1]),{row,update}=order;
 if(!route[2]&&request.method==='GET'){await reconcile(chain,order);await indexPaidOrder(bucket,row);return json(200,receipt(row))}
 if(!route[2]||request.method!=='POST')throw new HttpError(405,'Unsupported method.');
 if(row.status==='awaiting_signature'){
 if(await paused(bucket,'boutique'))return pausedReply();
 if((await (await bucket.get('wallet-accounts/'+row.address))?.json())?.suspended)throw new HttpError(403,'Wallet account suspended.');
 const resource={url:url.origin+p,description:'looku demo cropped jacket',mimeType:'application/json'};
 const header=request.headers.get('Payment-Signature');if(!header){const challenge={x402Version:2,resource,accepts:[offer]};return json(402,challenge,{'Payment-Required':encoded(challenge)})}
 let payload;try{payload=JSON.parse(atob(header))}catch{throw new HttpError(400,'Invalid payment header.')}
 if(header.length>32000||payload?.x402Version!==2||payload.resource?.url!==resource.url||!matches(payload.accepted,offer)||typeof payload.payload?.transaction!=='string')throw new HttpError(400,'Authorization does not match the order.');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload.payload.transaction));
 const proof=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 try{
 const hash=await chain.settle(payload,offer,row.address,async xdr=>{
 const key='authorizations/'+proof;
 const reserved=await bucket.put(key,row.id,{onlyIf:{etagDoesNotMatch:'*'}});
 if(!reserved&&(await (await bucket.get(key))?.text())!==row.id)throw new HttpError(409,'Authorization already used.');
 await update({status:'confirming_purchase',purchaseXdr:xdr});
 });
 await update({status:'payout_pending',purchaseTx:hash});
 }catch(err){if(row.status==='awaiting_signature')throw err;return json(200,receipt(row))}
 }
 try{await reconcile(chain,order)}catch(err){if(err.status)throw err}
 await indexPaidOrder(bucket,row);
 return json(200,receipt(row),row.purchaseTx?{'Payment-Response':encoded({success:true,network:NETWORK,transaction:row.purchaseTx,payer:row.address})}:{});
}
export default {async fetch(request,env){try{return await handle(request,env)}catch(e){if(!e.status)console.error('Checkout unavailable:',e.name);return json(e.status||503,{error:e.status?e.message:'Could not reach the testnet checkout service. Refresh your receipt to retry.'})}}};
