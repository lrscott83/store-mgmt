import { useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures, EModules } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { switchToStore } from '~/shared/lib/stores/switch-store';

export const clientLoader = adminFeatureLoader([EFeatures.Configurations]);

/**
 * store-list-active-stores: the active-store select's data source is the
 * SESSION's `user.storeList` (from /me online, from the offline roster
 * offline) — the extra `listStores` fetch is gone. Only ACTIVE stores are
 * offered; the CURRENT store is always offered too (even when it just went
 * inactive, so the select never strands the user). When the session carries
 * no usable storeList (undefined or legacy entries without `isActive`), the
 * fallback offers exactly the current store — it self-heals on the next
 * successful /me.
 */
export function ConfigurationsPage() {
  const intl = useIntl();
  const { user } = useAuthStore();
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(false);

  // Gate MultiStores (módulo 14): solo los propietarios con el módulo activo en
  // su tienda seleccionada pueden cambiar de tienda (storeModuleIds del user,
  // online vía auth/me y offline vía roster).
  const hasMultiStores = (user?.storeModuleIds ?? []).includes(EModules.MultiStores);

  /** Nombre de la tienda seleccionada actualmente (roles del user cacheado). */
  const currentStoreName =
    user?.roles.find((r) => r.storeId === user.selectedStoreId)?.storeName ?? '';

  // Active stores from the session's list. Legacy entries without `isActive`
  // (a /me cached before the field shipped) are NOT known-active — offering
  // them could strand the user on a store they can no longer switch away
  // from, so they are skipped until the next /me self-heals the cache.
  const activeStores = hasMultiStores
    ? (user?.storeList ?? []).filter(
        (store) => store.id === user?.selectedStoreId || store.isActive === true,
      )
    : [];

  // Fallback for sessions without a usable storeList: offer exactly the
  // current store so the select never strands the user. Its name comes from
  // the cached roles, which work offline.
  const offerStores =
    activeStores.length > 0
      ? activeStores
      : [
          {
            id: user?.selectedStoreId ?? '',
            name: currentStoreName || intl.formatMessage({ id: 'STORE_SELECTOR.CURRENT' }),
          },
        ];

  async function handleStoreChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const storeId = event.target.value;
    if (!storeId || storeId === user?.selectedStoreId) {
      return;
    }
    setIsSwitching(true);
    setSwitchError(false);
    try {
      // Resolves via window.location.reload() on success (no code after it
      // runs) or via logout() on the no-wrap fallback. See
      // docs/plans/2026-09-10-seamless-store-switch-plan.md.
      await switchToStore(storeId);
    } catch {
      // setMyStore refused/failed: the session is untouched — show the error.
      setSwitchError(true);
      setIsSwitching(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold text-gray-800">
        {intl.formatMessage({ id: 'MENU.CONFIGURATIONS' })}
      </h1>

      {hasMultiStores && (
        <div>
          <label
            htmlFor="active-store-select"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {intl.formatMessage({ id: 'CONFIGURATIONS.STORE_LABEL' })}
          </label>
          <select
            id="active-store-select"
            value={user?.selectedStoreId ?? ''}
            onChange={handleStoreChange}
            disabled={isSwitching}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 disabled:bg-gray-100"
          >
            {offerStores.length === 0 ? (
              <option value="">{intl.formatMessage({ id: 'STORE_SELECTOR.EMPTY' })}</option>
            ) : (
              offerStores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))
            )}
          </select>
          {switchError && (
            <p className="mt-2 text-sm text-red-600">
              {intl.formatMessage({ id: 'STORE_SELECTOR.SWITCH_ERROR' })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default ConfigurationsPage;
