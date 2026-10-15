import { base58 } from '@scure/base';
import { compactU16, SYSTEM_PROGRAM, transferIx } from './legacy';
import { readCompactU16 } from './tx';

/** Largest serialized transaction the network accepts. */
export const MAX_TX_BYTES = 1232;

export class TxTooLarge extends Error {
  constructor(readonly size: number) {
    super(`Transaction too large (${size} > ${MAX_TX_BYTES} bytes)`);
  }
}

/** Address lists of lookup tables; `need` maps each table to the length its indices require. */
export type LookupLoader = (need: Map<string, number>) => Promise<Map<string, string[]>>;

interface CompiledIx {
  program: number;
  accounts: number[];
  data: Uint8Array;
}

interface Lookup {
  table: string;
  writable: number[];
  readonly: number[];
}

interface Message {
  versioned: boolean;
  sigSlots: number;
  /** numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned */
  header: [number, number, number];
  keys: string[];
  blockhash: Uint8Array;
  ixs: CompiledIx[];
  lookups: Lookup[];
}

/** Decode a serialized transaction's message (exported for tests). */
export function parseTransaction(tx: Uint8Array): Message {
  let p = 0;
  const take = () => {
    const [v, n] = readCompactU16(tx, p);
    p += n;
    return v;
  };
  const bytes = (n: number) => {
    const out = tx.slice(p, p + n);
    p += n;
    return out;
  };
  const sigSlots = take();
  p += sigSlots * 64;
  const versioned = (tx[p] & 0x80) !== 0;
  if (versioned) {
    if ((tx[p] & 0x7f) !== 0) throw new Error(`Unsupported transaction version ${tx[p] & 0x7f}`);
    p++;
  }
  const header: [number, number, number] = [tx[p], tx[p + 1], tx[p + 2]];
  p += 3;
  const keys = Array.from({ length: take() }, () => base58.encode(bytes(32)));
  const blockhash = bytes(32);
  const ixs = Array.from({ length: take() }, () => {
    const program = tx[p++];
    const accounts = [...bytes(take())];
    return { program, accounts, data: bytes(take()) };
  });
  const lookups = versioned
    ? Array.from({ length: take() }, () => ({
        table: base58.encode(bytes(32)),
        writable: [...bytes(take())],
        readonly: [...bytes(take())],
      }))
    : [];
  if (p !== tx.length) throw new Error('Unexpected bytes after the transaction message');
  return { versioned, sigSlots, header, keys, blockhash, ixs, lookups };
}

/** Serialize with empty signature slots: changing the message invalidates any old signature. */
function serialize(m: Message): Uint8Array {
  const out: number[] = [...compactU16(m.sigSlots), ...new Uint8Array(64 * m.sigSlots)];
  if (m.versioned) out.push(0x80);
  out.push(...m.header, ...compactU16(m.keys.length));
  for (const k of m.keys) out.push(...base58.decode(k));
  out.push(...m.blockhash, ...compactU16(m.ixs.length));
  for (const ix of m.ixs) out.push(ix.program, ...compactU16(ix.accounts.length), ...ix.accounts, ...compactU16(ix.data.length), ...ix.data);
  if (m.versioned) {
    out.push(...compactU16(m.lookups.length));
    for (const l of m.lookups) out.push(...base58.decode(l.table), ...compactU16(l.writable.length), ...l.writable, ...compactU16(l.readonly.length), ...l.readonly);
  }
  return Uint8Array.from(out);
}

/** Every account in index order: static keys, then looked-up writable, then looked-up read-only. */
function accountList(m: Message, tables: Map<string, string[]>): string[] {
  const loaded = (pick: 'writable' | 'readonly') =>
    m.lookups.flatMap((l) =>
      l[pick].map((i) => {
        const a = tables.get(l.table)?.[i];
        if (!a) throw new Error(`Lookup table ${l.table} has no index ${i}`);
        return a;
      }),
    );
  return [...m.keys, ...loaded('writable'), ...loaded('readonly')];
}

/**
 * Append a SOL transfer `from` -> `to` as the last instruction of a serialized legacy or v0
 * transaction (e.g. Jupiter's swap), rebuilding account indices. `from` must be a writable
 * signer. The result is unsigned. Throws TxTooLarge if it no longer fits in a packet.
 */
export async function appendSolTransfer(
  tx: Uint8Array,
  from: string,
  to: string,
  lamports: bigint,
  loadTables: LookupLoader,
): Promise<Uint8Array> {
  const m = parseTransaction(tx);
  const need = new Map<string, number>();
  for (const l of m.lookups) need.set(l.table, Math.max(need.get(l.table) ?? 0, ...l.writable.map((i) => i + 1), ...l.readonly.map((i) => i + 1)));
  const tables = need.size ? await loadTables(need) : new Map<string, string[]>();

  // Instructions by address, so indices can be recomputed once the account list changes.
  const before = accountList(m, tables);
  const ixs = m.ixs.map((ix) => ({ program: before[ix.program], accounts: ix.accounts.map((a) => before[a]), data: ix.data }));

  const [signers, readonlySigners, readonlyUnsigned] = m.header;
  const fromIdx = m.keys.indexOf(from);
  if (fromIdx < 0 || fromIdx >= signers - readonlySigners) throw new Error('Fee payer must be a writable signer of the transaction');

  // An address can't be both a static key and looked up, and program ids must be static.
  const dropFromLookups = (address: string) => {
    for (const l of m.lookups) {
      const t = tables.get(l.table)!;
      l.writable = l.writable.filter((i) => t[i] !== address);
      l.readonly = l.readonly.filter((i) => t[i] !== address);
    }
  };
  const toIdx = m.keys.indexOf(to);
  if (toIdx >= 0) {
    if (toIdx < signers || toIdx >= m.keys.length - readonlyUnsigned) throw new Error('Fee recipient is already in the transaction as read-only');
  } else {
    dropFromLookups(to);
    m.keys.splice(m.keys.length - readonlyUnsigned, 0, to); // end of the writable non-signers
  }
  if (!m.keys.includes(SYSTEM_PROGRAM)) {
    dropFromLookups(SYSTEM_PROGRAM);
    m.keys.push(SYSTEM_PROGRAM); // read-only non-signers come last
    m.header[2]++;
  }
  m.lookups = m.lookups.filter((l) => l.writable.length || l.readonly.length);

  const after = accountList(m, tables);
  if (after.length > 256) throw new Error('Too many accounts in the transaction');
  const index = new Map(after.map((a, i) => [a, i]));
  const at = (a: string) => index.get(a)!;
  ixs.push({ program: SYSTEM_PROGRAM, accounts: [from, to], data: Uint8Array.from(transferIx(from, to, lamports).data) });
  m.ixs = ixs.map((ix) => ({ program: at(ix.program), accounts: ix.accounts.map(at), data: ix.data }));

  const out = serialize(m);
  if (out.length > MAX_TX_BYTES) throw new TxTooLarge(out.length);
  return out;
}
