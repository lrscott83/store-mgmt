import { ExpenseType } from '@store-mgmt/domain';

/**
 * Taxonomía fiscal ONAT — Vector Fiscal (S7).
 *
 * Cada tipo de gasto con relevancia fiscal se mapea a su código de nomenclador y
 * a la sección/fila del DJ-08 donde se declara. Los tipos no fiscales
 * (`Salario`, `Transporte`, `Alquiler`, … `Otro`) no forman parte de la tabla.
 *
 * `codigoOnat === null` significa que el nomenclador no tiene código propio en la
 * fuente: se declara en la fila indicada junto al resto de su grupo.
 */
export type OnatDj08Seccion = 'B' | 'C' | 'F';

export interface OnatTaxonomyEntry {
  readonly tipo: ExpenseType;
  readonly codigoOnat: string | null;
  readonly seccionDj08: OnatDj08Seccion;
  readonly filaDj08: number;
  /** Si el tributo pagado resta de la base imponible del cierre anual (S8). */
  readonly deducibleDeLaBase: boolean;
  /** Si el pago es un crédito contra el impuesto anual (cuota a cuenta). */
  readonly pagoACuenta: boolean;
  readonly descripcion: string;
}

export const ONAT_TAXONOMY: Readonly<Partial<Record<ExpenseType, OnatTaxonomyEntry>>> = {
  [ExpenseType.ImpuestoVentas]: {
    tipo: ExpenseType.ImpuestoVentas,
    codigoOnat: '011402',
    seccionDj08: 'F',
    filaDj08: 37,
    deducibleDeLaBase: true,
    pagoACuenta: false,
    descripcion: 'Impuesto sobre Ventas o Servicios',
  },
  [ExpenseType.FuerzaTrabajo]: {
    tipo: ExpenseType.FuerzaTrabajo,
    codigoOnat: '061032',
    seccionDj08: 'F',
    filaDj08: 38,
    deducibleDeLaBase: true,
    pagoACuenta: false,
    descripcion: 'Impuesto por la Utilización de la Fuerza de Trabajo',
  },
  [ExpenseType.ImpuestoSellos]: {
    tipo: ExpenseType.ImpuestoSellos,
    codigoOnat: '073012',
    seccionDj08: 'F',
    filaDj08: 39,
    deducibleDeLaBase: true,
    pagoACuenta: false,
    descripcion: 'Impuesto sobre Documentos y Actos Notariales (sellos)',
  },
  [ExpenseType.Anuncios]: {
    tipo: ExpenseType.Anuncios,
    codigoOnat: '090012',
    seccionDj08: 'F',
    filaDj08: 40,
    deducibleDeLaBase: true,
    pagoACuenta: false,
    descripcion: 'Impuesto sobre Anuncios y Propaganda Comercial',
  },
  [ExpenseType.ContribucionEspecialSeguridadSocial]: {
    tipo: ExpenseType.ContribucionEspecialSeguridadSocial,
    codigoOnat: '082013',
    seccionDj08: 'F',
    filaDj08: 41,
    deducibleDeLaBase: true,
    pagoACuenta: false,
    descripcion: 'Contribución Especial a la Seguridad Social',
  },
  [ExpenseType.ContribucionSeguridadSocial]: {
    tipo: ExpenseType.ContribucionSeguridadSocial,
    codigoOnat: '081013',
    seccionDj08: 'F',
    filaDj08: 42,
    deducibleDeLaBase: true,
    pagoACuenta: false,
    descripcion: 'Contribución a la Seguridad Social',
  },
  [ExpenseType.Impuesto]: {
    tipo: ExpenseType.Impuesto,
    codigoOnat: null,
    seccionDj08: 'F',
    filaDj08: 43,
    deducibleDeLaBase: true,
    pagoACuenta: false,
    descripcion: 'Otros tributos',
  },
  [ExpenseType.CuotaMensual]: {
    tipo: ExpenseType.CuotaMensual,
    codigoOnat: '051012',
    seccionDj08: 'C',
    filaDj08: 22,
    deducibleDeLaBase: false,
    pagoACuenta: true,
    descripcion: 'Cuota mensual a cuenta del Impuesto sobre Ventas o Servicios',
  },
  [ExpenseType.ContribucionZonas]: {
    tipo: ExpenseType.ContribucionZonas,
    codigoOnat: null,
    seccionDj08: 'B',
    filaDj08: 15,
    deducibleDeLaBase: true,
    pagoACuenta: false,
    descripcion: 'Contribución Territorial para el Desarrollo Local (zonas)',
  },
  [ExpenseType.ArrendamientoEntidades]: {
    tipo: ExpenseType.ArrendamientoEntidades,
    codigoOnat: null,
    seccionDj08: 'B',
    filaDj08: 16,
    deducibleDeLaBase: true,
    pagoACuenta: false,
    descripcion: 'Arrendamiento de locales a entidades estatales',
  },
  [ExpenseType.ExoneracionReparaciones]: {
    tipo: ExpenseType.ExoneracionReparaciones,
    codigoOnat: null,
    seccionDj08: 'B',
    filaDj08: 17,
    deducibleDeLaBase: true,
    pagoACuenta: false,
    descripcion: 'Exoneración por reparaciones',
  },
};

/** Responde si un `ExpenseType` es un tributo fiscal registrable en la ONAT. */
export function isFiscalExpenseType(tipo: ExpenseType): boolean {
  return ONAT_TAXONOMY[tipo] !== undefined;
}
