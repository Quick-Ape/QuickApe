/**
 * Chrome kills MV3 service workers after ~30 seconds without an event/API call.
 * Call this inside long loops (e.g. waiting for a transaction to confirm) so
 * the idle timer gets reset.
 */
export function keepAlive(): void {
  browser.runtime.getPlatformInfo().catch(() => {});
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
