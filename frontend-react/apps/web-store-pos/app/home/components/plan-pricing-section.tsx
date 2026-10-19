import { useEffect, useMemo, useState } from 'react';
import {
  groupModulesByPlanDelta,
  NO_PLAN_GROUP,
  type Plan,
} from '@store-mgmt/domain';
import {
  fetchPublicPlanPricing,
  type PublicPlanModulePricing,
  type PublicPlanPricing,
} from '../lib/public-plan-pricing';

/** The plan the landing suggests: its row starts open and carries the "Sugerido" badge. */
const RECOMMENDED_PLAN = 'Pago';

/**
 * La línea que abre la lista de cada plan pago, con el texto EXACTO de la vista de cambio de
 * plan (2026-10-15). Gratis no la lleva: es el plan base y sus módulos son toda su lista.
 */
const INCLUDES_PREVIOUS: Record<string, string> = {
  Pago: 'Incluye todo lo del plan Gratis y además:',
  Superior: 'Incluye todo lo del plan de Pago y además:',
};

/**
 * Importe con sufijo ` USD` y SIEMPRE dos decimales: `2.50 USD`, `5.00 USD`, `1 000.00 USD`
 * (agrupado con NBSP, igual que el resto de la app).
 */
function formatUsd(value: number): string {
  const sign = value < 0 ? '-' : '';
  const [intPart, decPart] = Math.abs(value).toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  return `${sign}${grouped}.${decPart} USD`;
}

/**
 * "Precios" section of the public landing: a LEDGER, one row per plan (Gratis, Pago, Superior),
 * read from the anonymous public endpoint. Same shape as the store plan-change view:
 *
 *   - a paid plan lists ONLY the modules it adds — the line above them says so, so a plan never
 *     repeats what the previous plan already covers;
 *   - Gratis is the base plan, so its list is all of its modules and it carries no such line;
 *   - a module that belongs to no plan is not shown at all (owner decision 2026-10-15);
 *   - prices come from the single price rule (`ModulePriceCalculator`) and are shown as
 *     `X.XX USD`, with the original struck when it has a discount.
 *
 * The landing has no route loader (see `openspec/specs/home-landing/spec.md`), so the read is a
 * client-side effect. If it fails, the list stays empty and the page is untouched.
 */
export function PlanPricingSection() {
  const [plans, setPlans] = useState<PublicPlanPricing[]>([]);
  const [openPlan, setOpenPlan] = useState<string | null>(RECOMMENDED_PLAN);

  useEffect(() => {
    let cancelled = false;
    fetchPublicPlanPricing()
      .then((data) => {
        if (!cancelled) setPlans(data);
      })
      .catch(() => {
        // The landing must survive the endpoint being down: no prices, no error surface.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Cada módulo se lista UNA vez: en el plan de MENOR orden que lo trae. La partición la hace la
   * misma función que usa la vista de cambio de plan; el bucket "sin plan" se descarta (un módulo
   * fuera de los planes no se muestra). El cast es seguro: la función solo lee `order`,
   * `planType` y `modules[].moduleId`, que el endpoint ya devuelve.
   */
  const modulesByPlan = useMemo<Record<string, PublicPlanModulePricing[]>>(() => {
    if (plans.length === 0) return {};
    const universe = new Map<number, PublicPlanModulePricing>();
    for (const plan of plans) for (const module of plan.modules) universe.set(module.moduleId, module);

    const groups = groupModulesByPlanDelta(
      [...universe.values()],
      plans as unknown as Plan[],
      (module) => module.moduleId,
    );

    const byPlan: Record<string, PublicPlanModulePricing[]> = {};
    for (const group of groups) {
      if (group.planType === NO_PLAN_GROUP) continue;
      byPlan[group.planType] = group.items;
    }
    return byPlan;
  }, [plans]);

  return (
    <section id="precios" data-testid="plan-pricing-section" className="border-t border-border px-4 py-24">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-12 pb-3 text-center">
          <p className="mb-4 flex items-center justify-center gap-3 text-xs font-medium tracking-[0.25em] text-accent uppercase">
            <span className="block h-px w-6 bg-accent" aria-hidden="true"></span>
            Precios
          </p>
          <h2 className="mx-auto text-3xl leading-tight font-bold tracking-tight text-text sm:text-4xl lg:text-5xl">
            Planes claros
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-sm text-text-muted">
            Precios en USD, al cambio del día según la tasa del banco.
          </p>
        </div>

        <div className="border-t border-border">
          {plans.map((plan) => {
            const isOpen = openPlan === plan.planType;
            const isRecommended = plan.planType === RECOMMENDED_PLAN;
            const discounted = plan.basePrice > plan.currentPrice;
            const lead = INCLUDES_PREVIOUS[plan.planType];
            const modules = modulesByPlan[plan.planType] ?? [];
            return (
              <div key={plan.planType} className="border-b border-border">
                <button
                  type="button"
                  onClick={() => setOpenPlan(isOpen ? null : plan.planType)}
                  aria-expanded={isOpen}
                  aria-controls={`precios-${plan.planType}`}
                  data-testid={`plan-pricing-toggle-${plan.planType}`}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-base font-semibold text-text">{plan.name}</span>
                    {isRecommended && (
                      <span
                        data-testid={`plan-pricing-recommended-${plan.planType}`}
                        className="rounded-sm bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-primary uppercase"
                      >
                        Sugerido
                      </span>
                    )}
                  </span>
                  <span className="flex items-baseline gap-3">
                    <span
                      data-testid={`plan-pricing-total-${plan.planType}`}
                      className="flex items-baseline gap-2 tabular-nums"
                    >
                      {discounted && (
                        <span className="text-sm text-text-muted line-through">
                          {formatUsd(plan.basePrice)}
                        </span>
                      )}
                      <span className="text-lg font-bold text-text">
                        {formatUsd(plan.currentPrice)}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-lg text-text-muted">
                      {isOpen ? '−' : '+'}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div id={`precios-${plan.planType}`} data-testid={`plan-pricing-body-${plan.planType}`}>
                    {lead && <p className="mb-1 text-sm text-text-muted">{lead}</p>}
                    <ul>
                      {modules.map((module) => (
                        <li
                          key={module.moduleId}
                          data-testid={`plan-pricing-module-${plan.planType}-${module.moduleId}`}
                          className="flex items-baseline justify-between gap-4 border-t border-border py-2 text-sm"
                        >
                          <span className="text-text">{module.name}</span>
                          <span className="text-right text-text-muted tabular-nums">
                            {formatUsd(module.currentPrice)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default PlanPricingSection;
