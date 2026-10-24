import { beforeEach, describe, expect, it } from 'vitest';
import { Currency, ExpenseFundSource, ExpenseType, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import { CashClosingOfflineService, expectedTotalOf } from '../cash-closing-offline-service';
import { CashClosingStatus } from '../cash-closing-types';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';

/**
 * expense-fund-source (2026-10-24): el Esperado del cierre resta SOLO los
 * gastos pagados con dinero de la caja. Un gasto `Externo` —o un histórico sin
 * el campo— nunca tocó el cajón y no puede mover el arqueo.
 *
 * RDD R3-7: el día es una constante literal, no `new Date()` al cargar el
 * módulo — así el test no depende de la hora de la pared ni cruza medianoche.
 */

const STORE = 'store-cash-fund-source';
const DAY = '2026-10-24';

function ordersKey(): string {
  return StorageKeys.entityKey('orders', STORE);
}

function expensesKey(): string {
  return StorageKeys.entityKey('expenses', STORE);
}

function seedOrder(total: number, paymentMethod = SalePaymentMethod.Efectivo): void {
  const raw = localStorage.getItem(ordersKey());
  const list = raw ? (JSON.parse(raw) as unknown[]) : [];
  list.push({
    id: `o-${Math.random().toString(36).slice(2)}`,
    isActive: true,
    isCredit: false,
    total,
    currency: Currency.CUP,
    salePaymentMethod: paymentMethod,
    date: new Date(`${DAY}T12:00:00`),
    orderItems: [],
  });
  localStorage.setItem(ordersKey(), JSON.stringify(list));
}

function seedExpense(
  id: string,
  total: number,
  options: { fundSource?: ExpenseFundSource; currency?: Currency } = {},
): void {
  const raw = localStorage.getItem(expensesKey());
  const list = raw ? (JSON.parse(raw) as unknown[]) : [];
  list.push({
    id,
    type: ExpenseType.Salario,
    total,
    date: new Date(`${DAY}T12:00:00`),
    paymentType: PaymentType.Efectivo,
    isActive: true,
    currency: options.currency ?? Currency.CUP,
    ...(options.fundSource !== undefined ? { fundSource: options.fundSource } : {}),
  });
  localStorage.setItem(expensesKey(), JSON.stringify(list));
}

function draft() {
  return {
    dayKey: DAY,
    currency: Currency.CUP,
    openingCash: 1_000,
    denominations: [{ value: 1_000, count: 1 }],
    comment: '',
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('expectedTotalOf with cash expenses', () => {
  it('keeps the historical two-argument behaviour when there are no cash expenses', () => {
    expect(expectedTotalOf(1_000, 250)).toBe(1_250);
  });

  it('subtracts the cash expenses from opening + cash sales', () => {
    expect(expectedTotalOf(1_000, 250, 100)).toBe(1_150);
  });

  it('can go below the opening cash when the drawer paid more than it sold', () => {
    expect(expectedTotalOf(500, 0, 800)).toBe(-300);
  });
});

describe('CashClosingOfflineService — gastos de caja', () => {
  it('counts only Caja expenses, ignoring Externo and legacy rows with no field', () => {
    seedExpense('caja', 30, { fundSource: ExpenseFundSource.Caja });
    seedExpense('externo', 50, { fundSource: ExpenseFundSource.Externo });
    seedExpense('legacy', 70);

    const svc = new CashClosingOfflineService(STORE);
    expect(svc.getCashExpensesTotal(DAY, Currency.CUP)).toBe(30);
  });

  it('separates the cash expenses by currency', () => {
    seedExpense('cup-1', 30, { fundSource: ExpenseFundSource.Caja, currency: Currency.CUP });
    seedExpense('usd-1', 5, { fundSource: ExpenseFundSource.Caja, currency: Currency.USD });
    seedExpense('usd-externo', 100, { fundSource: ExpenseFundSource.Externo, currency: Currency.USD });

    const svc = new CashClosingOfflineService(STORE);
    expect(svc.getCashExpensesTotal(DAY, Currency.CUP)).toBe(30);
    expect(svc.getCashExpensesTotal(DAY, Currency.USD)).toBe(5);
  });

  it('describes cash expenses as monetary entries for the currency selector', () => {
    seedExpense('caja-usd', 5, { fundSource: ExpenseFundSource.Caja, currency: Currency.USD });
    seedExpense('caja-cup', 30, { fundSource: ExpenseFundSource.Caja });

    const entries = new CashClosingOfflineService(STORE).getCashExpensesEntries(DAY);
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        { amount: 30, currency: Currency.CUP },
        { amount: 5, currency: Currency.USD },
      ]),
    );
  });

  it('subtracts only the Caja expenses from the Esperado', () => {
    seedOrder(250);
    seedExpense('caja', 100, { fundSource: ExpenseFundSource.Caja });
    seedExpense('externo', 900, { fundSource: ExpenseFundSource.Externo });
    seedExpense('legacy', 900);

    const svc = new CashClosingOfflineService(STORE);
    // 1 000 apertura + 250 efectivo − 100 de caja = 1 150 (los 900 externos no tocan la caja).
    expect(svc.getExpectedTotal(DAY, Currency.CUP, 1_000)).toBe(1_150);
  });

  it('ignores a cash expense in another currency', () => {
    seedOrder(250);
    seedExpense('caja-usd', 40, { fundSource: ExpenseFundSource.Caja, currency: Currency.USD });

    const svc = new CashClosingOfflineService(STORE);
    expect(svc.getExpectedTotal(DAY, Currency.CUP, 1_000)).toBe(1_250);
  });

  it('snapshots cashExpensesTotal on the record', () => {
    seedExpense('caja', 100, { fundSource: ExpenseFundSource.Caja });

    const svc = new CashClosingOfflineService(STORE);
    const record = svc.saveDraft(draft(), 'tester', STORE);
    expect(record.cashExpensesTotal).toBe(100);
    expect(record.expectedTotal).toBe(900);
    expect(svc.getClosing(DAY, Currency.CUP, STORE)?.cashExpensesTotal).toBe(100);
  });

  it('a Closed record keeps its frozen snapshot even if a cash expense is added afterwards', () => {
    seedExpense('caja', 100, { fundSource: ExpenseFundSource.Caja });

    const svc = new CashClosingOfflineService(STORE);
    const closed = svc.closeClosing(draft(), 'tester', STORE);
    expect(closed.status).toBe(CashClosingStatus.Closed);
    const frozenExpected = closed.expectedTotal;
    const frozenExpenses = closed.cashExpensesTotal;

    seedExpense('caja-late', 250, { fundSource: ExpenseFundSource.Caja });
    const reread = new CashClosingOfflineService(STORE).getClosing(DAY, Currency.CUP, STORE);

    expect(reread?.expectedTotal).toBe(frozenExpected);
    expect(reread?.cashExpensesTotal).toBe(frozenExpenses);
  });
});
