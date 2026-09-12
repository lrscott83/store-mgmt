# Proposal: store-list-active-stores

**Change**: store-list-active-stores · **Phase**: Proposal · **Date**: 2026-09-11
**Status**: Proposed · **Baseline**: main @ 72254e8f

## Summary

Make `/me` the single source for the owner's store list: `StoreSummaryDto` gains
`isActive`, the header StoreSwitcher and the owner Configurations select render
from `user.storeList` (filtering to active stores) instead of firing the extra
`/v1/stores/by-current-user` request, the offline roster carries the same list,
and session refresh after store create/deactivate keeps the list consistent.

## Why

- **One request less**: both switcher and Configurations fetch `by-current-user`
  (a full `StoreDto` per store with N+1 payment reads) just to render names that
  `/me` already returned. `storeList` exists in `/me` since qa `37b79718`.
- **Active-only requirement**: today's selects show ALL stores (switcher via
  `by-current-user` actually returns actives only, but the /me storeList — used
  for roster and name resolution — carries inactive ones with no flag). With
  `isActive` on the DTO, every consumer can filter without a second call.
- **Offline parity**: the roster's users have no storeList, so offline selects
  degrade to "current store only". Carrying the list in the roster fixes
  name resolution and display offline.
- **Consistency loop**: creating or deactivating a store does not refresh the
  session today, so a stale storeList drives the select until the next natural
  `/me`. Refreshing the session (existing `getUserByToken()` pattern) closes
  the loop at both moments.

## What Changes

### Backend

1. **`StoreSummaryDto`** (`backend/src/Application/Dtos/Authentication/StoreSummaryDto.cs`):
   add `bool IsActive` to the positional record; update the single production
   construction site (`GetMeQuery.cs:110-119`).
2. **Roster export** (`ExportOfflineRosterQuery.cs`): `OfflineRosterUserDto` gains
   `storeList` (`List<StoreSummaryDto>`), filled per roster user the same way
   `/me` fills it for OwnerAdmin users (all the owner's stores, with `isActive`).
   NOTE: roster users are store-scoped; the owner appears synthetically
   (query lines ~113-130) — fill storeList for the owner row too.
3. **Store deactivation → user logout** is **passive by design** (user decision
   2026-09-11): no new token/invalidations infrastructure. The existing `/me`
   verdict (404 `StoreErrors.Inactive`, `GetMeQuery.cs:81-83`) is the logout
   mechanism; the FE `isSessionRejection` handler already logs out on it
   (`auth-store.ts:224-229`). The last-active-store case behaves identically
   (owner's own /me 404s → logout), and LOGIN already blocks owners with no
   active store (`AuthenticationService.HasActiveStore`).
4. **`by-current-user` stays untouched** — other consumers (Angular store-list,
   admin cards) keep it. Only the two React selects stop calling it.

### Frontend (React — the only affected UI)

5. **StoreSwitcher** (`app/shared/components/store-switcher.tsx`): render from
   `user.storeList` filtered to `isActive === true`; remove the lazy
   `listStores()` fetch. Current-store name still resolves from `user.roles`
   (unchanged). MultiStores gate unchanged.
6. **Configurations select** (`app/management/configurations/routes/configurations.tsx`):
   same source change — `user.storeList` actives only; drop the mount-time
   `listStores()` fetch. Offline fallback (current store as sole option)
   stays for an empty/undefined list.
7. **Session refresh moments** (my-stores.tsx): after `createStore` and after
   `setStoreActivation`, call `getUserByToken()` (the pattern already used in
   `handlePlanActivate`) so the select/switcher list reflects the new state
   immediately. If the owner deactivated their own current store, this refresh
   IS the /me verdict → logout (expected, decided above).
8. **Offline roster** (`roster-types.ts`, `offline-auth-service.ts` `toUserModel`):
   carry `storeList` through, same `StoreSummary` shape + `isActive` in
   `domain/models/auth.ts`.
9. **warehouse-movements.tsx** name resolution (`:109`) is unchanged: it reads
   `user.storeList` for names and benefits from inactive entries remaining in
   the list (only selects filter).

### NOT changing

- `switchToStore` (`switch-store.ts`) — untouched, per user request.
- `/v1/stores/by-current-user` endpoint and its Angular/admin consumers.
- The offline-first hydration contract (`auth-store.ts:159-178`): no new
  startup `/me` calls.
- `AuthMeStoreListTests.cs` and every existing E2E (backend + Playwright) —
  additive DTO field only; new coverage goes in NEW test files.

## Impact

- **Specs affected**: `auth` (storeList shape), `offline-auth` roster shape,
  plus a new capability spec for active-store selection (to be named in spec
  phase; candidates: `auth`, `seamless-store-switch`).
- **Existing tests impacted**: FE unit tests `store-switcher.test.tsx` /
  `configurations.test.tsx` mock `listStores` (will be updated — vitest, not
  E2E); backend `TestDtos.cs` `StoreSummaryData` needs the new field for new
  tests (existing E2E untouched).
- **Auth redirect invariant**: all session deaths flow through the existing
  `/me` verdict — no new bounce paths; `docs/contracts/authenticated-session-redirect.md`
  holds.
- **Risk**: low-medium. Backend is an additive DTO field + roster fill; FE is
  a data-source swap in two selects + two session-refresh calls + roster
  mapping. The delicate surfaces (offline-first hydration, unlock gate) are
  untouched.

## Dependencies

None — builds on qa's storeList (`37b79718`, already merged into main).

## Open items for spec phase

- Where the new capability requirement lives (existing spec delta vs. new
  `seamless-store-switch` capability).
- Roster storeList: fill for all roster users or owner-row only (spec will
  verify with the `GetAllStoresByOwnerUserIdAsync` shape — a store user is not
  an owner; the list is only meaningful for OwnerAdmin).
- i18n: whether the switcher needs an "inactive store" visual state at all
  (it filters them out — answer: no).
