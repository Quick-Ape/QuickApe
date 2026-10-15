import { describe, expect, it } from 'vitest';
import { extractAddresses, familyOf } from '@/lib/address';
import { detectFromUrl, siteOf } from '@/lib/urls';

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const PUMP = '6HFhHd7za8zenhFEtZVbYdKDkhnY8SJrfEFNgCvBpump';
const EVM = '0x4200000000000000000000000000000000000006';

describe('extractAddresses', () => {
  it('finds Solana & EVM CAs in tweet text', () => {
    const text = `gm ape this 👉 ${PUMP} \nalso on base: ${EVM}, LFG`;
    expect(extractAddresses(text)).toEqual([PUMP, EVM]);
  });

  it('ignores tx signatures (88 chars), SOL/USDC mints and plain words', () => {
    const sig = '5'.repeat(88);
    const text = `${sig} So11111111111111111111111111111111111111112 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v supercalifragilisticexpialidociouss`;
    expect(extractAddresses(text)).toEqual([]);
  });

  it('deduplicates', () => {
    expect(extractAddresses(`${BONK} ${BONK}`)).toEqual([BONK]);
  });

  it('familyOf', () => {
    expect(familyOf(BONK)).toBe('solana');
    expect(familyOf(EVM)).toBe('evm');
    expect(familyOf('hello')).toBeUndefined();
  });
});

describe('detectFromUrl', () => {
  it.each([
    [`https://gmgn.ai/sol/token/${PUMP}`, { address: PUMP, chain: 'solana' }],
    [`https://gmgn.ai/sol/token/abc123_${PUMP}`, { address: PUMP, chain: 'solana' }],
    [`https://gmgn.ai/base/token/${EVM}`, { address: EVM, chain: 'base' }],
    [`https://gmgn.ai/bsc/token/${EVM}`, { address: EVM, chain: 'bsc' }],
    [`https://pump.fun/coin/${PUMP}`, { address: PUMP, chain: 'solana' }],
    [`https://pump.fun/${PUMP}`, { address: PUMP, chain: 'solana' }],
    [`https://birdeye.so/solana/token/${BONK}`, { address: BONK, chain: 'solana' }],
    [`https://birdeye.so/token/${BONK}?chain=solana`, { address: BONK, chain: 'solana' }],
    [`https://fomo.family/tokens/solana/${PUMP}`, { address: PUMP, chain: 'solana' }],
    [`https://fomo.family/tokens/bnb/${EVM}`, { address: EVM, chain: 'bsc' }],
    [`https://axiom.trade/meme/${BONK}?chain=sol`, { address: BONK, chain: 'solana', isPair: true }],
    [`https://axiom.trade/token/${EVM.toLowerCase()}?chain=base`, { address: EVM.toLowerCase(), chain: 'base' }],
    [`https://solscan.io/token/${BONK}`, { address: BONK, chain: 'solana' }],
    [`https://basescan.org/token/${EVM}`, { address: EVM, chain: 'base' }],
  ])('%s', (url, expected) => {
    expect(detectFromUrl(url)).toMatchObject(expected);
  });

  it('dexscreener: lowercase address is still detected as a pair/token', () => {
    const lower = BONK.toLowerCase();
    expect(detectFromUrl(`https://dexscreener.com/solana/${lower}`)).toMatchObject({
      address: lower,
      chain: 'solana',
      isPair: true,
    });
  });

  it('not a token page', () => {
    expect(detectFromUrl('https://gmgn.ai/trend?chain=sol')).toBeNull();
    expect(detectFromUrl('https://dexscreener.com/solana')).toBeNull();
    expect(detectFromUrl('https://fomo.family/discover')).toBeNull();
    expect(detectFromUrl('https://x.com/elonmusk')).toBeNull();
  });

  it('relative link with a base URL', () => {
    expect(detectFromUrl(`/sol/token/${PUMP}`, 'https://gmgn.ai/trend')).toMatchObject({ address: PUMP });
  });
});

describe('siteOf', () => {
  it.each([
    ['x.com', 'x'],
    ['twitter.com', 'x'],
    ['gmgn.ai', 'gmgn'],
    ['www.dexscreener.com', 'dexscreener'],
    ['fomo.family', 'fomo'],
    ['web.telegram.org', 'telegram'],
    ['example.com', undefined],
  ])('%s', (host, site) => expect(siteOf(host)).toBe(site));
});
