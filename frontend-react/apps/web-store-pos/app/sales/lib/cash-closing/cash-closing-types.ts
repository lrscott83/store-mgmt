import type { Currency } from '@store-mgmt/domain';
import { Currency as CurrencyEnum } from '@store-mgmt/domain';

/**
 * Cierre Efectivo (cierre-efectivo, 2026-10-14) — cuadre del EFECTIVO de la
 * venta del día. Solo efectivo: nunca Transferencia ni Zelle (S1). Un registro
 * por (día local, moneda) — decisión owner S13.
 */

/** Estado del cierre del día. `Open` se llena durante el día; `Closed` queda congelado. */
export enum CashClosingStatus {
  Open = 'open',
  Closed = 'closed',
}

/** Una denominación del conteo: valor de la pieza y cuántas hay. */
export interface CashClosingDenomination {
  readonly value: number;
  readonly count: number;
}

/** Registro de cierre del efectivo de un (día, moneda). */
export interface CashClosing {
  /** Determinista: `${dayKey}|${currency}` — un registro por día y moneda. */
  readonly id: string;
  /** Día local `YYYY-MM-DD` (S2/S12). */
  readonly dayKey: string;
  readonly currency: Currency;
  /** Efectivo con el que se abre la caja (S9). */
  readonly openingCash: number;
  /** Conteo por denominaciones (S10/S11). */
  readonly denominations: CashClosingDenomination[];
  /** Comentario (obligatorio al cerrar cuando la diferencia no es cero — S4). */
  readonly comment: string;
  readonly status: CashClosingStatus;
  /** Suma de `valor × cantidad` del conteo (S10). */
  readonly countedTotal: number;
  /** Esperado = efectivo de la venta del día en esa moneda + apertura (S7). */
  readonly expectedTotal: number;
  /** `countedTotal − expectedTotal` (S7/S8). */
  readonly difference: number;
  readonly createdDate: string;
  readonly createdByName: string;
  readonly updatedDate: string;
  readonly updatedByName: string;
  /** Presente solo cuando el cierre está `Closed`. */
  readonly closedDate?: string;
  readonly closedByName?: string;
}

/**
 * Contenido persistido por tienda: los cierres (uno por día y moneda) y el
 * catálogo de denominaciones agregadas por el usuario, por moneda (S13 —
 * "se guarda por tienda").
 */
export interface CashClosingStore {
  readonly closings: CashClosing[];
  /** Clave = valor numérico de la moneda (como string). Valor = denominaciones, de mayor a menor. */
  readonly denominationCatalog: Record<string, number[]>;
}

/** Denominaciones por defecto de CUP (S11), de mayor a menor. */
export const DEFAULT_CUP_DENOMINATIONS: readonly number[] = [
  20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50, 20, 10, 5, 1,
];

/** Almacén vacío: sin cierres y sin catálogo propio. */
export function emptyCashClosingStore(): CashClosingStore {
  return { closings: [], denominationCatalog: {} };
}

/**
 * Denominaciones por defecto de una moneda: CUP trae la lista de S11; las demás
 * arrancan vacías (S13).
 */
export function defaultDenominationsFor(currency: Currency): number[] {
  return currency === CurrencyEnum.CUP ? [...DEFAULT_CUP_DENOMINATIONS] : [];
}

/** Ordena denominaciones de mayor a menor, sin duplicados. Puro. */
export function sortDenominationsDesc(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => b - a);
}

/** Suma del conteo `valor × cantidad`, redondeada a 2 decimales. Puro. */
export function countedTotalOf(denominations: readonly CashClosingDenomination[]): number {
  const sum = denominations.reduce((acc, d) => acc + d.value * d.count, 0);
  return Math.round((sum + Number.EPSILON) * 100) / 100;
}
