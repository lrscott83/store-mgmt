import { describe, expect, it } from 'vitest';
import {
  currentModulePrice,
  isBillableModule,
  totalModulePricing,
  type ModulePricingRow,
} from '../module-pricing';

/**
 * The client mirror of the backend's `ModulePriceCalculator`
 * (backend/src/Domain/Common/Utils/ModulePriceCalculator.cs). Every case here has a
 * counterpart in `ModulePriceCalculatorTests`: an inactive module and a price-included
 * module contribute nothing, everything else contributes its effective price, and the base
 * column counts exactly the rows the effective column does.
 */

function row(overrides: Partial<ModulePricingRow> = {}): ModulePricingRow {
  return {
    moduleId: 1,
    isActive: true,
    priceIncluded: false,
    price: 100,
    discountPrice: 0,
    percentDiscountPrice: 0,
    ...overrides,
  };
}

describe('currentModulePrice', () => {
  it('returns the base price when there is no discount', () => {
    expect(currentModulePrice(100, 0, 0)).toBe(100);
  });

  it('takes the percent off first, then the flat discount', () => {
    expect(currentModulePrice(100, 20, 10)).toBe(70);
  });

  it('clamps at zero when the discounts exceed the base price', () => {
    expect(currentModulePrice(50, 100, 25)).toBe(0);
    expect(currentModulePrice(10, 0, 999)).toBe(0);
  });

  it('keeps fractional precision (no rounding anywhere)', () => {
    expect(currentModulePrice(10.1, 33.333, 0)).toBeCloseTo(6.733367, 5);
  });
});

describe('isBillableModule', () => {
  it('is true only when the module is active AND not price-included', () => {
    expect(isBillableModule({ isActive: true, priceIncluded: false })).toBe(true);
    expect(isBillableModule({ isActive: false, priceIncluded: false })).toBe(false);
    expect(isBillableModule({ isActive: true, priceIncluded: true })).toBe(false);
    // Both flags failing still reads false, never a truthy accident.
    expect(isBillableModule({ isActive: false, priceIncluded: true })).toBe(false);
  });
});

describe('totalModulePricing — the billable rule', () => {
  it('returns 0/0 for an empty collection', () => {
    expect(totalModulePricing([])).toEqual({ price: 0, currentPrice: 0 });
  });

  it('counts an active, not-included module', () => {
    expect(totalModulePricing([row({ price: 100 })])).toEqual({
      price: 100,
      currentPrice: 100,
    });
  });

  it('contributes 0 for an INACTIVE module, whatever its price', () => {
    expect(totalModulePricing([row({ isActive: false, price: 500 })])).toEqual({
      price: 0,
      currentPrice: 0,
    });
  });

  it('contributes 0 for a PRICE-INCLUDED module, whatever its price', () => {
    expect(totalModulePricing([row({ priceIncluded: true, price: 500 })])).toEqual({
      price: 0,
      currentPrice: 0,
    });
  });

  it('applies the percent discount on a billable module', () => {
    expect(totalModulePricing([row({ price: 200, percentDiscountPrice: 25 })])).toEqual({
      price: 200,
      currentPrice: 150,
    });
  });

  it('applies the flat discount on a billable module', () => {
    expect(totalModulePricing([row({ price: 40, discountPrice: 5 })])).toEqual({
      price: 40,
      currentPrice: 35,
    });
  });

  it('applies the percent before the flat discount', () => {
    // 100 - 20% = 80, then -10 → 70. The reverse order would give 100 - 10 = 90 - 20% = 72.
    expect(totalModulePricing([row({ price: 100, percentDiscountPrice: 20, discountPrice: 10 })])).toEqual(
      { price: 100, currentPrice: 70 },
    );
  });

  it('clamps at zero when the discounts exceed the base price', () => {
    expect(
      totalModulePricing([row({ price: 50, percentDiscountPrice: 100, discountPrice: 25 })]),
    ).toEqual({ price: 50, currentPrice: 0 });
  });
});

describe('totalModulePricing — mixed collections', () => {
  it('adds the billable rows and skips the excluded ones', () => {
    const totals = totalModulePricing([
      row({ moduleId: 1, price: 10 }),
      row({ moduleId: 2, price: 20 }),
      row({ moduleId: 3, price: 30, percentDiscountPrice: 10 }),
      row({ moduleId: 4, price: 40, discountPrice: 5 }),
      row({ moduleId: 5, price: 999, isActive: false }),
      row({ moduleId: 6, price: 777, priceIncluded: true }),
    ]);
    // 10 + 20 + 27 (30 -10%) + 35 (40 -5) = 92 of a 100 base.
    expect(totals).toEqual({ price: 100, currentPrice: 92 });
  });

  it('is 0/0 when every row is excluded by one flag or the other', () => {
    expect(
      totalModulePricing([
        row({ isActive: false, price: 50 }),
        row({ priceIncluded: true, price: 60 }),
      ]),
    ).toEqual({ price: 0, currentPrice: 0 });
  });

  it('both columns count EXACTLY the same rows — the billable ones', () => {
    const rows = [
      row({ moduleId: 1, price: 10, percentDiscountPrice: 50 }),
      row({ moduleId: 2, price: 20, isActive: false }),
      row({ moduleId: 3, price: 30, priceIncluded: true }),
      row({ moduleId: 4, price: 40 }),
    ];
    const totals = totalModulePricing(rows);
    const billable = rows.filter(isBillableModule);

    // The base column is Σ price over the billable rows, NOT over every row: dropping a
    // non-billable row must drop it from BOTH columns or the strike-through lies.
    expect(totals.price).toBe(billable.reduce((sum, m) => sum + m.price, 0));
    expect(totals.price).toBe(50); // 10 + 40; the 20 and the 30 are excluded
    expect(totals.currentPrice).toBe(45); // 5 + 40
    expect(totals.currentPrice).toBeLessThanOrEqual(totals.price);
  });

  it('does not round the accumulated total', () => {
    const totals = totalModulePricing([
      row({ price: 10.1, percentDiscountPrice: 33.333 }),
      row({ moduleId: 2, price: 20.2, percentDiscountPrice: 33.333 }),
    ]);
    // 6.733367 + 13.466734 = 20.200101 — a rounded accumulator would give 20.2 and hide this.
    expect(totals.currentPrice).toBeCloseTo(20.200101, 5);
  });

  it('accumulates in collection order and is order-insensitive up to float addition', () => {
    const a = row({ moduleId: 1, price: 10.1, percentDiscountPrice: 33.333 });
    const b = row({ moduleId: 2, price: 20.2, percentDiscountPrice: 33.333 });
    expect(totalModulePricing([a, b]).currentPrice).toBe(
      totalModulePricing([b, a]).currentPrice,
    );
  });

  it('does not mutate the input collection', () => {
    const rows = [row({ isActive: false }), row()];
    const snapshot = structuredClone(rows);
    totalModulePricing(rows);
    expect(rows).toEqual(snapshot);
  });
});