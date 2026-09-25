import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  EFeatures,
  EModules,
  PAYMENT_CHANNELS,
  SalePaymentMethod,
  channelKey,
} from '@store-mgmt/domain';
import { adminFeatureLoader } from '~/auth/routes/loaders';
import { Switch } from '~/shared/components/ui/switch';
import { channelLabel } from '~/management/channel-rates/lib/channel-label';
import { currencyLabel } from '~/shared/lib/format-money-with-currency';
import {
  DEFAULT_ENABLED_CHANNEL_KEYS,
  StorePaymentMethodsConfigService,
} from '~/shared/lib/payment-methods/store-payment-methods-config-service';
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
/**
 * store-payment-methods-config (2026-09-22) → per-channel (T20, 2026-09-24):
 * "Métodos de pago" — per-store toggles over the FULL canonical channel
 * catalogue (method + currency). Independent of the MultiStores module (every
 * owner configures the CURRENT store); the storeId comes from the page's active
 * store. Efectivo channels are always on (Switch disabled), matching the
 * service's no-op rule; toggling any other channel persists immediately and
 * shows the saved indicator until the store changes.
 */
interface ConfigChannel {
  method: SalePaymentMethod;
  currency: number;
  key: string;
}

interface ConfigChannelGroup {
  currency: number;
  channels: ConfigChannel[];
}

export function PaymentMethodsConfigSection({ storeId }: { storeId: string }) {
  const intl = useIntl();
  // SSR: no window on the server → render the default catalogue; hydration
  // reads the store's config from localStorage afterwards.
  const configService = useMemo(() => {
    if (typeof window === 'undefined' || !storeId) return null;
    return new StorePaymentMethodsConfigService(storeId);
  }, [storeId]);

  const [enabledChannels, setEnabledChannels] = useState<string[]>(() => [
    ...DEFAULT_ENABLED_CHANNEL_KEYS,
  ]);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    setShowSaved(false);
    if (!configService) {
      setEnabledChannels([...DEFAULT_ENABLED_CHANNEL_KEYS]);
      return;
    }
    setEnabledChannels(configService.getEnabledChannels(storeId));
  }, [configService, storeId]);

  // Canonical catalogue grouped by currency, in catalogue order.
  const channelGroups = useMemo<ConfigChannelGroup[]>(() => {
    const groups: ConfigChannelGroup[] = [];
    for (const channel of PAYMENT_CHANNELS) {
      const currency = Number(channel.currency);
      let group = groups.find((candidate) => candidate.currency === currency);
      if (!group) {
        group = { currency, channels: [] };
        groups.push(group);
      }
      group.channels.push({
        method: channel.method,
        currency,
        key: channelKey(channel.method, currency),
      });
    }
    return groups;
  }, []);

  function handleToggle(method: SalePaymentMethod, currency: number, enabled: boolean) {
    if (!configService) return;
    configService.setChannelEnabled(storeId, method, currency, enabled);
    setEnabledChannels(configService.getEnabledChannels(storeId));
    setShowSaved(true);
  }

  return (
    <div data-testid="payment-methods-config" className="mt-8">
      <h2 className="mb-3 text-base font-semibold text-gray-800">
        {intl.formatMessage({ id: 'CONFIGURATIONS.PAYMENT_METHODS.TITLE' })}
      </h2>
      <div className="space-y-4">
        {channelGroups.map((group) => (
          <div key={group.currency}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {currencyLabel(group.currency)}
            </p>
            <div className="space-y-2">
              {group.channels.map((channel) => {
                const isCash = channel.method === SalePaymentMethod.Efectivo;
                return (
                  <div
                    key={channel.key}
                    className="flex items-center justify-between gap-2"
                  >
                    <Switch
                      checked={isCash || enabledChannels.includes(channel.key)}
                      disabled={isCash}
                      onChange={(enabled) =>
                        handleToggle(channel.method, channel.currency, enabled)
                      }
                      label={channelLabel(channel.method, channel.currency, (id) =>
                        intl.formatMessage({ id }),
                      )}
                    />
                    {isCash && (
                      <span className="text-xs text-text-muted">
                        {intl.formatMessage({
                          id: 'CONFIGURATIONS.PAYMENT_METHODS.ALWAYS_ON',
                        })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {showSaved && (
        <p className="mt-2 text-xs text-text-muted" data-testid="payment-methods-saved">
          {intl.formatMessage({ id: 'CONFIGURATIONS.PAYMENT_METHODS.SAVED' })}
        </p>
      )}
    </div>
  );
}

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

      {/* Formas de pago (store-payment-methods-config): per-store toggles for
          the CURRENT store — independent of MultiStores, like the rest of the
          page's per-store settings. */}
      <PaymentMethodsConfigSection storeId={user?.selectedStoreId ?? ''} />
    </div>
  );
}

export default ConfigurationsPage;
