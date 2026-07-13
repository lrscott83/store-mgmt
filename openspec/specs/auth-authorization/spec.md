# auth-authorization Capability Specification

**Capability**: auth-authorization — session-scoped authorization checks
**Origin**: SDD change `authorization-service-parity` (Slice 4, Fase 1 — auth cluster)
**Status**: Active
**Last Updated**: 2026-07-13

## Purpose
Define React `authorization-service.ts`'s `isUserAuthorized` behavior so it mirrors Angular `AuthorizationService.isUserAuthorize` exactly: per-call expiry denial evaluated first, no invented empty-array short-circuit, independent fall-through role checks reaching the store-user fallback, and a named `hasOwnersAvailableFeature` export consumed at its call-site. Source of truth: `frontend/src/app/_services/authorization/authorization.service.ts`. All 4 gates RATIFIED as mirror-Angular; no open mark-and-ask.

## Capability Scope

### In Scope
- Per-call expiry guard as the FIRST check inside `isUserAuthorized`.
- Empty `featureIds` array falling through to role checks (no true-short-circuit).
- Named `hasOwnersAvailableFeature(user)` export, consumed at its call-site.
- Independent (non-early-return) reseller / owner-admin conditionals that fall through to the store-user authorization check.

### Out of Scope (Non-Requirements)
- `help/tutorial` route guard gap (React route lacks a loader; Angular's `expectedFeatures: []` quirk) — separate guards/routes-parity slice.
- Slice 5 `usage-tracker` cleanup.
- Everything already shipped in Slices 1-3 (storage keys, auth-http register, auth logout/getUserByToken).
- Slice 3 offline no-cache authLoader asymmetry (deferred with consensus, unrelated).
- Guard-level superAdmin/ownerAdmin bypass in `auth-guard.ts` (different file/slice).

## Requirements

### Requirement: Per-Call Expiry Guard
`isUserAuthorized` MUST return `false` when `user.expiresIn < Date.now()` (EXCLUSIVE `<`), evaluated BEFORE any role or feature check. This check MUST NOT trigger logout or any other side-effect — deny-only. This boundary is intentionally different from session-load's inclusive `<=` check (auth-session capability); the two MUST NOT be conflated or unified.

#### Scenario: Expired token denies authorization
- GIVEN a user object with `expiresIn` in the past relative to `Date.now()`
- WHEN `isUserAuthorized(user, featureIds)` is invoked, regardless of role or feature match
- THEN the function returns `false`
- AND no logout or storage side-effect occurs

#### Scenario: Non-expired token proceeds to role checks
- GIVEN a user object with `expiresIn` strictly greater than `Date.now()`
- WHEN `isUserAuthorized(user, featureIds)` is invoked
- THEN the expiry guard does not short-circuit the call, and evaluation proceeds to role/feature checks

### Requirement: Empty FeatureIds Denial
`isUserAuthorized(user, [])` MUST return `false` for a non-superAdmin user. An empty `featureIds` array MUST flow into the same role `.some()` checks as any other array (which evaluate to `false` against an empty list) — it MUST NOT be special-cased to return `true`.

#### Scenario: Empty array denies non-superAdmin user
- GIVEN a non-superAdmin user and an empty `featureIds` array
- WHEN `isUserAuthorized(user, [])` is invoked
- THEN the function returns `false`

#### Scenario: Empty array still permits superAdmin
- GIVEN a superAdmin user and an empty `featureIds` array
- WHEN `isUserAuthorized(user, [])` is invoked
- THEN the function returns `true` (superAdmin bypass is unaffected by this requirement)

### Requirement: Named hasOwnersAvailableFeature Export
The module MUST export a named `hasOwnersAvailableFeature(user)` function, mirroring Angular's method. Its call-site (`edit-store.tsx`) MUST invoke this named export instead of an inline `isUserAuthorized(user, [EFeatures.Owners], undefined)` call.

#### Scenario: Named export exists and is consumed
- GIVEN the `authorization-service.ts` module
- WHEN `hasOwnersAvailableFeature` is imported
- THEN it exists as a named export
- AND `edit-store.tsx` calls `hasOwnersAvailableFeature(user)` rather than an inline `isUserAuthorized` call

### Requirement: Independent Fall-Through Control Flow
The reseller and owner-admin checks MUST be implemented as independent conditionals (not an early return) that, when their condition is false, fall through to the unconditional store-user authorization check — mirroring Angular's control flow. Neither check MAY early-return in a way that skips the store-user fallback.

#### Scenario: Reseller/owner-admin false falls through to store-user check
- GIVEN a user who is neither a reseller nor an owner-admin
- WHEN `isUserAuthorized(user, featureIds)` is invoked
- THEN the store-user authorization check is still evaluated (not skipped by an early return)

#### Scenario: Reseller true does not skip subsequent independent checks
- GIVEN a user flagged as reseller
- WHEN `isUserAuthorized(user, featureIds)` is invoked
- THEN the reseller conditional resolves independently, without an early return that bypasses the owner-admin or store-user checks structurally

## Verification Criteria
1. `isUserAuthorized` returns `false` when `user.expiresIn < Date.now()` (exclusive), checked first, with no side-effects.
2. Expiry check uses `<` (not `<=`) and is distinct from the session-load inclusive check.
3. `isUserAuthorized(user, [])` returns `false` for non-superAdmin users.
4. `isUserAuthorized(user, [])` still returns `true` for superAdmin users.
5. The invented `featureIds.length === 0 → true` short-circuit is absent from the implementation.
6. `hasOwnersAvailableFeature(user)` is exported as a named function.
7. `edit-store.tsx` consumes `hasOwnersAvailableFeature(user)` at its call-site (no inline duplicate).
8. Reseller and owner-admin checks are independent conditionals, not early returns.
9. A non-reseller/non-owner-admin user still reaches the store-user authorization check.
10. Existing/rewritten test suite (including the rewritten Finding-A test at `authorization-service.test.ts`) is green under strict TDD.

## Related Specifications

- **auth-session** (Slice 3 — logout/getUserByToken — different expiry boundary, do not conflate; completed)
- **auth-http** (Slice 2 — HTTP registration and login contract; completed)
- **usage-tracker** (Slice 5 — deferred; store-usage-tracker lifecycle)

## Implementation Status

- **Per-call expiry guard** (first line, `< Date.now()` exclusive): ✓ Done (commit 4c0c73d)
- **Empty array denies non-superAdmin**: ✓ Done (commit 4c0c73d)
- **hasOwnersAvailableFeature(user) export**: ✓ Done (commit 4c0c73d)
- **Reseller/owner-admin independent fall-through**: ✓ Done (commit 4c0c73d)
- **edit-store.tsx call-site swap**: ✓ Done (commit 4c0c73d)
- **Tests**: ✓ Done (32/32 tests green, 1588/1588 full suite passing, tsc clean, build successful)
- **Verification**: ✓ Done (all 10 Verification Criteria confirmed, verify PASS)

## Notes

- This specification captures Slice 4 of a 5-slice auth cluster (Fase 1). Slice 5 (usage-tracker) is deferred.
- All 4 parity gates ratified as mirror-Angular (obs #980); no open decisions remain.
- Expiry boundary: `< Date.now()` (EXCLUSIVE, differs intentionally from session-load's `<=` at auth-session); the two checks MUST NOT be conflated.
- Pre-existing divergence (storeId param, ADR-2) KEPT — rationalized as out-of-scope refinement (own micro-slice pending); no `!user` guard added (ADR-3, non-nullable param convention).
- Sourced from Angular `authorization.service.ts` only; no live API validation performed.
- Single-commit delivery: all 4 gates shipped together in commit 4c0c73d on feat/frontend-parity-audit (no PRs, no chaining).
