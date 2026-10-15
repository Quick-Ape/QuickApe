import { loadSettings } from '@/lib/settings';
import type { SignerMode, WalletState } from '@/lib/types';
import type { Hex } from 'viem';
import { deriveWallets, type VaultData, type Wallets } from '@/lib/wallet/keys';
import {
  createVault,
  decryptWithKey,
  exportKey,
  importKey,
  openVault,
  type EncryptedVault,
} from '@/lib/wallet/vault';

/**
 * Wallet lifecycle:
 * - storage.local  : encrypted vault (persistent)
 * - storage.session: PBKDF2-derived AES key + auto-lock time (cleared when the browser closes,
 *                    not readable by content scripts)
 * - SW memory      : decrypted vault data (lost when the SW sleeps, restored from session)
 */
const VAULT = 'vault';
const SESSION_KEY = 'vaultKey';
const LOCK_AT = 'lockAt';

let unlocked: { data: VaultData; wallets: Wallets } | null = null;

async function loadVault(): Promise<EncryptedVault | undefined> {
  return (await browser.storage.local.get(VAULT))[VAULT] as EncryptedVault | undefined;
}

async function lockDeadline(): Promise<number> {
  const { autoLockMinutes } = await loadSettings();
  return autoLockMinutes > 0 ? Date.now() + autoLockMinutes * 60_000 : 0;
}

async function startSession(key: CryptoKey, data: VaultData): Promise<void> {
  unlocked = { data, wallets: deriveWallets(data) };
  await browser.storage.session.set({ [SESSION_KEY]: await exportKey(key), [LOCK_AT]: await lockDeadline() });
}

/** The unlocked wallets, or null if locked. */
export async function getWallets(): Promise<Wallets | null> {
  if (unlocked) return unlocked.wallets;
  const s = await browser.storage.session.get([SESSION_KEY, LOCK_AT]);
  const raw = s[SESSION_KEY] as string | undefined;
  const lockAt = s[LOCK_AT] as number | undefined;
  if (!raw) return null;
  if (lockAt && Date.now() > lockAt) {
    await lock();
    return null;
  }
  const vault = await loadVault();
  if (!vault) return null;
  const data = await decryptWithKey<VaultData>(vault, await importKey(raw));
  unlocked = { data, wallets: deriveWallets(data) };
  return unlocked.wallets;
}

export async function getVaultData(): Promise<VaultData | null> {
  await getWallets();
  return unlocked?.data ?? null;
}

/** Extend the auto-lock timer every time the wallet is used. */
export async function touch(): Promise<void> {
  if (await getWallets()) await browser.storage.session.set({ [LOCK_AT]: await lockDeadline() });
}

export async function create(data: VaultData, password: string): Promise<void> {
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  const wallets = deriveWallets(data);
  if (!wallets.solana && !wallets.evm) throw new Error('Enter a seed phrase or at least one private key');
  const { vault, key } = await createVault(data, password);
  await browser.storage.local.set({ [VAULT]: vault });
  await startSession(key, data);
}

export async function unlock(password: string): Promise<void> {
  const vault = await loadVault();
  if (!vault) throw new Error('No wallet yet — create or import one first');
  const { data, key } = await openVault<VaultData>(vault, password);
  await startSession(key, data);
}

/** Check the password without changing state (for exporting private keys). */
export async function verifyPassword(password: string): Promise<VaultData> {
  const vault = await loadVault();
  if (!vault) throw new Error('No wallet yet — create or import one first');
  return (await openVault<VaultData>(vault, password)).data;
}

export async function lock(): Promise<void> {
  unlocked = null;
  await browser.storage.session.remove([SESSION_KEY, LOCK_AT]);
}

export async function reset(): Promise<void> {
  await lock();
  await browser.storage.local.remove(VAULT);
}

export async function checkAutoLock(): Promise<boolean> {
  const lockAt = (await browser.storage.session.get(LOCK_AT))[LOCK_AT] as number | undefined;
  if (lockAt && Date.now() > lockAt) {
    await lock();
    return true;
  }
  return false;
}

// ---- connected mode (Phantom / MetaMask) ----

const CONNECTED = 'connectedAccounts';

export type ConnectedAccounts = { solana?: string; evm?: string };

export async function getConnected(): Promise<ConnectedAccounts> {
  return ((await browser.storage.local.get(CONNECTED))[CONNECTED] as ConnectedAccounts | undefined) ?? {};
}

/** Remember the last address the user connected on a site, for balances and display in the popup. */
export async function setConnected(family: 'solana' | 'evm', address: string): Promise<void> {
  const current = await getConnected();
  await browser.storage.local.set({ [CONNECTED]: { ...current, [family]: address } });
}

/** Addresses trades and balances are for: the trading wallet (local mode) or the connected wallet. */
export async function getOwnerAddresses(signer: SignerMode): Promise<{ solana?: string; evm?: Hex }> {
  if (signer === 'connected') {
    const c = await getConnected();
    return { solana: c.solana, evm: c.evm as Hex | undefined };
  }
  const wallets = await getWallets().catch(() => null);
  return { solana: wallets?.solana?.address, evm: wallets?.evm?.address };
}

export async function walletState(): Promise<WalletState> {
  const [{ signer }, hasVault, connected] = await Promise.all([loadSettings(), loadVault().then((v) => !!v), getConnected()]);
  const wallets = hasVault ? await getWallets().catch(() => null) : null;
  return {
    signer,
    hasVault,
    unlocked: !!wallets,
    hasMnemonic: !!unlocked?.data.mnemonic,
    solana: wallets?.solana?.address,
    evm: wallets?.evm?.address,
    connected,
  };
}
