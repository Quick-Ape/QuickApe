import type { EvmTxJson } from './messages';
import type { EvmWalletPref, SolanaWalletPref } from './settings';

/**
 * Message protocol between the content script (isolated world) and the wallet bridge
 * (page main world, where Phantom / MetaMask inject their providers). Carried over
 * window.postMessage on the page itself.
 */
export const BRIDGE_TAG = '__quickape_wallet_bridge__';

export interface BridgeMethods {
  solConnect: { params: { prefer: SolanaWalletPref }; result: { address: string; wallet: string } };
  solSignAndSend: { params: { prefer: SolanaWalletPref; tx: string }; result: { signature: string } };
  evmConnect: { params: { prefer: EvmWalletPref }; result: { address: string; wallet: string } };
  evmSend: { params: { prefer: EvmWalletPref; chainId: number; tx: EvmTxJson }; result: { hash: string } };
}

export type BridgeMethod = keyof BridgeMethods;

export interface BridgeRequest<M extends BridgeMethod = BridgeMethod> {
  tag: typeof BRIDGE_TAG;
  dir: 'req';
  id: string;
  method: M;
  params: BridgeMethods[M]['params'];
}

export interface BridgeResponse {
  tag: typeof BRIDGE_TAG;
  dir: 'res';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
