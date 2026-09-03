import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { PlanPicker } from '~/management/stores/components/plan-picker';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { mergeStoreModules } from '~/management/stores/lib/store-modules';
import { formatDateOnly } from '~/shared/lib/date-utils';
import type { StorePlan, Module } from '@store-mgmt/domain';

export const clientLoader = adminFeatureLoader([EFeatures.Stores]);

/**
 * Plan view (management stores) — the store's plan lives on its own page,
 * separate from the store-data update view (`/management/stores/update`).
 * The storeId resolves from the route param first, falling back to
 * `user.selectedStoreId` (same resolution as the edit-store route).
 *
 * HTTP-only data access (same as edit-store): reads the dedicated plan
 * endpoint plus the module catalog, and saves via the general store update
 * with the full module set (the backend applies modules only when present).
 */
export function StorePlanPage() {
  const intl = useIntl();
  const { id: paramId } = useParams<{ id: string }>();
  const { user, getUserByToken } = useAuthStore();

  const storeId = paramId ?? user?.selectedStoreId ?? '';
  const isSuperAdmin = user?.isSuperAdmin ?? false;

  const [plan, setPlan] = useState<StorePlan | undefined>(undefined);
  const [modules, setModules] = useState<Module[]>([]);
  const [moduleIds, setModuleIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    Promise.all([
      storeHttpService.getStorePlan(storeId),
      storeHttpService.getModulesToStore(),
    ])
      .then(([planRes, modulesRes]) => {
        if (cancelled) return;
        if (!planRes.succeeded || !modulesRes.succeeded) {
          setError(intl.formatMessage({ id: 'STORES.ERROR' }));
          return;
        }
        // Merge the store's active modules into the catalog: selected=true,
        // price overrides from the store's snapshot (shared helper, same as
        // the create/edit form).
        const mergedModules = mergeStoreModules(modulesRes.data, planRes.data.modules);
        setPlan(planRes.data);
        setModules(mergedModules);
        setModuleIds(
          mergedModules.filter((m) => m.priceIncluded || m.selected).map((m) => m.id)
        );
        setError('');
      })
      .catch((error) => {
        if (!cancelled) {
          setError(intl.formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, intl]);

  const isOnPaidPlan = modules.some((m) => !m.priceIncluded && m.selected);

  async function handleSave() {
    if (!plan || !storeId) return;
    setError('');
    setIsLoading(true);
    try {
      await storeHttpService.updateStore(storeId, {
        id: storeId,
        name: plan.storeName,
        address: plan.address ?? '',
        description: plan.description ?? '',
        approved: plan.approved,
        // Omit when null — the backend only applies a non-null value and an
        // empty string would fail DateOnly binding.
        paymentStartDate: plan.paymentStartDate ?? undefined,
        moduleIds,
        isActive: plan.isActive,
      });
      // Angular parity: after save, refresh the user session via the
      // consolidated getUserByToken() action — no page reload.
      try {
        await getUserByToken();
      } catch {
        // Non-critical: session refresh failure should not block the save UX
      }
    } catch (error) {
      setError(intl.formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
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
        <p role="alert" className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  // Wait for the plan + catalog before mounting the picker so the initial
  // moduleIds hydrate correctly (same gate as edit-store).
  if (!plan) {
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
      <Card
        footer={
          <div className="text-center">
            <Button type="button" variant="fab" disabled={isLoading} onClick={handleSave}>
              {isLoading
                ? intl.formatMessage({ id: 'STORES.SAVING' })
                : intl.formatMessage({ id: 'STORES.SAVE' })}
            </Button>
          </div>
        }
      >
        {/* Next billing date — only meaningful while the store is on a paid plan
            (a paid module is active); hidden on the free plan. */}
        {isOnPaidPlan && plan.nextDueDate && (
          <p
            data-testid="plan-next-billing-date"
            className="mb-3 rounded border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800"
          >
            {intl.formatMessage({ id: 'STORES.PLAN.NEXT_BILLING_DATE' })}:{' '}
            <span className="font-semibold">{formatDateOnly(plan.nextDueDate)}</span>
          </p>
        )}
        <PlanPicker
          modules={modules}
          onChange={setModuleIds}
          readOnly={!isSuperAdmin && isOnPaidPlan}
        />
      </Card>
    </div>
  );
}

export default StorePlanPage;
