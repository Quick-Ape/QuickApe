# QuickApe

[![License: MIT](https://img.shields.io/badge/license-MIT-b4f24a.svg)](LICENSE)
[![Website](https://img.shields.io/badge/web-quickape.world-7b61ff.svg)](https://www.quickape.world)

A Chrome extension (Manifest V3) for **1-click memecoin buys and sells** right from X, GMGN, Dexscreener, Fomo,
pump.fun, Birdeye, Axiom and Telegram Web. Supports **Solana** (via Jupiter) and **Base / BSC / Ethereum** (via
KyberSwap). Non-custodial: no accounts, no database, no analytics. QuickApe charges a **0.5% fee per trade**
(see [Fees](#fees)).

▶ **Watch the 90-second walkthrough:** [quickape.world/#demo](https://www.quickape.world/#demo)

## Why you can trust it

You shouldn't have to take a trading extension's word for anything. Everything below is checkable in this repository:

- **The whole extension is here.** What runs in your browser is built from `src/` with no remote code: no `eval`, no
  scripts loaded from a server. It only fetches JSON from the APIs listed in `wxt.config.ts` (`host_permissions`).
- **Your main wallet stays yours.** The recommended mode creates a separate trading wallet. Its seed phrase is encrypted
  on your device (PBKDF2-SHA256, 600k iterations, AES-256-GCM; `src/lib/wallet/vault.ts`) and never sent anywhere.
  In connected mode QuickApe holds no keys at all: Phantom or MetaMask approves every trade.
- **Websites can't trade for you or read your keys.** Content scripts only send a trade *intent* (token + amount) to the
  background worker, and quick-buy buttons ignore clicks faked by page scripts (`event.isTrusted`). Wallet requests
  (create, unlock, export keys, withdraw, settings, balances) are refused unless they come from the extension's own
  popup (`PRIVILEGED` in `src/background/handlers.ts`).
- **The fee is fixed and visible on-chain.** 0.5%, paid inside the same swap transaction to two public addresses and
  nowhere else (`src/lib/fees.ts`):
  - Solana `78qnj9Fx6gA27K9yg8KH2xFG8jvVQWkrgdAC2dKTc6z`
  - EVM `0xcab2cd99E04CfC72344cee6CFf489AdF057EAD01`
- **The build is reproducible.** `npm ci && npm run build` produces the same files as the Chrome Web Store package, so
  you can diff them (see [Verify a release](#verify-a-release)).
- **Tests run against mainnet.** Besides unit tests, `LIVE=1` tests build real swaps and simulate them on Solana mainnet,
  checking that the fee lands exactly where and how much it should (`tests/live.test.ts`).

Found a problem? See [SECURITY.md](SECURITY.md).

## How it works

| Where | What you get |
|---|---|
| **X / Twitter** | A green quick-buy button (cursor icon) labelled e.g. `0.1 SOL` under any tweet or bio that contains a contract address (CA). One click buys immediately. A `$TICKER` cashtag opens the panel so you can pick the token (tickers are ambiguous, so they cannot be quick-bought). |
| **Token pages** (gmgn.ai, dexscreener, pump.fun, birdeye, axiom, fomo.family) | A trading panel appears automatically (draggable and collapsible): price, market cap, liquidity, safety checks, preset Buy buttons and Sell % buttons. |
| **Links to token pages** on any of the sites above | Hover the link and a small quick-buy button appears next to the cursor. |
| **Anywhere** | Select or double-click a CA and a quick-buy button appears. |
| **Extension popup** | Wallets and balances, paste a CA / `$ticker` / link to trade manually, transaction history, settings. |

Trade flow: the content script only sends an *intent* (CA + amount) to the background service worker. The background
resolves the token (Dexscreener), quotes and builds the transaction (Jupiter / KyberSwap), signs it with the local key,
sends it to the RPC (and to Jito when Jito mode is on), and shows a toast and a notification once it is confirmed.

## Wallet modes

QuickApe never asks for the key to your main wallet. Pick one of two modes during setup (switch anytime in Settings):

| Mode | How trades are signed | Clicks | Keys in QuickApe |
|---|---|---|---|
| **Trading wallet** (recommended) | A fresh wallet created by QuickApe signs instantly | 1 | Only the trading wallet's, encrypted |
| **Connected wallet** | Phantom / MetaMask (or Solflare, Backpack, Rabby, Coinbase Wallet) approves each trade on the site | 2 (click + approve) | None |

**Trading wallet flow:** create → back up the seed → **Deposit** (address + QR, balance updates live) → trade → **Withdraw**
SOL / ETH / BNB back to your own wallet (review screen, `Max` leaves only the network fee). Your main wallet is never
exposed; only what you deposit is at risk.

**Connected wallet flow:** a tiny bridge script runs in the page's main world (the only place wallet providers exist),
finds wallets the standard way — [Wallet Standard](https://github.com/wallet-standard/wallet-standard) for Solana,
[EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) for EVM — and forwards unsigned transactions built by the extension.
The wallet asks to connect once per site and shows its own approval popup for every swap. The bridge has no extension
APIs and adds nothing a page couldn't already do with the wallet itself.

**Importing an existing key** is hidden under *Import an existing key (advanced)* behind a warning and an explicit
"this is a trading-only wallet" confirmation. Seeds use Phantom's path `m/44'/501'/{n}'/0'` (Solana) and MetaMask's
path `m/44'/60'/0'/0/{n}` (EVM), so addresses match those wallets.

## Fees

- **0.5% per buy and sell**, configured in `src/lib/fees.ts` (`FEES.baseBps`). Most terminals charge 1%.
- Collected inside the swap itself, always in the native coin, and shown in the panel before every trade:
  - **Solana**: a SOL transfer to `78qnj9Fx6gA27K9yg8KH2xFG8jvVQWkrgdAC2dKTc6z`, appended to Jupiter's swap
    transaction (`src/lib/solana/patch.ts`), so it's atomic with the swap. Buys: 0.5% of the SOL spent (the swap gets
    the rest). Sells: 0.5% of the minimum SOL out after slippage. Jupiter's own `platformFeeBps` isn't used: on some
    routes (pump.fun curves) it charges the fee in the token, which fails for Token-2022 tokens.
    The fee wallet must hold at least ~0.001 SOL (rent minimum); until it does, trades go through without a fee.
  - **EVM**: KyberSwap `feeAmount` / `isInBps` / `chargeFeeBy` (native side) / `feeReceiver`
    = `0xcab2cd99E04CfC72344cee6CFf489AdF057EAD01`.
- **Discounts**: set `FEES.holderDiscount` (`mint`, `minAmount`, `bps`) when the token launches; holders of at least
  `minAmount` pay `bps` (planned 0.3%). Each trade stores its fee in the activity history.
- **Rent reclaim**: after a 100% sell the empty token account is closed automatically, and *Reclaim SOL* in the popup
  closes any older empty accounts (~0.002 SOL each).

## Security model

- The vault is encrypted with **PBKDF2-SHA256 (600k iterations) + AES-256-GCM** and stored in `chrome.storage.local`.
- On unlock, only the AES key is kept in `chrome.storage.session` (cleared when the browser closes and not readable by
  content scripts). The wallet auto-locks after X minutes of inactivity (default 240, configurable).
- Private keys **never** reach web pages or content scripts. Sensitive requests (unlock, key export, settings,
  balances, history) are rejected unless they come from the extension popup.
- Buy buttons live in a **closed shadow DOM** and only respond to real user clicks (`event.isTrusted`), so website
  scripts cannot trigger a purchase.
- A **max per buy** limit per chain (small by default) guards against misclicks, and repeated clicks within 1.2 seconds
  are ignored.
- The panel shows warnings for freeze/mint authority, permanent delegate, transfer fee/hook (Solana), honeypot and tax
  (EVM, via GoPlus), and low liquidity.
- The unlock password is **never** typed into a web page, only into the popup.
- Withdrawals can only be started from the popup, always go through a review screen, and are native-asset only.
- In connected mode no key is stored at all; every signature is approved in the user's own wallet popup.

## Development

```bash
npm install                # .npmrc sets legacy-peer-deps (npm arborist bug with the vitest peer dependency)
npm run dev                # launch Chrome with the extension loaded + hot reload
npm run build              # output in .output/chrome-mv3
npm run zip                # zip for the Chrome Web Store
npm test                   # unit tests
LIVE=1 npx vitest run tests/live.test.ts   # tests against the real APIs (never sends a transaction)
npm run preview:ui         # UI preview with mock data at http://localhost:5199
node scripts/gen-icons.mjs # regenerate the PNG icons from the logo geometry
```

**Manual install:** run `npm run build`, open `chrome://extensions`, enable *Developer mode*, click *Load unpacked*
and select the `.output/chrome-mv3` folder.

### Landing page

`site/index.html` is a self-contained static page (liquid glass, responsive), live at https://www.quickape.world.
Redeploy with `npm run deploy:site` (Vercel project `quickape`; headers in `site/vercel.json`). Fill in the `LINKS` object at the bottom of the file (Chrome Web Store,
releases, X, Telegram, Discord, GitHub, contact email); empty links show a "goes live at launch" toast.

### QuickApe RPC (Helius proxy)

`site/api/rpc.ts` is a Vercel Edge Function (runs at the location nearest each user) at `https://www.quickape.world/api/rpc`, the extension's default Solana RPC. It's served from our own domain so the extension keeps working if the Vercel project ever moves to another account.
It forwards to Helius with the key held server-side, so users never configure an RPC and the key never ships in the
extension.

| Env var (Vercel → project `quickape` → Settings → Environment Variables) | Purpose |
|---|---|
| `HELIUS_API_KEY` (required) | Helius key. Without it the proxy answers 503 and the extension uses PublicNode. |
| `ALLOWED_EXTENSION_IDS` (optional) | Comma-separated extension IDs; otherwise any `chrome-extension://` origin is accepted. |
| `RPC_RATE_LIMIT` (optional) | Requests per IP per 10 s (default 60). |

Only the JSON-RPC methods the extension uses are forwarded; batches and web-page origins are rejected. Origins can be
faked outside a browser, so keep an eye on usage in the Helius dashboard (and back the rate limit with Upstash Redis if
traffic grows). Env var changes apply to the next deployment: run `npm run deploy:site` after setting them.

If the proxy is unreachable, misconfigured, or rate-limited, the extension falls back to `solana-rpc.publicnode.com`
for 30 seconds before trying the proxy again. Users can still set their own RPC in Settings.

### Branding

- `branding/logo.svg` is the source logo (the "one-click cursor" on a lime tile).
- `branding/logo-512.png` is a 512 px render for the Chrome Web Store and social media.
- `scripts/gen-icons.mjs` renders the extension icons (`public/icon/16|32|48|128.png`) and `logo-512.png` from the same
  geometry, with no dependencies. The 16 px icon uses a simplified, pixel-aligned cursor so it stays sharp.

### Project structure

```
src/
  entrypoints/
    background.ts        message router + auto-lock alarm
    content/index.tsx    on-page overlay + scanners
    popup/               popup entry (index.html, main.tsx)
    wallet-bridge.content.ts  main-world bridge to Phantom / MetaMask (connected mode)
  background/
    session.ts           unlock/lock, vault in storage, connected-wallet addresses
    handlers.ts          handlers for every request (+ sender checks)
    trades.ts            plan → sign (trading wallet) or prepare + track (connected), withdrawals, history
  bridge/main-world.ts   Wallet Standard + EIP-6963 discovery, connect, sign & send
  lib/
    wallet/              key derivation (Phantom/MetaMask paths), encrypted vault
    solana/              minimal JSON-RPC + transaction signing (no web3.js)
    evm/                 viem client
    trade/solana.ts      Jupiter Metis Swap API v1 (no Jupiter fee)
    trade/evm.ts         KyberSwap Aggregator (automatic approve on sell)
    trade/withdraw.ts    native SOL / ETH / BNB withdrawals
    solana/transfer.ts   SystemProgram.transfer builder (no web3.js)
    market.ts            resolve CA/pair/ticker via Dexscreener, safety checks
    urls.ts, address.ts  CA detection and per-platform token-page URLs
  content/               X scanner, link hover, selection, chips, overlay
  content/connected.ts   connected-mode trade flow (resolve → connect → build → approve → track)
  popup/                 popup UI (onboarding, wallet, deposit/withdraw, settings)
  ui/                    trading panel, toasts, logo, store (shared by content script & popup)
tests/                   unit tests + live API tests
dev/preview/             UI preview harness (mock data)
scripts/gen-icons.mjs    icon generator
branding/                logo.svg, logo-512.png
site/index.html          landing page (single static file, deploy anywhere)
```

## Chrome Web Store

Everything for the listing is in [`store/`](store/):

- [`store/listing.md`](store/listing.md): copy-paste text for every dashboard field (description, single purpose, permission justifications, data disclosures, reviewer instructions) plus the pre- and post-submit checklists.
- `store/screenshots/` (1280×800), `store/promo/` (440×280 and 1400×560), `store/store-icon-128.png`.

Screenshots are rendered from the real UI with mock data: run `npm run preview:ui`, open `/store/shot.html?n=1` to `?n=5` or `/store/promo.html?size=small|marquee`, and capture at the exact size. Build the upload with `npm run zip` (`.output/quickape-<version>-chrome.zip`).

## Intro video

`video/` is a separate [Remotion](https://www.remotion.dev) project that renders the 27-second 1080p intro (`video/out/quickape-intro.mp4`). Scenes are React + CSS 3D, and the panel and popup are captures of the real UI (`video/public/ui/`, from the preview harness with `?only=panel`).

```bash
cd video && npm install
npx remotion studio   # live preview and editing
npx remotion render QuickApeIntro out/quickape-intro.mp4
```

`QuickApeWalkthrough` (`video/src/walkthrough.tsx`) edits two raw screen recordings into a 90-second walkthrough: iOS-style card, Inter captions, zooms, and privacy blurs (Google/X/Phantom/Fomo avatars and the seed phrase). Put the recordings at `video/public/rec/a.mp4` and `b.mp4` (git-ignored) and render it the same way.

Remotion is free for individuals and companies with up to 3 employees; larger teams need a company license.

## Verify a release

1. Check out the tag that matches the store version (`version` in the installed `manifest.json`).
2. Build it: `npm ci && npm run build`. Output goes to `.output/chrome-mv3/`.
3. Compare with the installed extension. Chrome keeps it in
   `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions\<extension id>\<version>` on Windows and
   `~/Library/Application Support/Google/Chrome/Default/Extensions/<extension id>/<version>` on macOS. Chrome adds a
   `_metadata` folder when it installs; every other file should be identical:

   ```bash
   (cd .output/chrome-mv3 && find . -type f | sort | xargs sha256sum)
   ```

## License

[MIT](LICENSE). The QuickApe name and logo are not covered by the license; please use a different name and logo for
forks.

## Notes and limitations

- **Solana RPC**: `api.mainnet-beta.solana.com` refuses requests from browser extensions (HTTP 403), so the default is
  `solana-rpc.publicnode.com` (free, CORS-enabled; token balances fall back to associated-token-account lookups because it
  blocks indexed calls). For speed, use a free Helius key: `https://mainnet.helius-rpc.com/?api-key=…` in Settings.
- **Jupiter**: uses `/swap/v1` (Metis), which adds no Jupiter fee of its own. The default is `api.jup.ag` with automatic
  fallback to `lite-api.jup.ag` (being retired). A free API key from the Jupiter portal raises the rate limit.
- pump.fun tokens that are still on the bonding curve can be bought (Jupiter routes Pump.fun, Meteora DBC, Raydium
  Launchlab, and more).
- **EVM**: KyberSwap caps slippage at 20%. High-tax tokens and launchpad bonding-curve tokens (four.meme, etc.) may not
  have a route yet.
- **Fomo**: token pages (`fomo.family/tokens/{chain}/{CA}`) only open when you are logged in to Fomo.
- **Telegram Web**: select/double-click a CA or hover a token link (there are no automatic per-message chips yet).
- Memecoin trading is extremely risky. This extension does not guarantee that a token is safe, even when no warnings
  are shown.
