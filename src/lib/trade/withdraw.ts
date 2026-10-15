import { isAddress, parseEther, type Hex } from 'viem';
import { isSolanaAddress } from '../address';
import { publicClient, walletClient } from '../evm/client';
import type { Settings } from '../settings';
import { getBalanceLamports, getLatestBlockhash, sendRawTransaction } from '../solana/rpc';
import { SOL_RENT_EXEMPT_MIN, SOL_TX_FEE, signSolTransfer } from '../solana/transfer';
import type { EvmChainId } from '../types';
import type { EvmWallet, SolanaWallet } from '../wallet/keys';
import { base64 } from '@scure/base';
import { waitEvmTx } from './evm';
import { confirmSignature } from './solana';

export interface SubmittedWithdraw {
  txId: string;
  /** Amount actually sent, in base units. */
  amount: bigint;
  confirmation: Promise<void>;
}

/** Send SOL from the trading wallet. `'max'` empties it (minus the network fee). */
export async function withdrawSol(
  s: Settings,
  wallet: SolanaWallet,
  to: string,
  amount: bigint | 'max',
): Promise<SubmittedWithdraw> {
  if (!isSolanaAddress(to)) throw new Error('Enter a valid Solana address');
  const rpc = s.chains.solana.rpc;
  const balance = await getBalanceLamports(rpc, wallet.address);

  let lamports: bigint;
  if (amount === 'max') {
    lamports = balance - SOL_TX_FEE;
    if (lamports <= 0n) throw new Error('Nothing to withdraw');
  } else {
    lamports = amount;
    const remaining = balance - lamports - SOL_TX_FEE;
    if (remaining < 0n) throw new Error('Insufficient balance (amount + network fee)');
    // A system account can't be left with less than the rent-exempt minimum (except exactly 0).
    if (remaining > 0n && remaining < SOL_RENT_EXEMPT_MIN)
      throw new Error('Leave at least 0.00089 SOL in the wallet, or withdraw Max');
  }
  if (lamports < SOL_RENT_EXEMPT_MIN) throw new Error('Minimum withdrawal is 0.00089 SOL');

  const { blockhash, lastValidBlockHeight } = await getLatestBlockhash(rpc);
  const { signed, signature } = signSolTransfer(wallet, to, lamports, blockhash);
  const txB64 = base64.encode(signed);
  const send = () => sendRawTransaction(rpc, txB64).then(() => {});
  await send();
  const confirmation = confirmSignature(rpc, signature, lastValidBlockHeight, send);
  confirmation.catch(() => {});
  return { txId: signature, amount: lamports, confirmation };
}

/** Send ETH / BNB from the trading wallet. `'max'` leaves only what the gas needs. */
export async function withdrawEvm(
  s: Settings,
  chain: EvmChainId,
  wallet: EvmWallet,
  to: string,
  amount: bigint | 'max',
): Promise<SubmittedWithdraw> {
  if (!isAddress(to)) throw new Error('Enter a valid EVM address (0x…)');
  if (to.toLowerCase() === wallet.address.toLowerCase()) throw new Error('Destination is the same as the trading wallet');
  const rpc = s.chains[chain].rpc;
  const pub = publicClient(chain, rpc);

  const [balance, fees, gas] = await Promise.all([
    pub.getBalance({ address: wallet.address }),
    pub.estimateFeesPerGas().catch(async () => ({ maxFeePerGas: await pub.getGasPrice() })),
    pub.estimateGas({ account: wallet.address, to: to as Hex, value: 1n }),
  ]);
  const perGas = ('maxFeePerGas' in fees && fees.maxFeePerGas) || ('gasPrice' in fees && fees.gasPrice) || 0n;
  // 20% buffer on gas, plus a little extra on Base for the L1 data fee.
  const reserve = (gas * perGas * 12n) / 10n + (chain === 'base' ? parseEther('0.00001') : 0n);

  let value: bigint;
  if (amount === 'max') {
    value = balance - reserve;
    if (value <= 0n) throw new Error('Balance is too low to cover gas');
  } else {
    value = amount;
    if (value <= 0n) throw new Error('Enter an amount');
    if (value + reserve > balance) throw new Error('Insufficient balance (amount + gas)');
  }

  const hash = await walletClient(chain, rpc, wallet.privateKey).sendTransaction({ to: to as Hex, value, gas });
  const confirmation = waitEvmTx(s, chain, hash, 'Withdrawal failed');
  confirmation.catch(() => {});
  return { txId: hash, amount: value, confirmation };
}
