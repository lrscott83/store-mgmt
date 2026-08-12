import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import messages from '~/shared/lib/i18n/es';
import { OfflineAccessPanel } from '../offline-access-panel';
import { importRoster, isRosterProvisioned } from '~/shared/lib/offline/roster-store';
import { writeDeviceDekTable } from '~/shared/lib/storage/device-dek-table';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const STORE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

const confirmDialogMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  confirmDialog: (...args: unknown[]) => confirmDialogMock(...args),
}));

const showToastSuccessMock = vi.hoisted(() => vi.fn());
const showToastErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
  showToastError: (...args: unknown[]) => showToastErrorMock(...args),
}));

function makeBundle(overrides: Partial<OfflineRosterBundle> = {}): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
    formatVersion: 1,
    storeId: STORE_ID,
    users: [],
    ...overrides,
  };
}

/**
 * v2 + non-empty wrap fields makes isEncryptionProvisioned() true; no device
 * table is written, so hasDeviceDekWrap() stays false. Together that is the
 * only state that produces the data-loss warning.
 *
 * `OfflineRosterUser` has twelve required fields — spelled out in full rather
 * than cast, so a shape change fails this test instead of hiding behind an
 * `as`.
 */
function makeEncryptedBundle(): OfflineRosterBundle {
  return makeBundle({
    formatVersion: 2,
    users: [
      {
        id: 'u1',
        login: 'jdoe',
        fullName: 'Juana Doe',
        isActive: true,
        roles: [],
        featureIds: [],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: true,
        isReSeller: false,
        selectedStoreId: STORE_ID,
        verifier: null,
        wrappedDek: 'd2hhdGV2ZXI=',
        wrapSalt: 'c2FsdA==',
        wrapIv: 'aXY=',
      },
    ],
  });
}

function renderPanel() {
  render(
    <IntlProvider locale="es" messages={messages}>
      <OfflineAccessPanel />
    </IntlProvider>,
  );
}

describe('OfflineAccessPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    confirmDialogMock.mockReset();
    showToastSuccessMock.mockReset();
    showToastErrorMock.mockReset();
  });

  it('renders nothing until the roster state is known', () => {
    const { container } = render(
      <IntlProvider locale="es" messages={messages}>
        <OfflineAccessPanel />
      </IntlProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('offers activation on a device with no roster', async () => {
    renderPanel();

    expect(
      await screen.findByRole('button', { name: /^activar acceso sin conexión$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /desactivar acceso sin conexión/i }),
    ).not.toBeInTheDocument();
  });

  it('offers deactivation on a device that already has a roster', async () => {
    importRoster(makeBundle());
    renderPanel();

    expect(
      await screen.findByRole('button', { name: /desactivar acceso sin conexión/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^activar acceso sin conexión$/i }),
    ).not.toBeInTheDocument();
  });

  it('opens the activation dialog when activation is clicked', async () => {
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /^activar acceso sin conexión$/i }));

    expect(await screen.findByLabelText(/contraseña de activación/i)).toBeInTheDocument();
  });

  it('clears the roster, flips the button and toasts once deactivation is confirmed', async () => {
    importRoster(makeBundle());
    confirmDialogMock.mockResolvedValue(true);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /desactivar acceso sin conexión/i }));

    await waitFor(() => expect(isRosterProvisioned()).toBe(false));
    expect(
      await screen.findByRole('button', { name: /^activar acceso sin conexión$/i }),
    ).toBeInTheDocument();
    expect(showToastSuccessMock).toHaveBeenCalledWith('Acceso sin conexión desactivado.');
  });

  it('leaves the roster alone when deactivation is cancelled', async () => {
    importRoster(makeBundle());
    confirmDialogMock.mockResolvedValue(false);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /desactivar acceso sin conexión/i }));

    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    expect(isRosterProvisioned()).toBe(true);
    expect(
      screen.getByRole('button', { name: /desactivar acceso sin conexión/i }),
    ).toBeInTheDocument();
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });

  it('warns about unreadable data only when the device holds no key copy', async () => {
    importRoster(makeEncryptedBundle());
    confirmDialogMock.mockResolvedValue(false);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /desactivar acceso sin conexión/i }));

    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    expect(confirmDialogMock.mock.calls[0][0].message).toContain('van a quedar ilegibles');
  });

  it('omits the data warning when the roster carries no encryption', async () => {
    importRoster(makeBundle());
    confirmDialogMock.mockResolvedValue(false);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /desactivar acceso sin conexión/i }));

    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    expect(confirmDialogMock.mock.calls[0][0].message).not.toContain('ilegibles');
  });

  it('omits the data warning when the device holds its own key copy', async () => {
    importRoster(makeEncryptedBundle());
    // The other half of dataAtRisk: isEncryptionProvisioned() is true (same
    // encrypted bundle as the warning test above), but this device DOES
    // hold a key copy, so hasDeviceDekWrap() is true and the warning must
    // not fire. Nothing above this line ever wrote this table, which is why
    // both existing tests above cannot tell this branch apart from the
    // "no encryption at all" one.
    writeDeviceDekTable({
      formatVersion: 1,
      dekSource: 'local',
      storeId: STORE_ID,
      device: { wrappedDek: 'ct', wrapIv: 'iv' },
      users: {},
    });
    confirmDialogMock.mockResolvedValue(false);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /desactivar acceso sin conexión/i }));

    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    expect(confirmDialogMock.mock.calls[0][0].message).not.toContain('ilegibles');
  });
});

describe('OfflineAccessPanel — dynamic-import failures (Finding 3)', () => {
  beforeEach(() => {
    localStorage.clear();
    confirmDialogMock.mockReset();
    showToastSuccessMock.mockReset();
    showToastErrorMock.mockReset();
  });

  afterEach(() => {
    vi.doUnmock('~/shared/lib/offline/roster-store');
    vi.doUnmock('~/shared/lib/storage/device-dek-table');
    vi.resetModules();
  });

  it('logs a diagnosable error and stays in the unknown state when the mount-effect chunk fails to load', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.resetModules();
    vi.doMock('~/shared/lib/offline/roster-store', () => {
      throw new Error('chunk load failed');
    });

    const { OfflineAccessPanel: FreshPanel } = await import('../offline-access-panel');
    const { container } = render(
      <IntlProvider locale="es" messages={messages}>
        <FreshPanel />
      </IntlProvider>,
    );

    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
    expect(String(consoleErrorSpy.mock.calls[0]?.[0])).toContain('[offline-access-panel]');
    // Neither button can be trusted without roster state, so the panel
    // deliberately keeps rendering nothing rather than guessing.
    expect(container).toBeEmptyDOMElement();

    consoleErrorSpy.mockRestore();
  });

  it("surfaces the error through showToastError when handleDisable's dynamic import fails", async () => {
    importRoster(makeBundle());

    vi.resetModules();
    vi.doMock('~/shared/lib/storage/device-dek-table', () => {
      throw new Error('chunk load failed');
    });

    const { OfflineAccessPanel: FreshPanel } = await import('../offline-access-panel');
    render(
      <IntlProvider locale="es" messages={messages}>
        <FreshPanel />
      </IntlProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /desactivar acceso sin conexión/i }));

    await waitFor(() =>
      expect(showToastErrorMock).toHaveBeenCalledWith(
        'No pudimos completar la acción. Recargá la página e intentá de nuevo.',
      ),
    );
    // The confirmation dialog never opens: the failure happened before we
    // even know whether data is at risk.
    expect(confirmDialogMock).not.toHaveBeenCalled();
    // Roster is untouched — the disable button is still offered.
    expect(
      screen.getByRole('button', { name: /desactivar acceso sin conexión/i }),
    ).toBeInTheDocument();
  });
});
