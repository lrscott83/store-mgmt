import { describe, expect, it } from 'vitest';
import type { Recipe, WarehouseStockLevel } from '@store-mgmt/domain';
import { planElaboration } from '../elaboration-math';

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'recipe-1',
    productId: 'pan',
    outputQty: 20,
    components: [],
    laborCost: 0,
    overheadPct: 0,
    isActive: true,
    createdDate: new Date('2026-09-01T00:00:00.000Z'),
    createdByName: 'test',
    ...overrides,
  };
}

function level(
  productId: string,
  onHand: number,
  costPrice: number,
): WarehouseStockLevel {
  return {
    id: `level-${productId}`,
    warehouseId: 'wh-1',
    productId,
    onHand,
    costPrice,
    createdDate: new Date('2026-09-01T00:00:00.000Z'),
  };
}

describe('planElaboration', () => {
  // ─── pinned acceptance math (plan 2026-09-04-elaboration-module.md) ───
  describe('pinned acceptance math ("Pan de 500g")', () => {
    const panRecipe = recipe({
      outputQty: 20,
      components: [
        { productId: 'harina', qty: 3, scrapPct: 2 },
        { productId: 'levadura', qty: 0.05, scrapPct: 0 },
        { productId: 'sal', qty: 0.04, scrapPct: 0 },
        { productId: 'agua', qty: 2, scrapPct: 5 },
      ],
      laborCost: 50,
      overheadPct: 10,
    });
    const levels = [
      level('harina', 100, 20),
      level('levadura', 100, 80),
      level('sal', 100, 15),
      level('agua', 100, 0.5),
    ];

    it('computes the pinned totals (total 123.535, unit 6.18)', () => {
      const plan = planElaboration(panRecipe, 1, levels);

      expect(plan.ingredientsCost).toBe(66.85);
      expect(plan.overheadCost).toBe(6.685);
      expect(plan.laborCostTotal).toBe(50);
      expect(plan.estimatedTotal).toBe(123.535);
      expect(plan.producedQty).toBe(20);
      expect(plan.estimatedUnit).toBe(6.18);
      expect(plan.sufficient).toBe(true);
    });

    it('computes the pinned scrap-inflated theoretical quantities', () => {
      const plan = planElaboration(panRecipe, 1, levels);
      expect(plan.components).toEqual([
        { productId: 'harina', theoreticalQty: 3.06, costPrice: 20, available: 100, sufficient: true },
        { productId: 'levadura', theoreticalQty: 0.05, costPrice: 80, available: 100, sufficient: true },
        { productId: 'sal', theoreticalQty: 0.04, costPrice: 15, available: 100, sufficient: true },
        { productId: 'agua', theoreticalQty: 2.1, costPrice: 0.5, available: 100, sufficient: true },
      ]);
    });

    it('scales theoretical quantities, labor and output with the batch count', () => {
      const plan = planElaboration(panRecipe, 2, levels);
      expect(plan.components.map((c) => c.theoreticalQty)).toEqual([6.12, 0.1, 0.08, 4.2]);
      expect(plan.laborCostTotal).toBe(100);
      expect(plan.producedQty).toBe(40);
      // ingredients: 6.12×20 + 0.1×80 + 0.08×15 + 4.2×0.5 = 122.4+8+1.2+2.1 = 133.7
      expect(plan.ingredientsCost).toBe(133.7);
      expect(plan.overheadCost).toBeCloseTo(13.37, 10);
      expect(plan.estimatedTotal).toBeCloseTo(133.7 + 13.37 + 100, 10);
      // 247.07 / 40 = 6.17675 -> 6.18
      expect(plan.estimatedUnit).toBe(6.18);
    });
  });

  // ─── scrap inflation ───
  describe('scrap inflation', () => {
    it('rounds the theoretical quantity to 2 decimals', () => {
      const plan = planElaboration(
        recipe({ components: [{ productId: 'p', qty: 0.333, scrapPct: 1 }] }),
        1,
        [level('p', 100, 1)],
      );
      // 0.333 × 1.01 = 0.33633 -> 0.34
      expect(plan.components[0].theoreticalQty).toBe(0.34);
    });

    it('a 0% scrap keeps the raw qty × batches', () => {
      const plan = planElaboration(
        recipe({ components: [{ productId: 'p', qty: 2.5, scrapPct: 0 }] }),
        3,
        [level('p', 100, 1)],
      );
      expect(plan.components[0].theoreticalQty).toBe(7.5);
    });

    it('inflates the ingredient cost by the scrap percentage', () => {
      const withScrap = planElaboration(
        recipe({ components: [{ productId: 'p', qty: 1, scrapPct: 50 }] }),
        1,
        [level('p', 100, 10)],
      );
      expect(withScrap.components[0].theoreticalQty).toBe(1.5);
      expect(withScrap.ingredientsCost).toBe(15);
    });
  });

  // ─── stock matching ───
  describe('stock level matching and sufficiency', () => {
    it('a component with no matching stock level is never sufficient and costs 0', () => {
      const plan = planElaboration(
        recipe({ components: [{ productId: 'missing', qty: 2, scrapPct: 0 }] }),
        1,
        [],
      );
      expect(plan.components[0]).toEqual({
        productId: 'missing',
        theoreticalQty: 2,
        costPrice: 0,
        available: 0,
        sufficient: false,
      });
      expect(plan.ingredientsCost).toBe(0);
      expect(plan.sufficient).toBe(false);
    });

    it('marks a component sufficient only when available >= theoretical', () => {
      const exact = planElaboration(
        recipe({ components: [{ productId: 'p', qty: 5, scrapPct: 0 }] }),
        1,
        [level('p', 5, 10)],
      );
      expect(exact.components[0].sufficient).toBe(true);

      const short = planElaboration(
        recipe({ components: [{ productId: 'p', qty: 5, scrapPct: 0 }] }),
        1,
        [level('p', 4.99, 10)],
      );
      expect(short.components[0].sufficient).toBe(false);
    });

    it('the plan is sufficient only when EVERY component is sufficient', () => {
      const plan = planElaboration(
        recipe({
          components: [
            { productId: 'p1', qty: 1, scrapPct: 0 },
            { productId: 'p2', qty: 1, scrapPct: 0 },
          ],
        }),
        1,
        [level('p1', 10, 5), level('p2', 0, 5)],
      );
      expect(plan.sufficient).toBe(false);
      expect(plan.components[0].sufficient).toBe(true);
      expect(plan.components[1].sufficient).toBe(false);
    });

    it('reads costPrice and available straight from the matching level', () => {
      const plan = planElaboration(
        recipe({ components: [{ productId: 'p', qty: 1, scrapPct: 0 }] }),
        1,
        [level('other', 999, 999), level('p', 12.345, 7.891)],
      );
      expect(plan.components[0].costPrice).toBe(7.89);
      expect(plan.components[0].available).toBe(12.35);
    });
  });

  // ─── totals / rounding edges ───
  describe('totals and rounding edges', () => {
    it('zero overhead and zero labor produce an ingredients-only estimate', () => {
      const plan = planElaboration(
        recipe({
          outputQty: 4,
          components: [{ productId: 'p', qty: 1, scrapPct: 0 }],
          laborCost: 0,
          overheadPct: 0,
        }),
        1,
        [level('p', 10, 3)],
      );
      expect(plan.ingredientsCost).toBe(3);
      expect(plan.overheadCost).toBe(0);
      expect(plan.laborCostTotal).toBe(0);
      expect(plan.estimatedTotal).toBe(3);
      expect(plan.estimatedUnit).toBe(0.75);
    });

    it('rounds the ingredients cost to 2 decimals', () => {
      const plan = planElaboration(
        recipe({ components: [{ productId: 'p', qty: 1.11, scrapPct: 0 }] }),
        1,
        [level('p', 100, 0.11)],
      );
      // 1.11 × 0.11 = 0.1221 -> 0.12
      expect(plan.ingredientsCost).toBe(0.12);
    });

    it('an empty component list yields a sufficient zero estimate', () => {
      const plan = planElaboration(recipe({ outputQty: 10 }), 2, []);
      expect(plan.components).toEqual([]);
      expect(plan.ingredientsCost).toBe(0);
      expect(plan.estimatedTotal).toBe(0);
      expect(plan.producedQty).toBe(20);
      expect(plan.estimatedUnit).toBe(0);
      expect(plan.sufficient).toBe(true);
    });

    it('guards estimatedUnit when producedQty is 0', () => {
      const plan = planElaboration(recipe({ outputQty: 0 }), 1, []);
      expect(plan.producedQty).toBe(0);
      expect(plan.estimatedUnit).toBe(0);
    });
  });
});
