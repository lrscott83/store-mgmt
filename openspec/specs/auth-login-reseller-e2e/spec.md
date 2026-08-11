# auth-login-reseller-e2e Capability Specification

**Capability**: auth-login-reseller-e2e — E2E coverage for the ReSeller login short-circuit over HTTP
**Origin**: SDD change `e2e-b3-auth-login-roundtrip`
**Status**: Active

## Purpose

Coverage-only capability spec. The ReSeller branch of `POST /api/v1/auth/login`
(`AuthenticationService.cs:68-77`) short-circuits BEFORE `HasActiveStore`: an
active ReSeller succeeds; `ReSeller.IsActive == false` returns 403
`Auth.AccountInactive`; a role-only ReSeller (UserRole=4, no `ReSeller` row)
falls through to 403 `Store.Inactive`. All are already specified behavior — this
spec only closes the HTTP roundtrip coverage gap with NEW E2E tests
(`AuthLoginReSellerTests.cs`), mirroring `AuthLoginOwnerAdminTests` conventions.

## Capability Scope

### In Scope

- New `AuthLoginReSellerTests` class: 1 positive + 2 negative `[Fact]`s.
- Local ReSeller seed inside the new file (`ToCollectTests` pattern) — no shared-helper refactor.

### Out of Scope

- Edits to existing E2E tests and any production code: prohibited (CLAUDE.md non-negotiable rule).
- Re-pinning the >=8 existing role-only MintToken tests.
- Rate-limit 429 and refresh-token lifecycle assertions.

## Requirements

### Requirement: ReSeller login roundtrip over HTTP (positive)

A user with an active `ReSeller` row MUST authenticate successfully over HTTP:
`POST /api/v1/auth/login` returns 200 with `Succeeded == true`, `Data.Login`
matching the seeded login, and a non-empty `Data.AuthToken`. The seed MUST
include ONLY the active user, `UserRole` ReSeller, and the `ReSeller` row — no
Store, StoreUser, or Owner rows — proving the short-circuit needs no store graph.

#### Scenario: Active ReSeller logs in with no store graph

- GIVEN an active user with a correct Argon2 hash, a UserRole of ReSeller, and a `ReSeller` row (IsActive default true)
- WHEN `POST /api/v1/auth/login` is called with the user's credentials
- THEN the response is HTTP 200 with `Succeeded == true` and `Errors` empty
- AND `Data.Login` matches and `Data.AuthToken` is non-empty

### Requirement: ReSeller login rejection — inactive row

A user whose `ReSeller` row has `IsActive == false` MUST be rejected with HTTP
403, `Succeeded == false`, and exactly one error `Code == "Auth.AccountInactive"`.
The assertion MUST pin the code so a wrong-branch pass (`Store.Inactive`) fails
the test.

#### Scenario: Inactive ReSeller row returns 403 `Auth.AccountInactive`

- GIVEN an active user with `ReSeller.IsActive == false`
- WHEN `POST /api/v1/auth/login` is called with the user's credentials
- THEN the response is HTTP 403 with `Succeeded == false`
- AND `Errors` contains exactly one entry with `Code == "Auth.AccountInactive"`

### Requirement: Role-only ReSeller blind-zone pin

A role-only ReSeller user (UserRole ReSeller, NO `ReSeller` row) MUST be rejected
with HTTP 403, `Succeeded == false`, and exactly one error
`Code == "Store.Inactive"`. This is the INTENTIONAL contract: MintToken-backed
tests mint tokens for this shape while real login fails; the test name and a
comment MUST document the intentionality so a future "fix" is flagged, not
silently absorbed.

#### Scenario: Role-only ReSeller returns 403 `Store.Inactive`

- GIVEN a user with UserRole ReSeller seeded via the `SeedUserWithRoleAsync` shape and NO `ReSeller` row
- WHEN `POST /api/v1/auth/login` is called with the user's credentials
- THEN the response is HTTP 403 with `Succeeded == false`
- AND `Errors` contains exactly one entry with `Code == "Store.Inactive"` — not `Auth.AccountInactive` (the user is active)

## Verification Criteria

- [ ] `--filter FullyQualifiedName~AuthLogin` runs green with the two new files present.
- [ ] `git diff --stat` shows only the two added test files (no production/existing-test changes).