import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

// ── Diagnostics view (/diagnostics) — client-error-log ─────────────────────
// Contract (docs/plans/2026-09-14-client-error-log-pwa-plan.md §3.4):
//  - lists the ring-buffer entries (level color, message, count badge)
//  - level filter + text search
//  - device info card (app version, userAgent, online, language)
//  - Share via navigator.share when available; download fallback otherwise
//  - Copy to clipboard; Clear (confirm) empties the buffer

vi.mock('~/auth/routes/loaders', () => ({
  adminLoader: vi.fn().mockResolvedValue(null),
}));

vi.mock('~/shared/lib/diagnostics/client-log', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/shared/lib/diagnostics/client-log')>();
  return { ...actual, exportClientLogs: vi.fn(() => '{"mock":true}') };
});

vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: vi.fn(),
  showBlockingSuccess: vi.fn(),
  showBlockingInfo: vi.fn(),
  confirmDialog: vi.fn(),
  showAcknowledgeError: vi.fn(),
  showUpdateAvailable: vi.fn(),
}));

import { logClientError, clearClientLogs } from '~/shared/lib/diagnostics/client-log';
import { confirmDialog } from '~/shared/lib/blocking-alert';

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

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // Set here (not in the module factory) because afterEach's
  // vi.restoreAllMocks() wipes factory-time implementations.
  vi.mocked(confirmDialog).mockResolvedValue(true);
  // jsdom has no navigator.share — the download fallback is the default.
  Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true });
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  clearClientLogs();
  vi.restoreAllMocks();
});

describe('DiagnosticsPage — render', () => {
  it('renders the header, device info and empty state when the buffer is empty', async () => {
    await renderPage();

    expect(screen.getByText(esMessages['DIAGNOSTICS.TITLE'])).toBeInTheDocument();
    expect(screen.getByText(esMessages['DIAGNOSTICS.EMPTY'])).toBeInTheDocument();
    // Device info card: app version + userAgent are always present.
    expect(screen.getByText(esMessages['DIAGNOSTICS.DEVICE_INFO'])).toBeInTheDocument();
  });

  it('lists captured entries with level, message and route', async () => {
    logClientError({ level: 'error', message: 'TypeError: cannot read x', route: '/sales/new' });
    logClientError({ level: 'warn', message: 'deprecation' });

    await renderPage();

    expect(screen.getByText(/TypeError: cannot read x/)).toBeInTheDocument();
    expect(screen.getByText(/deprecation/)).toBeInTheDocument();
    expect(screen.getByText('/sales/new')).toBeInTheDocument();
  });

  it('shows a ×N badge for deduplicated entries', async () => {
    logClientError({ level: 'error', message: 'loop' });
    logClientError({ level: 'error', message: 'loop' });
    logClientError({ level: 'error', message: 'loop' });

    await renderPage();

    expect(screen.getByText('×3')).toBeInTheDocument();
  });
});

describe('DiagnosticsPage — filters', () => {
  it('filters entries by level', async () => {
    logClientError({ level: 'error', message: 'an error' });
    logClientError({ level: 'info', message: 'an info event' });

    await renderPage();
    fireEvent.change(screen.getByLabelText(esMessages['DIAGNOSTICS.FILTER_LEVEL']), {
      target: { value: 'error' },
    });

    expect(screen.getByText(/an error/)).toBeInTheDocument();
    expect(screen.queryByText(/an info event/)).not.toBeInTheDocument();
  });

  it('filters entries by text search', async () => {
    logClientError({ level: 'error', message: 'checkout crashed' });
    logClientError({ level: 'error', message: 'roster import failed' });

    await renderPage();
    fireEvent.change(screen.getByLabelText(esMessages['DIAGNOSTICS.SEARCH']), {
      target: { value: 'checkout' },
    });

    expect(screen.getByText(/checkout crashed/)).toBeInTheDocument();
    expect(screen.queryByText(/roster import failed/)).not.toBeInTheDocument();
  });
});

describe('DiagnosticsPage — share / download / copy / clear', () => {
  it('downloads the export when navigator.share is NOT available (desktop fallback)', async () => {
    logClientError({ level: 'error', message: 'to be exported' });

    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window.URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(window.URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: esMessages['DIAGNOSTICS.DOWNLOAD'] }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it('uses navigator.share with the export file when available (installed PWA)', async () => {
    logClientError({ level: 'error', message: 'shared entry' });

    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'share', { value: shareMock, configurable: true });
    Object.defineProperty(window.navigator, 'canShare', {
      value: () => true,
      configurable: true,
    });

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: esMessages['DIAGNOSTICS.SHARE'] }));

    await waitFor(() => expect(shareMock).toHaveBeenCalled());
    const call = shareMock.mock.calls[0][0] as { files?: unknown[] };
    expect(call.files).toHaveLength(1);
  });

  it('copies the export to the clipboard', async () => {
    logClientError({ level: 'error', message: 'copied entry' });

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: esMessages['DIAGNOSTICS.COPY'] }));

    await waitFor(() => {
      expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith('{"mock":true}');
    });
  });

  it('clears the buffer after confirmation', async () => {
    logClientError({ level: 'error', message: 'doomed entry' });

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: esMessages['DIAGNOSTICS.CLEAR'] }));

    await waitFor(() => {
      expect(screen.queryByText(/doomed entry/)).not.toBeInTheDocument();
    });
  });
});
