import test from 'node:test';
import assert from 'node:assert/strict';
import {Account,Keypair,Networks,TransactionBuilder} from '@stellar/stellar-sdk';
import {stellarWallet} from './account-wallet.mjs';

function bucket(){
  const rows=new Map();return {
    async get(key){const row=rows.get(key);return row&&{etag:row.etag,json:async()=>JSON.parse(row.text)}},
    async put(key,text,{onlyIf}={}){
      const row=rows.get(key);
      if(onlyIf?.etagDoesNotMatch==='*'&&row||onlyIf?.etagMatches&&onlyIf.etagMatches!==row?.etag)return null;
      const etag=crypto.randomUUID();rows.set(key,{text,etag});return {etag};
    }
  };
}
function fixture(){
  const store=bucket(),key=Keypair.random(),wallets=new Map();let creations=0,signatures=0;
  const api={
    async get(id){const wallet=wallets.get(id);if(!wallet)throw Object.assign(Error(),{status:404});return wallet},
    async create(data){
      assert.equal(data.chain_type,'stellar');assert.ok(data.owner.user_id.startsWith('did:privy:'));
      const id='ext_wal_'+data.external_id;if(wallets.has(id))return wallets.get(id);
      creations++;const wallet={id:'wallet-'+creations,chain_type:'stellar',address:key.publicKey()};wallets.set(id,wallet);return wallet;
    },
    async sign(id,hash,jwt){assert.equal(jwt,'user-token');signatures++;return {signature:'0x'+Buffer.from(key.sign(Buffer.from(hash.slice(2),'hex'))).toString('hex')}}
  };
  const services={api,holdings:async()=>({active:true,trustline:true,balance:'100000000',account:{sequence:'1'}})};
  async function call(path='',data,owner='did:privy:member'){
    const request=new Request('https://lookuwear.xyz/api/stellar-wallet'+path,{headers:{Authorization:'Bearer user-token',Origin:'https://lookuwear.xyz','X-Looku-Action':'stellar-wallet'},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    const response=await stellarWallet(request,{ORDERS:store},owner,services);
    return {status:response.status,data:await response.json()};
  }
  return {call,key,services,get creations(){return creations},get signatures(){return signatures}};
}
test('one user-owned Stellar wallet survives concurrent provisioning and repeat sign-ins',async()=>{
  const f=fixture();assert.equal((await f.call('',{},null)).status,401);
  const values=await Promise.all([f.call('',{}),f.call('',{}),f.call('',{})]);
  assert.ok(values.every(result=>result.status===200&&result.data.address===f.key.publicKey()));
  assert.equal(f.creations,1);await f.call('',{});assert.equal(f.creations,1);
  assert.equal((await f.call('',undefined,'did:privy:another')).data.exists,false);
});
test('wishlist allocations share a balance atomically and are isolated by account and network',async()=>{
  const f=fixture();await f.call('',{});
  const results=await Promise.all(['a','b'].map(ch=>f.call('/budget',{item:ch.repeat(64),amount:'7'})));
  assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
  assert.equal(Object.values((await f.call()).data.budgets).reduce((sum,v)=>sum+BigInt(v),0n),70000000n);
  assert.equal((await f.call('/budget',{item:'c'.repeat(64),amount:'-1'})).status,400);
  assert.deepEqual((await f.call('?network=testnet')).data.budgets,{});
});
test('Stellar payment review binds amount and recipient and retries keep the original hash',async t=>{
  const f=fixture();await f.call('',{});
  const item='a'.repeat(64);await f.call('/budget',{item,amount:'4'});
  const id=crypto.randomUUID(),destination=Keypair.random().publicKey();
  const prepared=await f.call('/prepare',{id,type:'payment',destination,amount:'2',item});assert.equal(prepared.status,200);
  const retry=await f.call('/prepare',{id,type:'payment',destination,amount:'9',item});assert.equal(retry.data.hash,prepared.data.hash);
  assert.equal((await f.call('/prepare',{id:crypto.randomUUID(),type:'payment',destination,amount:'1'})).status,409);
  assert.equal((await f.call('/budget',{item,amount:'9'})).status,409);
  let settled=false,posted=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(options?.method==='POST'){
      const signed=TransactionBuilder.fromXDR(new URLSearchParams(options.body).get('tx'),Networks.PUBLIC);
      assert.equal(Buffer.from(signed.hash()).toString('hex'),prepared.data.hash);
      assert.equal(signed.operations[0].amount,'2.0000000');
      assert.equal(signed.operations[0].destination,destination);
      assert.ok(f.key.verify(signed.hash(),signed.signatures[0].signature));posted++;settled=true;
      return Response.json({successful:true});
    }
    return settled?Response.json({successful:true}):new Response(null,{status:404});
  });
  assert.equal((await f.call('/submit',{id})).data.status,'complete');
  assert.equal((await f.call('/submit',{id})).data.status,'complete');
  assert.equal(posted,1);assert.equal(f.signatures,1);
  assert.equal((await f.call()).data.budgets[item],'20000000');
  assert.equal((await f.call('/receipt/'+id,undefined,'did:privy:another')).data.exists,false);
});

test('Varial cannot swap a reviewed transaction, while the exact signed transaction settles',async t=>{
  const f=fixture(),owner=f.key.publicKey(),call=(path,data)=>f.call(path,data,owner);
  await call('',{});const id=crypto.randomUUID(),destination=Keypair.random().publicKey();
  const prepared=await call('/prepare',{id,type:'payment',amount:'1',destination});
  assert.match(prepared.data.hash,/^[a-f0-9]{64}$/);assert.ok(prepared.data.expires>Date.now()/1000);
  let settled=false,posted=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(options?.method==='POST'){posted++;settled=true;return Response.json({successful:true})}
    return settled?Response.json({successful:true}):new Response(null,{status:404});
  });
  const wrong=TransactionBuilder.fromXDR(prepared.data.xdr,Networks.TESTNET);wrong.sign(f.key);
  assert.equal((await call('/submit',{id,signedXdr:wrong.toXDR()})).status,400);assert.equal(posted,0);
  const signed=TransactionBuilder.fromXDR(prepared.data.xdr,Networks.PUBLIC);signed.sign(f.key);
  assert.equal((await call('/submit',{id,signedXdr:signed.toXDR()})).data.status,'complete');assert.equal(posted,1);
});

test('expired requests require ledger evidence before releasing the account for another payment',async t=>{
  const f=fixture();await f.call('',{});
  const item='d'.repeat(64);await f.call('/budget',{item,amount:'3'});
  const id=crypto.randomUUID(),prepared=await f.call('/prepare',{id,type:'payment',amount:'1',item,destination:Keypair.random().publicKey()});
  t.mock.method(Date,'now',()=>1000*(prepared.data.expires+70));
  let closed=prepared.data.expires-1;
  t.mock.method(globalThis,'fetch',async url=>String(url).includes('/ledgers?')?Response.json({_embedded:{records:[{closed_at:new Date(closed*1000).toISOString()}]}}):new Response(null,{status:404}));
  assert.equal((await f.call('/receipt/'+id)).data.status,'prepared');assert.ok((await f.call()).data.pending);
  closed=prepared.data.expires+10;
  assert.equal((await f.call('/receipt/'+id)).data.status,'expired');assert.equal((await f.call()).data.pending,null);
  assert.equal((await f.call()).data.budgets[item],'30000000');
});
