import { useIntl } from 'react-intl';
import type { StoreModulePricingReadRow } from '@store-mgmt/domain';
import { hasModuleDiscount, isBillableModule, totalModulePricing } from '@store-mgmt/domain';
import { CloseIcon } from '~/shared/components/ui/icons';
import { Spinner } from '~/shared/components/ui/spinner';
import { formatCurrency } from '~/shared/lib/format-currency';

interface CollectionModuleBreakdownModalProps {
  /** Store being reviewed — the ONE closed gate: null means the popup is not shown. */
  storeId: string | null;
  storeName: string;
  /** The pricing read for that store — the same payload the pricing editor seeds from. */
  rows: StoreModulePricingReadRow[];
  loading: boolean;
  error?: string;
  onClose: () => void;
}

const COLUMN_CLASS = 'py-1.5 px-2';

/**
 * Read-only breakdown of WHY a store owes what the collections row shows: one row per module
 * that contributes to the amount (`isBillableModule` — active and not price-included), with the
 * base total struck through when the discounted total is lower.
 *
 * Presentational on purpose: the host route owns the fetch, the loading/error state and the
 * close handler, exactly as it does for the register-payment popup. There are no inputs here —
 * editing prices is `StoreModulePricingModal`, a different screen with a different endpoint
 * contract.
 */
export function CollectionModuleBreakdownModal({
  storeId,
  storeName,
  rows,
  loading,
  error,
  onClose,
}: CollectionModuleBreakdownModalProps) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });

  if (!storeId) return null;

  const billable = rows.filter(isBillableModule);
  const totals = totalModulePricing(billable);
  const hasDiscount = hasModuleDiscount(totals.price, totals.currentPrice);

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid={`collection-breakdown-modal-${storeId}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-text">
            {t('BILLING.COLLECTIONS.MODULE_BREAKDOWN_TITLE')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label={t('GENERAL.CLOSE')}
            data-testid="collection-breakdown-close"
          >
            <CloseIcon />
          </button>
        </div>

        <p className="mb-1 text-sm font-medium text-text" data-testid="collection-breakdown-store">
          {storeName}
        </p>
        <p className="mb-3 text-xs text-text-muted">
          {t('BILLING.COLLECTIONS.MODULE_BREAKDOWN_HINT')}
        </p>

        {error ? (
          <p
            role="alert"
            className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          >
            {error}
          </p>
        ) : loading ? (
          <Spinner label={t('BILLING.COLLECTIONS.MODULE_BREAKDOWN_LOADING')} />
        ) : billable.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            {t('BILLING.COLLECTIONS.MODULE_BREAKDOWN_EMPTY')}
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table
              className="w-full border-collapse text-left"
              data-testid="collection-breakdown-table"
            >
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-xs uppercase text-text-muted">
                  <th scope="col" className={COLUMN_CLASS}>
                    {t('STORES.MODULE_PRICING.COLUMN_MODULE')}
                  </th>
                  <th scope="col" className={COLUMN_CLASS}>
                    {t('STORES.MODULE_PRICING.COLUMN_PRICE')}
                  </th>
                  <th scope="col" className={COLUMN_CLASS}>
                    {t('STORES.MODULE_PRICING.COLUMN_DISCOUNT')}
                  </th>
                  <th scope="col" className={COLUMN_CLASS}>
                    {t('STORES.MODULE_PRICING.COLUMN_PERCENT_DISCOUNT')}
                  </th>
                  <th scope="col" className={`${COLUMN_CLASS} text-right`}>
                    {t('STORES.MODULE_PRICING.COLUMN_CURRENT')}
                  </th>
                </tr>
              </thead>

              <tbody>
                {billable.map((row) => (
                  <tr key={row.moduleId} className="border-b border-border/60">
                    <td className={`${COLUMN_CLASS} text-sm font-medium text-text`}>{row.name}</td>
                    <td className={`${COLUMN_CLASS} text-sm text-text`}>
                      {formatCurrency(row.price)}
                    </td>
                    <td className={`${COLUMN_CLASS} text-sm text-text`}>
                      {formatCurrency(row.discountPrice)}
                    </td>
                    <td className={`${COLUMN_CLASS} text-sm text-text`}>
                      {row.percentDiscountPrice}%
                    </td>
                    <td
                      className={`${COLUMN_CLASS} text-right text-sm font-semibold text-text`}
                      data-testid={`collection-breakdown-row-${row.moduleId}`}
                    >
                      {formatCurrency(row.currentPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="border-t-2 border-border">
                  <td colSpan={4} className="px-2 pt-3 text-right text-sm font-semibold text-text">
                    {t('STORES.MODULE_PRICING.TOTAL')}
                  </td>
                  <td
                    className="px-2 pt-3 text-right text-base font-bold text-text"
                    data-testid="collection-breakdown-total"
                  >
                    {hasDiscount && (
                      <span
                        className="mr-2 text-sm font-normal text-danger line-through"
                        data-testid="collection-breakdown-total-base"
                      >
                        {formatCurrency(totals.price)}
                      </span>
                    )}
                    {formatCurrency(totals.currentPrice)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text hover:bg-background"
            data-testid="collection-breakdown-dismiss"
          >
            {t('GENERAL.CLOSE')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CollectionModuleBreakdownModal;
