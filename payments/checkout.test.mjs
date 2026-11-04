import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair } from '@stellar/stellar-sdk'
import { checkout, HttpError } from './checkout.mjs'
import { SKU } from './common.mjs'

function fixture() {
  const address = Keypair.random().publicKey()
  const counts = { settles:0, payouts:0 }
  let uncertain = true
  const chain = {
    merchant:Keypair.random().publicKey(), platform:Keypair.random().publicKey(),
    async settle(payload,offer,payer,record) {
      counts.settles++
      assert.equal(payer,address)
      await record('signed-purchase')
      if (uncertain) { uncertain=false; throw Error('network disconnected after submission') }
      return 'purchase-hash'
    },
    async reconcile(xdr) {
      assert.ok(['signed-purchase','signed-payout'].includes(xdr))
      return {status:'SUCCESS',hash:xdr === 'signed-purchase' ? 'purchase-hash' : 'payout-hash'}
    },
    async prepareCommission() {counts.payouts++;return 'signed-payout'}
  }
  const shop = checkout({file:':memory:',chain})
  const makeOrder = () => shop.create(SKU,address).id
  const makeProof = id => ({x402Version:2,accepted:shop.offer,resource:{url:'/order/'+id},payload:{transaction:'test-authorization'}})
  return {shop,counts,makeOrder,makeProof}
}
test('recovers an uncertain purchase without another charge and records one affiliate payment',async () => {
  const {shop,counts,makeOrder,makeProof} = fixture()
  const id = makeOrder(), payload = makeProof(id)
  const first = await shop.pay(id,payload,payload.resource)
  assert.equal(first.status,'confirming_purchase')
  assert.equal(first.purchaseTx,null)
  const [a,b] = await Promise.all([shop.pay(id,payload,payload.resource),shop.refresh(id)])
  assert.equal(a.status,'complete');assert.deepEqual(a,b)
  assert.deepEqual([a.purchaseTx,a.payoutTx],['purchase-hash','payout-hash'])
  assert.deepEqual(counts,{settles:1,payouts:1})
  const other = makeOrder(), replay = makeProof(other)
  await assert.rejects(shop.pay(other,replay,replay.resource),e => e instanceof HttpError && e.status===409)
})
test('rejects wrong network, altered price and a swapped order before settling',async () => {
  const {shop,counts,makeOrder,makeProof} = fixture()
  const id = makeOrder(), proof = makeProof(id)
  for (const accepted of [{...proof.accepted,amount:'1'},{...proof.accepted,network:'stellar:pubnet'}])
    await assert.rejects(shop.pay(id,{...proof,accepted},proof.resource),{status:400})
  await assert.rejects(shop.pay(id,proof,{url:'/different-order'}),{status:400})
  assert.equal(counts.settles,0)
})

import {planPurchase,chooseOffer,checkBudget} from './shopping-agent.mjs'
import {indexPaidOrder,walletReceipts} from '../hosting/wallet-receipts.mjs'

test('agent refuses over-budget, stale, substituted and unsponsored offers before signing',()=>{
 const {shop,makeOrder}=fixture()
 const id=makeOrder(),address=shop.receipt(id).address,resource='https://demo.test/orders/'+id+'/checkout'
 const input={address,sku:SKU,resource}
 const challenge={x402Version:2,resource:{url:resource},accepts:[shop.offer]}
 for(const limit of ['0.9999999','1e5','Infinity','-5','0.00000001'])assert.throws(()=>checkBudget(limit))
 const plan=planPurchase({...input,limit:'2',catalog:shop.catalog},0)
 assert.equal(chooseOffer(plan,challenge,input,5000),shop.offer)
 assert.throws(()=>chooseOffer(plan,challenge,input,120000))
 for(const changes of [{address:'other'},{resource:resource+'/different'},{sku:'other'}])
   assert.throws(()=>chooseOffer(plan,challenge,{...input,...changes},0))
 for(const changes of [{amount:'20000000'},{payTo:address},{asset:'USDC'},{network:'stellar:pubnet'},{extra:{areFeesSponsored:false}},{maxTimeoutSeconds:3600}])
   assert.throws(()=>chooseOffer(plan,{...challenge,accepts:[{...shop.offer,...changes}]},input,0))
})
test('a wallet history exposes only its own confirmed orders, including after a retry',async()=>{
 const rows=new Map()
 const store={put:async(k,v)=>rows.set(k,v),list:async({prefix})=>({objects:[...rows.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}),get:async(k)=>rows.has(k)?{json:async()=>rows.get(k)}:null}
 for(const [id,address,purchaseTx] of [['a','alice','paid'],['b','bob','paid'],['c','alice',null]]){
   const row={id,address,purchaseTx,status:'complete'}
   rows.set('orders/'+id,row);await indexPaidOrder(store,row);await indexPaidOrder(store,row)
 }
 assert.deepEqual((await walletReceipts(store,'alice')).receipts.map(r=>r.id),['a'])
 assert.deepEqual((await walletReceipts(store,'bob')).receipts.map(r=>r.id),['b'])
})

test('demo retailer binds the selected size and referral to an order while omitting personal delivery fields',()=>{
 const {shop}=fixture(),address=Keypair.random().publicKey();
 const details={jacket:'L',name:'Test Buyer',street:'42 Demo Lane',city:'Nairobi',country:'Kenya',referral:'looku'};
 const order=shop.create(SKU,address,details);
 assert.deepEqual(shop.receipt(order.id).selection,{size:'L',variant:'cropped-jacket-l',referral:'looku'});
 assert(!JSON.stringify(order).includes(details.street));
 for(const change of [{street:''},{jacket:'unknown'},{referral:'other'}])assert.throws(()=>shop.create(SKU,address,{...details,...change}));
});
