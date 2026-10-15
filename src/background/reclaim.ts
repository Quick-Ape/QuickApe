import { base64 } from '@scure/base';
import type { Settings } from '@/lib/settings';
import { closeTokenAccountIx, compileLegacyTx } from '@/lib/solana/legacy';
import { associatedTokenAddress } from '@/lib/solana/pda';
import { getLatestBlockhash, rpc, sendRawTransaction, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from '@/lib/solana/rpc';
import { signSerializedTx } from '@/lib/solana/tx';
import { confirmSignature } from '@/lib/trade/solana';
import type { SolanaWallet } from '@/lib/wallet/keys';
import { getWallets } from './session';
import { tradeHistory } from './trades';

/**
 * Every token you hold on Solana sits in a token account that locks ~0.002 SOL of rent.
 * Selling to zero leaves the account behind; closing it returns that SOL to the wallet.
 */

interface EmptyAccount {
  pubkey: string;
  program: string;
  lamports: number;
}

type ParsedAccount = {
  owner: string;
  lamports: number;
  data: { parsed?: { info?: { tokenAmount?: { amount: string }; state?: string } } } | unknown[];
};

const isEmptyToken = (a: ParsedAccount | null): a is ParsedAccount => {
  if (!a || Array.isArray(a.data)) return false;
  const info = a.data.parsed?.info;
  return info?.tokenAmount?.amount === '0' && info.state !== 'frozen';
};

/** Empty token accounts via the indexed RPC call (Helius, public mainnet), or undefined if the RPC refuses it. */
async function emptyAccountsIndexed(rpcUrl: string, owner: string): Promise<EmptyAccount[] | undefined> {
  try {
    const out: EmptyAccount[] = [];
    for (const program of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
      const r = await rpc<{ value: { pubkey: string; account: ParsedAccount }[] }>(rpcUrl, 'getTokenAccountsByOwner', [
        owner,
        { programId: program },
        { encoding: 'jsonParsed', commitment: 'confirmed' },
      ]);
      for (const { pubkey, account } of r.value)
        if (isEmptyToken(account)) out.push({ pubkey, program, lamports: account.lamports });
    }
    return out;
  } catch {
    return undefined;
  }
}

/** Fallback for RPCs without indexed calls: check the associated accounts of tokens you traded. */
async function emptyAccountsFromHistory(rpcUrl: string, owner: string, mints: string[]): Promise<EmptyAccount[]> {
  const candidates = mints.flatMap((mint) =>
    [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((program) => ({ pubkey: associatedTokenAddress(owner, mint, program), program })),
  );
  const out: EmptyAccount[] = [];
  for (let i = 0; i < candidates.length; i += 100) {
    const chunk = candidates.slice(i, i + 100);
    const r = await rpc<{ value: (ParsedAccount | null)[] }>(rpcUrl, 'getMultipleAccounts', [
      chunk.map((c) => c.pubkey),
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]);
    r.value.forEach((acc, j) => {
      if (isEmptyToken(acc) && acc.owner === chunk[j].program) out.push({ ...chunk[j], lamports: acc.lamports });
    });
  }
  return out;
}

/** Close accounts in small batches; a batch that fails (e.g. Token-2022 withheld fees) is skipped. */
async function closeAccounts(rpcUrl: string, wallet: SolanaWallet, accounts: EmptyAccount[]) {
  let closed = 0;
  let lamports = 0;
  for (let i = 0; i < accounts.length; i += 8) {
    const batch = accounts.slice(i, i + 8);
    try {
      const { blockhash, lastValidBlockHeight } = await getLatestBlockhash(rpcUrl);
      const ixs = batch.map((a) => closeTokenAccountIx(a.pubkey, wallet.address, wallet.address, a.program));
      const { signed, signature } = signSerializedTx(compileLegacyTx(wallet.address, ixs, blockhash), wallet);
      const b64 = base64.encode(signed);
      const send = () => sendRawTransaction(rpcUrl, b64).then(() => {});
      await send();
      await confirmSignature(rpcUrl, signature, lastValidBlockHeight, send);
      closed += batch.length;
      lamports += batch.reduce((n, a) => n + a.lamports, 0);
    } catch {
      // keep going with the next batch
    }
  }
  return { closed, sol: lamports / 1e9 };
}

/** Popup "Reclaim SOL": close every empty token account of the trading wallet. */
export async function reclaimRent(settings: Settings): Promise<{ closed: number; sol: number; found: number }> {
  if (settings.signer !== 'local') throw new Error('Reclaim works on the trading wallet');
  const wallets = await getWallets();
  if (!wallets?.solana) throw new Error('Unlock your trading wallet first');
  const rpcUrl = settings.chains.solana.rpc;
  const owner = wallets.solana.address;
  let empty = await emptyAccountsIndexed(rpcUrl, owner);
  if (!empty) {
    const mints = [...new Set((await tradeHistory()).filter((t) => t.chain === 'solana' && t.side !== 'withdraw').map((t) => t.token))];
    empty = await emptyAccountsFromHistory(rpcUrl, owner, mints);
  }
  if (!empty.length) return { closed: 0, sol: 0, found: 0 };
  return { ...(await closeAccounts(rpcUrl, wallets.solana, empty)), found: empty.length };
}

/** After a 100% sell confirms, close the now-empty token account so its rent comes back. */
export function closeAfterFullSell(settings: Settings, wallet: SolanaWallet, mint: string, confirmation: Promise<void>) {
  confirmation
    .then(async () => {
      const rpcUrl = settings.chains.solana.rpc;
      const empty = await emptyAccountsFromHistory(rpcUrl, wallet.address, [mint]);
      if (empty.length) await closeAccounts(rpcUrl, wallet, empty);
    })
    .catch(() => {});
}
