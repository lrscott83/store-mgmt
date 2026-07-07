import { beforeEach, describe, expect, it } from 'vitest';
import { ExpenseType, PaymentType, ExpenseErrors } from '@store-mgmt/domain';
import type { Expense, UserModel } from '@store-mgmt/domain';
import { ExpenseOfflineService } from './expense-offline-service';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

const storeId = 'store-test';

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

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
    svc = new ExpenseOfflineService(storeId);
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
    const all = svc.getAll();
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

  // S-EXP-2: getById returns created expense
  it('S-EXP-2: getById returns the correct expense', () => {
    const created = create();
    const found = svc.getById(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
    expect(found!.total).toBe(50);
  });

  // S-EXP-3: update returns a succeeded DataResult with the modified fields.
  it('S-EXP-3: update returns a succeeded DataResult and modifies expense fields', () => {
    const created = create();
    const result = svc.update(created.id, { total: 99, note: 'updated' });
    expect(result.succeeded).toBe(true);
    expect(result.data!.total).toBe(99);
    expect(result.data!.note).toBe('updated');
    expect(svc.getById(created.id)!.total).toBe(99);
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
    expect(svc.getAll()).toHaveLength(1);
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
    const all = svc.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
    expect(all[0].isActive).toBe(false);
    expect(svc.getById(created.id)?.isActive).toBe(false);
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
    expect(svc.getById(created.id)?.updatedDate).toBeInstanceOf(Date);
  });

  // Angular parity (audit-user-threading): deleteExpense (soft-delete) stamps updatedByName.
  it('stamps updatedByName with the authenticated user login on deleteExpense', () => {
    const created = create();
    svc.deleteExpense(created.id);
    expect(svc.getById(created.id)?.updatedByName).toBe('jdoe');
  });

  // Angular parity: deleteExpense returns Result.Failure([ExpenseErrors.NotExists]) on a missing
  // id — SYNC, never throws.
  it('deleteExpense returns Result.Failure(ExpenseErrors.NotExists) for a missing id', () => {
    create();
    const result = svc.deleteExpense('nonexistent-id');
    expect(result.succeeded).toBe(false);
    expect(result.errors).toEqual([ExpenseErrors.NotExists]);
    expect(svc.getAll()).toHaveLength(1);
  });

  // ─── BaseService<Expense> delete() seam (ADR-1, Slice-1 precedent) ──────────
  // delete() stays a SYNC React-only seam that delegates to deleteExpense and THROWS on failure
  // (outside the A/B/C/D conversion). Behavior change vs. the old hard-delete no-op: it now throws
  // for a missing id (the real domain command deleteExpense is the fire-and-forget UI path).
  it('delete() seam soft-deletes via deleteExpense', () => {
    const created = create();
    svc.delete(created.id);
    expect(svc.getById(created.id)?.isActive).toBe(false);
  });

  it('delete() seam throws for a missing id (Slice-1 precedent)', () => {
    expect(() => svc.delete('nonexistent-id')).toThrow();
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
    const all = svc.getAll();
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
    const stored = svc.getById(created.id)!;
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
    expect(svc.getAll()).toHaveLength(1);
  });

  // G1: getActiveToday/getByDateRange must exclude soft-deleted (isActive=false) expenses,
  // matching Angular's getExpensesInDay/getActiveExpensesBetweenDates (both filter
  // `expense.isActive`).
  it('G1: getActiveToday excludes soft-deleted expenses', () => {
    const today = new Date();
    const created = create({ date: today });
    svc.deleteExpense(created.id);
    expect(svc.getActiveToday()).toHaveLength(0);
  });

  it('G1: getByDateRange excludes soft-deleted expenses', () => {
    const d1 = new Date('2024-01-01T10:00:00.000');
    const created = create({ date: d1, total: 10 });
    create({ date: d1, total: 20 });
    svc.deleteExpense(created.id);
    const range = svc.getByDateRange(new Date('2024-01-01'), new Date('2024-01-01'));
    expect(range).toHaveLength(1);
    expect(range[0].total).toBe(20);
  });

  // S-EXP-5: getActiveToday filters to current calendar day
  it('S-EXP-5: getActiveToday returns only today expenses', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    create({ date: today });
    create({ date: yesterday, total: 100 });

    const todayExpenses = svc.getActiveToday();
    expect(todayExpenses).toHaveLength(1);
    expect(todayExpenses[0].total).toBe(50);
  });

  // S-EXP-6: getByDateRange is inclusive on both ends
  it('S-EXP-6: getByDateRange is inclusive on both ends', () => {
    const d1 = new Date('2024-01-01T10:00:00.000');
    const d2 = new Date('2024-01-05T10:00:00.000');
    const d3 = new Date('2024-01-10T10:00:00.000');

    create({ date: d1, total: 10 });
    create({ date: d2, total: 20 });
    create({ date: d3, total: 30 });

    const range = svc.getByDateRange(new Date('2024-01-01'), new Date('2024-01-05'));
    expect(range).toHaveLength(2);
    const totals = range.map((e) => e.total).sort();
    expect(totals).toEqual([10, 20]);
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

  // WU4: filterExpenses (sync port of filterExpensesObservable)
  describe('filterExpenses', () => {
    it('filters by type when provided', () => {
      create({ type: ExpenseType.Comida });
      create({ type: ExpenseType.Transporte });
      const result = svc.filterExpenses(ExpenseType.Comida);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(ExpenseType.Comida);
    });

    it('filters by paymentType when provided', () => {
      create({ paymentType: PaymentType.Efectivo });
      create({ paymentType: PaymentType.Tarjeta });
      const result = svc.filterExpenses(undefined, PaymentType.Tarjeta);
      expect(result).toHaveLength(1);
      expect(result[0].paymentType).toBe(PaymentType.Tarjeta);
    });

    it('filters by date range when start/end provided', () => {
      create({ date: new Date('2024-01-01T10:00:00.000') });
      create({ date: new Date('2024-06-01T10:00:00.000') });
      const result = svc.filterExpenses(
        undefined,
        undefined,
        new Date('2024-05-01T00:00:00.000'),
        new Date('2024-07-01T00:00:00.000'),
      );
      expect(result).toHaveLength(1);
      expect(result[0].date.getMonth()).toBe(5); // June
    });

    it('excludes soft-deleted expenses regardless of filters', () => {
      const deleted = create();
      svc.deleteExpense(deleted.id);
      expect(svc.filterExpenses()).toHaveLength(0);
    });

    it('returns all active expenses when no filters provided', () => {
      create();
      create();
      expect(svc.filterExpenses()).toHaveLength(2);
    });
  });
});
