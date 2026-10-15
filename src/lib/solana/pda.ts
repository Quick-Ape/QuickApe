import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { base58 } from '@scure/base';

export const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Same as web3.js `PublicKey.findProgramAddressSync`: highest bump whose hash is off the ed25519 curve. */
export function findProgramAddress(seeds: Uint8Array[], programId: string): [address: string, bump: number] {
  const program = base58.decode(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), program, PDA_MARKER];
    const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      buf.set(p, o);
      o += p.length;
    }
    const hash = sha256(buf);
    if (!isOnCurve(hash)) return [base58.encode(hash), bump];
  }
  throw new Error('Could not find a program address');
}

/** Associated token account of `owner` for `mint` under the given token program. */
export function associatedTokenAddress(owner: string, mint: string, tokenProgram: string): string {
  return findProgramAddress([base58.decode(owner), base58.decode(tokenProgram), base58.decode(mint)], ATA_PROGRAM)[0];
}
