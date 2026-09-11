import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Feature, Plan, PlanModule } from '@store-mgmt/domain';

/**
 * Format a plan amount as a bare number — decimals shown only when present
 * (10 → "10", 10.5 → "10.5"), no currency. Used for header strikes and totals.
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
  /** Per-panel immediate activation: parent performs changeStorePlan + session refresh + close/reflect. */
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
  onActivate,
  activationError = null,
}: PlanPanelsProps) {
  const intl = useIntl();
  const t = (id: string, values?: Record<string, string>) => intl.formatMessage({ id }, values);
  const planName = (plan: Plan) =>
    PLAN_NAME_KEYS[plan.planType] ? t(PLAN_NAME_KEYS[plan.planType]) : plan.planType;

  // AD8: plan_anterior in the cumulative copy is the target's catalog predecessor
  // by Order chain (Superior → Pago, Pago → Gratis), not the store's current plan.
  const predecessorName = (target: Plan): string | null => {
    const previous = plans
      .filter((p) => p.order < target.order)
      .sort((a, b) => b.order - a.order)[0];
    if (!previous) return null;
    return PLAN_NAME_KEYS[previous.planType] ? t(PLAN_NAME_KEYS[previous.planType]) : previous.planType;
  };

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
        const listTotal = plan.modules.reduce((sum, m) => sum + m.price, 0);
        const headerHasDiscount = listTotal > total;

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
                {headerHasDiscount && (
                  <span className="text-red-600 line-through">{formatPlanAmount(listTotal)}</span>
                )}
                <span className="font-semibold">{formatPlanPrice(total)}</span>
                <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
              </span>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 px-4 py-3">
                {/* AD8: cumulative copy names the target's catalog predecessor.
                    Gratis (no predecessor) and the active panel keep plain INCLUDES. */}
                <p className="text-sm text-gray-700">
                  {(() => {
                    const previous = predecessorName(plan);
                    return plan.planType === 'Gratis' || isActive || !previous
                      ? t('STORES.PLAN.INCLUDES')
                      : t('STORES.PLAN.INCLUDES_PREVIOUS_PLAN', { plan: previous });
                  })()}
                </p>
                <ul className="mt-1 space-y-2 text-sm text-gray-700">
                  {plan.modules.map((m) => (
                    <PlanModuleRow
                      key={m.moduleId}
                      module={m}
                      features={featuresByModuleId.get(m.moduleId) ?? []}
                    />
                  ))}
                </ul>

                {!isActive && (
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

/**
 * Module row: name + "?" help icon ONLY — no per-row price, strike, or discount
 * text (the dialog design prices plans at the header, not per module).
 */
function PlanModuleRow({ module, features }: { module: PlanModule; features: Feature[] }) {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <li>
      <div className="flex items-center gap-2">
        <span>{module.name}</span>
        {features.length > 0 && (
          <button
            type="button"
            aria-label="?"
            aria-expanded={tooltipOpen}
            onClick={() => setTooltipOpen((open) => !open)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-green-600 text-sm text-green-600"
          >
            ?
          </button>
        )}
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
