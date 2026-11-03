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
