import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import type {
  Store,
  StorePaymentCurrency,
  StorePaymentHistoryItem,
  StorePaymentHistoryPage,
} from '@store-mgmt/domain';
import { resellerFeatureLoader } from '~/auth/routes/loaders';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import type { StorePaymentHistoryQuery } from '~/management/stores/lib/services/store-http-service';
import { Button } from '~/shared/components/ui/button';
import { formatDateOnly } from '~/shared/lib/date-utils';
import { formatMoneyWithCurrency } from '~/shared/lib/format-currency';
import { httpErrorKey } from '~/shared/lib/http/http-error';

// Req S1: Route Gating is Reseller Feature Loader, Not Admin Feature Loader — mirrors the
// backend [HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StorePaymentAdmin)]
// (roles {SuperAdmin, ReSeller} + FeatureType.StorePayment = 91). Same gate as
// collections.tsx / reseller-commissions.tsx; the gate lives HERE, not in routes.ts.
export const clientLoader = resellerFeatureLoader([EFeatures.StorePayment]);

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

/**
 * The `i` control's visible focus ring: the only affordance telling a keyboard user where
 * they are, so it is part of the control's contract (S8), not decoration.
 */
const INFO_BUTTON_CLASSES =
  'inline-flex h-6 w-6 items-center justify-center rounded-full border border-border text-xs font-semibold text-text-muted hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1';

/** The two tabs. A payment belongs to exactly ONE of them (S4). */
type HistoryTab = StorePaymentCurrency;

const TAB_ID: Record<HistoryTab, string> = {
  USD: 'history-tab-usd',
  CUP: 'history-tab-cup',
};

/**
 * A `DateOnly` reaches the client as an ISO instant, so the calendar day is the DAY PART of
 * that string. Slicing it before formatting keeps the displayed date independent of the
 * viewer's timezone: `formatLocalDate(new Date(iso))` would show the previous day for every
 * viewer west of UTC (the trap documented in date-utils.ts).
 */
function formatPaymentDay(value: string | null): string {
  return formatDateOnly(value === null ? null : value.slice(0, 10));
}

/**
 * Registered store payments ("cobros realizados") — read-only projection of the backend's
 * paged response (S13). Every number on screen (row amounts, footer totals, tab counts)
 * arrives from the server: the client renders, it never adds, converts or multiplies (S9).
 */
export function StorePaymentsHistoryPage() {
  const intl = useIntl();

  const [tab, setTab] = useState<HistoryTab>('USD');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [storeId, setStoreId] = useState('');
  const [page, setPage] = useState(1);

  const [stores, setStores] = useState<Store[]>([]);
  const [data, setData] = useState<StorePaymentHistoryPage | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // The store filter is a convenience over a scope the SERVER already enforces, so a failed
  // directory read leaves the list usable instead of blanking the screen.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await storeHttpService.listStores();
        if (active && result.succeeded) setStores(result.data);
      } catch {
        // Intentionally silent: the payments list below is the page's real content.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /**
   * Every tab / filter / page change starts a new request, so responses can land out of order.
   * Only the response of the LATEST request may touch state: a slow earlier answer for a filter
   * the user already left must never overwrite the current one. Same discipline as the `active`
   * flag guarding the directory read above.
   */
  const latestRequestRef = useRef(0);

  const load = useCallback(async () => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;

    const query: StorePaymentHistoryQuery = { currency: tab, page };
    if (from !== '') query.from = from;
    if (to !== '') query.to = to;
    if (storeId !== '') query.storeId = storeId;

    try {
      const result = await storeHttpService.getStorePayments(query);
      if (requestId !== latestRequestRef.current) return;
      if (!result.succeeded) {
        // ONE truthful state per failure: the previous filter's rows, totals and pagination
        // are dropped with `data`, so no figure can be read under a tab it does not belong to.
        setData(null);
        setError(intl.formatMessage({ id: 'BILLING.HISTORY.ERROR' }));
        return;
      }
      setData(result.data);
      setExpandedRow(null);
      setError(undefined);
    } catch (err) {
      if (requestId !== latestRequestRef.current) return;
      setData(null);
      setError(intl.formatMessage({ id: httpErrorKey(err, 'BILLING.HISTORY.ERROR') }));
    }
  }, [tab, from, to, storeId, page, intl]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Changing tab or ANY filter resets the page to 1 (S5) — the result set changed. */
  function selectTab(next: HistoryTab) {
    if (next === tab) return;
    setExpandedRow(null);
    setPage(1);
    setTab(next);
  }

  function changeFilter(setter: (value: string) => void, value: string) {
    setExpandedRow(null);
    setPage(1);
    setter(value);
  }

  const money = (amount: number, currency: StorePaymentCurrency) =>
    formatMoneyWithCurrency(amount, currency);

  const items = data === null ? [] : data.items;
  const isCupTab = tab === 'CUP';
  const lastPage = data === null ? 1 : Math.max(1, Math.ceil(data.total / data.pageSize));

  const tabLabel = (currency: HistoryTab, count: number | undefined) => {
    const name = intl.formatMessage({
      id: currency === 'USD' ? 'BILLING.HISTORY.TAB_USD' : 'BILLING.HISTORY.TAB_CUP',
    });
    return count === undefined ? name : `${name} (${count})`;
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-text sm:text-2xl">
          {intl.formatMessage({ id: 'BILLING.HISTORY.TITLE' })}
        </h1>
      </header>

      <div role="tablist" className="flex gap-2">
        {(['USD', 'CUP'] as const).map((currency) => {
          const selected = tab === currency;
          return (
            <button
              key={currency}
              type="button"
              role="tab"
              id={TAB_ID[currency]}
              aria-selected={selected}
              aria-controls="history-panel"
              data-testid={TAB_ID[currency]}
              onClick={() => selectTab(currency)}
              className={`rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                selected
                  ? 'bg-primary text-white'
                  : 'border border-border bg-surface text-text hover:bg-background'
              }`}
            >
              {tabLabel(
                currency,
                data === null ? undefined : currency === 'USD' ? data.usdCount : data.cupCount,
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-text">
          {intl.formatMessage({ id: 'BILLING.HISTORY.FILTER_FROM' })}
          <input
            type="date"
            className={INPUT_CLASSES}
            value={from}
            onChange={(event) => changeFilter(setFrom, event.target.value)}
            data-testid="history-from"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-text">
          {intl.formatMessage({ id: 'BILLING.HISTORY.FILTER_TO' })}
          <input
            type="date"
            className={INPUT_CLASSES}
            value={to}
            onChange={(event) => changeFilter(setTo, event.target.value)}
            data-testid="history-to"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-text">
          {intl.formatMessage({ id: 'BILLING.HISTORY.FILTER_STORE' })}
          <select
            className={INPUT_CLASSES}
            value={storeId}
            onChange={(event) => changeFilter(setStoreId, event.target.value)}
            data-testid="history-store"
          >
            <option value="">
              {intl.formatMessage({ id: 'BILLING.HISTORY.FILTER_ALL_STORES' })}
            </option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div
        role="tabpanel"
        id="history-panel"
        aria-labelledby={TAB_ID[tab]}
        className="flex flex-col gap-4"
      >
        {error === undefined && data !== null && items.length === 0 && (
          <p className="text-sm text-text-muted">
            {intl.formatMessage({ id: 'BILLING.HISTORY.EMPTY_STATE' })}
          </p>
        )}

        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-background">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-text-muted">
                    {intl.formatMessage({ id: 'BILLING.HISTORY.STORE' })}
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-text-muted">
                    {intl.formatMessage({ id: 'BILLING.HISTORY.OWNER' })}
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-text-muted">
                    {intl.formatMessage({ id: 'BILLING.HISTORY.PAID_DATE' })}
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-text-muted">
                    {intl.formatMessage({ id: 'BILLING.HISTORY.PERIOD' })}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-text-muted">
                    {intl.formatMessage({ id: 'BILLING.HISTORY.AMOUNT' })}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-text-muted">
                    {intl.formatMessage({ id: 'BILLING.HISTORY.COMMISSION' })}
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-text-muted">
                    {isCupTab && (
                      <span className="sr-only">
                        {intl.formatMessage({ id: 'BILLING.HISTORY.DETAIL_HEADER' })}
                      </span>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item: StorePaymentHistoryItem, index: number) => (
                  <RowGroup
                    key={`${item.storeId}-${item.paidDate ?? ''}-${index}`}
                    item={item}
                    index={index}
                    expanded={expandedRow === index}
                    onToggle={() => setExpandedRow(expandedRow === index ? null : index)}
                    money={money}
                    formatDay={formatPaymentDay}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td colSpan={4} className="px-4 py-3 text-right text-sm text-text-muted">
                    {intl.formatMessage({ id: 'BILLING.HISTORY.TOTAL_AMOUNT' })}
                    {' / '}
                    {intl.formatMessage({ id: 'BILLING.HISTORY.TOTAL_COMMISSION' })}
                  </td>
                  <td
                    className="px-4 py-3 text-right font-semibold text-text"
                    data-testid="history-total-amount"
                  >
                    {data === null ? '' : money(data.totalAmount, tab)}
                  </td>
                  <td
                    className="px-4 py-3 text-right font-semibold text-text"
                    data-testid="history-total-commission"
                  >
                    {data === null ? '' : money(data.totalCommission, tab)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {data !== null && data.total > data.pageSize && (
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {intl.formatMessage({ id: 'BILLING.HISTORY.PREV_PAGE' })}
            </Button>
            <span className="text-xs text-text-muted">
              {intl.formatMessage({ id: 'BILLING.HISTORY.PAGE' }, { page, last: lastPage })}
            </span>
            <Button variant="outline" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
              {intl.formatMessage({ id: 'BILLING.HISTORY.NEXT_PAGE' })}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

interface RowGroupProps {
  item: StorePaymentHistoryItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  money: (amount: number, currency: StorePaymentCurrency) => string;
  formatDay: (value: string | null) => string;
}

/**
 * One payment row plus, on the CUP tab, the disclosure that explains it (S8).
 *
 * The `i` is a REAL `<button>`: Enter and Space activate it natively, a tap hits it like any
 * other button, `aria-expanded` exposes the state, and the visible focus ring makes it
 * obvious to a keyboard user. It is not hover-only and it does not rely on `title`.
 */
function RowGroup({ item, index, expanded, onToggle, money, formatDay }: RowGroupProps) {
  const intl = useIntl();
  const rate = item.exchangeRate;
  const owed = item.amountOwedUsd;
  // The `i` exists only when the detail line it reveals can actually render: a CUP row with a
  // null rate or null owed amount would otherwise expose a focusable control that expands into
  // nothing (S8 — no dead control).
  const canExplain = item.currency === 'CUP' && rate !== null && owed !== null;

  return (
    <>
      <tr className="hover:bg-background">
        <td className="px-4 py-3 font-medium text-text">{item.storeName}</td>
        <td className="px-4 py-3 text-text">{item.ownerName}</td>
        <td className="px-4 py-3 text-text">{formatDay(item.paidDate)}</td>
        <td className="px-4 py-3 text-text">{formatDay(item.paymentBeforeDate)}</td>
        <td className="px-4 py-3 text-right text-text" data-testid={`history-amount-${index}`}>
          {money(item.amount, item.currency)}
        </td>
        <td className="px-4 py-3 text-right text-text" data-testid={`history-commission-${index}`}>
          {money(item.commission, item.currency)}
        </td>
        <td className="px-4 py-3 text-right">
          {canExplain && (
            <button
              type="button"
              aria-label={intl.formatMessage(
                { id: 'BILLING.HISTORY.DETAIL_LABEL' },
                { store: item.storeName },
              )}
              aria-expanded={expanded}
              onClick={onToggle}
              className={INFO_BUTTON_CLASSES}
              data-testid={`history-info-${index}`}
            >
              i
            </button>
          )}
        </td>
      </tr>
      {canExplain && expanded && (
        <tr data-testid={`history-detail-${index}`}>
          <td colSpan={7} className="bg-background px-4 py-2 text-xs text-text-muted">
            {intl.formatMessage(
              { id: 'BILLING.HISTORY.DETAIL_LINE' },
              { rate: intl.formatNumber(rate), owed: money(owed, 'USD') },
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default StorePaymentsHistoryPage;
