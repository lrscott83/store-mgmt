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
 * PWA install logic based on Angular's `AppComponent`: the button is offered
 * when service workers are supported and the app is not already installed, and
 * it stays disabled until a `beforeinstallprompt` event is captured. Resets on
 * `appinstalled`.
 *
 * DIVERGENCE FROM ANGULAR (deliberate product decision): Angular keeps showing
 * the button (disabled) in a browser tab even when the PWA is already
 * installed — it only hides in standalone display mode. React additionally
 * hides it once the app is known to be installed. `beforeinstallprompt` never
 * fires for an installed app and `appinstalled` only fires at install time
 * (not on later loads), so an app installed in a PREVIOUS session and now
 * opened in a non-standalone tab is only detectable via
 * `navigator.getInstalledRelatedApps()` (Chromium; requires `related_applications`
 * self-reference in the manifest). Detection is best-effort: if the API is
 * absent or rejects, we fall back to the Angular behaviour (button shown).
 *
 * The captured prompt itself lives in the framework-agnostic
 * `pwa-install-prompt` store (populated as early as possible, from
 * `entry.client.tsx`, before hydration) — `useSyncExternalStore` here just
 * projects that already-captured state into React, so a prompt fired before
 * this hook ever mounted is still reflected immediately.
 */
export function usePwaInstall(): PwaInstall {
  const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const [installed, setInstalled] = useState<boolean>(false);
  const deferredPrompt = useSyncExternalStore(subscribeDeferredPrompt, getDeferredPrompt, getServerSnapshot);

  useEffect(() => {
    function onAppInstalled() {
      setInstalled(true);
    }
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ platform: string }>>;
    };
    if (typeof nav.getInstalledRelatedApps !== 'function') return;
    let cancelled = false;
    void nav
      .getInstalledRelatedApps()
      .then((apps) => {
        if (!cancelled && apps.some((app) => app.platform === 'webapp')) {
          setInstalled(true);
        }
      })
      .catch(() => {
        // Best-effort — on failure fall back to showing the button (parity).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canInstall = swSupported && !isRunningStandalone() && !installed;

  return { canInstall, canPrompt: deferredPrompt !== null, promptInstall: firePwaInstallPrompt };
}
