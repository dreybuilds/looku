import { Asset, Networks, StrKey } from '@stellar/stellar-sdk'
import { ITEM, NETWORK, SKU } from './common.mjs'

const native = Asset.native().contractId(Networks.TESTNET)
function stroops(value) {
  if (typeof value !== 'string' || !/^\d{1,8}(\.\d{1,7})?$/.test(value)) throw Error('Enter a test XLM limit with up to seven decimal places.')
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 10000000n + BigInt(fraction.padEnd(7, '0'))
}
export function checkBudget(limit) {
  if (stroops(limit) < stroops(ITEM.amount)) throw Error('Hold off: the jacket costs 1 test XLM, above your limit. You can save toward it in Wallet.')
}
export function planPurchase({limit, address, sku, catalog}, now = Date.now()) {
  checkBudget(limit)
  const item = catalog.items?.find(entry => entry.sku === sku)
  if (sku !== SKU || item?.amount !== ITEM.amount || item.currency !== 'XLM' ||
      catalog.network !== NETWORK || catalog.asset !== native ||
      !StrKey.isValidEd25519PublicKey(address) || !StrKey.isValidEd25519PublicKey(catalog.merchant)) {
    throw Error('The boutique or item changed. Review the purchase again.')
  }
  return Object.freeze({address, sku, merchant:catalog.merchant, limit, expires:now + 120000})
}
export function chooseOffer(plan, challenge, {address, sku, resource}, now = Date.now()) {
  if (now >= plan.expires || address !== plan.address || sku !== plan.sku ||
      challenge.x402Version !== 2 || challenge.resource?.url !== resource) {
    throw Error('This approval does not cover this order. Review the purchase again.')
  }
  const offer = challenge.accepts?.find(o => o.scheme === 'exact' && o.network === NETWORK &&
    o.asset === native && o.payTo === plan.merchant && o.extra?.areFeesSponsored === true &&
    o.amount === String(stroops(ITEM.amount)) && BigInt(o.amount) <= stroops(plan.limit) &&
    Number.isInteger(o.maxTimeoutSeconds) && o.maxTimeoutSeconds > 0 && o.maxTimeoutSeconds <= 120)
  if (!offer) throw Error('No offer matches your approved price, merchant and test network. Nothing was signed.')
  return offer
}
