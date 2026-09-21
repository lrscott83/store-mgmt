// multi-store-panels — single gate for the multi-store panel views.
// `enabled` is true ONLY when the user is an OwnerAdmin with the MultiStores
// module (storeModuleIds) AND has at least 2 ACTIVE stores (storeList). With
// one store there is nothing to group — the view must render exactly as
// today. Inactive stores are excluded everywhere (a deactivated store must
// not be selectable/groupable), matching the store-switcher's filter.
import { useMemo } from 'react';
import type { StoreSummary } from '@store-mgmt/domain';
import { EModules } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isOwnerAdmin, isModuleAvailable } from '~/shared/lib/auth/authorization-service';

export interface MultiStoreState {
  enabled: boolean;
  stores: StoreSummary[];
}

export function useMultiStore(): MultiStoreState {
  const user = useAuthStore((s) => s.user);

  return useMemo(() => {
    if (!user) {
      console.log('[AVAIL-DIAG] useMultiStore', { branch: 'no-user', enabled: false, storesCount: 0 });
      return { enabled: false, stores: [] };
    }
    const isActiveStore = (store: StoreSummary): boolean => store.isActive !== false;
    if (!isOwnerAdmin(user)) {
      console.log('[AVAIL-DIAG] useMultiStore', {
        branch: 'not-owner-admin',
        enabled: false,
        storesCount: 0,
      });
      return { enabled: false, stores: [] };
    }
    if (!isModuleAvailable(user, EModules.MultiStores)) {
      console.log('[AVAIL-DIAG] useMultiStore', {
        branch: 'no-multistores-module',
        enabled: false,
        storesCount: 0,
      });
      return { enabled: false, stores: [] };
    }

    const activeStores = (user.storeList ?? []).filter(isActiveStore);
    console.log('[AVAIL-DIAG] useMultiStore', {
      branch: 'computed',
      enabled: activeStores.length >= 2,
      storesCount: activeStores.length,
      storeIds: activeStores.map((s) => s.id),
    });
    return { enabled: activeStores.length >= 2, stores: activeStores };
  }, [user]);
}
