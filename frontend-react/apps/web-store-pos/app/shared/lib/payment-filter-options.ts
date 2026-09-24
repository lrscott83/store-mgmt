import { Currency, SalePaymentMethod, salePaymentMethodLabel } from '@store-mgmt/domain';
import type { Expense, Order } from '@store-mgmt/domain';
import {
  normalizedOrderPaymentMethod,
  resolvedExpensePaymentMethod,
} from '~/shared/lib/payment-method-resolved';

/**
 * Filtros de método de pago DINÁMICOS (2026-09-19): las vistas de ventas y
 * gastos muestran solo los métodos que realmente aparecen en sus datos, en
 * vez de una lista fija. Una "clave" identifica un método+moneda:
 *
 *   efectivo | zelle | transferencia-<valorCurrency>
 *
 * Las claves van ordenadas por grupo (Efectivo, Zelle, Transferencia por
 * moneda ascendente) para una lista estable en la UI. El método real se
 * resuelve con `payment-method-resolved`, que ya traduce el legacy
 * `paymentType` (Tarjeta → Transferencia-CUP, Zelle → Zelle, ausente →
 * Efectivo) y respeta el `salePaymentMethod` autoritativo de las órdenes.
 *
 * T9 (payment-channels-and-multipayment): en las ÓRDENES ya registradas la
 * clave se NORMALIZA — Efectivo se mantiene y Transferencia/Zelle (en
 * cualquier moneda) caen en `transferencia-0` ("Transferencia (CUP)"). Los
 * gastos conservan su clave real (Zelle y Transferencia con su moneda).
 */

/** Orden de presentación de los grupos de método en el filtro. */
function methodRank(method: SalePaymentMethod): number {
  switch (method) {
    case SalePaymentMethod.Efectivo:
      return 0;
    case SalePaymentMethod.Zelle:
      return 1;
    default:
      return 2;
  }
}

/** Clave de filtro de una entidad resuelta (método + moneda de los datos). */
function entityToKey(method: SalePaymentMethod, currency: Currency | number): string {
  return method === SalePaymentMethod.Transferencia
    ? `transferencia-${Number(currency)}`
    : method === SalePaymentMethod.Zelle
      ? 'zelle'
      : 'efectivo';
}

/** Clave de filtro de una orden REGISTRADA normalizada (T9). */
function orderToKey(order: Order): string {
  return entityToKey(normalizedOrderPaymentMethod(order), Currency.CUP);
}

/** Claves únicas presentes en las órdenes, ordenadas para la UI. */
export function collectOrderPaymentMethodKeys(orders: Order[]): string[] {
  const keys = new Set<string>();
  for (const order of orders) {
    keys.add(orderToKey(order));
  }
  return sortKeys([...keys]);
}

/** Claves únicas presentes en los gastos (con la moneda real del gasto), ordenadas. */
export function collectExpensePaymentMethodKeys(expenses: Expense[]): string[] {
  const keys = new Set<string>();
  for (const expense of expenses) {
    keys.add(
      entityToKey(resolvedExpensePaymentMethod(expense), expense.currency ?? Currency.CUP),
    );
  }
  return sortKeys([...keys]);
}

function sortKeys(keys: string[]): string[] {
  return keys.sort((a, b) => {
    const [methodA, curA] = parseKey(a);
    const [methodB, curB] = parseKey(b);
    if (methodA !== methodB) return methodRank(methodA) - methodRank(methodB);
    return curA - curB;
  });
}

function parseKey(key: string): [SalePaymentMethod, number] {
  if (key === 'zelle') return [SalePaymentMethod.Zelle, 0];
  if (key.startsWith('transferencia-')) {
    return [SalePaymentMethod.Transferencia, Number(key.slice('transferencia-'.length)) || 0];
  }
  return [SalePaymentMethod.Efectivo, 0];
}

/** ¿La orden cae bajo la clave de filtro dada? (normalizada, T9) */
export function matchesOrderPaymentFilter(order: Order, key: string): boolean {
  return orderToKey(order) === key;
}

/** ¿El gasto cae bajo la clave de filtro dada? (con la moneda real del gasto) */
export function matchesExpensePaymentFilter(expense: Expense, key: string): boolean {
  return (
    entityToKey(resolvedExpensePaymentMethod(expense), expense.currency ?? Currency.CUP) === key
  );
}

/** Etiqueta visible de una clave: "Efectivo", "Zelle", "Transferencia (CUP)"… */
export function paymentMethodKeyToLabel(key: string): string {
  const [method, currency] = parseKey(key);
  return salePaymentMethodLabel(method, currency);
}

/**
 * SalePaymentMethod de una clave — para elegir el icono del radio en la UI
 * (gastos reutiliza los glyph legacy: Efectivo→cash, Transferencia→card,
 * Zelle→phone).
 */
export function paymentMethodKeyToSalePaymentMethod(key: string): SalePaymentMethod {
  return parseKey(key)[0];
}
