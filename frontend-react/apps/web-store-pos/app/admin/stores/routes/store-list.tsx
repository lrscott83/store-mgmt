import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { resellerLoader } from '~/auth/routes/loaders';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { StoreCardList } from '~/admin/stores/components/store-card-list';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { confirmDialog } from '~/shared/lib/blocking-alert';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon } from '~/shared/components/ui/icons';
import type { Store } from '@store-mgmt/domain';

// Extend Store type to include planType from backend response
interface StoreWithPlanType extends Store {
  planType?: string;
}

export const clientLoader = resellerLoader;

/**
 * Sole super-admin store lifecycle list (design.md: "Super-admin lifecycle list stays SOLE
 * at /admin/stores"). Approve/Disapprove now require confirmation before the HTTP call
 * (Angular parity — store-list.component.ts:132-166,169-203, `Swal.fire({... icon: 'question'
 * ...})`), reusing the existing `confirmDialog` primitive instead of a new modal.
 */
export function AdminStoreListPage() {
  const navigate = useNavigate();
  const { formatMessage } = useIntl();
  const [stores, setStores] = useState<StoreWithPlanType[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  // Filter by plan type: 'all' shows all stores, 'not-free' excludes Gratis plan,
  // and specific plan types (VIP, Superior, Pago, Gratis) filter by that plan.
  // Default is 'not-free' to show all paid plans except Gratis.
  const [filter, setFilter] = useState<string>('not-free');

  const loadStores = useCallback(async () => {
    try {
      const res = await storeHttpService.listStores();
      if (!res.succeeded) {
        setError(formatMessage({ id: 'STORES.ERROR' }));
        return;
      }
      setStores(res.data);
      setError(undefined);
    } catch (error) {
      setError(formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    }
  }, [formatMessage]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

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
      await loadStores();
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
      await loadStores();
    } catch (error) {
      setError(formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    }
  }

  async function handleToggle(id: string) {
    const store = stores.find((s) => s.id === id);
    if (!store) return;
    // Direction-aware copy (spec store-plan-toggle R3): Free (null date) →
    // "Activar plan pago", Paid (non-null date) → "Desactivar plan pago".
    const activating = store.paymentStartDate === null;
    const confirmed = await confirmDialog({
      title: formatMessage({
        id: activating ? 'STORES.ACTIVATE_PAID_TITLE' : 'STORES.DEACTIVATE_PAID_TITLE',
      }),
      message: formatMessage({
        id: activating ? 'STORES.ACTIVATE_PAID_MESSAGE' : 'STORES.DEACTIVATE_PAID_MESSAGE',
      }),
      confirmButtonText: formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;
    try {
      await storeHttpService.toggleStorePlan(id);
      await loadStores();
    } catch (error) {
      setError(formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
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
        labelId="store-visibility-filter"
      />

      <StoreCardList
        stores={getFilteredStores()}
        onEdit={(id) => navigate(`/management/stores/edit/${id}`)}
        onApprove={handleApprove}
        onDisapprove={handleDisapprove}
        onToggle={handleToggle}
      />
    </div>
  );
}

interface PlanFilterButtonsProps {
  filter: string;
  onFilterChange: (value: string) => void;
  storeCountByPlan: Record<string, number>;
  labelId: string;
}

const PLAN_FILTER_ORDER = ['VIP', 'Superior', 'Pago', 'Gratis'] as const;

function PlanFilterButtons({ filter, onFilterChange, storeCountByPlan, labelId }: PlanFilterButtonsProps) {
  const { formatMessage } = useIntl();

  const plans: { value: string; labelKey: string; count: number }[] = [
    { value: 'all', labelKey: 'STORES.FILTER_ALL', count: storeCountByPlan.all },
    { value: 'not-free', labelKey: 'STORES.FILTER_NOT_FREE', count: storeCountByPlan['not-free'] },
    ...PLAN_FILTER_ORDER.map((planType) => ({
      value: planType.toLowerCase(),
      labelKey: `STORES.FILTER_${planType}`,
      count: storeCountByPlan[planType],
    })),
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label htmlFor={labelId} className="text-sm font-medium text-text">
        {formatMessage({ id: 'STORES.FILTER_LABEL' })}
      </label>
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
