// seamless-store-switch (docs/plans/2026-09-10-seamless-store-switch-plan.md,
// extended by the switch-back-logout fix) — the ONE switch flow both UIs
// (StoreSwitcher, Configurations select) run.
//
// v2 — the switch-back logout fix: the old flow logged the user out whenever
// the device held no per-store wrap for the TARGET store (step 3's
// `retargetDeviceWrapStore` returning false). That was reachable on the exact
// timeline the bug report describes: create store B AFTER login on a device
// whose table predates B → A→B logs the user out → re-login on B (table
// rewritten for B, `stores[B]` only) → B→A has no wrap for A → LOGGED OUT
// AGAIN. The server can break that cycle outright: it derives every store's
// DEK from the master secret (HKDF(masterSecret, storeId)), so `PUT
// /v1/stores/switch` persists the selection AND returns the TARGET store's
// DEK wrapped under the CURRENT store's DEK — a key the client already holds
// in memory. The client unwraps it, retargets the device wrap table for the
// target store, and reloads. The per-store table still wins when the server
// wrap is absent (legacy backend, offline mode), and the legacy logout now
// remains only for the genuinely irrecoverable cases.
import type { UserModel } from '@store-mgmt/domain';
import { useAuthStore } from './auth-store';
import { authHttpService } from '../http/auth-http-service';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { retargetDeviceWrapStore, writeDeviceDekTable, readDeviceDekTable } from '../storage/device-dek-table';
import { unwrapDekWithDek } from '../offline/dek-unwrap';
import { getDek } from '../storage/data-key-store';
import { getOrCreateDeviceKey } from '../storage/device-key-store';
import { wrapDekForDevice } from '../storage/dek-bootstrap';

export async function switchToStore(storeId: string): Promise<void> {
  // 1. Persist the selection server-side AND get the target DEK wrapped
  //    under the current DEK. Throws on network failure.
  const switchResponse = await storeHttpService.switchMyStore(storeId);
  if (!switchResponse.succeeded || !switchResponse.data) {
    throw new Error('STORE_SWITCH_REJECTED');
  }
  const { wrappedDek, wrapSalt, wrapIv } = switchResponse.data;

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
  //    rewritten. Three recovery routes, best first:
  //
  //    a. The server wrap (v2): the response carries the TARGET store's DEK
  //       wrapped under the CURRENT store's DEK, which the client holds in
  //       memory. Unwrap it, then write it as the target's per-store wrap AND
  //       retarget the active entry — the post-reload bootstrap recovers the
  //       new store's key with NO password on ANY device, including one whose
  //       per-store table predates the target store (the logout scenario).
  //
  //    b. The per-store table (v1 behaviour): a wrap provisioned at a login
  //       that postdates the store's creation.
  //
  //    c. Legacy logout: only when neither source can produce the target's
  //       key — a reload would boot the new session with the OLD store's key
  //       (the cross-store split the DEK code exists to prevent).
  let retargeted = false;
  try {
    const currentDek = getDek();
    if (currentDek && wrappedDek && wrapSalt && wrapIv) {
      const targetDek = await unwrapDekWithDek(currentDek, { wrappedDek, wrapSalt, wrapIv });
      const table = readDeviceDekTable();
      const deviceKey = await getOrCreateDeviceKey();
      if (table && deviceKey) {
        table.stores = table.stores ?? {};
        table.stores[storeId] = { device: await wrapDekForDevice(targetDek, deviceKey) };
        table.formatVersion = 2;
        writeDeviceDekTable(table);
        // MANDATORY after the write: point `device` + `storeId` at the NEW
        // entry. Without this the post-reload bootstrap recovers the OLD
        // `table.device` bytes (the CURRENT store's key) scoped by the NEW
        // `table.storeId` — the cross-store split this code exists to
        // prevent — and the unlock gate expels the session to the login
        // form. retargetDeviceWrapStore copies the just-written entry into
        // the active pair atomically.
        retargeted = retargetDeviceWrapStore(storeId);
      }
    }
  } catch {
    // Malformed/unopenable server wrap — fall through to the device table.
  }

  if (!retargeted) {
    retargeted = retargetDeviceWrapStore(storeId);
  }
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
