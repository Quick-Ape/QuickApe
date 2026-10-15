import { installBridge } from '@/bridge/main-world';
import { CONTENT_MATCHES } from '@/lib/sites';

// Main world: the only place Phantom / MetaMask providers are reachable. No extension APIs here.
export default defineContentScript({
  matches: CONTENT_MATCHES,
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installBridge();
  },
});
