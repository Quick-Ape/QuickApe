import { handle } from '@/background/handlers';
import { checkAutoLock, walletState } from '@/background/session';
import type { Push, Request } from '@/lib/messages';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Request, sender, sendResponse) => {
    handle(msg, sender).then(
      (data) => sendResponse({ ok: true, data }),
      (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return true; // async response
  });

  browser.alarms.create('autolock', { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener(async (a) => {
    if (a.name !== 'autolock') return;
    if (await checkAutoLock()) {
      const msg: Push = { type: 'walletState', state: await walletState() };
      browser.runtime.sendMessage(msg).catch(() => {});
    }
  });
});
