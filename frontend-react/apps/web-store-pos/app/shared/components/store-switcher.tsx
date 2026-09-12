import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { EModules } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useClickOutside } from '~/shared/lib/hooks/use-click-outside';
import { switchToStore } from '~/shared/lib/stores/switch-store';

/**
 * Owner-only store switcher shown in the navbar before the tutorial link.
 * Visible ONLY for owners whose selected store has the MultiStores module
 * (module 14). Opens a popup listing the owner's ACTIVE stores; selecting a
 * different store stays logged in: the selection persists server-side, the
 * session refreshes for the new store and the page hard-reloads into it —
 * the new store's DEK comes from the per-store device wrap provisioned at
 * login (seamless-store-switch). Falls back to a logout only when this
 * device holds no wrap for the target store.
 *
 * store-list-active-stores: the popup's data source is the SESSION's
 * `user.storeList` (from /me online, from the offline roster offline) — the
 * extra `listStores` fetch is gone. Only ACTIVE stores are offered; the
 * CURRENT store is always offered too (even when it just went inactive, so
 * the user is never stranded with an empty popup). When the session carries
 * no storeList at all (legacy cached /me or an old roster bundle), the
 * fallback offers exactly the current store, so the popup still works
 * offline — it self-heals on the next successful /me.
 */
export function StoreSwitcher() {
  const intl = useIntl();
  const { user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  useClickOutside(switcherRef, () => setIsOpen(false));

  if (!user?.isOwnerAdmin) {
    return null;
  }
  // Gate MultiStores (módulo 14): el propietario solo puede cambiar de tienda si
  // su tienda seleccionada tiene el módulo activo (storeModuleIds del user,
  // online vía auth/me y offline vía roster).
  if (!user.storeModuleIds.includes(EModules.MultiStores)) {
    return null;
  }

  /** Nombre de la tienda seleccionada actualmente (roles del user cacheado). */
  const currentStoreName =
    user.roles.find((r) => r.storeId === user.selectedStoreId)?.storeName ?? '';

  // Active stores from the session's list. Legacy entries without `isActive`
  // (a /me cached before the field shipped) are NOT known-active — offering
  // them could strand the user on a store they can no longer switch away
  // from, so they are skipped until the next /me self-heals the cache.
  const activeStores = (user.storeList ?? []).filter(
    (store) => store.id === user.selectedStoreId || store.isActive === true,
  );

  // Fallback for sessions without a usable storeList (undefined or every
  // entry lacking isActive): offer exactly the current store so the popup
  // never strands the user. Its name comes from the cached roles, which work
  // offline.
  const offerStores =
    activeStores.length > 0
      ? activeStores
      : [
          {
            id: user.selectedStoreId,
            name: currentStoreName,
          },
        ];

  function togglePopup() {
    setSwitchError(false);
    setIsOpen((v) => !v);
  }

  async function switchStore(storeId: string) {
    if (!storeId || storeId === user?.selectedStoreId) {
      setIsOpen(false);
      return;
    }
    setIsSwitching(true);
    setSwitchError(false);
    try {
      // Resolves via window.location.reload() on success (no code after it
      // runs) or via logout() on the no-wrap fallback.
      await switchToStore(storeId);
    } catch {
      // setMyStore refused/failed: the session is untouched — show the error.
      setSwitchError(true);
      setIsSwitching(false);
    }
  }

  return (
    <div className="relative" ref={switcherRef}>
      <button
        type="button"
        onClick={togglePopup}
        className="rounded-full p-2 bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors"
        aria-label={intl.formatMessage({ id: 'STORE_SELECTOR.TITLE' })}
        title={intl.formatMessage({ id: 'STORE_SELECTOR.TITLE' })}
        aria-expanded={isOpen}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .414.336.75.75.75z"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {offerStores.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">
              {intl.formatMessage({ id: 'STORE_SELECTOR.EMPTY' })}
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {offerStores.map((store) => {
                const isCurrent = store.id === user?.selectedStoreId;
                return (
                  <li key={store.id}>
                    <button
                      type="button"
                      onClick={() => switchStore(store.id)}
                      disabled={isSwitching || isCurrent}
                      className="flex w-full items-center justify-between gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:cursor-default disabled:text-gray-400"
                    >
                      <span className="truncate">{store.name}</span>
                      {isCurrent && (
                        <span className="shrink-0 rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700">
                          {intl.formatMessage({ id: 'STORE_SELECTOR.CURRENT' })}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {switchError && (
            <div className="border-t border-gray-100 px-4 py-2">
              <p className="mb-1 text-sm font-semibold text-gray-900">
                {intl.formatMessage({ id: 'STORE_SELECTOR.CURRENT_STORE' }, { store: currentStoreName })}
              </p>
              <p className="text-sm text-red-600">
                {intl.formatMessage({ id: 'STORE_SELECTOR.SWITCH_ERROR' })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
