// seamless-store-switch (docs/plans/2026-09-10-seamless-store-switch-plan.md)
// — the ONE switch flow both UIs (StoreSwitcher, Configurations select) run.
//
// Replaces the old "persist + logout" behaviour: the user stays logged in, the
// session is refreshed for the NEW store, and the page does a hard reload that
// boots directly into it. The reload recovers the new store's DEK from this
// device's per-store wrap table without any password — which is exactly why
// the per-store wraps are provisioned at LOGIN (dek-provisioning.ts
// `provisionStoreDekWraps`): by switch time the password is long gone from
// memory, so nothing can be unwrapped then. If this device has no wrap for the
// target store (granted after this device's last login, provisioning failure,
// or a pre-v2 table), the helper falls back to the legacy logout flow — the
// next login provisions the wrap and the next switch is seamless.
import type { UserModel } from '@store-mgmt/domain';
import { useAuthStore } from './auth-store';
import { authHttpService } from '../http/auth-http-service';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { retargetDeviceWrapStore } from '../storage/device-dek-table';

/**
 * Switches the session to `storeId`. Throws only when the backend refuses or
 * is unreachable at step 1, so the caller can keep its existing error UI with
 * the session untouched and internally consistent (still the old store on
 * both sides). Resolves after either (a) refreshing state + reloading the
 * page, or (b) logging out (fallback).
 */
export async function switchToStore(storeId: string): Promise<void> {
  // 1. Persist the selection server-side. Throws on network failure.
  const setResponse = await storeHttpService.setMyStore(storeId);
  if (!setResponse.succeeded) {
    throw new Error('STORE_SWITCH_REJECTED');
  }

  // 2. Fresh /me — the backend now answers with the NEW store's
  //    modules/features/roles (GetMeQuery reads SelectedStoreId server-side),
  //    so the hydrated session describes the store we are switching INTO.
  //    If this fails, the selection is ALREADY persisted server-side: keeping
  //    a session whose roles describe the old store would be inconsistent on
  //    every subsequent API call, so the legacy logout is the correct end
  //    state here — the next login lands directly in the new store.
  let freshUser: UserModel;
  try {
    freshUser = await authHttpService.getMe();
  } catch {
    useAuthStore.getState().logout();
    return;
  }

  // 3. Point the ACTIVE device wrap at the new store BEFORE any state is
  //    rewritten: on reload, bootstrapDeviceDek recovers table.device's bytes
  //    and scopes them by table.storeId — with this retarget those are the
  //    NEW store's key under the NEW store's label. Without a provisioned
  //    wrap this returns false WITHOUT writing, and a reload would boot the
  //    new session with the old store's key — the cross-store split the DEK
  //    code exists to prevent — so the fallback MUST be a logout: the next
  //    login resolves the new store's key properly.
  const retargeted = retargetDeviceWrapStore(storeId);
  if (!retargeted) {
    useAuthStore.getState().logout();
    return;
  }

  // 4. Refresh the cached session (updateUser stamps expiresIn / blanks the
  //    password and rewrites TOKEN/CURRENT_USER/AUTH_MODEL), then the hard
  //    refresh the user asked for: every loader, the store switcher's cached
  //    roles and all module gates re-derive from the new store.
  useAuthStore.getState().updateUser(freshUser);
  window.location.reload();
}
