import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { StoreList } from '~/management/stores/components/store-list';
import type { Store } from '@store-mgmt/domain';

export const clientLoader = superAdminLoader;

export function AdminStoreListPage() {
  const navigate = useNavigate();
  const { formatMessage } = useIntl();
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  async function loadStores() {
    try {
      const res = await storeHttpService.listStores();
      setStores(res.data);
      setError(undefined);
    } catch {
      setError(formatMessage({ id: 'STORES.ERROR' }));
    }
  }

  useEffect(() => {
    loadStores();
  }, []);

  async function handleApprove(id: string) {
    try {
      await storeHttpService.approveStore(id);
      await loadStores();
    } catch {
      setError(formatMessage({ id: 'STORES.ERROR' }));
    }
  }

  async function handleDisapprove(id: string) {
    try {
      await storeHttpService.disapproveStore(id);
      await loadStores();
    } catch {
      setError(formatMessage({ id: 'STORES.ERROR' }));
    }
  }

  return (
    <StoreList
      stores={stores}
      isOnline={true}
      isDegraded={false}
      isSuperAdmin={true}
      error={error}
      onCreate={() => navigate('/management/stores/create')}
      onEdit={(id) => navigate(`/management/stores/edit/${id}`)}
      onApprove={handleApprove}
      onDisapprove={handleDisapprove}
    />
  );
}

export default AdminStoreListPage;
