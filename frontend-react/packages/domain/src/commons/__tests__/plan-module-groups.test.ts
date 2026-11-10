import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { groupModulesByPlanDelta, NO_PLAN_GROUP } from '../plan-module-groups';
import type { Plan, PlanModule } from '../../models/store';

type UniverseItem = { id: number };

type GroupShape = { planType: string; order: number; moduleIds: number[] };

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

// A nested three-plan chain plus one module no plan carries (VIP-only). Every
// fixture is a factory so each test owns independent arrays.
function nestedUniverse(): UniverseItem[] {
  return [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
}

function nestedPlans(): Plan[] {
  return [plan('Gratis', 0, [1, 2]), plan('Pago', 1, [1, 2, 3]), plan('Superior', 2, [1, 2, 3, 4])];
}

function nestedExpected(): GroupShape[] {
  return [
    { planType: 'Gratis', order: 0, moduleIds: [1, 2] },
    { planType: 'Pago', order: 1, moduleIds: [3] },
    { planType: 'Superior', order: 2, moduleIds: [4] },
    { planType: NO_PLAN_GROUP, order: Number.MAX_SAFE_INTEGER, moduleIds: [5] },
  ];
}

function toShape(items: UniverseItem[], plans: Plan[]): GroupShape[] {
  return groupModulesByPlanDelta(items, plans, (m) => m.id).map((g) => ({
    planType: g.planType,
    order: g.order,
    moduleIds: [...g.moduleIds],
  }));
}

describe('groupModulesByPlanDelta', () => {
  it('partitions the universe by the first-claiming plan and closes the catch-all', () => {
    const items = nestedUniverse();
    const plans = nestedPlans();
    const groups = groupModulesByPlanDelta(items, plans, (m) => m.id);

    expect(toShape(items, plans)).toEqual(nestedExpected());

    // Totality: every item lands in exactly one group.
    expect(groups.flatMap((g) => g.items).map((m) => m.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns no groups for an empty universe', () => {
    expect(groupModulesByPlanDelta<UniverseItem>([], nestedPlans(), (m) => m.id)).toEqual([]);
  });

  it('returns only the catch-all when there are no plans', () => {
    const items = [{ id: 1 }, { id: 2 }];
    expect(toShape(items, [])).toEqual([
      { planType: NO_PLAN_GROUP, order: Number.MAX_SAFE_INTEGER, moduleIds: [1, 2] },
    ]);
  });

  it('a single plan owns every module it lists, with no catch-all', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const plans = [plan('Pago', 0, [1, 2, 3])];
    expect(toShape(items, plans)).toEqual([{ planType: 'Pago', order: 0, moduleIds: [1, 2, 3] }]);
  });

  it('ignores plan modules whose ids are absent from the universe', () => {
    const items = [{ id: 1 }, { id: 2 }];
    const plans = [plan('Gratis', 0, [1, 2, 99])];
    expect(toShape(items, plans)).toEqual([{ planType: 'Gratis', order: 0, moduleIds: [1, 2] }]);
  });

  it('sorts plans by order regardless of the order they were supplied', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const plans = [
      plan('Superior', 2, [1, 2, 3, 4]),
      plan('Gratis', 0, [1, 2]),
      plan('Pago', 1, [1, 2, 3]),
    ];
    expect(toShape(items, plans)).toEqual([
      { planType: 'Gratis', order: 0, moduleIds: [1, 2] },
      { planType: 'Pago', order: 1, moduleIds: [3] },
      { planType: 'Superior', order: 2, moduleIds: [4] },
    ]);
  });
});

describe('groupModulesByPlanDelta without Array.prototype.at', () => {
  let originalAt: typeof Array.prototype.at;

  beforeEach(() => {
    originalAt = Array.prototype.at;
    // Faithful Chrome 89 simulation: the property does not EXIST there (it is not
    // merely undefined), so remove it rather than shadowing it with `undefined`.
    // `Reflect.deleteProperty` keeps `'at' in Array.prototype === false`.
    Reflect.deleteProperty(Array.prototype, 'at');
  });

  afterEach(() => {
    Object.defineProperty(Array.prototype, 'at', {
      value: originalAt,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  });

  it('partitions correctly when Array.prototype.at is unavailable', () => {
    expect(toShape(nestedUniverse(), nestedPlans())).toEqual(nestedExpected());
  });
});
