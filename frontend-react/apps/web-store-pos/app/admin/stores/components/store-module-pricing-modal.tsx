import { useIntl } from 'react-intl';
import type { Plan } from '@store-mgmt/domain';
import {
  currentModulePrice,
  groupModulesByPlanDelta,
  NO_PLAN_GROUP,
  totalModulePricing,
} from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon } from '~/shared/components/ui/icons';
import { Spinner } from '~/shared/components/ui/spinner';
import { formatPlanAmount, formatPlanPrice } from '~/shared/lib/price-utils';

/**
 * One editable row. The three price fields are held as TEXT, not numbers, because a
 * controlled `<input type="number">` bound to a number state cannot accept a decimal point:
 * typing "1.05" hits `Number("1.")` on the keystroke that adds the dot, state collapses back to
 * 1, the dot is erased by the re-render, and the next digit lands on "10". Holding the raw
 * string and converting at the edges (formula input, save payload) is the fix.
 */
export interface PricingDraft {
  moduleId: number;
  name: string;
  isSelected: boolean;
  /**
   * The store's frozen `ModulePriceIncluded` (the catalog's when no snapshot exists).
   * Server-owned — it is NOT in the save payload (the backend resolves it), so the draft
   * only carries it to price the row correctly while it is on screen.
   */
  priceIncluded: boolean;
  price: string;
  discountPrice: string;
  percentDiscountPrice: string;
}

export type PricingField = 'price' | 'discountPrice' | 'percentDiscountPrice';

/** Non-numeric or empty text prices as 0 — the domain formula clamps at zero anyway. */
function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const PLAN_NAME_KEYS: Record<string, string> = {
  Gratis: 'STORES.PLAN.FREE_TAB',
  Pago: 'STORES.PLAN.PAID_TAB',
  Superior: 'STORES.PLAN.SUPERIOR_TAB',
  VIP: 'STORES.PLAN.VIP_TAB',
};

interface StoreModulePricingModalProps {
  open: boolean;
  /** Store being priced (null = closed). */
  storeId: string | null;
  storeName: string;
  /** Plan catalog from GET /v1/plans — drives the VISUAL grouping only. */
  plans: Plan[];
  rows: PricingDraft[];
  loading: boolean;
  saving: boolean;
  error?: string;
  /**
   * The server's own `totalCurrentPrice` after a successful save, null otherwise.
   *
   * Non-null suppresses the live recompute so the number on screen is unambiguously what the
   * backend persisted — the two are computed in different floating-point widths and agree only
   * to ~7 significant digits, so showing a client value next to a "saved" state would invite a
   * false mismatch report. The first edit after a save clears it and the total goes live again.
   */
  serverTotal: number | null;
  onToggle: (moduleId: number, isSelected: boolean) => void;
  onChangeField: (moduleId: number, field: PricingField, value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

const COLUMN_CLASS = 'py-1.5 px-2';
const INPUT_CLASS =
  'w-24 rounded border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';

/**
 * SuperAdmin per-store module pricing: tick/untick every available module and edit its price,
 * discount and percent discount, with the total recomputed live in the browser.
 *
 * The table is GROUPED BY PLAN for readability only. The grouping never gates, filters or
 * reorders what is saved: `onSave` receives the flat draft list, all of it, ticked or not. That
 * matters because the backend reads absence from the payload as "leave this module untouched"
 * and a missing row would silently be skipped instead of deactivated.
 *
 * A tick means the store will hold the module active; unticking deactivates it (a soft flag,
 * never a delete). The three price inputs are editable only while the row is ticked — an
 * unticked row keeps its stored values on display so untick-then-retick does not lose them.
 *
 * The total is what the store will ACTUALLY be charged: it goes through `totalModulePricing`,
 * the mirror of the backend's `ModulePriceCalculator`, so a price-included (gratis) row is
 * excluded exactly as `RegisterStorePaymentCommand` and `BillingService` exclude it.
 *
 * Presentational on purpose: the host route owns the fetch, the draft state and the save, so
 * the error and busy states are the parent's exactly as they are for the plan popup.
 */
export function StoreModulePricingModal({
  open,
  storeId,
  storeName,
  plans,
  rows,
  loading,
  saving,
  error,
  serverTotal,
  onToggle,
  onChangeField,
  onClose,
  onSave,
}: StoreModulePricingModalProps) {
  const intl = useIntl();
  const t = (id: string, values?: Record<string, string>) => intl.formatMessage({ id }, values);

  if (!open || !storeId) return null;

  // Grouping is derived, never authoritative: every draft row lands in exactly one group (see
  // groupModulesByPlanDelta), so the flattened groups ARE the save payload.
  const groups = groupModulesByPlanDelta(rows, plans, (row) => row.moduleId);

  // The billable amount this store WILL be charged: the mirror of the backend's
  // `ModulePriceCalculator`, fed the TICKED rows. The tick is the row's `isActive` input,
  // so unticking a row drops it from the total and a price-included (gratis) row never
  // enters it — the same rule the server applies when it persists and when it bills.
  const liveTotal = totalModulePricing(
    rows.map((row) => ({
      moduleId: row.moduleId,
      isActive: row.isSelected,
      priceIncluded: row.priceIncluded,
      price: toNumber(row.price),
      percentDiscountPrice: toNumber(row.percentDiscountPrice),
      discountPrice: toNumber(row.discountPrice),
    })),
  ).currentPrice;
  const displayedTotal = serverTotal ?? liveTotal;
  // Editing invalidates the persisted total: the screen must stop claiming to show the server.
  const controlsDisabled = loading || saving;

  const groupLabel = (planType: string) =>
    planType === NO_PLAN_GROUP
      ? t('STORES.MODULE_PRICING.NO_PLAN_GROUP')
      : PLAN_NAME_KEYS[planType]
        ? t(PLAN_NAME_KEYS[planType])
        : planType;

  const priceInput = (
    row: PricingDraft,
    field: PricingField,
    label: string,
    dataTestId: string,
  ) => (
    <input
      type="number"
      min="0"
      step="any"
      // Disabled while the row is unticked: an unticked row is not saved as a price, and
      // letting it look editable would invite the operator to type into a value that the
      // backend ignores (an unticked row with a row present is written not at all).
      disabled={controlsDisabled || !row.isSelected}
      value={row[field]}
      onChange={(e) => onChangeField(row.moduleId, field, e.target.value)}
      aria-label={`${row.name} — ${label}`}
      data-testid={dataTestId}
      className={INPUT_CLASS}
    />
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid={`store-module-pricing-modal-${storeId}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-text">{t('STORES.MODULE_PRICING.TITLE')}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-text-muted hover:text-text disabled:opacity-50"
            aria-label={t('GENERAL.CLOSE')}
          >
            <CloseIcon />
          </button>
        </div>

        <p className="mb-1 text-sm font-medium text-text" data-testid="module-pricing-store">
          {storeName}
        </p>
        <p className="mb-3 text-xs text-text-muted">{t('STORES.MODULE_PRICING.HINT')}</p>

        {error && (
          <p
            role="alert"
            className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          >
            {error}
          </p>
        )}

        {loading ? (
          <Spinner label={t('STORES.MODULE_PRICING.LOADING')} />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            {t('STORES.MODULE_PRICING.NO_MODULES')}
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full border-collapse text-left" data-testid="module-pricing-table">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-xs uppercase text-text-muted">
                  <th scope="col" className={`${COLUMN_CLASS} w-12`}>
                    {t('STORES.MODULE_PRICING.COLUMN_ACTIVE')}
                  </th>
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

              {groups.map((group) => (
                <tbody key={group.planType || 'no-plan'}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={6}
                      className="bg-surface-hover px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
                      data-testid={`module-pricing-group-${group.planType || 'no-plan'}`}
                    >
                      {groupLabel(group.planType)}
                    </th>
                  </tr>
                  {group.items.map((row) => (
                    <tr key={row.moduleId} className="border-b border-border/60">
                      <td className={COLUMN_CLASS}>
                        <input
                          type="checkbox"
                          checked={row.isSelected}
                          disabled={controlsDisabled}
                          onChange={(e) => onToggle(row.moduleId, e.target.checked)}
                          aria-label={`${t('STORES.MODULE_PRICING.COLUMN_ACTIVE')}: ${row.name}`}
                          data-testid={`module-pricing-tick-${row.moduleId}`}
                        />
                      </td>
                      <td className={`${COLUMN_CLASS} text-sm font-medium text-text`}>
                        {row.name}
                      </td>
                      <td className={COLUMN_CLASS}>
                        {priceInput(
                          row,
                          'price',
                          t('STORES.MODULE_PRICING.COLUMN_PRICE'),
                          `module-pricing-price-${row.moduleId}`,
                        )}
                      </td>
                      <td className={COLUMN_CLASS}>
                        {priceInput(
                          row,
                          'discountPrice',
                          t('STORES.MODULE_PRICING.COLUMN_DISCOUNT'),
                          `module-pricing-discount-${row.moduleId}`,
                        )}
                      </td>
                      <td className={COLUMN_CLASS}>
                        {priceInput(
                          row,
                          'percentDiscountPrice',
                          t('STORES.MODULE_PRICING.COLUMN_PERCENT_DISCOUNT'),
                          `module-pricing-percent-${row.moduleId}`,
                        )}
                      </td>
                      <td
                        className={`${COLUMN_CLASS} text-right text-sm font-semibold text-text`}
                        data-testid={`module-pricing-current-${row.moduleId}`}
                      >
                        {formatPlanAmount(
                          currentModulePrice(
                            toNumber(row.price),
                            toNumber(row.percentDiscountPrice),
                            toNumber(row.discountPrice),
                          ),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}

              <tfoot>
                <tr className="border-t-2 border-border">
                  <td colSpan={5} className="px-2 pt-3 text-right text-sm font-semibold text-text">
                    {t('STORES.MODULE_PRICING.TOTAL')}
                  </td>
                  <td
                    className="px-2 pt-3 text-right text-base font-bold text-text"
                    data-testid="module-pricing-total"
                  >
                    {formatPlanPrice(displayedTotal)}
                  </td>
                </tr>
                {serverTotal !== null && (
                  <tr>
                    <td colSpan={6} className="px-2 pb-1 text-right text-xs text-text-muted">
                      {t('STORES.MODULE_PRICING.SERVER_TOTAL_NOTE')}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('GENERAL.CANCEL')}
          </Button>
          <Button
            variant="primary"
            onClick={onSave}
            disabled={controlsDisabled || rows.length === 0}
            data-testid="module-pricing-save"
          >
            {t('GENERAL.SAVE')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default StoreModulePricingModal;
