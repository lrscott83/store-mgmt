import { describe, expect, it } from 'vitest';
import type { Order, OrderItem } from '@store-mgmt/domain';
import { Currency, OrderType, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import {
  categoryBreakdown,
  formatBucketLabel,
  formatRangeLabel,
  orderCurrencies,
  paymentBreakdown,
  topProductsByProfit,
  topProductsByQuantity,
} from './dashboard-breakdowns';

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: 'p1',
    productName: 'Café',
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    name: 'Café',
    quantity: 1,
    price: 100,
    productBusinessId: 'b1',
    productCosts: [],
    order: 1,
    ...overrides,
  };
}

function makeOrder(id: string, overrides: Partial<Order> = {}): Order {
  const date = overrides.date ?? new Date('2026-02-02T10:00:00');
  return {
    id,
    orderItems: [],
    total: 100,
    itemsCount: 1,
    date,
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: date,
    createdByName: 'tester',
    ...overrides,
  } as Order;
}

const PAYMENT_LABELS: Partial<Record<SalePaymentMethod, string>> = {
  [SalePaymentMethod.Efectivo]: 'Efectivo',
  [SalePaymentMethod.Zelle]: 'Zelle',
  [SalePaymentMethod.Transferencia]: 'Transferencia',
};

function labelOf(method: SalePaymentMethod): string {
  return PAYMENT_LABELS[method] ?? 'Otro';
}

describe('dashboard-breakdowns — currency presence and order', () => {
  it('lists the order currencies in display order (USD → EUR → CUP → highest)', () => {
    const orders = [
      makeOrder('cup', { total: 9000 }),
      makeOrder('usd', { total: 1, currency: Currency.USD }),
      makeOrder('mlc', { total: 500, currency: Currency.MLC }),
    ];
    expect(orderCurrencies(orders)).toEqual([Currency.USD, Currency.CUP, Currency.MLC]);
  });

  it('empty orders yield no currencies', () => {
    expect(orderCurrencies([])).toEqual([]);
  });
});

describe('dashboard-breakdowns — payment and category splits', () => {
  it('splits one currency by REAL channel, ignoring the other currency', () => {
    const orders = [
      makeOrder('o1', { paymentType: PaymentType.Efectivo, total: 100 }),
      makeOrder('o2', { paymentType: PaymentType.Tarjeta, total: 50 }),
      makeOrder('o3', { paymentType: PaymentType.Efectivo, total: 25 }),
      makeOrder('usd', { paymentType: PaymentType.Efectivo, total: 999, currency: Currency.USD }),
    ];
    const slices = paymentBreakdown(orders, Currency.CUP, labelOf);
    // Legacy Tarjeta resolves to Transferencia (real channel), not "Tarjeta".
    expect(slices).toEqual([
      { id: String(SalePaymentMethod.Efectivo), name: 'Efectivo', value: 125 },
      { id: String(SalePaymentMethod.Transferencia), name: 'Transferencia', value: 50 },
    ]);
  });

  it('labels a CUP transfer as Transferencia (never Tarjeta) and keeps Zelle as its own slice', () => {
    const orders = [
      makeOrder('transfer-cup', {
        // Legacy field lies (CUP transfer mirrors Tarjeta normally), real field wins.
        paymentType: PaymentType.Tarjeta,
        salePaymentMethod: SalePaymentMethod.Transferencia,
        total: 200,
      }),
      makeOrder('zelle', { paymentType: PaymentType.Zelle, total: 40 }),
    ];
    const slices = paymentBreakdown(orders, Currency.CUP, labelOf);
    // Owner's correction (2026-09-26): Zelle is a channel like any other —
    // it is NOT collapsed into Transferencia.
    expect(slices).toEqual([
      { id: String(SalePaymentMethod.Transferencia), name: 'Transferencia', value: 200 },
      { id: String(SalePaymentMethod.Zelle), name: 'Zelle', value: 40 },
    ]);
    expect(slices.some((slice) => slice.name === 'Tarjeta')).toBe(false);
  });

  it('Zelle never reaches Tarjeta: three channels stay three slices', () => {
    const orders = [
      makeOrder('cash', { salePaymentMethod: SalePaymentMethod.Efectivo, total: 10 }),
      makeOrder('zelle', { salePaymentMethod: SalePaymentMethod.Zelle, total: 20 }),
      makeOrder('transfer', { salePaymentMethod: SalePaymentMethod.Transferencia, total: 30 }),
    ];
    const slices = paymentBreakdown(orders, Currency.CUP, labelOf);
    expect(slices.map((slice) => slice.name)).toEqual(['Transferencia', 'Zelle', 'Efectivo']);
    expect(slices.map((slice) => slice.value)).toEqual([30, 20, 10]);
    expect(slices.some((slice) => slice.name === 'Tarjeta')).toBe(false);
  });

  it('does NOT label a USD transfer as Efectivo: real channel wins within its currency', () => {
    const orders = [
      makeOrder('usd-transfer', {
        // A USD transfer writes legacy `paymentType = Efectivo` (compat :47).
        paymentType: PaymentType.Efectivo,
        salePaymentMethod: SalePaymentMethod.Transferencia,
        currency: Currency.USD,
        total: 30,
      }),
    ];
    const slices = paymentBreakdown(orders, Currency.USD, labelOf);
    expect(slices).toEqual([
      { id: String(SalePaymentMethod.Transferencia), name: 'Transferencia', value: 30 },
    ]);
  });

  it('splits one currency by category using the item totals', () => {
    const orders = [
      makeOrder('o1', {
        orderItems: [
          makeItem({ price: 10, quantity: 3, categoryId: 'cat-1', categoryName: 'Bebidas' }),
          makeItem({ price: 5, quantity: 2, categoryId: 'cat-2', categoryName: 'Snacks' }),
        ],
      }),
      makeOrder('o2', {
        orderItems: [
          makeItem({ price: 7, quantity: 1, categoryId: 'cat-2', categoryName: 'Snacks' }),
        ],
      }),
      makeOrder('usd', {
        currency: Currency.USD,
        orderItems: [
          makeItem({ price: 999, quantity: 1, categoryId: 'cat-1', categoryName: 'Bebidas' }),
        ],
      }),
    ];
    const slices = categoryBreakdown(orders, Currency.CUP);
    expect(slices).toEqual([
      { id: 'cat-1', name: 'Bebidas', value: 30 },
      { id: 'cat-2', name: 'Snacks', value: 17 },
    ]);
  });
});

describe('dashboard-breakdowns — top products', () => {
  it('ranks by profit within the chosen currency only', () => {
    const orders = [
      makeOrder('o1', {
        orderItems: [
          makeItem({
            productId: 'p1',
            productName: 'Ron',
            price: 100,
            quantity: 1,
            productCosts: [{ inventoryId: 'i1', quantity: 1, costPrice: 40 }],
          }),
          makeItem({
            productId: 'p2',
            productName: 'Café',
            price: 50,
            quantity: 1,
            productCosts: [{ inventoryId: 'i2', quantity: 1, costPrice: 45 }],
          }),
        ],
      }),
      makeOrder('usd', {
        currency: Currency.USD,
        orderItems: [makeItem({ productId: 'p3', productName: 'Té', price: 999, quantity: 1 })],
      }),
    ];
    expect(topProductsByProfit(orders, Currency.CUP)).toEqual([
      { id: 'p1', name: 'Ron', value: 60 },
      { id: 'p2', name: 'Café', value: 5 },
    ]);
  });

  it('ranks by units sold and caps at the requested size', () => {
    const orders = [
      makeOrder('o1', {
        orderItems: [
          makeItem({ productId: 'p1', productName: 'Ron', quantity: 5 }),
          makeItem({ productId: 'p2', productName: 'Café', quantity: 2 }),
          makeItem({ productId: 'p3', productName: 'Té', quantity: 9 }),
        ],
      }),
    ];
    const rows = topProductsByQuantity(orders, Currency.CUP, 2);
    expect(rows).toEqual([
      { id: 'p3', name: 'Té', value: 9 },
      { id: 'p1', name: 'Ron', value: 5 },
    ]);
  });
});

describe('dashboard-breakdowns — labels', () => {
  it('daily window of 7 days → weekday abbreviation', () => {
    const monday = { start: new Date(2026, 1, 2), end: new Date(2026, 1, 3) };
    expect(formatBucketLabel(monday, 'daily', 7)).toBe('Lun');
  });

  it('daily window longer than 7 days → day of month', () => {
    const day = { start: new Date(2026, 1, 2), end: new Date(2026, 1, 3) };
    expect(formatBucketLabel(day, 'daily', 31)).toBe('2');
  });

  it('weekly bucket → `Lun 2 – Dom 8` (inclusive last day)', () => {
    const week = { start: new Date(2026, 1, 2), end: new Date(2026, 1, 9) };
    expect(formatBucketLabel(week, 'weekly', 32)).toBe('Lun 2 – Dom 8');
  });

  it('monthly bucket → month abbreviation', () => {
    const month = { start: new Date(2026, 1, 1), end: new Date(2026, 2, 1) };
    expect(formatBucketLabel(month, 'monthly', 120)).toBe('Feb');
  });

  it('range label → `8/9 – 14/9`', () => {
    expect(formatRangeLabel(new Date(2026, 8, 8), new Date(2026, 8, 14))).toBe('8/9 – 14/9');
  });
});
