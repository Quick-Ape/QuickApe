import { familyOf } from './address';
import { chainFromSlug } from './chains';
import type { SiteId } from './settings';
import type { TokenRequest } from './types';

/** Supported site based on the page hostname. */
export function siteOf(hostname: string): SiteId | undefined {
  const h = hostname.replace(/^www\./, '');
  if (h === 'x.com' || h === 'twitter.com' || h === 'mobile.x.com') return 'x';
  if (h === 'dexscreener.com') return 'dexscreener';
  if (h === 'gmgn.ai') return 'gmgn';
  if (h === 'fomo.family' || h.endsWith('.fomo.family')) return 'fomo';
  if (h === 'pump.fun') return 'pumpfun';
  if (h === 'birdeye.so') return 'birdeye';
  if (h === 'axiom.trade') return 'axiom';
  if (h === 'web.telegram.org') return 'telegram';
  return undefined;
}

/** Grab the address at the end of a segment, including gmgn's `ref_<CA>` referral format. */
function addrIn(segment: string | undefined): string | undefined {
  if (!segment) return undefined;
  const m = decodeURIComponent(segment).match(/(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/);
  return m && familyOf(m[1]) ? m[1] : undefined;
}

/**
 * Detect a token from a URL (a token page or a link to one).
 * Returns null if the URL isn't a known token page.
 */
export function detectFromUrl(href: string, base?: string): TokenRequest | null {
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  const p = u.pathname.split('/').filter(Boolean);

  switch (host) {
    case 'gmgn.ai': {
      // /sol/token/<CA>, /base/token/<ref>_<CA>
      const i = p.indexOf('token');
      const chain = chainFromSlug(p[i - 1]);
      const address = i >= 0 ? addrIn(p[i + 1]) : undefined;
      return address && chain ? { address, chain, source: 'gmgn' } : null;
    }
    case 'dexscreener.com': {
      // /solana/<pair or token>. Dexscreener writes addresses in lowercase, so
      // validation is loose; the Dexscreener API returns the real address later.
      const chain = chainFromSlug(p[0]);
      const address = p[1] && /^(0x[a-fA-F0-9]{40}|[0-9a-zA-Z]{32,44})$/.test(p[1]) ? p[1] : undefined;
      return address && chain ? { address, chain, isPair: true, source: 'dexscreener' } : null;
    }
    case 'pump.fun': {
      // /coin/<mint> or /<mint>
      const address = addrIn(p[0] === 'coin' ? p[1] : p[0]);
      return address && familyOf(address) === 'solana' ? { address, chain: 'solana', source: 'pumpfun' } : null;
    }
    case 'birdeye.so': {
      // /solana/token/<CA> (old format: /token/<CA>?chain=solana)
      const i = p.indexOf('token');
      const address = i >= 0 ? addrIn(p[i + 1]) : undefined;
      const chain = chainFromSlug(u.searchParams.get('chain') ?? p[i - 1]) ?? (address && familyOf(address) === 'solana' ? 'solana' : undefined);
      return address ? { address, chain, source: 'birdeye' } : null;
    }
    case 'axiom.trade': {
      // Solana: /meme/<pair>?chain=sol   EVM: /token/<CA>?chain=bnb|base|eth (default bnb)
      const address = p[0] === 'meme' || p[0] === 'token' ? addrIn(p[1]) : undefined;
      if (!address) return null;
      const chain =
        familyOf(address) === 'solana' ? 'solana' : chainFromSlug(u.searchParams.get('chain') ?? 'bnb');
      return { address, chain, isPair: p[0] === 'meme', source: 'axiom' };
    }
    case 'fomo.family': {
      // /tokens/<chain>/<CA>, chain: solana | base | bnb | ethereum
      if (p[0] !== 'tokens') return null;
      const address = addrIn(p[2]);
      return address ? { address, chain: chainFromSlug(p[1]), source: 'fomo' } : null;
    }
    case 'photon-sol.tinyastro.io': {
      const i = p.indexOf('lp');
      const address = i >= 0 ? addrIn(p[i + 1]) : undefined;
      return address ? { address, chain: 'solana', isPair: true, source: 'photon' } : null;
    }
    case 'dextools.io': {
      // /app/en/<chain>/pair-explorer/<pair>
      const i = p.indexOf('pair-explorer');
      const chain = chainFromSlug(p[i - 1]);
      const address = i >= 0 ? addrIn(p[i + 1]) : undefined;
      return address && chain ? { address, chain, isPair: true, source: 'dextools' } : null;
    }
    case 'solscan.io':
    case 'etherscan.io':
    case 'basescan.org':
    case 'bscscan.com': {
      const chain = ({ 'solscan.io': 'solana', 'etherscan.io': 'ethereum', 'basescan.org': 'base', 'bscscan.com': 'bsc' } as const)[host];
      const address = p[0] === 'token' ? addrIn(p[1]) : undefined;
      return address ? { address, chain, source: host } : null;
    }
    default:
      return null;
  }
}
