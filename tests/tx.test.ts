import { describe, expect, it } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { signSerializedTx } from '@/lib/solana/tx';
import { solanaFromMnemonic } from '@/lib/wallet/keys';

const me = solanaFromMnemonic('test test test test test test test test test test test junk', 0);
const other = solanaFromMnemonic('test test test test test test test test test test test junk', 1);

/** Fake but well-formed transaction: [n sig][sig slots][message]. */
function fakeTx(signers: string[], versioned: boolean): Uint8Array {
  const keys = signers.map((a) => base58.decode(a));
  const extra = new Uint8Array(32).fill(7); // non-signer account
  const header = [signers.length, 0, 1];
  const msg = [
    ...(versioned ? [0x80] : []),
    ...header,
    keys.length + 1,
    ...keys.flatMap((k) => [...k]),
    ...extra,
    ...new Uint8Array(32).fill(9), // blockhash
    0, // 0 instructions
    ...(versioned ? [0] : []), // 0 address lookup tables
  ];
  return Uint8Array.from([signers.length, ...new Uint8Array(64 * signers.length), ...msg]);
}

function messageOf(tx: Uint8Array) {
  return tx.subarray(1 + tx[0] * 64);
}

describe('signSerializedTx', () => {
  it.each([false, true])('versioned=%s: valid signature in slot 0', (versioned) => {
    const tx = fakeTx([me.address], versioned);
    const { signed, signature } = signSerializedTx(tx, me);
    const sig = signed.subarray(1, 65);
    expect(base58.encode(sig)).toBe(signature);
    expect(ed25519.verify(sig, messageOf(signed), base58.decode(me.address))).toBe(true);
    expect(tx.subarray(1, 65).every((b) => b === 0)).toBe(true); // input is not mutated
  });

  it('puts the signature in the right slot when we are the second signer', () => {
    const tx = fakeTx([other.address, me.address], true);
    const { signed } = signSerializedTx(tx, me);
    expect(signed.subarray(1, 65).every((b) => b === 0)).toBe(true);
    const sig = signed.subarray(65, 129);
    expect(ed25519.verify(sig, messageOf(signed), base58.decode(me.address))).toBe(true);
  });

  it('rejects a transaction that does not require our signature', () => {
    expect(() => signSerializedTx(fakeTx([other.address], true), me)).toThrow(/signer/);
  });
});
