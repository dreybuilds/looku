// R2's conditional writes choose one signed envelope per order before any broadcast.
import { makeChain, nativeAsset, HttpError } from '../payments/chain.mjs';
import { ITEM, SKU, NETWORK, BASE } from '../payments/common.mjs';
import { StrKey } from '@stellar/stellar-sdk';
import assets from 'looku:public';
import {backup} from './backup.mjs';
import {searchPins} from './pinterest.mjs';
const json=(status,obj,headers={})=>Response.json(obj,{status,headers:{'Cache-Control':'no-store',...headers}});
const encoded=obj=>btoa(JSON.stringify(obj));
function terms(chain){return {scheme:'exact',network:NETWORK,asset:nativeAsset,amount:'10000000',payTo:chain.merchant,maxTimeoutSeconds:120,extra:{areFeesSponsored:true}}}
function receipt(row){const {id,status,merchant,platform,address,purchaseTx,payoutTx}=row;return {id,status,merchant,platform,address,purchaseTx,payoutTx,item:ITEM.name,sku:SKU,amount:ITEM.amount,commission:ITEM.commission,currency:ITEM.currency,network:NETWORK}}
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
 if(out.status==='SUCCESS')await update({status:'complete',payoutTx:out.hash});
 if(out.status==='FAILED')await update({payoutXdr:null});
 }
}
function matches(a,b){return a&&typeof a==='object'&&Object.keys(a).length===Object.keys(b).length&&Object.entries(b).every(([k,v])=>typeof v==='object'?matches(a[k],v):a[k]===v)}
async function handle(request,env){
 const url=new URL(request.url),p=url.pathname;
 if(Object.hasOwn(assets,p)&&['GET','HEAD'].includes(request.method)){const [type,text]=assets[p];return new Response(request.method==='HEAD'?null:(type.startsWith('image/')||type==='model/gltf-binary')?Uint8Array.from(atob(text),c=>c.charCodeAt(0)):text,{headers:{'Content-Type':type,'X-Content-Type-Options':'nosniff'}})}
 if(p==='/api/wardrobe-backup')return backup(request,env);
 if(p==='/api/pinterest/search')return searchPins(request,env);
 if(!p.startsWith(BASE+'/'))return json(404,{error:'Not found'});
 if(request.headers.has('origin')&&request.headers.get('origin')!==url.origin)throw new HttpError(403,'Use checkout from the looku studio.');
 const chain=makeChain(env),offer=terms(chain),bucket=env.ORDERS;
 if(p===BASE+'/catalog'&&request.method==='GET')return json(200,{items:[ITEM],network:NETWORK,asset:nativeAsset,merchant:chain.merchant,platform:chain.platform});
 if(p===BASE+'/orders'&&request.method==='POST'){
 const {sku,address}=await request.json();if(sku!==SKU||!StrKey.isValidEd25519PublicKey(address||''))throw new HttpError(400,'Choose the demo jacket and a valid Stellar address.');
 const row={id:crypto.randomUUID(),status:'awaiting_signature',address,merchant:chain.merchant,platform:chain.platform,purchaseTx:null,payoutTx:null};
 await bucket.put('orders/'+row.id,JSON.stringify(row));return json(201,receipt(row));
 }
 const route=p.match(/^\/api\/payments\/orders\/([a-f0-9-]{36})(\/checkout)?$/);
 if(!route)throw new HttpError(404,'Unknown route.');
 const order=await load(bucket,route[1]),{row,update}=order;
 if(!route[2]&&request.method==='GET'){await reconcile(chain,order);return json(200,receipt(row))}
 if(!route[2]||request.method!=='POST')throw new HttpError(405,'Unsupported method.');
 if(row.status==='awaiting_signature'){
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
 return json(200,receipt(row),row.purchaseTx?{'Payment-Response':encoded({success:true,network:NETWORK,transaction:row.purchaseTx,payer:row.address})}:{});
}
export default {async fetch(request,env){try{return await handle(request,env)}catch(e){if(!e.status)console.error('Checkout unavailable:',e.name);return json(e.status||503,{error:e.status?e.message:'Could not reach the testnet checkout service. Refresh your receipt to retry.'})}}};
