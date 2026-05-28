import { beforeEach, describe, expect, it } from 'vitest';
import { ExpenseType, PaymentType } from '@store-mgmt/domain';
import { ExpenseOfflineService } from './expense-offline-service';

const storeId = 'store-test';

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

  // S-EXP-4: delete removes expense, no-op on missing id
  it('S-EXP-4: delete removes expense', () => {
    const created = svc.create(makeExpenseInput());
    svc.delete(created.id);
    expect(svc.getAll()).toHaveLength(0);
  });

  it('S-EXP-4b: delete is no-op for missing id', () => {
    svc.create(makeExpenseInput());
    expect(() => svc.delete('nonexistent-id')).not.toThrow();
    expect(svc.getAll()).toHaveLength(1);
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
