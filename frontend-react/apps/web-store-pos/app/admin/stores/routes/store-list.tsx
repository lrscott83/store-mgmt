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
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  // A store is on a paid plan when it has activated one (`paymentStartDate` set);
  // otherwise (null) it is on the free plan.
  const [filter, setFilter] = useState<'paid-plan' | 'free-plan'>('paid-plan');

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

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{formatMessage({ id: 'STORES.LIST_TITLE' })}</h1>
        <Button variant="fab" onClick={() => navigate('/management/stores/create')}>
          <PlusIcon />
          {formatMessage({ id: 'GENERAL.ADD' })}
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <label htmlFor="store-visibility-filter" className="text-sm font-medium text-text">
          {formatMessage({ id: 'STORES.FILTER_LABEL' })}
        </label>
        <select
          id="store-visibility-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'paid-plan' | 'free-plan')}
          className="rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="paid-plan">
            {formatMessage({ id: 'STORES.PAID_PLAN' })}
          </option>
          <option value="free-plan">
            {formatMessage({ id: 'STORES.FREE_PLAN' })}
          </option>
        </select>
      </div>

      <StoreCardList
        stores={
          filter === 'paid-plan'
            ? stores.filter((s) => s.paymentStartDate !== null)
            : stores.filter((s) => s.paymentStartDate === null)
        }
        onEdit={(id) => navigate(`/management/stores/edit/${id}`)}
        onApprove={handleApprove}
        onDisapprove={handleDisapprove}
        onToggle={handleToggle}
      />
    </div>
  );
}

export default AdminStoreListPage;
