import { ExpenseType } from '@store-mgmt/domain';

/**
 * Catálogo único de etiquetas de tipo de gasto.
 *
 * El mapa enum → id de `react-intl` estaba copiado literalmente en cuatro
 * componentes (historial de gastos, formulario, cuadre del día y cuadre por
 * fechas), así que añadir un nomenclador fiscal obligaba a tocar cuatro
 * archivos y un id olvidado fallaba en silencio. Aquí vive una sola vez, con el
 * `Record<ExpenseType, string>` completo: el compilador exige una entrada por
 * cada valor del enum.
 */
export const EXPENSE_TYPE_LABEL_KEYS: Record<ExpenseType, string> = {
  [ExpenseType.Salario]: 'EXPENSES.TYPE.SALARIO',
  [ExpenseType.Transporte]: 'EXPENSES.TYPE.TRANSPORTE',
  [ExpenseType.Alquiler]: 'EXPENSES.TYPE.ALQUILER',
  [ExpenseType.Corriente]: 'EXPENSES.TYPE.CORRIENTE',
  [ExpenseType.Agua]: 'EXPENSES.TYPE.AGUA',
  [ExpenseType.Comida]: 'EXPENSES.TYPE.COMIDA',
  [ExpenseType.Operaciones]: 'EXPENSES.TYPE.OPERACIONES',
  [ExpenseType.Viaje]: 'EXPENSES.TYPE.VIAJE',
  [ExpenseType.Divisa]: 'EXPENSES.TYPE.DIVISA',
  [ExpenseType.Impuesto]: 'EXPENSES.TYPE.IMPUESTO',
  [ExpenseType.Otro]: 'EXPENSES.TYPE.OTRO',
  [ExpenseType.ImpuestoVentas]: 'EXPENSES.TYPE.IMPUESTO_VENTAS',
  [ExpenseType.FuerzaTrabajo]: 'EXPENSES.TYPE.FUERZA_TRABAJO',
  [ExpenseType.ImpuestoSellos]: 'EXPENSES.TYPE.IMPUESTO_SELLOS',
  [ExpenseType.Anuncios]: 'EXPENSES.TYPE.ANUNCIOS',
  [ExpenseType.ContribucionEspecialSeguridadSocial]:
    'EXPENSES.TYPE.CONTRIBUCION_ESPECIAL_SEGURIDAD_SOCIAL',
  [ExpenseType.ContribucionSeguridadSocial]: 'EXPENSES.TYPE.CONTRIBUCION_SEGURIDAD_SOCIAL',
  [ExpenseType.CuotaMensual]: 'EXPENSES.TYPE.CUOTA_MENSUAL',
  [ExpenseType.ContribucionZonas]: 'EXPENSES.TYPE.CONTRIBUCION_ZONAS',
  [ExpenseType.ArrendamientoEntidades]: 'EXPENSES.TYPE.ARRENDAMIENTO_ENTIDADES',
  [ExpenseType.ExoneracionReparaciones]: 'EXPENSES.TYPE.EXONERACION_REPARACIONES',
};

/**
 * Orden visible del selector: primero los tipos previos a la ONAT (valores
 * 1-10 y `Otro = 100`) tal como estaban, y después los nomencladores fiscales
 * en el orden de la taxonomía ONAT. No se deriva de `Object.keys` del mapa
 * porque los valores numéricos del enum no reproducen este orden.
 *
 * Es un `Record<ExpenseType, number>` y no un arreglo: el compilador exige una
 * posición para cada valor del enum, así que un nomenclador nuevo no puede
 * desaparecer del selector en silencio.
 */
const EXPENSE_TYPE_ORDER: Record<ExpenseType, number> = {
  [ExpenseType.Salario]: 0,
  [ExpenseType.Transporte]: 1,
  [ExpenseType.Alquiler]: 2,
  [ExpenseType.Corriente]: 3,
  [ExpenseType.Agua]: 4,
  [ExpenseType.Comida]: 5,
  [ExpenseType.Operaciones]: 6,
  [ExpenseType.Viaje]: 7,
  [ExpenseType.Divisa]: 8,
  [ExpenseType.Impuesto]: 9,
  [ExpenseType.ImpuestoVentas]: 10,
  [ExpenseType.FuerzaTrabajo]: 11,
  [ExpenseType.ImpuestoSellos]: 12,
  [ExpenseType.Anuncios]: 13,
  [ExpenseType.ContribucionEspecialSeguridadSocial]: 14,
  [ExpenseType.ContribucionSeguridadSocial]: 15,
  [ExpenseType.CuotaMensual]: 16,
  [ExpenseType.ContribucionZonas]: 17,
  [ExpenseType.ArrendamientoEntidades]: 18,
  [ExpenseType.ExoneracionReparaciones]: 19,
  [ExpenseType.Otro]: 20,
};

/** Opción del selector de tipo: el valor del enum y su id de mensaje. */
export interface ExpenseTypeOption {
  readonly value: ExpenseType;
  readonly labelKey: string;
}

/**
 * Opciones del selector en su orden visible, derivadas del mapa: la etiqueta de
 * cada opción sale de `EXPENSE_TYPE_LABEL_KEYS`, nunca de otra copia.
 */
export const EXPENSE_TYPE_OPTIONS: readonly ExpenseTypeOption[] = Object.keys(
  EXPENSE_TYPE_LABEL_KEYS,
)
  .map((key) => Number(key) as ExpenseType)
  .sort((left, right) => EXPENSE_TYPE_ORDER[left] - EXPENSE_TYPE_ORDER[right])
  .map((value) => ({ value, labelKey: EXPENSE_TYPE_LABEL_KEYS[value] }));
