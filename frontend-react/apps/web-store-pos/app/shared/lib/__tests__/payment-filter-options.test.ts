import { describe, it, expect } from 'vitest';
import { Currency, OrderType, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import type { Expense, Order } from '@store-mgmt/domain';
import {
  collectExpensePaymentMethodKeys,
  collectOrderPaymentMethodKeys,
  matchesExpensePaymentFilter,
  matchesOrderPaymentFilter,
  paymentMethodKeyToLabel,
} from '../payment-filter-options';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    orderItems: [],
    total: 100,
    itemsCount: 1,
    date: new Date(2026, 0, 1, 12, 0, 0),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    createdDate: new Date(2026, 0, 1, 12, 0, 0),
    createdByName: 'test',
    ...overrides,
  } as Order;
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    type: 1,
    total: 10,
    date: new Date(2026, 0, 1, 12, 0, 0),
    paymentType: PaymentType.Efectivo,
    note: '',
    isActive: true,
    createdDate: new Date(2026, 0, 1, 12, 0, 0),
    createdByName: 'test',
    ...overrides,
  } as Expense;
}

describe('collectOrderPaymentMethodKeys', () => {
  it('devuelve [] sin órdenes', () => {
    expect(collectOrderPaymentMethodKeys([])).toEqual([]);
  });

  it('mapea legacy Efectivo → efectivo', () => {
    expect(collectOrderPaymentMethodKeys([makeOrder({ paymentType: PaymentType.Efectivo })])).toEqual([
      'efectivo',
    ]);
  });

  it('mapea legacy Tarjeta (CUP) → transferencia-0', () => {
    expect(collectOrderPaymentMethodKeys([makeOrder({ paymentType: PaymentType.Tarjeta })])).toEqual([
      'transferencia-0',
    ]);
  });

  it('salePaymentMethod autoritativo: Transferencia en USD → transferencia-1', () => {
    expect(
      collectOrderPaymentMethodKeys([
        makeOrder({ paymentType: PaymentType.Efectivo, salePaymentMethod: SalePaymentMethod.Transferencia, currency: Currency.USD }),
      ]),
    ).toEqual(['transferencia-1']);
  });

  it('Zelle → zelle', () => {
    expect(collectOrderPaymentMethodKeys([makeOrder({ paymentType: PaymentType.Zelle })])).toEqual([
      'zelle',
    ]);
  });

  it('orden sin ningún campo de método → efectivo (default histórico)', () => {
    const ghost = makeOrder();
    delete (ghost as Partial<Order>).paymentType;
    expect(collectOrderPaymentMethodKeys([ghost])).toEqual(['efectivo']);
  });

  it('deduplica y ordena: efectivo, zelle, transferencia por moneda', () => {
    const keys = collectOrderPaymentMethodKeys([
      makeOrder({ id: 'a', salePaymentMethod: SalePaymentMethod.Transferencia, currency: Currency.EUR }),
      makeOrder({ id: 'b', paymentType: PaymentType.Zelle }),
      makeOrder({ id: 'c' }),
      makeOrder({ id: 'd', paymentType: PaymentType.Tarjeta }),
      makeOrder({ id: 'e', salePaymentMethod: SalePaymentMethod.Transferencia, currency: Currency.USD }),
    ]);
    expect(keys).toEqual(['efectivo', 'zelle', 'transferencia-0', 'transferencia-1', 'transferencia-2']);
  });
});

describe('collectExpensePaymentMethodKeys', () => {
  it('devuelve [] sin gastos', () => {
    expect(collectExpensePaymentMethodKeys([])).toEqual([]);
  });

  it('legacy Tarjeta → transferencia-0 y Zelle → zelle', () => {
    expect(
      collectExpensePaymentMethodKeys([
        makeExpense({ paymentType: PaymentType.Tarjeta }),
        makeExpense({ paymentType: PaymentType.Zelle }),
      ]),
    ).toEqual(['zelle', 'transferencia-0']);
  });
});

describe('matchesOrderPaymentFilter', () => {
  it('legacy Tarjeta casa con transferencia-0 y no con efectivo', () => {
    const order = makeOrder({ paymentType: PaymentType.Tarjeta });
    expect(matchesOrderPaymentFilter(order, 'transferencia-0')).toBe(true);
    expect(matchesOrderPaymentFilter(order, 'efectivo')).toBe(false);
  });

  it('salePaymentMethod gana sobre el legacy', () => {
    const order = makeOrder({
      paymentType: PaymentType.Efectivo,
      salePaymentMethod: SalePaymentMethod.Zelle,
    });
    expect(matchesOrderPaymentFilter(order, 'zelle')).toBe(true);
    expect(matchesOrderPaymentFilter(order, 'efectivo')).toBe(false);
  });
});

describe('matchesExpensePaymentFilter', () => {
  it('legacy Zelle casa con zelle', () => {
    expect(matchesExpensePaymentFilter(makeExpense({ paymentType: PaymentType.Zelle }), 'zelle')).toBe(true);
    expect(matchesExpensePaymentFilter(makeExpense({ paymentType: PaymentType.Zelle }), 'efectivo')).toBe(false);
  });
});

describe('paymentMethodKeyToLabel', () => {
  it('etiquetas con moneda para transferencias', () => {
    expect(paymentMethodKeyToLabel('efectivo')).toBe('Efectivo');
    expect(paymentMethodKeyToLabel('zelle')).toBe('Zelle');
    expect(paymentMethodKeyToLabel('transferencia-0')).toBe('Transferencia (CUP)');
    expect(paymentMethodKeyToLabel('transferencia-1')).toBe('Transferencia (USD)');
  });
});
