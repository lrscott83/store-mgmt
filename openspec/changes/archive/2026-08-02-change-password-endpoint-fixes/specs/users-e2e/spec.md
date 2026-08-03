# Delta for users-e2e: ChangePassword Contract Rewrite + Archive Alignment

**Domain**: `users-e2e` — `UsersChangePasswordTests.cs` (2 existing tests, rewritten to the `{id}` route contract)
**Change**: `change-password-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-08-02

---

## MODIFIED Requirements

### Requirement: E2E-CPW1 — R8 "Non-Existent UserId → 404" Aligned to 400 (Archive)

(Pending at ARCHIVE — mirrors E2E-R7/E2E-U7 pattern; main spec MUST NOT change during apply.)

The main `openspec/specs/users-e2e/spec.md` R8 row "Non-existent UserId | SuperAdmin | 404" contradicts the chosen contract (400 via validator `ExistsAsync`, decision D3 — UpdateUser precedent `Update_nonexistent_id_returns_400`). At archive the row MUST read **400** (validator).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Contract holds | SuperAdmin; random Guid id in route | POST `change-password/{id}` | HTTP 400; envelope failed |
| 1b | Archive alignment | This change archived | users-e2e main spec updated | R8 non-existent row reads 400 |

### Requirement: E2E-CPW2 — R8 "Wrong OldPassword → 400 or 403" Pinned to Real HTTP 400

(Pending at ARCHIVE — same archive step as E2E-CPW1.)

The R8 row "Change with wrong OldPassword | SuperAdmin | 400 or 403" MUST be pinned to **400** at archive. Product decision D2: the caller is already authenticated, so 401 is reserved for invalid credentials at the auth filter; a 200+envelope failure would make the React consumer (`change-password.tsx`) call `logout()` on any resolved response.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Contract holds | Authenticated user; wrong OldPassword | POST `change-password/{id}` | Real HTTP 400; envelope failed |
| 2b | Archive alignment | This change archived | users-e2e main spec updated | R8 wrong-OldPassword row reads 400 (not "400 or 403") |

## ADDED Requirements

### Requirement: E2E-CPW3 — Self Change + Re-Login Proves the Password Actually Changed (RED → GREEN)

Rewrite `Change_own_password_returns_200` (today a false positive — asserts `StatusCode == OK` only): after a successful self change, re-login with the NEW password MUST return 200, and login with the OLD password MUST return 401. Assert real status codes + envelope structure; never localized `Description` (culture coupling).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | New password works | User changes own password | Re-login with new password | HTTP 200 |
| 3b | Old password dead | Password changed | Login with old password | HTTP 401 |
| 3c | RED before fix | Broken `HashPassword` compare in handler | Test executes | Old password still logs in → 3b fails |

### Requirement: E2E-CPW4 — Wrong Old Password → Real HTTP 400 (RED → GREEN)

Authenticated actor POSTs `change-password/{id}` (self) with a wrong `oldPassword`. MUST assert HTTP 400 + envelope (`Succeeded == false`, `Errors.NotBeEmpty()`). RED today (200+envelope via `ErrorHandlerMiddleware`-untouched business failure), GREEN after CH-CPW2 + UC-CPW3.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | RED before fix | Self; wrong oldPassword | POST `change-password/{id}` | (Today) HTTP 200 envelope-failed — assertion fails |
| 4b | GREEN after fix | Same setup | POST `change-password/{id}` | HTTP 400; envelope failed |

### Requirement: E2E-CPW5 — Weak NewPassword → 400 via Validation Pipeline

New test: authenticated actor POSTs with a NewPassword that is `< 8` chars, and a second case with no uppercase letter → HTTP 400 + envelope (validation pipeline, `ValidationException`). Guards VL-CPW3.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Too short | NewPassword = `"abc123"` (7 chars) | POST `change-password/{id}` | HTTP 400 |
| 5b | No uppercase | NewPassword = `"alllowercase123"` | POST `change-password/{id}` | HTTP 400 |

### Requirement: E2E-CPW6 — Non-Existent Id → 400 (Validator `ExistsAsync`, Single Query)

SuperAdmin actor POSTs `change-password/{guid-new}` → HTTP 400 + envelope. Guards the D3 contract; the validator swap (VL-CPW1) MUST issue a single lightweight `ExistsAsync` — no full `GetByIdAsync` double-fetch.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | Contract holds | SuperAdmin; random Guid in route | POST `change-password/{id}` | HTTP 400; envelope failed |

### Requirement: E2E-CPW7 — Cross-Tenant OwnerAdmin Target → HTTP 404 (RED → GREEN)

New test: OwnerAdmin actor (ProfileAdmin feature) POSTs `change-password/{id}` where the target user's `TenantId` differs from the actor's tenant claim → HTTP 404 + envelope (anti-enumeration, decision D4). RED today (200 — cross-tenant reset succeeds via `FindAsync` filter-skip), GREEN after CH-CPW3 + UC-CPW3.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7a | RED before fix | OwnerAdmin actor; victim in another tenant | POST `change-password/{victimId}` | (Today) HTTP 200 — assertion fails |
| 7b | GREEN after fix | Same setup | POST `change-password/{victimId}` | HTTP 404; envelope failed |

### Requirement: E2E-CPW8 — Same-Tenant OwnerAdmin+ProfileAdmin Reset → 200

OwnerAdmin actor (ProfileAdmin) POSTs `change-password/{id}` for a DIFFERENT staff user in the SAME tenant (actor ≠ target) → HTTP 200 + `succeeded:true`. Proves the tenant-scope guard (CH-CPW3) does not block legit admin resets.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 8a | Admin legit path | OwnerAdmin actor; same-tenant staff target ≠ actor | POST `change-password/{id}` | HTTP 200; `succeeded:true` |

### Requirement: E2E-CPW9 — StoreUser Without ProfileAdmin → 403 (Filter-Level)

StoreUser WITHOUT the Profile feature POSTs `change-password/{id}` (any target) → HTTP 403, filter-level `[HasPermission(ProfileAdmin)]` — assert STATUS CODE ONLY (`ForbidResult` has an empty body; sibling convention `UsersListTests`). Rewrites today's `Change_password_as_other_user_without_permission_returns_403` to the `{id}` route contract (body `UserId` no longer exists). Cleanup: `AuthzSeed.CleanupStoreGraphAsync`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 9a | Filter 403 | StoreUser w/o Profile feature | POST `change-password/{id}` | HTTP 403 |

### Requirement: E2E-CPW10 — SuperAdmin Resets Another Tenant's User → 200

SuperAdmin actor POSTs `change-password/{id}` for a user in a DIFFERENT tenant → HTTP 200 + `succeeded:true`. Proves SuperAdmin bypasses the tenant-scope check (CH-CPW3).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 10a | SuperAdmin scope | SuperAdmin; cross-tenant target | POST `change-password/{id}` | HTTP 200; `succeeded:true` |

## Assert Style

Status code + envelope structure (`Succeeded == false`, `Errors.NotBeEmpty()`) ONLY for error cases. Never assert localized `Description`. Filter-level 403 → status-code-only assert. Re-login asserts (3a/3b) via the standard login endpoint.

## Verification Criteria

- [ ] 2 existing tests rewritten to `{id}` route contract; 3a/3b re-login proves actual password change (kills the 200-false-positive)
- [ ] RED→GREEN: E2E-CPW4 (400 real), E2E-CPW7 (404 cross-tenant)
- [ ] Coverage/contract: E2E-CPW5 (weak → 400), E2E-CPW6 (nonexistent → 400), E2E-CPW8 (same-tenant admin 200), E2E-CPW9 (403 filter), E2E-CPW10 (SuperAdmin cross-tenant 200)
- [ ] Regression: `dotnet test` — UsersChangePasswordTests | UsersListTests | UsersUpdateTests (Postgres `smca_test`)
- [ ] Main users-e2e spec R8 aligned at archive (E2E-CPW1 + E2E-CPW2)
