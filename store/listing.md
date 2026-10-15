# QuickApe: Chrome Web Store listing

Copy-paste source for every field in the Chrome Web Store Developer Dashboard.
Upload package: `.output/quickape-1.0.3-chrome.zip` (build with `npm run zip`).

---

## 1. Package

| Field | Value |
| --- | --- |
| Package | `.output/quickape-1.0.3-chrome.zip` |
| Version | 1.0.3 |
| Manifest | MV3, no `key` field, no remote code |

---

## 2. Store listing tab

### Name (from manifest)

```
QuickApe
```

### Summary (from manifest, 99/132 chars)

```
Buy and sell memecoins in one click, right on the pages where you find them. Solana and EVM chains.
```

### Description

```
QuickApe adds a 1-click buy button next to token contract addresses on the crypto sites and social feeds where you find memecoins, plus a full trading panel on token pages. See a contract address, click once, and the swap is built, signed, and sent.

HOW IT WORKS
• In social feeds, posts and bios that contain a contract address get a quick-buy button. A $TICKER opens the panel so you can pick the right token.
• On token and chart pages, a trading panel docks next to the chart.
• Anywhere QuickApe runs, hover a token link or select a contract address to get a quick-buy button.
• Supported sites are listed in Settings, where you can turn each one off.

CHAINS
Solana, plus the EVM networks Ethereum, Base, and BNB Chain. Swaps are routed through DEX aggregators, including Solana tokens still on a launchpad bonding curve.

TWO WAYS TO SIGN
• Trading wallet (1-click): create a fresh wallet inside QuickApe, fund it with only what you plan to trade, and trades go through without pop-ups. Keys are encrypted with your password (PBKDF2 + AES-256-GCM) and never leave your device. Withdraw back to your main wallet anytime.
• Connected wallet: use the browser wallet you already have. QuickApe holds no keys, and your wallet asks you to approve every trade.

THE PANEL
• Price, market cap, liquidity, 24h volume, token age, and price change
• Safety flags: honeypot and buy/sell tax checks on EVM, mint and freeze authority on Solana, low liquidity
• Buy presets and custom amounts; sell 25%, 50%, 100%, or any percent
• Your balance and position value
• Max buy per trade, slippage, and priority fee settings

WALLET TOOLS
• Deposit by QR code with live balance updates
• Withdraw to any address
• Reclaim SOL rent from empty token accounts
• Activity log of your last 100 trades and withdrawals
• Auto-lock after inactivity

FEES
QuickApe charges 0.5% of each buy and sell. The fee is paid in the network's native coin inside the same swap transaction, shown in the panel before you trade, and visible on the block explorer. Network, priority, and DEX fees are separate and don't go to QuickApe.

PRIVACY
No account, no analytics, no ads. QuickApe reads the page you're viewing only to find token addresses, and contacts market-data, swap, and RPC services to show prices and send the trades you ask for. Details: https://www.quickape.world/privacy

RISK
Memecoins are extremely volatile, and most lose most of their value. Safety flags are informational and can't guarantee a token is safe. Blockchain transactions are irreversible. Only trade what you can afford to lose. Nothing here is financial advice.

QuickApe is an independent project and isn't affiliated with or endorsed by the sites, wallets, or exchanges it works with.
```

### Category and language

| Field | Value |
| --- | --- |
| Category | Productivity → Tools |
| Language | English |

### Graphic assets

| Field | File | Size |
| --- | --- | --- |
| Store icon | `store/store-icon-128.png` | 128×128 (96 art + 16 px padding) |
| Screenshot 1 | `store/screenshots/1-one-click.png` | 1280×800 |
| Screenshot 2 | `store/screenshots/2-trading-panel.png` | 1280×800 |
| Screenshot 3 | `store/screenshots/3-deposit-withdraw.png` | 1280×800 |
| Screenshot 4 | `store/screenshots/4-wallet-modes.png` | 1280×800 |
| Screenshot 5 | `store/screenshots/5-fees.png` | 1280×800 |
| Small promo tile | `store/promo/small-tile-440x280.png` | 440×280 |
| Marquee promo tile | `store/promo/marquee-1400x560.png` | 1400×560 |

Screenshots are 24-bit PNG without alpha. They're rendered from the real extension UI with mock data
(`npm run preview:ui`, then open `/store/shot.html?n=1` … `?n=5` and `/store/promo.html?size=small|marquee`).

### Additional fields

| Field | Value |
| --- | --- |
| Official URL | `quickape.world` (verified in Google Search Console via the `google-site-verification` TXT record at the registrar; keep that record) |
| Homepage URL | `https://www.quickape.world` |
| Support URL | `https://www.quickape.world/#faq` |
| Mature content | No |

---

## 3. Privacy practices tab

### Single purpose description

```
QuickApe lets users buy and sell crypto tokens in one click from the web pages where those tokens appear. It detects token contract addresses on supported sites, shows the token's market data and safety flags, and builds and signs swap transactions with the user's trading wallet or connected wallet.
```

### Permission justifications

**storage**
```
Stores the user's encrypted trading wallet (PBKDF2 + AES-256-GCM, encrypted with the user's password), settings such as quick-buy amounts and slippage, and the last 100 trades. While the wallet is unlocked, the session key is kept in storage.session, which the browser clears on exit. Nothing is synced or sent to us.
```

**alarms**
```
Locks the trading wallet automatically after the inactivity period the user chooses (Settings → Auto-lock), and keeps the background worker alive while a submitted trade is being confirmed.
```

**notifications**
```
Shows a system notification when a buy, sell, or withdrawal the user started is confirmed or fails, including after the popup or tab is closed.
```

**Host permissions**
```
The extension only contacts the services it needs to show token data and execute the trades the user starts:
• api.dexscreener.com: token price, market cap, liquidity, and search.
• api.gopluslabs.io: honeypot and tax checks for EVM tokens.
• api.jup.ag and lite-api.jup.ag: Solana swap quotes and transactions (Jupiter).
• aggregator-api.kyberswap.com: Base, BSC, and Ethereum swap routes (KyberSwap).
• www.quickape.world: QuickApe's own Solana RPC endpoint (www.quickape.world/api/rpc) for balances and sending transactions.
• solana-rpc.publicnode.com and *.helius-rpc.com: backup Solana RPC and a user-provided Helius RPC.
• mainnet.block-engine.jito.wtf: sends Solana transactions with a Jito tip, only when the user enables it.
• ethereum-rpc.publicnode.com, mainnet.base.org, bsc-dataseed.bnbchain.org: Ethereum, Base, and BSC RPC for balances and transactions.

Content scripts run only on the trading sites where tokens are shared: x.com, twitter.com, mobile.x.com, gmgn.ai, dexscreener.com, pump.fun, fomo.family, birdeye.so, axiom.trade, and web.telegram.org. They find token contract addresses on the page, add quick-buy buttons, and show the trading panel on token pages. A small script in the page context (wallet-bridge) is needed only for connected mode, to ask the user's own Phantom or MetaMask wallet to approve a transaction. Users can turn off each site in Settings.
```

### Remote code

```
No, I am not using remote code.
```
All JavaScript ships in the package. The extension fetches JSON data and unsigned or signed transactions from the APIs above. It never loads or evaluates remote scripts.

### Data usage: what user data is collected

Check these boxes:

| Category | Check | Why |
| --- | --- | --- |
| Personally identifiable information | No | |
| Health information | No | |
| Financial and payment information | **Yes** | Public wallet addresses, balances, and the trades the user makes, sent to swap APIs and RPCs to execute trades |
| Authentication information | **Yes** | Trading wallet seed phrase and private keys, encrypted and stored only on the device |
| Personal communications | No | |
| Location | No | |
| Web history | No | |
| User activity | No | |
| Website content | **Yes** | Text and links on supported pages are scanned locally for token addresses; only a detected token address is sent to market-data APIs |

### Certifications (check all three)

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL

```
https://www.quickape.world/privacy
```

---

## 4. Distribution tab

| Field | Value |
| --- | --- |
| Payments | Free of charge (the 0.5% swap fee is disclosed in the listing) |
| Visibility | Public (or Unlisted for a soft launch) |
| Regions | All regions, unless you choose to exclude restricted ones |

---

## 5. Test instructions (for the reviewer)

```
No account or login is needed.

1. Click the QuickApe toolbar icon and choose "Create trading wallet". Tick "I've saved my seed phrase" (no need to write it down for testing) and set a password of 8+ characters.
2. Open a token page, e.g. https://gmgn.ai/sol/token/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 (BONK) or https://dexscreener.com/solana/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263. The trading panel appears with price, liquidity, and safety flags.
3. On https://x.com, any post containing a token contract address gets a quick-buy button below it. On any supported site, selecting a contract address also shows a quick-buy button.
4. The popup's Wallet tab shows Deposit (QR code), Withdraw, and balances on Solana, Base, BSC, and Ethereum.

Buying requires funds in the trading wallet (for example 0.02 SOL). Without funds, a buy stops right away with "Not enough SOL … Deposit from the Wallet tab" and nothing is sent.

Connected mode: choose "Connect Phantom / MetaMask" instead. Trades then open the user's own wallet for approval and QuickApe holds no keys.

Fee disclosure: QuickApe takes 0.5% of each trade inside the swap transaction. It's shown in the panel footer and in Settings → Fees before any trade.
```

---

## 6. Before you submit

- [ ] Register the Chrome Web Store developer account (one-time US$5 fee) and verify the contact email.
- [ ] Make sure `support@quickape.world` (used in the privacy policy and terms) receives mail, or replace it.
- [ ] Confirm https://www.quickape.world/privacy and https://www.quickape.world/terms are live.
- [ ] Upload the zip, fill in the tabs above, and submit for review.

## 7. After approval

- [ ] Copy the store item ID (the 32-letter ID in the listing URL).
- [ ] In Vercel → quickape → Settings → Environment Variables, set `ALLOWED_EXTENSION_IDS` to that ID so only the store build can use the RPC proxy, then redeploy.
- [ ] Put the listing URL into `LINKS.chromeStore` in `site/index.html` and change "Chrome Web Store listing coming soon", then `npm run deploy:site`.
