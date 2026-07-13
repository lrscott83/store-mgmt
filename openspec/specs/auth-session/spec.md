# auth-session Capability Specification

**Capability**: auth-session — session lifecycle (logout, getUserByToken) in `useAuthStore`
**Origin**: SDD change `auth-service-parity` (Slice 3, Fase 1 — auth cluster)
**Status**: Active
**Last Updated**: 2026-07-13

## Purpose
Define React `useAuthStore` session-lifecycle behavior so it mirrors Angular `AuthService` exactly: `logout()` storage-clear scope and conditional redirect, and a single consolidated `getUserByToken()` used by `initialize`, `login`, and `edit-store`, including expiry-preserve semantics on background revalidation.

## Capability Scope
### In Scope
- `logout()` storage-clear limited to the `AUTH_MODEL` key only.
- `logout()` conditional redirect (skip when already on `/login` or `/`).
- One reusable `getUserByToken()` function, no per-call-site duplication.
- Background revalidation preserves stored `expiresIn`; expiry boundary uses `<=`.
- Call-sites (`initialize`, `login`, `edit-store`, `navbar`, `change-password`, `denyAccess` loader) consume the above contracts.

### Out of Scope (Non-Requirements)
- `getSocialToken` / `signInGoogle` / registration / `forgotPassword` — unbuilt in React.
- `authorization.service` parity — Slice 4.
- 401 axios interceptor reusing `logout()` — HTTP follow-up, not this slice.
- `edit-store` reload-vs-refresh choice — pre-existing decision, unchanged here.
- `store-usage-tracker` — Slice 5.

## Requirements

### Requirement: Logout Storage-Clear Scope
`logout()` MUST remove ONLY the `AUTH_MODEL` key (`${appVersion}-USERDATA_KEY`) from storage. It MUST NOT remove the `token` or `currentUser` keys.

#### Scenario: Logout removes AUTH_MODEL only
- GIVEN an authenticated session with `token`, `currentUser`, and `AUTH_MODEL` present in storage
- WHEN `logout()` is invoked
- THEN the `AUTH_MODEL` key is removed from storage
- AND the `token` key remains present (stale)
- AND the `currentUser` key remains present (stale)

### Requirement: Logout Conditional Redirect
`logout()` MUST trigger a redirect to `/login` UNLESS the current route is already `/login` or `/`.

#### Scenario: Redirect from an authenticated route
- GIVEN the user is on `/dashboard`
- WHEN `logout()` is invoked
- THEN a redirect to `/login` is triggered

#### Scenario: Skip redirect when already on /login
- GIVEN the user is on `/login`
- WHEN `logout()` is invoked
- THEN no redirect is triggered

#### Scenario: Skip redirect when already on root
- GIVEN the user is on `/`
- WHEN `logout()` is invoked
- THEN no redirect is triggered

### Requirement: Consolidated getUserByToken
The store MUST expose exactly ONE `getUserByToken()` implementation. `initialize`, `login`, and `edit-store` flows MUST all invoke this same function; none MAY inline a duplicate fetch-and-parse implementation.

#### Scenario: Single implementation reused across flows
- GIVEN `initialize`, `login`, and `edit-store` each need user-by-token data
- WHEN each flow executes
- THEN each invokes the same exported `getUserByToken` function (verified via spy/reference equality, not three separate implementations)

### Requirement: Expiry-Preserve on Background Revalidation
Background revalidation via `getUserByToken()` MUST preserve the session's existing stored `expiresIn` value. It MUST NOT recompute or extend expiry. Expiry MUST be considered expired when `expiresIn <= now`.

#### Scenario: Revalidation preserves existing expiry
- GIVEN a stored session with `expiresIn = X`
- WHEN background revalidation runs via `getUserByToken()` and succeeds
- THEN the stored `expiresIn` remains `X`, unchanged

#### Scenario: Expiry boundary is inclusive of equality
- GIVEN a stored session with `expiresIn` equal to the current time
- WHEN expiry is checked
- THEN the session is treated as expired

#### Scenario: Session still valid before boundary
- GIVEN a stored session with `expiresIn` greater than the current time
- WHEN expiry is checked
- THEN the session is treated as valid

### Requirement: Call-Site Contract Consumption
`navbar`, `change-password`, and the `denyAccess` loader MUST invoke the store's `logout()` (not a local storage-clear) so the AUTH_MODEL-only scope and conditional redirect apply uniformly. `initialize`, `login`, and `edit-store` MUST invoke the consolidated `getUserByToken()`.

#### Scenario: navbar logout uses store contract
- GIVEN the user triggers logout from `navbar`
- WHEN the action executes
- THEN `useAuthStore`'s `logout()` is called (AUTH_MODEL-only clear + conditional redirect apply)

#### Scenario: edit-store consumes consolidated getUserByToken
- GIVEN the `edit-store` flow needs current user/session data
- WHEN it fetches that data
- THEN it calls the consolidated `getUserByToken()`, not an inline duplicate

## Verification Criteria
- [x] `logout()` removes only `AUTH_MODEL`; `token`/`currentUser` survive.
- [x] Conditional redirect fires except on `/login` and `/`.
- [x] Single `getUserByToken` export consumed by `initialize`, `login`, `edit-store`.
- [x] Background revalidation does not mutate `expiresIn`.
- [x] `expiresIn <= now` treated as expired; `expiresIn > now` treated as valid.
- [x] `navbar`, `change-password`, `denyAccess` loader call store `logout()`.

## Related Specifications

- **auth-http** (Slice 2 — HTTP registration and login contract; completed)
- **auth-authorization** (Slice 4 — deferred; covers authorization service and 401 interceptor reuse)
- **usage-tracker** (Slice 5 — deferred; store-usage-tracker lifecycle)

## Implementation Status

- **logout() AUTH_MODEL-only clear**: ✓ Done (commit 974e61f)
- **getUserByToken() consolidation with cold-boot sync invariant**: ✓ Done (commit 9471da2)
- **logout() conditional redirect via registered navigate handler**: ✓ Done (commit 87e3439)
- **edit-store consumer**: ✓ Done (commit 72c99e2)
- **Tests**: ✓ Done (all 1581 tests passing, tsc clean, build successful)
- **Call-site contracts**: ✓ Done (navbar, change-password, denyAccess use store logout(); initialize, login, edit-store use consolidated getUserByToken())

## Notes

- This specification captures Slice 3 of a 5-slice auth cluster (Fase 1). Slices 4–5 are deferred.
- Decision 1 (AUTH_MODEL-only clear) intentionally replicates Angular's storage scope for 1:1 parity; no call-site depends on stale token/currentUser path (ratified).
- Redirect mechanism (callback/event via `registerAuthRedirect`) is design's resolution; observable behavior is what this spec defines.
- Sourced from Angular `auth.service.ts` only; no live API validation performed.
- Pre-existing asymmetry noted: offline no-cache authLoader lets authLoader pass with profile-less user (vs Angular's APP_INITIALIZER-blocked redirect); ratified as part of the React cold-boot port decision — not re-litigated here.
