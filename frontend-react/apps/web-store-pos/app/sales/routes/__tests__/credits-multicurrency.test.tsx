import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Currency, EModules, PaymentType } from '@store-mgmt/domain';
import type { SaleCredit } from '@store-mgmt/domain';
import { SaleCreditsPage } from '../credits';

const auth = vi.hoisted(() => ({
  state: {
    user: { selectedStoreId: 's1', storeModuleIds: [] as number[] },
    isAuthenticated: true,
  },
}));
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof auth.state) => unknown) =>
    typeof selector === 'function' ? selector(auth.state) : auth.state,
  ),
}));

const credits = vi.hoisted(() => ({ items: [] as SaleCredit[] }));
vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    filterSaleCredits: vi.fn().mockResolvedValue({
      data: credits.items,
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    }),
  })),
}));

vi.mock('~/shared/lib/multistore/multi-store-aggregator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/shared/lib/multistore/multi-store-aggregator')>();
  return {
    ...actual,
    unwrapStoreDek: vi.fn().mockResolvedValue(new Uint8Array([1])),
    readStoreSaleCredits: vi.fn().mockReturnValue([]),
  };
});

vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: vi.fn(),
  confirmDialog: vi.fn().mockResolvedValue(true),
}));

function makeCredit(overrides: Partial<SaleCredit> = {}): SaleCredit {
  return {
    id: 'c1',
    orderId: 'o1',
    client: 'Ana',
    total: 40,
    date: new Date('2024-03-15T10:00:00.000'),
    paid: 0,
    isPaid: false,
    isActive: true,
    paidDate: null as unknown as Date,
    paidType: null as unknown as PaymentType,
    note: '',
    createdDate: new Date('2024-03-15T10:00:00.000'),
    createdByName: '',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <SaleCreditsPage />
    </IntlProvider>,
  );
}

describe('SaleCreditsPage — MultiMonedas header + day totals', () => {
  beforeEach(() => {
    auth.state.user = { selectedStoreId: 's1', storeModuleIds: [] };
    credits.items = [];
  });

  it('gate OFF: keeps the legacy mixed total ($75)', async () => {
    credits.items = [
      makeCredit({ id: 'usd', total: 30, currency: Currency.USD }),
      makeCredit({ id: 'eur', total: 45, currency: Currency.EUR }),
    ];
    renderPage();
    expect((await screen.findAllByText('$75')).length).toBeGreaterThan(0);
  });

  it('gate ON: header and day totals are per currency, never mixed', async () => {
    auth.state.user.storeModuleIds = [EModules.MultiMonedas];
    credits.items = [
      makeCredit({ id: 'usd', total: 30, currency: Currency.USD }),
      makeCredit({ id: 'eur', total: 45, currency: Currency.EUR }),
    ];
    renderPage();
    // Header (and the single day panel) both render the per-currency breakdown.
    expect((await screen.findAllByText('30 USD')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('45 EUR').length).toBeGreaterThan(0);
    expect(screen.queryByText('$75')).toBeNull();
  });
});
