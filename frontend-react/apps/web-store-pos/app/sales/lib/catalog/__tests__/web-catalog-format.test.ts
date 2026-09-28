import { describe, expect, it } from 'vitest';
import {
  DISCOUNT_PRICE_SCALE,
  MAX_CATALOG_IMAGES,
  MAX_CATALOG_IMAGE_BYTES,
  MAX_DESCRIPTION_LENGTH,
  MAX_PERCENT_SCALED,
  PERCENT_SCALE,
  computeFinalPrice,
  hasCatalogDiscount,
  toDiscountAmount,
  toPercent,
  toScaledDiscountAmount,
  toScaledPercent,
} from '../web-catalog-format';

describe('escalas del catálogo', () => {
  it('usa 2 decimales en porcentaje y en monto', () => {
    expect(PERCENT_SCALE).toBe(100);
    expect(DISCOUNT_PRICE_SCALE).toBe(100);
    expect(MAX_PERCENT_SCALED).toBe(10000);
  });

  it('convierte porcentaje escalado a decimal y de vuelta', () => {
    expect(toPercent(1250)).toBe(12.5);
    expect(toScaledPercent(12.5)).toBe(1250);
    expect(toScaledPercent(0)).toBe(0);
    expect(toScaledPercent(100)).toBe(MAX_PERCENT_SCALED);
  });

  it('redondea a 2 decimales al escalar', () => {
    expect(toScaledPercent(12.345)).toBe(1235);
    expect(toScaledPercent(0.004)).toBe(0);
  });

  it('convierte el monto rebajado escalado a decimal y de vuelta', () => {
    expect(toDiscountAmount(500)).toBe(5);
    expect(toScaledDiscountAmount(5)).toBe(500);
    expect(toScaledDiscountAmount(5.555)).toBe(556);
  });
});

describe('precio final del catálogo (D7)', () => {
  it('combina primero el porcentaje y después el monto rebajado', () => {
    // 100 - 12.5 % = 87.50; 87.50 - 5.00 = 82.50
    expect(computeFinalPrice(100, 1250, 500)).toBe(82.5);
  });

  it('sin descuentos deja el precio intacto', () => {
    expect(computeFinalPrice(100, 0, 0)).toBe(100);
  });

  it('100 % de descuento deja el precio en 0', () => {
    expect(computeFinalPrice(100, MAX_PERCENT_SCALED, 0)).toBe(0);
  });

  it('nunca baja de 0 aunque el monto rebajado supere el precio', () => {
    expect(computeFinalPrice(3, 0, 500)).toBe(0);
    expect(computeFinalPrice(10, 5000, 1000)).toBe(0);
  });

  it('solo el monto rebajado se resta al precio', () => {
    expect(computeFinalPrice(50, 0, 1250)).toBe(37.5);
  });
});

describe('helpers de presentación', () => {
  it('detecta si hay algún descuento', () => {
    expect(hasCatalogDiscount(0, 0)).toBe(false);
    expect(hasCatalogDiscount(1, 0)).toBe(true);
    expect(hasCatalogDiscount(0, 1)).toBe(true);
  });

  it('los límites del catálogo son los del backend (D10)', () => {
    expect(MAX_CATALOG_IMAGES).toBe(6);
    expect(MAX_CATALOG_IMAGE_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_DESCRIPTION_LENGTH).toBe(4000);
  });
});
