import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { Expense } from '@store-mgmt/domain';
import { EFeatures, ExpenseType } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { ExpenseOfflineService } from '../lib/services/expense-offline-service';
import { ExpenseList } from '../components/expense-list';
import { ExpenseFilters } from '../components/expense-filters';
import type { ExpenseFiltersValue } from '../components/expense-filters';
import { ExpensePagination } from '../components/expense-pagination';
import { ExpenseFormModal } from '../components/expense-form-modal';
import type { ExpenseFormInput } from '../components/expense-form-modal';

export const clientLoader = featureLoader([EFeatures.ExpensesHistory]);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export function ExpensesHistoryPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [filters, setFilters] = useState<ExpenseFiltersValue>({
    dateFrom: thirtyDaysAgoStr(),
    dateTo: todayStr(),
    types: [],
  });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalError, setModalError] = useState('');

  function loadExpenses() {
    const svc = new ExpenseOfflineService(storeId);
    const from = filters.dateFrom ? new Date(filters.dateFrom) : new Date(0);
    const to = filters.dateTo ? new Date(filters.dateTo) : new Date();
    setAllExpenses(svc.getByDateRange(from, to));
  }

  useEffect(() => {
    loadExpenses();
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, filters.dateFrom, filters.dateTo]);

  // Apply type filter
  const filtered =
    filters.types.length === 0
      ? allExpenses
      : allExpenses.filter((e) => filters.types.includes(e.type as ExpenseType));

  const filteredTotal = filtered.reduce((sum, e) => sum + e.total, 0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  function openEdit(expense: Expense) {
    setEditingExpense(expense);
    setModalError('');
    setIsModalOpen(true);
  }

  function handleSave(data: ExpenseFormInput, id?: string) {
    if (!id) return;
    const svc = new ExpenseOfflineService(storeId);
    try {
      svc.update(id, {
        type: data.type,
        total: data.total,
        date: new Date(data.date),
        paymentType: data.paymentType,
        note: data.note,
      });
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

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'EXPENSES.HISTORY.TITLE' })}
        </h1>
        {/* NO add button — history is browse+edit only */}
      </div>

      <ExpenseFilters value={filters} onChange={(f) => { setFilters(f); setPage(1); }} />

      <div className="rounded border bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">
        {intl.formatMessage({ id: 'EXPENSES.FILTERED_TOTAL' }, { total: filteredTotal.toFixed(2) })}
      </div>

      <ExpenseList
        expenses={paginated}
        allowDelete={false}
        onEdit={openEdit}
      />

      <ExpensePagination
        page={page}
        limit={limit}
        total={filtered.length}
        onPageChange={setPage}
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
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
    </div>
  );
}

export default ExpensesHistoryPage;
