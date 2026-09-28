import type { Plan } from '../models/store';

/**
 * Group key for the items no plan in the catalog carries. `GET /v1/plans` is NOT the whole
 * plan universe — VIP is excluded server-side — so a VIP-only module belongs to no plan in the
 * input and needs a home of its own.
 */
export const NO_PLAN_GROUP = '';

/** One plan's slice of a module universe. `items` is never empty. */
export interface PlanModuleGroup<T> {
  /** Backend plan name (`planType`), or {@link NO_PLAN_GROUP} for the catch-all. */
  planType: string;
  /** The plan's `order`; `Number.MAX_SAFE_INTEGER` for the catch-all, so it sorts last. */
  order: number;
  /** The items this plan FIRST offers, in input order. */
  items: T[];
  /** The module ids this group owns — the uniqueness evidence for {@link groupModulesByPlanDelta}. */
  moduleIds: number[];
}

/**
 * Partition a module universe into one group per plan, so every module lands in EXACTLY ONE
 * group. The rule is the plan-change view's `deltaModules`
 * (`management/stores/components/plan-panels.tsx:72-79`): a plan shows only the modules it
 * adds on top of its `order`-chain predecessor, and the LOWEST-order plan that carries a module
 * claims it. So a module in all of Gratis/Pago/Superior appears under Gratis, and a
 * Superior-only module under Superior. Rendering the raw cumulative list instead would repeat
 * the same module in every plan.
 *
 * Why this is domain logic and not a view detail: "which plan first offers this module" is a
 * fact about the plan matrix, and any view that groups modules by plan has to agree on it.
 *
 * TOTALITY — the reason `claimed` and the catch-all exist. Two independent ways the naive
 * delta loses items:
 * 1. A module in no plan in `plans` (VIP-only, since `GET /v1/plans` excludes VIP) is in no
 *    delta at all. Dropping it makes the union a strict SUBSET of the input, and a caller that
 *    saves "the items in these groups" then omits it from the payload — which the backend reads
 *    as "leave this module untouched", not "deactivate it". Silent, and the operator has no way
 *    to tell the difference.
 * 2. Two plans claiming the same module (equal `order`, or a catalog that lists a module under
 *    a plan whose predecessor also has it after a reorder) would double-count it.
 * `claimed` makes the first-wins rule explicit and the catch-all closes the gap, so
 * `groups.flatMap(g => g.items).length === items.length` holds by construction — and the caller
 * can flatten `items` without deduplicating.
 *
 * Groups with no items are dropped: an empty group is noise, and its presence would make
 * "group exists" ambiguous.
 */
export function groupModulesByPlanDelta<T>(
  items: readonly T[],
  plans: readonly Plan[],
  moduleIdOf: (item: T) => number,
): PlanModuleGroup<T>[] {
  const orderedPlans = [...plans].sort((a, b) => a.order - b.order);
  const groups: PlanModuleGroup<T>[] = [];
  const claimed = new Set<number>();

  const take = (planType: string, order: number, candidateIds: ReadonlySet<number>) => {
    const groupItems = items.filter((item) => {
      const id = moduleIdOf(item);
      if (claimed.has(id) || !candidateIds.has(id)) return false;
      claimed.add(id);
      return true;
    });
    if (groupItems.length === 0) return;
    groups.push({
      planType,
      order,
      items: groupItems,
      moduleIds: groupItems.map(moduleIdOf),
    });
  };

  for (const plan of orderedPlans) {
    // The `order`-chain predecessor, exactly as deltaModules resolves it: the nearest plan
    // below this one in the catalog. The lowest-order plan has no predecessor and keeps its
    // full list.
    const previous = orderedPlans.filter((p) => p.order < plan.order).at(-1);
    take(
      plan.planType,
      plan.order,
      new Set(
        (previous
          ? plan.modules.filter((m) => !previous.modules.some((pm) => pm.moduleId === m.moduleId))
          : plan.modules
        ).map((m) => m.moduleId),
      ),
    );
  }

  // Everything no plan claimed. Ordering last is guaranteed by MAX_SAFE_INTEGER.
  take(
    NO_PLAN_GROUP,
    Number.MAX_SAFE_INTEGER,
    new Set(items.map(moduleIdOf).filter((id) => !claimed.has(id))),
  );

  return groups;
}
