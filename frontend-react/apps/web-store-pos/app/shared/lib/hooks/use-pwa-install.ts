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
 * localStorage key remembering that this origin's PWA has been installed.
 * Set on `appinstalled`, cleared as soon as a `beforeinstallprompt` fires
 * (which only happens when the app is NOT installed) so it self-heals after an
 * uninstall. Shared across all tabs of the origin.
 */
const INSTALLED_FLAG_KEY = 'pwa-installed';

function readInstalledFlag(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(INSTALLED_FLAG_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeInstalledFlag(value: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value) localStorage.setItem(INSTALLED_FLAG_KEY, 'true');
    else localStorage.removeItem(INSTALLED_FLAG_KEY);
  } catch {
    // Best-effort — a blocked/unavailable localStorage just disables persistence.
  }
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
 * opened in a non-standalone tab is otherwise invisible to JS. Two signals
 * cover it, both best-effort (on failure we fall back to Angular's behaviour,
 * showing the button):
 *   1. A persisted `localStorage` flag ({@link INSTALLED_FLAG_KEY}) written on
 *      `appinstalled` and read on load — works in every browser and across
 *      tabs, and self-heals on uninstall (cleared when `beforeinstallprompt`
 *      fires again). This is the primary, reliable signal.
 *   2. `navigator.getInstalledRelatedApps()` (Chromium only; needs the
 *      `related_applications` self-reference in the manifest) — authoritative
 *      when it resolves, but not universally supported.
 *
 * The captured prompt itself lives in the framework-agnostic
 * `pwa-install-prompt` store (populated as early as possible, from
 * `entry.client.tsx`, before hydration) — `useSyncExternalStore` here just
 * projects that already-captured state into React, so a prompt fired before
 * this hook ever mounted is still reflected immediately.
 */
export function usePwaInstall(): PwaInstall {
  const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const [installed, setInstalled] = useState<boolean>(() => readInstalledFlag());
  const deferredPrompt = useSyncExternalStore(subscribeDeferredPrompt, getDeferredPrompt, getServerSnapshot);

  useEffect(() => {
    function onAppInstalled() {
      writeInstalledFlag(true);
      setInstalled(true);
    }
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  // A captured `beforeinstallprompt` means the browser considers the app
  // installable — i.e. it is NOT installed — so clear any stale flag left over
  // from a previous install that has since been uninstalled.
  useEffect(() => {
    if (deferredPrompt) {
      writeInstalledFlag(false);
      setInstalled(false);
    }
  }, [deferredPrompt]);

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
          writeInstalledFlag(true);
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
