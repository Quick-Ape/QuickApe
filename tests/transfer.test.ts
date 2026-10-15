import { describe, expect, it } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { buildSolTransfer, signSolTransfer } from '@/lib/solana/transfer';
import { solanaFromMnemonic } from '@/lib/wallet/keys';

const MNEMONIC = 'test test test test test test test test test test test junk';
const from = solanaFromMnemonic(MNEMONIC, 0);
const to = solanaFromMnemonic(MNEMONIC, 1).address;
const blockhash = base58.encode(new Uint8Array(32).fill(3));

describe('SOL transfer transaction', () => {
  it('serializes a legacy SystemProgram.transfer message', () => {
    const tx = buildSolTransfer(from.address, to, 1_234_567_890n, blockhash);
    expect(tx[0]).toBe(1); // one signature slot
    const msg = tx.subarray(1 + 64);
    expect([...msg.subarray(0, 3)]).toEqual([1, 0, 1]); // header
    expect(msg[3]).toBe(3); // 3 account keys
    expect(base58.encode(msg.subarray(4, 36))).toBe(from.address);
    expect(base58.encode(msg.subarray(36, 68))).toBe(to);
    expect(base58.encode(msg.subarray(68, 100))).toBe('11111111111111111111111111111111');
    expect(base58.encode(msg.subarray(100, 132))).toBe(blockhash);
    // 1 instruction: program 2, accounts [0, 1], 12 bytes of data
    expect([...msg.subarray(132, 137)]).toEqual([1, 2, 2, 0, 1]);
    expect(msg[137]).toBe(12);
    const data = msg.subarray(138);
    expect([...data.subarray(0, 4)]).toEqual([2, 0, 0, 0]);
    expect(new DataView(data.buffer, data.byteOffset + 4, 8).getBigUint64(0, true)).toBe(1_234_567_890n);
    expect(data.length).toBe(12);
  });

  it('signs with the trading wallet key', () => {
    const { signed, signature } = signSolTransfer(from, to, 5_000_000n, blockhash);
    const sig = signed.subarray(1, 65);
    expect(base58.encode(sig)).toBe(signature);
    expect(ed25519.verify(sig, signed.subarray(65), base58.decode(from.address))).toBe(true);
  });

  it('refuses to send to itself', () => {
    expect(() => buildSolTransfer(from.address, from.address, 1n, blockhash)).toThrow(/same/);
  });
});
