import type { Module } from '@store-mgmt/domain';

/**
 * Merges a store's active modules into the module catalog so a card/list can
 * hydrate: catalog modules the store has are marked `selected: true` with the
 * store's price overrides (currentPrice/price/discountText); the rest stay
 * unselected. Used by the my-stores cards (plan price per card).
 */
export function mergeStoreModules(catalog: Module[], storeModules: Module[]): Module[] {
  return catalog.map((m) => {
    const storeModule = storeModules.find((sm) => sm.id === m.id);
    if (storeModule) {
      return {
        ...m,
        selected: true,
        currentPrice: storeModule.currentPrice,
        price: storeModule.price,
        discountText: storeModule.discountText,
      };
    }
    return { ...m, selected: false };
  });
}
