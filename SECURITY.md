# Security policy

QuickApe signs transactions and stores an encrypted trading wallet, so we take security reports seriously.

## Reporting a vulnerability

Please report privately. Don't open a public issue.

- Email **support@quickape.world** with "Security" in the subject, or
- use GitHub's **Report a vulnerability** button (Security tab → Advisories) on this repository.

Include the affected version (popup → Settings, or `version` in `manifest.json`), steps to reproduce, and the impact you
see. We'll acknowledge within 72 hours and keep you updated until it's fixed. Please give us a reasonable time to ship a
fix before disclosing publicly.

## In scope

- Anything that could leak or misuse the trading wallet's keys or seed phrase (vault encryption, session key handling,
  auto-lock).
- A website or another extension making QuickApe sign or send a transaction the user didn't start, or changing its
  amount, destination, slippage, or fee.
- Swap transactions that send funds anywhere other than the swap itself and the published fee wallets.
- The MAIN-world wallet bridge (connected mode) and the message router between content scripts and the background.
- The RPC proxy in `site/api/rpc.ts` (bypassing its method allowlist, origin check, or rate limit).

## Out of scope

- Losses from trading itself: rug pulls, honeypots, slippage, or tokens the safety flags didn't catch.
- Bugs in third-party services (Jupiter, KyberSwap, Dexscreener, GoPlus, RPC providers, wallets).
- Issues that need a compromised computer or browser, or the user's password.

## Fee wallets

QuickApe only ever sends fees to these addresses. A transaction built by QuickApe that pays anyone else is a bug,
please report it:

- Solana: `78qnj9Fx6gA27K9yg8KH2xFG8jvVQWkrgdAC2dKTc6z`
- EVM (Base, BSC, Ethereum): `0xcab2cd99E04CfC72344cee6CFf489AdF057EAD01`
