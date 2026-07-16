import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  firePwaInstallPrompt,
  getDeferredPrompt,
  subscribeDeferredPrompt,
} from '~/shared/lib/pwa/pwa-install-prompt';

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

function getServerSnapshot(): null {
  return null;
}

/**
 * Mirrors Angular's `AppComponent` PWA install logic: the button is offered when
 * service workers are supported and the app is not already installed, and it stays
 * disabled until a `beforeinstallprompt` event is captured. Resets on `appinstalled`.
 *
 * The captured prompt itself lives in the framework-agnostic
 * `pwa-install-prompt` store (populated as early as possible, from
 * `entry.client.tsx`, before hydration) — `useSyncExternalStore` here just
 * projects that already-captured state into React, so a prompt fired before
 * this hook ever mounted is still reflected immediately.
 */
export function usePwaInstall(): PwaInstall {
  const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const [canInstall, setCanInstall] = useState<boolean>(() => swSupported && !isRunningStandalone());
  const deferredPrompt = useSyncExternalStore(subscribeDeferredPrompt, getDeferredPrompt, getServerSnapshot);

  useEffect(() => {
    function onAppInstalled() {
      setCanInstall(false);
    }
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  return { canInstall, canPrompt: deferredPrompt !== null, promptInstall: firePwaInstallPrompt };
}
