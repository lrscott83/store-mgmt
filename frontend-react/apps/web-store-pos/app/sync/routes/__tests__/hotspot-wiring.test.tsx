import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: (
    selector: (state: { user: { selectedStoreId: string; login: string } }) => unknown,
  ) => selector({ user: { selectedStoreId: 's1', login: 'nobody' } }),
}));
vi.mock('~/shared/lib/hooks/use-online-status', () => ({ useOnlineStatus: () => true }));
vi.mock('~/shared/lib/http/roster-http-service', () => ({
  rosterHttpService: { getOfflineRoster: vi.fn() },
}));
vi.mock('~/shared/lib/offline/roster-serializer', () => ({ serializeRoster: vi.fn() }));

// The modals are covered by their own suites; here we only verify the wiring.
vi.mock('~/sync/components/hotspot-receive-modal', () => ({
  HotspotReceiveModal: ({
    onReceived,
    onClose,
  }: {
    onReceived: (file: File) => void;
    onClose: () => void;
  }) => (
    <div data-testid="receive-modal">
      <button
        type="button"
        data-testid="fake-received"
        onClick={() => onReceived(new File(['payload'], 'roster.smcabundle'))}
      >
        receive
      </button>
      <button type="button" data-testid="fake-close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));
vi.mock('~/sync/components/hotspot-share-modal', () => ({
  HotspotShareModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="share-modal">
      <button type="button" data-testid="fake-share-close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

import { ImportPage } from '../import';
import { ExportPage } from '../export';
import { RosterExportPanel } from '~/management/users/components/roster-export-panel';

function renderPage(node: React.ReactElement) {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {node}
    </IntlProvider>,
  );
}

describe('Hotspot wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('import page: receives a file over the hotspot and pre-selects it in the form', async () => {
    renderPage(<ImportPage />);

    fireEvent.click(screen.getByTestId('hotspot-open-receive'));
    expect(await screen.findByTestId('receive-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('fake-received'));

    await waitFor(() =>
      expect(screen.queryByTestId('receive-modal')).not.toBeInTheDocument(),
    );
    // The received payload is now the form's selected file.
    expect(screen.getByText('roster.smcabundle')).toBeInTheDocument();
  });

  it('export page: opens the hotspot share modal', async () => {
    renderPage(<ExportPage />);

    fireEvent.click(screen.getByTestId('hotspot-open-share'));
    expect(await screen.findByTestId('share-modal')).toBeInTheDocument();
  });

  it('roster panel: opens the hotspot share modal', async () => {
    renderPage(<RosterExportPanel />);

    fireEvent.click(screen.getByTestId('hotspot-open-share-roster'));
    expect(await screen.findByTestId('share-modal')).toBeInTheDocument();
  });
});
