import { beforeEach, describe, expect, it } from 'vitest';
import { Currency, ExpenseFundSource, ExpenseType, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import type { Expense } from '@store-mgmt/domain';
import { encryptEntity } from '../../storage/entity-crypto';
import { setDek, clearDek } from '../../storage/data-key-store';
import { computeStoreRangeSummary } from '../multi-store-aggregator';

/**
 * expense-fund-source (2026-10-24): la réplica de lectura por tienda del cuadre
 * debe descontar del efectivo SOLO los gastos `Caja`. `expensesTotal` sigue
 * sumando los dos orígenes (el negocio gastó el dinero, salga de donde salga).
 */

const STORE = 'store-range-fund-source';
const DEK = crypto.getRandomValues(new Uint8Array(32));
const START = new Date('2026-10-01T00:00:00');
const END = new Date('2026-10-31T00:00:00');

function seedEncrypted(entity: string, data: unknown): void {
  setDek(DEK, STORE);
  try {
    localStorage.setItem(
      `lizoft.store-${entity}-${STORE}`,
      encryptEntity(JSON.stringify(data)),
    );
  } finally {
    clearDek();
  }
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  const date = overrides.date ?? new Date('2026-10-10T10:00:00');
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    type: ExpenseType.Salario,
    total: 20,
    date,
    paymentType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: date,
    createdByName: 'tester',
    currency: Currency.CUP,
    ...overrides,
  } as unknown as Expense;
}

function summary() {
  return computeStoreRangeSummary(STORE, DEK, START, END, true, false);
}

beforeEach(() => {
  localStorage.clear();
});

describe('computeStoreRangeSummary — expense fund source', () => {
  it('counts only Caja expenses in expensesCashTotal', () => {
    seedEncrypted('expenses', [
      makeExpense({ id: 'caja', total: 30, fundSource: ExpenseFundSource.Caja }),
      makeExpense({ id: 'externo', total: 50, fundSource: ExpenseFundSource.Externo }),
    ]);

    const result = summary();
    expect(result.expensesCashTotal).toBe(30);
  });

  it('treats a legacy expense with no field as Externo', () => {
    seedEncrypted('expenses', [
      makeExpense({ id: 'legacy', total: 80 }),
      makeExpense({ id: 'caja', total: 30, fundSource: ExpenseFundSource.Caja }),
    ]);

    expect(summary().expensesCashTotal).toBe(30);
  });

  it('keeps expensesTotal summing both origins', () => {
    seedEncrypted('expenses', [
      makeExpense({ id: 'caja', total: 30, fundSource: ExpenseFundSource.Caja }),
      makeExpense({ id: 'externo', total: 50, fundSource: ExpenseFundSource.Externo }),
      makeExpense({ id: 'legacy', total: 70 }),
    ]);

    const result = summary();
    expect(result.expensesTotal).toBe(150);
    expect(result.expensesCashTotal).toBe(30);
  });

  it('does not read a cash expense paid by transfer as cash, because the origin is what counts', () => {
    seedEncrypted('expenses', [
      makeExpense({
        id: 'caja-transfer',
        total: 40,
        fundSource: ExpenseFundSource.Caja,
        salePaymentMethod: SalePaymentMethod.Transferencia,
      }),
    ]);

    expect(summary().expensesCashTotal).toBe(40);
  });

  it('excludes soft-deleted expenses from both totals', () => {
    seedEncrypted('expenses', [
      makeExpense({ id: 'caja', total: 30, fundSource: ExpenseFundSource.Caja }),
      makeExpense({ id: 'gone', total: 500, fundSource: ExpenseFundSource.Caja, isActive: false }),
    ]);

    const result = summary();
    expect(result.expensesCashTotal).toBe(30);
    expect(result.expensesTotal).toBe(30);
  });
});
