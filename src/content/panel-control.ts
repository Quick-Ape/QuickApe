import { familyOf } from '@/lib/address';
import { CHAINS } from '@/lib/chains';
import type { Settings } from '@/lib/settings';
import type { ChainId, TokenRequest } from '@/lib/types';
import { setState } from '@/ui/store';

const COLLAPSED_KEY = 'qa.collapsed';

function guessChain(req: TokenRequest): ChainId | undefined {
  if (req.chain) return req.chain;
  return req.address && familyOf(req.address) === 'solana' ? 'solana' : undefined;
}

/** Quick-buy button label, e.g. "0.1 SOL". If the EVM chain isn't known yet, just "Buy". */
export function quickLabel(req: TokenRequest, settings: Settings | null): string {
  const chain = guessChain(req);
  if (!chain || !settings) return 'Buy';
  return `${settings.chains[chain].quickBuy} ${CHAINS[chain].symbol}`;
}

export function openPanel(req: TokenRequest) {
  setState({ panel: req, collapsed: false, chip: null });
}

export function setCollapsed(collapsed: boolean) {
  setState({ collapsed });
  browser.storage.local.set({ [COLLAPSED_KEY]: collapsed }).catch(() => {});
}

export async function restoreCollapsed() {
  const r = await browser.storage.local.get(COLLAPSED_KEY);
  if (r[COLLAPSED_KEY]) setState({ collapsed: true });
}
