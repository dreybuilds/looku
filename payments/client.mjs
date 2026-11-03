import freighter from '@stellar/freighter-api'
import { ExactStellarScheme } from '@x402/stellar/exact/client'
import { BASE, ITEM, NETWORK, PASSPHRASE, SKU } from './common.mjs'

const endpoint = new URL(BASE + '/', import.meta.url)
const key = (address, sku) => 'looku-checkout:' + address + ':' + sku
export async function connectWallet() {
  if (!(await freighter.isConnected()).isConnected) throw Error('Install the Freighter wallet extension to use testnet checkout.')
  const result = await freighter.requestAccess()
  if (result.error || !result.address) throw Error(result.error?.message || 'Wallet access was declined.')
  const network = await freighter.getNetwork()
  if (network.networkPassphrase !== PASSPHRASE) throw Error('Switch Freighter to Stellar Testnet, then reconnect.')
  return result.address
}
async function read(path, opts = {}) {
  const response = await fetch(new URL(path, endpoint), {cache:'no-store', ...opts})
  const body = await response.json()
  if (!response.ok) throw Error(body.error || 'Checkout service is unavailable.')
  return body
}
export const getCatalog = () => read('catalog')
export const getReceipt = id => read('orders/' + encodeURIComponent(id))
export async function buyPiece({sku = SKU, address, onStatus = () => {}, onOrder = () => {}}) {
  if (sku !== SKU) throw Error('Unknown demo product.')
  const active = await connectWallet()
  if (address && active !== address) throw Error('The connected wallet has changed. Review this order again.')
  const storageKey = key(active, sku)
  let id = localStorage.getItem(storageKey)
  if (id) {
    const previous = await getReceipt(id)
    if (previous.status !== 'awaiting_signature') {
      if (['complete','failed'].includes(previous.status)) localStorage.removeItem(storageKey)
      onOrder(id)
      return previous
    }
  } else {
    const order = await read('orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sku,address:active})})
    id = order.id
    localStorage.setItem(storageKey,id)
  }
  onOrder(id)
  const url = new URL('orders/' + id + '/checkout',endpoint)
  const response = await fetch(url,{method:'POST'})
  const challenge = await response.json()
  if (response.status !== 402) {
    if (!response.ok) throw Error(challenge.error || 'Unable to request payment.')
    return challenge
  }
  const [offer] = challenge.accepts
  const catalog = await getCatalog()
  if (offer.network !== NETWORK || offer.scheme !== 'exact' ||
      offer.asset !== catalog.asset || offer.payTo !== catalog.merchant ||
      offer.amount !== '10000000' || !offer.extra.areFeesSponsored) {
    throw Error('The testnet payment terms changed. Review the quote again.')
  }
  onStatus('Approve ' + ITEM.amount + ' test XLM in Freighter.')
  const scheme = new ExactStellarScheme({address:active, signAuthEntry:freighter.signAuthEntry})
  const authorization = await scheme.createPaymentPayload(2, offer)
  const payment = {...authorization, accepted:offer, resource:challenge.resource}
  onStatus('Confirming the purchase and affiliate payout on Stellar Testnet…')
  const receipt = await read('orders/' + id + '/checkout',{method:'POST',headers:{'Payment-Signature':btoa(JSON.stringify(payment))}})
  if (receipt.status === 'complete') localStorage.removeItem(storageKey)
  return receipt
}
