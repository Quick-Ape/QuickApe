import { ed25519 } from '@noble/curves/ed25519';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { base58 } from '@scure/base';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { bytesToHex, isHex, type Hex } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

/** Vault contents (plaintext, only lives in background memory while the wallet is unlocked). */
export interface VaultData {
  mnemonic?: string;
  accountIndex?: number;
  /** Override: Solana private key (base58, Phantom export format). */
  solanaSecret?: string;
  /** Override: EVM private key (hex, MetaMask export format). */
  evmPrivateKey?: string;
  createdAt: number;
}

export interface SolanaWallet {
  address: string;
  /** 32-byte ed25519 seed. */
  seed: Uint8Array;
}

export interface EvmWallet {
  address: Hex;
  privateKey: Hex;
}

export interface Wallets {
  solana?: SolanaWallet;
  evm?: EvmWallet;
}

export const newMnemonic = () => generateMnemonic(wordlist, 128);

export function normalizeMnemonic(m: string): string {
  const words = m.trim().toLowerCase().split(/\s+/).join(' ');
  if (!validateMnemonic(words, wordlist)) throw new Error('Invalid seed phrase');
  return words;
}

const HARDENED = 0x80000000;

/** SLIP-0010 ed25519 (all levels hardened) — same as Phantom/Solflare. */
export function slip10Ed25519(seed: Uint8Array, path: number[]): Uint8Array {
  let I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed);
  let key = I.slice(0, 32);
  let chain = I.slice(32);
  for (const index of path) {
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, (index | HARDENED) >>> 0);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key;
}

function solanaWalletFromSeed(seed32: Uint8Array): SolanaWallet {
  return { seed: seed32, address: base58.encode(ed25519.getPublicKey(seed32)) };
}

/** Path Phantom: m/44'/501'/{index}'/0' */
export function solanaFromMnemonic(mnemonic: string, index = 0): SolanaWallet {
  return solanaWalletFromSeed(slip10Ed25519(mnemonicToSeedSync(mnemonic), [44, 501, index, 0]));
}

/** Path MetaMask: m/44'/60'/0'/0/{index} */
export function evmFromMnemonic(mnemonic: string, index = 0): EvmWallet {
  const hd = mnemonicToAccount(mnemonic, { addressIndex: index }).getHdKey();
  if (!hd.privateKey) throw new Error("Couldn't derive the EVM key");
  return evmFromPrivateKey(bytesToHex(hd.privateKey));
}

/**
 * Accept a Solana private key in these formats:
 * - base58, 64 bytes (Phantom/Solflare export)
 * - JSON array of 64 numbers (solana-keygen id.json)
 * - base58, 32 bytes (seed only)
 */
export function parseSolanaSecret(input: string): SolanaWallet {
  const s = input.trim();
  let bytes: Uint8Array;
  try {
    bytes = s.startsWith('[') ? Uint8Array.from(JSON.parse(s) as number[]) : base58.decode(s);
  } catch {
    throw new Error('Invalid Solana private key');
  }
  if (bytes.length !== 64 && bytes.length !== 32) throw new Error('Solana private key must be 32 or 64 bytes');
  const wallet = solanaWalletFromSeed(bytes.slice(0, 32));
  if (bytes.length === 64 && base58.encode(bytes.slice(32)) !== wallet.address) {
    throw new Error('Corrupted Solana private key (public key mismatch)');
  }
  return wallet;
}

export function evmFromPrivateKey(input: string): EvmWallet {
  const pk = (input.trim().startsWith('0x') ? input.trim() : `0x${input.trim()}`) as Hex;
  if (!isHex(pk) || pk.length !== 66) throw new Error('Invalid EVM private key');
  return { privateKey: pk, address: privateKeyToAccount(pk).address };
}

export function deriveWallets(data: VaultData): Wallets {
  const index = data.accountIndex ?? 0;
  const w: Wallets = {};
  if (data.mnemonic) {
    w.solana = solanaFromMnemonic(data.mnemonic, index);
    w.evm = evmFromMnemonic(data.mnemonic, index);
  }
  if (data.solanaSecret) w.solana = parseSolanaSecret(data.solanaSecret);
  if (data.evmPrivateKey) w.evm = evmFromPrivateKey(data.evmPrivateKey);
  return w;
}

/** Solana private key in a format Phantom can import (base58, 64 bytes). */
export function exportSolanaSecret(w: SolanaWallet): string {
  const full = new Uint8Array(64);
  full.set(w.seed, 0);
  full.set(base58.decode(w.address), 32);
  return base58.encode(full);
}
