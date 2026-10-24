import { ExpenseFundSource } from '@store-mgmt/domain';

/**
 * Catálogo único del ORIGEN del gasto para las dos superficies que lo muestran
 * (formulario de gasto e historial). Antes cada componente tenía su propio mapa
 * enum → id de mensaje, así que añadir o renombrar un origen obligaba a tocar
 * dos archivos sin relación y un id mal escrito fallaba en silencio.
 *
 * `messageId` es un id de `react-intl`; el tipo lo ata al enum, no a un string
 * suelto.
 */
export interface FundSourceOption {
  readonly value: ExpenseFundSource;
  readonly messageId: string;
}

/** Orden de presentación: `Externo` primero (es el default). */
export const FUND_SOURCE_OPTIONS: readonly FundSourceOption[] = [
  { value: ExpenseFundSource.Externo, messageId: 'EXPENSES.FUND_SOURCE.EXTERNO' },
  { value: ExpenseFundSource.Caja, messageId: 'EXPENSES.FUND_SOURCE.CAJA' },
];

/** Id de mensaje de un origen concreto. */
export function fundSourceMessageId(source: ExpenseFundSource): string {
  const option = FUND_SOURCE_OPTIONS.find((entry) => entry.value === source);
  // El enum tiene dos miembros y el catálogo los cubre ambos; el fallback existe
  // solo para que el tipo sea total si el día de mañana se añade un valor.
  return option ? option.messageId : 'EXPENSES.FUND_SOURCE.EXTERNO';
}
