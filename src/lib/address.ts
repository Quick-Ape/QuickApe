import { base58 } from '@scure/base';
import type { Family } from './types';

const B58 = '1-9A-HJ-NP-Za-km-z';
const SOL_ADDR = new RegExp(`^[${B58}]{32,44}$`);
const EVM_ADDR = /^0x[a-fA-F0-9]{40}$/;

// Find candidate CAs in free text. Lookarounds make sure we don't cut into the
// middle of a longer string (e.g. an 88-char transaction signature).
const SCAN_RE = new RegExp(`(?<![${B58}])(0x[a-fA-F0-9]{40}|[${B58}]{32,44})(?![${B58}])`, 'g');

/** Addresses that are never trade targets (system programs, SOL/stablecoins, etc). */
const IGNORE = new Set([
  '11111111111111111111111111111111',
  'So11111111111111111111111111111111111111112',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  '0x0000000000000000000000000000000000000000',
]);

export function isSolanaAddress(s: string): boolean {
  if (!SOL_ADDR.test(s)) return false;
  try {
    return base58.decode(s).length === 32;
  } catch {
    return false;
  }
}

export function isEvmAddress(s: string): boolean {
  return EVM_ADDR.test(s);
}

export function familyOf(address: string): Family | undefined {
  if (isEvmAddress(address)) return 'evm';
  if (isSolanaAddress(address)) return 'solana';
  return undefined;
}

/** All unique valid CAs in the text, in order of appearance. */
export function extractAddresses(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(SCAN_RE)) {
    const addr = m[1];
    if (IGNORE.has(addr) || out.includes(addr)) continue;
    // Base58 must decode to exactly 32 bytes, so random 32-44 char words get filtered out here.
    if (familyOf(addr)) out.push(addr);
  }
  return out;
}

export function shortAddr(addr: string, n = 4): string {
  return addr.length <= n * 2 + 1 ? addr : `${addr.slice(0, n)}…${addr.slice(-n)}`;
}
