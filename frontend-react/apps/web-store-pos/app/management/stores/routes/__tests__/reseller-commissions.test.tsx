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
  it('builds clientLoader via resellerFeatureLoader([EFeatures.Owners])', async () => {
    // Module cache: re-imports of '../reseller-commissions' by earlier tests in
    // this file do not re-execute its top-level code.
    vi.resetModules();
    await import('../reseller-commissions');
    expect(mockResellerFeatureLoader).toHaveBeenCalledWith([11]);
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
