import { FEES } from '@/lib/fees';
import { formatUnits } from '@/lib/format';
import type { Settings } from '@/lib/settings';
import { getBalanceLamports, getTokenBalance } from '@/lib/solana/rpc';
import type { SwapFee } from '@/lib/trade/solana';

/** A plain SOL account needs this much to exist; smaller transfers into an empty one fail. */
const RENT_EXEMPT_MIN = 890_880n;
let feeWallet = { checkedAt: 0, funded: false };

/** Whether the Solana fee wallet exists on-chain, so a small fee transfer into it can't fail the trade. */
async function feeWalletFunded(rpcUrl: string): Promise<boolean> {
  if (Date.now() - feeWallet.checkedAt < (feeWallet.funded ? 2 : 1) * 60_000) return feeWallet.funded;
  try {
    const lamports = await getBalanceLamports(rpcUrl, FEES.wallets.solana);
    feeWallet = { checkedAt: Date.now(), funded: lamports >= RENT_EXEMPT_MIN };
  } catch {
    // RPC hiccup: keep the last answer rather than blocking the trade.
  }
  return feeWallet.funded;
}

const discountCache = new Map<string, { at: number; bps: number }>();

/** Base fee, or the holder discount when it's configured and the owner holds enough of the token. */
export async function feeBpsFor(owners: { solana?: string }, settings: Settings): Promise<number> {
  const d = FEES.holderDiscount;
  if (!d || !owners.solana) return FEES.baseBps;
  const hit = discountCache.get(owners.solana);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.bps;
  let bps = FEES.baseBps;
  try {
    const b = await getTokenBalance(settings.chains.solana.rpc, owners.solana, d.mint);
    if (Number(formatUnits(b.raw, b.decimals)) >= d.minAmount) bps = d.bps;
  } catch {}
  discountCache.set(owners.solana, { at: Date.now(), bps });
  return bps;
}

/**
 * Solana fee for a swap: a SOL transfer to the fee wallet inside the swap transaction. If the
 * fee wallet doesn't exist on-chain yet, a small fee would fail the whole trade, so the trade
 * goes through without one.
 */
export async function solanaSwapFee(settings: Settings, bps: number): Promise<SwapFee | undefined> {
  if (bps <= 0) return undefined;
  if (!(await feeWalletFunded(settings.chains.solana.rpc))) return undefined;
  return { bps, to: FEES.wallets.solana };
}
