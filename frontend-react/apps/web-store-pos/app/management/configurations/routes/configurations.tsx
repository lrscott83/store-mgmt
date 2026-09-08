import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import type { Store } from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';

export const clientLoader = adminFeatureLoader([EFeatures.Configurations]);

export function ConfigurationsPage() {
  const intl = useIntl();
  const { user, logout } = useAuthStore();
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);
    storeHttpService
      .listStores()
      .then((response) => {
        if (!cancelled) {
          setStores(response.succeeded ? (response.data ?? []) : []);
          if (!response.succeeded) {
            setLoadError(true);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleStoreChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const storeId = event.target.value;
    if (!storeId || storeId === user?.selectedStoreId) {
      return;
    }
    setIsSwitching(true);
    setSwitchError(false);
    try {
      const response = await storeHttpService.setMyStore(storeId);
      if (response.succeeded) {
        // Ends the session so the DEK for the new store is provisioned on login.
        logout();
      } else {
        setSwitchError(true);
        setIsSwitching(false);
      }
    } catch {
      setSwitchError(true);
      setIsSwitching(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold text-gray-800">
        {intl.formatMessage({ id: 'MENU.CONFIGURATIONS' })}
      </h1>

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
          disabled={isLoading || isSwitching}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 disabled:bg-gray-100"
        >
          {isLoading ? (
            <option value="">{intl.formatMessage({ id: 'STORE_SELECTOR.LOADING' })}</option>
          ) : !loadError && stores.length === 0 ? (
            <option value="">{intl.formatMessage({ id: 'STORE_SELECTOR.EMPTY' })}</option>
          ) : (
            stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.displayName || store.name}
              </option>
            ))
          )}
        </select>
        {loadError && (
          <p className="mt-2 text-sm text-red-600">
            {intl.formatMessage({ id: 'STORE_SELECTOR.LOAD_ERROR' })}
          </p>
        )}
        {switchError && (
          <p className="mt-2 text-sm text-red-600">
            {intl.formatMessage({ id: 'STORE_SELECTOR.SWITCH_ERROR' })}
          </p>
        )}
      </div>
    </div>
  );
}

export default ConfigurationsPage;