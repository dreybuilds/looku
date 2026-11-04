import test from 'node:test';
import assert from 'node:assert/strict';
import {wishlistFunding} from '../hosting/wishlist-funding.mjs';

test('incoming contributions settle once, reject replay and await finalized transfer evidence',async t=>{
  const rows=new Map();
  const store={
    async get(key){const row=rows.get(key);return row&&{etag:row.etag,text:()=>row.value,json:()=>JSON.parse(row.value)}},
    async put(key,value,{onlyIf}){const old=rows.get(key);if(old&&onlyIf.etagDoesNotMatch==='*'||onlyIf.etagMatches&&old?.etag!==onlyIf.etagMatches)return null;
      const row={value,etag:crypto.randomUUID()};rows.set(key,row);return row}
  };
  const payer='0x'+'1'.repeat(40),payTo='0x'+'2'.repeat(40),nonce='0x'+'3'.repeat(64),tx='0x'+'4'.repeat(64);
  const link=()=>'https://lookuwear.xyz/api/wishlist-funding/'+crypto.randomUUID()+'/'+payTo+'/250000';
  const url=link(),other=link();
  const send=(url,proof)=>wishlistFunding(new Request(url,{headers:proof?{'payment-signature':btoa(JSON.stringify(proof))}:{}}),store);
  const challenge=await send(url);assert.equal(challenge.status,402);
  const {resource,accepts:[accepted]}=await challenge.json();
  const authorization={from:payer,to:payTo,value:'250000',validBefore:String(Math.floor(Date.now()/1000)+115),nonce};
  const proof={x402Version:2,resource,accepted,payload:{authorization,signature:'0x'+'ab'.repeat(65)}};
  let settlements=0,block=10,logs=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.endsWith('/verify'))return Response.json({isValid:true,payer});
    if(url.endsWith('/settle')){settlements++;return Response.json({success:true,network:'eip155:8453',transaction:tx})}
    const {method}=JSON.parse(options.body);
    const results={eth_blockNumber:'0xa',eth_getBlockByNumber:{number:'0x'+block.toString(16),timestamp:'0x1'},eth_getTransactionReceipt:{blockNumber:'0xb',status:'0x1',logs}};
    return Response.json({result:results[method]});
  });
  assert.equal((await send(url,{...proof,accepted:{...accepted,amount:'1'}})).status,400);
  await Promise.all([send(url,proof),send(url,proof)]);
  assert.equal(settlements,1);
  assert.equal((await (await send(url)).json()).finalized,false);
  assert.equal((await send(other,{...proof,resource:{...resource,url:other}})).status,409);
  block=15;
  const topic=a=>'0x'+a.slice(2).padStart(64,'0');
  logs=[{address:accepted.asset,topics:['0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5',topic(payer),nonce]},
    {address:accepted.asset,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topic(payer),topic(payTo)],data:'0x3d090'}];
  const result=await send(url);assert.equal((await result.json()).finalized,true);
  assert.equal(JSON.parse(atob(result.headers.get('payment-response'))).transaction,tx);
  assert.equal((await (await send(url,proof)).json()).finalized,true);
  assert.equal(settlements,1);
});

import {wishlistMpesa} from '../hosting/wishlist-mpesa.mjs';
test('MiniSend prompt retries reuse the provider order and only a matching release is exposed',async t=>{
 const bucket=new Map(),store={
   async get(key){return bucket.get(key)},
   async put(key,value){const row={etag:crypto.randomUUID(),json:async()=>JSON.parse(value)};bucket.set(key,row);return row}
 };
 const env={MINISEND_API_KEY:'test',ORDERS:store};
 const base='https://example.test',url=base+'/api/wishlist-mpesa/'+crypto.randomUUID(),orderId=crypto.randomUUID();
 const address='0x'+'1'.repeat(40),hash='0x'+'2'.repeat(64);
 const body={phone:'0700000000',kes:1000,address};
 const send=()=>new Request(url,{method:'POST',headers:{origin:base,'X-Looku-Action':'wishlist-mpesa'},body:JSON.stringify(body)});
 let created=0,lookup;
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
   if(opts.method==='POST'){
     created++;const submitted=JSON.parse(opts.body);
     assert.equal(opts.headers['Idempotency-Key'],submitted.reference);
     lookup={order_id:orderId,external_reference:submitted.reference,release_chain:'base',release_asset:'USDC',release_address:address,amount_local:1000,amount_usdc:7.62,currency:'KES',payment_method:'mpesa',status:'pending',customer_phone:body.phone};
     return Response.json(lookup);
   }
   return Response.json(lookup);
 });
 assert.equal((await wishlistMpesa(send(),env,null)).status,401);
 await wishlistMpesa(send(),env,'member');await wishlistMpesa(send(),env,'member');assert.equal(created,1);
 const read=async owner=>(await wishlistMpesa(new Request(url),env,owner)).json();
 assert.equal((await wishlistMpesa(new Request(url),env,'another member')).status,403);
 lookup.status='completed';assert.deepEqual(await read('member'),{status:'pending'});
 lookup.release_tx_hash=hash;assert.deepEqual(await read('member'),{status:'released',transaction:hash,address,usdc:'7.62'});
 lookup.release_address='0x'+'3'.repeat(40);await assert.rejects(()=>read('member'),/Mismatched/);
});
