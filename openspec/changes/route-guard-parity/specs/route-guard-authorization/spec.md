# route-guard-authorization Capability Specification

## Purpose

Define the React route-guard layer (`featureLoader` and siblings in
`frontend-react/apps/web-store-pos/app/auth/routes/loaders.ts`) so plain
feature-gated routes mirror Angular's live `AuthGuard`
(`_shared/guards/auth-guard.ts`) exactly, while explicitly NOT altering the
shared `isUserAuthorized` algorithm consumed by the sidebar.

## Requirements

### Requirement: Owner-Admin/Super-Admin Bypass on Plain featureLoader

The plain `featureLoader` route guard MUST grant access to authenticated
`isSuperAdmin` or `isOwnerAdmin` users on any feature-guarded route, BEFORE
evaluating `expectedFeatures` membership, mirroring Angular's `AuthGuard`. The
bypass MUST NOT require a featureId match for these two roles. Reseller and
store-user behavior on plain routes is UNCHANGED (still requires featureId
membership; store-user scoped to `selectedStoreId`). Unauthenticated requests
are still denied.

#### Scenario: Super-admin bypasses feature check
- GIVEN an authenticated super-admin
- WHEN accessing any `featureLoader`-guarded route
- THEN access is granted regardless of `featureIds`

#### Scenario: Owner-admin bypasses feature check (changed behavior)
- GIVEN an authenticated owner-admin without the route's required featureId
- WHEN accessing a `featureLoader`-guarded route
- THEN access is granted WITHOUT a featureId check (literal Angular parity)

#### Scenario: Reseller still requires featureId membership
- GIVEN an authenticated reseller
- WHEN accessing a `featureLoader`-guarded route
- THEN access is granted ONLY if their `featureIds` include the route's `expectedFeatures`

#### Scenario: Store-user still requires scoped role/featureId
- GIVEN an authenticated store-user
- WHEN accessing a `featureLoader`-guarded route
- THEN access requires a matching featureId in a role scoped to `selectedStoreId`

#### Scenario: Unauthenticated request denied
- GIVEN an unauthenticated visitor
- WHEN accessing a `featureLoader`-guarded route
- THEN access is denied (existing behavior, unchanged)

### Requirement: Sidebar Authorization Unaffected (Non-Regression)

The shared `isUserAuthorized` function (`shared/lib/auth/authorization-service.ts`)
MUST NOT change as part of this capability. The owner-admin bypass MUST exist
ONLY inside `featureLoader` (or a route-guard-local helper it calls), never in
`isUserAuthorized`. Sidebar item visibility for owner-admins MUST remain
identical to pre-change behavior.

#### Scenario: Owner-admin sidebar gating unchanged
- GIVEN an authenticated owner-admin lacking a given feature's featureId
- WHEN the sidebar renders (via `isUserAuthorized`)
- THEN the corresponding sidebar item remains hidden, exactly as before this change
- AND no new sidebar items appear for owner-admins as a side effect of the route-guard bypass

### Requirement: Other Guard Loaders Unchanged (Non-Regression)

`adminFeatureLoader`, `resellerFeatureLoader`, and `superAdminLoader` MUST
remain unchanged and MUST continue to require a featureId match for
owner-admins, mirroring Angular's `AdminAuthGuard`/`ReSellerAuthGuard`.

#### Scenario: adminFeatureLoader still denies owner-admin without featureId
- GIVEN an authenticated owner-admin without the required featureId
- WHEN accessing an `adminFeatureLoader`-guarded route
- THEN access is denied, unchanged from pre-existing behavior

#### Scenario: resellerFeatureLoader/superAdminLoader untouched
- GIVEN their respective pre-change behaviors
- WHEN accessed by any role
- THEN behavior is byte-for-byte identical to before this change

### Requirement: help/tutorial Is a Public Route

The `help/tutorial` route MUST be reachable without authentication, matching
Angular's route (no `canActivate`). It MUST be moved out of the
`authLoader`-gated `app-layout` branch in `routes.ts`. All other routes remain
auth-gated as before.

#### Scenario: Unauthenticated visitor reaches help/tutorial
- GIVEN an unauthenticated visitor
- WHEN navigating to `help/tutorial`
- THEN the page loads with no auth redirect

#### Scenario: Other routes remain auth-gated
- GIVEN an unauthenticated visitor
- WHEN navigating to any route other than `help/tutorial`
- THEN the existing `authLoader` gate still applies unchanged

## Non-Requirements (Explicit Exclusions)

- storeId-param sourcing (ADR-2) — ratified deferred, untouched.
- Offline/no-cache `authLoader` asymmetry — ratified deferred, untouched.
- Stale-closure `selectedStoreId` bug in profile loaders — real React bug, not parity; out of scope.
- Dead Angular `_services/auth/auth.guard.ts` — never imported; ignored.
</content>
