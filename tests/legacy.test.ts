import { describe, expect, it } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { closeTokenAccountIx, compileLegacyTx, createAtaIdempotentIx, SYSTEM_PROGRAM } from '@/lib/solana/legacy';
import { ATA_PROGRAM, associatedTokenAddress } from '@/lib/solana/pda';
import { TOKEN_PROGRAM } from '@/lib/solana/rpc';
import { signSerializedTx } from '@/lib/solana/tx';
import { solanaFromMnemonic } from '@/lib/wallet/keys';

const payer = solanaFromMnemonic('test test test test test test test test test test test junk', 0);
const owner = solanaFromMnemonic('test test test test test test test test test test test junk', 1).address;
const WSOL = 'So11111111111111111111111111111111111111112';
const blockhash = base58.encode(new Uint8Array(32).fill(5));

function keysOf(tx: Uint8Array) {
  const msg = tx.subarray(1 + tx[0] * 64);
  const n = msg[3];
  return { header: [...msg.subarray(0, 3)], keys: Array.from({ length: n }, (_, i) => base58.encode(msg.subarray(4 + i * 32, 36 + i * 32))) };
}

describe('legacy transaction compiler', () => {
  it('orders accounts: payer, writable non-signers, readonly non-signers', () => {
    const ata = associatedTokenAddress(owner, WSOL, TOKEN_PROGRAM);
    const tx = compileLegacyTx(payer.address, [createAtaIdempotentIx(payer.address, ata, owner, WSOL, TOKEN_PROGRAM)], blockhash);
    const { header, keys } = keysOf(tx);
    expect(header).toEqual([1, 0, 5]); // 1 signer, 0 readonly signers, 5 readonly non-signers
    expect(keys[0]).toBe(payer.address);
    expect(keys[1]).toBe(ata);
    expect(new Set(keys.slice(2))).toEqual(new Set([owner, WSOL, SYSTEM_PROGRAM, TOKEN_PROGRAM, ATA_PROGRAM]));
  });

  it('dedupes accounts across several close instructions and signs once', () => {
    const a = associatedTokenAddress(payer.address, WSOL, TOKEN_PROGRAM);
    const b = associatedTokenAddress(payer.address, owner, TOKEN_PROGRAM);
    const tx = compileLegacyTx(
      payer.address,
      [closeTokenAccountIx(a, payer.address, payer.address, TOKEN_PROGRAM), closeTokenAccountIx(b, payer.address, payer.address, TOKEN_PROGRAM)],
      blockhash,
    );
    const { header, keys } = keysOf(tx);
    expect(header).toEqual([1, 0, 1]);
    expect(keys).toEqual([payer.address, a, b, TOKEN_PROGRAM]);
    const { signed, signature } = signSerializedTx(tx, payer);
    expect(ed25519.verify(base58.decode(signature), signed.subarray(65), base58.decode(payer.address))).toBe(true);
  });
});
