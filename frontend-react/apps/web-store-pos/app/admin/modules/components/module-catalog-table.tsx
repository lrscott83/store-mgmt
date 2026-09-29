import { useIntl } from 'react-intl';
import type { Plan } from '@store-mgmt/domain';
import {
  currentModulePrice,
  groupModulesByPlanDelta,
  NO_PLAN_GROUP,
} from '@store-mgmt/domain';
import { formatPlanAmount, formatPlanPrice } from '~/shared/lib/price-utils';

/**
 * One editable catalog row. The three price fields are held as TEXT, not numbers, for the
 * same reason the per-store pricing modal holds them as text: a controlled
 * `<input type="number">` bound to number state cannot accept a decimal point, because the
 * keystroke that adds the dot collapses state and the re-render erases it. The raw string is
 * converted only at the edges — the formula input and the save payload.
 */
export interface ModuleCatalogRow {
  moduleId: number;
  name: string;
  price: string;
  discountPrice: string;
  percentDiscountPrice: string;
}

export type ModuleCatalogField = 'price' | 'discountPrice' | 'percentDiscountPrice';

/** Non-numeric or empty text prices as 0 — the domain formula clamps at zero anyway. */
function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A module is "on offer" when either discount is positive. The two together are not a
 * compound: a percent of 0 with a flat of 0 is the base price alone, and showing a
 * strikethrough identical to the effective price would be noise.
 */
function isOnOffer(row: ModuleCatalogRow): boolean {
  return toNumber(row.percentDiscountPrice) > 0 || toNumber(row.discountPrice) > 0;
}

function effectivePrice(row: ModuleCatalogRow): number {
  return currentModulePrice(
    toNumber(row.price),
    toNumber(row.percentDiscountPrice),
    toNumber(row.discountPrice),
  );
}

const PLAN_NAME_KEYS: Record<string, string> = {
  Gratis: 'STORES.PLAN.FREE_TAB',
  Pago: 'STORES.PLAN.PAID_TAB',
  Superior: 'STORES.PLAN.SUPERIOR_TAB',
  VIP: 'STORES.PLAN.VIP_TAB',
};

/**
 * Testid segment per field. NOT the field name itself: `discountPrice` and
 * `percentDiscountPrice` are wire/DTO spellings, and a testid is a UI handle — the
 * per-store pricing modal uses the same `price` / `percent` / `discount` segments.
 */
const FIELD_TESTIDS: Record<ModuleCatalogField, string> = {
  price: 'price',
  percentDiscountPrice: 'percent',
  discountPrice: 'discount',
};

interface ModuleCatalogTableProps {
  rows: ModuleCatalogRow[];
  /** Plan catalog from GET /v1/plans — drives the VISUAL grouping only, never the save. */
  plans: Plan[];
  disabled: boolean;
  onChangeField: (moduleId: number, field: ModuleCatalogField, value: string) => void;
}

const COLUMN_CLASS = 'py-1.5 px-2';
const INPUT_CLASS =
  'w-24 rounded border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';

/**
 * The GLOBAL module catalog pricing table, one section per plan.
 *
 * Grouping is derived, never authoritative: `groupModulesByPlanDelta` partitions the universe
 * so every row lands in EXACTLY one group (the last bucket catches modules no loaded plan
 * claims — `GET /v1/plans` excludes VIP — so nothing becomes unreachable), which is what
 * makes the flattened rows the save payload.
 *
 * The effective price of a row AND the total of its group are recomputed live with the shared
 * domain formula on every keystroke, so the number under the cursor is always the number the
 * backend would persist. When any row in a group is on offer, the group's BASE total is shown
 * struck through next to the effective one — the same offer treatment the per-row column
 * gets.
 *
 * Presentational on purpose: the host route owns the fetch, the draft and the save, so the
 * error and busy states are the parent's exactly as on the other admin pages.
 */
export function ModuleCatalogTable({ rows, plans, disabled, onChangeField }: ModuleCatalogTableProps) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-muted" data-testid="module-catalog-empty">
        {t('MODULE_CATALOG.EMPTY')}
      </p>
    );
  }

  const groups = groupModulesByPlanDelta(rows, plans, (row) => row.moduleId);

  const groupLabel = (planType: string) =>
    planType === NO_PLAN_GROUP
      ? t('MODULE_CATALOG.NO_PLAN_GROUP')
      : PLAN_NAME_KEYS[planType]
        ? t(PLAN_NAME_KEYS[planType])
        : planType;

  const priceInput = (row: ModuleCatalogRow, field: ModuleCatalogField, label: string) => (
    <input
      type="number"
      min="0"
      step="any"
      disabled={disabled}
      value={row[field]}
      onChange={(e) => onChangeField(row.moduleId, field, e.target.value)}
      aria-label={`${row.name} — ${label}`}
      data-testid={`module-catalog-${FIELD_TESTIDS[field]}-${row.moduleId}`}
      className={INPUT_CLASS}
    />
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left" data-testid="module-catalog-table">
        <thead>
          <tr className="border-b border-border text-xs uppercase text-text-muted">
            <th scope="col" className={COLUMN_CLASS}>
              {t('MODULE_CATALOG.COLUMN_MODULE')}
            </th>
            <th scope="col" className={COLUMN_CLASS}>
              {t('MODULE_CATALOG.COLUMN_PRICE')}
            </th>
            <th scope="col" className={COLUMN_CLASS}>
              {t('MODULE_CATALOG.COLUMN_PERCENT_DISCOUNT')}
            </th>
            <th scope="col" className={COLUMN_CLASS}>
              {t('MODULE_CATALOG.COLUMN_DISCOUNT')}
            </th>
            <th scope="col" className={`${COLUMN_CLASS} text-right`}>
              {t('MODULE_CATALOG.COLUMN_CURRENT')}
            </th>
          </tr>
        </thead>

        {groups.map((group) => {
          const key = group.planType || 'no-plan';
          const effectiveTotal = group.items.reduce((sum, row) => sum + effectivePrice(row), 0);
          const baseTotal = group.items.reduce((sum, row) => sum + toNumber(row.price), 0);
          const groupOnOffer = group.items.some(isOnOffer);

          return (
            <tbody key={key}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={5}
                  className="bg-surface-hover px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
                  data-testid={`module-catalog-group-${key}`}
                >
                  {groupLabel(group.planType)}
                </th>
              </tr>

              {group.items.map((row) => {
                const offer = isOnOffer(row);
                return (
                  <tr key={row.moduleId} className="border-b border-border/60">
                    <td className={`${COLUMN_CLASS} text-sm font-medium text-text`}>{row.name}</td>
                    <td className={COLUMN_CLASS}>
                      {priceInput(row, 'price', t('MODULE_CATALOG.COLUMN_PRICE'))}
                    </td>
                    <td className={COLUMN_CLASS}>
                      {priceInput(
                        row,
                        'percentDiscountPrice',
                        t('MODULE_CATALOG.COLUMN_PERCENT_DISCOUNT'),
                      )}
                    </td>
                    <td className={COLUMN_CLASS}>
                      {priceInput(row, 'discountPrice', t('MODULE_CATALOG.COLUMN_DISCOUNT'))}
                    </td>
                    <td
                      className={`${COLUMN_CLASS} text-right text-sm font-semibold text-text`}
                      data-testid={`module-catalog-current-${row.moduleId}`}
                    >
                      {offer && (
                        <s
                          className="mr-1 font-normal text-text-muted"
                          data-testid={`module-catalog-base-${row.moduleId}`}
                        >
                          {formatPlanAmount(toNumber(row.price))}
                        </s>
                      )}
                      {formatPlanAmount(effectivePrice(row))}
                    </td>
                  </tr>
                );
              })}

              <tr className="border-t-2 border-border">
                <th
                  scope="row"
                  colSpan={4}
                  className={`${COLUMN_CLASS} text-right text-sm font-semibold text-text`}
                >
                  {t('MODULE_CATALOG.GROUP_TOTAL')}
                </th>
                <td
                  className={`${COLUMN_CLASS} text-right text-base font-bold text-text`}
                  data-testid={`module-catalog-group-total-${key}`}
                >
                  {groupOnOffer && (
                    <s
                      className="mr-1 text-sm font-normal text-text-muted"
                      data-testid={`module-catalog-group-base-${key}`}
                    >
                      {formatPlanPrice(baseTotal)}
                    </s>
                  )}
                  {formatPlanPrice(effectiveTotal)}
                </td>
              </tr>
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

export default ModuleCatalogTable;
