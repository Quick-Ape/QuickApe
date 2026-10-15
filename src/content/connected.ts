import { BRIDGE_TAG, type BridgeMethod, type BridgeMethods, type BridgeResponse } from '@/lib/bridge';
import { send } from '@/lib/messages';
import type { TradeRecord } from '@/lib/types';
import type { TradeParams } from '@/ui/actions';
import { getState } from '@/ui/store';

/**
 * Call the main-world wallet bridge. Page scripts can see these messages, but they gain
 * nothing: the page can already talk to the wallet itself, and every signature still
 * needs the user's approval in the wallet's own popup.
 */
function bridgeCall<M extends BridgeMethod>(method: M, params: BridgeMethods[M]['params'], timeoutMs = 180_000) {
  return new Promise<BridgeMethods[M]['result']>((resolve, reject) => {
    const id = crypto.randomUUID();
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window) return;
      const m = e.data as BridgeResponse | undefined;
      if (!m || m.tag !== BRIDGE_TAG || m.dir !== 'res' || m.id !== id) return;
      cleanup();
      if (m.ok) resolve(m.result as BridgeMethods[M]['result']);
      else reject(new Error(m.error ?? 'Wallet error'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Your wallet didn't respond — is it installed and unlocked?"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ tag: BRIDGE_TAG, dir: 'req', id, method, params }, window.location.origin);
  });
}

/**
 * Connected mode: the user's Phantom / MetaMask signs on this page.
 * resolve token → connect wallet → background builds unsigned tx → wallet approves & sends → background tracks.
 */
export async function connectedTrade(params: TradeParams, stage: (text: string) => void): Promise<TradeRecord> {
  const settings = getState().settings;
  if (!settings) throw new Error('Settings not loaded yet — try again');

  stage('Finding token…');
  const resolved = await send({ type: 'resolve', req: params.req });
  if (!('token' in resolved)) throw new Error('Pick the right token first (ambiguous ticker)');
  const token = resolved.token;
  const isSolana = token.chain === 'solana';

  stage('Connecting your wallet…');
  const prefer = isSolana ? settings.connectedWallets.solana : settings.connectedWallets.evm;
  const { address } = isSolana
    ? await bridgeCall('solConnect', { prefer: settings.connectedWallets.solana })
    : await bridgeCall('evmConnect', { prefer: settings.connectedWallets.evm });
  send({ type: 'setConnected', family: isSolana ? 'solana' : 'evm', address }).catch(() => {});

  stage('Building transaction…');
  const prepared = await send({
    type: 'prepareTrade',
    ...params,
    req: { chain: token.chain, address: token.address, source: params.req.source },
    owners: isSolana ? { solana: address } : { evm: address },
  });

  if (prepared.solana) {
    stage('Approve the swap in your wallet…');
    const { signature } = await bridgeCall('solSignAndSend', {
      prefer: prefer as typeof settings.connectedWallets.solana,
      tx: prepared.solana.tx,
    });
    return send({
      type: 'trackTrade',
      record: prepared.record,
      txId: signature,
      lastValidBlockHeight: prepared.solana.lastValidBlockHeight,
    });
  }

  const evm = prepared.evm;
  if (!evm) throw new Error('Nothing to sign');
  const evmPrefer = settings.connectedWallets.evm;
  if (evm.approve) {
    stage(`Approve ${token.symbol} spending in your wallet (one time)…`);
    const { hash } = await bridgeCall('evmSend', { prefer: evmPrefer, chainId: evm.chainId, tx: evm.approve });
    stage('Waiting for the approval to confirm…');
    await send({ type: 'waitApproval', chain: token.chain, hash });
  }
  stage('Approve the swap in your wallet…');
  const { hash } = await bridgeCall('evmSend', { prefer: evmPrefer, chainId: evm.chainId, tx: evm.swap });
  return send({ type: 'trackTrade', record: prepared.record, txId: hash });
}
