// Store-plan-change permission refresh.
// Plan: docs/plans/2026-09-15-store-plan-change-permission-refresh-plan.md
//
// WHY THIS EXISTS
// The two plan-change handlers used to "refresh the session" through
// `getUserByToken()`. That action is cache-first BY DESIGN: when a stored
// profile exists whose `authToken` matches the one in `AUTH_MODEL`, it
// rehydrates from that profile and returns WITHOUT touching the network
// (auth-store.ts:160-177). A plan change issues no new token, so that condition
// always held, the `/me` on the "no usable cache" branch stayed unreachable, and
// `user.featureIds` / `user.storeModuleIds` went on describing the OLD plan --
// which is exactly what the sidebar filters on (sidebar.tsx:17-31 ->
// authorization-service.ts:16-41). Net effect: change the plan, keep the old
// menu, and a page reload did not help either.
//
// WHAT IT IS
// The targeted, online-only refresh the mutation flows actually need, and the
// same pattern `switch-store.ts:43,67` already uses for the store switch: ask
// `/me`, then hand the answer to `updateUser`. The backend is already correct
// (GetMeQuery recomputes modules/features per request), so one call is enough.
//
// WHAT IT DELIBERATELY DOES NOT DO
// It does not touch `auth-store`'s hydration. `getUserByToken()` keeps its
// cache shortcut untouched, so REQ-1 of
// `openspec/specs/e2e-session-hydration/spec.md` (a reload with a valid cache
// emits ZERO `GET /v1/auth/me`) still holds and offline-first is preserved.
//
// BEST-EFFORT BY CONTRACT
// The caller has already persisted its change, so a refresh failure must never
// surface as a save error and must never sign the user out. On failure the
// cached session simply stays as it was -- the pre-existing (stale) behaviour,
// not a new failure. `updateUser` preserves `expiresIn` and rewrites
// TOKEN/CURRENT_USER/AUTH_MODEL, so the refreshed profile survives a reload.
import { useAuthStore } from './auth-store';
import { authHttpService } from '../http/auth-http-service';

/** Resolves `true` when a fresh profile was fetched AND stored. */
export async function softRefreshSession(): Promise<boolean> {
  try {
    const fresh = await authHttpService.getMe();
    // Belt and braces, same reason as auth-store.ts:198-200: spreading a
    // nullish answer would write a profile with no id, no login and no roles.
    if (!fresh) return false;
    useAuthStore.getState().updateUser(fresh);
    return true;
  } catch {
    return false;
  }
}
