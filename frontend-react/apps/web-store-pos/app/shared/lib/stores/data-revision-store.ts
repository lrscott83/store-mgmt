import { create } from 'zustand';

/**
 * Revision counter for store-local data that changes as a side effect of a
 * mutation (orders and the inventory entries a sale deducts).
 *
 * The app has NO server-state cache — no React Query, no SWR, no router
 * revalidation, no pub/sub. Every view instantiates its own offline service and
 * snapshots localStorage in a mount-scoped effect, so anything derived from it
 * goes stale the moment a sale is registered from the global cart.
 *
 * A view that derives from this data reads `revision` and puts it in the
 * dependency list of its derivation, so a bump recomputes it. This is a
 * notification channel only: it carries no data and does no I/O, so the view
 * still re-reads through its own service.
 *
 * The bump belongs to the mutation that changed the data, never to the UI that
 * happened to trigger it — `OrderOfflineService.createOrder` bumps it, so every
 * current and future sale-registration path is covered by one call site.
 */
interface DataRevisionState {
  revision: number;
  bump: () => void;
}

export const useDataRevisionStore = create<DataRevisionState>((set) => ({
  revision: 0,

  bump: () => {
    set((state) => ({ revision: state.revision + 1 }));
  },
}));

/** Imperative counterpart of `useDataRevisionStore().bump`, for non-React callers. */
export function bumpDataRevision(): void {
  useDataRevisionStore.getState().bump();
}