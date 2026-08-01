import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { StoreCardList } from '~/admin/stores/components/store-card-list';
import { confirmDialog } from '~/shared/lib/blocking-alert';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon } from '~/shared/components/ui/icons';
import type { Store } from '@store-mgmt/domain';

export const clientLoader = superAdminLoader;

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

  const loadStores = useCallback(async () => {
    try {
      const res = await storeHttpService.listStores();
      if (!res.succeeded) {
        setError(formatMessage({ id: 'STORES.ERROR' }));
        return;
      }
      setStores(res.data);
      setError(undefined);
    } catch {
      setError(formatMessage({ id: 'STORES.ERROR' }));
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
    } catch {
      setError(formatMessage({ id: 'STORES.ERROR' }));
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
    } catch {
      setError(formatMessage({ id: 'STORES.ERROR' }));
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

      <StoreCardList
        stores={stores}
        onEdit={(id) => navigate(`/management/stores/edit/${id}`)}
        onApprove={handleApprove}
        onDisapprove={handleDisapprove}
      />
    </div>
  );
}

export default AdminStoreListPage;
