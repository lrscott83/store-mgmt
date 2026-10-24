import { describe, expect, it } from 'vitest';
import { parseCommissionValue } from '../commission-value';

describe('parseCommissionValue — el valor de comisión que escribe el Owner', () => {
  it('rechaza vacío y solo-espacios (no los convierte en 0)', () => {
    expect(parseCommissionValue('')).toBeNull();
    expect(parseCommissionValue('   ')).toBeNull();
  });

  it('acepta enteros y decimales con coma o punto', () => {
    expect(parseCommissionValue('10')).toBe(10);
    expect(parseCommissionValue('10,5')).toBe(10.5);
    expect(parseCommissionValue('0.25')).toBe(0.25);
  });

  it('acepta el borde 0 (comisión sin monto) y 100 (porcentaje máximo)', () => {
    expect(parseCommissionValue('0')).toBe(0);
    expect(parseCommissionValue('100')).toBe(100);
  });

  it('rechaza negativos y texto no numérico', () => {
    expect(parseCommissionValue('-1')).toBeNull();
    expect(parseCommissionValue('abc')).toBeNull();
    expect(parseCommissionValue('Infinity')).toBeNull();
  });
});
