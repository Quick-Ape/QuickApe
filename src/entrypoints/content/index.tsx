import { createRoot, type Root } from 'react-dom/client';
import { Overlay } from '@/content/Overlay';
import { startLinkHover, startSelection, startXScanner } from '@/content/scanners';
import { send } from '@/lib/messages';
import { onSettingsChanged } from '@/lib/settings';
import { detectFromUrl, siteOf } from '@/lib/urls';
import { listenTradeUpdates, setConnectedExecutor } from '@/ui/actions';
import { connectedTrade } from '@/content/connected';
import { CONTENT_MATCHES } from '@/lib/sites';
import { setState } from '@/ui/store';
import '@/ui/ui.css';

export default defineContentScript({
  matches: CONTENT_MATCHES,
  cssInjectionMode: 'ui',
  runAt: 'document_idle',

  async main(ctx) {
    const site = siteOf(location.hostname);
    if (!site) return;
    const settings = await send({ type: 'getSettings' }).catch(() => null);
    if (!settings?.sites[site]) return;
    setState({ settings });

    // Settings changed from the popup -> fetch the public version (no RPC / API key) from the background.
    const offSettings = onSettingsChanged(() => {
      send({ type: 'getSettings' }).then((s) => setState({ settings: s })).catch(() => {});
    });
    const offTrades = listenTradeUpdates();
    setConnectedExecutor(connectedTrade);
    ctx.onInvalidated(() => {
      offSettings();
      offTrades();
    });

    const ui = await createShadowRootUi<Root>(ctx, {
      name: 'quickape-overlay',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      mode: 'closed',
      // Typing in panel inputs doesn't trigger the website's keyboard shortcuts (e.g. X).
      isolateEvents: true,
      onMount(container) {
        const root = createRoot(container);
        root.render(<Overlay />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();

    // Token pages (gmgn.ai/sol/token/<CA>, pump.fun/coin/<CA>, etc.) -> panel opens automatically.
    const syncPage = () => setState({ pageToken: detectFromUrl(location.href) });
    syncPage();
    ctx.addEventListener(window, 'wxt:locationchange', syncPage);

    if (site === 'x') startXScanner(ctx);
    startLinkHover(ctx, ui.shadowHost);
    startSelection(ctx, ui.shadowHost);
  },
});
