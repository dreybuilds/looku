import { Keypair } from '@stellar/stellar-sdk'
import { createEd25519Signer } from '@x402/stellar'
import { NETWORK } from './common.mjs'

const encode = bytes => btoa(String.fromCharCode(...bytes))
const decode = text => Uint8Array.from(atob(text), ch => ch.charCodeAt(0))
async function encryptionKey(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:600000, hash:'SHA-256'}, material,
    {name:'AES-GCM', length:256}, false, ['encrypt','decrypt'])
}
export async function generateWallet(passphrase) {
  if (passphrase.length < 12) throw Error('Choose a passphrase with at least 12 characters.')
  const pair = Keypair.random()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await encryptionKey(passphrase, salt)
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, pair.rawSecretKey())
  return {format:'looku-testnet-1', address:pair.publicKey(), salt:encode(salt), iv:encode(iv), encrypted:encode(new Uint8Array(encrypted))}
}
export async function unlockWallet(wallet, passphrase) {
  try {
    if (wallet.format !== 'looku-testnet-1') throw Error()
    const key = await encryptionKey(passphrase, decode(wallet.salt))
    const bytes = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv:decode(wallet.iv)}, key, decode(wallet.encrypted)))
    const pair = Keypair.fromRawEd25519Seed(bytes)
    bytes.fill(0)
    if (pair.publicKey() !== wallet.address) throw Error()
    return createEd25519Signer(pair.secret(), NETWORK)
  } catch { throw Error('Could not unlock this wallet. Check the passphrase and recovery file.') }
}
