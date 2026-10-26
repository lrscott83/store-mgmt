import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Currency,
  ExpenseType,
  OrderType,
  PaymentType,
  SalePaymentMethod,
} from '@store-mgmt/domain';
import type { ChannelRate, Expense, Order, SaleCredit } from '@store-mgmt/domain';
import { aggregateOnatMonths } from '../onat-aggregation';

const fixture = vi.hoisted(() => ({
  failedStores: new Set<string>(),
  orders: {} as Record<string, Order[]>,
  credits: {} as Record<string, SaleCredit[]>,
  expenses: {} as Record<string, Expense[]>,
  rates: {} as Record<string, ChannelRate[]>,
}));

vi.mock('~/shared/lib/multistore/multi-store-aggregator', () => ({
  unwrapStoreDek: vi.fn(async (storeId: string) => {
    if (fixture.failedStores.has(storeId)) throw new Error('no dek');
    return new Uint8Array([1]);
  }),
  readStoreActiveOrdersBetween: vi.fn((storeId: string) => fixture.orders[storeId] ?? []),
  readStorePaidSaleCreditsBetween: vi.fn((storeId: string) => fixture.credits[storeId] ?? []),
  readStoreActiveExpensesBetween: vi.fn((storeId: string) => fixture.expenses[storeId] ?? []),
}));

vi.mock('~/shared/lib/storage/read-store-entities', () => ({
  readStoreEntities: vi.fn((_entity: string, storeId: string) => fixture.rates[storeId] ?? []),
}));

const YEAR = 2026;

function localDate(month: number, day: number, hour = 12): Date {
  return new Date(YEAR, month, day, hour, 0, 0, 0);
}

function makeOrder(id: string, overrides: Partial<Order> = {}): Order {
  const date = overrides.date ?? localDate(0, 1);
  return {
    id,
    orderItems: [],
    total: 0,
    itemsCount: 0,
    date,
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: date,
    createdByName: 'tester',
    ...overrides,
  };
}

function makeCredit(id: string, overrides: Partial<SaleCredit> = {}): SaleCredit {
  const date = overrides.date ?? localDate(0, 1);
  return {
    id,
    orderId: 'order-1',
    client: 'Ana',
    total: 0,
    date,
    paid: 0,
    isPaid: true,
    paidDate: date,
    paidType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: date,
    createdByName: 'tester',
    ...overrides,
  };
}

function makeExpense(id: string, overrides: Partial<Expense> = {}): Expense {
  const date = overrides.date ?? localDate(0, 1);
  return {
    id,
    type: ExpenseType.Otro,
    total: 0,
    date,
    paymentType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: date,
    createdByName: 'tester',
    ...overrides,
  };
}

function makeRate(overrides: Partial<ChannelRate> = {}): ChannelRate {
  return {
    id: 'rate-cup',
    method: SalePaymentMethod.Efectivo,
    currency: Currency.CUP,
    buyValue: 690,
    sellValue: 700,
    effectiveFrom: localDate(0, 1),
    createdDate: localDate(0, 1),
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  fixture.failedStores.clear();
  for (const storeId of Object.keys(fixture.orders)) delete fixture.orders[storeId];
  for (const storeId of Object.keys(fixture.credits)) delete fixture.credits[storeId];
  for (const storeId of Object.keys(fixture.expenses)) delete fixture.expenses[storeId];
  for (const storeId of Object.keys(fixture.rates)) delete fixture.rates[storeId];
  vi.clearAllMocks();
});

describe('aggregateOnatMonths — ingresos', () => {
  it('imputa el crédito cobrado al mes de paidDate y no al mes de la venta', async () => {
    fixture.credits.s1 = [
      makeCredit('c1', {
        date: localDate(0, 15),
        paidDate: localDate(2, 10),
        total: 25_000,
      }),
    ];

    const result = await aggregateOnatMonths({ storeIds: ['s1'], year: YEAR });

    expect(result.months).toHaveLength(12);
    expect(result.months.map((month) => month.month)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(result.months[0].income).toBe(0);
    expect(result.months[2].income).toBe(25_000);
    expect(result.warnings).toEqual([]);
  });

  it('cuenta la orden no-crédito en su propio mes y descarta la orden a crédito', async () => {
    fixture.orders.s1 = [
      makeOrder('o-jan', { date: new Date(YEAR, 0, 31, 23, 59), total: 100 }),
      makeOrder('o-feb', { date: new Date(YEAR, 1, 1, 0, 0), total: 200 }),
      makeOrder('o-credit', { date: localDate(1, 10), total: 99_999, isCredit: true }),
    ];

    const result = await aggregateOnatMonths({ storeIds: ['s1'], year: YEAR });

    expect(result.months[0].income).toBe(100);
    expect(result.months[1].income).toBe(200);
    expect(result.months.reduce((sum, month) => sum + month.income, 0)).toBe(300);
  });
});

describe('aggregateOnatMonths — gastos', () => {
  it('separa los salarios del resto de gastos', async () => {
    fixture.expenses.s1 = [
      makeExpense('e1', { type: ExpenseType.Salario, total: 8_000, date: localDate(3, 1) }),
      makeExpense('e2', { type: ExpenseType.Transporte, total: 2_000, date: localDate(3, 2) }),
      makeExpense('e3', { type: ExpenseType.Salario, total: 1_500, date: localDate(3, 3) }),
    ];

    const result = await aggregateOnatMonths({ storeIds: ['s1'], year: YEAR });

    expect(result.months[3].expenses).toBe(11_500);
    expect(result.months[3].salaries).toBe(9_500);
  });

  it('agrupa los gastos fiscales por tipo y descarta los importes en cero', async () => {
    fixture.expenses.s1 = [
      makeExpense('e1', {
        type: ExpenseType.ImpuestoVentas,
        total: 1_200,
        date: localDate(4, 1),
      }),
      makeExpense('e2', {
        type: ExpenseType.CuotaMensual,
        total: 400,
        date: localDate(4, 2),
      }),
      makeExpense('e3', {
        type: ExpenseType.ImpuestoVentas,
        total: 100,
        date: localDate(4, 3),
      }),
      makeExpense('e4', { type: ExpenseType.Otro, total: 50, date: localDate(4, 4) }),
    ];

    const result = await aggregateOnatMonths({ storeIds: ['s1'], year: YEAR });

    expect(result.months[4].expenses).toBe(1_750);
    expect(result.months[4].taxesByType).toEqual({
      [ExpenseType.ImpuestoVentas]: 1_300,
      [ExpenseType.CuotaMensual]: 400,
    });
    expect(result.months[4].taxesByType[ExpenseType.Otro]).toBeUndefined();
  });
});

describe('aggregateOnatMonths — moneda', () => {
  it('convierte a CUP con la tasa de la tienda a la fecha del registro', async () => {
    fixture.rates.s1 = [
      makeRate({
        effectiveFrom: '2026-01-01T00:00:00' as unknown as Date,
        buyValue: 690,
        sellValue: 700,
      }),
    ];
    fixture.orders.s1 = [
      makeOrder('o-usd', { date: localDate(1, 5), total: 10, currency: Currency.USD }),
    ];
    fixture.expenses.s1 = [
      makeExpense('e-usd', {
        type: ExpenseType.Transporte,
        total: 2,
        currency: Currency.USD,
        date: localDate(1, 6),
      }),
    ];

    const result = await aggregateOnatMonths({ storeIds: ['s1'], year: YEAR });

    expect(result.months[1].income).toBe(7_000);
    expect(result.months[1].expenses).toBe(1_400);
    expect(result.skipped).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it('cuenta como cero la moneda sin tasa, la acumula en skipped y emite un warning', async () => {
    fixture.orders.s1 = [
      makeOrder('o-eur-1', { date: localDate(2, 5), total: 10, currency: Currency.EUR }),
      makeOrder('o-eur-2', { date: localDate(2, 6), total: 20, currency: Currency.EUR }),
    ];

    const result = await aggregateOnatMonths({ storeIds: ['s1'], year: YEAR });

    expect(result.months[2].income).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('s1');
    expect(result.warnings[0]).toContain('EUR');
  });
});

describe('aggregateOnatMonths — multi-tienda', () => {
  it('suma las tiendas del selector en un mismo vector', async () => {
    fixture.orders.s1 = [makeOrder('o1', { date: localDate(5, 1), total: 100 })];
    fixture.orders.s2 = [makeOrder('o2', { date: localDate(5, 2), total: 250 })];

    const result = await aggregateOnatMonths({ storeIds: ['s1', 's2'], year: YEAR });

    expect(result.months[5].income).toBe(350);
  });

  it('omite la tienda que no se puede leer y la reporta sin romper la agregación', async () => {
    fixture.failedStores.add('s2');
    fixture.orders.s1 = [makeOrder('o1', { date: localDate(6, 1), total: 100 })];
    fixture.orders.s2 = [makeOrder('o2', { date: localDate(6, 1), total: 500 })];

    const result = await aggregateOnatMonths({ storeIds: ['s1', 's2'], year: YEAR });

    expect(result.months[6].income).toBe(100);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('s2');
  });
});
