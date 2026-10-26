/**
 * Agregación mensual multi-tienda del Vector Fiscal ONAT (S5, S6, S9, S10).
 *
 * Lee las entidades ya cifradas de cada tienda con el DEK explícito de esa
 * tienda (nunca el DEK en memoria, que pertenece a la tienda seleccionada) y
 * devuelve doce filas mensuales en CUP. Es estrictamente de solo lectura: no
 * crea una capa de almacenamiento ni escribe nada.
 *
 * Reglas:
 * - Ingresos: órdenes no-crédito por su propia fecha + créditos cobrados por
 *   `paidDate` (S9). Una orden a crédito nunca suma por su fecha de venta.
 * - Moneda: cada importe se convierte a CUP con las tasas de la tienda de
 *   origen y la fecha del registro (S10). Sin tasa, el importe vale 0, se
 *   acumula en `skipped` y se reporta en `warnings`; nunca se inventa una tasa.
 * - Multi-tienda: las tiendas del selector se suman. Una tienda ilegible se
 *   omite con un warning en vez de romper el vector (S5).
 */
import {
  Currency,
  DEFAULT_CURRENCY,
  ExpenseType,
  convertLineAmount,
} from '@store-mgmt/domain';
import type { ChannelRate, Expense, Order, SaleCredit } from '@store-mgmt/domain';
import { round2 } from '~/shared/lib/money';
import { readStoreEntities } from '~/shared/lib/storage/read-store-entities';
import {
  readStoreActiveExpensesBetween,
  readStoreActiveOrdersBetween,
  readStorePaidSaleCreditsBetween,
  unwrapStoreDek,
} from '~/shared/lib/multistore/multi-store-aggregator';
import { isFiscalExpenseType } from './onat-taxonomy';

export interface OnatAggregationInput {
  /** Tiendas visibles en el selector; sin MultiStores contiene una sola. */
  readonly storeIds: readonly string[];
  readonly year: number;
}

/** Totales mensuales SIN las sobrescrituras del Owner (S3/S4). */
export interface OnatMonth {
  /** Mes natural, 0-11. */
  readonly month: number;
  /** Ordinarias no-crédito + créditos cobrados, en CUP. */
  readonly income: number;
  /** Total de gastos del mes, en CUP. */
  readonly expenses: number;
  /** Gastos con `type === Salario`, en CUP. */
  readonly salaries: number;
  /** Gastos fiscales por tipo; solo los tipos con importe mayor que cero. */
  readonly taxesByType: Partial<Record<ExpenseType, number>>;
}

export interface OnatAggregationResult {
  months: OnatMonth[];
  /** Una línea por tienda omitida o por moneda sin tasa. */
  warnings: string[];
  /** Cantidad de importes descartados por no tener tasa de cambio disponible. */
  skipped: number;
}

interface MonthAccumulator {
  income: number;
  expenses: number;
  salaries: number;
  taxesByType: Partial<Record<ExpenseType, number>>;
}

/**
 * Revive las fechas ISO que `readStoreEntities` devuelve tal cual del JSON y
 * aplica la misma migración de filas legacy (`value` → buy/sell) que el
 * servicio de tasas. Se lee con el DEK explícito de la tienda porque
 * `ChannelRateOfflineService` descifra con el DEK global de la tienda
 * seleccionada y no puede leer otra tienda del selector.
 */
function readStoreChannelRates(storeId: string, dek: Uint8Array | null): ChannelRate[] {
  return readStoreEntities<ChannelRate>('channelRates', storeId, dek).map((rate) => {
    const revived = { ...rate } as Record<string, unknown>;
    for (const field of ['effectiveFrom', 'createdDate']) {
      const value = revived[field];
      if (typeof value === 'string') revived[field] = new Date(value);
    }
    if (revived.buyValue === undefined && revived.sellValue === undefined) {
      const legacyValue = revived.value;
      if (typeof legacyValue === 'number') {
        revived.buyValue = legacyValue;
        revived.sellValue = legacyValue;
      }
    }
    return revived as unknown as ChannelRate;
  });
}

/** Convierte un importe en UNIDADES a CUP; `null` cuando no hay tasa resoluble. */
function amountInCup(
  amount: number,
  currency: Currency | undefined,
  at: Date,
  rates: readonly ChannelRate[],
): number | null {
  const from = currency ?? DEFAULT_CURRENCY;
  if (Number(from) === Number(Currency.CUP)) return round2(amount);

  // El dominio convierte en CENTAVOS enteros con un único redondeo HALF-UP.
  const converted = convertLineAmount(Math.round(amount * 100), from, Currency.CUP, rates, at);
  if (!converted.succeeded || converted.data === undefined) return null;
  return converted.data / 100;
}

function monthIndexOf(date: Date, year: number): number | null {
  return date.getFullYear() === year ? date.getMonth() : null;
}

function localDateLabel(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function roundedTaxes(
  taxesByType: Partial<Record<ExpenseType, number>>,
): Partial<Record<ExpenseType, number>> {
  const result: Partial<Record<ExpenseType, number>> = {};
  for (const [tipo, importe] of Object.entries(taxesByType)) {
    const rounded = round2(importe);
    if (rounded > 0) result[Number(tipo) as ExpenseType] = rounded;
  }
  return result;
}

export async function aggregateOnatMonths(
  input: OnatAggregationInput,
): Promise<OnatAggregationResult> {
  const { year } = input;
  const yearStart = new Date(year, 0, 1, 0, 0, 0, 0);
  const yearEnd = new Date(year + 1, 0, 1, 0, 0, 0, 0);
  const accumulators: MonthAccumulator[] = Array.from({ length: 12 }, () => ({
    income: 0,
    expenses: 0,
    salaries: 0,
    taxesByType: {},
  }));

  const warnings: string[] = [];
  const warnedCurrencies = new Set<string>();
  let skipped = 0;

  const reportMissingRate = (
    storeId: string,
    currency: Currency | undefined,
    at: Date,
  ): void => {
    skipped += 1;
    const from = currency ?? DEFAULT_CURRENCY;
    const key = `${storeId}:${from}`;
    if (warnedCurrencies.has(key)) return;
    warnedCurrencies.add(key);
    warnings.push(
      `Tienda ${storeId}: sin tasa de cambio para ${Currency[from]} el ${localDateLabel(at)}; importe omitido.`,
    );
  };

  const addOrderIncome = (storeId: string, orders: Order[], rates: ChannelRate[]): void => {
    for (const order of orders) {
      // Una venta a crédito se cobra por `SaleCredit.paidDate`, nunca por su fecha.
      if (order.isCredit) continue;
      const month = monthIndexOf(order.date, year);
      if (month === null) continue;
      const amount = amountInCup(order.total, order.currency, order.date, rates);
      if (amount === null) {
        reportMissingRate(storeId, order.currency, order.date);
        continue;
      }
      accumulators[month].income += amount;
    }
  };

  const addCreditIncome = (storeId: string, credits: SaleCredit[], rates: ChannelRate[]): void => {
    for (const credit of credits) {
      const month = monthIndexOf(credit.paidDate, year);
      if (month === null) continue;
      const amount = amountInCup(credit.total, credit.currency, credit.paidDate, rates);
      if (amount === null) {
        reportMissingRate(storeId, credit.currency, credit.paidDate);
        continue;
      }
      accumulators[month].income += amount;
    }
  };

  const addExpenses = (storeId: string, expenses: Expense[], rates: ChannelRate[]): void => {
    for (const expense of expenses) {
      const month = monthIndexOf(expense.date, year);
      if (month === null) continue;
      const amount = amountInCup(expense.total, expense.currency, expense.date, rates);
      if (amount === null) {
        reportMissingRate(storeId, expense.currency, expense.date);
        continue;
      }

      const monthAccumulator = accumulators[month];
      monthAccumulator.expenses += amount;
      if (expense.type === ExpenseType.Salario) monthAccumulator.salaries += amount;
      if (isFiscalExpenseType(expense.type)) {
        monthAccumulator.taxesByType[expense.type] =
          (monthAccumulator.taxesByType[expense.type] ?? 0) + amount;
      }
    }
  };

  for (const storeId of input.storeIds) {
    try {
      const dek = await unwrapStoreDek(storeId);
      const rates = readStoreChannelRates(storeId, dek);
      const orders = readStoreActiveOrdersBetween(storeId, dek, yearStart, yearEnd);
      const credits = readStorePaidSaleCreditsBetween(storeId, dek, yearStart, yearEnd);
      const expenses = readStoreActiveExpensesBetween(storeId, dek, yearStart, yearEnd);

      addOrderIncome(storeId, orders, rates);
      addCreditIncome(storeId, credits, rates);
      addExpenses(storeId, expenses, rates);
    } catch {
      warnings.push(`Tienda ${storeId} omitida: no se pudieron leer sus datos.`);
    }
  }

  return {
    months: accumulators.map((accumulator, month) => ({
      month,
      income: round2(accumulator.income),
      expenses: round2(accumulator.expenses),
      salaries: round2(accumulator.salaries),
      taxesByType: roundedTaxes(accumulator.taxesByType),
    })),
    warnings,
    skipped,
  };
}
