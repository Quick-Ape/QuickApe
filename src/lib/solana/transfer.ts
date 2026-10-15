import { compileLegacyTx, transferIx } from './legacy';
import { signSerializedTx } from './tx';

/** Base fee for a transaction with one signature. */
export const SOL_TX_FEE = 5000n;
/** Rent-exempt minimum for a plain system account (0 bytes of data). */
export const SOL_RENT_EXEMPT_MIN = 890_880n;

/**
 * Legacy transaction with one SystemProgram.transfer instruction, serialized with an
 * empty signature slot (ready for `signSerializedTx`).
 */
export function buildSolTransfer(from: string, to: string, lamports: bigint, recentBlockhash: string): Uint8Array {
  if (from === to) throw new Error('Destination is the same as the trading wallet');
  return compileLegacyTx(from, [transferIx(from, to, lamports)], recentBlockhash);
}

export function signSolTransfer(
  wallet: { address: string; seed: Uint8Array },
  to: string,
  lamports: bigint,
  recentBlockhash: string,
) {
  return signSerializedTx(buildSolTransfer(wallet.address, to, lamports, recentBlockhash), wallet);
}
