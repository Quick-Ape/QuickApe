/**
 * Fake Phantom (Wallet Standard) and MetaMask (EIP-6963) for exercising the real wallet
 * bridge protocol in the preview. Every call is logged to window.__walletLog.
 */
const log: string[] = [];
(window as unknown as { __walletLog: string[] }).__walletLog = log;

function note(s: string) {
  log.push(s);
  const el = document.getElementById('walletlog');
  if (el) el.textContent = log.join('\n');
}

// ---------- Phantom via Wallet Standard ----------
const solAccount = { address: '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2', publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: [] };
const phantom = {
  version: '1.0.0',
  name: 'Phantom',
  icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
  chains: ['solana:mainnet'],
  accounts: [] as (typeof solAccount)[],
  features: {
    'standard:connect': {
      async connect() {
        note('phantom: connect approved');
        phantom.accounts = [solAccount];
        return { accounts: phantom.accounts };
      },
    },
    'solana:signAndSendTransaction': {
      async signAndSendTransaction(input: { account: { address: string }; transaction: Uint8Array; chain: string }) {
        note(`phantom: signAndSend ${input.transaction.length} bytes on ${input.chain} for ${input.account.address.slice(0, 4)}…`);
        return [{ signature: new Uint8Array(64).fill(7) }];
      },
    },
  },
};
window.addEventListener('wallet-standard:app-ready', (e) => {
  (e as CustomEvent<{ register(w: unknown): void }>).detail.register(phantom);
});

// ---------- MetaMask via EIP-6963 ----------
let evmConnected = false;
const metamask = {
  async request({ method, params }: { method: string; params?: unknown[] }) {
    note(`metamask: ${method}${params ? ` ${JSON.stringify(params).slice(0, 80)}` : ''}`);
    switch (method) {
      case 'eth_accounts':
        return evmConnected ? ['0xAbC0000000000000000000000000000000000001'] : [];
      case 'eth_requestAccounts':
        evmConnected = true;
        return ['0xAbC0000000000000000000000000000000000001'];
      case 'eth_chainId':
        return '0x1';
      case 'wallet_switchEthereumChain':
        return null;
      case 'eth_sendTransaction':
        return `0x${'ab'.repeat(32)}`;
    }
    throw Object.assign(new Error(`unsupported ${method}`), { code: 4200 });
  },
};
window.addEventListener('eip6963:requestProvider', () => {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: { info: { uuid: 'mm-1', name: 'MetaMask', icon: '', rdns: 'io.metamask' }, provider: metamask },
    }),
  );
});
