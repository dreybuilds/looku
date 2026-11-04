import { planPurchase, chooseOffer } from './shopping-agent.mjs'
import { ExactStellarScheme } from '@x402/stellar/exact/client'
import { createEd25519Signer } from '@x402/stellar'
import { checkout, makeChain } from './checkout.mjs'
import { BASE, SKU, NETWORK } from './common.mjs'
import { mkdirSync } from 'node:fs'
import { service } from './server.mjs'

const shopper = createEd25519Signer(process.env.LOOKU_SHOPPER_TEST_SECRET,NETWORK)
mkdirSync('.data',{recursive:true,mode:0o700})
const shop = checkout({file:'.data/smoke.sqlite',chain:makeChain(process.env)})
const api = service(shop)
await new Promise(resolve => api.listen(0,'127.0.0.1',resolve))
try {
  const base = 'http://127.0.0.1:' + api.address().port + BASE
  const order = await (await fetch(base+'/orders',{method:'POST',body:JSON.stringify({sku:SKU,address:shopper.address})})).json()
  const url = base+'/orders/'+order.id+'/checkout'
  const response = await fetch(url,{method:'POST'})
  if (response.status !== 402) throw Error('Expected an x402 challenge')
  const challenge = await response.json()
  const catalog = await (await fetch(base+'/catalog')).json()
  const plan = planPurchase({sku:SKU,address:shopper.address,limit:'1.00',catalog})
  const offer = chooseOffer(plan,challenge,{sku:SKU,address:shopper.address,resource:url})
  const signed = await new ExactStellarScheme(shopper).createPaymentPayload(2,offer)
  const payload = {...signed,accepted:offer,resource:challenge.resource}
  const paid = await fetch(url,{method:'POST',headers:{'Payment-Signature':Buffer.from(JSON.stringify(payload)).toString('base64')}})
  const first = await paid.json()
  if (!paid.ok) throw Error(first.error)
  for (let i = 0; i < 30; i++) {
    const receipt = await shop.refresh(order.id)
    if (receipt.status === 'complete') { console.log(JSON.stringify(receipt,null,2)); break }
    if (receipt.status === 'failed' || i===29) throw Error('Testnet receipt status: ' + receipt.status)
    await new Promise(resolve=>setTimeout(resolve,1500))
  }
} finally {api.close()}
