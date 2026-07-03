import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { Expense } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
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

  function loadExpenses() {
    const svc = new ExpenseOfflineService(storeId);
    setExpenses(svc.getActiveToday());
  }

  useEffect(() => {
    loadExpenses();
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
    try {
      if (id) {
        svc.update(id, {
          type: data.type,
          total: data.total,
          date: new Date(data.date),
          paymentType: data.paymentType,
          note: data.note,
        });
      } else {
        svc.create({
          type: data.type,
          total: data.total,
          date: new Date(data.date),
          paymentType: data.paymentType,
          note: data.note,
        });
      }
      loadExpenses();
      setIsModalOpen(false);
      setEditingExpense(undefined);
      setModalError('');
    } catch {
      // Angular parity: update's only failure branch is not-found (ExpenseErrors.NotExists).
      // Never surface the internal Error.message sentinel to the user.
      setModalError(intl.formatMessage({ id: 'EXPENSE_ERRORS.NOT_EXISTS' }));
    }
  }

  function handleDeleteRequest(expense: Expense) {
    setDeleteConfirmId(expense.id);
  }

  function handleDeleteConfirm() {
    if (!deleteConfirmId) return;
    const svc = new ExpenseOfflineService(storeId);
    svc.delete(deleteConfirmId);
    setDeleteConfirmId(null);
    loadExpenses();
  }

  const runningTotal = expenses.reduce((sum, e) => sum + e.total, 0);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'EXPENSES.TODAY.TITLE' })}
        </h1>
        <button
          onClick={openCreate}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {intl.formatMessage({ id: 'EXPENSES.ADD_BUTTON' })}
        </button>
      </div>

      <div className="rounded border bg-blue-50 px-4 py-2 text-sm font-medium text-blue-900">
        {intl.formatMessage({ id: 'EXPENSES.RUNNING_TOTAL' }, { total: runningTotal.toFixed(2) })}
      </div>

      <ExpenseList
        expenses={expenses}
        allowDelete={true}
        onEdit={openEdit}
        onDelete={handleDeleteRequest}
      />

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
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <p className="mb-4 text-sm text-gray-700">
              {intl.formatMessage({ id: 'EXPENSES.DELETE_CONFIRM' })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 rounded bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                {intl.formatMessage({ id: 'GENERAL.CONFIRM' })}
              </button>
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TodayExpensesPage;
