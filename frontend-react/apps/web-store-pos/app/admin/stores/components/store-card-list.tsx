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
  /** Optional: only consumers wiring the plan-change popup (e.g. /admin/stores) pass
   * it; owner-edit's store tab omits it and never renders "Cambiar plan". */
  onChangePlan?: (id: string) => void;
  /** Optional, same gating as onChangePlan: opens the per-store module pricing editor.
   * A module activated on an inactive store never reaches the store's session, so the item
   * hides with the plan item rather than offering a save that appears to do nothing. */
  onEditModulePricing?: (id: string) => void;
  /** Optional, same gating: opens the per-store catalog-template editor (SuperAdmin-only
   * capability, same as module pricing). */
  onEditCatalogTemplate?: (id: string) => void;
  /** Optional, same gating: opens the per-store WEB catalog configuration
   * (SuperAdmin-only, 2026-10-22). No module gate: configuring is allowed before the store
   * contracts module 18 — publishing still requires it. */
  onConfigureWebCatalog?: (id: string) => void;
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
 * Store's paid price: the backend serializes planCurrentPrice/planPrice — the sum
 * over the modules THIS store has assigned and that are ACTIVE, the same billing
 * rule the charge uses. It is not the plan catalog's total, so a store whose
 * module set differs from its plan shows what it actually pays. Null fields
 * (disapproved store) hide the price.
 */
function getPlanPriceInfo(store: Store): PlanPriceInfo | null {
  if (store.planCurrentPrice === null || store.planCurrentPrice === undefined) return null;
  const paidTotal = store.planCurrentPrice;
  const paidOriginalTotal = store.planPrice ?? paidTotal;
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
  // Disapproved stores arrive as 'Gratis' (backend guard): a stale paid module
  // snapshot must never render a price — only the plan name.
  const showPrice = store.planType !== 'Gratis';
  const showDate =
    store.planType !== 'Gratis' &&
    store.nextPaymentDate !== null &&
    store.nextPaymentDate !== '' &&
    !store.nextPaymentDate.startsWith('0001-');

  return (
    <p className="text-sm font-medium text-text">
      {planLabel}
      {(showPrice || showDate) && (
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

/**
 * Public catalog link: rendered only for a store that synced its catalog — every public
 * endpoint resolves `/catalog/<slug>` by `Store.CatalogSlug` and 404s for a store without
 * one. Opens in a new tab so the SuperAdmin keeps the list in view.
 */
function CatalogLink({ store }: { store: Store }) {
  const intl = useIntl();
  const slug = store.catalogSlug?.trim();
  if (!slug) return null;

  return (
    <p className="text-sm">
      <a
        href={`/catalog/${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline"
        data-testid={`store-catalog-link-${store.id}`}
      >
        {intl.formatMessage({ id: 'STORES.CATALOG_VIEW' })}
      </a>
    </p>
  );
}

export function StoreCardList({
  stores,
  onEdit,
  onApprove,
  onDisapprove,
  onChangePlan,
  onEditModulePricing,
  onEditCatalogTemplate,
  onConfigureWebCatalog,
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
              {store.isActive && onChangePlan && (
                <ActionMenuItem intent="pay" onClick={() => onChangePlan(store.id)}>
                  {intl.formatMessage({ id: 'STORES.CHANGE_PLAN' })}
                </ActionMenuItem>
              )}
              {store.isActive && onEditModulePricing && (
                <ActionMenuItem
                  intent="pay"
                  onClick={() => onEditModulePricing(store.id)}
                  data-testid={`store-module-pricing-action-${store.id}`}
                >
                  {intl.formatMessage({ id: 'STORES.MODULE_PRICING.MENU_LABEL' })}
                </ActionMenuItem>
              )}
              {store.isActive && onEditCatalogTemplate && (
                <ActionMenuItem
                  intent="pay"
                  onClick={() => onEditCatalogTemplate(store.id)}
                  data-testid={`store-catalog-template-action-${store.id}`}
                >
                  {intl.formatMessage({ id: 'STORES.CATALOG_TEMPLATE.MENU_LABEL' })}
                </ActionMenuItem>
              )}
              {store.isActive && onConfigureWebCatalog && (
                <ActionMenuItem
                  intent="edit"
                  onClick={() => onConfigureWebCatalog(store.id)}
                  data-testid={`store-web-catalog-action-${store.id}`}
                >
                  {intl.formatMessage({ id: 'STORES.WEB_CATALOG.MENU_LABEL' })}
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
            <CatalogLink store={store} />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default StoreCardList;
