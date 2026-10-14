import { beforeEach, describe, expect, it } from 'vitest';
import { Currency, SalePaymentMethod } from '@store-mgmt/domain';
import {
  CashClosingOfflineService,
  cashClosingId,
  differenceOf,
  expectedTotalOf,
} from '../cash-closing-offline-service';
import {
  CashClosingStatus,
  DEFAULT_CUP_DENOMINATIONS,
  countedTotalOf,
  defaultDenominationsFor,
  sortDenominationsDesc,
} from '../cash-closing-types';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { toLocalDayKey } from '~/shared/lib/date-utils';

const STORE = 'store-cash';
const DAY = toLocalDayKey(new Date());

function ordersKey(): string {
  return StorageKeys.entityKey('orders', STORE);
}

function seedOrder(overrides: Record<string, unknown> = {}): void {
  const order = {
    id: `o-${Math.random().toString(36).slice(2)}`,
    isActive: true,
    isCredit: false,
    total: 0,
    currency: Currency.CUP,
    salePaymentMethod: SalePaymentMethod.Efectivo,
    date: new Date().toISOString(),
    orderItems: [],
    ...overrides,
  };
  const raw = localStorage.getItem(ordersKey());
  const list = raw ? (JSON.parse(raw) as unknown[]) : [];
  list.push(order);
  localStorage.setItem(ordersKey(), JSON.stringify(list));
}

beforeEach(() => {
  localStorage.clear();
});

describe('cash-closing pure helpers', () => {
  it('Esperado = apertura + efectivo de la venta del día', () => {
    expect(expectedTotalOf(1_000, 250)).toBe(1_250);
  });

  it('Diferencia = contado − esperado', () => {
    expect(differenceOf(1_000, 1_250)).toBe(-250);
    expect(differenceOf(1_250, 1_250)).toBe(0);
  });

  it('Contado = Σ valor × cantidad', () => {
    expect(
      countedTotalOf([
        { value: 20_000, count: 2 },
        { value: 1_000, count: 3 },
      ]),
    ).toBe(43_000);
  });

  it('ordena denominaciones de mayor a menor sin duplicados', () => {
    expect(sortDenominationsDesc([100, 20_000, 100, 5])).toEqual([20_000, 100, 5]);
  });

  it('defaults: CUP trae la lista de S11; las demás monedas arrancan vacías', () => {
    expect(defaultDenominationsFor(Currency.CUP)).toEqual([...DEFAULT_CUP_DENOMINATIONS]);
    expect(defaultDenominationsFor(Currency.USD)).toEqual([]);
  });

  it('id de un cierre = día|moneda', () => {
    expect(cashClosingId('2026-10-14', Currency.CUP)).toBe('2026-10-14|0');
  });
});

describe('CashClosingOfflineService — denominaciones por tienda', () => {
  it('CUP devuelve los defaults cuando no hay catálogo propio', () => {
    const svc = new CashClosingOfflineService(STORE);
    expect(svc.getDenominationValues(Currency.CUP)).toEqual([...DEFAULT_CUP_DENOMINATIONS]);
  });

  it('otra moneda arranca vacía', () => {
    const svc = new CashClosingOfflineService(STORE);
    expect(svc.getDenominationValues(Currency.USD)).toEqual([]);
  });

  it('agrega una denominación nueva y la persiste de mayor a menor', () => {
    const svc = new CashClosingOfflineService(STORE);
    expect(svc.addDenominationValue(Currency.USD, 100)).toEqual([100]);
    expect(svc.addDenominationValue(Currency.USD, 50)).toEqual([100, 50]);

    // Otra instancia (mismo dispositivo) ve el catálogo persistido.
    const other = new CashClosingOfflineService(STORE);
    expect(other.getDenominationValues(Currency.USD)).toEqual([100, 50]);
  });
});

describe('CashClosingOfflineService — borrador y cierre', () => {
  it('guarda un borrador Abierto con contado, esperado y diferencia', () => {
    const svc = new CashClosingOfflineService(STORE);
    const record = svc.saveDraft(
      {
        dayKey: DAY,
        currency: Currency.CUP,
        openingCash: 1_000,
        denominations: [{ value: 1_000, count: 2 }],
        comment: '',
      },
      'cashier',
    );

    expect(record.status).toBe(CashClosingStatus.Open);
    expect(record.countedTotal).toBe(2_000);
    expect(record.expectedTotal).toBe(1_000);
    expect(record.difference).toBe(1_000);
    expect(svc.getClosing(DAY, Currency.CUP)?.id).toBe(cashClosingId(DAY, Currency.CUP));
  });

  it('cierra el cierre (Cerrada + fecha) y lo deja congelado ante nuevos borradores', () => {
    const svc = new CashClosingOfflineService(STORE);
    const draft = {
      dayKey: DAY,
      currency: Currency.CUP,
      openingCash: 500,
      denominations: [{ value: 100, count: 1 }],
      comment: 'faltan 400',
    };
    const closed = svc.closeClosing(draft, 'cashier');
    expect(closed.status).toBe(CashClosingStatus.Closed);
    expect(closed.closedDate).toBeTruthy();

    const after = svc.saveDraft({ ...draft, comment: 'cambio' }, 'cashier');
    expect(after.status).toBe(CashClosingStatus.Closed);
    expect(after.comment).toBe('faltan 400');
  });
});

describe('CashClosingOfflineService — efectivo de la venta del día (S1)', () => {
  it('suma solo Efectivo, de la moneda pedida, sin créditos ni Transferencia/Zelle', () => {
    seedOrder({ total: 100, currency: Currency.CUP });
    seedOrder({ total: 50, currency: Currency.CUP });
    seedOrder({ total: 30, currency: Currency.CUP, salePaymentMethod: SalePaymentMethod.Transferencia });
    seedOrder({ total: 20, currency: Currency.USD, salePaymentMethod: SalePaymentMethod.Transferencia });
    seedOrder({ total: 10, currency: Currency.USD, salePaymentMethod: SalePaymentMethod.Efectivo });
    seedOrder({ total: 70, currency: Currency.CUP, isCredit: true });

    const svc = new CashClosingOfflineService(STORE);
    expect(svc.getCashSalesTotal(DAY, Currency.CUP)).toBe(150);
    expect(svc.getCashSalesTotal(DAY, Currency.USD)).toBe(10);
  });
});

describe('CashClosingOfflineService — import', () => {
  it('fusiona catálogo y cierres, preservando un cierre local ya Cerrado', () => {
    const svc = new CashClosingOfflineService(STORE);
    svc.saveDraft(
      {
        dayKey: DAY,
        currency: Currency.CUP,
        openingCash: 500,
        denominations: [{ value: 100, count: 1 }],
        comment: 'local',
      },
      'cashier',
    );
    svc.closeClosing(
      {
        dayKey: DAY,
        currency: Currency.CUP,
        openingCash: 500,
        denominations: [{ value: 100, count: 1 }],
        comment: 'local',
      },
      'cashier',
    );

    svc.importStoreFromJson(
      JSON.stringify({
        closings: [
          {
            id: cashClosingId(DAY, Currency.CUP),
            dayKey: DAY,
            currency: Currency.CUP,
            openingCash: 9_999,
            denominations: [],
            comment: 'importado',
            status: CashClosingStatus.Open,
            countedTotal: 0,
            expectedTotal: 0,
            difference: 0,
            createdDate: '',
            createdByName: '',
            updatedDate: '',
            updatedByName: '',
          },
        ],
        denominationCatalog: { [String(Currency.USD)]: [200, 100] },
      }),
    );

    expect(svc.getClosing(DAY, Currency.CUP)?.comment).toBe('local');
    expect(svc.getDenominationValues(Currency.USD)).toEqual([200, 100]);
  });
});
