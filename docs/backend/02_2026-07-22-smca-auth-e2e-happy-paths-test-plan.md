# E2E test plan — SMCA.WebApi `/auth` heavy happy-paths (extends the 01 pilot)

Date: 2026-07-22
Status: Draft (pending user review)
Scope owner: backend / SMCA.WebApi
Depends on: `01_2026-07-22-smca-auth-e2e-test-plan.md` (harness) + its implementation plan.

## Context

The `01` pilot stood up the e2e harness (`WebApplicationFactory<Program>` + config-provided `smca_test` Postgres + JWT minted in-test) and covered the low-seed `/auth` contract cases, deferring the two happy-paths that need real domain seeding. This plan covers those two, plus pins a bug found while mapping them.

Backend facts (verified):
- `AuthenticationService.IsValidUserAsync` succeeds for a super-admin with only a `User` (active, correct hash) + a `UserRole(RoleId = 1)` row. `Role` rows 1–4 are seeded by migrations; `IsSuperAdmin` does not check tenant. No Owner/Store needed.
- `RegisterCommandHandler` creates `Tenant + User + Owner + UserRole(2) + Store + StoreModule×N + StoreRoleFeature×M`. It reads `Module`/`Feature`/`SystemConfiguration`, all seeded by migrations — so register needs **no** pre-seeding.
- Password hash = `Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(plaintext)))`.
- Login validator requires `Password` length ≥ 8 (no uppercase rule); register validator requires uppercase in `Password`.

## Goal

Cover the two `/auth` happy-paths end-to-end against real Postgres, reusing the `01` harness, and pin the register-duplicate bug so a future fix is detected.

## Scope

Three tests added to the existing `SMCA.WebApi.E2ETests` project:
1. Login full success (super-admin).
2. Register full success.
3. Register duplicate → pins current HTTP 500 (KNOWN BUG).

## Non-goals

- No new test project, no new NuGet packages — reuse `01`'s `AppTestFactory`, `WebAppFixture`, `ApiResponse<T>`.
- No Docker. No CI.
- No store-admin / store-user login variants (super-admin is the cheapest passing path and sufficient to prove login e2e).

## Seeding

- **Login:** seed one `User` (active, `Password = base64(SHA256("Password123"))`, `TenantId = DataUtils.DefaultTenant.Id`) + one `UserRole(userId, RoleId = 1, DefaultTenant.Id)`, via a scoped `ApplicationDbContext.Set<...>()`. Reuse the migration-seeded `DefaultTenant` so no tenant row is created.
- **Register:** no seeding — modules/features/system-config come from migrations.

## Data isolation — manual cleanup per test

Each write-heavy test cleans up what it created in a `finally` block (runs even if an assertion fails):
- **Login test:** delete the seeded `UserRole` then `User`.
- **Register success:** delete by the newly created `TenantId` in FK order: `StoreRoleFeature → StoreModule → Store → UserRole → Owner → User → Tenant`, using `IgnoreQueryFilters()` for every read/delete (the tenant-scoped query filter with a null test tenant otherwise hides the rows).
- **Register duplicate:** only one `User`/`Tenant` was created (the second insert failed at the DB), so cleanup targets that single tenant.

Unique random `Login`/`StoreName` per test avoids unique-index collisions across runs.

## Test cases

Route base `api/v1/auth`. Assert on HTTP status + deserialized `ResponseResult<T>` (`{ succeeded, data, errors:[{code,description}], actionCode }`).

### 1. Login full success
- Seed super-admin user with plaintext `Password123`.
- POST `/api/v1/auth/login` `{ login, password: "Password123" }` → **200**, `succeeded = true`, `data.authToken` non-empty, `data.login == login`.

### 2. Register full success
- POST `/api/v1/auth/register` with unique `Login`/`StoreName`, valid `Password` (≥8, with uppercase), `FullName`, `CellPhone`, non-empty `StoreName` → **200**, `succeeded = true`, `data = true`.
- Assert persistence with `IgnoreQueryFilters()`: the `User` for that login exists; an `Owner` and a `Store` were created for it.

### 3. Register duplicate (KNOWN BUG — pins current behavior)
- POST register with a unique login → 200.
- POST register again with the SAME login → **currently HTTP 500** (`DbUpdateException` at `SaveChangesAsync`, unhandled → `ErrorHandlerMiddleware` returns `ResponseResult<string>` with `Error("App.Unexpected", …)`, `actionCode = 500`).
- Assert: status 500, `succeeded = false`, an error with `code == "App.Unexpected"`.
- Test comment must state: **KNOWN BUG** — should be a controlled 4xx. Root cause: `RegisterCommandValidator`'s uniqueness check calls `IUserRepository.IsUniqueLoginAsync`, whose `User` query filter (null tenant for anonymous request) hides all rows, so `.All(...)` is vacuously true and validation is bypassed; the DB unique index then throws. When fixed (uniqueness check using `IgnoreQueryFilters`), this test will fail and must be updated to assert the controlled 4xx.

## Findings / risks

- The register-duplicate 500 is a real bug (documented above); this plan pins it, it does not fix it.
- Persistence assertions MUST use `IgnoreQueryFilters()` — a test-side `ApplicationDbContext` runs with a null tenant / non-super-admin context, so tenant-scoped filters hide freshly written rows.
- Register writes many `StoreRoleFeature` rows; cleanup deletes them first (FK order) by tenant.

## Open items to verify during implementation

- Confirm `GetMeQuery` is unaffected (not touched here).
- Confirm the exact login `data.authToken` property casing after camelCase serialization (`authToken`).
- Confirm no additional required field on `RegisterCommand` beyond `Login/Password/FullName/CellPhone/StoreName` (Email optional, Code optional).
