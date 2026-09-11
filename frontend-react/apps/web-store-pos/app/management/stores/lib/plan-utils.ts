import type { Feature } from '@store-mgmt/domain';


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