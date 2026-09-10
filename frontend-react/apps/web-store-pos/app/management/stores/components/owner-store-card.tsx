import { useIntl } from 'react-intl';
import type { Module, OwnerStoreWithPlan } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { formatDateOnly } from '~/shared/lib/date-utils';

/**
 * Format a plan amount as a bare number — decimals shown only when present
 * (10 → "10", 10.5 → "10.5"), no currency. Same shape as the plan panels'
 * formatPlanAmount: used for the struck-through original price.
 */
function formatPlanAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format as "5 USD" or "5.5 USD" (no $ symbol) — same shape as the plan panels. */
function formatPlanPrice(amount: number): string {
  return `${formatPlanAmount(amount)} USD`;
}

const getIsOnPaidPlan = (modules: Module[]) =>
  modules.some((m) => !m.priceIncluded && m.selected);

const PLAN_NAME_KEYS: Record<string, string> = {
  Gratis: 'STORES.PLAN.FREE_TAB',
  Pago: 'STORES.PLAN.PAID_TAB',
  Superior: 'STORES.PLAN.SUPERIOR_TAB',
  VIP: 'STORES.PLAN.VIP_TAB',
};

interface OwnerStoreCardProps {
  store: OwnerStoreWithPlan;
  /** Catalog merged with the store's snapshot (mergeStoreModules) — same hydration the plan view uses. */
  modules: Module[];
  onEdit: (store: OwnerStoreWithPlan) => void;
  onEditPlan: (store: OwnerStoreWithPlan) => void;
}

/**
 * One store card of the owner's "my stores" grid (docs/plans/2026-09-08-owner-stores-cards-plan.md).
 * Header: store name left + gear right. Body: plan type, next billing date (paid
 * plan only) and the paid total with the struck-through original when discounted —
 * the SAME criteria the store plan view's paid tab uses (P2). Inactive stores get
 * the danger tint + "(Inactiva)" badge, mirroring the super-admin store cards.
 */
export function OwnerStoreCard({ store, modules, onEdit, onEditPlan }: OwnerStoreCardProps) {
  const intl = useIntl();

  // Same paid-plan/price criteria as the store plan view (P2): the merged catalog's
  // paid modules, whose currentPrice/price come from the store's own snapshot.
  const isOnPaidPlan = getIsOnPaidPlan(modules);
  const paidModules = modules.filter((m) => !m.priceIncluded);
  const paidTotal = paidModules.reduce((sum, m) => sum + m.currentPrice, 0);
  const paidOriginalTotal = paidModules.reduce((sum, m) => sum + m.price, 0);
  const hasDiscount = paidTotal < paidOriginalTotal;

  const cardClass = !store.isActive ? 'bg-danger/10 border border-danger' : '';

  return (
    <Card
      title={
        <span data-testid={`owner-store-card-${store.id}`} className="flex items-center gap-2">
          {store.name}
          {!store.isActive && (
            <span
              data-testid={`owner-store-inactive-${store.id}`}
              className="rounded bg-danger/10 px-1.5 py-0.5 text-xs text-danger"
            >
              ({intl.formatMessage({ id: 'STORES.INACTIVE_BADGE' })})
            </span>
          )}
        </span>
      }
      className={cardClass}
      headerAction={
        <ActionMenu testId={`owner-store-actions-toggle-${store.id}`} widthClass="min-w-40">
          <ActionMenuItem
            intent="edit"
            data-testid={`owner-store-edit-${store.id}`}
            onClick={() => onEdit(store)}
          >
            {intl.formatMessage({ id: 'STORES.EDIT' })}
          </ActionMenuItem>
          <ActionMenuItem
            intent="pay"
            data-testid={`owner-store-edit-plan-${store.id}`}
            onClick={() => onEditPlan(store)}
          >
            {intl.formatMessage({ id: 'STORES.EDIT_PLAN' })}
          </ActionMenuItem>
        </ActionMenu>
      }
    >
      <div className="space-y-1" data-testid={`owner-store-body-${store.id}`}>
        <p className="text-sm font-medium text-text">
          {intl.formatMessage(
            { id: 'STORES.PLAN.DISPLAY' },
            {
              plan: PLAN_NAME_KEYS[store.planType]
                ? intl.formatMessage({ id: PLAN_NAME_KEYS[store.planType] })
                : store.planType,
            },
          )}
        </p>
        {isOnPaidPlan && store.nextDueDate && (
          <p className="text-sm text-text-muted">
            {intl.formatMessage({ id: 'STORES.PLAN.NEXT_BILLING_DATE' })}:{' '}
            <span className="font-semibold" data-testid={`owner-store-next-due-${store.id}`}>
              {formatDateOnly(store.nextDueDate)}
            </span>
          </p>
        )}
        {isOnPaidPlan && (
          <p className="text-sm text-text">
            {hasDiscount && (
              <span className="mr-1 text-danger line-through" data-testid={`owner-store-price-original-${store.id}`}>
                {formatPlanAmount(paidOriginalTotal)}
              </span>
            )}
            <span className="font-semibold" data-testid={`owner-store-price-${store.id}`}>
              {formatPlanPrice(paidTotal)}
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}

export default OwnerStoreCard;
