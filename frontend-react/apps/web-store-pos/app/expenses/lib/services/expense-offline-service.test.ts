import { beforeEach, describe, expect, it } from 'vitest';
import { ExpenseType, PaymentType } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
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

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
    svc = new ExpenseOfflineService(storeId);
  });

  // S-EXP-1: create persists and getAll returns it
  it('S-EXP-1: create persists expense and getAll returns it', () => {
    const created = svc.create(makeExpenseInput());
    expect(created.id).toBeTruthy();
    expect(created.type).toBe(ExpenseType.Comida);
    expect(created.total).toBe(50);
    const all = svc.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
  });

  // S-EXP-2: getById returns created expense
  it('S-EXP-2: getById returns the correct expense', () => {
    const created = svc.create(makeExpenseInput());
    const found = svc.getById(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
    expect(found!.total).toBe(50);
  });

  // S-EXP-3: update modifies expense fields
  it('S-EXP-3: update modifies expense fields', () => {
    const created = svc.create(makeExpenseInput());
    const updated = svc.update(created.id, { total: 99, note: 'updated' });
    expect(updated.total).toBe(99);
    expect(updated.note).toBe('updated');
    expect(svc.getById(created.id)!.total).toBe(99);
  });

  // Angular parity (audit-user-threading): create stamps createdByName from the
  // authenticated user's login and MUST NOT touch updatedByName/updatedDate.
  it('stamps createdByName with the authenticated user login on create', () => {
    const created = svc.create(makeExpenseInput());
    expect(created.createdByName).toBe('jdoe');
  });

  it('leaves updatedByName/updatedDate undefined on create', () => {
    const created = svc.create(makeExpenseInput());
    expect(created.updatedByName).toBeUndefined();
    expect(created.updatedDate).toBeUndefined();
  });

  // Angular parity (audit-user-threading): update stamps updatedByName from login.
  it('stamps updatedByName with the authenticated user login on update', () => {
    const created = svc.create(makeExpenseInput());
    const updated = svc.update(created.id, { total: 99 });
    expect(updated.updatedByName).toBe('jdoe');
  });

  // update on a missing id throws — the UI layer (today-expenses.tsx/expenses-history.tsx)
  // translates this into the localized EXPENSE_ERRORS.NOT_EXISTS message (Angular parity:
  // updateExpense returns DataResult(undefined, false, [ExpenseErrors.NotExists])).
  it('update throws for a missing id', () => {
    expect(() => svc.update('nonexistent-id', { total: 5 })).toThrow();
  });

  // S-EXP-4: delete soft-deletes (Angular parity: deleteExpense sets isActive=false, keeps
  // the record — G2 fix). getAll() (unfiltered, mirrors Angular getStorageExpenses()) still
  // returns the record; it's just marked inactive.
  it('S-EXP-4: delete soft-deletes expense (isActive=false, record retained)', () => {
    const created = svc.create(makeExpenseInput());
    svc.delete(created.id);
    const all = svc.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
    expect(all[0].isActive).toBe(false);
    expect(svc.getById(created.id)?.isActive).toBe(false);
  });

  it('S-EXP-4a: delete sets updatedDate', () => {
    const created = svc.create(makeExpenseInput());
    svc.delete(created.id);
    expect(svc.getById(created.id)?.updatedDate).toBeInstanceOf(Date);
  });

  // Angular parity (audit-user-threading): delete (soft-delete) stamps updatedByName.
  it('stamps updatedByName with the authenticated user login on delete', () => {
    const created = svc.create(makeExpenseInput());
    svc.delete(created.id);
    expect(svc.getById(created.id)?.updatedByName).toBe('jdoe');
  });

  it('S-EXP-4b: delete is no-op for missing id', () => {
    svc.create(makeExpenseInput());
    expect(() => svc.delete('nonexistent-id')).not.toThrow();
    expect(svc.getAll()).toHaveLength(1);
  });

  // G1: getActiveToday/getByDateRange must exclude soft-deleted (isActive=false) expenses,
  // matching Angular's getExpensesInDay/getActiveExpensesBetweenDates (both filter
  // `expense.isActive`).
  it('G1: getActiveToday excludes soft-deleted expenses', () => {
    const today = new Date();
    const created = svc.create(makeExpenseInput({ date: today }));
    svc.delete(created.id);
    expect(svc.getActiveToday()).toHaveLength(0);
  });

  it('G1: getByDateRange excludes soft-deleted expenses', () => {
    const d1 = new Date('2024-01-01T10:00:00.000');
    const created = svc.create(makeExpenseInput({ date: d1, total: 10 }));
    svc.create(makeExpenseInput({ date: d1, total: 20 }));
    svc.delete(created.id);
    const range = svc.getByDateRange(new Date('2024-01-01'), new Date('2024-01-01'));
    expect(range).toHaveLength(1);
    expect(range[0].total).toBe(20);
  });

  // S-EXP-5: getActiveToday filters to current calendar day
  it('S-EXP-5: getActiveToday returns only today expenses', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    svc.create(makeExpenseInput({ date: today }));
    svc.create(makeExpenseInput({ date: yesterday, total: 100 }));

    const todayExpenses = svc.getActiveToday();
    expect(todayExpenses).toHaveLength(1);
    expect(todayExpenses[0].total).toBe(50);
  });

  // S-EXP-6: getByDateRange is inclusive on both ends
  it('S-EXP-6: getByDateRange is inclusive on both ends', () => {
    const d1 = new Date('2024-01-01T10:00:00.000');
    const d2 = new Date('2024-01-05T10:00:00.000');
    const d3 = new Date('2024-01-10T10:00:00.000');

    svc.create(makeExpenseInput({ date: d1, total: 10 }));
    svc.create(makeExpenseInput({ date: d2, total: 20 }));
    svc.create(makeExpenseInput({ date: d3, total: 30 }));

    const range = svc.getByDateRange(new Date('2024-01-01'), new Date('2024-01-05'));
    expect(range).toHaveLength(2);
    const totals = range.map((e) => e.total).sort();
    expect(totals).toEqual([10, 20]);
  });

  // S-EXP-7: note defaults to '' when not provided
  it('S-EXP-7: note defaults to empty string when not provided', () => {
    const created = svc.create(makeExpenseInput({ note: undefined }));
    expect(created.note).toBe('');
  });

  it('S-EXP-7b: note defaults to empty string when null-ish', () => {
    const created = svc.create(makeExpenseInput({ note: '' }));
    expect(created.note).toBe('');
  });
});
