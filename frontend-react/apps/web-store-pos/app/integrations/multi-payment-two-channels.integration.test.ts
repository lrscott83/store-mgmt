import { beforeEach, describe, expect, it } from 'vitest';
import { ChannelRateErrors, Currency, SalePaymentMethod, summarizePayments } from '@store-mgmt/domain';
import type { ChannelRate } from '@store-mgmt/domain';
import { ChannelRateOfflineService } from '~/management/channel-rates/lib/services/channel-rate-offline-service';
import { createPaymentRow } from '~/shared/components/multipayments/multi-payment-list';
import type { MultiPaymentRow } from '~/shared/components/multipayments/multi-payment-list';
import { settleMultiPayments } from '~/shared/components/multipayments/multi-payment-settlement';
import type { MultiPaymentSettlement } from '~/shared/components/multipayments/multi-payment-settlement';

/**
 * INTEGRACIÓN (servicios + repositorios, sin render, sin navegador, sin E2E).
 *
 * Reemplaza el NÚCLEO DE NEGOCIO del E2E `multipayments` T10.2 — "fila por defecto, segundo canal
 * por el popup, recálculo y bloqueo por subpago":
 *
 *   "Con el módulo de multipagos activo, pagar una venta en dos partes por canales distintos
 *    (mitad efectivo y mitad transferencia): que el total y el vuelto se recalculan bien, y que
 *    no te dejan registrar una venta pagada de menos (bloqueo por subpago)."
 *
 * Los tres hechos son lógica pura y se prueban con las piezas REALES:
 *   - el registro de tasas por canal  → `ChannelRateOfflineService` (servicio + repositorio real
 *     sobre `localStorage`, misma clave y misma cascada que la app);
 *   - la liquidación de las filas     → `settleMultiPayments` (servicio puro que convierte cada
 *     fila con el dominio y talla con `summarizePayments`);
 *   - el bloqueo del registro         → el MISMO resultado que lee el guard del submit
 *     (`cart-shell.tsx`: `firstError !== null || remainingCents > 0`), así que la condición que
 *     este archivo asevera es exactamente la que deshabilita "Registrar".
 *
 * Lo que NO se prueba aquí (y por eso el E2E existente NO se toca): que el popup "Agregar pago"
 * abra, que el router navegue y que la venta se registre contra el backend real.
 */

const STORE_ID = 'store-integration-1';
/** Momento en que se liquida la venta: posterior a la tasa registrada, para que caiga en vigencia. */
const AT = new Date('2026-09-24T12:00:00.000Z');
const RATE_EFFECTIVE_FROM = new Date('2026-09-01T00:00:00.000Z');

/** T10.2: el vendedor registra 100 CUP por 1 USD en /management/channel-rates. */
const CUP_PER_USD = 100;

/** La venta del E2E: un producto de 10 CUP vendido en USD ⇒ 10 CUP = 0.10 USD con la tasa de arriba. */
const SALE_CURRENCY = Currency.USD;
const SALE_TOTAL_UNITS = 0.1;

/** Registra la tasa CUP por el servicio real (mismo camino que el formulario de tasas). */
function registerCupRate(): void {
  const written = new ChannelRateOfflineService(STORE_ID).registerRate({
    method: SalePaymentMethod.Efectivo,
    currency: Currency.CUP,
    value: CUP_PER_USD,
    effectiveFrom: RATE_EFFECTIVE_FROM,
  });
  expect(written.succeeded).toBe(true);
}

/** Lee el registro desde el repositorio real (instancia nueva ⇒ relee localStorage). */
function storedRates(): ChannelRate[] {
  return new ChannelRateOfflineService(STORE_ID).getStorageChannelRates();
}

function settle(
  rows: readonly MultiPaymentRow[],
  totalUnits = SALE_TOTAL_UNITS,
): MultiPaymentSettlement {
  return settleMultiPayments(rows, SALE_CURRENCY, totalUnits, storedRates(), AT);
}

/** El predicado EXACTO del guard del submit (cart-shell.tsx). */
function isRegisterBlocked(settlement: MultiPaymentSettlement): boolean {
  return settlement.firstError !== null || settlement.remainingCents > 0;
}

/**
 * El vuelto que muestra la lista: `summarizePayments` sobre los montos convertidos a la moneda de
 * la orden, en centavos — la misma cuenta que hace `MultiPaymentList` sobre sus filas evaluadas.
 */
function changeUnits(settlement: MultiPaymentSettlement): number {
  const convertedCents = settlement.orderPayments.map((payment) => ({
    amountInOrderCurrency: Math.round(payment.amountInOrderCurrency * 100),
  }));
  const { change } = summarizePayments(Math.round(SALE_TOTAL_UNITS * 100), convertedCents);
  return change / 100;
}

describe('T10.2 — pagar una venta en dos canales distintos (servicios + repositorios)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('la tasa que registra el servicio es la que la liquidación lee (ida y vuelta por el registro)', () => {
    registerCupRate();

    const rates = storedRates();
    expect(rates).toHaveLength(1);
    expect(rates[0]).toMatchObject({
      method: SalePaymentMethod.Efectivo,
      currency: Currency.CUP,
      value: CUP_PER_USD,
    });
    // Las fechas se reviven en la lectura: la liquidación compara instantes, no strings.
    expect(rates[0]!.effectiveFrom).toBeInstanceOf(Date);
    expect(rates[0]!.effectiveFrom.getTime()).toBe(RATE_EFFECTIVE_FROM.getTime());
  });

  it('mitad efectivo y mitad transferencia cubren el total: nada pendiente y sin error de tasa', () => {
    registerCupRate();

    const settlement = settle([
      createPaymentRow(SalePaymentMethod.Efectivo, Currency.CUP, 5),
      createPaymentRow(SalePaymentMethod.Transferencia, Currency.CUP, 5),
    ]);

    expect(settlement.firstError).toBeNull();
    expect(settlement.remainingCents).toBe(0);
    expect(isRegisterBlocked(settlement)).toBe(false);

    expect(settlement.orderPayments).toHaveLength(2);
    // Cada fila conserva su MONTO en SU moneda (5 CUP) y además se persiste el convertido.
    expect(settlement.orderPayments[0]).toMatchObject({
      method: SalePaymentMethod.Efectivo,
      currency: Currency.CUP,
      amount: 5,
      amountInOrderCurrency: 0.05,
      rateApplied: CUP_PER_USD,
    });
    // La Transferencia (CUP) no tiene fila propia de tasa: la cascada del dominio cae a la tasa de
    // la misma moneda (Efectivo+CUP) y la deja anotada como procedencia de la tasa aplicada.
    expect(settlement.orderPayments[1]).toMatchObject({
      method: SalePaymentMethod.Transferencia,
      currency: Currency.CUP,
      amount: 5,
      amountInOrderCurrency: 0.05,
      rateApplied: CUP_PER_USD,
      rateMethod: SalePaymentMethod.Efectivo,
      rateCurrency: Currency.CUP,
    });
  });

  it('el total y el vuelto se recalculan: pagar de más deja vuelto y sigue sin bloquear', () => {
    registerCupRate();

    // 15 CUP = 0.15 USD sobre un total de 0.10 USD ⇒ sobran 0.05 USD.
    const settlement = settle([createPaymentRow(SalePaymentMethod.Efectivo, Currency.CUP, 15)]);

    expect(settlement.firstError).toBeNull();
    expect(settlement.remainingCents).toBe(0);
    expect(changeUnits(settlement)).toBe(0.05);
    expect(isRegisterBlocked(settlement)).toBe(false);
  });

  it('no te dejan registrar una venta pagada de menos (bloqueo por subpago)', () => {
    registerCupRate();

    // 5 CUP = 0.05 USD sobre un total de 0.10 USD: falta la mitad.
    const underpaid = settle([createPaymentRow(SalePaymentMethod.Efectivo, Currency.CUP, 5)]);
    expect(underpaid.firstError).toBeNull();
    expect(underpaid.remainingCents).toBe(5);
    expect(isRegisterBlocked(underpaid)).toBe(true);

    // Borde: exactamente cubierto no bloquea; un centavo por debajo sí.
    const exact = settle([createPaymentRow(SalePaymentMethod.Efectivo, Currency.CUP, 10)]);
    expect(exact.remainingCents).toBe(0);
    expect(isRegisterBlocked(exact)).toBe(false);

    // 9.4 CUP = 0.094 USD ⇒ un solo centavo sin cubrir (el redondeo half-up del dominio es el
    // único punto de redondeo: 9.4 centavos quedan en 9, no en 10).
    const oneCentShort = settle([createPaymentRow(SalePaymentMethod.Efectivo, Currency.CUP, 9.4)]);
    expect(oneCentShort.remainingCents).toBe(1);
    expect(isRegisterBlocked(oneCentShort)).toBe(true);
  });

  it('una fila que no se puede convertir bloquea el registro aunque las demás cubran el total', () => {
    registerCupRate();

    const settlement = settle([
      // Cubre el total por sí sola (misma moneda que la venta ⇒ identidad).
      createPaymentRow(SalePaymentMethod.Efectivo, Currency.USD, SALE_TOTAL_UNITS),
      // EUR sin tasa registrada: NUNCA se sustituye por 0 en silencio.
      createPaymentRow(SalePaymentMethod.Efectivo, Currency.EUR, 1),
    ]);

    expect(settlement.remainingCents).toBe(0);
    expect(settlement.firstError?.code).toBe(ChannelRateErrors.RateNotFound.code);
    expect(isRegisterBlocked(settlement)).toBe(true);
  });
});
