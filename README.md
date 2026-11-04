# looku
A personal wardrobe studio for the EmpowerHer agentic payments hackathon. Intended domain: **lookuwear.xyz**, pending registration and DNS setup.

See the [architecture and Demo Day walkthrough](ARCHITECTURE.md) for the shopping agent, wallet identity, settlement boundaries and pilot roadmap.

[Design inspiration sites and workflow checklist](INSPIRATION.md)

## Try it
Use **Studio → Add a piece** to upload a clothing photo, name it, and tag its category and occasion. Four sample garment portraits are supplied so the first visit is usable. In **Style an outfit**, select an occasion and optionally add an inspiration photo. The stylist chooses a top and bottom or a dress, adds shoes and any available layer, and ranks garments by occasion, ownership and distance from the reference colour. Save the result in Wardrobe.

When a look has no layer, review the demo boutique’s cropped jacket. Create a device wallet in Wallet, download its encrypted recovery file, and choose Get test XLM. Use its passphrase at checkout, or connect a funded Freighter **Stellar Testnet** account and approve the quoted **1 test XLM**. The x402 client signs the Stellar authorization entry. The boutique receives the payment, then sends **0.10 test XLM** to the platform account. Open Wallet → Purchase receipts and refresh pending entries. A separate verified demo sale links to both ledger records. No physical merchandise ships.

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

## Deployment
The private Sites Worker serves the studio and Freighter bundle from one origin. Build the browser signer in payments, then run `node hosting/build.mjs`. The Worker uses the same testnet chain code as the local service. Configure LOOKU_MERCHANT_TEST_SECRET, LOOKU_FACILITATOR_TEST_SECRET and LOOKU_PLATFORM_ADDRESS as runtime secrets. The test shopper key is used only for the local live check. Site registration and DNS are separate. Connect lookuwear.xyz after purchasing it and applying the host-provided verification records.

## Demo evidence
The complete Node API flow settled a testnet purchase and its referral payout with a disposable software signer. [Purchase](https://stellar.expert/explorer/testnet/tx/4f6fb6e2771c57828048ee6ebafd57150b0fa24fb47f5efb57719f30b1af8e99) · [Commission](https://stellar.expert/explorer/testnet/tx/f758f8ffa69bf2912d9819f46edb06daece16dff4023e5068a2320e3fed160e7)

## Offline use and optional storage
Install looku from the browser menu or Safari’s Share → Add to Home Screen. The service worker caches only the app shell, styling code, icons and directory. The wardrobe, reference image and saved outfits live in IndexedDB. After the first successful online load, adding pieces, generating outfits and saving looks work without a connection. Wallet lookups, testnet payments, retailer links, online backups and Pinterest search need connectivity. Payments still produce public testnet transactions and server-side order records.

Open Wardrobe → Install looku & manage storage to create, restore or delete an online snapshot. Each backup is an explicit upload, encrypted on the device with AES-GCM and a passphrase-derived key. Keep the passphrase. The host stores only the encrypted snapshot under the signed-in account’s identity. Restore replaces wardrobe data atomically and leaves local wallet settings and receipts alone. This is manual backup, not continuous sync. A custom domain has a separate local database.

## Pinterest MCP
Looku’s optional search adapter calls Pinterest’s official remote MCP endpoint. It initializes a session, lists tools, and calls a compatible Pin search tool only. Search results contain a Pin link, title and optional dominant colour. The shopper explicitly chooses a reference. Only their search text goes to Pinterest.

For the private hackathon studio, set PINTEREST_ACCESS_TOKEN as a runtime secret and PINTEREST_OWNER_ID to the matching signed-in Sites user ID, then redeploy. The adapter limits that credential to its owner. For a public multi-user release, replace this owner-scoped credential with per-user Pinterest OAuth. No Pinterest token was available during development. The official endpoint rejected an anonymous initialize request; authenticated tool names, response schema and live Pin results still need verification with approved access. [Pinterest MCP documentation](https://developers.pinterest.com/about-pinterest-mcp/)
