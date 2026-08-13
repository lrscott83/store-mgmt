import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseType, PaymentType, ExpenseErrors } from '@store-mgmt/domain';
import type { BaseResponseModel, Expense, UserModel } from '@store-mgmt/domain';
import { ExpenseOfflineService } from './expense-offline-service';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { EntityUnreadableError } from '~/shared/lib/storage/read-entity-or-throw';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';

const storeId = 'store-test';

// response-envelope-nullability: `data` only narrows to non-null on the succeeded
// branch. These tests only ever exercise the success path, so unwrap once instead of
// repeating an `if (!x.succeeded) throw` guard at every assertion site.
function unwrap<T>(response: BaseResponseModel<T>): T {
  if (!response.succeeded) throw new Error('expected succeeded response');
  return response.data;
}

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'jdoe',
    fullName: 'Test User',
    cellPhone: '',
    email: 'jdoe@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

function makeExpenseInput(overrides: Record<string, unknown> = {}) {
  return {
    type: ExpenseType.Comida,
    total: 50,
    date: new Date('2024-03-15T10:00:00.000'),
    paymentType: PaymentType.Efectivo,
    note: 'test note',
    ...overrides,
  };
}

describe('ExpenseOfflineService', () => {
  let svc: ExpenseOfflineService;

  // Convenience: unwraps create's DataResult<Expense> to the created Expense for the many
  // tests that only need the persisted record, not the envelope.
  function create(overrides: Record<string, unknown> = {}): Expense {
    return svc.create(makeExpenseInput(overrides)).data!;
  }

  // WU2 (baseservice-parity): getById() was removed (zero prod call-sites, rule 12) — tests
  // that only needed a by-id lookup (not testing getById itself) use this helper instead.
  function findExpense(id: string): Expense | undefined {
    return svc.getStorageExpenses().find((e) => e.id === id);
  }

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
    svc = new ExpenseOfflineService(storeId);
  });

  // WU5 (eliminate-base-repository): inlined persistence — plain-array wire-format, cache,
  // auto-init, 1:1 port of Angular's expense-offline.service.ts:173-224. Revival fields
  // (date/createdDate/updatedDate) are UNCHANGED from current React behavior (Decision Gate —
  // Angular itself only revives `date` + normalizes `paymentType`, both OUT OF SCOPE here).
  describe('Persistence — plain-array wire-format, cache, auto-init (expense-offline.service.ts:173-224)', () => {
    it('persists expenses on-disk as a PLAIN array of objects, never [id, expense] Map-entries pairs', () => {
      create();

      const raw = localStorage.getItem(`lizoft.store-expenses-${storeId}`);
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(Array.isArray(parsed[0])).toBe(false);
      expect(typeof parsed[0]).toBe('object');
      expect(parsed[0].id).toBeTruthy();
    });

    it('auto-writes an empty array on the first empty read, without throwing', () => {
      expect(() => svc.getStorageExpenses()).not.toThrow();
      const raw = localStorage.getItem(`lizoft.store-expenses-${storeId}`);
      expect(raw).toBe('[]');
    });

    it('reuses the in-memory cache across two reads without an intervening write (localStorage.getItem hit once)', () => {
      localStorage.setItem(
        `lizoft.store-expenses-${storeId}`,
        JSON.stringify([{ id: 'e1', type: ExpenseType.Comida, total: 10, isActive: true }]),
      );
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

      svc.getStorageExpenses();
      svc.getStorageExpenses();

      const callsForKey = getItemSpy.mock.calls.filter(([key]) => key === `lizoft.store-expenses-${storeId}`);
      expect(callsForKey).toHaveLength(1);
    });

    it('throws instead of returning an empty array when the stored expenses cannot be read', () => {
      localStorage.setItem(`lizoft.store-expenses-${storeId}`, 'enc:v1:AAAA');
      const freshSvc = new ExpenseOfflineService(storeId);
      expect(() => freshSvc.getStorageExpenses()).toThrow(MissingDataKeyError);
    });

    it('leaves the unreadable bytes byte-for-byte intact', () => {
      const bytes = 'enc:v1:AAAA';
      localStorage.setItem(`lizoft.store-expenses-${storeId}`, bytes);
      const freshSvc = new ExpenseOfflineService(storeId);
      expect(() => freshSvc.getStorageExpenses()).toThrow();
      expect(localStorage.getItem(`lizoft.store-expenses-${storeId}`)).toBe(bytes);
    });

    it('STILL revives date/createdDate/updatedDate to Date instances on a fresh instance re-read (unchanged React behavior — Decision Gate)', () => {
      localStorage.setItem(
        `lizoft.store-expenses-${storeId}`,
        JSON.stringify([
          {
            id: 'e1',
            type: ExpenseType.Comida,
            total: 10,
            note: '',
            date: '2024-01-01T00:00:00.000Z',
            paymentType: PaymentType.Efectivo,
            isActive: true,
            createdDate: '2024-01-01T00:00:00.000Z',
            createdByName: 'test',
            updatedDate: '2024-01-02T00:00:00.000Z',
            updatedByName: 'test',
          },
        ]),
      );

      const freshSvc = new ExpenseOfflineService(storeId);
      const found = freshSvc.getStorageExpenses().find((e) => e.id === 'e1');
      expect(found?.date).toBeInstanceOf(Date);
      expect(found?.createdDate).toBeInstanceOf(Date);
      expect(found?.updatedDate).toBeInstanceOf(Date);
    });
  });

  // ─── Category D: create/update return DataResult<Expense> ───────────────────

  // S-EXP-1: create returns DataResult<Expense> (succeeded, data), persists, getAll returns it.
  // Angular parity: createExpense returns `new DataResult(expense, true, [])` (never throws).
  it('S-EXP-1: create returns a succeeded DataResult and persists the expense', () => {
    const result = svc.create(makeExpenseInput());
    expect(result.succeeded).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data!.id).toBeTruthy();
    expect(result.data!.type).toBe(ExpenseType.Comida);
    expect(result.data!.total).toBe(50);
    const all = svc.getStorageExpenses();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(result.data!.id);
  });

  // create's DataResult MUST NOT be a BaseResponseModel (no message/actionCode fields) — the
  // two envelope families stay distinct (spec: envelope-distinctness).
  it('create returns a DataResult, not a BaseResponseModel (no message/actionCode)', () => {
    const result = svc.create(makeExpenseInput());
    expect('message' in result).toBe(false);
    expect('actionCode' in result).toBe(false);
  });

  // S-EXP-3: update returns a succeeded DataResult with the modified fields.
  it('S-EXP-3: update returns a succeeded DataResult and modifies expense fields', () => {
    const created = create();
    const result = svc.update(created.id, { total: 99, note: 'updated' });
    expect(result.succeeded).toBe(true);
    expect(result.data!.total).toBe(99);
    expect(result.data!.note).toBe('updated');
    expect(findExpense(created.id)!.total).toBe(99);
  });

  // Angular parity (audit-user-threading): create stamps createdByName from the
  // authenticated user's login and MUST NOT touch updatedByName/updatedDate.
  it('stamps createdByName with the authenticated user login on create', () => {
    const created = create();
    expect(created.createdByName).toBe('jdoe');
  });

  it('leaves updatedByName/updatedDate undefined on create', () => {
    const created = create();
    expect(created.updatedByName).toBeUndefined();
    expect(created.updatedDate).toBeUndefined();
  });

  // Angular parity (audit-user-threading): update stamps updatedByName from login.
  it('stamps updatedByName with the authenticated user login on update', () => {
    const created = create();
    const result = svc.update(created.id, { total: 99 });
    expect(result.data!.updatedByName).toBe('jdoe');
  });

  // Angular parity (BUG FIX class): updateExpense NEVER throws — on a missing id it returns
  // `new DataResult(undefined, false, [ExpenseErrors.NotExists])` (SYNC, resolves not throws).
  it('update returns a failed DataResult (ExpenseErrors.NotExists) for a missing id, without throwing', () => {
    const result = svc.update('nonexistent-id', { total: 5 });
    expect(result.succeeded).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.errors).toEqual([ExpenseErrors.NotExists]);
  });

  it('update does not persist changes for a missing id', () => {
    create();
    svc.update('nonexistent-id', { total: 5 });
    expect(svc.getStorageExpenses()).toHaveLength(1);
  });

  // ─── Category D: deleteExpense returns Result (soft-delete) ─────────────────

  // S-EXP-4: deleteExpense soft-deletes (Angular parity: sets isActive=false, keeps the record,
  // returns Result.Success()). getAll() (unfiltered, mirrors Angular getStorageExpenses()) still
  // returns the record; it's just marked inactive.
  it('S-EXP-4: deleteExpense soft-deletes and returns Result.Success', () => {
    const created = create();
    const result = svc.deleteExpense(created.id);
    expect(result.succeeded).toBe(true);
    expect(result.errors).toEqual([]);
    const all = svc.getStorageExpenses();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
    expect(all[0].isActive).toBe(false);
    expect(findExpense(created.id)?.isActive).toBe(false);
  });

  // deleteExpense's Result MUST NOT be a BaseResponseModel/DataResult (no data/message fields).
  it('deleteExpense returns a Result, not a BaseResponseModel (no message/actionCode/data)', () => {
    const created = create();
    const result = svc.deleteExpense(created.id);
    expect('message' in result).toBe(false);
    expect('actionCode' in result).toBe(false);
    expect('data' in result).toBe(false);
  });

  it('S-EXP-4a: deleteExpense sets updatedDate', () => {
    const created = create();
    svc.deleteExpense(created.id);
    expect(findExpense(created.id)?.updatedDate).toBeInstanceOf(Date);
  });

  // Angular parity (audit-user-threading): deleteExpense (soft-delete) stamps updatedByName.
  it('stamps updatedByName with the authenticated user login on deleteExpense', () => {
    const created = create();
    svc.deleteExpense(created.id);
    expect(findExpense(created.id)?.updatedByName).toBe('jdoe');
  });

  // Angular parity: deleteExpense returns Result.Failure([ExpenseErrors.NotExists]) on a missing
  // id — SYNC, never throws.
  it('deleteExpense returns Result.Failure(ExpenseErrors.NotExists) for a missing id', () => {
    create();
    const result = svc.deleteExpense('nonexistent-id');
    expect(result.succeeded).toBe(false);
    expect(result.errors).toEqual([ExpenseErrors.NotExists]);
    expect(svc.getStorageExpenses()).toHaveLength(1);
  });

  // ─── Category D: addImportedExpense / updateImportedExpense return Result ────

  // Angular parity: addImportedExpense pushes the expense and always returns Result.Success().
  it('addImportedExpense appends the expense and returns Result.Success', () => {
    const imported: Expense = {
      id: 'imp-1',
      type: ExpenseType.Transporte,
      total: 12,
      note: 'imported',
      date: new Date('2024-02-01T10:00:00.000'),
      paymentType: PaymentType.Tarjeta,
      isActive: true,
      createdDate: new Date('2024-02-01T10:00:00.000'),
      createdByName: 'someone',
      updatedDate: undefined,
      updatedByName: undefined,
    };
    const result = svc.addImportedExpense(imported);
    expect(result.succeeded).toBe(true);
    expect(result.errors).toEqual([]);
    const all = svc.getStorageExpenses();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('imp-1');
    expect(all[0].date).toBeInstanceOf(Date);
  });

  // Angular parity: updateImportedExpense merges by id when present and always returns
  // Result.Success() (even when the id is absent — no-op merge).
  it('updateImportedExpense merges fields by id and returns Result.Success', () => {
    const created = create({ total: 5, note: 'orig' });
    const patch: Expense = {
      ...created,
      total: 77,
      note: 'merged',
      isActive: false,
    };
    const result = svc.updateImportedExpense(patch);
    expect(result.succeeded).toBe(true);
    const stored = findExpense(created.id)!;
    expect(stored.total).toBe(77);
    expect(stored.note).toBe('merged');
    expect(stored.isActive).toBe(false);
  });

  it('updateImportedExpense is a no-op Result.Success for an unknown id', () => {
    create();
    const patch: Expense = {
      id: 'unknown',
      type: ExpenseType.Otro,
      total: 1,
      note: '',
      date: new Date('2024-02-01T10:00:00.000'),
      paymentType: PaymentType.Efectivo,
      isActive: true,
      createdDate: new Date('2024-02-01T10:00:00.000'),
      createdByName: '',
      updatedDate: undefined,
      updatedByName: undefined,
    };
    const result = svc.updateImportedExpense(patch);
    expect(result.succeeded).toBe(true);
    expect(svc.getStorageExpenses()).toHaveLength(1);
  });

  // ─── Category B: getExpensesInDay returns BaseResponseModel<Expense[]> SYNC ──

  // Angular parity: getExpensesInDay returns `this.Success(...)` SYNC — a BaseResponseModel<T>,
  // not a bare array. `.data` holds the day's active expenses.
  it('getExpensesInDay returns a SYNC BaseResponseModel (succeeded, data, message/actionCode)', () => {
    const today = new Date();
    create({ date: today, total: 50 });
    const response = svc.getExpensesInDay(today);
    expect(response.succeeded).toBe(true);
    expect(Array.isArray(response.data)).toBe(true);
    // Distinct from a Result/DataResult — BaseResponseModel carries message/actionCode.
    expect('message' in response).toBe(true);
    expect('actionCode' in response).toBe(true);
  });

  // G1: getExpensesInDay excludes soft-deleted (isActive=false) expenses, matching Angular's
  // `expense.isActive` filter.
  it('G1: getExpensesInDay excludes soft-deleted expenses', () => {
    const today = new Date();
    const created = create({ date: today });
    svc.deleteExpense(created.id);
    expect(svc.getExpensesInDay(today).data).toHaveLength(0);
  });

  // BUG FIX (angular-bugs-policy, ADR-7): Angular's getExpensesInDay IGNORES its own `date`
  // param and always computes "today" (`startOfDay(new Date())`). React honors the passed date,
  // filtering to THAT day's window. Both current callers pass `new Date()` so today's callers see
  // no behavior change.
  it('BUG FIX: getExpensesInDay filters to the PASSED date window, not always "today"', () => {
    const target = new Date('2024-03-15T10:00:00.000');
    const dayBefore = new Date('2024-03-14T23:00:00.000');
    const dayAfter = new Date('2024-03-16T01:00:00.000');
    create({ date: target, total: 50 });
    create({ date: dayBefore, total: 111 });
    create({ date: dayAfter, total: 222 });

    const result = unwrap(svc.getExpensesInDay(target));
    expect(result).toHaveLength(1);
    expect(result[0].total).toBe(50);
  });

  // Angular parity: getExpensesInDay sorts DESC by date (most recent first) —
  // `.sort((e1, e2) => e2.date.getTime() - e1.date.getTime())`. React's removed
  // getByDateRange/getActiveToday never sorted; the Angular-faithful method does.
  it('getExpensesInDay sorts the day window DESC by date (most recent first)', () => {
    const day = '2024-03-15';
    create({ date: new Date(`${day}T09:00:00.000`), total: 10 });
    create({ date: new Date(`${day}T18:00:00.000`), total: 30 });
    create({ date: new Date(`${day}T12:00:00.000`), total: 20 });

    const result = unwrap(svc.getExpensesInDay(new Date(`${day}T10:00:00.000`)));
    expect(result.map((e) => e.total)).toEqual([30, 20, 10]);
  });

  // ─── Category C: getExpensesInDayObservable resolves BaseResponseModel ───────

  // Angular parity: getExpensesInDayObservable is `of(this.getExpensesInDay(date))` — the
  // Observable sibling. React returns a same-tick `Promise<BaseResponseModel<Expense[]>>` that
  // RESOLVES (never rejects), carrying the exact same envelope as the sync method.
  it('getExpensesInDayObservable resolves the same BaseResponseModel as getExpensesInDay', async () => {
    const today = new Date();
    create({ date: today, total: 50 });
    const response = await svc.getExpensesInDayObservable(today);
    expect(response.succeeded).toBe(true);
    const data = unwrap(response);
    expect(data).toHaveLength(1);
    expect(data[0].total).toBe(50);
  });

  it('getExpensesInDayObservable honors the passed date (BUG FIX carried through)', async () => {
    const target = new Date('2024-03-15T10:00:00.000');
    create({ date: target, total: 50 });
    create({ date: new Date('2024-03-16T01:00:00.000'), total: 222 });
    const response = await svc.getExpensesInDayObservable(target);
    const data = unwrap(response);
    expect(data).toHaveLength(1);
    expect(data[0].total).toBe(50);
  });

  // S-EXP-7: note defaults to '' when not provided
  it('S-EXP-7: note defaults to empty string when not provided', () => {
    const created = create({ note: undefined });
    expect(created.note).toBe('');
  });

  it('S-EXP-7b: note defaults to empty string when null-ish', () => {
    const created = create({ note: '' });
    expect(created.note).toBe('');
  });

  // WU3: getActiveExpensesPriceBetweenDates/Today/Yesterday
  describe('getActiveExpensesPriceBetweenDates/Today/Yesterday', () => {
    it('sums active expenses within a raw date window, excluding inactive and out-of-range', () => {
      const start = new Date('2024-02-01T00:00:00.000');
      const end = new Date('2024-02-05T00:00:00.000');
      const inRange1 = create({ date: new Date('2024-02-02T10:00:00.000'), total: 30 });
      create({ date: new Date('2024-02-03T10:00:00.000'), total: 20 });
      create({ date: new Date('2024-01-15T10:00:00.000'), total: 999 }); // before range
      create({ date: new Date('2024-02-10T10:00:00.000'), total: 999 }); // after range
      svc.deleteExpense(inRange1.id);
      // deleted one should be excluded even though in range
      expect(svc.getActiveExpensesPriceBetweenDates(start, end)).toBe(20);
    });

    it('getActiveExpensesPriceToday sums only expenses dated today', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const yesterday = new Date(oneHourAgo);
      yesterday.setDate(yesterday.getDate() - 1);
      create({ date: oneHourAgo, total: 40 });
      create({ date: yesterday, total: 999 });
      expect(svc.getActiveExpensesPriceToday()).toBe(40);
    });

    it('getActiveExpensesPriceYesterday sums only expenses dated yesterday', () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(10, 0, 0, 0);
      create({ date: yesterday, total: 15 });
      create({ date: now, total: 999 });
      expect(svc.getActiveExpensesPriceYesterday()).toBe(15);
    });
  });

  // WU3: getExpensesTotalBefore/Total/Yesterday
  describe('getExpensesTotalBefore/Total/Yesterday', () => {
    it('getExpensesTotalBefore sums active expenses strictly before threshold date', () => {
      const threshold = new Date('2024-03-01T00:00:00.000');
      create({ date: new Date('2024-02-01T10:00:00.000'), total: 10 });
      create({ date: new Date('2024-02-15T10:00:00.000'), total: 25 });
      create({ date: new Date('2024-03-15T10:00:00.000'), total: 999 }); // after threshold
      expect(svc.getExpensesTotalBefore(threshold)).toBe(35);
    });

    it('getExpensesTotalBefore excludes soft-deleted expenses', () => {
      const threshold = new Date('2024-03-01T00:00:00.000');
      const deleted = create({ date: new Date('2024-02-01T10:00:00.000'), total: 10 });
      svc.deleteExpense(deleted.id);
      create({ date: new Date('2024-02-15T10:00:00.000'), total: 25 });
      expect(svc.getExpensesTotalBefore(threshold)).toBe(25);
    });

    it('getExpensesTotal sums all active expenses up through end of today', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      create({ date: oneHourAgo, total: 50 });
      create({ date: new Date('2024-01-01T10:00:00.000'), total: 20 });
      expect(svc.getExpensesTotal()).toBe(70);
    });

    it('getExpensesTotalYesterday sums only expenses strictly before today start', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      create({ date: new Date('2024-01-01T10:00:00.000'), total: 20 });
      create({ date: oneHourAgo, total: 999 }); // today, excluded
      expect(svc.getExpensesTotalYesterday()).toBe(20);
    });
  });

  // Category C: filterExpensesObservable resolves Promise<BaseResponseModel<Expense[]>>.
  // Angular parity: `of(this.Success(filtered))` over getStorageActiveExpenses() — RESOLVES,
  // never rejects; operates over active-only expenses; RAW date comparisons.
  describe('filterExpensesObservable', () => {
    it('resolves a BaseResponseModel envelope (not a bare array)', async () => {
      create();
      const response = await svc.filterExpensesObservable();
      expect(response.succeeded).toBe(true);
      expect('message' in response).toBe(true);
      expect('actionCode' in response).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('filters by type when provided', async () => {
      create({ type: ExpenseType.Comida });
      create({ type: ExpenseType.Transporte });
      const response = await svc.filterExpensesObservable(ExpenseType.Comida);
      const data = unwrap(response);
      expect(data).toHaveLength(1);
      expect(data[0].type).toBe(ExpenseType.Comida);
    });

    it('filters by paymentType when provided', async () => {
      create({ paymentType: PaymentType.Efectivo });
      create({ paymentType: PaymentType.Tarjeta });
      const response = await svc.filterExpensesObservable(undefined, PaymentType.Tarjeta);
      const data = unwrap(response);
      expect(data).toHaveLength(1);
      expect(data[0].paymentType).toBe(PaymentType.Tarjeta);
    });

    it('filters by date range when startDate/endDate provided', async () => {
      create({ date: new Date('2024-01-01T10:00:00.000') });
      create({ date: new Date('2024-06-01T10:00:00.000') });
      const response = await svc.filterExpensesObservable(
        undefined,
        undefined,
        new Date('2024-05-01T00:00:00.000'),
        new Date('2024-07-01T00:00:00.000'),
      );
      const data = unwrap(response);
      expect(data).toHaveLength(1);
      expect(data[0].date.getMonth()).toBe(5); // June
    });

    it('excludes soft-deleted expenses regardless of filters', async () => {
      const deleted = create();
      svc.deleteExpense(deleted.id);
      const response = await svc.filterExpensesObservable();
      expect(unwrap(response)).toHaveLength(0);
    });

    it('returns all active expenses when no filters provided', async () => {
      create();
      create();
      const response = await svc.filterExpensesObservable();
      expect(response.data).toHaveLength(2);
    });
  });
});
