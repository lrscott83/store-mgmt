import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { mergeStoreModules } from '~/management/stores/lib/store-modules';
import { OwnerStoreCard } from '~/management/stores/components/owner-store-card';
import { EditStoreModal } from '~/management/stores/components/edit-store-modal';
import { EditPlanModal } from '~/management/stores/components/edit-plan-modal';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { confirmDialog } from '~/shared/lib/blocking-alert';
import { showToastSuccess } from '~/shared/lib/toast';
import type { Module, OwnerStoreWithPlan } from '@store-mgmt/domain';

export const clientLoader = featureLoader([EFeatures.Stores]);

/**
 * Owner's "my stores" cards view (docs/plans/2026-09-08-owner-stores-cards-plan.md):
 * every store the current user owns — active AND inactive — rendered as cards with
 * plan type, next billing date and the paid total (struck-through when discounted).
 * The gear exposes "Editar" (name + isActive popup) and "Editar el plan" (the same
 * plan view logic as store-plan.tsx, inside a modal — P3). The store-plan page
 * itself is untouched (P4).
 *
 * HTTP-only data access, same as every other management-stores route.
 */
export function MyStoresPage() {
  const intl = useIntl();
  const { user, getUserByToken } = useAuthStore();
  const isSuperAdmin = user?.isSuperAdmin ?? false;

  const [stores, setStores] = useState<OwnerStoreWithPlan[]>([]);
  const [catalog, setCatalog] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [editingStore, setEditingStore] = useState<OwnerStoreWithPlan | null>(null);
  const [planStore, setPlanStore] = useState<OwnerStoreWithPlan | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [storesRes, catalogRes] = await Promise.all([
        storeHttpService.getMyStores(),
        storeHttpService.getModulesToStore(),
      ]);
      if (!storesRes.succeeded || !catalogRes.succeeded) {
        setError(intl.formatMessage({ id: 'STORES.ERROR' }));
        return;
      }
      setStores(storesRes.data);
      setCatalog(catalogRes.data);
      setError('');
    } catch (err) {
      setError(intl.formatMessage({ id: httpErrorKey(err, 'STORES.ERROR') }));
    } finally {
      setIsLoading(false);
    }
  }, [intl]);

  useEffect(() => {
    load();
  }, [load]);

  /** Merged catalog for one store — same hydration the plan view uses. */
  const mergedModulesOf = (store: OwnerStoreWithPlan): Module[] =>
    mergeStoreModules(catalog, store.modules);

  async function handleEditSave(values: { name: string; isActive: boolean }) {
    if (!editingStore) return;
    setModalError('');
    setModalBusy(true);
    try {
      // Deactivating needs a confirmation (plan R-1): if the owner deactivates the
      // store their session is on, it disappears from the active listings and
      // store-scoped feature gates may stop matching. The confirm makes that explicit.
      if (!values.isActive && editingStore.isActive) {
        const confirmed = await confirmDialog({
          title: intl.formatMessage({ id: 'STORES.ACTIVATION_CONFIRM_TITLE' }),
          message: intl.formatMessage({ id: 'STORES.ACTIVATION_CONFIRM_DEACTIVATE' }),
          confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
          cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
        });
        if (!confirmed) {
          setModalBusy(false);
          return;
        }
      }
      // Name change rides the general store update (moduleIds omitted — the plan
      // stays untouched, same contract as the store-data update view).
      await storeHttpService.updateStore(editingStore.id, {
        id: editingStore.id,
        name: values.name,
        address: '',
        description: '',
        approved: editingStore.approved,
        paymentStartDate: editingStore.paymentStartDate ?? undefined,
        isActive: editingStore.isActive,
      });
      // Flag change rides the dedicated activation endpoint (isActive is
      // SuperAdmin-only through the general update).
      if (values.isActive !== editingStore.isActive) {
        await storeHttpService.setStoreActivation(editingStore.id, values.isActive);
      }
      setEditingStore(null);
      showToastSuccess(intl.formatMessage({ id: 'STORES.UPDATE_SUCCESS' }));
      await load();
    } catch (err) {
      setModalError(intl.formatMessage({ id: httpErrorKey(err, 'STORES.ACTIVATION_ERROR') }));
    } finally {
      setModalBusy(false);
    }
  }

  async function handlePlanSave(moduleIds: number[]) {
    if (!planStore) return;
    setModalError('');
    setModalBusy(true);
    try {
      // Same save as store-plan.tsx: full store update carrying the module set —
      // the backend applies modules only when moduleIds is present.
      await storeHttpService.updateStore(planStore.id, {
        id: planStore.id,
        name: planStore.name,
        address: '',
        description: '',
        approved: planStore.approved,
        paymentStartDate: planStore.paymentStartDate ?? undefined,
        moduleIds,
        isActive: planStore.isActive,
      });
      setPlanStore(null);
      // Angular parity: refresh the session after a plan save (store-plan.tsx does
      // the same) so feature-driven menus reflect the new module set.
      try {
        await getUserByToken();
      } catch {
        // Non-critical: session refresh failure should not block the save UX.
      }
      showToastSuccess(intl.formatMessage({ id: 'STORES.UPDATE_SUCCESS' }));
      await load();
    } catch (err) {
      setModalError(intl.formatMessage({ id: httpErrorKey(err, 'STORES.ERROR') }));
    } finally {
      setModalBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold" data-testid="my-stores-title">
        {intl.formatMessage({ id: 'STORES.MY_STORES_TITLE' })}
      </h1>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {isLoading && stores.length === 0 && (
        <p className="text-sm text-text-muted">{intl.formatMessage({ id: 'GENERAL.LOADING' })}</p>
      )}

      {!isLoading && !error && stores.length === 0 && (
        <p className="text-sm text-text-muted" data-testid="my-stores-empty">
          {intl.formatMessage({ id: 'STORES.EMPTY_STATE' })}
        </p>
      )}

      {stores.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <OwnerStoreCard
              key={store.id}
              store={store}
              modules={mergedModulesOf(store)}
              onEdit={(s) => {
                setModalError('');
                setEditingStore(s);
              }}
              onEditPlan={(s) => {
                setModalError('');
                setPlanStore(s);
              }}
            />
          ))}
        </div>
      )}

      <EditStoreModal
        open={editingStore !== null}
        store={editingStore}
        onClose={() => setEditingStore(null)}
        onSave={handleEditSave}
        isLoading={modalBusy}
        error={modalError}
      />

      <EditPlanModal
        open={planStore !== null}
        storeId={planStore?.id ?? null}
        modules={planStore ? mergedModulesOf(planStore) : []}
        nextDueDate={planStore?.nextDueDate ?? null}
        isSuperAdmin={isSuperAdmin}
        isLoading={modalBusy}
        error={modalError}
        onClose={() => setPlanStore(null)}
        onSave={handlePlanSave}
      />
    </div>
  );
}

export default MyStoresPage;
