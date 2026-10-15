import { CHAINS, EVM_CHAIN_IDS, isEvmChain } from '@/lib/chains';
import { erc20Balance, publicClient } from '@/lib/evm/client';
import { formatUnits } from '@/lib/format';
import { resolveToken, safetyFlags, tokenInfo } from '@/lib/market';
import type { Balances, ExportedSecrets, Request, ResponseMap } from '@/lib/messages';
import { loadSettings, saveSettings, type Settings } from '@/lib/settings';
import { getBalanceLamports, getTokenBalance } from '@/lib/solana/rpc';
import type { ChainId, TokenRef, TokenView } from '@/lib/types';
import {
  evmFromMnemonic,
  evmFromPrivateKey,
  exportSolanaSecret,
  newMnemonic,
  normalizeMnemonic,
  parseSolanaSecret,
  solanaFromMnemonic,
  type VaultData,
} from '@/lib/wallet/keys';
import type { Hex } from 'viem';
import { reclaimRent } from './reclaim';
import * as session from './session';
import { executeTrade, executeWithdraw, prepareTrade, tradeHistory, trackTrade, waitApproval } from './trades';
import { isEvmAddress, isSolanaAddress } from '@/lib/address';

type Sender = Browser.runtime.MessageSender;

/** Requests that may only come from the extension's own pages (popup), not content scripts. */
const PRIVILEGED = new Set<Request['type']>([
  'generateMnemonic',
  'createVault',
  'unlock',
  'lock',
  'resetVault',
  'exportSecrets',
  'saveSettings',
  'balances',
  'trades',
  'withdraw',
  'reclaimRent',
]);

function isExtensionPage(sender: Sender): boolean {
  return sender.id === browser.runtime.id && !sender.tab && !!sender.url?.startsWith(browser.runtime.getURL('/'));
}

/** Content scripts don't need to know RPC URLs / API keys. */
function publicSettings(s: Settings): Settings {
  const c = structuredClone(s);
  for (const id of Object.keys(c.chains) as ChainId[]) c.chains[id].rpc = '';
  c.jupiter.apiKey = '';
  return c;
}

async function tokenView(ref: TokenRef, settings: Settings): Promise<TokenView> {
  const token = await tokenInfo(ref, settings);
  const owners = await session.getOwnerAddresses(settings.signer);
  const rpc = settings.chains[ref.chain].rpc;
  const native = CHAINS[ref.chain];

  const holdingP = (async () => {
    if (ref.chain === 'solana' && owners.solana) {
      const b = await getTokenBalance(rpc, owners.solana, ref.address);
      return { raw: b.raw, decimals: b.decimals };
    }
    if (isEvmChain(ref.chain) && owners.evm) {
      const b = await erc20Balance(ref.chain, rpc, ref.address as Hex, owners.evm);
      return { raw: b.raw, decimals: b.decimals };
    }
    return undefined;
  })().catch(() => undefined);

  const nativeP = (async () => {
    if (ref.chain === 'solana' && owners.solana) return getBalanceLamports(rpc, owners.solana);
    if (isEvmChain(ref.chain) && owners.evm) return publicClient(ref.chain, rpc).getBalance({ address: owners.evm });
    return undefined;
  })().catch(() => undefined);

  const [flags, holding, nativeRaw] = await Promise.all([safetyFlags(token, settings), holdingP, nativeP]);
  return {
    token,
    flags,
    holding: holding && {
      raw: holding.raw.toString(),
      decimals: holding.decimals,
      ui: Number(formatUnits(holding.raw, holding.decimals)),
    },
    native: nativeRaw !== undefined ? { ui: Number(formatUnits(nativeRaw, native.decimals)), symbol: native.symbol } : undefined,
  };
}

async function balances(settings: Settings): Promise<Balances> {
  const owners = await session.getOwnerAddresses(settings.signer);
  const out: Balances = { native: {} };
  const jobs: Promise<void>[] = [];
  if (owners.solana && settings.chains.solana.enabled) {
    jobs.push(
      getBalanceLamports(settings.chains.solana.rpc, owners.solana)
        .then((b) => void (out.native.solana = Number(formatUnits(b, 9))))
        .catch((e: Error) => void ((out.errors ??= {}).solana = e.message)),
    );
  }
  if (owners.evm) {
    const evm = owners.evm;
    for (const c of EVM_CHAIN_IDS.filter((c) => settings.chains[c].enabled)) {
      jobs.push(
        publicClient(c, settings.chains[c].rpc)
          .getBalance({ address: evm })
          .then((b) => void (out.native[c] = Number(formatUnits(b, 18))))
          // viem errors are multi-line; the short message is enough for the UI.
          .catch((e: Error & { shortMessage?: string }) => void ((out.errors ??= {})[c] = e.shortMessage ?? e.message)),
      );
    }
  }
  await Promise.all(jobs);
  return out;
}

async function createVault(msg: Extract<Request, { type: 'createVault' }>) {
  const data: VaultData = { createdAt: Date.now() };
  if (msg.mnemonic) {
    data.mnemonic = normalizeMnemonic(msg.mnemonic);
    data.accountIndex = Math.max(0, Math.floor(msg.accountIndex ?? 0));
  }
  // Validate first so errors are clear before the vault is created.
  if (msg.solanaKey?.trim()) data.solanaSecret = exportSolanaSecret(parseSolanaSecret(msg.solanaKey));
  if (msg.evmKey?.trim()) data.evmPrivateKey = evmFromPrivateKey(msg.evmKey).privateKey;
  await session.create(data, msg.password);
}

async function exportSecrets(password: string): Promise<ExportedSecrets> {
  const data = await session.verifyPassword(password);
  const idx = data.accountIndex ?? 0;
  const solana = data.solanaSecret
    ? parseSolanaSecret(data.solanaSecret)
    : data.mnemonic
      ? solanaFromMnemonic(data.mnemonic, idx)
      : undefined;
  const evm = data.evmPrivateKey
    ? evmFromPrivateKey(data.evmPrivateKey)
    : data.mnemonic
      ? evmFromMnemonic(data.mnemonic, idx)
      : undefined;
  return {
    mnemonic: data.mnemonic,
    solana: solana && exportSolanaSecret(solana),
    evm: evm?.privateKey,
  };
}

export async function handle<R extends Request>(msg: R, sender: Sender): Promise<ResponseMap[R['type']]> {
  if (PRIVILEGED.has(msg.type) && !isExtensionPage(sender)) throw new Error('This request is only allowed from the extension popup');
  const settings = await loadSettings();
  const m = msg as Request;
  type Out = ResponseMap[R['type']];

  switch (m.type) {
    case 'state':
      return (await session.walletState()) as Out;
    case 'generateMnemonic':
      return newMnemonic() as Out;
    case 'createVault':
      await createVault(m);
      return (await session.walletState()) as Out;
    case 'unlock':
      await session.unlock(m.password);
      return (await session.walletState()) as Out;
    case 'lock':
      await session.lock();
      return (await session.walletState()) as Out;
    case 'resetVault':
      await session.reset();
      return (await session.walletState()) as Out;
    case 'exportSecrets':
      return (await exportSecrets(m.password)) as Out;
    case 'getSettings':
      return (isExtensionPage(sender) ? settings : publicSettings(settings)) as Out;
    case 'saveSettings':
      await saveSettings(m.settings);
      return (await loadSettings()) as Out;
    case 'resolve':
      return (await resolveToken(m.req, settings)) as Out;
    case 'tokenView':
      return (await tokenView(m.ref, settings)) as Out;
    case 'balances':
      return (await balances(settings)) as Out;
    case 'trade':
      return (await executeTrade(m, settings, sender.tab?.id)) as Out;
    case 'trades':
      return (await tradeHistory()) as Out;
    case 'openPopup':
      try {
        await browser.action.openPopup();
        return true as Out;
      } catch {
        return false as Out;
      }
    case 'setConnected': {
      const ok = m.family === 'solana' ? isSolanaAddress(m.address) : isEvmAddress(m.address);
      if (!ok) throw new Error('Invalid wallet address');
      await session.setConnected(m.family, m.address);
      return (await session.walletState()) as Out;
    }
    case 'prepareTrade': {
      if (settings.signer !== 'connected') throw new Error('Connected mode is off');
      const { owners, type: _type, ...params } = m;
      return (await prepareTrade(params, settings, { solana: owners.solana, evm: owners.evm as Hex | undefined })) as Out;
    }
    case 'trackTrade':
      return (await trackTrade(m.record, m.txId, settings, m.lastValidBlockHeight, sender.tab?.id)) as Out;
    case 'waitApproval':
      return (await waitApproval(m.chain, m.hash, settings)) as Out;
    case 'reclaimRent':
      return (await reclaimRent(settings)) as Out;
    case 'withdraw':
      if (settings.signer !== 'local') throw new Error('Withdrawals are for the trading wallet');
      return (await executeWithdraw(m.chain, m.to, m.amount, settings)) as Out;
  }
}
