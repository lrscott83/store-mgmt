import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  initPwaInstallCapture,
  getDeferredPrompt,
  subscribeDeferredPrompt,
  firePwaInstallPrompt,
  resetPwaInstallPromptForTests,
} from '../pwa-install-prompt';

/** Builds a fake `beforeinstallprompt` event with the prompt()/userChoice API. */
function makeInstallPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const evt = new Event('beforeinstallprompt') as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  evt.prompt = vi.fn().mockResolvedValue(undefined);
  evt.userChoice = Promise.resolve({ outcome });
  return evt;
}

describe('pwa-install-prompt store — captures beforeinstallprompt outside React (early-capture fix)', () => {
  afterEach(() => {
    resetPwaInstallPromptForTests();
  });

  it('starts with no deferred prompt', () => {
    expect(getDeferredPrompt()).toBeNull();
  });

  it('captures a dispatched beforeinstallprompt event and calls preventDefault', () => {
    initPwaInstallCapture();
    const evt = makeInstallPromptEvent();
    const preventDefaultSpy = vi.spyOn(evt, 'preventDefault');

    window.dispatchEvent(evt);

    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expect(getDeferredPrompt()).toBe(evt);
  });

  it('adopts an event already captured by the early inline <head> script (window.__pwaInstallPrompt)', () => {
    // Chrome fires beforeinstallprompt once, often BEFORE the deferred module
    // bundle runs initPwaInstallCapture(). The inline <head> script catches it
    // into window.__pwaInstallPrompt; init must adopt that so the button is not
    // stuck disabled after the event was already missed by the module listener.
    const evt = makeInstallPromptEvent();
    (window as unknown as { __pwaInstallPrompt?: unknown }).__pwaInstallPrompt = evt;

    // `subscribeDeferredPrompt` is the lazy init path used by `usePwaInstall`'s
    // `useSyncExternalStore`, which reads the snapshot right after subscribing.
    subscribeDeferredPrompt(vi.fn());

    expect(getDeferredPrompt()).toBe(evt);
  });

  it('is idempotent — calling initPwaInstallCapture multiple times attaches the listener once', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    initPwaInstallCapture();
    initPwaInstallCapture();
    initPwaInstallCapture();

    const beforeInstallPromptCalls = addEventListenerSpy.mock.calls.filter(
      ([type]) => type === 'beforeinstallprompt',
    );
    expect(beforeInstallPromptCalls).toHaveLength(1);
  });

  it('clears the deferred prompt and notifies subscribers on appinstalled', () => {
    initPwaInstallCapture();
    window.dispatchEvent(makeInstallPromptEvent());
    expect(getDeferredPrompt()).not.toBeNull();

    const callback = vi.fn();
    subscribeDeferredPrompt(callback);
    callback.mockClear();

    window.dispatchEvent(new Event('appinstalled'));

    expect(getDeferredPrompt()).toBeNull();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('subscribeDeferredPrompt lazily initializes capture even without an explicit initPwaInstallCapture call', () => {
    const callback = vi.fn();
    subscribeDeferredPrompt(callback);

    window.dispatchEvent(makeInstallPromptEvent());

    expect(callback).toHaveBeenCalledTimes(1);
    expect(getDeferredPrompt()).not.toBeNull();
  });

  it('subscribeDeferredPrompt returns an unsubscribe function', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeDeferredPrompt(callback);
    unsubscribe();

    window.dispatchEvent(makeInstallPromptEvent());

    expect(callback).not.toHaveBeenCalled();
  });

  describe('firePwaInstallPrompt', () => {
    it('awaits prompt() and userChoice, then clears the deferred prompt', async () => {
      initPwaInstallCapture();
      const evt = makeInstallPromptEvent('accepted');
      window.dispatchEvent(evt);

      await firePwaInstallPrompt();

      expect(evt.prompt).toHaveBeenCalledTimes(1);
      expect(getDeferredPrompt()).toBeNull();
    });

    it('is a no-op when no prompt has been captured', async () => {
      await expect(firePwaInstallPrompt()).resolves.toBeUndefined();
    });

    it('notifies subscribers after firing', async () => {
      initPwaInstallCapture();
      window.dispatchEvent(makeInstallPromptEvent());

      const callback = vi.fn();
      subscribeDeferredPrompt(callback);
      callback.mockClear();

      await firePwaInstallPrompt();

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetPwaInstallPromptForTests', () => {
    it('clears captured state and subscribers so a fresh capture can start', () => {
      initPwaInstallCapture();
      window.dispatchEvent(makeInstallPromptEvent());
      const callback = vi.fn();
      subscribeDeferredPrompt(callback);

      resetPwaInstallPromptForTests();

      expect(getDeferredPrompt()).toBeNull();

      // A new subscriber attached after reset should not see the stale callback fire.
      window.dispatchEvent(makeInstallPromptEvent());
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
