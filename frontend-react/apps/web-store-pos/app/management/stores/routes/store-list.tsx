import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { StoreList } from '~/management/stores/components/store-list';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import type { Store } from '@store-mgmt/domain';

const storeRepository = new BaseRepository<Store>('stores', ['paymentStartDate']);

export const loader = adminFeatureLoader([EFeatures.Stores]);

export function StoreListPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const { user } = useAuthStore();
  const storeId = user?.selectedStoreId ?? '';
  const isSuperAdmin = user?.isSuperAdmin ?? false;

  const [stores, setStores] = useState<Store[]>([]);
  const [isDegraded, setIsDegraded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOnline) {
      const cached = storeRepository.getAll(storeId);
      setStores(Array.from(cached.values()));
      setIsDegraded(true);
      return;
    }

    setIsDegraded(false);
    storeHttpService
      .listStores()
      .then((res) => {
        setStores(res.data);
        // Write-through cache
        const map = new Map(res.data.map((s) => [s.id, s]));
        storeRepository.save(storeId, map);
        setError('');
      })
      .catch(() => {
        setError(intl.formatMessage({ id: 'STORES.ERROR' }));
      });
  }, [isOnline, storeId, intl]);

  async function handleLifecycleAction(
    action: (id: string) => Promise<unknown>,
    id: string
  ) {
    if (!isOnline) return;
    try {
      await action(id);
      const res = await storeHttpService.listStores();
      setStores(res.data);
      const map = new Map(res.data.map((s) => [s.id, s]));
      storeRepository.save(storeId, map);
      setError('');
    } catch {
      setError(intl.formatMessage({ id: 'STORES.LIFECYCLE_ERROR' }));
    }
  }

  return (
    <StoreList
      stores={stores}
      isOnline={isOnline}
      isDegraded={isDegraded}
      isSuperAdmin={isSuperAdmin}
      error={error}
      onCreate={() => navigate('/management/stores/create')}
      onEdit={(id) => navigate(`/management/stores/edit/${id}`)}
      onActivate={(id) => handleLifecycleAction(storeHttpService.activateStore, id)}
      onApprove={(id) => handleLifecycleAction(storeHttpService.approveStore, id)}
      onDisapprove={(id) => handleLifecycleAction(storeHttpService.disapproveStore, id)}
      onDeactivate={(id) => handleLifecycleAction(storeHttpService.deactivateStore, id)}
    />
  );
}

export default StoreListPage;
