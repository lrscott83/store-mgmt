import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { PlanPanels } from '~/management/stores/components/plan-panels';
import { groupFeaturesByModuleId } from '~/management/stores/lib/plan-utils';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { formatDateOnly } from '~/shared/lib/date-utils';
import { softRefreshSession } from '~/shared/lib/stores/soft-refresh-session';
import type { StorePlan, Plan, Feature } from '@store-mgmt/domain';

export const clientLoader = adminFeatureLoader([EFeatures.Stores]);

/**
 * Plan view (management stores) — the store's plan lives on its own page,
 * separate from the store-data form (reached from store cards via
 * /management/stores/edit/:id).
 * The storeId resolves from the route param first, falling back to
 * `user.selectedStoreId` (same resolution as the edit-store route).
 *
 * Catalog-driven: GET /v1/plans renders the three PlanPanels (Gratis/Pago/
 * Superior, VIP excluded server-side) with the store's backend-serialized
 * planType deciding the default-expanded panel and the DG-7 read-only lock.
 * Activation is per-panel and immediate: POST change-plan with the target
 * plan id, session refresh, then a re-read of the store plan so the panels and
 * the billing banner reflect the new plan. No tabbed picker, no merge, no
 * Guardar footer — the change lives in the upgrade cost (Price), not in a save.
 */
export function StorePlanPage() {
  const intl = useIntl();
  const { id: paramId } = useParams<{ id: string }>();
  const { user } = useAuthStore();

  const storeId = paramId ?? user?.selectedStoreId ?? '';

  const [plan, setPlan] = useState<StorePlan | undefined>(undefined);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [featuresByModuleId, setFeaturesByModuleId] = useState<ReadonlyMap<number, Feature[]>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activationError, setActivationError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      storeHttpService.getStorePlan(storeId),
      storeHttpService.getPlans(),
      storeHttpService.getFeaturesToStore(),
    ])
      .then(([planRes, plansRes, featuresRes]) => {
        if (cancelled) return;
        if (!planRes.succeeded || !plansRes.succeeded || !featuresRes.succeeded) {
          setError(intl.formatMessage({ id: 'STORES.ERROR' }));
          return;
        }
        setPlan(planRes.data);
        setPlans(plansRes.data);
        setFeaturesByModuleId(groupFeaturesByModuleId(featuresRes.data));
        setError('');
      })
      .catch((error) => {
        if (!cancelled) {
          setError(intl.formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, intl]);

  const planType = plan?.planType ?? '';
  // owner-plan-change: the DG-7 readOnly lock is gone — the owner changes the
  // store plan at any time; the backend ownership guard is the only authority.
  const isOnPaidPlan = planType !== '' && planType !== 'Gratis';

  // Owner plan restriction (billing/spec.md): the caller matrix reserves
  // Superior/VIP to SuperAdmin — an OwnerAdmin sees only Gratis/Pago panels
  // (the backend 403s anything else; the filter keeps the UI honest).
  const visiblePlans = user?.isSuperAdmin
    ? plans
    : plans.filter((p) => p.planType === 'Gratis' || p.planType === 'Pago');

  async function handleActivate(selectedPlan: Plan) {
    if (!plan || !storeId) return;
    setActivationError(null);
    setIsLoading(true);
    try {
      // Owner-driven plan change (owner-plan-change): the dedicated change-plan
      // endpoint carries the target plan id — the backend owns module rewriting,
      // the anchor and the next-due pinning. No store payload ever rides this.
      await storeHttpService.changeStorePlan(storeId, selectedPlan.id);
      // Refresh the user session ONLINE — no page reload. `getUserByToken()`
      // cannot do this job: it is cache-first by design (auth-store.ts:160-177)
      // and a plan change issues no new token, so it never asks the backend and
      // the menus keep the old plan's entries. See soft-refresh-session.ts.
      // Best-effort: a refresh failure must not surface as a save error.
      await softRefreshSession();
      // Re-read the store plan so the panels and the billing banner reflect
      // the newly activated planType (PlanPanels re-expands via its effect).
      const refreshed = await storeHttpService.getStorePlan(storeId);
      if (refreshed.succeeded) setPlan(refreshed.data);
    } catch (error) {
      setActivationError(intl.formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    } finally {
      setIsLoading(false);
    }
  }

  if (!storeId) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-gray-500">
          {intl.formatMessage({ id: 'STORES.NO_STORE_SELECTED' })}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 p-4">
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      </div>
    );
  }

  if (!plan || isLoading) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-gray-500">{intl.formatMessage({ id: 'GENERAL.LOADING' })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'STORES.PLAN.SECTION_TITLE' })}
      </h1>

      {/* Next billing date — only meaningful while the store is on a paid plan
          (backend planType); hidden on the free plan. */}
      {isOnPaidPlan && plan.nextDueDate && (
        <p
          data-testid="plan-next-billing-date"
          className="mb-3 rounded border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800"
        >
          {intl.formatMessage({ id: 'STORES.PLAN.NEXT_BILLING_DATE' })}:{' '}
          <span className="font-semibold">{formatDateOnly(plan.nextDueDate)}</span>
        </p>
      )}

      <PlanPanels
        plans={visiblePlans}
        storePlanType={planType}
        featuresByModuleId={featuresByModuleId}
        onActivate={handleActivate}
        activationError={activationError}
      />
    </div>
  );
}

export default StorePlanPage;