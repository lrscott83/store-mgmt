# active-store-selection Specification

**Capability**: active-store-selection — owner store selection driven by the `/me` StoreList
**Status**: Active
**Last Updated**: 2026-09-12

## Purpose

Contract for owner store selection: `GET /v1/auth/me` returns every store owned
by the caller with `Id`, `Name`, and `IsActive`; the header StoreSwitcher and the
owner Configurations store select render only active stores from `user.storeList`
(never fetching `/v1/stores/by-current-user`), and session refreshes keep
`storeList` current after store create and store activation changes. Store
deactivation logs out affected users passively via the existing `/me` verdict.

## Requirements

### Requirement: /me Store List Carries Activation State

The `/me` response's `StoreList` (OwnerAdmin users) MUST return every store
owned by the caller with `Id`, `Name` AND `IsActive`, where `IsActive` reflects
the store's persisted activation flag. The list MUST include inactive stores
(name resolution for historical data requires them).

#### Scenario: Owner with mixed stores sees activation flags

- GIVEN an OwnerAdmin owning one active store "Alpha" and one inactive store "Beta"
- WHEN `GET /v1/auth/me` is called with the owner's token
- THEN `StoreList` contains both Alpha and Beta
- AND Alpha's entry has `IsActive: true`
- AND Beta's entry has `IsActive: false`

#### Scenario: Non-owner roles keep an empty store list

- GIVEN a store user (not OwnerAdmin) with a valid session
- WHEN `GET /v1/auth/me` is called
- THEN `StoreList` is empty (unchanged baseline from `AuthMeStoreListTests`)

### Requirement: Header Store Switcher Lists Active Stores Only

The header StoreSwitcher (gated by OwnerAdmin + MultiStores module on the
selected store) MUST render its selectable options from `user.storeList`
filtered to `isActive === true`, and MUST NOT issue any request to
`/v1/stores/by-current-user` (or any store-list endpoint) to build the list.

#### Scenario: Switcher shows only active stores

- GIVEN an authenticated OwnerAdmin with MultiStores enabled whose `storeList`
  contains one active and one inactive store
- WHEN the switcher popup opens
- THEN only the active store appears as a selectable option

#### Scenario: Switcher no longer fetches

- GIVEN an authenticated OwnerAdmin with MultiStores enabled
- WHEN the switcher popup opens
- THEN zero requests hit `/v1/stores/by-current-user`

### Requirement: Configurations Store Select Lists Active Stores Only

The owner Configurations page's store select (gated by MultiStores) MUST render
its options from `user.storeList` filtered to `isActive === true`, and MUST NOT
fetch a store list on mount. When `storeList` is empty or undefined (offline
first load), the select MUST fall back to showing the current store as the sole
option (existing fallback, unchanged).

#### Scenario: Configurations select filters actives

- GIVEN an authenticated OwnerAdmin with MultiStores whose `storeList` contains
  one active and one inactive store
- WHEN the Configurations page renders
- THEN the select offers only the active store

#### Scenario: Offline fallback preserved

- GIVEN an authenticated OwnerAdmin with MultiStores whose `storeList` is
  undefined (offline hydration without roster storeList)
- WHEN the Configurations page renders
- THEN the select offers exactly the current store (fallback, not an error)

### Requirement: Session Refresh After Store Create

After a successful store creation from the owner's my-stores page, the
frontend MUST refresh the session (`getUserByToken()`) so the cached
`storeList` includes the new store, before the page's list reload.

#### Scenario: New store appears in switcher without re-login

- GIVEN an authenticated OwnerAdmin with MultiStores
- WHEN they create a store "Gamma" from my-stores
- THEN a session refresh completes (one `GET /v1/auth/me`)
- AND `user.storeList` contains Gamma with `IsActive: true`
- AND the header switcher offers Gamma on its next open

### Requirement: Session Refresh After Store Activation Change

After a successful store activation change (activate/deactivate) from the
owner's my-stores page, the frontend MUST refresh the session. When the owner
deactivated the store their own session is on, the refresh's `/me` returns
404 `Store.Inactive` and the session dies by that verdict (logout) — the
existing confirm-dialog warning stays the only pre-warning. When another store
was deactivated, the refreshed `storeList` drops it from the selects
immediately.

#### Scenario: Deactivated store leaves the selects

- GIVEN an authenticated OwnerAdmin with MultiStores with stores Alpha (active,
  current) and Beta (active)
- WHEN they deactivate Beta from my-stores
- THEN a session refresh completes
- AND the Configurations select and switcher no longer offer Beta

#### Scenario: Owner deactivates their own current store

- GIVEN an authenticated OwnerAdmin whose session is on Alpha (their only active
  store) who confirmed the deactivation dialog
- WHEN the session refresh runs
- THEN `/me` returns 404 `Store.Inactive`
- AND the frontend logs out (existing `isSessionRejection` path)

#### Scenario: Deactivated store stays in storeList

- GIVEN the same owner after Beta's deactivation refresh
- THEN `user.storeList` still contains Beta with `IsActive: false` (name
  resolution keeps working)
- AND only the SELECTS filter it out

### Requirement: Deactivation Logs Out Store Users Passively

The system MUST NOT add active session-invalidation infrastructure for store
deactivation. A deactivated store's users' sessions die by the existing `/me`
verdict (404 `Store.Inactive`) on their next session refresh or natural `/me`,
and LOGIN is already blocked for owners with no active store
(`AuthenticationService.HasActiveStore`). This requirement records the
mechanism as the contract (user decision 2026-09-11).

#### Scenario: Store user of deactivated store dies on next /me

- GIVEN a store user with an active session on store Alpha when Alpha is
  deactivated
- WHEN any session refresh or natural `/me` fires
- THEN the response is 404 `Store.Inactive` and the frontend logs out

#### Scenario: No new invalidation infrastructure

- WHEN a store is deactivated
- THEN no token blacklist write keyed by store occurs (blacklist remains
  per-jti, written only by GetMeQuery's own inactive-user path)
