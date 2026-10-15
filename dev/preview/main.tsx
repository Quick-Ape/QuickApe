import { initialSettings, view } from './mock-browser';
import { createRoot } from 'react-dom/client';
import { buildChipRow } from '@/content/chips';
import { connectedTrade } from '@/content/connected';
import { Overlay } from '@/content/Overlay';
import { App } from '@/popup/App';
import { SettingsTab } from '@/popup/Settings';
import { listenTradeUpdates, quickBuy, setConnectedExecutor } from '@/ui/actions';
import { setState } from '@/ui/store';
import uiCss from '@/ui/ui.css?inline';
import popupCss from '@/popup/popup.css?inline';

const root = document.getElementById('root')!;
const params = new URLSearchParams(location.search);
// ?bare=1 hides the preview chrome so store screenshots show only the extension UI.
if (params.get('bare') === '1') document.body.classList.add('bare');
setState({ settings: initialSettings });
listenTradeUpdates();

/** Mimic the X tweet markup with quick-buy chips, like the content script does. */
function renderFeed() {
  root.innerHTML = `
    <div class="fake-chart"></div>
    <div class="tweet"><div class="who">degen.sol <span>@degen · 2m</span></div>
      <div data-testid="tweetText">new cat just dropped on pump 🐱🚀 CA: 6HFhHd7za8zenhFEtZVbYdKDkhnY8SJrfEFNgCvBpump</div></div>
    <div class="tweet"><div class="who">based <span>@basedape · 9m</span></div>
      <div data-testid="tweetText">aping BRETT on base 0x532f27101965dd16442E59d40670FaF5eBB142E4</div></div>
    ${view === 'bridge' ? '<pre id="walletlog" class="walletlog">wallet calls will show here</pre>' : ''}`;
  const [t1, t2] = root.querySelectorAll<HTMLElement>('[data-testid="tweetText"]');
  t1.after(buildChipRow([{ address: '6HFhHd7za8zenhFEtZVbYdKDkhnY8SJrfEFNgCvBpump', source: 'x' }]));
  t2.after(buildChipRow([{ address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', source: 'x' }]));
}

async function renderPage() {
  if (view === 'bridge') {
    // Real bridge protocol against fake Phantom / MetaMask (connected mode).
    await import('./fake-wallets');
    const { installBridge } = await import('@/bridge/main-world');
    installBridge();
    setConnectedExecutor(connectedTrade);
  }
  // ?only=panel renders just the panel on a transparent page, for video captures.
  if (params.get('only') !== 'panel') renderFeed();
  // The overlay lives in a shadow root, like the content script's.
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = uiCss;
  const container = document.createElement('div');
  shadow.append(style, container);
  // ?panel=0 keeps the panel closed so only the feed chips show.
  if (view === 'page' && params.get('panel') !== '0') setState({ pageToken: { address: '6HFhHd7za8zenhFEtZVbYdKDkhnY8SJrfEFNgCvBpump', chain: 'solana' } });
  createRoot(container).render(<Overlay />);
  // ?buy=1 fires the first chip's quick buy (chips ignore synthetic clicks) so the toast shows.
  if (params.get('buy') === '1') setTimeout(() => quickBuy({ address: '6HFhHd7za8zenhFEtZVbYdKDkhnY8SJrfEFNgCvBpump', source: 'x' }), 600);
}

if (view === 'page' || view === 'bridge') {
  renderPage();
} else {
  const style = document.createElement('style');
  style.textContent = uiCss + popupCss.replace(/^(html,\s*)?body \{[^}]*\}/gm, '');
  document.head.append(style);
  root.className = 'popup-frame';
  createRoot(root).render(
    view === 'settings' ? (
      <div className="qa-popup">
        <div className="pp-body">
          <SettingsTab
            ws={{ signer: 'local', hasVault: true, unlocked: true, hasMnemonic: true, connected: {} }}
            onSaved={() => {}}
          />
        </div>
      </div>
    ) : (
      <App />
    ),
  );
}
