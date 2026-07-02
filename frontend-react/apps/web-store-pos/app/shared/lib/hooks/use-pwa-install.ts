import { useEffect, useState } from 'react';

/** The non-standard `beforeinstallprompt` event (Chromium PWA install flow). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaInstall {
  /** Whether the install affordance should be shown (SW supported, not already installed). */
  canInstall: boolean;
  /** Whether a real install prompt has been captured and is ready to fire. */
  canPrompt: boolean;
  /** Fires the captured `beforeinstallprompt`; no-op when none is captured. */
  promptInstall: () => Promise<void>;
}

function isRunningStandalone(): boolean {
  const displayStandalone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari exposes standalone on navigator instead of matchMedia.
  const iosStandalone =
    typeof navigator !== 'undefined' &&
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(displayStandalone) || iosStandalone;
}

/**
 * Mirrors Angular's `AppComponent` PWA install logic: the button is offered when
 * service workers are supported and the app is not already installed, and it stays
 * disabled until a `beforeinstallprompt` event is captured. Resets on `appinstalled`.
 */
export function usePwaInstall(): PwaInstall {
  const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const [canInstall, setCanInstall] = useState<boolean>(() => swSupported && !isRunningStandalone());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      // Prevent Chrome's mini-infobar so we control when to prompt.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    }
    function onAppInstalled() {
      setDeferredPrompt(null);
      setCanInstall(false);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  async function promptInstall(): Promise<void> {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } finally {
      // A prompt can only be used once.
      setDeferredPrompt(null);
    }
  }

  return { canInstall, canPrompt: deferredPrompt !== null, promptInstall };
}
