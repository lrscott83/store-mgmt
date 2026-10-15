import { useEffect, useState } from 'react';
import { fetchPublicPlanPricing, type PublicPlanPricing } from '../lib/public-plan-pricing';

/** The plan the landing suggests: its card starts open and carries the "Sugerido" badge. */
const RECOMMENDED_PLAN = 'Pago';

const ctaPrimary =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 shadow-card ' +
  'bg-primary text-white text-sm font-medium transition-colors hover:bg-primary-hover';

/** USD with no trailing zeros for whole amounts ("$1", "$2.50"). */
function formatUsd(value: number): string {
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

/**
 * "Precios" section of the public landing: one accordion card per plan (Gratis, Pago, Superior)
 * with its modules and their real prices, read from the anonymous public endpoint. The card for
 * the suggested plan (Pago) starts open.
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

        <div className="space-y-3">
          {plans.map((plan) => {
            const isOpen = openPlan === plan.planType;
            const isRecommended = plan.planType === RECOMMENDED_PLAN;
            const planDiscounted = plan.basePrice > plan.currentPrice;
            return (
              <div
                key={plan.planType}
                className="overflow-hidden rounded-lg border border-border bg-surface shadow-card"
              >
                <button
                  type="button"
                  onClick={() => setOpenPlan(isOpen ? null : plan.planType)}
                  aria-expanded={isOpen}
                  aria-controls={`precios-${plan.planType}`}
                  data-testid={`plan-pricing-toggle-${plan.planType}`}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-text">{plan.name}</span>
                    {isRecommended && (
                      <span
                        data-testid={`plan-pricing-recommended-${plan.planType}`}
                        className="rounded-sm border border-primary/30 bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-primary uppercase"
                      >
                        Sugerido
                      </span>
                    )}
                  </span>
                  <span
                    data-testid={`plan-pricing-total-${plan.planType}`}
                    className="flex items-baseline gap-2"
                  >
                    {planDiscounted && (
                      <span className="text-sm text-text-muted line-through">
                        {formatUsd(plan.basePrice)}
                      </span>
                    )}
                    <span className="text-xl font-bold text-accent">
                      {formatUsd(plan.currentPrice)}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div
                    id={`precios-${plan.planType}`}
                    data-testid={`plan-pricing-body-${plan.planType}`}
                    className="border-t border-border px-6 py-5"
                  >
                    <ul className="space-y-2">
                      {plan.modules.map((module) => (
                        <li
                          key={module.moduleId}
                          data-testid={`plan-pricing-module-${plan.planType}-${module.moduleId}`}
                          className="flex items-baseline justify-between gap-4 text-sm"
                        >
                          <span className="text-text">{module.name}</span>
                          <span className="flex items-baseline gap-2">
                            {module.basePrice > module.currentPrice && (
                              <span className="text-xs text-text-muted line-through">
                                {formatUsd(module.basePrice)}
                              </span>
                            )}
                            <span className="font-medium text-text-muted">
                              {formatUsd(module.currentPrice)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>

                    <a href="#registro" className={`${ctaPrimary} mt-6 w-full`}>
                      Empezar
                    </a>
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
