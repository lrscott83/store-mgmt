import { useIntl } from 'react-intl';
import type { OwnerStoreWithPlan } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { formatDateOnly } from '~/shared/lib/date-utils';
import { formatPlanAmount, formatPlanPrice } from '~/shared/lib/price-utils';

const PLAN_NAME_KEYS: Record<string, string> = {
  Gratis: 'STORES.PLAN.FREE_TAB',
  Pago: 'STORES.PLAN.PAID_TAB',
  Superior: 'STORES.PLAN.SUPERIOR_TAB',
  VIP: 'STORES.PLAN.VIP_TAB',
};

interface OwnerStoreCardProps {
  store: OwnerStoreWithPlan;
  onEdit: (store: OwnerStoreWithPlan) => void;
  onEditPlan: (store: OwnerStoreWithPlan) => void;
}

/**
 * One store card of the owner's "my stores" grid (docs/plans/2026-09-08-owner-stores-cards-plan.md).
 * Header: store name left + gear right. Body: plan type, next billing date (paid
 * plan only) and the paid total with the struck-through original when discounted.
 *
 * Canonical price (docs/plans/2026-09-15-store-plan-canonical-price-plan.md): the
 * price lines come from the backend's planCurrentPrice/planPrice — Σ over the
 * plan's member modules from the LIVE catalog, the same formula the plan view
 * (GET /v1/plans) uses. The card no longer reads the store's frozen module
 * snapshot, so a store's card can never disagree with its plan's catalog price.
 * Null canonical fields (disapproved store / missing plan) render the plan name
 * only — the backend owns that guard.
 */
export function OwnerStoreCard({ store, onEdit, onEditPlan }: OwnerStoreCardProps) {
  const intl = useIntl();

  const isOnPaidPlan = store.planType !== 'Gratis' && store.planCurrentPrice !== null;
  const hasDiscount =
    store.planPrice !== null &&
    store.planCurrentPrice !== null &&
    store.planCurrentPrice < store.planPrice;

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
                {formatPlanAmount(store.planPrice!)}
              </span>
            )}
            <span className="font-semibold" data-testid={`owner-store-price-${store.id}`}>
              {formatPlanPrice(store.planCurrentPrice!)}
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}

export default OwnerStoreCard;
