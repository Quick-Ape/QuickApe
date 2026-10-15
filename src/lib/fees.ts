import type { ChainId } from './types';

/**
 * QuickApe's trading fee. Taken inside the swap itself (Jupiter platform fee on Solana,
 * KyberSwap fee receiver on EVM), always in the native coin, and shown before every trade.
 */
export const FEES = {
  /** 0.5% per trade. */
  baseBps: 50,
  wallets: {
    solana: '78qnj9Fx6gA27K9yg8KH2xFG8jvVQWkrgdAC2dKTc6z',
    evm: '0xcab2cd99E04CfC72344cee6CFf489AdF057EAD01',
  },
  /**
   * Holding at least `minAmount` of this Solana token lowers the fee to `bps`.
   * Fill in when the QuickApe token launches; null keeps everyone on the base fee.
   */
  holderDiscount: null as null | { mint: string; minAmount: number; bps: number; label: string },
};

export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export const bpsLabel = (bps: number) => `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

export function feeWallet(chain: ChainId): string {
  return chain === 'solana' ? FEES.wallets.solana : FEES.wallets.evm;
}
