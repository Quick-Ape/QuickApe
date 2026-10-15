import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';

export function readCompactU16(bytes: Uint8Array, offset: number): [value: number, size: number] {
  let value = 0;
  let size = 0;
  for (;;) {
    const b = bytes[offset + size];
    value |= (b & 0x7f) << (7 * size);
    size++;
    if ((b & 0x80) === 0) break;
    if (size > 3) throw new Error('Invalid compact-u16');
  }
  return [value, size];
}

/**
 * Sign an already-serialized Solana transaction (legacy or v0), e.g.
 * Jupiter's `swapTransaction`. The signature goes into `signer`'s slot.
 * Returns the signed transaction + signature (= txid) in base58.
 */
export function signSerializedTx(
  tx: Uint8Array,
  signer: { address: string; seed: Uint8Array },
): { signed: Uint8Array; signature: string } {
  const out = tx.slice();
  const [numSigs, sigLenSize] = readCompactU16(out, 0);
  const msgStart = sigLenSize + numSigs * 64;
  const message = out.subarray(msgStart);

  let p = message[0] & 0x80 ? 1 : 0; // version prefix for v0
  const numRequired = message[p];
  p += 3; // header: numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned
  const [, keysLenSize] = readCompactU16(message, p);
  p += keysLenSize;

  const me = base58.decode(signer.address);
  let slot = -1;
  for (let i = 0; i < numRequired; i++) {
    const key = message.subarray(p + i * 32, p + i * 32 + 32);
    if (key.every((b, j) => b === me[j])) {
      slot = i;
      break;
    }
  }
  if (slot < 0) throw new Error('Wallet is not a required signer of this transaction');
  if (slot >= numSigs) throw new Error('Signature slot not available');

  const sig = ed25519.sign(message, signer.seed);
  out.set(sig, sigLenSize + slot * 64);
  return { signed: out, signature: base58.encode(sig) };
}
