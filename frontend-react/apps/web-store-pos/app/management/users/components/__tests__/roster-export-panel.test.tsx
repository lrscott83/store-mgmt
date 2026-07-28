import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import messages from '~/shared/lib/i18n/es';

let mockIsOnline = true;
vi.mock('~/shared/lib/hooks/use-online-status', () => ({
  useOnlineStatus: () => mockIsOnline,
}));

let mockStoreId = 's1';
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { user: { selectedStoreId: string } }) => unknown) =>
    selector({ user: { selectedStoreId: mockStoreId } }),
}));

const getOfflineRosterMock = vi.fn();
vi.mock('~/shared/lib/http/roster-http-service', () => ({
  rosterHttpService: { getOfflineRoster: (...args: unknown[]) => getOfflineRosterMock(...args) },
}));

const serializeRosterMock = vi.fn();
vi.mock('~/shared/lib/offline/roster-serializer', () => ({
  serializeRoster: (...args: unknown[]) => serializeRosterMock(...args),
}));

import { RosterExportPanel } from '../roster-export-panel';

function renderPanel() {
  return render(
    <IntlProvider locale="es" messages={messages}>
      <RosterExportPanel />
    </IntlProvider>,
  );
}

describe('RosterExportPanel — offline-device-provisioning "Admin export action"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    mockStoreId = 's1';
  });

  it('disables the export action while offline', () => {
    mockIsOnline = false;
    renderPanel();
    expect(screen.getByRole('button', { name: /exportar roster sin conexión/i })).toBeDisabled();
  });

  it('disables the export action when storeId is empty', () => {
    mockStoreId = '';
    renderPanel();
    expect(screen.getByRole('button', { name: /exportar roster sin conexión/i })).toBeDisabled();
  });

  it('enables the export action when online and storeId is set', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /exportar roster sin conexión/i })).not.toBeDisabled();
  });

  it('fetches the roster and serializes it into a bundle on confirm', async () => {
    const bundle = { bundleId: 'b1', issuedAt: 1, expiresAt: 2, formatVersion: 1, storeId: 's1', users: [] };
    getOfflineRosterMock.mockResolvedValue(bundle);
    serializeRosterMock.mockResolvedValue(new Uint8Array([1, 2, 3]));

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /exportar roster sin conexión/i }));
    fireEvent.change(screen.getByLabelText(/contraseña maestra/i), { target: { value: 'master' } });
    fireEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));

    await waitFor(() => {
      expect(getOfflineRosterMock).toHaveBeenCalledWith('s1');
    });
    expect(serializeRosterMock).toHaveBeenCalledWith(bundle, 'master', 's1');
  });
});
