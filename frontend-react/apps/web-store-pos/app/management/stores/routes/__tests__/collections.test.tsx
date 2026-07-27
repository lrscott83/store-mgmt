import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { StoreToCollect } from '@store-mgmt/domain';

// ─── loader mock (Req: Route Gating — must be resellerFeatureLoader) ─────────

const mockResellerFeatureLoader = vi.fn((_featureIds: number[]) =>
  vi.fn().mockResolvedValue(null)
);
vi.mock('~/auth/routes/loaders', () => ({
  resellerFeatureLoader: (featureIds: number[]) => mockResellerFeatureLoader(featureIds),
}));

// ─── storeHttpService mock ────────────────────────────────────────────────────

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    getStoresToCollect: vi.fn(),
    registerStorePayment: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRow(overrides: Partial<StoreToCollect> = {}): StoreToCollect {
  return {
    storeId: 's1',
    storeName: 'Store One',
    ownerName: 'Owner One',
    amount: 25,
    nextDueDate: '2026-08-15',
    status: 'PorVencer',
    ...overrides,
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('CollectionsPage — exports', () => {
  it('exports a named clientLoader', async () => {
    const mod = await import('../collections');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports CollectionsPage as default export', async () => {
    const mod = await import('../collections');
    expect(typeof mod.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Req: Route Gating — wiring-only (gate logic covered by loaders.test.ts)
// ═══════════════════════════════════════════════════════════════════════════════

describe('CollectionsPage — route gating wiring', () => {
  it('builds clientLoader via resellerFeatureLoader([EFeatures.Owners])', async () => {
    // Module cache: re-imports of '../collections' by earlier tests in this file
    // do not re-execute its top-level code, so resellerFeatureLoader() would show
    // 0 calls without a fresh module instance.
    vi.resetModules();
    await import('../collections');
    expect(mockResellerFeatureLoader).toHaveBeenCalledWith([11]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Req: Collections View Lists Stores To Collect
// ═══════════════════════════════════════════════════════════════════════════════

describe('CollectionsPage — rows', () => {
  it('renders store/owner/amount(formatCurrency)/status for each row and calls getStoresToCollect on mount', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.getStoresToCollect).mockResolvedValue({
      succeeded: true,
      data: [makeRow({ amount: 1234.5, status: 'EnGracia' })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { default: CollectionsPage } = await import('../collections');
    render(
      <Wrapper>
        <CollectionsPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Store One')).toBeInTheDocument();
      expect(screen.getByText('Owner One')).toBeInTheDocument();
      expect(screen.getByText('$1,234.50')).toBeInTheDocument();
      expect(screen.getByText(esMessages['BILLING.STATUS.EnGracia'])).toBeInTheDocument();
    });

    expect(storeHttpService.getStoresToCollect).toHaveBeenCalledTimes(1);
  });
});

describe('CollectionsPage — mark paid', () => {
  it('calls registerStorePayment(storeId) and reloads the list on click', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.getStoresToCollect).mockResolvedValue({
      succeeded: true,
      data: [makeRow({ storeId: 's42' })],
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(storeHttpService.registerStorePayment).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { default: CollectionsPage } = await import('../collections');
    render(
      <Wrapper>
        <CollectionsPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Store One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: esMessages['BILLING.COLLECTIONS.REGISTER_PAYMENT'] }));

    await waitFor(() => {
      expect(storeHttpService.registerStorePayment).toHaveBeenCalledWith('s42');
      expect(storeHttpService.getStoresToCollect).toHaveBeenCalledTimes(2);
    });
  });
});

describe('CollectionsPage — empty state', () => {
  it('shows the empty-state message when there are no rows', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.getStoresToCollect).mockResolvedValue({
      succeeded: true,
      data: [],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { default: CollectionsPage } = await import('../collections');
    render(
      <Wrapper>
        <CollectionsPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['BILLING.COLLECTIONS.EMPTY_STATE'])).toBeInTheDocument();
    });
  });
});
