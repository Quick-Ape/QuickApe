import { base58 } from '@scure/base';
import { describe, expect, it } from 'vitest';
import { compactU16, compileLegacyTx, SYSTEM_PROGRAM, transferIx } from '@/lib/solana/legacy';
import { appendSolTransfer, parseTransaction, TxTooLarge } from '@/lib/solana/patch';

const key = (n: number) => base58.encode(new Uint8Array(32).fill(n));
const PAYER = key(1);
const FEE = key(2);
const PROGRAM = key(3);
const LOOKED_UP = key(4);
const TABLE = key(9);
const noTables = async () => new Map<string, string[]>();
const transferData = (lamports: bigint) => Uint8Array.from(transferIx(PAYER, FEE, lamports).data);

/** Hand-built v0 transaction: one instruction using a looked-up writable account and the System Program via a lookup table. */
function v0Tx(): Uint8Array {
  const keys = [PAYER, PROGRAM].flatMap((k) => [...base58.decode(k)]);
  return Uint8Array.from([
    1, ...new Uint8Array(64), // one signature slot
    0x80, 1, 0, 1, // v0; header: 1 signer, 0 readonly signed, 1 readonly unsigned
    ...compactU16(2), ...keys,
    ...new Uint8Array(32), // blockhash
    1, 1, 3, 0, 2, 3, 1, 7, // ix: program #1, accounts [payer, looked-up writable, looked-up System Program], data [7]
    1, ...base58.decode(TABLE), 1, 0, 1, 1, // lookup: writable [0], readonly [1]
  ]);
}

describe('appendSolTransfer', () => {
  it('adds a fee transfer to a legacy transaction', async () => {
    const tx = compileLegacyTx(PAYER, [transferIx(PAYER, key(5), 1000n)], key(8));
    const m = parseTransaction(await appendSolTransfer(tx, PAYER, FEE, 5000n, noTables));
    expect(m.versioned).toBe(false);
    expect(m.header).toEqual([1, 0, 1]);
    expect(m.keys).toEqual([PAYER, key(5), FEE, SYSTEM_PROGRAM]);
    const last = m.ixs[m.ixs.length - 1];
    expect(m.keys[last.program]).toBe(SYSTEM_PROGRAM);
    expect(last.accounts.map((i) => m.keys[i])).toEqual([PAYER, FEE]);
    expect([...last.data]).toEqual([...transferData(5000n)]);
    // The original transfer still points at the same accounts.
    expect(m.ixs[0].accounts.map((i) => m.keys[i])).toEqual([PAYER, key(5)]);
  });

  it('moves a looked-up System Program to the static keys and remaps every index (v0)', async () => {
    const tables = async () => new Map([[TABLE, [LOOKED_UP, SYSTEM_PROGRAM]]]);
    const m = parseTransaction(await appendSolTransfer(v0Tx(), PAYER, FEE, 42n, tables));
    expect(m.versioned).toBe(true);
    expect(m.header).toEqual([1, 0, 2]);
    expect(m.keys).toEqual([PAYER, FEE, PROGRAM, SYSTEM_PROGRAM]);
    expect(m.lookups).toEqual([{ table: TABLE, writable: [0], readonly: [] }]);
    const all = [...m.keys, LOOKED_UP];
    expect(all[m.ixs[0].program]).toBe(PROGRAM);
    expect(m.ixs[0].accounts.map((i) => all[i])).toEqual([PAYER, LOOKED_UP, SYSTEM_PROGRAM]);
    expect([...m.ixs[0].data]).toEqual([7]);
    expect(m.ixs[1].accounts.map((i) => all[i])).toEqual([PAYER, FEE]);
    expect(all[m.ixs[1].program]).toBe(SYSTEM_PROGRAM);
  });

  it('refuses a payer that is not a signer and a recipient that is read-only', async () => {
    const tx = compileLegacyTx(PAYER, [transferIx(PAYER, key(5), 1n)], key(8));
    await expect(appendSolTransfer(tx, key(5), FEE, 1n, noTables)).rejects.toThrow(/writable signer/);
    await expect(appendSolTransfer(tx, PAYER, SYSTEM_PROGRAM, 1n, noTables)).rejects.toThrow(/read-only/);
  });

  it('reports a transaction that no longer fits', async () => {
    const big = compileLegacyTx(PAYER, [{ programId: PROGRAM, keys: [], data: Array(1100).fill(1) }], key(8));
    await expect(appendSolTransfer(big, PAYER, FEE, 1n, noTables)).rejects.toBeInstanceOf(TxTooLarge);
  });
});
