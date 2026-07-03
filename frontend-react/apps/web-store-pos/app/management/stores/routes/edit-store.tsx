import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useOnlineStatus } from '~/shared/lib/hooks/use-online-status';
import { isUserAuthorized } from '~/shared/lib/auth/authorization-service';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { authHttpService } from '~/shared/lib/http/auth-http-service';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import { StoreForm } from '~/management/stores/components/store-form';
import type { Store, Module, Owner } from '@store-mgmt/domain';

const storeRepository = new BaseRepository<Store>('stores', ['paymentStartDate']);

export const clientLoader = adminFeatureLoader([EFeatures.Stores]);

/**
 * Unified edit-store route — Angular parity (edit-store.component.ts:53, getHeader():62-63).
 * All three `/management/stores*` URLs render THIS component: `storeId` resolves from the
 * route param first, falling back to `user.selectedStoreId`. Truthiness of `storeId` alone
 * decides create vs. edit — NOT the URL. This intentionally means a store-admin with a
 * `selectedStoreId` hitting `/management/stores/create` lands in EDIT mode of their own
 * store, matching Angular byte-for-byte (`params.id || currentUser.selectedStoreId`).
 *
 * Phase 1 (structure collapse) keeps `BaseRepository`/`isOnline` plumbing verbatim from the
 * old `store-edit.tsx`/`store-create.tsx` to isolate route-merge risk from the offline-layer
 * removal, which is a separate commit (Phase 2).
 */
export function EditStorePage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { id: paramId } = useParams<{ id: string }>();
  const isOnline = useOnlineStatus();
  const { user, updateUser } = useAuthStore();

  const storeId = paramId ?? user?.selectedStoreId ?? '';
  const isEditMode = Boolean(storeId);
  const isSuperAdmin = user?.isSuperAdmin ?? false;
  // Angular: isOwnerAdmin = isSuperAdmin || authorizationService.hasOwnersAvailableFeature()
  const isOwnerAdmin = user ? (isSuperAdmin || isUserAuthorized(user, [EFeatures.Owners], undefined)) : false;

  const [store, setStore] = useState<Store | undefined>(undefined);
  const [modules, setModules] = useState<Module[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEditMode) {
      Promise.all([
        storeHttpService.getStore(storeId),
        storeHttpService.listModulesToStore(),
        (isSuperAdmin || isOwnerAdmin) ? storeHttpService.listOwners() : Promise.resolve({ data: [] as Owner[] }),
      ])
        .then(([storeRes, modulesRes, ownersRes]) => {
          const fetchedStore = storeRes.data;
          // Merge store.modules into catalog: selected=true, override price overrides
          const storeModuleIds = new Set(fetchedStore.modules.map((m) => m.id));
          const mergedModules = modulesRes.data.map((m) => {
            const storeModule = fetchedStore.modules.find((sm) => sm.id === m.id);
            if (storeModule) {
              return {
                ...m,
                selected: true,
                currentPrice: storeModule.currentPrice,
                price: storeModule.price,
                discountText: storeModule.discountText,
              };
            }
            return { ...m, selected: storeModuleIds.has(m.id) };
          });
          setStore(fetchedStore);
          setModules(mergedModules);
          setOwners(ownersRes.data);
          setLoadError('');
        })
        .catch(() => {
          setLoadError(intl.formatMessage({ id: 'STORES.ERROR' }));
        });
    } else {
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
    }
  }, [isEditMode, storeId, isSuperAdmin, isOwnerAdmin, intl]);

  // In create mode, a catalog-load failure blocks submit (Finding: S-CREATE-5).
  const submitDisabled = isEditMode ? false : !!catalogError;

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
    if (!isOnline || submitDisabled) return;
    setError('');
    setIsLoading(true);
    try {
      if (isEditMode) {
        if (!store) return;
        await storeHttpService.updateStore(storeId, {
          id: storeId,
          name: values.name,
          address: values.address,
          description: values.description,
          approved: values.approved,
          paymentStartDate: values.paymentStartDate,
          moduleIds: values.moduleIds,
          isActive: values.isActive,
        });
        // Cache upsert using merged form object (updateStore returns boolean)
        const selectedStore = user?.selectedStoreId ?? '';
        const updatedStore: Store = {
          ...store,
          name: values.name,
          address: values.address,
          description: values.description,
          approved: values.approved,
          isActive: values.isActive,
        };
        storeRepository.upsert(selectedStore, updatedStore);
        // Angular parity: after edit, refresh user session (getUserByToken equivalent).
        // React-idiomatic: fetch /me and update auth store — no page reload.
        try {
          const freshUser = await authHttpService.getMe();
          updateUser(freshUser);
        } catch {
          // Non-critical: session refresh failure should not block navigation
        }
        navigate('/management/stores');
      } else {
        await storeHttpService.createStore({
          ownerId: values.ownerId,
          name: values.name,
          address: values.address,
          description: values.description,
          approved: values.approved,
          moduleIds: values.moduleIds,
        });
        navigate('/management/users/create/');
      }
    } catch {
      setError(intl.formatMessage({ id: 'STORES.ERROR' }));
    } finally {
      setIsLoading(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4 p-4">
        <p role="alert" className="text-sm text-red-600">{loadError}</p>
      </div>
    );
  }

  // Wait for initial load before mounting the form so initialValues hydrate correctly
  if (isEditMode && !store) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-gray-500">{intl.formatMessage({ id: 'GENERAL.LOADING' })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: isEditMode ? 'STORES.EDIT_TITLE' : 'STORES.CREATE_TITLE' })}
      </h1>
      {!isEditMode && catalogError && (
        <p role="alert" className="text-sm text-red-600">{catalogError}</p>
      )}
      <StoreForm
        modules={modules}
        owners={owners}
        initialValues={store}
        isOnline={isOnline && !submitDisabled}
        isLoading={isLoading}
        isSuperAdmin={isSuperAdmin}
        isOwnerAdmin={isOwnerAdmin}
        isEditMode={isEditMode}
        onSubmit={handleSubmit}
        error={error}
      />
    </div>
  );
}

export default EditStorePage;
