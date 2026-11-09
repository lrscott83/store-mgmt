import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearClientLogs, exportClientLogs, logClientError } from '../client-log';
import {
  buildPwaInstallExport,
  recordObservedInstallState,
  resetInstallDiagnosticsForTests,
  type PwaInstallSnapshot,
} from '~/shared/lib/pwa/pwa-install-diagnostics';

const SNAPSHOT: PwaInstallSnapshot = {
  capturedAt: '2026-11-09T10:00:00.000Z',
  availability: 'awaiting-prompt',
  signals: {
    serviceWorkerSupported: true,
    displayModeStandalone: false,
    iosStandalone: false,
    installedFlag: false,
    installedRelatedApp: 'none',
    promptCaptured: false,
  },
  serviceWorker: {
    supported: true,
    controlled: false,
    registrations: [{ scope: 'https://example.test/', active: 'activated', waiting: null, installing: null }],
  },
  device: {
    userAgent: 'test-agent',
    platform: 'test-platform',
    language: 'es',
    onLine: true,
    appVersion: '1.0.0',
  },
};

beforeEach(() => {
  localStorage.clear();
  resetInstallDiagnosticsForTests();
});

afterEach(() => {
  clearClientLogs();
  resetInstallDiagnosticsForTests();
  vi.restoreAllMocks();
});

describe('exportClientLogs — PWA install diagnostics block', () => {
  it('stays byte-shape compatible when no PWA data is passed', () => {
    logClientError({ level: 'error', message: 'kept entry' });

    const payload = JSON.parse(exportClientLogs()) as Record<string, unknown>;

    expect('pwa' in payload).toBe(false);
    expect(payload.entries).toHaveLength(1);
    expect(payload).toHaveProperty('appVersion');
    expect(payload).toHaveProperty('device');
  });

  it('carries the current snapshot and the last observed button state when passed', () => {
    recordObservedInstallState('awaiting-prompt');
    const exported = buildPwaInstallExport(SNAPSHOT);

    const payload = JSON.parse(exportClientLogs('store-1', exported)) as {
      pwa: { current: PwaInstallSnapshot; lastObserved: { availability: string } | null };
      selectedStoreId?: string;
    };

    expect(payload.pwa.current).toEqual(SNAPSHOT);
    expect(payload.pwa.lastObserved?.availability).toBe('awaiting-prompt');
    expect(payload.selectedStoreId).toBe('store-1');
  });
});
