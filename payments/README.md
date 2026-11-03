# looku testnet checkout

The demo boutique sells one cropped jacket for 1 test XLM. looku earns 0.10 test XLM from the boutique. The purchase uses the Stellar native asset contract and the x402 v2 exact scheme. The facilitator sponsors the buyer’s network fee. The boutique sends the commission in a separate native payment. These are testnet balances. The purchase does not ship a garment.

## Run the Node API

Use Node 24, then run these commands in this directory.

```sh
npm ci
npm run build
npm run setup:testnet
npm start
```

Setup creates four disposable accounts and funds them from Friendbot. The merchant and facilitator signing keys and the test shopper key for the smoke test are in a mode-0600, ignored `.env` file. The platform account only needs a public receiving address. For a platform account you control, set `LOOKU_PLATFORM_ADDRESS` to your activated testnet address before starting sales. Keep these testnet identities separate from real wallets. Supply them through the host’s secret manager on a server.

By default the API listens on 127.0.0.1:4020. Proxy `/api/payments/*` from the web app. For a separately hosted service, set `LOOKU_BIND`, `PORT`, `LOOKU_API_ORIGIN` and the exact `LOOKU_UI_ORIGIN`. Use one Node process and a persistent volume for `.data/orders.sqlite`. Restarting the process resumes pending payments. The public receipt identifier is an unguessable bearer link. Received and paid wallet addresses and transaction hashes are public on Stellar.

## Use the demo

Connect Freighter on Stellar Testnet, activate the shopper’s public address with Friendbot, then approve the transfer when prompted. Load the bundled ES module from `/api/payments/client.js`. It exports `getCatalog()`, `connectWallet()`, `buyPiece({sku,address,onOrder,onStatus})` and `getReceipt(id)`. The module source origin determines the API origin. Keep the receipt ID from `onOrder` and refresh while confirming purchase or payout. Only display a settled affiliate commission after `status === 'complete'`.

1. `POST /api/payments/orders` accepts the SKU and shopper’s public address and returns an order ID.
2. `POST /api/payments/orders/:id/checkout` returns HTTP 402, a v2 payment requirement in the body and the `Payment-Required` header. The shopper signs the authorization in Freighter.
3. Retry the same URL with `Payment-Signature`. The official facilitator implementation checks the signed transfer, actual payer, amount, asset, and recipient, then submits the transaction.
4. The service stores each signed transaction before broadcasting and reconciles by hash. A receipt records the confirmed purchase and commission hashes separately. The signed commission includes the order reference in its memo.
5. `GET /api/payments/orders/:id` returns the latest known status. An internal worker retries pending receipts every six seconds.

`npm test` exercises replay rejection and settlement recovery without a network connection. `npm run test:live` completes one transfer and payout using only the disposable shopper account, through the actual HTTP challenge and authorization flow. It prints the receipt hashes.

[Stellar x402](https://stellar.org/x402) · [Friendbot](https://developers.stellar.org/docs/learn/fundamentals/networks) · [Freighter](https://docs.freighter.app/)
