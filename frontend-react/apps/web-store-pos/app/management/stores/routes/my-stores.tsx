import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures, EModules } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { mergeStoreModules } from '~/management/stores/lib/store-modules';
import { groupFeaturesByModuleId, planModuleIdsForActivation } from '~/management/stores/lib/plan-utils';
import { OwnerStoreCard } from '~/management/stores/components/owner-store-card';
import { EditStoreModal } from '~/management/stores/components/edit-store-modal';
import { EditPlanModal } from '~/management/stores/components/edit-plan-modal';
import { CreateStoreModal } from '~/management/stores/components/create-store-modal';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon } from '~/shared/components/ui/icons';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { confirmDialog } from '~/shared/lib/blocking-alert';
import { showToastSuccess } from '~/shared/lib/toast';
import type { Feature, Module, OwnerStoreWithPlan, Plan } from '@store-mgmt/domain';

export const clientLoader = featureLoader([EFeatures.Stores]);

/**
 * Owner's "my stores" cards view (docs/plans/2026-09-08-owner-stores-cards-plan.md):
 * every store the current user owns — active AND inactive — rendered as cards with
 * plan type, next billing date and the paid total (struck-through when discounted).
 * The gear exposes "Editar" (name + isActive popup) and "Editar el plan" (the same
 * catalog-driven plan panels as store-plan.tsx, inside a modal). The store-plan
 * page itself is untouched (P4).
 *
 * HTTP-only data access, same as every other management-stores route.
 */
export function MyStoresPage() {
  const intl = useIntl();
  const { user, getUserByToken } = useAuthStore();
  const isSuperAdmin = user?.isSuperAdmin ?? false;
  // Gate MultiStores (módulo 14): solo los propietarios con el módulo activo en
  // la tienda seleccionada (patrón store-switcher) pueden crear otra tienda.
  const hasMultiStores = (user?.storeModuleIds ?? []).includes(EModules.MultiStores);

  const [stores, setStores] = useState<OwnerStoreWithPlan[]>([]);
  const [catalog, setCatalog] = useState<Module[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [featuresByModuleId, setFeaturesByModuleId] = useState<ReadonlyMap<number, Feature[]>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<OwnerStoreWithPlan | null>(null);
  const [planStore, setPlanStore] = useState<OwnerStoreWithPlan | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [storesRes, catalogRes, plansRes, featuresRes] = await Promise.all([
        storeHttpService.getMyStores(),
        storeHttpService.getModulesToStore(),
        storeHttpService.getPlans(),
        storeHttpService.getFeaturesToStore(),
      ]);
      if (!storesRes.succeeded || !catalogRes.succeeded || !plansRes.succeeded || !featuresRes.succeeded) {
        setError(intl.formatMessage({ id: 'STORES.ERROR' }));
        return;
      }
      setStores(storesRes.data);
      setCatalog(catalogRes.data);
      setPlans(plansRes.data);
      setFeaturesByModuleId(groupFeaturesByModuleId(featuresRes.data));
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

  /** Merged catalog for one store card — the card's price lines hydrate from it. */
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

  async function handleCreateStore(values: { name: string }) {
    setModalError('');
    setModalBusy(true);
    try {
      // Owner-branch contract (owner-multistores store-creation): body ownerId is
      // the zero-Guid — the backend derives the caller's own owner, forces
      // approved=true and inherits the selected store's modules.
      await storeHttpService.createStore({
        ownerId: '00000000-0000-0000-0000-000000000000',
        name: values.name,
        address: '',
        description: '',
        approved: true,
        moduleIds: [],
      });
      setIsCreateOpen(false);
      showToastSuccess(intl.formatMessage({ id: 'STORES.CREATE_SUCCESS' }));
      await load();
    } catch (err) {
      setModalError(intl.formatMessage({ id: httpErrorKey(err, 'STORES.ERROR') }));
    } finally {
      setModalBusy(false);
    }
  }

  async function handlePlanActivate(selectedPlan: Plan) {
    if (!planStore) return;
    setModalError('');
    setModalBusy(true);
    try {
      // Immediate per-panel activation, same contract as store-plan.tsx: the full
      // store update carries the free + chosen-plan module union — the backend
      // applies modules only when moduleIds is present.
      await storeHttpService.updateStore(planStore.id, {
        id: planStore.id,
        name: planStore.name,
        address: '',
        description: '',
        approved: planStore.approved,
        paymentStartDate: planStore.paymentStartDate ?? undefined,
        planId: selectedPlan.id,
        moduleIds: planModuleIdsForActivation(plans, selectedPlan),
        isActive: planStore.isActive,
      });
      setPlanStore(null);
      // Angular parity: refresh the session after a plan change (store-plan.tsx does
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold" data-testid="my-stores-title">
          {intl.formatMessage({ id: 'STORES.MY_STORES_TITLE' })}
        </h1>
        {hasMultiStores && (
          <Button
            variant="fab"
            onClick={() => {
              setModalError('');
              setIsCreateOpen(true);
            }}
            data-testid="my-stores-create-button"
          >
            <PlusIcon />
            {intl.formatMessage({ id: 'STORES.CREATE_STORE_BUTTON' })}
          </Button>
        )}
      </div>

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

      <CreateStoreModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSave={handleCreateStore}
        isLoading={modalBusy}
        error={modalError}
      />

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
        plans={plans}
        storePlanType={planStore?.planType ?? 'Gratis'}
        featuresByModuleId={featuresByModuleId}
        nextDueDate={planStore?.nextDueDate ?? null}
        isSuperAdmin={isSuperAdmin}
        error={modalError}
        onClose={() => setPlanStore(null)}
        onActivate={handlePlanActivate}
      />
    </div>
  );
}

export default MyStoresPage;