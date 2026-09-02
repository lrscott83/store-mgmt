import { beforeEach, describe, expect, it } from 'vitest';
import { ExpenseType, PaymentType, type Expense, ExpenseErrors } from '@store-mgmt/domain';
import { ExpenseOfflineService } from '../expense-offline-service';

const storeId = 'test-store';

function makeExpense(overrides: Partial<{ type: ExpenseType; total: number; date: Date; paymentType: PaymentType; note: string; isActive: boolean }> = {}) {
  return {
    type: overrides.type ?? ExpenseType.Otro,
    total: overrides.total ?? 100,
    date: overrides.date ?? new Date(),
    paymentType: overrides.paymentType ?? PaymentType.Efectivo,
    note: overrides.note ?? 'test note',
  };
}

describe('ExpenseOfflineService', () => {
  let service: ExpenseOfflineService;

  beforeEach(() => {
    localStorage.clear();
    service = new ExpenseOfflineService(storeId);
  });

  // ─── create ───
  describe('create', () => {
    it('creates an expense and returns DataResult with succeeded=true', () => {
      const result = service.create(makeExpense());
      expect(result.succeeded).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBeDefined();
      expect(result.data!.total).toBe(100);
      expect(result.data!.isActive).toBe(true);
    });

    it('persists the expense in localStorage', () => {
      service.create(makeExpense({ total: 200 }));
      const stored = service.getStorageExpenses();
      expect(stored).toHaveLength(1);
      expect(stored[0].total).toBe(200);
    });

    it('generates unique ids for multiple expenses', () => {
      const r1 = service.create(makeExpense());
      const r2 = service.create(makeExpense());
      expect(r1.data!.id).not.toBe(r2.data!.id);
    });
  });

  // ─── getStorageExpenses ───
  describe('getStorageExpenses', () => {
    it('returns empty array when no expenses exist', () => {
      expect(service.getStorageExpenses()).toHaveLength(0);
    });

    it('returns all expenses (active and inactive)', () => {
      const r = service.create(makeExpense());
      service.deleteExpense(r.data!.id);
      expect(service.getStorageExpenses()).toHaveLength(1);
      expect(service.getStorageExpenses()[0].isActive).toBe(false);
    });
  });

  // ─── getExpensesInDay ───
  describe('getExpensesInDay', () => {
    it('returns only active expenses for the given day', () => {
      const today = new Date();
      service.create(makeExpense({ date: today, total: 50 }));
      service.create(makeExpense({ date: today, total: 30 }));

      const result = service.getExpensesInDay(today);
      expect(result.succeeded).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('excludes inactive expenses', () => {
      const today = new Date();
      const r = service.create(makeExpense({ date: today }));
      service.deleteExpense(r.data!.id);

      const result = service.getExpensesInDay(today);
      expect(result.data).toHaveLength(0);
    });

    it('excludes expenses from other days', () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      service.create(makeExpense({ date: today, total: 50 }));
      service.create(makeExpense({ date: yesterday, total: 30 }));

      const result = service.getExpensesInDay(today);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].total).toBe(50);
    });
  });

  // ─── getActiveExpensesPriceToday ───
  describe('getActiveExpensesPriceToday', () => {
    it('sums total of active expenses created today', () => {
      service.create(makeExpense({ total: 50 }));
      service.create(makeExpense({ total: 30 }));
      expect(service.getActiveExpensesPriceToday()).toBe(80);
    });

    it('excludes inactive expenses', () => {
      const r = service.create(makeExpense({ total: 50 }));
      service.deleteExpense(r.data!.id);
      expect(service.getActiveExpensesPriceToday()).toBe(0);
    });
  });

  // ─── getActiveExpensesPriceYesterday ───
  describe('getActiveExpensesPriceYesterday', () => {
    it('returns 0 when no expenses exist', () => {
      expect(service.getActiveExpensesPriceYesterday()).toBe(0);
    });
  });

  // ─── getExpensesTotal ───
  describe('getExpensesTotal', () => {
    it('returns total of all active expenses before end of today', () => {
      service.create(makeExpense({ total: 100 }));
      service.create(makeExpense({ total: 200 }));
      expect(service.getExpensesTotal()).toBe(300);
    });
  });

  // ─── getExpensesTotalYesterday ───
  describe('getExpensesTotalYesterday', () => {
    it('returns 0 when no expenses exist', () => {
      expect(service.getExpensesTotalYesterday()).toBe(0);
    });
  });

  // ─── getExpensesTotalBefore ───
  describe('getExpensesTotalBefore', () => {
    it('returns sum of expenses before the given date', () => {
      const now = new Date();
      service.create(makeExpense({ date: now, total: 100 }));

      const future = new Date(now);
      future.setDate(future.getDate() + 1);
      expect(service.getExpensesTotalBefore(future)).toBe(100);

      const past = new Date(now);
      past.setDate(past.getDate() - 1);
      expect(service.getExpensesTotalBefore(past)).toBe(0);
    });
  });

  // ─── filterExpensesObservable ───
  describe('filterExpensesObservable', () => {
    it('returns all active expenses when no filters applied', async () => {
      service.create(makeExpense());
      service.create(makeExpense());
      const result = await service.filterExpensesObservable();
      expect(result.succeeded).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('filters by paymentType', async () => {
      service.create(makeExpense({ paymentType: PaymentType.Efectivo }));
      service.create(makeExpense({ paymentType: PaymentType.Tarjeta }));

      const result = await service.filterExpensesObservable(undefined, PaymentType.Efectivo);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].paymentType).toBe(PaymentType.Efectivo);
    });

    it('filters by expenseType', async () => {
      service.create(makeExpense({ type: ExpenseType.Salario }));
      service.create(makeExpense({ type: ExpenseType.Transporte }));

      const result = await service.filterExpensesObservable(ExpenseType.Salario);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].type).toBe(ExpenseType.Salario);
    });

    it('filters by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      service.create(makeExpense({ date: now, total: 50 }));
      service.create(makeExpense({ date: yesterday, total: 30 }));

      const result = await service.filterExpensesObservable(undefined, undefined, yesterday);
      expect(result.data).toHaveLength(2);

      const resultToday = await service.filterExpensesObservable(undefined, undefined, now);
      expect(resultToday.data).toHaveLength(1);
    });
  });

  // ─── getExpensesInDayObservable ───
  describe('getExpensesInDayObservable', () => {
    it('returns a promise resolving to expenses for the day', async () => {
      service.create(makeExpense({ total: 42 }));
      const result = await service.getExpensesInDayObservable(new Date());
      expect(result.succeeded).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].total).toBe(42);
    });
  });

  // ─── update ───
  describe('update', () => {
    it('updates an existing expense and returns succeeded=true', () => {
      const r = service.create(makeExpense({ total: 100 }));
      const result = service.update(r.data!.id, { total: 250 });
      expect(result.succeeded).toBe(true);
      expect(result.data!.total).toBe(250);
    });

    it('persists the update', () => {
      const r = service.create(makeExpense({ total: 100 }));
      service.update(r.data!.id, { total: 250 });
      const stored = service.getStorageExpenses();
      expect(stored[0].total).toBe(250);
    });

    it('returns succeeded=false for non-existent id', () => {
      const result = service.update('non-existent', { total: 100 });
      expect(result.succeeded).toBe(false);
      expect(result.errors).toContain(ExpenseErrors.NotExists);
    });

    it('updates note', () => {
      const r = service.create(makeExpense({ note: 'old' }));
      service.update(r.data!.id, { note: 'new' });
      expect(service.getStorageExpenses()[0].note).toBe('new');
    });
  });

  // ─── deleteExpense ───
  describe('deleteExpense', () => {
    it('soft-deletes an expense (sets isActive=false)', () => {
      const r = service.create(makeExpense());
      const result = service.deleteExpense(r.data!.id);
      expect(result.succeeded).toBe(true);
      expect(service.getStorageExpenses()[0].isActive).toBe(false);
    });

    it('returns failure for non-existent id', () => {
      const result = service.deleteExpense('non-existent');
      expect(result.succeeded).toBe(false);
      expect(result.errors).toContain(ExpenseErrors.NotExists);
    });

    it('deleted expense excluded from getExpensesInDay', () => {
      const r = service.create(makeExpense());
      service.deleteExpense(r.data!.id);
      expect(service.getExpensesInDay(new Date()).data).toHaveLength(0);
    });
  });

  // ─── addImportedExpense ───
  describe('addImportedExpense', () => {
    it('adds an imported expense and returns Result.Success', () => {
      const expense: Expense = {
        id: 'imported-1',
        type: ExpenseType.Comida,
        total: 75,
        date: new Date(),
        paymentType: PaymentType.Efectivo,
        note: 'imported',
        isActive: true,
        createdDate: new Date(),
        createdByName: 'import',
        updatedDate: undefined,
        updatedByName: undefined,
      };
      const result = service.addImportedExpense(expense);
      expect(result.succeeded).toBe(true);
      expect(service.getStorageExpenses()).toHaveLength(1);
      expect(service.getStorageExpenses()[0].id).toBe('imported-1');
    });
  });

  // ─── updateImportedExpense ───
  describe('updateImportedExpense', () => {
    it('merges imported fields into existing expense', () => {
      const r = service.create(makeExpense({ total: 100 }));
      const imported = { ...r.data!, total: 999 };
      const result = service.updateImportedExpense(imported);
      expect(result.succeeded).toBe(true);
      expect(service.getStorageExpenses()[0].total).toBe(999);
    });

    it('is a no-op for non-existent id (returns success)', () => {
      const missing: Expense = {
        id: 'missing',
        type: ExpenseType.Otro,
        total: 100,
        date: new Date(),
        paymentType: PaymentType.Efectivo,
        note: 'test note',
        isActive: true,
        createdDate: new Date(),
        createdByName: 'test',
      };
      const result = service.updateImportedExpense(missing);
      expect(result.succeeded).toBe(true);
      expect(service.getStorageExpenses()).toHaveLength(0);
    });
  });
});
