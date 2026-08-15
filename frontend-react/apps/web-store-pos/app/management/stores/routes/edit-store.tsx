import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures, success } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { hasOwnersAvailableFeature } from '~/shared/lib/auth/authorization-service';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { StoreForm } from '~/management/stores/components/store-form';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { mergeStoreModules } from '~/management/stores/lib/store-modules';
import type { Store, Module, Owner } from '@store-mgmt/domain';

export const clientLoader = adminFeatureLoader([EFeatures.Stores]);

interface EditStorePageProps {
  /**
   * Plan split (management stores): the store-DATA update view passes false —
   * the PlanPicker is not rendered, the module catalog is not fetched, and the
   * save omits `moduleIds` (backend leaves the plan untouched). Create mode
   * always includes the plan (module selection happens at birth). Defaults to
   * true.
   */
  includePlan?: boolean;
}

/**
 * Unified create/update-store page — Angular parity (edit-store.component.ts:53,
 * getHeader():62-63). `storeId` resolves from the route param first, falling
 * back to `user.selectedStoreId`. Truthiness of `storeId` alone decides create
 * vs. edit — NOT the URL. This intentionally means a store-admin with a
 * `selectedStoreId` hitting `/management/stores/create` lands in EDIT mode of
 * their own store, matching Angular byte-for-byte (`params.id ||
 * currentUser.selectedStoreId`).
 *
 * Route split: `management/stores/create` renders this page with the plan
 * (creation needs module selection); `management/stores/update` and
 * `management/stores/edit/:id` render it with `includePlan={false}` via the
 * thin UpdateStorePage wrapper. The PLAN view itself lives on its own page
 * (`store-plan.tsx`) at `management/stores`.
 *
 * HTTP-only data access (Req: HTTP-Only Data Access): Angular's `store.service.ts`
 * is pure HTTP with no local cache — no `BaseRepository`/offline-cache layer
 * here either, and no offline/degraded notice at any connectivity state.
 */
export function EditStorePage({ includePlan = true }: EditStorePageProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const { id: paramId } = useParams<{ id: string }>();
  const { user, getUserByToken } = useAuthStore();

  const storeId = paramId ?? user?.selectedStoreId ?? '';
  const isEditMode = Boolean(storeId);
  const isSuperAdmin = user?.isSuperAdmin ?? false;
  // Angular: isOwnerAdmin = isSuperAdmin || authorizationService.hasOwnersAvailableFeature()
  const isOwnerAdmin = user ? (isSuperAdmin || hasOwnersAvailableFeature(user)) : false;

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
        includePlan
          ? storeHttpService.getModulesToStore()
          : Promise.resolve(success([] as Module[])),
        (isSuperAdmin || isOwnerAdmin) ? storeHttpService.listOwners() : Promise.resolve(success([] as Owner[])),
      ])
        .then(([storeRes, modulesRes, ownersRes]) => {
          if (!storeRes.succeeded || !modulesRes.succeeded || !ownersRes.succeeded) {
            setLoadError(intl.formatMessage({ id: 'STORES.ERROR' }));
            return;
          }
          const fetchedStore = storeRes.data;
          // Merge store.modules into catalog: selected=true, price overrides
          setStore(fetchedStore);
          setModules(
            includePlan ? mergeStoreModules(modulesRes.data, fetchedStore.modules) : []
          );
          setOwners(ownersRes.data);
          setLoadError('');
        })
        .catch((error) => {
          setLoadError(intl.formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
        });
    } else if (includePlan) {
      Promise.all([
        storeHttpService.getModulesToStore(),
        (isSuperAdmin || isOwnerAdmin) ? storeHttpService.listOwners() : Promise.resolve(success([] as Owner[])),
      ])
        .then(([modulesRes, ownersRes]) => {
          if (!modulesRes.succeeded || !ownersRes.succeeded) {
            setCatalogError(intl.formatMessage({ id: 'STORES.ERROR' }));
            return;
          }
          setModules(modulesRes.data);
          setOwners(ownersRes.data);
          setCatalogError('');
        })
        .catch((error) => {
          setCatalogError(intl.formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
        });
    }
    // includePlan=false with no storeId is the update view without a selected
    // store — the render branch below shows STORES.NO_STORE_SELECTED.
  }, [isEditMode, storeId, isSuperAdmin, isOwnerAdmin, includePlan, intl]);

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
    if (submitDisabled) return;
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
          // Data-only update (includePlan=false): omit moduleIds (plan is
          // untouched) and omit an empty paymentStartDate — an empty string
          // would fail DateOnly binding; the backend only applies non-null.
          ...(includePlan
            ? { paymentStartDate: values.paymentStartDate, moduleIds: values.moduleIds }
            : { paymentStartDate: values.paymentStartDate || undefined }),
          isActive: values.isActive,
        });
        // Angular parity: after edit, refresh user session via the consolidated
        // getUserByToken() action (auth-store.ts) — no page reload.
        try {
          await getUserByToken();
        } catch {
          // Non-critical: session refresh failure should not block navigation
        }
        if (includePlan) {
          navigate('/management/stores');
        }
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
    } catch (error) {
      setError(intl.formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    } finally {
      setIsLoading(false);
    }
  }

  if (!isEditMode && !includePlan) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-gray-500">
          {intl.formatMessage({ id: 'STORES.NO_STORE_SELECTED' })}
        </p>
      </div>
    );
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
        submitDisabled={submitDisabled}
        isLoading={isLoading}
        isSuperAdmin={isSuperAdmin}
        isOwnerAdmin={isOwnerAdmin}
        isEditMode={isEditMode}
        includePlan={includePlan}
        onSubmit={handleSubmit}
        error={error}
      />
    </div>
  );
}

export default EditStorePage;
