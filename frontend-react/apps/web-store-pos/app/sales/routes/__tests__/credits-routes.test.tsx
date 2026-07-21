import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { PaymentType, SaleCreditErrors } from '@store-mgmt/domain';
import type { SaleCredit } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';

// Category-C envelope helper: the Observable/filter siblings resolve BaseResponseModel<SaleCredit[]>.
function creditsResponse(credits: SaleCredit[] = []) {
  return Promise.resolve({ data: credits, succeeded: true, message: '', actionCode: 200, errors: [] });
}

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: { selectedStoreId: 's1' }, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) =>
    typeof selector === 'function' ? selector(state) : state,
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
    // ($40.00) shows twice — the card header and the single day-panel — so match all.
    expect(await screen.findByText('(1)')).toBeInTheDocument();
    expect(screen.getAllByText('$40.00').length).toBeGreaterThan(0);
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
});
