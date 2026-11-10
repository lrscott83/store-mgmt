import { describe, it, expect } from 'vitest';
import { groupModulesByPlanDelta } from '../plan-module-groups';
import type { Plan, PlanModule } from '../../models/store';

type UniverseItem = { id: number };

function planModule(moduleId: number): PlanModule {
  return {
    moduleId,
    name: `Module ${moduleId}`,
    order: moduleId,
    priceIncluded: false,
    isActive: true,
    price: 100,
    currentPrice: 100,
    discountPrice: 0,
    percentDiscountPrice: 0,
    discountText: '',
    featureDescriptions: [],
  };
}

function plan(planType: string, order: number, moduleIds: number[]): Plan {
  return {
    id: order,
    name: planType,
    order,
    planType,
    price: moduleIds.length * 100,
    modules: moduleIds.map(planModule),
  };
}

// A module universe where the three catalog plans nest: Gratis carries 1-2,
// Pago adds 3, Superior adds 4, and module 5 belongs to no plan (VIP-only).
const items: UniverseItem[] = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];

const plans: Plan[] = [
  plan('Gratis', 0, [1, 2]),
  plan('Pago', 1, [1, 2, 3]),
  plan('Superior', 2, [1, 2, 3, 4]),
];

const expectedGroups = [
  { planType: 'Gratis', order: 0, moduleIds: [1, 2] },
  { planType: 'Pago', order: 1, moduleIds: [3] },
  { planType: 'Superior', order: 2, moduleIds: [4] },
  { planType: '', order: Number.MAX_SAFE_INTEGER, moduleIds: [5] },
];

describe('groupModulesByPlanDelta', () => {
  it('partitions the universe by the first-claiming plan and closes the catch-all', () => {
    const groups = groupModulesByPlanDelta(items, plans, (m) => m.id);

    expect(
      groups.map((g) => ({ planType: g.planType, order: g.order, moduleIds: g.moduleIds })),
    ).toEqual(expectedGroups);

    // Totality: every item lands in exactly one group.
    expect(groups.flatMap((g) => g.items).map((m) => m.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('partitions correctly when Array.prototype.at is unavailable (Chrome 89)', () => {
    const originalAt = Array.prototype.at;

    // Array.prototype.at is ES2022 (Chrome 92+). Chrome 89 does not have it,
    // so the previous `filter(...).at(-1)` threw here. Remove it at runtime to
    // simulate that browser without any build/polyfill change.
    Object.defineProperty(Array.prototype, 'at', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    try {
      const groups = groupModulesByPlanDelta(items, plans, (m) => m.id);
      expect(
        groups.map((g) => ({ planType: g.planType, order: g.order, moduleIds: g.moduleIds })),
      ).toEqual(expectedGroups);
    } finally {
      Object.defineProperty(Array.prototype, 'at', {
        value: originalAt,
        configurable: true,
        writable: true,
      });
    }
  });
});
