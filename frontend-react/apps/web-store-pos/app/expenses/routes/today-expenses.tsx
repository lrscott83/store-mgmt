import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { Expense } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon } from '~/shared/components/ui/icons';
import { ExpenseOfflineService } from '../lib/services/expense-offline-service';
import { ExpenseList } from '../components/expense-list';
import { ExpenseFormModal } from '../components/expense-form-modal';
import type { ExpenseFormInput } from '../components/expense-form-modal';

export const clientLoader = featureLoader([EFeatures.TodayExpenses]);

export function TodayExpensesPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>();
  const [modalError, setModalError] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Angular parity (expenses-today.component.ts:28): loads today's expenses via
  // getExpensesInDayObservable(new Date()) and unwraps the BaseResponseModel `.data`.
  async function loadExpenses() {
    const svc = new ExpenseOfflineService(storeId);
    const response = await svc.getExpensesInDayObservable(new Date());
    setExpenses(response.data);
  }

  useEffect(() => {
    void loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  function openCreate() {
    setEditingExpense(undefined);
    setModalError('');
    setIsModalOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditingExpense(expense);
    setModalError('');
    setIsModalOpen(true);
  }

  function handleSave(data: ExpenseFormInput, id?: string) {
    const svc = new ExpenseOfflineService(storeId);
    // Angular parity (edit-expense-modal.component.ts:60-68): create/update return
    // DataResult<Expense>; the component branches on `.succeeded`. update's only failure branch
    // is not-found (ExpenseErrors.NotExists) — surfaced as the localized message, never the
    // internal error code.
    const result = id
      ? // Angular parity: updateExpense always reuses `this.expense.date` unchanged — the
        // `date` field is intentionally omitted from the patch so `update()`'s
        // `{...existing, ...patch}` merge preserves the original date.
        svc.update(id, {
          type: data.type,
          total: data.total,
          paymentType: data.paymentType,
          note: data.note,
        })
      : // Angular parity: createExpense always uses `new Date()` — never a user-editable date.
        svc.create({
          type: data.type,
          total: data.total,
          date: new Date(),
          paymentType: data.paymentType,
          note: data.note,
        });

    if (!result.succeeded) {
      setModalError(intl.formatMessage({ id: 'EXPENSE_ERRORS.NOT_EXISTS' }));
      return;
    }

    void loadExpenses();
    setIsModalOpen(false);
    setEditingExpense(undefined);
    setModalError('');
  }

  function handleDeleteRequest(expense: Expense) {
    setDeleteConfirmId(expense.id);
  }

  function handleDeleteConfirm() {
    if (!deleteConfirmId) return;
    const svc = new ExpenseOfflineService(storeId);
    // Angular parity (expense-list.component.ts:64): deleteExpense is the real soft-delete
    // command, called fire-and-forget (its Result is ignored — the id always exists, coming
    // straight from the rendered list).
    svc.deleteExpense(deleteConfirmId);
    setDeleteConfirmId(null);
    void loadExpenses();
  }

  return (
    <Card
      title={
        <div className="flex items-center justify-between">
          <span>{intl.formatMessage({ id: 'EXPENSES.TODAY.TITLE' })}</span>
          <Button variant="fab" onClick={openCreate}>
            <PlusIcon />
            {intl.formatMessage({ id: 'EXPENSES.ADD_BUTTON' })}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Angular parity: expenses-today.component.html is just the card header +
            empty-state/list — no running-total banner. The React-only banner was removed
            per the Stage 3 strict-parity decision. */}
        {expenses.length === 0 ? (
          <InfoBox variant="primary" className="text-center">
            {intl.formatMessage({ id: 'EXPENSES.EMPTY_STATE' })}
          </InfoBox>
        ) : (
          <ExpenseList
            expenses={expenses}
            readOnly={false}
            onEdit={openEdit}
            onDelete={handleDeleteRequest}
          />
        )}
      </div>

      <ExpenseFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingExpense(undefined);
        }}
        onSave={handleSave}
        expense={editingExpense}
        error={modalError}
      />

      {/* Delete confirmation */}
      {deleteConfirmId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        >
          <div className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-xl">
            <p className="mb-4 text-sm text-text">
              {intl.formatMessage({ id: 'EXPENSES.DELETE_CONFIRM' })}
            </p>
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={handleDeleteConfirm}>
                {intl.formatMessage({ id: 'GENERAL.CONFIRM' })}
              </Button>
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default TodayExpensesPage;
