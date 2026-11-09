# looku
A personal wardrobe studio for the EmpowerHer agentic payments hackathon. [Studio](https://lookuwear.xyz/) · [Privacy policy](https://lookuwear.xyz/privacy-policy) ([source](dist/privacy-policy.html)).

See the [architecture and Demo Day walkthrough](ARCHITECTURE.md) for the shopping agent, wallet identity, settlement boundaries and pilot roadmap.

[Design inspiration sites and workflow checklist](INSPIRATION.md)

Save a fit and delivery profile in Account, choose KES or USD and open the demo boutique referral in Stores. The fixed catalogue prices are practice amounts. No real charge or shipment occurs. External retailers use their own checkout.

## Try it
Use **Studio → Add a piece** to upload a clothing photo, name it, and tag its category and occasion. Four sample garment portraits are supplied so the first visit is usable. In **Style an outfit**, select an occasion and optionally add an inspiration photo. The stylist chooses a top and bottom or a dress, adds shoes and any available layer, and ranks garments by occasion, ownership and distance from the reference colour. Save the result in Wardrobe.

When a look has no layer, review the demo boutique’s cropped jacket. Create a device wallet in Wallet, download its encrypted recovery file, and choose Get test XLM. Use its passphrase at checkout, or connect a funded Varial **Stellar Testnet** account and approve the quoted **1 test XLM**. The x402 client signs the Stellar authorization entry. The boutique receives the payment, then sends **0.10 test XLM** to the platform account. Open Wallet → Purchase receipts and refresh pending entries. A separate verified demo sale links to both ledger records. No physical merchandise ships.

Wallet goals track funds held in the shopper’s own wallet. Testnet goals use XLM. Stellar mainnet and Base mainnet goals use USDC. MiniSend’s documented hosted Buy flow currently delivers USDC on Base. Start it explicitly under Base mainnet; real funding is unnecessary for the demo.

## Run locally
Node 24 is recommended. From this directory:

```sh
cd payments
npm ci
npm run setup:testnet
npm run build
npm test
cd ..
node dev.mjs
```

Visit http://127.0.0.1:4173 in a browser for interactive signing. Friendbot provides free test XLM. Test backend settlement separately with `npm run test:live` inside payments. Setup generates test-only keys in an ignored file and activates disposable accounts. To collect commissions into your own demo wallet, configure its activated public testnet address instead.

## Architecture
| Layer | Responsibility | Persistence |
|---|---|---|
| Browser studio | Resize images, sample a colour, assemble outfits, browse stores | Photos, tags, saved outfit lists and receipt IDs in IndexedDB on the current origin |
| Wallet reader | Read selected public addresses through Horizon or Base RPC, track a target per network | Public addresses and goals in localStorage |
| Demo boutique | Issue an order-specific x402 challenge, validate exact scheme, network, asset, buyer and destination, settle the payment | SQLite and a retry loop in the local Node service |
| Private hosted app | Serve the studio and payment API under one origin, store the signed purchase and commission envelopes before broadcasting | Conditional writes to the ORDERS object-storage binding; receipt refresh resumes pending work |
| Platform account | Receive the disclosed referral share from the demo boutique | Separate, linkable Stellar transaction |
| Affiliate directory | Let a publisher find official applications | Curated source JSON; no assumed merchant partnerships |

The recommendation engine is deterministic. It uses manually assigned garment categories and a colour sampled from the reference image. The MVP does not identify silhouettes or garments from an inspiration photo. A saved look stores the names and IDs of the pieces selected. Device storage is origin-specific, so moving from a preview URL to a custom domain starts a fresh wardrobe.

The demo boutique is the only integrated seller. In this single-referrer demo, orders from the outfit recommendation attribute the fixed commission to looku. Other retailers control their own checkout, attribution windows, refunds and commissions. Approved deep links and authenticated conversion or settlement reports are needed before recording a real affiliate sale. See [Affiliate research](AFFILIATES.md) and [MiniSend integration notes](MINISEND.md).

## Vercel deployment

Pushing to `main` triggers the production deployment. For owner releases, set the repository’s Git identity in the checkout before committing:

```sh
git config --local user.name dreybuilds
git config --local user.email 51991846+dreybuilds@users.noreply.github.com
git var GIT_AUTHOR_IDENT
```

The owner workspace opens at [admin.lookuwear.xyz](https://admin.lookuwear.xyz).

The `looku` Vercel project builds the static studio and Node API with `npm run build`. Production uses a private Vercel Blob store for orders, wallet sessions and encrypted backups. Set `LOOKU_MERCHANT_TEST_SECRET`, `LOOKU_FACILITATOR_TEST_SECRET`, `LOOKU_PLATFORM_ADDRESS` and `OPENROUTER_API_KEY` in the project. Online styling sends the signed-in shopper’s written brief through OpenRouter to `openai/gpt-4.1-mini`. On Vercel, backups are scoped to the verified email account or signed-in wallet.

## Sites deployment
The private Sites Worker serves the studio and Varial bundle from one origin. Build the browser signer in payments, then run `node hosting/build.mjs`. The Worker uses the same testnet chain code as the local service. Configure LOOKU_MERCHANT_TEST_SECRET, LOOKU_FACILITATOR_TEST_SECRET and LOOKU_PLATFORM_ADDRESS as runtime secrets. The test shopper key is used only for the local live check.

## Demo evidence
The complete Node API flow settled a testnet purchase and its referral payout with a disposable software signer. [Purchase](https://stellar.expert/explorer/testnet/tx/4f6fb6e2771c57828048ee6ebafd57150b0fa24fb47f5efb57719f30b1af8e99) · [Commission](https://stellar.expert/explorer/testnet/tx/f758f8ffa69bf2912d9819f46edb06daece16dff4023e5068a2320e3fed160e7)

## Community sign-up and publishing
Open Account or a Wardrobe publishing form and choose **Sign up or log in with email**. Privy sends a one-time code and creates the account on first verification. Looku verifies the access token against the app’s public signing keys and stores post ownership by Privy user ID. Wallet-authored posts remain associated with the original wallet.

Anyone can read public looks and approved closet listings. Members can also share private sales and donations by link without review. Anyone with the link can see the listing and contact email until withdrawal. Signed-in members can publish looks, submit pieces for sale or donation, see approved listing contacts and withdraw their own posts. The Vercel owner workspace verifies the owner’s Privy email using the server-only `PRIVY_APP_SECRET` and grants admin access to `nzauaudrey@gmail.com` after email-code verification.

## Offline use and optional storage
Install looku from the browser menu or Safari’s Share → Add to Home Screen. The service worker caches only the app shell, styling code, icons and directory. The wardrobe, reference image and saved outfits live in IndexedDB. After the first successful online load, adding pieces, generating outfits and saving looks work without a connection. Wallet lookups, testnet payments, retailer links, online backups and Pinterest search need connectivity. Payments still produce public testnet transactions and server-side order records.

Open Account → Install looku & manage storage to create, restore or delete an online snapshot. Each backup is an explicit upload, encrypted on the device with AES-GCM and a passphrase-derived key. Keep the passphrase. The host stores only the encrypted snapshot under the signed-in account’s identity. Restore replaces wardrobe data atomically and leaves local wallet settings and receipts alone. This is manual backup, not continuous sync. A custom domain has a separate local database.

## Pinterest MCP
Looku’s optional search adapter calls Pinterest’s official remote MCP endpoint. It initializes a session, lists tools, and calls a compatible Pin search tool only. Search results contain a Pin link, title and optional dominant colour. The shopper explicitly chooses a reference. Only their search text goes to Pinterest.

Account → Pinterest account and imports supports per-member Pinterest OAuth for email and wallet accounts. Register `https://lookuwear.xyz/api/pinterest/callback` in Pinterest and set the server runtime secret `PINTEREST_APP_SECRET`. The public app ID defaults to `1634233` and can be overridden with `PINTEREST_APP_ID`. Rotating the secret requires members to reconnect. The app requests `pins:read`, `boards:read` and `pins:write`. Trial-created Pins are visible only to their creator. Public posting requires Standard access.

For the private hackathon studio, set PINTEREST_ACCESS_TOKEN as a runtime secret and PINTEREST_OWNER_ID to the matching signed-in Sites user ID, then redeploy. The adapter limits that credential to its owner. This optional inspiration-search credential is separate from Community OAuth. No Pinterest token was available during development. The official endpoint rejected an anonymous initialize request; authenticated tool names, response schema and live Pin results still need verification with approved access. [Pinterest MCP documentation](https://developers.pinterest.com/about-pinterest-mcp/)

## Primary Stellar account wallet

Email accounts provision one user-owned Stellar wallet through Privy when they sign in or open Account, Wallet or Wishlist. Configure the existing server-only `PRIVY_APP_SECRET` for the app in `payments/privy-config.mjs`; no wallet-specific API key is required. The deterministic Privy external ID and private account record reuse the same wallet across devices and concurrent requests. Varial sign-in remains an alternative for members using an existing Stellar wallet.

Wallet shows confirmed mainnet USDC or separately labelled testnet XLM, the receive address, USDC trustline setup and reviewed transfers. Mainnet accounts need XLM for activation, reserves and transaction fees; creation does not fund them. Testnet offers Friendbot funding. Privy signs only the stored, reviewed transaction with the member’s access token. External wallet transactions require the matching Varial signature. Pending transactions are reconciled by their exact hash before retries, and allocation updates use conditional writes.

Wishlist item budgets are saved per account and network against the shared confirmed balance; they do not create wallets or lock on-chain funds. Deleting a signed-in item releases its budgets. Existing MiniSend M-Pesa and Base x402 funding remain additional funding options; Base USDC is not automatically bridged into Stellar. Ordinary Stellar deposits update the wallet balance; the user assigns unlabelled deposits to item budgets.

Validation: `npm run build` and `cd qa && npm test -- stellar-wallet.spec.js launch.spec.js wishlist.spec.js`. Unit tests use provider fixtures and real Stellar transaction signatures; they do not transfer real funds.

Online styling and wardrobe backup requests send the member’s Privy access token and accept email authentication directly. General sign-in prompts point to Account and email sign-in; explicit demo wallet recovery and legacy purchase receipts still use their original wallet. `qa/email-features.spec.js` checks email-only styling and backup isolation.

## Admin earnings

Open Admin → Earnings & profit for all-time income, expenses and recorded profit, calculated separately in KES and USD. Enter received income and paid expenses, including fees and refunds. Void incorrect entries and record replacements. Profit reflects the entries recorded so far.

The testnet section reads stored boutique orders, separates received referral commissions from pending payouts, and links confirmed transactions. Older orders use their original fixed 1 test XLM purchase and 0.10 test XLM commission terms. Test balances are excluded from real-money totals. External store sales, wishlist contributions and customer wallet deposits are excluded from automatic platform earnings.
