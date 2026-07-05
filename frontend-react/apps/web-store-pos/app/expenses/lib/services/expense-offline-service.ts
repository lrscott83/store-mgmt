import type { BaseService, Expense } from '@store-mgmt/domain';
import type { ExpenseType, PaymentType } from '@store-mgmt/domain';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import { startOfDay, addDays } from '~/shared/lib/date-utils';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';

const repo = new BaseRepository<Expense>('expenses', ['date', 'createdDate', 'updatedDate']);

function generateId(): string {
  return crypto.randomUUID();
}

interface CreateExpenseInput {
  type: ExpenseType;
  total: number;
  date: Date;
  paymentType: PaymentType;
  note?: string | null;
}

export class ExpenseOfflineService implements BaseService<Expense> {
  constructor(private readonly storeId: string) {}

  getAll(): Expense[] {
    return Array.from(repo.getAll(this.storeId).values());
  }

  getById(id: string): Expense | undefined {
    return repo.getById(this.storeId, id);
  }

  getByDateRange(from: Date, to: Date): Expense[] {
    const start = startOfDay(from);
    const end = startOfDay(addDays(to, 1));
    // Angular parity (G1): getExpensesInDay/getActiveExpensesBetweenDates both filter
    // `expense.isActive` — soft-deleted expenses must never appear in date-range queries.
    return this.getAll().filter(
      (e) => e.isActive && e.date >= start && e.date < end,
    );
  }

  getActiveToday(): Expense[] {
    return this.getByDateRange(new Date(), new Date());
  }

  create(input: CreateExpenseInput): Expense {
    const now = new Date();
    const expense: Expense = {
      id: generateId(),
      type: input.type,
      total: input.total,
      date: input.date,
      paymentType: input.paymentType,
      note: input.note || '',
      isActive: true,
      createdDate: now,
      createdByName: getCurrentUserLogin(),
      updatedDate: undefined,
      updatedByName: undefined,
    };
    repo.upsert(this.storeId, expense);
    return expense;
  }

  update(
    id: string,
    patch: Partial<Pick<Expense, 'type' | 'total' | 'date' | 'paymentType' | 'note'>>,
  ): Expense {
    const existing = repo.getById(this.storeId, id);
    // Angular parity: updateExpense returns DataResult(undefined, false, [ExpenseErrors.NotExists])
    // on a missing record. React has no Result type here, so it throws instead; callers (route
    // components) MUST NOT surface `err.message` directly — it's an internal sentinel, not
    // user-facing text. They translate via EXPENSE_ERRORS.NOT_EXISTS ('El gasto no existe.'),
    // matching the ORDER_ERRORS.NOT_EXISTS/SALE_CREDIT_ERRORS.NOT_EXISTS precedent.
    if (!existing) throw new Error('EXPENSE_NOT_FOUND');
    const updated: Expense = {
      ...existing,
      ...patch,
      note: patch.note !== undefined ? (patch.note || '') : existing.note,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    };
    repo.upsert(this.storeId, updated);
    return updated;
  }

  delete(id: string): void {
    // Angular parity (G2): deleteExpense soft-deletes — sets isActive=false, updatedDate,
    // keeps the record (audit trail, sync contract). No-op for a missing id, matching the
    // prior hard-delete's no-op behavior on `repo.remove`.
    const existing = repo.getById(this.storeId, id);
    if (!existing) return;
    repo.upsert(this.storeId, {
      ...existing,
      isActive: false,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    });
  }
}
