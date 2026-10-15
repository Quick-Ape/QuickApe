import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'QuickApe',
    homepage_url: 'https://www.quickape.world',
    // MAIN-world content scripts need Chrome 111+; storage.session access levels need 102+.
    minimum_chrome_version: '116',
    description: 'Buy and sell memecoins in one click, right on the pages where you find them. Solana and EVM chains.',
    permissions: ['storage', 'alarms', 'notifications'],
    // All network requests run from the background. Custom RPCs entered by the user
    // usually send CORS headers already, so <all_urls> is not needed.
    host_permissions: [
      'https://api.jup.ag/*',
      'https://lite-api.jup.ag/*',
      'https://api.dexscreener.com/*',
      'https://aggregator-api.kyberswap.com/*',
      'https://api.gopluslabs.io/*',
      'https://www.quickape.world/*',
      'https://solana-rpc.publicnode.com/*',
      'https://*.helius-rpc.com/*',
      'https://mainnet.block-engine.jito.wtf/*',
      'https://ethereum-rpc.publicnode.com/*',
      'https://mainnet.base.org/*',
      'https://bsc-dataseed.bnbchain.org/*',
    ],
  },
});
