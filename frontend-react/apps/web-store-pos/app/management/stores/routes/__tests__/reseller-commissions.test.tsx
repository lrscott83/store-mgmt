import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { ReSellerCommission } from '@store-mgmt/domain';

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
    getReSellerCommissions: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRow(overrides: Partial<ReSellerCommission> = {}): ReSellerCommission {
  return {
    year: 2026,
    month: 7,
    paymentCount: 3,
    totalCommission: 90,
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

describe('ReSellerCommissionsPage — exports', () => {
  it('exports a named clientLoader', async () => {
    const mod = await import('../reseller-commissions');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports ReSellerCommissionsPage as default export', async () => {
    const mod = await import('../reseller-commissions');
    expect(typeof mod.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Req: Route Gating — wiring-only (gate logic covered by loaders.test.ts)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ReSellerCommissionsPage — route gating wiring', () => {
  it('builds clientLoader via resellerFeatureLoader([EFeatures.StorePayment]), verified against a genuinely fresh module instance', async () => {
    // Baseline: earlier "exports" tests in this file already imported and
    // cached '../reseller-commissions'. This import returns that SAME cached
    // instance (no top-level re-execution).
    const before = await import('../reseller-commissions');

    // Module cache: re-imports of '../reseller-commissions' do not re-execute
    // its top-level code, so resellerFeatureLoader() would show 0 calls
    // without a fresh module instance.
    vi.resetModules();
    const after = await import('../reseller-commissions');

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
// Req: Reseller Commission View Totals By Period
// ═══════════════════════════════════════════════════════════════════════════════

describe('ReSellerCommissionsPage — rows', () => {
  it('renders MM/YYYY period, payment count, and total(formatCurrency) per row, and calls getReSellerCommissions on mount', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.getReSellerCommissions).mockResolvedValue({
      succeeded: true,
      data: [makeRow({ year: 2026, month: 7, paymentCount: 5, totalCommission: 1234.5 })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { default: ReSellerCommissionsPage } = await import('../reseller-commissions');
    render(
      <Wrapper>
        <ReSellerCommissionsPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('07/2026')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('$1,234.50')).toBeInTheDocument();
    });

    expect(storeHttpService.getReSellerCommissions).toHaveBeenCalledTimes(1);
  });

  it('renders a different period/count/total for a second row (triangulation)', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.getReSellerCommissions).mockResolvedValue({
      succeeded: true,
      data: [makeRow({ year: 2025, month: 12, paymentCount: 1, totalCommission: 10 })],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { default: ReSellerCommissionsPage } = await import('../reseller-commissions');
    render(
      <Wrapper>
        <ReSellerCommissionsPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('12/2025')).toBeInTheDocument();
      expect(screen.getByText('$10.00')).toBeInTheDocument();
    });
  });
});

describe('ReSellerCommissionsPage — empty state', () => {
  it('shows the empty-state message when there are no rows', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.getReSellerCommissions).mockResolvedValue({
      succeeded: true,
      data: [],
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { default: ReSellerCommissionsPage } = await import('../reseller-commissions');
    render(
      <Wrapper>
        <ReSellerCommissionsPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['BILLING.COMMISSIONS.EMPTY_STATE'])).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// response-envelope-nullability WU-D — getReSellerCommissions succeeded:false is
// a resolved value, not a rejection; loadRows must guard it the same as the
// existing catch branch, surfacing BILLING.COMMISSIONS.ERROR.
// ═══════════════════════════════════════════════════════════════════════════════

describe('ReSellerCommissionsPage — getReSellerCommissions succeeded:false', () => {
  it('shows BILLING.COMMISSIONS.ERROR and does not set rows from data', async () => {
    const { storeHttpService } = await import(
      '~/management/stores/lib/services/store-http-service'
    );
    vi.mocked(storeHttpService.getReSellerCommissions).mockResolvedValue({
      succeeded: false,
      data: null,
      message: null,
      actionCode: null,
      errors: [{ code: 'E01', description: 'failed' }],
    });

    const { default: ReSellerCommissionsPage } = await import('../reseller-commissions');
    render(
      <Wrapper>
        <ReSellerCommissionsPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(esMessages['BILLING.COMMISSIONS.ERROR'])).toBeInTheDocument();
    });
    expect(screen.queryByText('07/2026')).not.toBeInTheDocument();
  });
});
