import type { BaseResponseModel, BaseService, Expense } from '@store-mgmt/domain';
import type { ExpenseType, PaymentType } from '@store-mgmt/domain';
import { DataResult, ExpenseErrors, Result, success } from '@store-mgmt/domain';
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

  /**
   * WU3 (category B): returns SYNC `BaseResponseModel<Expense[]>` (via `success(...)`), matching
   * Angular's `getExpensesInDay` (`this.Success(...)`, sync — never async). Emits the day's ACTIVE
   * expenses sorted DESC by date (most recent first), mirroring Angular's
   * `.sort((e1, e2) => e2.date.getTime() - e1.date.getTime())`.
   *
   * BUG FIX (angular-bugs-policy, ADR-7): Angular's `getExpensesInDay` IGNORES its own `date`
   * param and always computes `startOfDay(new Date())` ("today"). React honors the passed `date`
   * (`startOfDay(date)`), so the method actually filters to the requested day. Both current
   * callers pass `new Date()` (computing "today" themselves), so this fix is invisible to them —
   * it only removes the latent defect for any future non-today caller.
   */
  getExpensesInDay(date: Date): BaseResponseModel<Expense[]> {
    const startDate = startOfDay(date);
    const endDate = addDays(startDate, 1);
    const filtered = this.getAll()
      .filter((e) => e.isActive && e.date >= startDate && e.date < endDate)
      .sort((e1, e2) => e2.date.getTime() - e1.date.getTime());
    return success(filtered);
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
   * WU4 (category C): 1:1 port of Angular's `filterExpensesObservable`
   * (expense-offline.service.ts:97-104) — `of(this.Success(filtered))`. React returns a same-tick
   * `Promise<BaseResponseModel<Expense[]>>` that RESOLVES (never rejects), carrying the envelope.
   * All params optional and unbounded when falsy; operates over ACTIVE (not soft-deleted)
   * expenses; RAW date comparisons (no internal day-snapping). Param names/order match Angular.
   */
  filterExpensesObservable(
    expenseType?: ExpenseType,
    paymentType?: PaymentType,
    startDate?: Date,
    endDate?: Date,
  ): Promise<BaseResponseModel<Expense[]>> {
    const filtered = this.getAll().filter(
      (e) =>
        e.isActive &&
        (!expenseType || expenseType === e.type) &&
        (!paymentType || paymentType === e.paymentType) &&
        (!startDate || e.date >= startDate) &&
        (!endDate || e.date < endDate),
    );
    return Promise.resolve(success(filtered));
  }

  /**
   * WU4 (category C): 1:1 port of Angular's `getExpensesInDayObservable`
   * (expense-offline.service.ts:93-95 — `of(this.getExpensesInDay(date))`), the Observable sibling
   * of the sync `getExpensesInDay`. Named character-for-character after Angular (exact-surface
   * rule); same-tick `Promise.resolve` mirrors `of(...)` over synchronous storage (design ADR-7).
   * Carries the BUG FIX (honors `date`) through from `getExpensesInDay`.
   */
  getExpensesInDayObservable(date: Date): Promise<BaseResponseModel<Expense[]>> {
    return Promise.resolve(this.getExpensesInDay(date));
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
