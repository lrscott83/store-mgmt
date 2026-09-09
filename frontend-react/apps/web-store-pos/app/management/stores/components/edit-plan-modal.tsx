import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Module } from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon } from '~/shared/components/ui/icons';
import { PlanPicker } from './plan-picker';
import { formatDateOnly } from '~/shared/lib/date-utils';

interface EditPlanModalProps {
  open: boolean;
  /** Store whose plan is being edited (null = closed). */
  storeId: string | null;
  /** Catalog merged with the store's snapshot (mergeStoreModules) — same hydration as the plan view. */
  modules: Module[];
  /** Same nextDueDate the card shows — rendered above the picker like store-plan.tsx. */
  nextDueDate: string | null;
  isSuperAdmin: boolean;
  isLoading?: boolean;
  error?: string;
  onClose: () => void;
  /** Fires with the full module id set, same shape store-plan.tsx sends to updateStore. */
  onSave: (moduleIds: number[]) => void;
}

/**
 * "Editar el plan" popup of the owner's my-stores card (owner-stores-cards plan,
 * P3): the SAME plan view logic as store-plan.tsx, rendered inside a modal —
 * PlanPicker hydrated from the merged catalog, next billing date above it (paid
 * plan only) and the DG-7 readOnly lock (readOnly = !isSuperAdmin && isOnPaidPlan).
 */
export function EditPlanModal({
  open,
  storeId,
  modules,
  nextDueDate,
  isSuperAdmin,
  isLoading = false,
  error,
  onClose,
  onSave,
}: EditPlanModalProps) {
  const intl = useIntl();
  const [moduleIds, setModuleIds] = useState<number[]>([]);

  // Hydrate the selection when the popup opens for a store: same init as
  // store-plan.tsx (free + selected paid modules of the merged catalog).
  useEffect(() => {
    if (open) {
      setModuleIds(modules.filter((m) => m.priceIncluded || m.selected).map((m) => m.id));
    }
    // modules arrives merged per store; re-hydrate whenever the popup opens or
    // the merged set changes (store switch while open is not possible — gear
    // closes the menu, but a refresh can swap the arrays).
  }, [open, modules]);

  if (!open || !storeId) return null;

  const isOnPaidPlan = modules.some((m) => !m.priceIncluded && m.selected);

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid={`owner-store-plan-modal-${storeId}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">
            {intl.formatMessage({ id: 'STORES.EDIT_PLAN_TITLE' })}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          >
            <CloseIcon />
          </button>
        </div>

        {isOnPaidPlan && nextDueDate && (
          <p
            data-testid={`owner-plan-next-billing-date-${storeId}`}
            className="mb-3 rounded border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800"
          >
            {intl.formatMessage({ id: 'STORES.PLAN.NEXT_BILLING_DATE' })}:{' '}
            <span className="font-semibold">{formatDateOnly(nextDueDate)}</span>
          </p>
        )}

        <PlanPicker
          modules={modules}
          onChange={setModuleIds}
          readOnly={!isSuperAdmin && isOnPaidPlan}
        />

        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Button variant="fab" onClick={onClose}>
            <CloseIcon />
            {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          </Button>
          <Button
            variant="fab"
            className="flex-1 justify-center"
            disabled={isLoading}
            onClick={() => onSave(moduleIds)}
            data-testid={`owner-plan-save-${storeId}`}
          >
            {intl.formatMessage({ id: isLoading ? 'STORES.SAVING' : 'STORES.SAVE' })}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default EditPlanModal;
