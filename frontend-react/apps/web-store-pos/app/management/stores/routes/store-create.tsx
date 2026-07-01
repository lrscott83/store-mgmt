import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { isUserAuthorized } from '~/shared/lib/auth/authorization-service';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { StoreForm } from '~/management/stores/components/store-form';
import type { Module, Owner } from '@store-mgmt/domain';

export const clientLoader = adminFeatureLoader([EFeatures.Stores]);

export function StoreCreatePage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const { user } = useAuthStore();

  const isSuperAdmin = user?.isSuperAdmin ?? false;
  // Angular: isOwnerAdmin = isSuperAdmin || authorizationService.hasOwnersAvailableFeature()
  // hasOwnersAvailableFeature() = isUserAuthorize([EFeatures.Owners])
  const isOwnerAdmin = user ? (isSuperAdmin || isUserAuthorized(user, [EFeatures.Owners], undefined)) : false;

  const [modules, setModules] = useState<Module[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      storeHttpService.listModulesToStore(),
      (isSuperAdmin || isOwnerAdmin) ? storeHttpService.listOwners() : Promise.resolve({ data: [] as Owner[] }),
    ])
      .then(([modulesRes, ownersRes]) => {
        setModules(modulesRes.data);
        setOwners(ownersRes.data);
        setCatalogError('');
      })
      .catch(() => {
        setCatalogError(intl.formatMessage({ id: 'STORES.ERROR' }));
      });
  }, [isSuperAdmin, isOwnerAdmin, intl]);

  const submitDisabled = !!catalogError;

  async function handleSubmit(values: {
    name: string;
    address: string;
    description: string;
    ownerId: string;
    approved: boolean;
    paymentStartDate: string;
    isActive: boolean;
    moduleIds: number[];
  }) {
    if (!isOnline) return;
    setError('');
    setIsLoading(true);
    try {
      await storeHttpService.createStore({
        ownerId: values.ownerId,
        name: values.name,
        address: values.address,
        description: values.description,
        approved: values.approved,
        moduleIds: values.moduleIds,
      });
      navigate('/management/users/create/');
    } catch {
      setError(intl.formatMessage({ id: 'STORES.ERROR' }));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'STORES.CREATE_TITLE' })}
      </h1>
      {catalogError && (
        <p role="alert" className="text-sm text-red-600">{catalogError}</p>
      )}
      <StoreForm
        modules={modules}
        owners={owners}
        isOnline={isOnline && !submitDisabled}
        isLoading={isLoading}
        isSuperAdmin={isSuperAdmin}
        isOwnerAdmin={isOwnerAdmin}
        isEditMode={false}
        onSubmit={handleSubmit}
        error={error}
      />
    </div>
  );
}

export default StoreCreatePage;
