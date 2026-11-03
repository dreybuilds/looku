import { Asset, Keypair, Memo, Networks, TransactionBuilder, Operation, StrKey, rpc } from '@stellar/stellar-sdk'
import { ExactStellarScheme as Facilitator } from '@x402/stellar/exact/facilitator'
import { createEd25519Signer } from '@x402/stellar'
import { ITEM, NETWORK, RPC } from './common.mjs'

export class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status }
}
export const nativeAsset = Asset.native().contractId(Networks.TESTNET)
export function makeChain(env) {
  const merchant = Keypair.fromSecret(env.LOOKU_MERCHANT_TEST_SECRET)
  const platform = env.LOOKU_PLATFORM_ADDRESS
  const signer = createEd25519Signer(env.LOOKU_FACILITATOR_TEST_SECRET, NETWORK)
  if (!StrKey.isValidEd25519PublicKey(platform) || new Set([platform,merchant.publicKey(),signer.address]).size !== 3)
    throw Error('Configure separate testnet merchant, facilitator and platform accounts.')
  const server = new rpc.Server(RPC)
  return {
    merchant: merchant.publicKey(), platform,
    async settle(payload, requirements, address, record) {
      const facilitator = new Facilitator([{...signer, async signTransaction(xdr,options) {
        const signed = await signer.signTransaction(xdr,options)
        if (signed.signedTxXdr) await record(signed.signedTxXdr)
        return signed
      }}])
      const check = await facilitator.verify(payload, requirements)
      if (!check.isValid || check.payer !== address) throw new HttpError(422,'Payment authorization was rejected by the facilitator.')
      const result = await facilitator.settle(payload, requirements)
      if (!result.success) throw new HttpError(503,'Settlement is awaiting network confirmation. Check the receipt before retrying.')
      return result.transaction
    },
    async prepareCommission(id) {
      const source = await server.getAccount(merchant.publicKey())
      const tx = new TransactionBuilder(source,{fee:'100',networkPassphrase:Networks.TESTNET})
        .addOperation(Operation.payment({destination:platform, asset:Asset.native(), amount:ITEM.commission}))
        .addMemo(Memo.text(id.replaceAll('-', '').slice(0,28)))
        .setTimeout(300).build()
      tx.sign(merchant)
      return tx.toXDR()
    },
    async reconcile(xdr) {
      const tx = TransactionBuilder.fromXDR(xdr,Networks.TESTNET)
      const hash = Array.from(tx.hash(), byte => byte.toString(16).padStart(2,'0')).join('')
      const found = await server.getTransaction(hash)
      if (found.status !== 'NOT_FOUND') return {status:found.status,hash}
      // Keep the exact envelope across retries so sequence number and hash never change.
      const result = await server.sendTransaction(tx)
      if (result.status === 'ERROR') {
        // RPC retention is limited. Horizon provides a longer-lived confirmation record.
        const lookup = await fetch('https://horizon-testnet.stellar.org/transactions/' + hash)
        if (lookup.ok) return {status:(await lookup.json()).successful ? 'SUCCESS' : 'FAILED',hash}
        const expired = Number(tx.timeBounds.maxTime) * 1000 < Date.now() - 60_000
        if (lookup.status === 404 && expired) return {status:'FAILED',hash}
      }
      return {status:'PENDING',hash}
    }
  }
}
