import type { BaseResponseModel, BaseService, Expense } from '@store-mgmt/domain';
import type { ExpenseType, PaymentType } from '@store-mgmt/domain';
import { DataResult, ExpenseErrors, Result, success } from '@store-mgmt/domain';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { startOfDay, addDays } from '~/shared/lib/date-utils';
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';

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

/**
 * ExpenseOfflineService — persistence is inlined (no shared `BaseRepository<T>`; that base
 * class has no Angular correlate, playbook rule 12). Per-instance cache
 * (`expenses`/`lastExpensesKey`), reloaded only when empty or the store key changes,
 * auto-init on empty read, PLAIN-ARRAY wire format — 1:1 port of
 * `expense-offline.service.ts:173-224`. Revival fields (`date`/`createdDate`/`updatedDate`)
 * are UNCHANGED from current React behavior (Decision Gate — Angular's own `date`-only
 * revival + `paymentType` normalization are a separate, out-of-scope fix-vs-replicate call).
 */
export class ExpenseOfflineService implements BaseService<Expense> {
  private expenses: Expense[] | null = null;
  private lastExpensesKey: string | undefined;

  constructor(private readonly storeId: string) {}

  /** 1:1 port of Angular `getStorageExpenses` (expense-offline.service.ts:28-33). */
  getStorageExpenses(): Expense[] {
    if (
      !this.expenses ||
      this.expenses.length === 0 ||
      this.getCurrentStorageKey() !== this.lastExpensesKey
    ) {
      this.expenses = this.getExpensesFromLocalStorage();
    }
    return this.expenses;
  }

  getAll(): Expense[] {
    return this.getStorageExpenses();
  }

  getById(id: string): Expense | undefined {
    return this.getStorageExpenses().find((e) => e.id === id);
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
    this.getStorageExpenses().push(expense);
    this.setExpensesLocalStorage(this.expenses!);
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
    const existing = this.getStorageExpenses().find((e) => e.id === id);
    if (!existing) {
      return new DataResult<Expense>(undefined, false, [ExpenseErrors.NotExists]);
    }
    if (patch.type !== undefined) existing.type = patch.type;
    if (patch.total !== undefined) existing.total = patch.total;
    if (patch.date !== undefined) existing.date = patch.date;
    if (patch.paymentType !== undefined) existing.paymentType = patch.paymentType;
    if (patch.note !== undefined) existing.note = patch.note || '';
    existing.updatedDate = new Date();
    existing.updatedByName = getCurrentUserLogin();
    this.setExpensesLocalStorage(this.expenses!);
    return new DataResult<Expense>(existing, true, []);
  }

  /**
   * WU2 (category D): 1:1 port of Angular's `deleteExpense` (expense-offline.service.ts:79-89) —
   * the real soft-delete domain command. Sets isActive=false, stamps updatedDate/updatedByName,
   * keeps the record (audit trail, sync contract). Returns SYNC `Result.Success()`, or
   * `Result.Failure([ExpenseErrors.NotExists])` on a missing id — NEVER throws. Angular's own UI
   * (expense-list.component.ts:64) calls this fire-and-forget.
   */
  deleteExpense(id: string): Result {
    const existing = this.getStorageExpenses().find((e) => e.id === id);
    if (!existing) {
      return Result.Failure([ExpenseErrors.NotExists]);
    }
    existing.isActive = false;
    existing.updatedDate = new Date();
    existing.updatedByName = getCurrentUserLogin();
    this.setExpensesLocalStorage(this.expenses!);
    return Result.Success();
  }

  /**
   * WU2 (category D, NEW method): 1:1 port of Angular's `addImportedExpense`
   * (expense-offline.service.ts:176-182) — normalizes `date` to a Date, appends the expense,
   * always returns Result.Success().
   */
  addImportedExpense(expense: Expense): Result {
    const imported: Expense = { ...expense, date: new Date(expense.date) };
    this.getStorageExpenses().push(imported);
    this.setExpensesLocalStorage(this.expenses!);
    return Result.Success();
  }

  /**
   * WU2 (category D, NEW method): 1:1 port of Angular's `updateImportedExpense`
   * (expense-offline.service.ts:184-198) — merges the incoming fields into the existing record
   * by id (date/isActive/total/note/type/updatedDate/updatedByName); a no-op when the id is
   * absent. Always returns Result.Success().
   */
  updateImportedExpense(importedExpense: Expense): Result {
    const existing = this.getStorageExpenses().find((e) => e.id === importedExpense.id);
    if (existing) {
      existing.date = new Date(importedExpense.date);
      existing.isActive = importedExpense.isActive;
      existing.total = importedExpense.total;
      existing.note = importedExpense.note;
      existing.type = importedExpense.type;
      existing.updatedDate = importedExpense.updatedDate;
      existing.updatedByName = importedExpense.updatedByName;
      this.setExpensesLocalStorage(this.expenses!);
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

  /** Private port of Angular `setExpensesLocalStorage` (expense-offline.service.ts:200-203) — plain-array write. */
  private setExpensesLocalStorage(expenses: Expense[]): void {
    localStorage.setItem(this.getStorageKey(), JSON.stringify(expenses));
  }

  /** Private port of Angular `getStorageKey` (expense-offline.service.ts:163-166) — records the last-used key. */
  private getStorageKey(): string {
    this.lastExpensesKey = this.getCurrentStorageKey();
    return this.lastExpensesKey;
  }

  /** Private port of Angular `getCurrentStorageKey` (expense-offline.service.ts:168-170). */
  private getCurrentStorageKey(): string {
    return StorageKeys.entityKey('expenses', this.storeId);
  }

  /**
   * Private port of Angular `getExpensesFromLocalStorage` (expense-offline.service.ts:209-226) —
   * on empty/missing/unparsable storage, auto-initializes by writing an empty array before
   * returning it. Revives `date`/`createdDate`/`updatedDate` to `Date` instances — SAME fields
   * the pre-existing `BaseRepository<Expense>` revived (Decision Gate: unchanged; Angular
   * itself only revives `date` + normalizes `paymentType`, a separate out-of-scope call).
   */
  private getExpensesFromLocalStorage(): Expense[] {
    try {
      const expensesJson = localStorage.getItem(this.getStorageKey());
      if (expensesJson) {
        const expenses = JSON.parse(expensesJson) as Expense[];
        return expenses.map((e) => this.reviveExpenseDates(e));
      }
    } catch {
      // ignore — fall through to auto-init
    }
    this.setExpensesLocalStorage([]);
    return [];
  }

  private reviveExpenseDates(expense: Expense): Expense {
    const revived = { ...expense } as Record<string, unknown>;
    for (const field of ['date', 'createdDate', 'updatedDate']) {
      const value = revived[field];
      if (typeof value === 'string') revived[field] = new Date(value);
    }
    return revived as unknown as Expense;
  }
}
