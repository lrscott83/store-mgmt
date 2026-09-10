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
import type { Store, Owner, Plan } from '@store-mgmt/domain';

export const clientLoader = adminFeatureLoader([EFeatures.Stores]);

interface EditStorePageProps {
  /**
   * Mode split (management stores): this page serves BOTH the create route and
   * the data-only update/edit routes. The flag marks a CREATE-capable instance:
   * with no storeId it renders the create form; without it (`false`, update
   * view) it renders STORES.NO_STORE_SELECTED instead. Editing the data view
   * also stays on the page (no redirect to the plan page). Defaults to true.
   */
  allowCreate?: boolean;
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
 * Plan split: the store-DATA form never touches the plan — no module catalog,
 * no PlanPicker, and edit saves omit `moduleIds` (the backend leaves the plan
 * untouched). A CREATED store is born on the Superior plan: the container
 * resolves the Superior plan's member module ids once from the plan catalog
 * (`GET /v1/plans`) and sends them with the create payload — the backend
 * requires a non-empty `moduleIds` and grants exactly those modules, while the
 * store entity's plan defaults to Superior (`CreateStoreService`). The PLAN
 * view lives on its own page (`store-plan.tsx`) at `management/stores`, and
 * owners reach it from the list and from a plan modal in my-stores.
 *
 * HTTP-only data access (Req: HTTP-Only Data Access): Angular's `store.service.ts`
 * is pure HTTP with no local cache — no `BaseRepository`/offline-cache layer
 * here either, and no offline/degraded notice at any connectivity state.
 */
export function EditStorePage({ allowCreate = true }: EditStorePageProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const { id: paramId } = useParams<{ id: string }>();
  const { user, getUserByToken } = useAuthStore();

  const storeId = paramId ?? user?.selectedStoreId ?? '';
  const isEditMode = Boolean(storeId);
  const isSuperAdmin = user?.isSuperAdmin ?? false;
  // Angular: isOwnerAdmin = isSuperAdmin || authorizationService.hasOwnersAvailableFeature()
  const isOwnerAdmin = user ? isSuperAdmin || hasOwnersAvailableFeature(user) : false;

  const [store, setStore] = useState<Store | undefined>(undefined);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [superiorModuleIds, setSuperiorModuleIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEditMode) {
      Promise.all([
        storeHttpService.getStore(storeId),
        isSuperAdmin || isOwnerAdmin
          ? storeHttpService.listOwners()
          : Promise.resolve(success([] as Owner[])),
      ])
        .then(([storeRes, ownersRes]) => {
          if (!storeRes.succeeded || !ownersRes.succeeded) {
            setLoadError(intl.formatMessage({ id: 'STORES.ERROR' }));
            return;
          }
          setStore(storeRes.data);
          setOwners(ownersRes.data);
          setLoadError('');
        })
        .catch((error) => {
          setLoadError(intl.formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
        });
    } else if (allowCreate) {
      Promise.all([
        isSuperAdmin || isOwnerAdmin
          ? storeHttpService.listOwners()
          : Promise.resolve(success([] as Owner[])),
        storeHttpService.getPlans(),
      ])
        .then(([ownersRes, plansRes]) => {
          if (!ownersRes.succeeded || !plansRes.succeeded) {
            setLoadError(intl.formatMessage({ id: 'STORES.ERROR' }));
            return;
          }
          setOwners(ownersRes.data);
          const superior = plansRes.data.find((plan: Plan) => plan.planType === 'Superior');
          if (!superior) {
            setLoadError(intl.formatMessage({ id: 'STORES.ERROR' }));
            return;
          }
          setSuperiorModuleIds(superior.modules.map((m) => m.moduleId));
          setLoadError('');
        })
        .catch((error) => {
          setLoadError(intl.formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
        });
    }
    // allowCreate=false with no storeId is the update view without a selected
    // store — the render branch below shows STORES.NO_STORE_SELECTED.
  }, [isEditMode, storeId, isSuperAdmin, isOwnerAdmin, allowCreate, intl]);

  async function handleSubmit(values: {
    name: string;
    address: string;
    description: string;
    ownerId: string;
    approved: boolean;
    paymentStartDate: string;
    isActive: boolean;
  }) {
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
          // Data-only save: omit moduleIds (the plan is untouched) and omit an
          // empty paymentStartDate — an empty string would fail DateOnly
          // binding; the backend only applies non-null.
          paymentStartDate: values.paymentStartDate || undefined,
          isActive: values.isActive,
        });
        // Angular parity: after edit, refresh user session via the consolidated
        // getUserByToken() action (auth-store.ts) — no page reload.
        try {
          await getUserByToken();
        } catch {
          // Non-critical: session refresh failure should not block navigation
        }
        if (allowCreate) {
          navigate('/management/stores');
        }
      } else {
        await storeHttpService.createStore({
          ownerId: values.ownerId,
          name: values.name,
          address: values.address,
          description: values.description,
          approved: values.approved,
          // Birth provisioning: the store is created on the Superior plan — the
          // container resolves its member module ids from GET /v1/plans and the
          // backend grants exactly those modules (CreateStoreService).
          moduleIds: superiorModuleIds,
        });
        navigate('/management/users/create/');
      }
    } catch (error) {
      setError(intl.formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    } finally {
      setIsLoading(false);
    }
  }

  if (!isEditMode && !allowCreate) {
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
        <p role="alert" className="text-sm text-red-600">
          {loadError}
        </p>
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
      <StoreForm
        owners={owners}
        initialValues={store}
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
