import { GlobalConfig } from '~/shared/lib/config/global-config';
import { INSTALLED_FLAG_KEY, isRunningStandalone } from '~/shared/lib/hooks/use-pwa-install';
import { getDeferredPrompt } from '~/shared/lib/pwa/pwa-install-prompt';

/**
 * Forensic companion to `usePwaInstall`.
 *
 * The floating "Instalar App" button is rendered DISABLED (amber gradient at
 * 60% opacity) whenever it is installable but no `beforeinstallprompt` has been
 * captured, and the component is silent about why. On a client's device support
 * cannot tell an opaque disabled pill apart from a browser that will never fire
 * the prompt. This module records the evidence — the resolved install state, the
 * raw signals behind it, the service-worker registration and a device
 * fingerprint — so it travels in the client-log JSON the client exports from
 * /diagnostics.
 *
 * SCOPE: diagnostics ONLY. Nothing here changes the button's behaviour, text,
 * classes, tooltip or enabled/disabled semantics.
 *
 * SSR safety: nothing is read from `window`/`navigator` at import time, and
 * every browser read is guarded, so the module is importable during prerender.
 * No logging and no `logClientError` calls live here.
 */

export type InstallAvailability =
  | 'ready'
  | 'awaiting-prompt'
  | 'no-service-worker'
  | 'standalone'
  | 'installed-flag'
  | 'installed-related-app';

export interface InstallAvailabilityInput {
  serviceWorkerSupported: boolean;
  /** Display-mode OR iOS standalone: the same combined check the button uses. */
  runningStandalone: boolean;
  iosStandalone: boolean;
  installedFlag: boolean;
  installedRelatedApp: boolean;
  promptCaptured: boolean;
}

/**
 * Resolves WHY the install affordance is in its current state.
 *
 * Precedence is deterministic and ordered from "the app is already an installed
 * app" down to "the button can be clicked":
 *   1. `standalone`           — running as an installed app (display-mode or iOS).
 *   2. `installed-flag`       — the persisted flag says it was installed before.
 *   3. `installed-related-app`— Chromium reports an installed related web app.
 *   4. `no-service-worker`    — the browser cannot support installability.
 *   5. `awaiting-prompt`      — installable, but no `beforeinstallprompt` yet.
 *                               THIS is the opaque disabled amber pill.
 *   6. `ready`                — a prompt is captured, the button is clickable.
 */
export function resolveInstallAvailability(input: InstallAvailabilityInput): InstallAvailability {
  if (input.runningStandalone || input.iosStandalone) return 'standalone';
  if (input.installedFlag) return 'installed-flag';
  if (input.installedRelatedApp) return 'installed-related-app';
  if (!input.serviceWorkerSupported) return 'no-service-worker';
  if (!input.promptCaptured) return 'awaiting-prompt';
  return 'ready';
}

/** Verdict of `navigator.getInstalledRelatedApps()` — never a thrown error. */
export type InstalledRelatedAppsSignal = 'webapp' | 'none' | 'unsupported' | 'error';

export interface ServiceWorkerRegistrationState {
  scope: string;
  active: string | null;
  waiting: string | null;
  installing: string | null;
}

export interface PwaInstallSnapshot {
  /** ISO timestamp of the probe. */
  capturedAt: string;
  availability: InstallAvailability;
  signals: {
    serviceWorkerSupported: boolean;
    displayModeStandalone: boolean;
    iosStandalone: boolean;
    installedFlag: boolean;
    installedRelatedApp: InstalledRelatedAppsSignal;
    promptCaptured: boolean;
  };
  serviceWorker: {
    supported: boolean;
    controlled: boolean;
    registrations: ServiceWorkerRegistrationState[];
  };
  device: {
    userAgent: string;
    platform: string;
    language: string;
    onLine: boolean;
    appVersion: string;
  };
}

export interface ObservedInstallState {
  availability: InstallAvailability;
  /** ISO timestamp of the observation. */
  observedAt: string;
  /** ISO timestamp when a captured prompt superseded this observation, else null. */
  resolvedAt: string | null;
}

/**
 * How long the button must STAY visibly disabled before that is treated as an
 * anomaly worth reporting. Comfortably longer than the deferred service-worker
 * registration in `root.tsx` (5 s): `beforeinstallprompt` normally arrives
 * after mount, so an earlier write would manufacture a false cause on a
 * perfectly healthy device.
 */
export const DISABLED_OBSERVATION_MS = 10_000;

interface NavigatorWithInstallSignals extends Navigator {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<Array<{ platform: string }>>;
}

/** Module-scope only: forensic memory, never persisted, never logged. */
let lastObserved: ObservedInstallState | null = null;

function readDisplayModeStandalone(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function readIosStandalone(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as NavigatorWithInstallSignals).standalone === true
  );
}

function readInstalledFlag(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' && localStorage.getItem(INSTALLED_FLAG_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

async function probeInstalledRelatedApps(): Promise<InstalledRelatedAppsSignal> {
  if (typeof navigator === 'undefined') return 'unsupported';
  const nav = navigator as NavigatorWithInstallSignals;
  if (typeof nav.getInstalledRelatedApps !== 'function') return 'unsupported';
  try {
    const apps = await nav.getInstalledRelatedApps();
    return Array.isArray(apps) && apps.some((app) => app.platform === 'webapp') ? 'webapp' : 'none';
  } catch {
    return 'error';
  }
}

async function probeServiceWorker(): Promise<PwaInstallSnapshot['serviceWorker']> {
  if (!isServiceWorkerSupported()) {
    return { supported: false, controlled: false, registrations: [] };
  }
  try {
    const container = navigator.serviceWorker;
    const registrations = await container.getRegistrations();
    return {
      supported: true,
      controlled: Boolean(container.controller),
      registrations: registrations.map((registration) => ({
        scope: registration.scope,
        active: registration.active?.state ?? null,
        waiting: registration.waiting?.state ?? null,
        installing: registration.installing?.state ?? null,
      })),
    };
  } catch {
    // Best-effort: an unavailable/denied SW registry must never fail the probe.
    return { supported: true, controlled: false, registrations: [] };
  }
}

/** Collects everything support needs to explain a device's install state. */
export async function collectPwaInstallSnapshot(): Promise<PwaInstallSnapshot> {
  const serviceWorkerSupported = isServiceWorkerSupported();
  const displayModeStandalone = readDisplayModeStandalone();
  const iosStandalone = readIosStandalone();
  // The authoritative standalone check is the one the install hook already uses
  // (it ORs display-mode and iOS standalone); the raw signals below are recorded
  // separately because the report needs each one on its own.
  const standaloneRunning = isRunningStandalone();
  const installedFlag = readInstalledFlag();
  const installedRelatedAppSignal = await probeInstalledRelatedApps();
  const promptCaptured = getDeferredPrompt() !== null;

  return {
    capturedAt: new Date().toISOString(),
    availability: resolveInstallAvailability({
      serviceWorkerSupported,
      runningStandalone: standaloneRunning,
      iosStandalone,
      installedFlag,
      installedRelatedApp: installedRelatedAppSignal === 'webapp',
      promptCaptured,
    }),
    signals: {
      serviceWorkerSupported,
      displayModeStandalone,
      iosStandalone,
      installedFlag,
      installedRelatedApp: installedRelatedAppSignal,
      promptCaptured,
    },
    serviceWorker: await probeServiceWorker(),
    device: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      platform: typeof navigator !== 'undefined' ? (navigator.platform ?? '') : '',
      language: typeof navigator !== 'undefined' ? navigator.language : '',
      onLine: typeof navigator !== 'undefined' ? navigator.onLine : false,
      appVersion: GlobalConfig.APP_VERSION,
    },
  };
}

/**
 * Remembers the install state the button STAYED in. Only ever called for
 * `'awaiting-prompt'` by the button, after the stabilization window elapsed
 * without a captured prompt — never for the normal startup gap.
 */
export function recordObservedInstallState(availability: InstallAvailability): void {
  lastObserved = { availability, observedAt: new Date().toISOString(), resolvedAt: null };
}

/**
 * Marks the stored observation as superseded by a captured install prompt, so
 * the export never reports a stale "disabled" cause on a device where
 * installing demonstrably works. No-op when nothing was recorded or when the
 * observation is already resolved.
 */
export function resolveObservedInstallState(): void {
  if (!lastObserved || lastObserved.resolvedAt !== null) return;
  lastObserved = { ...lastObserved, resolvedAt: new Date().toISOString() };
}

/** The in-memory observation, or `null` when the button never recorded one. */
export function getLastObservedInstallState(): ObservedInstallState | null {
  return lastObserved ? { ...lastObserved } : null;
}

/** Pairs the current probe with the observation for the client-log export. */
export function buildPwaInstallExport(current: PwaInstallSnapshot): {
  current: PwaInstallSnapshot;
  lastObserved: ObservedInstallState | null;
} {
  return { current, lastObserved: getLastObservedInstallState() };
}

/** Test-only reset of the module-scope observation. */
export function resetInstallDiagnosticsForTests(): void {
  lastObserved = null;
}
