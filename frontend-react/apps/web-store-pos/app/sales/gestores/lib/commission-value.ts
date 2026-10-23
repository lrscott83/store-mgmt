/**
 * Convierte el valor escrito por el Owner en el número que viaja al backend.
 *
 * Devuelve `null` para vacío, no numérico o negativo. Un campo vacío NO es 0: el Owner tiene que
 * escribir explícitamente un monto (R3-OWNER-SCREEN-FAILURE-PATH).
 */
export function parseCommissionValue(raw: string): number | null {
  if (raw.trim() === '') return null;

  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : null;
}
