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
