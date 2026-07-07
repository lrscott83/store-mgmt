import type { BaseService, Expense } from '@store-mgmt/domain';
import type { ExpenseType, PaymentType } from '@store-mgmt/domain';
import { DataResult, ExpenseErrors, Result } from '@store-mgmt/domain';
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

  /**
   * ADR-5: financial helpers use RAW date boundaries (pre-snapped by the caller), NOT
   * the day-snapping `getByDateRange` (which would double-snap). 1:1 port of Angular's
   * private `getActiveExpensesBetweenDates`.
   */
  private activeExpensesBetween(start: Date, end: Date): Expense[] {
    return this.getAll().filter((e) => e.isActive && e.date >= start && e.date < end);
  }

  getActiveExpensesPriceBetweenDates(start: Date, end: Date): number {
    return this.activeExpensesBetween(start, end).reduce((sum, e) => sum + e.total, 0);
  }

  getActiveExpensesPriceToday(): number {
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return this.getActiveExpensesPriceBetweenDates(start, end);
  }

  getActiveExpensesPriceYesterday(): number {
    const start = startOfDay(addDays(new Date(), -1));
    const end = startOfDay(new Date());
    return this.getActiveExpensesPriceBetweenDates(start, end);
  }

  /**
   * 1:1 port of Angular's `getExpensesTotalBefore` — sum of ALL active expenses (no
   * upper-window constraint besides `date < threshold`, no lower bound).
   */
  getExpensesTotalBefore(date: Date): number {
    return this.getAll()
      .filter((e) => e.isActive && e.date < date)
      .reduce((sum, e) => sum + e.total, 0);
  }

  getExpensesTotal(): number {
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return this.getExpensesTotalBefore(end);
  }

  getExpensesTotalYesterday(): number {
    const start = startOfDay(new Date());
    return this.getExpensesTotalBefore(start);
  }

  /**
   * Sync replacement of Angular's `filterExpensesObservable`. All params optional and
   * unbounded when falsy — 1:1 port, operates over active (not soft-deleted) expenses,
   * RAW date comparisons (no internal day-snapping).
   */
  filterExpenses(
    type?: ExpenseType,
    paymentType?: PaymentType,
    start?: Date,
    end?: Date,
  ): Expense[] {
    return this.getAll().filter(
      (e) =>
        e.isActive &&
        (!type || type === e.type) &&
        (!paymentType || paymentType === e.paymentType) &&
        (!start || e.date >= start) &&
        (!end || e.date < end),
    );
  }

  /**
   * WU2 (category D): returns DataResult<Expense> (was a bare Expense), matching Angular's
   * `createExpense` sync `new DataResult(expense, true, [])` — always succeeds, never throws.
   * Signature kept as the existing input-object shape (not renamed to `createExpense`),
   * mirroring the Slice-1 Inventory precedent (only the return SHAPE changes).
   */
  create(input: CreateExpenseInput): DataResult<Expense> {
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
    return new DataResult<Expense>(expense, true, []);
  }

  /**
   * WU2 (category D): returns DataResult<Expense> (was a bare Expense that threw on missing) —
   * NEVER throws, matching Angular's `updateExpense`. On a missing record it returns SYNC
   * `new DataResult(undefined, false, [ExpenseErrors.NotExists])` (resolve-not-reject).
   */
  update(
    id: string,
    patch: Partial<Pick<Expense, 'type' | 'total' | 'date' | 'paymentType' | 'note'>>,
  ): DataResult<Expense> {
    const existing = repo.getById(this.storeId, id);
    if (!existing) {
      return new DataResult<Expense>(undefined, false, [ExpenseErrors.NotExists]);
    }
    const updated: Expense = {
      ...existing,
      ...patch,
      note: patch.note !== undefined ? (patch.note || '') : existing.note,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    };
    repo.upsert(this.storeId, updated);
    return new DataResult<Expense>(updated, true, []);
  }

  /**
   * WU2 (category D): 1:1 port of Angular's `deleteExpense` (expense-offline.service.ts:79-89) —
   * the real soft-delete domain command. Sets isActive=false, stamps updatedDate/updatedByName,
   * keeps the record (audit trail, sync contract). Returns SYNC `Result.Success()`, or
   * `Result.Failure([ExpenseErrors.NotExists])` on a missing id — NEVER throws. Angular's own UI
   * (expense-list.component.ts:64) calls this fire-and-forget.
   */
  deleteExpense(id: string): Result {
    const existing = repo.getById(this.storeId, id);
    if (!existing) {
      return Result.Failure([ExpenseErrors.NotExists]);
    }
    repo.upsert(this.storeId, {
      ...existing,
      isActive: false,
      updatedDate: new Date(),
      updatedByName: getCurrentUserLogin(),
    });
    return Result.Success();
  }

  /**
   * WU2 (category D, NEW method): 1:1 port of Angular's `addImportedExpense`
   * (expense-offline.service.ts:176-182) — normalizes `date` to a Date, appends the expense,
   * always returns Result.Success().
   */
  addImportedExpense(expense: Expense): Result {
    repo.upsert(this.storeId, { ...expense, date: new Date(expense.date) });
    return Result.Success();
  }

  /**
   * WU2 (category D, NEW method): 1:1 port of Angular's `updateImportedExpense`
   * (expense-offline.service.ts:184-198) — merges the incoming fields into the existing record
   * by id (date/isActive/total/note/type/updatedDate/updatedByName); a no-op when the id is
   * absent. Always returns Result.Success().
   */
  updateImportedExpense(importedExpense: Expense): Result {
    const existing = repo.getById(this.storeId, importedExpense.id);
    if (existing) {
      repo.upsert(this.storeId, {
        ...existing,
        date: new Date(importedExpense.date),
        isActive: importedExpense.isActive,
        total: importedExpense.total,
        note: importedExpense.note,
        type: importedExpense.type,
        updatedDate: importedExpense.updatedDate,
        updatedByName: importedExpense.updatedByName,
      });
    }
    return Result.Success();
  }

  /**
   * BaseService<Expense> `delete()` seam (ADR-1, Slice-1 precedent): stays a SYNC React-only
   * contract OUTSIDE the A/B/C/D conversion. Delegates to the real domain command
   * {@link deleteExpense} and THROWS on failure (so a missing id surfaces as an error rather
   * than leaking a `Result` through the `BaseService<T>` surface). Production UI uses the
   * fire-and-forget `deleteExpense` directly (Angular parity); this seam exists for interface
   * conformance.
   */
  delete(id: string): void {
    const result = this.deleteExpense(id);
    if (!result.succeeded) {
      throw new Error(result.errors[0]?.description ?? `Expense could not be deleted: ${id}`);
    }
  }
}
