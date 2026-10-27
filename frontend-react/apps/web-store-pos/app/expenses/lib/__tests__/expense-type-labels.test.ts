import { describe, expect, it } from 'vitest';
import { ExpenseType } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { EXPENSE_TYPE_LABEL_KEYS, EXPENSE_TYPE_OPTIONS } from '../expense-type-labels';

/**
 * Orden visible esperado del selector: primero los tipos previos a la ONAT en su
 * orden de siempre, después los nomencladores fiscales en el orden de la
 * taxonomía ONAT y `Otro` al final, como en el selector heredado.
 */
const EXPECTED_ORDER: readonly ExpenseType[] = [
  ExpenseType.Salario,
  ExpenseType.Transporte,
  ExpenseType.Alquiler,
  ExpenseType.Corriente,
  ExpenseType.Agua,
  ExpenseType.Comida,
  ExpenseType.Operaciones,
  ExpenseType.Viaje,
  ExpenseType.Divisa,
  ExpenseType.Impuesto,
  ExpenseType.ImpuestoVentas,
  ExpenseType.FuerzaTrabajo,
  ExpenseType.ImpuestoSellos,
  ExpenseType.Anuncios,
  ExpenseType.ContribucionEspecialSeguridadSocial,
  ExpenseType.ContribucionSeguridadSocial,
  ExpenseType.CuotaMensual,
  ExpenseType.ContribucionZonas,
  ExpenseType.ArrendamientoEntidades,
  ExpenseType.ExoneracionReparaciones,
  ExpenseType.Otro,
];

/** Valores numéricos del enum vivo (`Object.values` también devuelve los nombres). */
function valoresDelEnum(): ExpenseType[] {
  return Object.values(ExpenseType).filter(
    (valor): valor is ExpenseType => typeof valor === 'number',
  );
}

describe('etiquetas del tipo de gasto', () => {
  it('cubre cada valor del enum ExpenseType exactamente una vez', () => {
    const valores = valoresDelEnum();

    // Si el enum gana un valor que no está en la tabla, esta prueba lo delata:
    // ese era el modo de fallo silencioso del mapa duplicado en cuatro componentes.
    expect(new Set(valores).size).toBe(valores.length);

    const opciones = EXPENSE_TYPE_OPTIONS.map((option) => option.value);

    expect(new Set(opciones).size).toBe(opciones.length);
    expect([...opciones].sort((left, right) => left - right)).toEqual(
      [...valores].sort((left, right) => left - right),
    );
    expect(Object.keys(EXPENSE_TYPE_LABEL_KEYS)).toHaveLength(valores.length);
  });

  it('mantiene el orden visible heredado con los nomencladores fiscales y Otro al final', () => {
    expect(EXPENSE_TYPE_OPTIONS.map((option) => option.value)).toEqual([...EXPECTED_ORDER]);
  });

  it('usa ids de mensaje que existen en el catálogo español', () => {
    for (const option of EXPENSE_TYPE_OPTIONS) {
      expect(esMessages[option.labelKey], `falta ${option.labelKey} en es.ts`).toBeTruthy();
    }
  });
});
