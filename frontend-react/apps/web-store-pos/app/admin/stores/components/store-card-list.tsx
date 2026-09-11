import { useIntl } from 'react-intl';
import type { Store } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { formatPlanAmount, formatPlanPrice } from '~/shared/lib/price-utils';

interface StoreCardListProps {
  stores: Store[];
  onEdit: (id: string) => void;
  onApprove: (id: string) => void;
  onDisapprove: (id: string) => void;
  /** Optional: only consumers wiring the plan toggle (e.g. /admin/stores) pass it;
   * owner-edit's store tab omits it and never renders "Cambiar plan". */
  onToggle?: (id: string) => void;
}

/**
 * Super-admin store lifecycle grid at /admin/stores. Gear/action menu (shared `ActionMenu`
 * primitive) replaces the old flat Editar/Aprobar/Desaprobar buttons, matching Angular
 * `store-list.component.html:17-51` (gear-menu-action-styling change). Angular
 * `store-list.component.html:40-50` dead-codes Activate/Deactivate out of the DOM entirely
 * for every role — neither control exists here (Req: Activate/Deactivate Controls Removed).
 * State CSS and Approve/Disapprove XOR mirror `admin/owners/components/owner-card-list.tsx
 * getCardClass` (Req: Store Card Visual Lifecycle State, Req: Card-Grid List Uses Shared
 * Chrome).
 */
function getStoreCardClass(store: Store): string {
  if (!store.isActive) return 'bg-danger/10 border border-danger';
  if (!store.approved) return 'bg-warning/10 border border-warning';
  return '';
}

// Same plan-name → i18n-key map as the owner's store cards (owner-store-card.tsx):
// resolve the backend plan name through the shared message catalog, falling back to
// the raw name when the catalog doesn't know it.
const PLAN_NAME_KEYS: Record<string, string> = {
  Gratis: 'STORES.PLAN.FREE_TAB',
  Pago: 'STORES.PLAN.PAID_TAB',
  Superior: 'STORES.PLAN.SUPERIOR_TAB',
  VIP: 'STORES.PLAN.VIP_TAB',
};

interface PlanPriceInfo {
  paidTotal: number;
  paidOriginalTotal: number;
  hasDiscount: boolean;
}

/**
 * Store's paid price from its own module snapshot — the SAME criteria the owner's
 * store cards use (owner-store-card.tsx): Σ paid-module currentPrice vs price,
 * discounted when the current total is lower. Null for the free plan (no paid
 * modules) or when the snapshot didn't arrive, so the card shows the plan name only.
 */
function getPlanPriceInfo(store: Store): PlanPriceInfo | null {
  const paidModules = store.modules.filter((m) => !m.priceIncluded);
  if (paidModules.length === 0) return null;
  const paidTotal = paidModules.reduce((sum, m) => sum + m.currentPrice, 0);
  const paidOriginalTotal = paidModules.reduce((sum, m) => sum + m.price, 0);
  return { paidTotal, paidOriginalTotal, hasDiscount: paidTotal < paidOriginalTotal };
}

/**
 * First body line: plan name, and for non-free plans the price with the struck-through
 * original when discounted plus the next payment date in parentheses, e.g.
 * "Superior: 20 10 USD (2026-10-31)" — date rendered raw (ISO, as the backend sends
 * it), matching the requested card format. The date guards against `0001-01-01`
 * (DateOnly default would serialize as 0001-01-01, never a real due date).
 */
function PlanLine({ store }: { store: Store }) {
  const intl = useIntl();
  const planLabel = PLAN_NAME_KEYS[store.planType]
    ? intl.formatMessage({ id: PLAN_NAME_KEYS[store.planType] })
    : store.planType;
  const priceInfo = getPlanPriceInfo(store);
  const showDate =
    store.planType !== 'Gratis' &&
    store.nextPaymentDate !== null &&
    store.nextPaymentDate !== '' &&
    !store.nextPaymentDate.startsWith('0001-');

  return (
    <p className="text-sm font-medium text-text">
      {planLabel}
      {(priceInfo || showDate) && (
        <>
          :{' '}
          {priceInfo?.hasDiscount && (
            <span
              className="mr-1 text-danger line-through"
              data-testid={`store-price-original-${store.id}`}
            >
              {formatPlanAmount(priceInfo.paidOriginalTotal)}
            </span>
          )}
          {priceInfo && (
            <span data-testid={`store-price-${store.id}`}>{formatPlanPrice(priceInfo.paidTotal)}</span>
          )}
          {showDate && (
            <span
              className="font-normal text-text-muted"
              data-testid={`store-next-payment-${store.id}`}
            >
              {' '}({store.nextPaymentDate})
            </span>
          )}
        </>
      )}
    </p>
  );
}

export function StoreCardList({
  stores,
  onEdit,
  onApprove,
  onDisapprove,
  onToggle,
}: StoreCardListProps) {
  const intl = useIntl();

  if (stores.length === 0) {
    return (
      <p className="text-sm text-text-muted">{intl.formatMessage({ id: 'STORES.EMPTY_STATE' })}</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stores.map((store) => (
        <Card
          key={store.id}
          title={store.name}
          className={getStoreCardClass(store)}
          headerAction={
            <ActionMenu testId={`store-actions-toggle-${store.id}`} widthClass="min-w-40">
              <ActionMenuItem intent="edit" onClick={() => onEdit(store.id)}>
                {intl.formatMessage({ id: 'STORES.EDIT' })}
              </ActionMenuItem>
              {store.approved ? (
                <ActionMenuItem intent="disapprove" onClick={() => onDisapprove(store.id)}>
                  {intl.formatMessage({ id: 'STORES.DISAPPROVE' })}
                </ActionMenuItem>
              ) : (
                <ActionMenuItem intent="approve" onClick={() => onApprove(store.id)}>
                  {intl.formatMessage({ id: 'STORES.APPROVE' })}
                </ActionMenuItem>
              )}
              {store.isActive && onToggle && (
                <ActionMenuItem intent="pay" onClick={() => onToggle(store.id)}>
                  {intl.formatMessage({ id: 'STORES.CHANGE_PLAN' })}
                </ActionMenuItem>
              )}
            </ActionMenu>
          }
        >
          <div className="space-y-2">
            <PlanLine store={store} />
            <p className="text-sm text-text-muted">
              <span className="font-medium text-text">
                {intl.formatMessage({ id: 'STORES.OWNER_LABEL' })}:
              </span>{' '}
              {store.ownerName}
            </p>
            {store.ownerPhone && (
              <p className="text-sm text-text-muted">
                <span className="font-medium text-text">
                  {intl.formatMessage({ id: 'STORES.STORE_PHONE_LABEL' })}:
                </span>{' '}
                <a
                  href={`tel:${store.ownerPhone}`}
                  className="text-primary hover:underline"
                  data-testid={`store-phone-${store.id}`}
                >
                  {store.ownerPhone}
                </a>
              </p>
            )}
            {store.description && (
              <p className="text-sm text-text-muted">
                <span className="font-medium text-text">
                  {intl.formatMessage({ id: 'STORES.STORE_DESCRIPTION_LABEL' })}:
                </span>{' '}
                {store.description}
              </p>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

export default StoreCardList;
