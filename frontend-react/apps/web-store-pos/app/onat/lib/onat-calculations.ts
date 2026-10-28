/**
 * Cálculos fiscales puros del Vector Fiscal ONAT (S6, S8).
 *
 * Sin I/O ni React: todo entra y sale por parámetros. Los importes están en CUP y
 * se redondean a 2 decimales. La escala progresiva corresponde al artículo 49.1 de
 * la Ley 181/2025.
 */

import { round2 } from '~/shared/lib/money';

export const MINIMO_EXENTO_ANUAL = 39120;
export const UMBRAL_CUOTA_MENSUAL = 3260;
export const TASA_VENTAS = 0.1;
export const TASA_CUOTA = 0.05;
export const TASA_FUERZA_TRABAJO = 0.05;
export const BONIFICACION_PRONTO_PAGO = 0.05;

/** Centavos que tiene un peso: la unidad en la que convierte el dominio. */
export const CENTAVOS_POR_PESO = 100;

interface TramoEscala {
  readonly hasta: number;
  readonly tasa: number;
}

/**
 * Escala del Impuesto sobre los Ingresos Personales, por año de ingresos.
 *
 * En 2025 rige la de 10 tramos de la Ley 181/2025, art. 49.1. Un año sin escala
 * propia usa la última publicada: si no hay ley nueva, la vigente sigue siendo esa.
 * Aquí se añade la escala el día que se publique la del ejercicio siguiente.
 */
export const ESCALAS_ISR: Readonly<Record<number, readonly TramoEscala[]>> = {
  2025: [
    { hasta: 25_000, tasa: 0.05 },
    { hasta: 50_000, tasa: 0.1 },
    { hasta: 100_000, tasa: 0.15 },
    { hasta: 200_000, tasa: 0.2 },
    { hasta: 350_000, tasa: 0.25 },
    { hasta: 500_000, tasa: 0.3 },
    { hasta: 650_000, tasa: 0.35 },
    { hasta: 800_000, tasa: 0.4 },
    { hasta: 1_000_000, tasa: 0.45 },
    { hasta: Number.POSITIVE_INFINITY, tasa: 0.5 },
  ],
};

const ANIOS_CON_ESCALA = Object.keys(ESCALAS_ISR)
  .map(Number)
  .sort((a, b) => a - b);

/** Último ejercicio con escala publicada. */
export const ULTIMO_ANIO_ESCALA = ANIOS_CON_ESCALA[ANIOS_CON_ESCALA.length - 1];

/** Escala aplicable a un ejercicio: la suya o, si no hay, la última publicada. */
export function escalaDelAnio(year: number): readonly TramoEscala[] {
  const aplicable =
    [...ANIOS_CON_ESCALA].reverse().find((anio) => anio <= year) ?? ULTIMO_ANIO_ESCALA;
  return ESCALAS_ISR[aplicable];
}

/** Impuesto sobre Ventas o Servicios: 10 % del ingreso del mes, nunca negativo. */
export function impuestoVentas(ingresoMes: number): number {
  return round2(Math.max(0, ingresoMes) * TASA_VENTAS);
}

/** Cuota mensual a cuenta: 5 % del ingreso que exceda 3.260 CUP. */
export function cuotaMensual(ingresoMes: number): number {
  return round2(Math.max(0, ingresoMes - UMBRAL_CUOTA_MENSUAL) * TASA_CUOTA);
}

/** Impuesto por la Utilización de la Fuerza de Trabajo: 5 % de los salarios del mes. */
export function fuerzaTrabajo(salariosMes: number): number {
  return round2(Math.max(0, salariosMes) * TASA_FUERZA_TRABAJO);
}

/**
 * Escala progresiva por tramos. Cada tramo grava solo el exceso sobre el límite
 * anterior. Sin año explícito usa la última escala publicada.
 */
export function impuestoEscala(baseImponible: number, year: number = ULTIMO_ANIO_ESCALA): number {
  if (!(baseImponible > 0)) {
    return 0;
  }

  let impuesto = 0;
  let limiteInferior = 0;

  for (const tramo of escalaDelAnio(year)) {
    const baseDelTramo = Math.min(baseImponible, tramo.hasta) - limiteInferior;
    if (baseDelTramo > 0) {
      impuesto += baseDelTramo * tramo.tasa;
    }
    if (baseImponible <= tramo.hasta) {
      break;
    }
    limiteInferior = tramo.hasta;
  }

  return round2(impuesto);
}

export interface CierreAnualInput {
  /** Ejercicio de los ingresos; decide qué escala se aplica. */
  readonly year?: number;
  readonly ingresos: number;
  readonly gastos: number;
  readonly tributosDeducibles: number;
  readonly contribucionZonas: number;
  readonly arrendamientos: number;
  readonly exoneraciones: number;
  /** Opcional: 0 cuando no se informa. */
  readonly otrasBonificaciones?: number;
  readonly cuotasPagadas: number;
  /** Opcional: 0 cuando no se informa. */
  readonly retenciones?: number;
  /** Opcional: 0 cuando no se informa. */
  readonly bonificaciones?: number;
  readonly pagaAntesDel28Febrero: boolean;
}

export interface CierreAnualResultado {
  readonly baseImponible: number;
  readonly impuesto: number;
  readonly impuestoAPagar: number;
  readonly bonificacionProntoPago: number;
  readonly totalAPagar: number;
}

/**
 * Cierre anual (S8): base imponible, escala progresiva, créditos y bonificación
 * por pronto pago. Ningún importe resultante puede quedar negativo.
 */
export function cierreAnual(input: CierreAnualInput): CierreAnualResultado {
  // S8: bonificaciones y retenciones forman parte del modelo aunque hoy la
  // pantalla no tenga una fuente para ellas; omitirlas equivale a cero.
  const otrasBonificaciones = input.otrasBonificaciones ?? 0;
  const retenciones = input.retenciones ?? 0;
  const bonificaciones = input.bonificaciones ?? 0;

  const baseImponible = round2(
    Math.max(
      0,
      input.ingresos -
        MINIMO_EXENTO_ANUAL -
        input.gastos -
        input.tributosDeducibles -
        input.contribucionZonas -
        input.arrendamientos -
        input.exoneraciones -
        otrasBonificaciones,
    ),
  );

  const impuesto = impuestoEscala(baseImponible, input.year);

  const impuestoAPagar = round2(
    Math.max(0, impuesto - input.cuotasPagadas - retenciones - bonificaciones),
  );

  const bonificacionProntoPago = input.pagaAntesDel28Febrero
    ? round2(impuestoAPagar * BONIFICACION_PRONTO_PAGO)
    : 0;

  const totalAPagar = round2(Math.max(0, impuestoAPagar - bonificacionProntoPago));

  return {
    baseImponible,
    impuesto,
    impuestoAPagar,
    bonificacionProntoPago,
    totalAPagar,
  };
}
