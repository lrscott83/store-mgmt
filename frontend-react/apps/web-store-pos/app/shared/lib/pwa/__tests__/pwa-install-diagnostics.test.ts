// ── PWA install diagnostics ───────────────────────────────────────────────
// The floating "Instalar App" button renders disabled (amber gradient at 60%
// opacity) whenever `canInstall` is true but no `beforeinstallprompt` has been
// captured. The component itself is silent, so support cannot tell WHY the
// button is disabled on a client's device. This module records the evidence:
// the resolved install state, the raw browser signals behind it and a device
// fingerprint, all of which travel in the client-log JSON exported from
// /diagnostics. It changes NO visible button behaviour.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalConfig } from '~/shared/lib/config/global-config';
import { resetPwaInstallPromptForTests } from '~/shared/lib/pwa/pwa-install-prompt';
import {
  buildPwaInstallExport,
  collectPwaInstallSnapshot,
  getLastObservedInstallState,
  recordObservedInstallState,
  resetInstallDiagnosticsForTests,
  resolveInstallAvailability,
  resolveObservedInstallState,
  type InstallAvailabilityInput,
} from '../pwa-install-diagnostics';

function setServiceWorker(value: object | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    return;
  }
  Object.defineProperty(navigator, 'serviceWorker', { value, configurable: true });
}

function setStandaloneDisplay(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes('standalone') ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function setIosStandalone(value: boolean | undefined): void {
  Object.defineProperty(navigator, 'standalone', { value, configurable: true });
}

function setRelatedApps(implementation: (() => Promise<Array<{ platform: string }>>) | null): void {
  if (implementation === null) {
    Reflect.deleteProperty(navigator, 'getInstalledRelatedApps');
    return;
  }
  Object.defineProperty(navigator, 'getInstalledRelatedApps', {
    value: implementation,
    configurable: true,
  });
}

const BASE_INPUT: InstallAvailabilityInput = {
  serviceWorkerSupported: true,
  runningStandalone: false,
  iosStandalone: false,
  installedFlag: false,
  installedRelatedApp: false,
  promptCaptured: false,
};

describe('resolveInstallAvailability — the six outcomes', () => {
  it.each<[string, Partial<InstallAvailabilityInput>, string]>([
    ['shows the button disabled when a prompt is still missing', {}, 'awaiting-prompt'],
    ['is ready once a prompt is captured', { promptCaptured: true }, 'ready'],
    ['reports a browser without service worker support', { serviceWorkerSupported: false }, 'no-service-worker'],
    ['reports the persisted installed flag', { installedFlag: true }, 'installed-flag'],
    ['reports an installed related web app', { installedRelatedApp: true }, 'installed-related-app'],
    ['reports standalone display mode', { runningStandalone: true }, 'standalone'],
    ['reports iOS standalone mode', { iosStandalone: true }, 'standalone'],
  ])('%s', (_name, override, expected) => {
    expect(resolveInstallAvailability({ ...BASE_INPUT, ...override })).toBe(expected);
  });
});

describe('resolveInstallAvailability — precedence', () => {
  it('running as an installed app outranks every other signal', () => {
    expect(
      resolveInstallAvailability({
        serviceWorkerSupported: false,
        runningStandalone: true,
        iosStandalone: false,
        installedFlag: true,
        installedRelatedApp: true,
        promptCaptured: false,
      }),
    ).toBe('standalone');
  });

  it('the persisted installed flag outranks the related-app and service-worker signals', () => {
    expect(
      resolveInstallAvailability({
        ...BASE_INPUT,
        serviceWorkerSupported: false,
        installedFlag: true,
        installedRelatedApp: true,
      }),
    ).toBe('installed-flag');
  });

  it('a missing service worker outranks the pending-prompt state', () => {
    expect(
      resolveInstallAvailability({ ...BASE_INPUT, serviceWorkerSupported: false, promptCaptured: false }),
    ).toBe('no-service-worker');
  });
});

describe('observed install state', () => {
  beforeEach(() => {
    resetInstallDiagnosticsForTests();
  });

  afterEach(() => {
    resetInstallDiagnosticsForTests();
  });

  it('is null until something records it', () => {
    expect(getLastObservedInstallState()).toBeNull();
  });

  it('keeps only the in-memory observation of the visibly disabled button', () => {
    recordObservedInstallState('awaiting-prompt');

    const observed = getLastObservedInstallState();
    expect(observed?.availability).toBe('awaiting-prompt');
    expect(observed?.resolvedAt).toBeNull();
    expect(new Date(observed?.observedAt ?? '').toISOString()).toBe(observed?.observedAt);
    // Never persisted: the observation is forensic, not a setting.
    expect(localStorage.getItem('pwa-observed-install-state')).toBeNull();
  });

  it('resolveObservedInstallState marks the observation resolved exactly once', () => {
    recordObservedInstallState('awaiting-prompt');

    resolveObservedInstallState();
    const resolved = getLastObservedInstallState();
    expect(new Date(resolved?.resolvedAt ?? '').toISOString()).toBe(resolved?.resolvedAt);

    resolveObservedInstallState();
    expect(getLastObservedInstallState()?.resolvedAt).toBe(resolved?.resolvedAt);
  });

  it('resolveObservedInstallState is a no-op when nothing was recorded', () => {
    resolveObservedInstallState();

    expect(getLastObservedInstallState()).toBeNull();
  });

  it('is cleared by the test reset', () => {
    recordObservedInstallState('ready');
    resetInstallDiagnosticsForTests();

    expect(getLastObservedInstallState()).toBeNull();
  });

  it('buildPwaInstallExport carries the observation next to the current snapshot', async () => {
    const snapshot = await collectPwaInstallSnapshot();
    recordObservedInstallState('awaiting-prompt');

    const exported = buildPwaInstallExport(snapshot);

    expect(exported.current).toBe(snapshot);
    expect(exported.lastObserved?.availability).toBe('awaiting-prompt');
  });

  it('buildPwaInstallExport reports a null observation when nothing was recorded', async () => {
    const snapshot = await collectPwaInstallSnapshot();

    expect(buildPwaInstallExport(snapshot).lastObserved).toBeNull();
  });
});

describe('collectPwaInstallSnapshot — forensic browser surface', () => {
  beforeEach(() => {
    localStorage.clear();
    resetInstallDiagnosticsForTests();
    resetPwaInstallPromptForTests();
    setServiceWorker({});
    setStandaloneDisplay(false);
    setIosStandalone(undefined);
    setRelatedApps(null);
  });

  afterEach(() => {
    setServiceWorker(undefined);
    setIosStandalone(undefined);
    setRelatedApps(null);
    vi.restoreAllMocks();
    localStorage.clear();
    resetInstallDiagnosticsForTests();
    resetPwaInstallPromptForTests();
  });

  it('explains the opaque disabled button: installable but no prompt captured', async () => {
    const snapshot = await collectPwaInstallSnapshot();

    expect(snapshot.availability).toBe('awaiting-prompt');
    expect(snapshot.signals).toEqual({
      serviceWorkerSupported: true,
      displayModeStandalone: false,
      iosStandalone: false,
      installedFlag: false,
      installedRelatedApp: 'unsupported',
      promptCaptured: false,
    });
    expect(new Date(snapshot.capturedAt).toISOString()).toBe(snapshot.capturedAt);
  });

  it('records the device fingerprint the support report needs', async () => {
    const snapshot = await collectPwaInstallSnapshot();

    expect(snapshot.device.appVersion).toBe(GlobalConfig.APP_VERSION);
    expect(snapshot.device.userAgent).toBe(navigator.userAgent);
    expect(snapshot.device.language).toBe(navigator.language);
    expect(snapshot.device.onLine).toBe(navigator.onLine);
    expect(typeof snapshot.device.platform).toBe('string');
  });

  it('reports a browser without service worker support instead of throwing', async () => {
    setServiceWorker(undefined);

    const snapshot = await collectPwaInstallSnapshot();

    expect(snapshot.availability).toBe('no-service-worker');
    expect(snapshot.signals.serviceWorkerSupported).toBe(false);
    expect(snapshot.serviceWorker).toEqual({ supported: false, controlled: false, registrations: [] });
  });

  it('detects standalone display mode through matchMedia', async () => {
    setStandaloneDisplay(true);

    const snapshot = await collectPwaInstallSnapshot();

    expect(snapshot.signals.displayModeStandalone).toBe(true);
    expect(snapshot.availability).toBe('standalone');
  });

  it('detects iOS standalone mode exposed on navigator', async () => {
    setIosStandalone(true);

    const snapshot = await collectPwaInstallSnapshot();

    expect(snapshot.signals.iosStandalone).toBe(true);
    expect(snapshot.availability).toBe('standalone');
  });

  it('detects the persisted pwa-installed flag from a previous session', async () => {
    localStorage.setItem('pwa-installed', 'true');

    const snapshot = await collectPwaInstallSnapshot();

    expect(snapshot.signals.installedFlag).toBe(true);
    expect(snapshot.availability).toBe('installed-flag');
  });

  it('reports getInstalledRelatedApps finding an installed web app', async () => {
    setRelatedApps(async () => [{ platform: 'webapp' }]);

    const snapshot = await collectPwaInstallSnapshot();

    expect(snapshot.signals.installedRelatedApp).toBe('webapp');
    expect(snapshot.availability).toBe('installed-related-app');
  });

  it('reports no installed related app when the query resolves empty', async () => {
    setRelatedApps(async () => []);

    const snapshot = await collectPwaInstallSnapshot();

    expect(snapshot.signals.installedRelatedApp).toBe('none');
  });

  it('never rejects when getInstalledRelatedApps rejects', async () => {
    setRelatedApps(async () => {
      throw new Error('not permitted');
    });

    const snapshot = await collectPwaInstallSnapshot();

    expect(snapshot.signals.installedRelatedApp).toBe('error');
    expect(snapshot.availability).toBe('awaiting-prompt');
  });

  it('falls back to an empty service-worker summary when getRegistrations throws', async () => {
    setServiceWorker({
      controller: null,
      getRegistrations: vi.fn().mockRejectedValue(new Error('denied')),
    });

    const snapshot = await collectPwaInstallSnapshot();

    expect(snapshot.serviceWorker).toEqual({ supported: true, controlled: false, registrations: [] });
  });

  it('maps every registration to its scope and worker states', async () => {
    setServiceWorker({
      controller: { state: 'activated' },
      getRegistrations: vi.fn().mockResolvedValue([
        {
          scope: 'https://example.test/',
          active: { state: 'activated' },
          waiting: { state: 'installed' },
          installing: null,
        },
      ]),
    });

    const snapshot = await collectPwaInstallSnapshot();

    expect(snapshot.serviceWorker).toEqual({
      supported: true,
      controlled: true,
      registrations: [
        {
          scope: 'https://example.test/',
          active: 'activated',
          waiting: 'installed',
          installing: null,
        },
      ],
    });
  });
});
