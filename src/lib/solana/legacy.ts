import { base58 } from '@scure/base';
import { ATA_PROGRAM } from './pda';

/** Minimal legacy-transaction compiler for the few instructions we build ourselves (no web3.js). */

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';

export interface AccountMeta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface Instruction {
  programId: string;
  keys: AccountMeta[];
  data: number[];
}

export function compactU16(n: number): number[] {
  const out: number[] = [];
  let v = n;
  for (;;) {
    const b = v & 0x7f;
    v >>= 7;
    if (v === 0) {
      out.push(b);
      return out;
    }
    out.push(b | 0x80);
  }
}

export function u64le(n: bigint): number[] {
  const out: number[] = [];
  let v = n;
  for (let i = 0; i < 8; i++) {
    out.push(Number(v & 0xffn));
    v >>= 8n;
  }
  return out;
}

/**
 * Serialize a legacy transaction with empty signature slots, ready for `signSerializedTx`.
 * Account order follows the runtime rules: writable signers, readonly signers,
 * writable non-signers, readonly non-signers. The fee payer is always first.
 */
export function compileLegacyTx(feePayer: string, instructions: Instruction[], recentBlockhash: string): Uint8Array {
  const metas = new Map<string, { signer: boolean; writable: boolean }>();
  const touch = (k: string, signer: boolean, writable: boolean) => {
    const m = metas.get(k) ?? { signer: false, writable: false };
    metas.set(k, { signer: m.signer || signer, writable: m.writable || writable });
  };
  touch(feePayer, true, true);
  for (const ix of instructions) {
    for (const k of ix.keys) touch(k.pubkey, k.isSigner, k.isWritable);
    touch(ix.programId, false, false);
  }

  const rank = (k: string) => {
    if (k === feePayer) return -1;
    const m = metas.get(k)!;
    return m.signer ? (m.writable ? 0 : 1) : m.writable ? 2 : 3;
  };
  const keys = [...metas.keys()].sort((a, b) => rank(a) - rank(b));
  const index = new Map(keys.map((k, i) => [k, i]));
  const signers = keys.filter((k) => metas.get(k)!.signer);
  const readonlySigned = signers.filter((k) => !metas.get(k)!.writable).length;
  const readonlyUnsigned = keys.filter((k) => !metas.get(k)!.signer && !metas.get(k)!.writable).length;

  const message = [
    signers.length,
    readonlySigned,
    readonlyUnsigned,
    ...compactU16(keys.length),
    ...keys.flatMap((k) => [...base58.decode(k)]),
    ...base58.decode(recentBlockhash),
    ...compactU16(instructions.length),
    ...instructions.flatMap((ix) => [
      index.get(ix.programId)!,
      ...compactU16(ix.keys.length),
      ...ix.keys.map((k) => index.get(k.pubkey)!),
      ...compactU16(ix.data.length),
      ...ix.data,
    ]),
  ];
  return Uint8Array.from([...compactU16(signers.length), ...new Uint8Array(64 * signers.length), ...message]);
}

export function transferIx(from: string, to: string, lamports: bigint): Instruction {
  return {
    programId: SYSTEM_PROGRAM,
    keys: [
      { pubkey: from, isSigner: true, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
    ],
    // SystemInstruction::Transfer = 2 (u32 LE), then lamports (u64 LE).
    data: [2, 0, 0, 0, ...u64le(lamports)],
  };
}

/** Associated Token Program `CreateIdempotent`: creates `ata` for `owner`/`mint` unless it already exists. */
export function createAtaIdempotentIx(payer: string, ata: string, owner: string, mint: string, tokenProgram: string): Instruction {
  return {
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: [1],
  };
}

/** Token / Token-2022 `CloseAccount` (index 9): closes an empty token account and returns its rent to `destination`. */
export function closeTokenAccountIx(account: string, destination: string, owner: string, tokenProgram: string): Instruction {
  return {
    programId: tokenProgram,
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: [9],
  };
}
