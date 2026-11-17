import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { EFeatures } from '@store-mgmt/domain';
import type {
  BaseResponseModel,
  Store,
  StorePaymentHistoryItem,
  StorePaymentHistoryPage,
} from '@store-mgmt/domain';

// ─── loader mock (Req: Route Gating — must be resellerFeatureLoader) ─────────

const mockResellerFeatureLoader = vi.fn((_featureIds: number[]) => vi.fn().mockResolvedValue(null));
vi.mock('~/auth/routes/loaders', () => ({
  resellerFeatureLoader: (featureIds: number[]) => mockResellerFeatureLoader(featureIds),
}));

// ─── storeHttpService mock ────────────────────────────────────────────────────

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    listStores: vi.fn(),
    getStorePayments: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── fixtures ────────────────────────────────────────────────────────────────

/** U+00A0: the thousands separator every money string in this app uses. */
const NBSP = '\u00A0';

function makeItem(overrides: Partial<StorePaymentHistoryItem> = {}): StorePaymentHistoryItem {
  return {
    storeId: 's1',
    storeName: 'Store One',
    ownerName: 'Owner One',
    paidDate: '2026-11-01T00:00:00Z',
    paymentBeforeDate: '2026-12-01T00:00:00Z',
    amount: 25,
    commission: 3,
    currency: 'USD',
    exchangeRate: null,
    amountOwedUsd: null,
    ...overrides,
  };
}

function makePage(overrides: Partial<StorePaymentHistoryPage> = {}): StorePaymentHistoryPage {
  return {
    currency: 'USD',
    items: [makeItem()],
    total: 1,
    page: 1,
    pageSize: 50,
    totalAmount: 300,
    totalCommission: 36,
    usdCount: 12,
    cupCount: 88,
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

/**
 * Reads the payment service object out of the module registry. It does NOT reset modules:
 * re-imports return the SAME mocked singleton every test, whose call history is wiped by the
 * global `beforeEach` (`vi.clearAllMocks`). Implementations set here therefore survive into the
 * test that sets them, and only the loader-wiring test (which calls `vi.resetModules()` itself)
 * hands later readers a fresh factory instance.
 */
async function httpMock() {
  const mod = await import('~/management/stores/lib/services/store-http-service');
  return mod.storeHttpService;
}

/** Success envelope, matching `BaseResponseModel<T>`'s `succeeded: true` branch. */
function ok<T>(data: T): BaseResponseModel<T> {
  return { succeeded: true, data, message: '', actionCode: 0, errors: [] };
}

/** Failure envelope, matching `BaseResponseModel<T>`'s `succeeded: false` branch. */
function failed(): BaseResponseModel<StorePaymentHistoryPage> {
  return {
    succeeded: false,
    data: null,
    message: null,
    actionCode: null,
    errors: [{ code: 'E01', description: 'failed' }],
  };
}

/** A promise whose settlement the test controls, to force an out-of-order response. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * Lets a resolved mock promise's continuation run (inside `act`, so React flushes the render it
 * schedules) before the assertions read the DOM.
 */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mockStores(stores: Partial<Store>[] = [{ id: 's1', name: 'Store One' }]) {
  const svc = await httpMock();
  vi.mocked(svc.listStores).mockResolvedValue({
    succeeded: true,
    data: stores as Store[],
    message: '',
    actionCode: 0,
    errors: [],
  });
  return svc;
}

async function mockPages(pages: StorePaymentHistoryPage[]) {
  const svc = await mockStores();
  const getStorePayments = vi.mocked(svc.getStorePayments);
  getStorePayments.mockReset();
  for (const page of pages) {
    getStorePayments.mockResolvedValueOnce({
      succeeded: true,
      data: page,
      message: '',
      actionCode: 0,
      errors: [],
    });
  }
  getStorePayments.mockResolvedValue({
    succeeded: true,
    data: pages.at(-1) as StorePaymentHistoryPage,
    message: '',
    actionCode: 0,
    errors: [],
  });
  return svc;
}

async function renderPage() {
  const { default: StorePaymentsHistoryPage } = await import('../store-payments-history');
  render(
    <Wrapper>
      <StorePaymentsHistoryPage />
    </Wrapper>,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('StorePaymentsHistoryPage — exports', () => {
  it('exports a named clientLoader', async () => {
    const mod = await import('../store-payments-history');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports StorePaymentsHistoryPage as default export', async () => {
    const mod = await import('../store-payments-history');
    expect(typeof mod.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Req S1 — Route Gating — wiring-only (gate logic covered by loaders.test.ts)
// ═══════════════════════════════════════════════════════════════════════════════

describe('StorePaymentsHistoryPage — route gating wiring', () => {
  it('builds clientLoader via resellerFeatureLoader([EFeatures.StorePayment]), verified against a genuinely fresh module instance', async () => {
    const before = await import('../store-payments-history');

    vi.resetModules();
    const after = await import('../store-payments-history');

    expect(after).not.toBe(before);
    expect(mockResellerFeatureLoader).toHaveBeenCalled();

    // The gating contract is asserted with TWO oracles, deliberately. Two reviews of this file
    // disagreed about which single oracle is right, and both of them were right about the other
    // one's failure mode — so neither half below may be "simplified" away.
    //
    //  1. `EFeatures.StorePayment` — the symbol the component actually passes. It ties the test
    //     to the domain constant instead of duplicating it, and it is the half that fails if the
    //     gate is ever repointed to a different feature: the loader would receive another
    //     member and the `toHaveBeenCalledWith` assertion below would no longer match.
    //  2. `91` — the numeric contract of that enum member (mirror of the backend's
    //     `FeatureType.StorePayment = 91`). It is the half that fails on a SILENT RENUMBERING of
    //     `EFeatures.StorePayment`: symbol-to-symbol comparison keeps both sides in sync and
    //     would stay green, while the feature id the backend understands would have moved.
    //
    // Repointing the gate breaks (1); renumbering the enum breaks (2). Keep both.
    expect(EFeatures.StorePayment).toBe(91);
    expect(mockResellerFeatureLoader).toHaveBeenCalledWith([EFeatures.StorePayment]);

    const lastCallResult = mockResellerFeatureLoader.mock.results.at(-1)?.value;
    expect(after.clientLoader).toBe(lastCallResult);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Req S4 / S5 — one currency per tab; filters; page reset
// ═══════════════════════════════════════════════════════════════════════════════

describe('StorePaymentsHistoryPage — request params', () => {
  it('requests the USD tab on page 1 with no filters on mount', async () => {
    const svc = await mockPages([makePage()]);
    await renderPage();

    await waitFor(() => {
      expect(svc.getStorePayments).toHaveBeenCalledTimes(1);
    });
    expect(svc.getStorePayments).toHaveBeenCalledWith({ currency: 'USD', page: 1 });
  });

  it('switching to the CUP tab requests currency CUP on page 1 again', async () => {
    const svc = await mockPages([makePage()]);
    await renderPage();
    await waitFor(() => expect(svc.getStorePayments).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('history-tab-cup'));

    await waitFor(() => {
      expect(svc.getStorePayments).toHaveBeenLastCalledWith({ currency: 'CUP', page: 1 });
    });
  });

  it('sends desde/hasta/store combined with AND', async () => {
    const svc = await mockPages([makePage()]);
    await renderPage();
    await waitFor(() => expect(svc.getStorePayments).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('history-from'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByTestId('history-to'), { target: { value: '2026-11-30' } });
    await waitFor(() => expect(screen.getByTestId('history-store').querySelectorAll('option').length).toBe(2));
    fireEvent.change(screen.getByTestId('history-store'), { target: { value: 's1' } });

    await waitFor(() => {
      expect(svc.getStorePayments).toHaveBeenLastCalledWith({
        currency: 'USD',
        page: 1,
        from: '2026-11-01',
        to: '2026-11-30',
        storeId: 's1',
      });
    });
  });

  it('a filter change resets the page to 1', async () => {
    const svc = await mockPages([
      makePage({ total: 120, items: [makeItem()] }),
      makePage({ total: 120, items: [makeItem({ storeName: 'Store Two' })] }),
    ]);
    await renderPage();
    await waitFor(() => expect(svc.getStorePayments).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: esMessages['BILLING.HISTORY.NEXT_PAGE'] }));
    await waitFor(() => {
      expect(svc.getStorePayments).toHaveBeenLastCalledWith({ currency: 'USD', page: 2 });
    });

    fireEvent.change(screen.getByTestId('history-from'), { target: { value: '2026-11-01' } });

    await waitFor(() => {
      expect(svc.getStorePayments).toHaveBeenLastCalledWith({
        currency: 'USD',
        page: 1,
        from: '2026-11-01',
      });
    });
  });

  it('a tab change from page 2 resets to page 1', async () => {
    const svc = await mockPages([makePage({ total: 120 }), makePage({ total: 120 })]);
    await renderPage();
    await waitFor(() => expect(svc.getStorePayments).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: esMessages['BILLING.HISTORY.NEXT_PAGE'] }));
    await waitFor(() => {
      expect(svc.getStorePayments).toHaveBeenLastCalledWith({ currency: 'USD', page: 2 });
    });

    fireEvent.click(screen.getByTestId('history-tab-cup'));

    await waitFor(() => {
      expect(svc.getStorePayments).toHaveBeenLastCalledWith({ currency: 'CUP', page: 1 });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Req S6 — tab labels carry the counts the server returned
// ═══════════════════════════════════════════════════════════════════════════════

describe('StorePaymentsHistoryPage — tab counts', () => {
  it('renders USD (12) and CUP (88) from usdCount/cupCount', async () => {
    await mockPages([makePage({ usdCount: 12, cupCount: 88 })]);
    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('history-tab-usd')).toHaveTextContent('USD (12)');
    });
    expect(screen.getByTestId('history-tab-cup')).toHaveTextContent('CUP (88)');
  });

  it('renders different counts for a differently-shaped response (triangulation)', async () => {
    await mockPages([makePage({ usdCount: 1, cupCount: 3 })]);
    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('history-tab-usd')).toHaveTextContent('USD (1)');
    });
    expect(screen.getByTestId('history-tab-cup')).toHaveTextContent('CUP (3)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Req S7 — one money value per row, explicit currency suffix
// ═══════════════════════════════════════════════════════════════════════════════

describe('StorePaymentsHistoryPage — table content', () => {
  it('renders the USD row: store, owner, both dates and amount/commission in USD', async () => {
    await mockPages([
      makePage({
        currency: 'USD',
        items: [makeItem({ amount: 12500, commission: 2500, currency: 'USD' })],
      }),
    ]);
    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Store One')).toBeInTheDocument();
    expect(table.getByText('Owner One')).toBeInTheDocument();
    expect(table.getByText('01/11/2026')).toBeInTheDocument();
    expect(table.getByText('01/12/2026')).toBeInTheDocument();

    const amount = screen.getByTestId('history-amount-0');
    const commission = screen.getByTestId('history-commission-0');
    // Raw textContent (NOT toHaveTextContent, which normalizes U+00A0 to a plain space):
    // grouped with a NO-BREAK SPACE and suffixed with the currency — never the app-wide `$`.
    expect(amount.textContent).toBe(`12${NBSP}500 USD`);
    expect(commission.textContent).toBe(`2${NBSP}500 USD`);
    expect(amount.textContent).not.toContain('$');
  });

  it('renders the CUP row with the CUP amount and CUP commission', async () => {
    await mockPages([
      makePage({
        currency: 'CUP',
        items: [makeItem({ currency: 'CUP', amount: 12500, commission: 1250 })],
      }),
    ]);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('history-tab-cup')).toHaveTextContent('CUP (88)'));

    fireEvent.click(screen.getByTestId('history-tab-cup'));

    await waitFor(() => {
      expect(screen.getByTestId('history-amount-0').textContent).toBe(`12${NBSP}500 CUP`);
    });
    expect(screen.getByTestId('history-commission-0').textContent).toBe(`1${NBSP}250 CUP`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Req S8 — the `i` explains a CUP row (touch + keyboard + screen reader)
// ═══════════════════════════════════════════════════════════════════════════════

describe('StorePaymentsHistoryPage — CUP information control', () => {
  async function renderCupRow() {
    await mockPages([
      makePage({
        currency: 'CUP',
        items: [
          makeItem({
            currency: 'CUP',
            amount: 12500,
            commission: 1250,
            exchangeRate: 50,
            amountOwedUsd: 25,
          }),
        ],
      }),
    ]);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('history-tab-cup')).toHaveTextContent('CUP (88)'));
    fireEvent.click(screen.getByTestId('history-tab-cup'));
    await waitFor(() => expect(screen.getByTestId('history-amount-0')).toHaveTextContent('CUP'));
  }

  it('is a real button with an accessible name and aria-expanded, collapsed by default', async () => {
    await renderCupRow();

    const info = screen.getByTestId('history-info-0');
    expect(info.tagName).toBe('BUTTON');
    expect(info).toHaveAttribute('type', 'button');
    expect(info).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Detalle del cobro de Store One' })).toBe(info);
  });

  it('clicking reveals the rate and the amount owed in USD, and clicking again hides it', async () => {
    await renderCupRow();

    fireEvent.click(screen.getByTestId('history-info-0'));

    expect(screen.getByTestId('history-info-0')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('history-detail-0')).toHaveTextContent(
      'Tasa: 50 CUP/USD · Debía: 25 USD',
    );

    fireEvent.click(screen.getByTestId('history-info-0'));

    expect(screen.getByTestId('history-info-0')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('history-detail-0')).toBeNull();
  });

  it('is reachable and activatable from the keyboard (Enter and Space)', async () => {
    const user = userEvent.setup();
    await renderCupRow();

    const info = screen.getByTestId('history-info-0');
    info.focus();
    expect(document.activeElement).toBe(info);

    await user.keyboard('{Enter}');
    expect(screen.getByTestId('history-detail-0')).toBeInTheDocument();

    await user.keyboard(' ');
    expect(screen.queryByTestId('history-detail-0')).toBeNull();
  });

  it('USD rows render no information control at all', async () => {
    await mockPages([makePage({ currency: 'USD', items: [makeItem({ currency: 'USD' })] })]);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('history-amount-0')).toBeInTheDocument());

    expect(screen.queryByTestId('history-info-0')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Detalle del cobro de Store One' })).toBeNull();
  });

  it('a CUP row with nothing to disclose (null rate or null owed USD) renders no dead control', async () => {
    await mockPages([
      makePage({
        currency: 'CUP',
        items: [
          makeItem({
            currency: 'CUP',
            amount: 12500,
            commission: 1250,
            exchangeRate: null,
            amountOwedUsd: 25,
          }),
          makeItem({
            storeId: 's2',
            storeName: 'Store Two',
            currency: 'CUP',
            amount: 100,
            commission: 10,
            exchangeRate: 50,
            amountOwedUsd: null,
          }),
        ],
        total: 2,
      }),
    ]);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('history-tab-cup')).toHaveTextContent('CUP (88)'));
    fireEvent.click(screen.getByTestId('history-tab-cup'));
    await waitFor(() => expect(screen.getByTestId('history-amount-0')).toHaveTextContent('CUP'));

    // No focusable button that expands into nothing: the `i` exists only when the
    // detail line it reveals can actually be rendered (S8).
    expect(screen.queryByTestId('history-info-0')).toBeNull();
    expect(screen.queryByTestId('history-info-1')).toBeNull();
    expect(screen.queryByTestId('history-detail-0')).toBeNull();
    expect(screen.queryByTestId('history-detail-1')).toBeNull();

    // The rows themselves are still on screen — the money is not what was removed.
    expect(screen.getByTestId('history-amount-0')).toBeInTheDocument();
    expect(screen.getByTestId('history-amount-1')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Req S9 — footer totals come from the server, never from the visible rows
// ═══════════════════════════════════════════════════════════════════════════════

describe('StorePaymentsHistoryPage — footer totals', () => {
  it('renders totalAmount/totalCommission from the response even when they differ from the visible rows', async () => {
    // One visible row of 999 / 111, server totals 300 / 36 over the WHOLE filter.
    // Any client-side reduce/sum would render 999 / 111 instead.
    await mockPages([
      makePage({
        currency: 'USD',
        items: [makeItem({ amount: 999, commission: 111 })],
        totalAmount: 300,
        totalCommission: 36,
      }),
    ]);
    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('history-total-amount')).toHaveTextContent('300 USD');
    });
    expect(screen.getByTestId('history-total-commission')).toHaveTextContent('36 USD');
    expect(screen.getByTestId('history-total-amount')).not.toHaveTextContent('999');
    expect(screen.getByTestId('history-amount-0')).toHaveTextContent('999 USD');
  });

  it('renders the CUP totals in CUP with the grouped thousands', async () => {
    await mockPages([
      makePage({
        currency: 'CUP',
        items: [makeItem({ currency: 'CUP', amount: 125, commission: 12 })],
        totalAmount: 12500,
        totalCommission: 1250,
      }),
    ]);
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('history-tab-cup')).toHaveTextContent('CUP (88)'));

    fireEvent.click(screen.getByTestId('history-tab-cup'));

    await waitFor(() => {
      expect(screen.getByTestId('history-total-amount').textContent).toBe(`12${NBSP}500 CUP`);
    });
    expect(screen.getByTestId('history-total-commission').textContent).toBe(`1${NBSP}250 CUP`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Req S5 — pagination (prev/next + current page, page size fixed by the server)
// ═══════════════════════════════════════════════════════════════════════════════

describe('StorePaymentsHistoryPage — pagination', () => {
  it('shows the current page and walks with prev/next', async () => {
    const svc = await mockPages([makePage({ total: 120 }), makePage({ total: 120 })]);
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: esMessages['BILLING.HISTORY.PREV_PAGE'] })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: esMessages['BILLING.HISTORY.NEXT_PAGE'] }));

    await waitFor(() => {
      expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
    });
    expect(svc.getStorePayments).toHaveBeenLastCalledWith({ currency: 'USD', page: 2 });
    expect(screen.getByRole('button', { name: esMessages['BILLING.HISTORY.PREV_PAGE'] })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: esMessages['BILLING.HISTORY.PREV_PAGE'] }));

    await waitFor(() => {
      expect(svc.getStorePayments).toHaveBeenLastCalledWith({ currency: 'USD', page: 1 });
    });
  });

  it('hides the pagination control when every row fits one page', async () => {
    await mockPages([makePage({ total: 3, pageSize: 50 })]);
    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    expect(within(screen.getByRole('table')).getByText('Store One')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: esMessages['BILLING.HISTORY.NEXT_PAGE'] })).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Req S12 — states use i18n keys, never a hardcoded Spanish string
// ═══════════════════════════════════════════════════════════════════════════════

describe('StorePaymentsHistoryPage — empty state', () => {
  it('shows the empty-state message when there are no rows', async () => {
    await mockPages([makePage({ items: [], total: 0, totalAmount: 0, totalCommission: 0 })]);
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText(esMessages['BILLING.HISTORY.EMPTY_STATE'])).toBeInTheDocument();
    });
    expect(screen.queryByText('BILLING.HISTORY.EMPTY_STATE')).toBeNull();
  });
});

describe('StorePaymentsHistoryPage — error state', () => {
  it('shows BILLING.HISTORY.ERROR when the response is succeeded:false', async () => {
    const svc = await mockStores();
    vi.mocked(svc.getStorePayments).mockResolvedValue({
      succeeded: false,
      data: null,
      message: null,
      actionCode: null,
      errors: [{ code: 'E01', description: 'failed' }],
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(esMessages['BILLING.HISTORY.ERROR']);
    });
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows BILLING.HISTORY.ERROR when the call rejects', async () => {
    const svc = await mockStores();
    vi.mocked(svc.getStorePayments).mockRejectedValue(new Error('boom'));

    await renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(esMessages['BILLING.HISTORY.ERROR']);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// A FAILED RE-REQUEST leaves exactly ONE truthful state: no rows, no totals, no
// pagination from the filter the user already left — only the error (money truth).
// ═══════════════════════════════════════════════════════════════════════════════

describe('StorePaymentsHistoryPage — a failed re-request clears the previous filter’s data', () => {
  /** Succeeds once with USD rows + server totals + pagination, then fails every later call. */
  async function succeedOnceThenFailEveryLaterCall() {
    const svc = await mockStores();
    const getStorePayments = vi.mocked(svc.getStorePayments);
    getStorePayments.mockReset();
    getStorePayments.mockResolvedValueOnce(
      ok(
        makePage({
          currency: 'USD',
          items: [makeItem({ storeName: 'Store Paid Once', amount: 999, commission: 111 })],
          total: 120,
          totalAmount: 300,
          totalCommission: 36,
        }),
      ),
    );

    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('history-total-amount')).toHaveTextContent('300 USD');
    });
    // Precondition: the previous filter really is on screen, pagination included.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: esMessages['BILLING.HISTORY.NEXT_PAGE'] }),
    ).toBeInTheDocument();
    return getStorePayments;
  }

  /** Nothing from the abandoned filter may survive: rows, totals, pagination, store names. */
  function expectNoTraceOfPreviousFilter() {
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId('history-amount-0')).toBeNull();
    expect(screen.queryByTestId('history-commission-0')).toBeNull();
    expect(screen.queryByTestId('history-total-amount')).toBeNull();
    expect(screen.queryByTestId('history-total-commission')).toBeNull();
    expect(screen.queryByText('Store Paid Once')).toBeNull();
    expect(
      screen.queryByRole('button', { name: esMessages['BILLING.HISTORY.NEXT_PAGE'] }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: esMessages['BILLING.HISTORY.PREV_PAGE'] }),
    ).toBeNull();
    // Error view and empty state stay mutually exclusive.
    expect(screen.queryByText(esMessages['BILLING.HISTORY.EMPTY_STATE'])).toBeNull();
  }

  it('clears them when the tab change returns succeeded:false', async () => {
    const getStorePayments = await succeedOnceThenFailEveryLaterCall();
    getStorePayments.mockResolvedValue(failed());

    fireEvent.click(screen.getByTestId('history-tab-cup'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(esMessages['BILLING.HISTORY.ERROR']);
    });
    expect(getStorePayments).toHaveBeenLastCalledWith({ currency: 'CUP', page: 1 });
    expectNoTraceOfPreviousFilter();
  });

  it('clears them when the tab change REJECTS (network failure path)', async () => {
    const getStorePayments = await succeedOnceThenFailEveryLaterCall();
    getStorePayments.mockRejectedValue(new Error('boom'));

    fireEvent.click(screen.getByTestId('history-tab-cup'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(esMessages['BILLING.HISTORY.ERROR']);
    });
    expectNoTraceOfPreviousFilter();
  });

  it('clears them when a PAGE change fails, not just a tab change', async () => {
    const getStorePayments = await succeedOnceThenFailEveryLaterCall();
    getStorePayments.mockResolvedValue(failed());

    fireEvent.click(screen.getByRole('button', { name: esMessages['BILLING.HISTORY.NEXT_PAGE'] }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(esMessages['BILLING.HISTORY.ERROR']);
    });
    expect(getStorePayments).toHaveBeenLastCalledWith({ currency: 'USD', page: 2 });
    expectNoTraceOfPreviousFilter();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Request race: only the response of the LATEST request may touch state
// ═══════════════════════════════════════════════════════════════════════════════

describe('StorePaymentsHistoryPage — out-of-order responses', () => {
  it('discards a slow earlier response that lands after the newer one', async () => {
    const svc = await mockStores();
    const getStorePayments = vi.mocked(svc.getStorePayments);
    getStorePayments.mockReset();

    const slowUsd = deferred<BaseResponseModel<StorePaymentHistoryPage>>();
    const fastCup = deferred<BaseResponseModel<StorePaymentHistoryPage>>();
    getStorePayments.mockReturnValueOnce(slowUsd.promise).mockReturnValueOnce(fastCup.promise);

    await renderPage();
    await waitFor(() => expect(getStorePayments).toHaveBeenCalledTimes(1));
    // Precondition: the store directory read landed, so the store filter is populated before
    // anything is clicked (the same precondition other cases in this file pin).
    await waitFor(() =>
      expect(screen.getByTestId('history-store').querySelectorAll('option').length).toBe(2),
    );

    fireEvent.click(screen.getByTestId('history-tab-cup'));
    await waitFor(() => expect(getStorePayments).toHaveBeenCalledTimes(2));
    expect(getStorePayments).toHaveBeenLastCalledWith({ currency: 'CUP', page: 1 });

    // The NEWER request (CUP) answers first and owns the screen.
    fastCup.resolve(
      ok(
        makePage({
          currency: 'CUP',
          items: [makeItem({ currency: 'CUP', amount: 12500, commission: 1250 })],
          totalAmount: 12500,
          totalCommission: 1250,
        }),
      ),
    );
    await settle();
    expect(screen.getByTestId('history-amount-0').textContent).toBe(`12${NBSP}500 CUP`);
    expect(screen.getByTestId('history-total-amount').textContent).toBe(`12${NBSP}500 CUP`);

    // The STALE response for the abandoned USD tab lands afterwards.
    slowUsd.resolve(
      ok(
        makePage({
          currency: 'USD',
          items: [makeItem({ currency: 'USD', amount: 999, commission: 111 })],
          totalAmount: 300,
          totalCommission: 36,
        }),
      ),
    );
    await settle();

    // The screen still shows the CUP answer: no USD figure can be read under the CUP tab.
    expect(screen.getByTestId('history-amount-0').textContent).toBe(`12${NBSP}500 CUP`);
    expect(screen.getByTestId('history-total-amount').textContent).toBe(`12${NBSP}500 CUP`);
    expect(screen.getByTestId('history-commission-0').textContent).toBe(`1${NBSP}250 CUP`);
    expect(screen.queryByText('999 USD')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('discards a stale FAILURE so it cannot blank a newer successful answer', async () => {
    const svc = await mockStores();
    const getStorePayments = vi.mocked(svc.getStorePayments);
    getStorePayments.mockReset();

    const slowUsd = deferred<BaseResponseModel<StorePaymentHistoryPage>>();
    const fastCup = deferred<BaseResponseModel<StorePaymentHistoryPage>>();
    getStorePayments.mockReturnValueOnce(slowUsd.promise).mockReturnValueOnce(fastCup.promise);

    await renderPage();
    await waitFor(() => expect(getStorePayments).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('history-store').querySelectorAll('option').length).toBe(2),
    );

    fireEvent.click(screen.getByTestId('history-tab-cup'));
    await waitFor(() => expect(getStorePayments).toHaveBeenCalledTimes(2));

    fastCup.resolve(
      ok(
        makePage({
          currency: 'CUP',
          items: [makeItem({ currency: 'CUP', amount: 12500, commission: 1250 })],
        }),
      ),
    );
    await settle();
    expect(screen.getByTestId('history-amount-0').textContent).toBe(`12${NBSP}500 CUP`);

    // The abandoned request fails after the newer one already succeeded.
    slowUsd.resolve(failed());
    await settle();

    expect(screen.getByTestId('history-amount-0').textContent).toBe(`12${NBSP}500 CUP`);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
