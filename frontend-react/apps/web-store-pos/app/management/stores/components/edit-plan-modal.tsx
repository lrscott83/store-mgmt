import { useIntl } from 'react-intl';
import type { Feature, Plan } from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon } from '~/shared/components/ui/icons';
import { PlanPanels } from './plan-panels';
import { formatDateOnly } from '~/shared/lib/date-utils';

interface EditPlanModalProps {
  open: boolean;
  /** Store whose plan is being edited (null = closed). */
  storeId: string | null;
  /** Real plan catalog from GET /v1/plans — the three collapsible panels. */
  plans: Plan[];
  /** The store's backend-serialized planType — decides the expanded panel. */
  storePlanType: string;
  /** Real Feature catalog grouped by ModuleId for the "?" tooltips. */
  featuresByModuleId: ReadonlyMap<number, Feature[]>;
  /** Same nextDueDate the card shows — rendered above the panels like store-plan.tsx. */
  nextDueDate: string | null;
  /** Inline activation error — kept by the parent, rendered by PlanPanels (no close on failure). */
  error?: string;
  onClose: () => void;
  /** Fires with the chosen Plan — the parent performs changeStorePlan + session refresh + close. */
  onActivate: (plan: Plan) => void;
}

/**
 * "Editar el plan" popup of the owner's my-stores card: the SAME catalog-driven
 * plan view logic as store-plan.tsx, rendered inside a modal — PlanPanels
 * hydrated from the real catalog, next billing date above them (paid plan only).
 * The DG-7 readOnly lock is gone: the owner of the store can change its plan at
 * any time (the backend ownership guard is the only authority). Activation is
 * immediate: no module selection, no Guardar footer — the parent calls the
 * change-plan endpoint, refreshes the session and closes the modal.
 */
export function EditPlanModal({
  open,
  storeId,
  plans,
  storePlanType,
  featuresByModuleId,
  nextDueDate,
  error,
  onClose,
  onActivate,
}: EditPlanModalProps) {
  const intl = useIntl();

  if (!open || !storeId) return null;

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

        {storePlanType !== 'Gratis' && nextDueDate && (
          <p
            data-testid={`owner-plan-next-billing-date-${storeId}`}
            className="mb-3 rounded border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800"
          >
            {intl.formatMessage({ id: 'STORES.PLAN.NEXT_BILLING_DATE' })}:{' '}
            <span className="font-semibold">{formatDateOnly(nextDueDate)}</span>
          </p>
        )}

        <PlanPanels
          plans={plans}
          storePlanType={storePlanType}
          featuresByModuleId={featuresByModuleId}
          onActivate={onActivate}
          activationError={error}
        />

        <div className="mt-4 flex justify-end">
          <Button variant="fab" onClick={onClose}>
            <CloseIcon />
            {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default EditPlanModal;
