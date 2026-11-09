// /diagnostics must SHOW the PWA install state (and its reason) and carry it in
// the exported JSON, so a client device can be diagnosed remotely.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: vi.fn(),
  showBlockingSuccess: vi.fn(),
  showBlockingInfo: vi.fn(),
  confirmDialog: vi.fn(),
  showAcknowledgeError: vi.fn(),
  showUpdateAvailable: vi.fn(),
}));

import { clearClientLogs } from '~/shared/lib/diagnostics/client-log';
import {
  recordObservedInstallState,
  resetInstallDiagnosticsForTests,
  resolveObservedInstallState,
} from '~/shared/lib/pwa/pwa-install-diagnostics';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <MemoryRouter initialEntries={['/diagnostics']}>{children}</MemoryRouter>
    </IntlProvider>
  );
}

async function renderPage() {
  const { DiagnosticsPage } = await import('../diagnostics');
  return render(
    <Wrapper>
      <DiagnosticsPage />
    </Wrapper>,
  );
}

/** A browser tab that is installable but has no captured install prompt. */
function stubInstallableBrowserWithoutPrompt(): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      controller: null,
      getRegistrations: vi.fn().mockResolvedValue([
        {
          scope: 'https://example.test/',
          active: { state: 'activated' },
          waiting: null,
          installing: null,
        },
      ]),
    },
    configurable: true,
  });
  Reflect.deleteProperty(navigator, 'getInstalledRelatedApps');
  Reflect.deleteProperty(navigator, 'standalone');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  resetInstallDiagnosticsForTests();
  stubInstallableBrowserWithoutPrompt();
  Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true });
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  clearClientLogs();
  resetInstallDiagnosticsForTests();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.restoreAllMocks();
});

describe('DiagnosticsPage — PWA install state', () => {
  it('shows the install state, the service-worker summary and the display mode', async () => {
    await renderPage();

    expect(
      await screen.findByText(esMessages['DIAGNOSTICS.PWA_AVAILABILITY_AWAITING_PROMPT']),
    ).toBeInTheDocument();
    expect(screen.getByText(/Estado de instalación/)).toBeInTheDocument();
    expect(screen.getByText(/active: activated/)).toBeInTheDocument();
    expect(screen.getByText(esMessages['DIAGNOSTICS.PWA_DISPLAY_BROWSER'])).toBeInTheDocument();
    // No observation was recorded in this session: the row stays out.
    expect(screen.queryByText(/Último estado del botón/)).not.toBeInTheDocument();
  });

  it('shows the last observed button state once the button recorded one', async () => {
    recordObservedInstallState('awaiting-prompt');

    await renderPage();
    await screen.findByText(/Estado de instalación/);

    expect(screen.getByText(/Último estado del botón/)).toBeInTheDocument();
    expect(screen.getAllByText(/Sin aviso de instalación del navegador/).length).toBeGreaterThan(1);
    // Unresolved: no resolution suffix yet.
    expect(screen.queryByText(/resuelto a las/)).not.toBeInTheDocument();
  });

  it('shows when a later install prompt resolved the observation', async () => {
    recordObservedInstallState('awaiting-prompt');
    resolveObservedInstallState();

    await renderPage();
    await screen.findByText(/Estado de instalación/);

    expect(screen.getByText(/Último estado del botón/)).toBeInTheDocument();
    expect(screen.getByText(/resuelto a las/)).toBeInTheDocument();
  });

  it('reports a missing service-worker registration', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { controller: null, getRegistrations: vi.fn().mockResolvedValue([]) },
      configurable: true,
    });

    await renderPage();

    expect(await screen.findByText(esMessages['DIAGNOSTICS.PWA_SW_NONE'])).toBeInTheDocument();
  });

  it('exports the PWA diagnostics block in the client-log JSON', async () => {
    recordObservedInstallState('awaiting-prompt');

    await renderPage();
    // Wait for the probe to land before exporting, otherwise the payload is
    // identical to the pre-change export.
    await screen.findByText(esMessages['DIAGNOSTICS.PWA_AVAILABILITY_AWAITING_PROMPT']);

    fireEvent.click(screen.getByRole('button', { name: esMessages['DIAGNOSTICS.COPY'] }));

    await waitFor(() => expect(window.navigator.clipboard.writeText).toHaveBeenCalled());
    const copied = vi.mocked(window.navigator.clipboard.writeText).mock.calls[0][0];
    const payload = JSON.parse(copied) as {
      pwa?: {
        current: { availability: string; signals: { serviceWorkerSupported: boolean } };
        lastObserved: { availability: string } | null;
      };
    };

    expect(payload.pwa?.current.availability).toBe('awaiting-prompt');
    expect(payload.pwa?.current.signals.serviceWorkerSupported).toBe(true);
    expect(payload.pwa?.lastObserved?.availability).toBe('awaiting-prompt');
  });
});
