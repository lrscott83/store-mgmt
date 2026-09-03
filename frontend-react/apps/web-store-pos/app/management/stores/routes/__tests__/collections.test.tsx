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
  it('builds clientLoader via resellerFeatureLoader([EFeatures.StorePayment]), verified against a genuinely fresh module instance', async () => {
    // Baseline: earlier "exports" tests in this file already imported and
    // cached '../collections'. This import returns that SAME cached instance
    // (no top-level re-execution).
    const before = await import('../collections');

    // Module cache: re-imports of '../collections' do not re-execute its
    // top-level code, so resellerFeatureLoader() would show 0 calls without
    // a fresh module instance.
    vi.resetModules();
    const after = await import('../collections');

    // Prove vi.resetModules() genuinely produced a NEW module instance. This
    // is checked BEFORE anything else and does not depend on mock call-count
    // bookkeeping: if resetModules silently no-ops (removed, misplaced, or
    // otherwise disturbed), `after` is the exact same object as `before` and
    // this fails loudly on its own — even if a stale call to
    // mockResellerFeatureLoader from the earlier "exports" import would
    // otherwise make a call-count-only assertion pass by coincidence.
    expect(after).not.toBe(before);

    // Fail loudly — never silently pass — if the loader was never actually
    // invoked as part of THIS fresh import: assert "was it called" before
    // "was it called with what".
    expect(mockResellerFeatureLoader).toHaveBeenCalled();
    expect(mockResellerFeatureLoader).toHaveBeenCalledWith([91]);

    // Tie the fresh export directly to the loader instance the POST-RESET
    // call produced — not merely "some function is exported" and "the mock
    // was called with [11] at some point in this file's run".
    const lastCallResult = mockResellerFeatureLoader.mock.results.at(-1)?.value;
    expect(after.clientLoader).toBe(lastCallResult);
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
      expect(screen.getByText('$1 234.50')).toBeInTheDocument();
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

// ═══════════════════════════════════════════════════════════════════════════════
// response-envelope-nullability WU-D — getStoresToCollect succeeded:false is a
// resolved value, not a rejection; loadRows must guard it the same as the
// existing catch branch, surfacing BILLING.COLLECTIONS.ERROR.
// ═══════════════════════════════════════════════════════════════════════════════

describe('CollectionsPage — getStoresToCollect succeeded:false', () => {
  it('shows BILLING.COLLECTIONS.ERROR and does not set rows from data', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.getStoresToCollect).mockResolvedValue({
      succeeded: false,
      data: null,
      message: null,
      actionCode: null,
      errors: [{ code: 'E01', description: 'failed' }],
    });

    const { default: CollectionsPage } = await import('../collections');
    render(
      <Wrapper>
        <CollectionsPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(esMessages['BILLING.COLLECTIONS.ERROR'])).toBeInTheDocument();
    });
    expect(screen.queryByText('Store One')).not.toBeInTheDocument();
  });
});
