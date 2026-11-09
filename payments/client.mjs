import { planPurchase, chooseOffer } from './shopping-agent.mjs'
export { checkBudget } from './shopping-agent.mjs'
import varial from '@stellar/varial-sdk'
import { ExactStellarScheme } from '@x402/stellar/exact/client'
import { BASE, ITEM, NETWORK, PASSPHRASE, SKU } from './common.mjs'

export { generateWallet, unlockWallet, signLookuLogin } from './local-wallet.mjs'

const endpoint = new URL(BASE + '/', import.meta.url)
const key = (address, sku) => 'looku-checkout:' + address + ':' + sku
export async function freighterAddress() {
  if (!(await varial.isConnected()).isConnected) throw Error('Install or open the Varial extension, then try again.')
  const result = await varial.requestAccess()
  if (result.error || !result.address) throw Error(result.error?.message || 'Wallet access was declined.')
  return result.address
}

export async function signFreighterLogin(address, message) {
  const result = await varial.signMessage(message, {address})
  if (result.error || !result.signedMessage || result.signerAddress !== address) throw Error(result.error?.message || 'Varial did not sign with the selected address.')
  return typeof result.signedMessage === 'string' ? result.signedMessage : Buffer.from(result.signedMessage).toString('base64')
}

export async function connectWallet() {
  const address = await freighterAddress()
  const network = await varial.getNetwork()
  if (network.networkPassphrase !== PASSPHRASE) throw Error('Switch Varial to Stellar Testnet, then reconnect.')
  return address
}
async function read(path, opts = {}) {
  const response = await fetch(new URL(path, endpoint), {cache:'no-store', ...opts})
  const body = await response.json()
  if (!response.ok) throw Error(body.error || 'Checkout service is unavailable.')
  return body
}
export const getCatalog = () => read('catalog')
export const getReceipt = id => read('orders/' + encodeURIComponent(id))
export function buyPiece(options) {
  const locks = globalThis.navigator?.locks
  if (!locks) return executeOrder(options)
  return locks.request('looku-purchase:' + (options.address || 'extension') + ':' + (options.sku || SKU),
    {ifAvailable:true}, lock => {
      if (!lock) throw Error('This purchase is open in another tab. Check its receipt before retrying.')
      return executeOrder(options)
    })
}
async function executeOrder({sku = SKU, address, signer, details, limit = ITEM.amount, onStatus = () => {}, onOrder = () => {}}) {
  if (sku !== SKU) throw Error('Unknown demo product.')
  const active = signer?.address || await connectWallet()
  if (address && active !== address) throw Error('The connected wallet has changed. Review this order again.')
  const plan = planPurchase({limit,address:active,sku,catalog:await getCatalog()})
  const storageKey = key(active, sku)
  const fingerprint = details ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(details)))),n=>n.toString(16).padStart(2,'0')).join('') : '';
  let id = localStorage.getItem(storageKey)
  if (id) {
    const previous = await getReceipt(id)
    if (previous.status !== 'awaiting_signature') {
      if (['complete','failed'].includes(previous.status)) localStorage.removeItem(storageKey)
      await onOrder(id)
      return previous
    }
    if(details && localStorage.getItem(storageKey+':choice')!==fingerprint)id=null;
  }
  if(!id){
    const order = await read('orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sku,address:active,details})})
    if(details && (order.selection?.size!==details.jacket || order.selection?.variant!=='cropped-jacket-'+details.jacket.toLowerCase() || order.selection?.referral!==details.referral))throw Error('The boutique could not confirm your selected size and referral. No payment was approved.')
    id = order.id
    localStorage.setItem(storageKey,id)
    localStorage.setItem(storageKey+':choice',fingerprint)
  }
  await onOrder(id)
  const url = new URL('orders/' + id + '/checkout',endpoint)
  const response = await fetch(url,{method:'POST'})
  const challenge = await response.json()
  if (response.status !== 402) {
    if (!response.ok) throw Error(challenge.error || 'Unable to request payment.')
    return challenge
  }
  const offer = chooseOffer(plan,challenge,{address:active,sku,resource:url.href})
  onStatus(signer ? 'Approving your order on this device…' : 'Approve this order in your external wallet.')
  const scheme = new ExactStellarScheme(signer || {address:active, signAuthEntry:varial.signAuthEntry})
  const authorization = await scheme.createPaymentPayload(2, offer)
  const payment = {...authorization, accepted:offer, resource:challenge.resource}
  onStatus('Confirming your purchase and the store’s referral payment…')
  const receipt = await read('orders/' + id + '/checkout',{method:'POST',headers:{'Payment-Signature':btoa(JSON.stringify(payment))}})
  if (receipt.status === 'complete') localStorage.removeItem(storageKey)
  return receipt
}

export async function signVarialTransaction(xdr,address,network){
  const passphrase=network==='mainnet'?'Public Global Stellar Network ; September 2015':'Test SDF Network ; September 2015';
  if(await freighterAddress()!==address)throw Error('Select your linked Stellar account in Varial.');
  const selected=await varial.getNetwork();
  if(selected.networkPassphrase!==passphrase)throw Error('Switch Varial to Stellar '+network+'.');
  const result=await varial.signTransaction(xdr,{networkPassphrase:passphrase,address});
  if(result.error||!result.signedTxXdr)throw Error(result.error?.message||'Varial signing was cancelled.');
  return result.signedTxXdr;
}
