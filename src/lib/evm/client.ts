import { createPublicClient, createWalletClient, erc20Abi, http, type Chain, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, bsc, mainnet } from 'viem/chains';
import type { EvmChainId } from '../types';

export const VIEM_CHAINS: Record<EvmChainId, Chain> = { ethereum: mainnet, base, bsc };

const publicClients = new Map<string, ReturnType<typeof makePublic>>();

function makePublic(chain: EvmChainId, rpc: string) {
  return createPublicClient({ chain: VIEM_CHAINS[chain], transport: http(rpc, { retryCount: 1 }) });
}

export function publicClient(chain: EvmChainId, rpc: string) {
  const key = `${chain}|${rpc}`;
  let c = publicClients.get(key);
  if (!c) {
    c = makePublic(chain, rpc);
    publicClients.set(key, c);
  }
  return c;
}

export function walletClient(chain: EvmChainId, rpc: string, privateKey: Hex) {
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: VIEM_CHAINS[chain],
    transport: http(rpc, { retryCount: 1 }),
  });
}

export async function erc20Meta(chain: EvmChainId, rpc: string, token: Hex) {
  const c = publicClient(chain, rpc);
  const [symbol, name, decimals] = await Promise.all([
    c.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
    c.readContract({ address: token, abi: erc20Abi, functionName: 'name' }),
    c.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  return { symbol, name, decimals };
}

export async function erc20Balance(chain: EvmChainId, rpc: string, token: Hex, owner: Hex) {
  const c = publicClient(chain, rpc);
  const [raw, decimals] = await Promise.all([
    c.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
    c.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  return { raw, decimals };
}
