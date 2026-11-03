import { Keypair } from '@stellar/stellar-sdk'
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

export async function activate(address) {
  const account = await fetch('https://horizon-testnet.stellar.org/accounts/' + address)
  if (account.ok) return
  if (account.status !== 404) throw Error('Testnet account lookup failed: ' + account.status)
  const funding = await fetch('https://friendbot.stellar.org/?addr=' + address)
  if (!funding.ok) throw Error('Testnet faucet response: ' + funding.status + '. Retry setup later.')
}
if (import.meta.main) {
  if (!existsSync('.env')) {
    const keys = ['MERCHANT', 'FACILITATOR', 'PLATFORM', 'SHOPPER'].map(role => [role, Keypair.random()])
    const lines = keys.map(([role, pair]) => role === 'PLATFORM'
      ? 'LOOKU_PLATFORM_ADDRESS=' + pair.publicKey()
      : 'LOOKU_' + role + '_TEST_SECRET=' + pair.secret())
    // A throwaway platform account needs no signing key for receipt verification.
    writeFileSync('.env', lines.join('\n') + '\n', { mode: 0o600, flag: 'wx' })
  }
  const env = parseEnv(readFileSync('.env','utf8'))
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('LOOKU_') || !(key.endsWith('_TEST_SECRET') || key === 'LOOKU_PLATFORM_ADDRESS')) continue
    const address = key.endsWith('_TEST_SECRET') ? Keypair.fromSecret(value).publicKey() : value
    await activate(address)
    console.log(key.split('_')[1] + ' ready on testnet: ' + address)
  }
}
