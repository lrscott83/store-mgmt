import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { EModules, PaymentType, SaleCreditErrors } from '@store-mgmt/domain';
import type { SaleCredit } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import { addDays, startOfDay } from '~/shared/lib/date-utils';
import { readStoreSaleCredits } from '~/shared/lib/multistore/multi-store-aggregator';

// Category-C envelope helper: the Observable/filter siblings resolve BaseResponseModel<SaleCredit[]>.
function creditsResponse(credits: SaleCredit[] = []) {
  return Promise.resolve({
    data: credits,
    succeeded: true,
    message: '',
    actionCode: 200,
    errors: [],
  });
}

// response-envelope-nullability WU-D — the resolved-failure shape both offline reads guard
// against, even though the local-storage read they wrap never actually produces it.
function creditsFailureResponse() {
  return Promise.resolve({
    data: null,
    succeeded: false as const,
    message: null,
    actionCode: null,
    errors: [{ code: 'E01', description: 'failed' }],
  });
}

// Mutable auth state: the default keeps the single-store shape the sibling
// views rely on; the MultiStores describe flips it to an OwnerAdmin with the
// MultiStores module so the REAL useMultiStore gate enables.
const { authStoreState } = vi.hoisted(() => ({
  authStoreState: {
    user: { selectedStoreId: 's1' },
    isAuthenticated: true,
  } as {
    user: {
      selectedStoreId: string;
      isOwnerAdmin?: boolean;
      storeModuleIds?: number[];
      storeList?: Array<{ id: string; name: string; isActive?: boolean }>;
    };
    isAuthenticated: boolean;
  },
}));
vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: typeof authStoreState) => unknown) =>
    typeof selector === 'function' ? selector(authStoreState) : authStoreState,
  );
  return { useAuthStore };
});

// blocking-alert is an imperative Swal wrapper — mock it so the `.succeeded` failure branch is
// observable (the edit/payment modals call showBlockingError when onSave/onPay returns false).
const mockShowBlockingError = vi.fn();
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => mockShowBlockingError(...args),
  confirmDialog: vi.fn().mockResolvedValue(true),
}));

vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn(),
}));

// The per-store DEK/read are mocked for determinism; the day grouping stays real.
vi.mock('~/shared/lib/multistore/multi-store-aggregator', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/shared/lib/multistore/multi-store-aggregator')>();
  return {
    ...actual,
    unwrapStoreDek: vi.fn().mockResolvedValue(new Uint8Array([1])),
    readStoreSaleCredits: vi.fn().mockReturnValue([]),
  };
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

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

import { TodaySaleCreditsPage } from '../today-credits';
import { SaleCreditsPage } from '../credits';

describe('TodaySaleCreditsPage — behavioral (Angular parity)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders today active credits loaded via getSaleCreditsInDayObservable', async () => {
    vi.mocked(SaleCreditOfflineService).mockImplementation(
      () =>
        ({
          getSaleCreditsInDayObservable: vi.fn().mockReturnValue(creditsResponse([makeCredit()])),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <TodaySaleCreditsPage />
      </Wrapper>,
    );

    // loadSaleCredits is async — wait for the credit's client to appear in the list.
    expect(await screen.findByText('Ana')).toBeInTheDocument();
  });

  it('handleSave surfaces the localized not-found error when updateSaleCredit fails (.succeeded=false)', async () => {
    const update = vi
      .fn()
      .mockReturnValue({ data: undefined, succeeded: false, errors: [SaleCreditErrors.NotExists] });
    vi.mocked(SaleCreditOfflineService).mockImplementation(
      () =>
        ({
          getSaleCreditsInDayObservable: vi.fn().mockReturnValue(creditsResponse([makeCredit()])),
          updateSaleCredit: update,
          paidSaleCredit: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <TodaySaleCreditsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('sale-credit-actions-toggle-c1'));
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByTestId('edit-sale-credit-submit'));

    expect(update).toHaveBeenCalled();
    expect(mockShowBlockingError).toHaveBeenCalled();
  });

  it('handleSave reloads and shows no error when updateSaleCredit succeeds (.succeeded=true)', async () => {
    const update = vi.fn().mockReturnValue({ data: undefined, succeeded: true, errors: [] });
    const getInDay = vi.fn().mockReturnValue(creditsResponse([makeCredit()]));
    vi.mocked(SaleCreditOfflineService).mockImplementation(
      () =>
        ({
          getSaleCreditsInDayObservable: getInDay,
          updateSaleCredit: update,
          paidSaleCredit: vi.fn(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <TodaySaleCreditsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('sale-credit-actions-toggle-c1'));
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByTestId('edit-sale-credit-submit'));

    expect(update).toHaveBeenCalled();
    expect(mockShowBlockingError).not.toHaveBeenCalled();
    // success → handleSave triggers loadSaleCredits() again (mount load + post-save reload).
    await waitFor(() => expect(getInDay).toHaveBeenCalledTimes(2));
  });

  it('handlePay surfaces the not-found error when paidSaleCredit fails (.succeeded=false)', async () => {
    const pay = vi
      .fn()
      .mockReturnValue({ data: undefined, succeeded: false, errors: [SaleCreditErrors.NotExists] });
    vi.mocked(SaleCreditOfflineService).mockImplementation(
      () =>
        ({
          getSaleCreditsInDayObservable: vi.fn().mockReturnValue(creditsResponse([makeCredit()])),
          updateSaleCredit: vi.fn(),
          paidSaleCredit: pay,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <TodaySaleCreditsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('sale-credit-actions-toggle-c1'));
    fireEvent.click(screen.getByText('Pagar'));
    fireEvent.click(screen.getByTestId('sale-credit-payment-submit'));

    // Payment modal confirms asynchronously (confirmDialog) before invoking onPay.
    await waitFor(() => expect(pay).toHaveBeenCalled());
    await waitFor(() => expect(mockShowBlockingError).toHaveBeenCalled());
  });

  // response-envelope-nullability WU-D — BEHAVIORAL GAP, pinned not fixed.
  // getSaleCreditsInDayObservable succeeded:false silently swallows (no error
  // state, no error UI) — same idiom as the sibling silent guards on this
  // branch. This test pins the current behavior; it does not assert any new
  // user-facing text.
  it('shows the empty-day message with no error UI when getSaleCreditsInDayObservable resolves with succeeded:false', async () => {
    vi.mocked(SaleCreditOfflineService).mockImplementation(
      () =>
        ({
          getSaleCreditsInDayObservable: vi.fn().mockReturnValue(creditsFailureResponse()),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <TodaySaleCreditsPage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(esMessages['SALE_CREDIT.NO_SALE_CREDIT_FOUND_IN_DAY']),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SaleCreditsPage (history) — behavioral (Angular parity)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders grouped credits loaded via filterSaleCredits(null, null, null, null)', async () => {
    const filter = vi.fn().mockResolvedValue({
      data: [makeCredit({ total: 40 })],
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    });
    vi.mocked(SaleCreditOfflineService).mockImplementation(
      () =>
        ({
          filterSaleCredits: filter,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <SaleCreditsPage />
      </Wrapper>,
    );

    // Header unpaid-count badge + total appear once the async filter resolves. The total
    // ($40) shows twice — the card header and the single day-panel — so match all.
    expect(await screen.findByText('(1)')).toBeInTheDocument();
    expect(screen.getAllByText('$40').length).toBeGreaterThan(0);
    // Angular parity: history always calls the filter with four nulls.
    expect(filter).toHaveBeenCalledWith(null, null, null, null);
  });

  // Parity fix (collapsible-panel-chevron-parity): the date-group panel header must render
  // the shared ChevronDownIcon and rotate it (rotate-180) iff the panel is expanded.
  it('renders a chevron on the date-panel header that rotates iff the panel is expanded', async () => {
    const filter = vi.fn().mockResolvedValue({
      data: [makeCredit({ total: 40, date: new Date('2024-03-15T10:00:00.000') })],
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    });
    vi.mocked(SaleCreditOfflineService).mockImplementation(
      () =>
        ({
          filterSaleCredits: filter,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <SaleCreditsPage />
      </Wrapper>,
    );

    const toggle = await screen.findByTestId('credit-date-panel-toggle-2024-03-15');
    const svgClass = () => toggle.querySelector('svg')?.getAttribute('class') ?? '';
    expect(toggle.querySelector('svg')).toBeInTheDocument();
    expect(svgClass()).not.toContain('rotate-180');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(svgClass()).toContain('rotate-180');
  });

  // Local-day grouping parity (orders.tsx local-grouping pattern): two late-evening credits on
  // the same LOCAL day must fall in ONE group under ITS local day key — at a negative UTC offset
  // the UTC key would have split them across two days.
  it('groups credits by LOCAL calendar day — two evening credits on the same local day fall in ONE group', async () => {
    const filter = vi.fn().mockResolvedValue({
      data: [
        makeCredit({ id: 'c1', total: 20, date: new Date(2024, 2, 15, 22, 0, 0) }),
        makeCredit({ id: 'c2', total: 30, date: new Date(2024, 2, 15, 23, 30, 0) }),
      ],
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    });
    vi.mocked(SaleCreditOfflineService).mockImplementation(
      () =>
        ({
          filterSaleCredits: filter,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <SaleCreditsPage />
      </Wrapper>,
    );

    expect(await screen.findByTestId('credit-date-panel-toggle-2024-03-15')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^credit-date-panel-toggle-/)).toHaveLength(1);
  });

  // response-envelope-nullability WU-D — BEHAVIORAL GAP, pinned not fixed.
  // filterSaleCredits succeeded:false silently swallows (no error state, no
  // error UI) — same idiom as the sibling silent guards on this branch. This
  // test pins the current behavior; it does not assert any new user-facing
  // text.
  it('shows the empty-history message with no error UI when filterSaleCredits resolves with succeeded:false', async () => {
    vi.mocked(SaleCreditOfflineService).mockImplementation(
      () =>
        ({
          filterSaleCredits: vi.fn().mockResolvedValue({
            data: null,
            succeeded: false,
            message: null,
            actionCode: null,
            errors: [{ code: 'E01', description: 'failed' }],
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <SaleCreditsPage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['SALE_CREDIT.NO_SALE_CREDIT_FOUND'])).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the DateRangeFilter and re-filters with an inclusive-end window via filterSaleCredits', async () => {
    const filter = vi.fn().mockResolvedValue({
      data: [],
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    });
    vi.mocked(SaleCreditOfflineService).mockImplementation(
      () =>
        ({
          filterSaleCredits: filter,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <SaleCreditsPage />
      </Wrapper>,
    );

    // The date filter renders above the history list; the mount call stays all-nulls.
    expect(screen.getByTestId('date-range-filter-input')).toBeInTheDocument();
    await waitFor(() => expect(filter).toHaveBeenCalledWith(null, null, null, null));

    // Pick 3/2/2026 – 17/9/2028 through the popover and apply via the lupa.
    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.change(screen.getByTestId('date-range-filter-start'), {
      target: { value: '2026-02-03' },
    });
    fireEvent.change(screen.getByTestId('date-range-filter-end'), {
      target: { value: '2028-09-17' },
    });
    fireEvent.click(screen.getByTestId('date-range-filter-select'));
    expect(screen.getByTestId('date-range-filter-input')).toHaveValue('3/2/2026 - 17/9/2028');
    fireEvent.click(screen.getByTestId('date-range-filter-button'));

    // The service's endDate is EXCLUSIVE — the view sails the end window to the
    // next-day midnight so the selected end day is included.
    await waitFor(() =>
      expect(filter).toHaveBeenLastCalledWith(
        null,
        null,
        startOfDay(new Date(2026, 1, 3)),
        startOfDay(addDays(new Date(2028, 8, 17), 1)),
      ),
    );
  });
});

describe('SaleCreditsPage (multi-store mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore the default (non-admin) auth shape the sibling describes assume.
    authStoreState.user = { selectedStoreId: 's1' };
  });

  it('renders the store select + DateRangeFilter and NO outside-panels totals row', async () => {
    // OwnerAdmin + MultiStores module + 2 active stores → the REAL gate enables.
    authStoreState.user = {
      selectedStoreId: 's1',
      isOwnerAdmin: true,
      storeModuleIds: [EModules.MultiStores],
      storeList: [
        { id: 's1', name: 'Tienda A', isActive: true },
        { id: 's2', name: 'Tienda B', isActive: true },
      ],
    };
    const filter = vi.fn().mockResolvedValue(creditsResponse([]));
    vi.mocked(SaleCreditOfflineService).mockImplementation(
      () =>
        ({
          filterSaleCredits: filter,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <SaleCreditsPage />
      </Wrapper>,
    );

    expect(await screen.findByTestId('multistore-select')).toBeInTheDocument();
    // The outside-panels "Créditos" totals row was removed (user decision).
    expect(screen.queryByTestId('multistore-totals')).not.toBeInTheDocument();
    expect(screen.getByTestId('date-range-filter-input')).toBeInTheDocument();
  });

  it('filters each store panel by the applied range: in-range credits kept, out-of-range → NO_CREDITS_IN_RANGE, no data → NO_LOCAL_DATA', async () => {
    authStoreState.user = {
      selectedStoreId: 's1',
      isOwnerAdmin: true,
      storeModuleIds: [EModules.MultiStores],
      storeList: [
        { id: 's1', name: 'Tienda A', isActive: true },
        { id: 's2', name: 'Tienda B', isActive: true },
        { id: 's3', name: 'Tienda C', isActive: true },
      ],
    };
    // s1 has one credit INSIDE the range (Mar) + one OUTSIDE (Jun); s2 only an
    // OUTSIDE one; s3 no local data at all.
    vi.mocked(readStoreSaleCredits).mockImplementation((storeId) => {
      if (storeId === 's1') {
        return [
          makeCredit({ id: 'c1', date: new Date(2026, 2, 15, 10, 0, 0) }),
          makeCredit({ id: 'c2', date: new Date(2026, 5, 1, 10, 0, 0) }),
        ];
      }
      if (storeId === 's2') {
        return [makeCredit({ id: 'c3', date: new Date(2026, 5, 1, 10, 0, 0) })];
      }
      return [];
    });
    const filter = vi.fn().mockResolvedValue(creditsResponse([]));
    vi.mocked(SaleCreditOfflineService).mockImplementation(
      () =>
        ({
          filterSaleCredits: filter,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
    );

    render(
      <Wrapper>
        <SaleCreditsPage />
      </Wrapper>,
    );

    await screen.findByTestId('multistore-select');
    fireEvent.click(screen.getByTestId('multistore-panel-toggle-s1'));
    fireEvent.click(screen.getByTestId('multistore-panel-toggle-s2'));
    fireEvent.click(screen.getByTestId('multistore-panel-toggle-s3'));

    // BEFORE applying a range: all local data is visible by default (s1's
    // June credit included; s2 renders its June credit too).
    await screen.findByTestId('multistore-credit-date-toggle-s1-2026-06-01');
    expect(screen.getByTestId('multistore-credit-date-toggle-s2-2026-06-01')).toBeInTheDocument();

    // Pick 2026-03-01 → 2026-03-31 and apply it through the lupa.
    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.change(screen.getByTestId('date-range-filter-start'), {
      target: { value: '2026-03-01' },
    });
    fireEvent.change(screen.getByTestId('date-range-filter-end'), {
      target: { value: '2026-03-31' },
    });
    fireEvent.click(screen.getByTestId('date-range-filter-select'));
    fireEvent.click(screen.getByTestId('date-range-filter-button'));

    // s1 keeps only the in-range day; the out-of-range one is filtered out.
    await waitFor(() => {
      expect(
        screen.getByTestId('multistore-credit-date-toggle-s1-2026-03-15'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId('multistore-credit-date-toggle-s1-2026-06-01')).toBeNull();
    // s2 had local data but nothing in range; s3 never had local data.
    expect(screen.getByText(esMessages['MULTISTORE.NO_CREDITS_IN_RANGE'])).toBeInTheDocument();
    expect(screen.getByText(esMessages['MULTISTORE.NO_LOCAL_DATA'])).toBeInTheDocument();
  });
});
