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
 *
 * Two entry points, deliberately different:
 * - `bumpDataRevision()` is IMMEDIATE. It stays that way for the callers that already
 *   depend on reading the new revision in the same tick.
 * - `notifyDataChanged()` is COALESCED. It is what every service's single write door
 *   calls, so a write can never reach storage without a notice going out. Coalescing is
 *   not an optimisation detail: acting on a notice re-reads (and decrypts) a snapshot, so
 *   an uncoalesced 500-row import would rebuild 500 snapshots.
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

/**
 * Revision observed when the pending coalesced notice was queued; `null` when nothing is
 * queued. Module-scoped on purpose: the queue belongs to the store, not to a subscriber.
 */
let pendingSinceRevision: number | null = null;

/**
 * Coalesced notification that every service's single write door calls. Returns the
 * revision that WILL be in effect once the notice is delivered, so the writer can stamp
 * its own snapshot with it — see the RETURN VALUE note below.
 *
 * The notification itself is cheap (no I/O), but ACTING on it is not: re-reading a
 * per-instance snapshot decrypts storage. So a burst of writes — a 500-row import, a
 * warehouse movement touching two entities — must cost ONE notification, not N.
 *
 * Uses a microtask rather than `setTimeout(0)`: a microtask drains at the end of the
 * current task, so every synchronous burst of writes inside one handler collapses into a
 * single bump that still lands BEFORE the browser paints, whereas a timer would let
 * unrelated macrotasks interleave between the write and its notice.
 *
 * RETURN VALUE — why the writer stamps its own snapshot: the instance that just wrote
 * holds the authoritative object graph in memory. Re-reading its own write would be
 * wasted I/O AND lossy — a storage round-trip normalises whatever the entity type says
 * nothing about (an `Order` revives only `date`, so `createdDate` comes back as the
 * string it was stored as and `undefined` fields vanish), so a writer that re-reads
 * itself can observe a DIFFERENT object than the one it just wrote. Stamping
 * `current + 1`, the revision the pending notice will produce, makes the writer skip that
 * reload while still invalidating every OTHER instance, whose stamps still point at the
 * previous revision.
 */
export function notifyDataChanged(): number {
  const current = useDataRevisionStore.getState().revision;
  if (pendingSinceRevision === null) {
    pendingSinceRevision = current;
    queueMicrotask(() => {
      const queuedAt = pendingSinceRevision;
      pendingSinceRevision = null;
      // An IMMEDIATE bump that landed after the notice was queued already told every
      // subscriber to re-read — `createOrder` does exactly that. Bumping again would make
      // one sale cost two revisions, so the coalesced notice absorbs it and stands down.
      // Either way the revision ends at `queuedAt + 1`, which is what the writer stamped,
      // so the writer stays un-reloaded under absorption too.
      if (queuedAt !== useDataRevisionStore.getState().revision) return;
      bumpDataRevision();
    });
  }
  return current + 1;
}

/**
 * Awaits the coalescing queue draining. Production callers never need this — the
 * notification lands on its own — but a test asserting "A re-reads after B writes" needs
 * to observe the instant the notice was delivered rather than assume it.
 */
export async function flushDataChangeNotifications(): Promise<void> {
  await Promise.resolve();
}