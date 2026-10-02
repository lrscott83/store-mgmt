import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { resellerLoader } from '~/auth/routes/loaders';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { EditPlanModal } from '~/management/stores/components/edit-plan-modal';
import { StoreModulePricingModal } from '~/admin/stores/components/store-module-pricing-modal';
import type { PricingDraft, PricingField } from '~/admin/stores/components/store-module-pricing-modal';
import { groupFeaturesByModuleId } from '~/management/stores/lib/plan-utils';
import { StoreCardList } from '~/admin/stores/components/store-card-list';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { confirmDialog } from '~/shared/lib/blocking-alert';
import { softRefreshSession } from '~/shared/lib/stores/soft-refresh-session';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { showToastSuccess } from '~/shared/lib/toast';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon } from '~/shared/components/ui/icons';
import type { Feature, Plan, Store, StoreModulePricingPayload } from '@store-mgmt/domain';

export const clientLoader = resellerLoader;

/**
 * Draft price text -> the number the payload and the domain formula consume. The draft holds
 * text so a decimal point survives being typed; a half-typed or non-numeric value is 0 here,
 * which the formula clamps at zero rather than turning into NaN in the running total. The
 * backend validator is the authority on the submitted values, not this conversion.
 */
function toPriceNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Sole super-admin store lifecycle list (design.md: "Super-admin lifecycle list stays SOLE
 * at /admin/stores"). Approve/Disapprove now require confirmation before the HTTP call
 * (Angular parity — store-list.component.ts:132-166,169-203, `Swal.fire({... icon: 'question'
 * ...})`), reusing the existing `confirmDialog` primitive instead of a new modal.
 * "Cambiar plan" opens the SAME catalog-driven plan popup as the owner's my-stores view
 * (EditPlanModal + PlanPanels) — the gear item replaced the old Free⇄Paid toggle confirm.
 */
export function AdminStoreListPage() {
  const navigate = useNavigate();
  const { formatMessage } = useIntl();
  // The pricing editor is SuperAdmin-only, but /admin/stores admits ReSellers too
  // (resellerLoader) — hide the gear item for them; the backend enforces the same
  // boundary with 403 on both verbs.
  const isSuperAdmin = useAuthStore((s) => s.user?.isSuperAdmin) === true;
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  // Plan popup state — same shape as MyStoresPage (owner plan change parity).
  const [plans, setPlans] = useState<Plan[]>([]);
  const [featuresByModuleId, setFeaturesByModuleId] = useState<ReadonlyMap<number, Feature[]>>(
    new Map(),
  );
  const [planStore, setPlanStore] = useState<Store | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  // Per-store module pricing editor. The draft lives here, not in the modal, so the modal stays
  // presentational like EditPlanModal and its busy/error surface matches the plan popup exactly.
  // `pricingServerTotal` holds the backend's own total after a save so the modal can present the
  // authoritative number until the operator edits again.
  const [pricingStore, setPricingStore] = useState<Store | null>(null);
  const [pricingRows, setPricingRows] = useState<PricingDraft[]>([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingError, setPricingError] = useState('');
  const [pricingServerTotal, setPricingServerTotal] = useState<number | null>(null);
  // Filter by plan type: 'all' shows all stores, 'not-free' excludes Gratis plan,
  // and specific plan types (VIP, Superior, Pago, Gratis) filter by that plan.
  // Default is 'not-free' to show all paid plans except Gratis.
  const [filter, setFilter] = useState<string>('not-free');

  const load = useCallback(async () => {
    try {
      const [storesRes, plansRes, featuresRes] = await Promise.all([
        storeHttpService.listStores(),
        storeHttpService.getPlans(),
        storeHttpService.getFeaturesToStore(),
      ]);
      if (!storesRes.succeeded || !plansRes.succeeded || !featuresRes.succeeded) {
        setError(formatMessage({ id: 'STORES.ERROR' }));
        return;
      }
      setStores(storesRes.data);
      setPlans(plansRes.data);
      setFeaturesByModuleId(groupFeaturesByModuleId(featuresRes.data));
      setError(undefined);
    } catch (error) {
      setError(formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    }
  }, [formatMessage]);

  useEffect(() => {
    load();
  }, [load]);

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
      await load();
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
      await load();
    } catch (error) {
      setError(formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    }
  }

  function openPlanModal(id: string) {
    const store = stores.find((s) => s.id === id);
    if (!store) return;
    setModalError('');
    setPlanStore(store);
  }

  async function handlePlanActivate(selectedPlan: Plan) {
    if (!planStore || modalBusy) return;
    setModalError('');
    setModalBusy(true);
    try {
      // SuperAdmin-driven plan change — same contract as the owner's plan popup
      // (my-stores.tsx handlePlanActivate): the dedicated change-plan endpoint
      // carries the target plan id, the backend owns module rewriting, the anchor
      // and the next-due pinning. No moduleIds PUT ever fires here.
      await storeHttpService.changeStorePlan(planStore.id, selectedPlan.id);
      setPlanStore(null);
      // Refresh the session after a plan change so feature-driven menus reflect
      // the new module set — ONLINE refresh (getUserByToken is cache-first by
      // design and a plan change issues no new token). Best-effort.
      await softRefreshSession();
      showToastSuccess(formatMessage({ id: 'STORES.UPDATE_SUCCESS' }));
      await load();
    } catch (error) {
      setModalError(formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    } finally {
      setModalBusy(false);
    }
  }

  /**
   * Opens the pricing editor and seeds it from the dedicated per-store read. This is the ONLY
   * request the capability adds: the module catalog is deliberately NOT fetched separately,
   * because `getStoreModulePricing` already returns the identical universe (the backend builds
   * it from the same call as GET /v1/modules/ToStore) plus the store's own state and names. A
   * second fetch would be redundant and could disagree with the rows being edited.
   */
  async function openPricingModal(id: string) {
    const store = stores.find((s) => s.id === id);
    if (!store) return;
    setPricingError('');
    setPricingServerTotal(null);
    setPricingRows([]);
    setPricingStore(store);
    setPricingLoading(true);
    try {
      const pricingRes = await storeHttpService.getStoreModulePricing(store.id);
      if (!pricingRes.succeeded) {
        setPricingError(formatMessage({ id: 'STORES.ERROR' }));
        return;
      }
      setPricingRows(
        pricingRes.data.modules.map((row) => ({
          moduleId: row.moduleId,
          name: row.name,
          isSelected: row.isActive,
          priceIncluded: row.priceIncluded,
          // String() keeps the operator looking at the exact digits the server sent: the
          // backend prices are float32, so 10.1 must not become 10.100000000000001 here.
          price: String(row.price),
          discountPrice: String(row.discountPrice),
          percentDiscountPrice: String(row.percentDiscountPrice),
        })),
      );
    } catch (error) {
      setPricingError(formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    } finally {
      setPricingLoading(false);
    }
  }

  function updatePricingRow(moduleId: number, mutate: (row: PricingDraft) => PricingDraft) {
    // Any edit retires the persisted total: once the draft differs from what was saved, the
    // screen must stop presenting the server's number as if it described the current draft.
    setPricingServerTotal(null);
    setPricingRows((rows) => rows.map((row) => (row.moduleId === moduleId ? mutate(row) : row)));
  }

  function handlePricingToggle(moduleId: number, isSelected: boolean) {
    updatePricingRow(moduleId, (row) => ({ ...row, isSelected }));
  }

  function handlePricingFieldChange(moduleId: number, field: PricingField, value: string) {
    updatePricingRow(moduleId, (row) => ({ ...row, [field]: value }));
  }

  async function handlePricingSave() {
    if (!pricingStore || pricingSaving) return;
    setPricingError('');
    setPricingSaving(true);
    try {
      // The FLAT list, every row ticked or not — never the plan groups. The backend reads a
      // module's absence from the payload as "leave untouched", so a grouped, filtered or
      // deduplicated payload would silently skip rows the operator expected to be saved.
      const payload: StoreModulePricingPayload[] = pricingRows.map((row) => ({
        moduleId: row.moduleId,
        isSelected: row.isSelected,
        price: toPriceNumber(row.price),
        discountPrice: toPriceNumber(row.discountPrice),
        percentDiscountPrice: toPriceNumber(row.percentDiscountPrice),
      }));
      const saved = await storeHttpService.updateStoreModulePricing(pricingStore.id, payload);
      if (!saved.succeeded) {
        setPricingError(formatMessage({ id: 'STORES.ERROR' }));
        return;
      }
      // Reflect the SERVER's state, never the client's: the echoed rows are what was persisted
      // and the total is the backend's own float32 arithmetic, so the two are never compared
      // with ===. The echo carries no name, so the names already in hand are re-joined by id.
      const namesByModuleId = new Map(pricingRows.map((row) => [row.moduleId, row.name]));
      setPricingRows(
        saved.data.modules.map((row) => ({
          moduleId: row.moduleId,
          name: namesByModuleId.get(row.moduleId) ?? '',
          isSelected: row.isActive,
          // Echoed by the save: the flag the rule needs, resolved server-side — never sent.
          priceIncluded: row.priceIncluded,
          price: String(row.price),
          discountPrice: String(row.discountPrice),
          percentDiscountPrice: String(row.percentDiscountPrice),
        })),
      );
      setPricingServerTotal(saved.data.totalCurrentPrice);
      showToastSuccess(formatMessage({ id: 'STORES.UPDATE_SUCCESS' }));
      await load();
    } catch (error) {
      setPricingError(formatMessage({ id: httpErrorKey(error, 'STORES.ERROR') }));
    } finally {
      setPricingSaving(false);
    }
  }

  function getFilteredStores(): Store[] {
    if (filter === 'all') {
      return stores;
    }
    if (filter === 'not-free') {
      return stores.filter((s) => s.planType !== 'Gratis');
    }
    // Filter by specific plan type (VIP, Superior, Pago, Gratis)
    return stores.filter((s) => s.planType === filter);
  }

  function getStoreCountByPlan(): Record<string, number> {
    const counts: Record<string, number> = {
      all: stores.length,
      'not-free': stores.filter((s) => s.planType !== 'Gratis').length,
      VIP: stores.filter((s) => s.planType === 'VIP').length,
      Superior: stores.filter((s) => s.planType === 'Superior').length,
      Pago: stores.filter((s) => s.planType === 'Pago').length,
      Gratis: stores.filter((s) => s.planType === 'Gratis').length,
    };
    return counts;
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

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <PlanFilterButtons
        filter={filter}
        onFilterChange={setFilter}
        storeCountByPlan={getStoreCountByPlan()}
      />

      <StoreCardList
        stores={getFilteredStores()}
        onEdit={(id) => navigate(`/management/stores/edit/${id}`)}
        onApprove={handleApprove}
        onDisapprove={handleDisapprove}
        onChangePlan={openPlanModal}
        onEditModulePricing={isSuperAdmin ? openPricingModal : undefined}
      />

      <EditPlanModal
        open={planStore !== null}
        storeId={planStore?.id ?? null}
        plans={plans}
        storePlanType={planStore?.planType ?? 'Gratis'}
        featuresByModuleId={featuresByModuleId}
        nextDueDate={planStore?.nextPaymentDate ?? null}
        error={modalError}
        onClose={() => setPlanStore(null)}
        onActivate={handlePlanActivate}
      />

      <StoreModulePricingModal
        open={pricingStore !== null}
        storeId={pricingStore?.id ?? null}
        storeName={pricingStore?.name ?? ''}
        plans={plans}
        rows={pricingRows}
        loading={pricingLoading}
        saving={pricingSaving}
        error={pricingError}
        serverTotal={pricingServerTotal}
        onToggle={handlePricingToggle}
        onChangeField={handlePricingFieldChange}
        onClose={() => {
          setPricingStore(null);
          setPricingRows([]);
          setPricingServerTotal(null);
          setPricingError('');
        }}
        onSave={handlePricingSave}
      />
    </div>
  );
}

interface PlanFilterButtonsProps {
  filter: string;
  onFilterChange: (value: string) => void;
  storeCountByPlan: Record<string, number>;
}

const PLAN_FILTER_ORDER = ['VIP', 'Superior', 'Pago', 'Gratis'] as const;

const PLAN_FILTER_KEYS: Record<string, string> = {
  VIP: 'STORES.FILTER_VIP',
  Superior: 'STORES.FILTER_SUPERIOR',
  Pago: 'STORES.FILTER_PAID',
  Gratis: 'STORES.FILTER_FREE',
};

function PlanFilterButtons({ filter, onFilterChange, storeCountByPlan }: PlanFilterButtonsProps) {
  const { formatMessage } = useIntl();

  const plans: { value: string; labelKey: string; count: number }[] = [
    { value: 'all', labelKey: 'STORES.FILTER_ALL', count: storeCountByPlan.all },
    { value: 'not-free', labelKey: 'STORES.FILTER_NOT_FREE', count: storeCountByPlan['not-free'] },
    ...PLAN_FILTER_ORDER.map((planType) => ({
      value: planType,
      labelKey: PLAN_FILTER_KEYS[planType],
      count: storeCountByPlan[planType],
    })),
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {plans.map(({ value, labelKey, count }) => (
        <Button
          key={value}
          variant={filter === value ? 'primary' : 'secondary'}
          onClick={() => onFilterChange(value)}
          className="transition-colors text-sm"
        >
          <span className="flex items-center gap-1">
            {formatMessage({ id: labelKey })}
            {count > 0 && (
              <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-text-muted">
                {count}
              </span>
            )}
          </span>
        </Button>
      ))}
    </div>
  );
}

export default AdminStoreListPage;
