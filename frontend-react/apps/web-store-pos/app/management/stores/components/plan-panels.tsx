import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Feature, Plan, PlanModule } from '@store-mgmt/domain';

/**
 * Format a plan amount as a bare number — decimals shown only when present
 * (10 → "10", 10.5 → "10.5"), no currency. Used for strikes and module rows,
 * which drop the trailing "USD" to avoid doubling it.
 */
function formatPlanAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format as "5 USD" or "5.5 USD" — plan totals. */
function formatPlanPrice(amount: number): string {
  return `${formatPlanAmount(amount)} USD`;
}

interface PlanPanelsProps {
  /** Plan catalog from GET /v1/plans (Gratis, Pago, Superior — VIP excluded server-side). */
  plans: Plan[];
  /**
   * The store's backend-serialized plan name. The panel whose `planType`
   * matches is default-expanded and carries the active badge; NO priceIncluded
   * heuristic is involved (DG-4).
   */
  storePlanType: string;
  /** Real Feature catalog grouped by ModuleId; empty map suppresses "?" tooltips. */
  featuresByModuleId: ReadonlyMap<number, Feature[]>;
  /** DG-7: when true, no "Activar ese plan" action renders anywhere. */
  readOnly?: boolean;
  /** Per-panel immediate activation: parent performs updateStore + session refresh + close/reflect. */
  onActivate: (plan: Plan) => void;
  /** Inline activation error (kept by the parent) — panels render it but never mutate state. */
  activationError?: string | null;
}

const PLAN_NAME_KEYS: Record<string, string> = {
  Gratis: 'STORES.PLAN.FREE_TAB',
  Pago: 'STORES.PLAN.PAID_TAB',
  Superior: 'STORES.PLAN.SUPERIOR_TAB',
};

export function PlanPanels({
  plans,
  storePlanType,
  featuresByModuleId,
  readOnly = false,
  onActivate,
  activationError = null,
}: PlanPanelsProps) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const planName = (plan: Plan) =>
    PLAN_NAME_KEYS[plan.planType] ? t(PLAN_NAME_KEYS[plan.planType]) : plan.planType;

  // "Only the active panel is expanded": default from the store's planType, and
  // follow an activation-induced planType change (plan page reflects without reload).
  const [expanded, setExpanded] = useState<string>(storePlanType);
  const [prevPlanType, setPrevPlanType] = useState<string>(storePlanType);
  useEffect(() => {
    if (prevPlanType !== storePlanType) {
      setPrevPlanType(storePlanType);
      setExpanded(storePlanType);
    }
  }, [storePlanType, prevPlanType]);

  if (plans.length === 0) return null;

  return (
    <div className="space-y-3">
      {activationError && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {activationError}
        </p>
      )}

      {plans.map((plan) => {
        const isActive = plan.planType === storePlanType;
        const isExpanded = expanded === plan.planType;
        const total = plan.modules.reduce((sum, m) => sum + m.currentPrice, 0);

        return (
          <div key={plan.planType} className="rounded border border-gray-200">
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => setExpanded(isExpanded ? '' : plan.planType)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-800"
            >
              <span className="flex items-center gap-2">
                {planName(plan)}
                {isActive && (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                    {t('STORES.PLAN.ACTIVE_BADGE')}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold">{formatPlanPrice(total)}</span>
                <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
              </span>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 px-4 py-3">
                <p className="text-sm text-gray-700">{t('STORES.PLAN.INCLUDES')}</p>
                <ul className="mt-1 space-y-2 text-sm text-gray-700">
                  {plan.modules.map((m) => (
                    <PlanModuleRow
                      key={m.moduleId}
                      module={m}
                      features={featuresByModuleId.get(m.moduleId) ?? []}
                    />
                  ))}
                </ul>

                {!isActive && !readOnly && (
                  <button
                    type="button"
                    onClick={() => onActivate(plan)}
                    className="mt-3 rounded bg-primary px-4 py-2 text-sm font-medium text-white"
                  >
                    {t('STORES.PLAN.ACTIVATE_PLAN')}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlanModuleRow({ module, features }: { module: PlanModule; features: Feature[] }) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const hasDiscount = module.currentPrice < module.price || !!module.discountText;

  return (
    <li>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span>{module.name}</span>
          {features.length > 0 && (
            <button
              type="button"
              aria-label="?"
              aria-expanded={tooltipOpen}
              onClick={() => setTooltipOpen((open) => !open)}
              className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-500"
            >
              ?
            </button>
          )}
        </span>
        <span className="flex items-center gap-2">
          {hasDiscount && (
            <>
              <span className="text-red-600 line-through">{formatPlanAmount(module.price)}</span>
              {module.discountText && (
                <span className="text-xs text-green-700">{module.discountText}</span>
              )}
            </>
          )}
          <span className="font-medium">{formatPlanPrice(module.currentPrice)}</span>
        </span>
      </div>
      {tooltipOpen && features.length > 0 && (
        <ul className="mt-1 rounded border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {features.map((f) => (
            <li key={f.id}>{f.description}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default PlanPanels;