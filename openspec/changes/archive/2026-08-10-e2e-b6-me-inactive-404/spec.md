# Delta for e2e-b6-me-inactive-404

**Coverage-only delta.** ONE new E2E file; no new or modified product behavior — the deactivation endpoint and the inactive-account `/me` 404 are already specified behavior. B-6 declared the gap: no flow ever deactivated an account over HTTP, so the server-side `/me` 404 was never exercised end-to-end.

**Scope rule — carried verbatim**: "In this backend test-coverage work, the agent may ONLY ADD new E2E tests. Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization (both suites: `backend/src/SMCA.WebApi.E2ETests/`, `frontend-react/e2e/` incl. support files). Adding NEW E2E tests is allowed. If the work would require modifying production source code or existing E2E tests, STOP and report instead."

Domains: `users-e2e` (R5 — MODIFIED); `authorization-e2e` (R1 — MODIFIED).

## ADDED Requirements

### Requirement: E2E coverage — same-tenant deactivation chain: activate 200 then /me 404 `Auth.AccountInactive`

The E2E suite MUST add a test in `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeDeactivationTests.cs` proving the B-6 chain over HTTP: an OwnerAdmin actor WITH the Management module (`AuthzSeed.SeedOwnerAdminAsync(withManagementModule: true)`, minted token) deactivates a same-tenant StoreUser (`AuthzSeed.SeedStoreUserAsync`, REAL login token from `POST /api/v1/auth/login`) via `POST /api/v1/users/activate {Id, IsActive=false}` → HTTP 200; then the target's real-login token → `GET /api/v1/auth/me` → HTTP 404, `Succeeded=false`, `ActionCode=404`, exactly one error `Code == "Auth.AccountInactive"`.

#### Scenario: OwnerAdmin deactivates same-tenant StoreUser, then /me 404s with AccountInactive

- GIVEN an OwnerAdmin actor seeded with the Management module (minted token) and a StoreUser target in the SAME tenant holding a real-login token (login email-shaped per `LoginValidator`)
- WHEN the actor POSTs `/api/v1/users/activate {Id=target, IsActive=false}`
- THEN the response is HTTP 200 with `Succeeded == true`
- AND the target's real-login token is sent to `GET /api/v1/auth/me`
- THEN the response is HTTP 404 with `Succeeded == false` and `ActionCode == 404`
- AND `Errors` contains exactly ONE entry with `Code == "Auth.AccountInactive"` (contain-single assert — discriminates the inactive-account 404 from a generic `User.NotFound` 404)
- AND cleanup removes the store graph via `AuthzSeed.CleanupStoreGraphAsync` plus any residual user rows

### Requirement: E2E coverage — cross-tenant deactivation returns 404 (tenant isolation)

The E2E suite MUST add a test proving tenant isolation on deactivation: an OwnerAdmin actor in tenant A (Management module) deactivating a victim user in a DIFFERENT tenant B receives HTTP 404 with the envelope failed. The 404 comes from the tenant query filter (`UserEntityTypeConfiguration.cs:22-24`) through `GetByIdAsync`/`FindAsync` — NOT from the handler guard (which would be 403) and NOT a successful write. Assert status 404 + `Succeeded == false` + `Errors` non-empty per `Activate_nonexistent_returns_404` conventions; do NOT pin `User.NotFound` — the endpoint yields `App.Unexpected` via `ErrorHandlerMiddleware`.

#### Scenario: OwnerAdmin in tenant A deactivates a victim in tenant B

- GIVEN an OwnerAdmin actor with the Management module in the default tenant A and a victim user (StoreUser role) seeded in a custom tenant B via local `Tenant.Create` seed (`UsersIsolationTests.cs:82` precedent)
- WHEN the actor POSTs `/api/v1/users/activate {Id=victim, IsActive=false}`
- THEN the response is HTTP 404 with `Succeeded == false`
- AND `Errors` is non-empty (no pinned code — `App.Unexpected` envelope, not `User.NotFound`)
- AND cleanup removes tenant B via `DbTestHelpers.CleanupTenantCascadeAsync` and the actor graph via `AuthzSeed.CleanupStoreGraphAsync`

## Non-Goals (explicit)

- Token-blacklist second-call 401: OUT — covered by `AuthMeFailureTests.Me_with_inactive_user_token_second_call_returns_401_from_blacklist`; the positive chain makes exactly ONE /me call.
- Production code and existing E2E tests: untouched (CLAUDE.md rule above).
- ReSeller/StoreUser actor cases (handler 403), self-activation, frontend suite: out of scope per proposal.
