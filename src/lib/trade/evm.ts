import { encodeFunctionData, erc20Abi, maxUint256, type Hex } from 'viem';
import { CHAINS } from '../chains';
import { publicClient, walletClient } from '../evm/client';
import { keepAlive } from '../keepalive';
import type { Settings } from '../settings';
import type { EvmChainId } from '../types';
import type { EvmWallet } from '../wallet/keys';

export const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const KYBER = 'https://aggregator-api.kyberswap.com';
const CLIENT_ID = 'quickape';

interface KyberRoute {
  routeSummary: { amountIn: string; amountOut: string; [k: string]: unknown };
  routerAddress: Hex;
}

interface KyberBuild {
  amountIn: string;
  amountOut: string;
  gas: string;
  data: Hex;
  routerAddress: Hex;
  /** Native value (wei) to send along with the transaction. */
  transactionValue?: string;
}

async function kyber<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-client-id': CLIENT_ID, ...init?.headers },
  });
  const j = (await res.json().catch(() => ({}))) as { code?: number; message?: string; data?: T };
  if (!res.ok || j.code !== 0 || !j.data) {
    const msg = j.message ?? `HTTP ${res.status}`;
    if (/route not found|no route/i.test(msg)) throw new Error('KyberSwap has no route for this token yet');
    throw new Error(`KyberSwap: ${msg}`);
  }
  return j.data;
}

/** QuickApe fee for one swap, sent by the router to `receiver` in the native coin. */
export interface EvmSwapFee {
  bps: number;
  receiver: string;
}

async function route(chain: EvmChainId, tokenIn: string, tokenOut: string, amountIn: bigint, fee?: EvmSwapFee) {
  const q = new URLSearchParams({ tokenIn, tokenOut, amountIn: amountIn.toString(), gasInclude: 'true' });
  if (fee) {
    q.set('feeAmount', String(fee.bps));
    q.set('isInBps', 'true');
    // Always charge the native side: the input on buys, the output on sells.
    q.set('chargeFeeBy', tokenIn === NATIVE ? 'currency_in' : 'currency_out');
    q.set('feeReceiver', fee.receiver);
  }
  return kyber<KyberRoute>(`${KYBER}/${CHAINS[chain].kyber}/api/v1/routes?${q}`);
}

async function build(chain: EvmChainId, r: KyberRoute, sender: Hex, slippageBps: number) {
  return kyber<KyberBuild>(`${KYBER}/${CHAINS[chain].kyber}/api/v1/route/build`, {
    method: 'POST',
    body: JSON.stringify({
      routeSummary: r.routeSummary,
      sender,
      recipient: sender,
      // KyberSwap accepts 0-2000 bps (max 20%).
      slippageTolerance: Math.min(Math.max(Math.round(slippageBps), 0), 2000),
      deadline: Math.floor(Date.now() / 1000) + 600,
      source: CLIENT_ID,
    }),
  });
}

/** A transaction request the user's wallet (or ours) can send as-is. */
export interface EvmTxRequest {
  to: Hex;
  data: Hex;
  value: bigint;
  gas?: bigint;
}

export interface BuiltEvmSwap {
  /** Present when selling a token whose router allowance is too low (unlimited approve). */
  approve?: EvmTxRequest;
  swap: EvmTxRequest;
  amountOut: bigint;
}

/**
 * Route + calldata via the KyberSwap aggregator for `owner`. Nothing is signed here, so this
 * also powers connected mode (MetaMask sends the transactions).
 */
export async function buildEvmSwap(
  s: Settings,
  chain: EvmChainId,
  owner: Hex,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  fee?: EvmSwapFee,
): Promise<BuiltEvmSwap> {
  const pub = publicClient(chain, s.chains[chain].rpc);
  const isNativeIn = tokenIn === NATIVE;
  const r = await route(chain, tokenIn, tokenOut, amountIn, fee);

  let approve: EvmTxRequest | undefined;
  if (!isNativeIn) {
    const allowance = await pub.readContract({
      address: tokenIn as Hex,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner, r.routerAddress],
    });
    if (allowance < amountIn) {
      approve = {
        to: tokenIn as Hex,
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [r.routerAddress, maxUint256] }),
        value: 0n,
      };
    }
  }

  const b = await build(chain, r, owner, s.chains[chain].slippageBps);
  return {
    approve,
    swap: {
      to: b.routerAddress,
      data: b.data,
      value: b.transactionValue ? BigInt(b.transactionValue) : isNativeIn ? amountIn : 0n,
      // Kyber's gas estimate + a 30% buffer so we can skip eth_estimateGas (faster).
      gas: b.gas && b.gas !== '0' ? (BigInt(b.gas) * 13n) / 10n : undefined,
    },
    amountOut: BigInt(b.amountOut),
  };
}

/** Wait for a receipt, keeping the service worker alive. Throws if the transaction reverted. */
export async function waitEvmTx(s: Settings, chain: EvmChainId, hash: Hex, revertMessage: string): Promise<void> {
  const timer = setInterval(keepAlive, 10_000);
  try {
    const rec = await publicClient(chain, s.chains[chain].rpc).waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (rec.status !== 'success') throw new Error(revertMessage);
  } finally {
    clearInterval(timer);
  }
}

export const SWAP_REVERTED = 'Transaction reverted (slippage / tax / honeypot?)';

export interface SubmittedEvmSwap {
  hash: Hex;
  amountOut: bigint;
  confirmation: Promise<void>;
}

/**
 * Swap with the extension's trading wallet. When selling a token (ERC20 -> native), approve
 * the router first if the allowance is too low (once per token, unlimited).
 */
export async function evmSwap(
  s: Settings,
  chain: EvmChainId,
  wallet: EvmWallet,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  fee?: EvmSwapFee,
): Promise<SubmittedEvmSwap> {
  const wc = walletClient(chain, s.chains[chain].rpc, wallet.privateKey);
  const built = await buildEvmSwap(s, chain, wallet.address, tokenIn, tokenOut, amountIn, fee);

  if (built.approve) {
    const approveHash = await wc.sendTransaction(built.approve);
    keepAlive();
    await waitEvmTx(s, chain, approveHash, 'Token approval failed');
  }

  const hash = await wc.sendTransaction(built.swap);
  const confirmation = waitEvmTx(s, chain, hash, SWAP_REVERTED);
  confirmation.catch(() => {});
  return { hash, amountOut: built.amountOut, confirmation };
}
