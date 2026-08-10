# Proposal: E2E B-6 — Inactive Account /me 404 + Activate Tenant Isolation

## Intent

`docs/testing/e2e-stage-1/plan-backend.md` B-6 declares a gap: the server-side `/auth/me` 404 for a deactivated account is never exercised end-to-end — no flow ever deactivated an account over HTTP. Tenant isolation of user deactivation is enforced by code (`ActivateUserCommand.cs:37-38` handler guard; `UserEntityTypeConfiguration.cs:22-24` query filter applied via `GetByIdAsync` = `FindAsync`, `GenericRepository.cs:82-85`) but never proven over HTTP. This change PROVES both with ONE new E2E file. Zero production change.

## TDD mode

Standard (owners-* precedent) — backend E2E-only, no production behavior changes.

## Backend scope + E2E untouchable rule (NON-NEGOTIABLE)

May ONLY ADD new E2E tests. Never modify, delete, rename, skip, weaken, or "fix" an existing E2E test without explicit authorization (both suites: `backend/src/SMCA.WebApi.E2ETests/`, `frontend-react/e2e/` incl. support files). Adding NEW E2E tests is allowed. If the work would require modifying production source code or existing E2E tests, STOP and report instead.

## Scope

### In Scope
- ONE new file, EXACTLY TWO cases:
  1. **Positive chain**: OwnerAdmin WITH Management module (`AuthzSeed.SeedOwnerAdminAsync(withManagementModule: true)`, minted token per `UsersActivateTests`) deactivates a same-tenant StoreUser (`AuthzSeed.SeedStoreUserAsync`, REAL login `POST /auth/login`) via `POST /api/v1/users/activate {IsActive=false}` → 200; then target's real-login token → `GET /api/v1/auth/me` → 404 `Auth.AccountInactive` (asserts per `AuthMeFailureTests.cs:39-60`).
  2. **Negative cross-tenant**: OwnerAdmin+Management in tenant A deactivates a StoreUser in tenant B → 404 + envelope failed (asserts per `Activate_nonexistent_returns_404`: status + `Succeeded==false` + `Errors.NotBeEmpty()`; do NOT pin `User.NotFound` — endpoint yields `App.Unexpected` via ErrorHandlerMiddleware).
- Cleanup: `AuthzSeed.CleanupStoreGraphAsync(storeId, userIds)`; cross-tenant cleanup per design.

### Out of Scope
- Touching `AuthMeFailureTests`/`UsersActivateTests` or any existing test/support file; ReSeller/StoreUser actor cases (handler 403 — covered conceptually); self-activation; production code; frontend tests.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `users-e2e` (R5 Activate): ADD rows — same-tenant OwnerAdmin→StoreUser deactivation 200 (+ /me chain); cross-tenant → 404 isolation (mirrors E2E-I1/I2 pattern).
- `authorization-e2e` (R1 /me window): ADD real-flow deactivated-account 404 (`Auth.AccountInactive`), closing B-6. (`api-controller` already pins the wire contract — no delta.)

## Approach

NEW `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs` (namespace `SMCA.WebApi.E2ETests.Auth`; suggested name — covers BOTH the activate tenant isolation AND the /me post-deactivation chain; sibling of `AuthMeFailureTests`/`AuthLoginOwnerAdminTests`). Structure per `UsersActivateTests`: `[Collection("e2e")]`, `WebAppFixture`, try/finally cleanup. Case-2 second tenant via local `Tenant.Create` seed per `UsersIsolationTests.cs:82` precedent.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs` | New | 2 tests (positive chain, cross-tenant 404) |
| `openspec/changes/e2e-b6-me-inactive-404/` | New | proposal.md (+ specs/design/tasks/verify) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `UserSeed.DeactivateUserAsync` is a silent NoTracking no-op | High | Deactivation MUST go through the activate API (the point); never rely on that helper |
| Cross-tenant seed needs a real 2nd tenant | Med | Local `Tenant.Create` seed; verify `CleanupTenantCascadeAsync` in design |
| Login validator requires email-shaped login | Low | `@test.com` suffix (fixtures already use it) |
| Cross-tenant wire code ≠ `User.NotFound` | Med | Pin status+Succeeded+Errors only (per `Activate_nonexistent_returns_404`) |

## Rollback Plan

Delete the new file; `git revert` if merged. No other file is touched — nothing else to revert.

## Dependencies

- B-3 real-login roundtrip (`feat/e2e-b3-auth-login-roundtrip`) proving StoreUser login — merged into this branch (commit `876e5553`); `AuthLoginStoreUserTests.cs` present and reusable as seed/pattern reference.
- PostgreSQL `smca_test`; `WebAppFixture` applies migrations.

## Success Criteria

- [ ] One new file, both cases green under `--filter "FullyQualifiedName~AuthMeDeactivation"`
- [ ] Regression: `~Auth` + `~UsersActivate` filters green
- [ ] `git diff --stat` = new test file + openspec artifacts only
- [ ] Delivery forecast: 1 file <400 lines; ask-on-risk → no chain
