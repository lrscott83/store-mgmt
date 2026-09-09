import type { Feature, Plan } from '@store-mgmt/domain';

/**
 * The module id set an activation sends: every always-included module
 * (priceIncluded across the whole catalog — they belong to every plan) plus the
 * chosen plan's own modules. Same free + paid union the old picker computed.
 */
export function planModuleIdsForActivation(plans: Plan[], target: Plan): number[] {
  const freeIds = plans
    .flatMap((p) => p.modules)
    .filter((m) => m.priceIncluded)
    .map((m) => m.moduleId);
  return [...new Set([...freeIds, ...target.modules.map((m) => m.moduleId)])];
}

/** Group GET /v1/Features/available data by ModuleId for the PlanPanels "?" tooltips. */
export function groupFeaturesByModuleId(features: Feature[]): ReadonlyMap<number, Feature[]> {
  const map = new Map<number, Feature[]>();
  for (const feature of features) {
    const list = map.get(feature.moduleId) ?? [];
    list.push(feature);
    map.set(feature.moduleId, list);
  }
  return map;
}