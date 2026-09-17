import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { resellerLoader } from '~/auth/routes/loaders';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { EditPlanModal } from '~/management/stores/components/edit-plan-modal';
import { groupFeaturesByModuleId } from '~/management/stores/lib/plan-utils';
import { StoreCardList } from '~/admin/stores/components/store-card-list';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { confirmDialog } from '~/shared/lib/blocking-alert';
import { softRefreshSession } from '~/shared/lib/stores/soft-refresh-session';
import { showToastSuccess } from '~/shared/lib/toast';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon } from '~/shared/components/ui/icons';
import type { Feature, Plan, Store } from '@store-mgmt/domain';

export const clientLoader = resellerLoader;

/**
 * Sole super-admin store lifecycle list (design.md: "Super-admin lifecycle list stays SOLE
 * at /admin/stores"). Approve/Disapprove now require confirmation before the HTTP call
 * (Angular parity — store-list.component.ts:132-166,169-203, `Swal.fire({... icon: 'question'
 * ...})`), reusing the existing `confirmDialog` primitive instead of a new modal.
 * "Cambiar plan" opens the SAME catalog-driven plan popup as the owner's my-stores view
 * (EditPlanModal + PlanPanels) — the gear item replaced the old Free⇄Paid toggle confirm.
 */
export function AdminStoreListPage() {
  const navigate = useNavigate();
  const { formatMessage } = useIntl();
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  // Plan popup state — same shape as MyStoresPage (owner plan change parity).
  const [plans, setPlans] = useState<Plan[]>([]);
  const [featuresByModuleId, setFeaturesByModuleId] = useState<ReadonlyMap<number, Feature[]>>(
    new Map(),
  );
  const [planStore, setPlanStore] = useState<Store | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  // Filter by plan type: 'all' shows all stores, 'not-free' excludes Gratis plan,
  // and specific plan types (VIP, Superior, Pago, Gratis) filter by that plan.
  // Default is 'not-free' to show all paid plans except Gratis.
  const [filter, setFilter] = useState<string>('not-free');

  const load = useCallback(async () => {
    try {
      const [storesRes, plansRes, featuresRes] = await Promise.all([
        storeHttpService.listStores(),
        storeHttpService.getPlans(),
        storeHttpService.getFeaturesToStore(),
      ]);
      if (!storesRes.succeeded || !plansRes.succeeded || !featuresRes.succeeded) {
        setError(formatMessage({ id: 'STORES.ERROR' }));
        return;
      }
      setStores(storesRes.data);
      setPlans(plansRes.data);
      setFeaturesByModuleId(groupFeaturesByModuleId(featuresRes.data));
      setError(undefined);
    } catch (error) {
      setError(formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    }
  }, [formatMessage]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(id: string) {
    const confirmed = await confirmDialog({
      title: formatMessage({ id: 'STORES.APPROVE_CONFIRM_TITLE' }),
      message: formatMessage({ id: 'STORES.APPROVE_CONFIRM_MESSAGE' }),
      confirmButtonText: formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;
    try {
      await storeHttpService.approveStore(id);
      await load();
    } catch (error) {
      setError(formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    }
  }

  async function handleDisapprove(id: string) {
    const confirmed = await confirmDialog({
      title: formatMessage({ id: 'STORES.DISAPPROVE_CONFIRM_TITLE' }),
      message: formatMessage({ id: 'STORES.DISAPPROVE_CONFIRM_MESSAGE' }),
      confirmButtonText: formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;
    try {
      await storeHttpService.disapproveStore(id);
      await load();
    } catch (error) {
      setError(formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    }
  }

  function openPlanModal(id: string) {
    const store = stores.find((s) => s.id === id);
    if (!store) return;
    setModalError('');
    setPlanStore(store);
  }

  async function handlePlanActivate(selectedPlan: Plan) {
    if (!planStore || modalBusy) return;
    setModalError('');
    setModalBusy(true);
    try {
      // SuperAdmin-driven plan change — same contract as the owner's plan popup
      // (my-stores.tsx handlePlanActivate): the dedicated change-plan endpoint
      // carries the target plan id, the backend owns module rewriting, the anchor
      // and the next-due pinning. No moduleIds PUT ever fires here.
      await storeHttpService.changeStorePlan(planStore.id, selectedPlan.id);
      setPlanStore(null);
      // Refresh the session after a plan change so feature-driven menus reflect
      // the new module set — ONLINE refresh (getUserByToken is cache-first by
      // design and a plan change issues no new token). Best-effort.
      await softRefreshSession();
      showToastSuccess(formatMessage({ id: 'STORES.UPDATE_SUCCESS' }));
      await load();
    } catch (error) {
      setModalError(formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    } finally {
      setModalBusy(false);
    }
  }

  function getFilteredStores(): Store[] {
    if (filter === 'all') {
      return stores;
    }
    if (filter === 'not-free') {
      return stores.filter((s) => s.planType !== 'Gratis');
    }
    // Filter by specific plan type (VIP, Superior, Pago, Gratis)
    return stores.filter((s) => s.planType === filter);
  }

  function getStoreCountByPlan(): Record<string, number> {
    const counts: Record<string, number> = {
      all: stores.length,
      'not-free': stores.filter((s) => s.planType !== 'Gratis').length,
      VIP: stores.filter((s) => s.planType === 'VIP').length,
      Superior: stores.filter((s) => s.planType === 'Superior').length,
      Pago: stores.filter((s) => s.planType === 'Pago').length,
      Gratis: stores.filter((s) => s.planType === 'Gratis').length,
    };
    return counts;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{formatMessage({ id: 'STORES.LIST_TITLE' })}</h1>
        <Button variant="fab" onClick={() => navigate('/management/stores/create')}>
          <PlusIcon />
          {formatMessage({ id: 'GENERAL.ADD' })}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <PlanFilterButtons
        filter={filter}
        onFilterChange={setFilter}
        storeCountByPlan={getStoreCountByPlan()}
      />

      <StoreCardList
        stores={getFilteredStores()}
        onEdit={(id) => navigate(`/management/stores/edit/${id}`)}
        onApprove={handleApprove}
        onDisapprove={handleDisapprove}
        onChangePlan={openPlanModal}
      />

      <EditPlanModal
        open={planStore !== null}
        storeId={planStore?.id ?? null}
        plans={plans}
        storePlanType={planStore?.planType ?? 'Gratis'}
        featuresByModuleId={featuresByModuleId}
        nextDueDate={planStore?.nextPaymentDate ?? null}
        error={modalError}
        onClose={() => setPlanStore(null)}
        onActivate={handlePlanActivate}
      />
    </div>
  );
}

interface PlanFilterButtonsProps {
  filter: string;
  onFilterChange: (value: string) => void;
  storeCountByPlan: Record<string, number>;
}

const PLAN_FILTER_ORDER = ['VIP', 'Superior', 'Pago', 'Gratis'] as const;

const PLAN_FILTER_KEYS: Record<string, string> = {
  VIP: 'STORES.FILTER_VIP',
  Superior: 'STORES.FILTER_SUPERIOR',
  Pago: 'STORES.FILTER_PAID',
  Gratis: 'STORES.FILTER_FREE',
};

function PlanFilterButtons({ filter, onFilterChange, storeCountByPlan }: PlanFilterButtonsProps) {
  const { formatMessage } = useIntl();

  const plans: { value: string; labelKey: string; count: number }[] = [
    { value: 'all', labelKey: 'STORES.FILTER_ALL', count: storeCountByPlan.all },
    { value: 'not-free', labelKey: 'STORES.FILTER_NOT_FREE', count: storeCountByPlan['not-free'] },
    ...PLAN_FILTER_ORDER.map((planType) => ({
      value: planType,
      labelKey: PLAN_FILTER_KEYS[planType],
      count: storeCountByPlan[planType],
    })),
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {plans.map(({ value, labelKey, count }) => (
        <Button
          key={value}
          variant={filter === value ? 'primary' : 'secondary'}
          onClick={() => onFilterChange(value)}
          className="transition-colors text-sm"
        >
          <span className="flex items-center gap-1">
            {formatMessage({ id: labelKey })}
            {count > 0 && (
              <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-text-muted">
                {count}
              </span>
            )}
          </span>
        </Button>
      ))}
    </div>
  );
}

export default AdminStoreListPage;
