import {demoSelection} from './demo-order.mjs'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID, createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { StrKey } from '@stellar/stellar-sdk'
import { ITEM, NETWORK, SKU } from './common.mjs'
import { HttpError, nativeAsset } from './chain.mjs'
export { HttpError, makeChain, nativeAsset } from './chain.mjs'

export function checkout({file, chain}) {
  const db = new DatabaseSync(file)
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, address TEXT NOT NULL, merchant TEXT NOT NULL, platform TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'awaiting_signature', proof TEXT UNIQUE,
      purchaseXdr TEXT, purchaseTx TEXT UNIQUE, payoutXdr TEXT, payoutTx TEXT UNIQUE
    )`)
  if(!db.prepare('PRAGMA table_info(orders)').all().some(col=>col.name==='selection'))db.exec('ALTER TABLE orders ADD COLUMN selection TEXT');
  let queue = Promise.resolve()
  function serial(task) { const run = queue.then(task); queue = run.catch(() => {}); return run }
  function get(id) {
    const row = db.prepare('SELECT * FROM orders WHERE id=?').get(id)
    if (!row) throw new HttpError(404,'Receipt not found.')
    return row
  }
  function receipt(id) {
    const {status,purchaseTx,payoutTx,platform,merchant,address,selection} = get(id)
    return {id,status,selection:selection?JSON.parse(selection):null,item:ITEM.name,sku:SKU,amount:ITEM.amount,commission:ITEM.commission,
      currency:ITEM.currency,network:NETWORK,purchaseTx,payoutTx,platform,merchant,address}
  }
  const offer = {scheme:'exact',network:NETWORK,asset:nativeAsset,amount:'10000000',
    payTo:chain.merchant,maxTimeoutSeconds:120,extra:{areFeesSponsored:true}}
  async function advance(id) {
    let row = get(id)
    if (row.merchant !== chain.merchant || row.platform !== chain.platform) return receipt(id)
    if (row.status === 'confirming_purchase' && row.purchaseXdr) {
      const result = await chain.reconcile(row.purchaseXdr)
      if (result.status === 'FAILED') db.prepare("UPDATE orders SET status='failed' WHERE id=?").run(id)
      if (result.status === 'SUCCESS')
        db.prepare("UPDATE orders SET status='payout_pending',purchaseTx=? WHERE id=?").run(result.hash,id)
      row = get(id)
    }
    if (row.status === 'payout_pending') {
      if (!row.payoutXdr) {
        const xdr = await chain.prepareCommission(id)
        db.prepare('UPDATE orders SET payoutXdr=? WHERE id=?').run(xdr,id)
      }
      const result = await chain.reconcile(get(id).payoutXdr)
      if (result.status === 'SUCCESS')
        db.prepare("UPDATE orders SET status='complete',payoutTx=? WHERE id=?").run(result.hash,id)
      if (result.status === 'FAILED') db.prepare('UPDATE orders SET payoutXdr=NULL WHERE id=?').run(id)
    }
    return receipt(id)
  }
  return {
    catalog: {items:[ITEM], network:NETWORK, asset:nativeAsset, merchant:chain.merchant,platform:chain.platform},
    create(sku,address,details) {
      let selection;try{selection=demoSelection(details)}catch(e){throw new HttpError(400,e.message)}
      if (sku !== SKU || !StrKey.isValidEd25519PublicKey(address || '')) throw new HttpError(400,'Select the demo jacket and a valid Stellar address.')
      const id = randomUUID()
      db.prepare('INSERT INTO orders (id,address,merchant,platform,selection) VALUES (?,?,?,?,?)').run(id,address,chain.merchant,chain.platform,JSON.stringify(selection))
      return receipt(id)
    },
    receipt, offer,
    refresh: id => serial(() => advance(id)),
    pay: (id,payload,resource) => serial(async () => {
      const row = get(id)
      if (row.status !== 'awaiting_signature') return advance(id)
      if (row.merchant !== chain.merchant || row.platform !== chain.platform)
        throw new HttpError(409,'Merchant configuration changed. Start another order.')
      if (payload?.x402Version !== 2 || !isDeepStrictEqual(payload.accepted,offer)
        || payload.resource?.url !== resource.url || typeof payload.payload?.transaction !== 'string')
        throw new HttpError(400,'The payment does not match this order.')
      const proof = createHash('sha256').update(payload.payload.transaction).digest('hex')
      const seen = db.prepare('SELECT id FROM orders WHERE proof=? AND id!=?').get(proof,id)
      if (seen) throw new HttpError(409,'This payment has already been used.')
      // Persist the authorization fingerprint and signed envelope before the facilitator broadcasts.
      const record = xdr => db.prepare("UPDATE orders SET proof=?,purchaseXdr=?,status='confirming_purchase' WHERE id=?").run(proof,xdr,id)
      try {
        const hash = await chain.settle(payload,offer,row.address,record)
        db.prepare("UPDATE orders SET status='payout_pending',purchaseTx=? WHERE id=?").run(hash,id)
      } catch (err) {
        if (!get(id).purchaseXdr) throw err
        return receipt(id)
      }
      try { return await advance(id) } catch { return receipt(id) }
    }),
    resume: () => serial(async () => {
      const pending = db.prepare("SELECT id FROM orders WHERE status IN ('confirming_purchase','payout_pending')").all()
      for (const {id} of pending) { try { await advance(id) } catch { /* Retry on next tick. */ } }
    })
  }
}
