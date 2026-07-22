# E2E test plan — SMCA.WebApi `/stores` (per-endpoint, controller-scoped)

Date: 2026-07-22
Status: Draft (pending user review)
Scope owner: backend / SMCA.WebApi
Depends on: `01_2026-07-22-smca-auth-e2e-test-plan.md` + `02_...-implementation-plan.md` (the harness — see Risks: it is NOT yet materialized on disk).

## Context

`StoresController` exposes 9 endpoints, but only the ones the frontends actually consume are in
scope (per `backend-endpoints-by-role.md`, `USE_ONLINE_SERVICE=false`). This plan covers **6**
endpoints, one section each, endpoint-by-endpoint, reusing the auth e2e harness. Out of scope
(exist but not in the frontend surface): `PUT /stores` (SetMyStore), `GET /stores/list/{includeInactive}`,
`DELETE /stores/{id}`. Note: the frontend doc mentions `POST /stores/activate` — that route **does
not exist** on the controller, so it is not tested.

**In-scope endpoints:**
1. `GET api/v1/stores/by-current-user`
2. `GET api/v1/stores/{id}`
3. `POST api/v1/stores`
4. `PUT api/v1/stores/{id}`
5. `POST api/v1/stores/approve` (method-level SuperAdmin-only)
6. `POST api/v1/stores/disapprove` (method-level SuperAdmin-only)

## Goal

Cover the 6 in-scope `/stores` endpoints end-to-end against the real SMCA.WebApi pipeline
(routing → `HasPermission` authorization → FluentValidation → MediatR → EF Core on `smca_test`),
asserting the real status/body contract per endpoint (including the several non-obvious ones
below), and pin the confirmed bugs so a future fix is detected.

## Non-goals

- No new test project, no new NuGet packages — extend the auth `SMCA.WebApi.E2ETests`.
- No Docker, no CI, no performance testing.
- Out-of-scope endpoints (`SetMyStore`, `list`, `DELETE`) are not tested.
- No exhaustive role matrix — SuperAdmin is the cheapest passing seed for all 6 (see Auth model).
  One OwnerAdmin/StoresAdmin variant is included only to prove the class-level feature path and
  the approve/disapprove 403.

## Auth model (the critical piece — read before the cases)

`[HasPermission(SuperAdmin, StoresAdmin)]` at class level; `approve`/`disapprove` add
`[HasPermission(SuperAdmin)]`. **Permissions are not encoded in the JWT.** `JwtProvider` mints only
`NameIdentifier` (userId) + `Name` (login); `ClaimsTransformerService` recomputes
`super_admin`/`admin`/`reseller`/`tenant_id`/`store_id`/`features` from the **DB on every request**.

Consequences for the harness:
- Mint a token via `IJwtProvider.GenerateToken(userId, login)` for a seeded `User` + a
  `UserRole(RoleId = SuperAdmin = 1, IsActive)`. That single seed **passes all 6 endpoints**,
  including the two SuperAdmin-only ones. Reuse `DbTestHelpers.SeedSuperAdminAsync` verbatim.
- Because `StoreRoleFeatures.SuperAdmin` carries no `[HasFeature]`, **no DB row / feature can ever
  satisfy a SuperAdmin-only method filter**. So `approve`/`disapprove` are unconditionally
  SuperAdmin-only: a valid StoresAdmin/OwnerAdmin token gets **403** there.
- Authorization is DB-live, so a test can flip a seeded user's `UserRole` rows between requests to
  change effective permissions **without re-minting** the token.

## Critical contract facts (pin these, do not assume)

1. **Permission failure is a real HTTP status, not a body.** `HasPermission` sets `ForbidResult` →
   **HTTP 403**. No token at all → **HTTP 401** (there is no `[AllowAnonymous]` here). Both are real
   statuses, distinct from the `ResponseResult` envelope.
2. **`StoreExists` validator failure THROWS.** GetById / Update / Approve / Disapprove validate `Id`
   with `MustAsync(StoreExists)`; failure throws `ValidationException` → **real HTTP 400**. The body
   error `code` is the **FluentValidation property name `"Id"`** (not a domain code), `description` is
   the localized `StoreNotFound` message. **There is no `Store.NotFound` error constant** —
   `StoreErrors` only defines `Store.Inactive` and `Store.NotCreated`. So assert HTTP 400 +
   `errors[0].code == "Id"`, **not 404, not a 200-body, not a `Store.NotFound` code.**
3. **Create's 0-row save RETURNS Failure** → the Ok-wraps-Failure trap: **HTTP 200**,
   `succeeded=false`, `actionCode=400`, error `Store.NotCreated`. (Contrast with #2.)
4. **Update / Approve / Disapprove never return Failure.** They always `Success(saveChanges > 0)`.
   A no-op save (e.g. approving an already-approved store) → **HTTP 200**, `succeeded=true`,
   `data=false`. Assert `data`, not just status.
5. **Tenant query-filter trap.** `GetStoreByIdService` uses `IgnoreQueryFilters()` **only** when
   `IsSuperAdmin && TenantId == DataUtils.DefaultTenant.Id`. Seed the SuperAdmin under the default
   tenant (`SeedSuperAdminAsync` already does), or seed the target store in the same tenant, else
   you get a spurious `Store.NotFound` 400.
6. **PUT route id is authoritative.** The controller rebuilds `UpdateStoreCommand` with the route
   `{id}` and discards the body `Id`. Tests set the route id; body `Id` is ignored.

## Harness reuse + new helpers

Reuse from auth `01`/`02`: `AppTestFactory`, `WebAppFixture` (collection `"e2e"`),
`ApiResponse<T>` / `ApiResponse.Json`, `DbTestHelpers.{HashPassword, SeedSuperAdminAsync,
CleanupTenantCascadeAsync}`. Mint JWTs by resolving `IJwtProvider` from `factory.Services`
(the `/auth/me` pattern from `01`).

New store-specific helpers (seed directly via entity factories for deterministic fixtures, bypassing
the create-command business rules):
- `SeedOwnerAsync(factory, userId, tenantId)` — `Owner` (+ linked `User`) for `CreateStore.OwnerId`
  and `StoreDto.OwnerName`.
- `SeedStoreAsync(factory, tenantId, ownerId, name, approved, isActive, moduleIds)` — `Store`
  (+ `StoreModule` rows).
- `SeedStoresAdminUserAsync(factory, login, password, storeId)` — `User` + `UserRole(OwnerAdmin,
  TenantId==User.TenantId, IsActive)` + `User.SelectedStoreId = storeId` + an active `Management`
  `StoreModule` on that store (for the class-level StoresAdmin path and the approve/disapprove 403).
- `CleanupStoreAsync(factory, storeId)` — finer-grained per-test cleanup than the tenant cascade.
- Confirm which `Module`/`Feature`/`SystemConfiguration` rows come from migrations vs need seeding
  (open item, inherited from `01`).

Suggested layout: `SMCA.WebApi.E2ETests/Stores/` folder, one xUnit class per endpoint
(`StoresByCurrentUserTests`, `StoreGetByIdTests`, `StoreCreateTests`, `StoreUpdateTests`,
`StoreApproveTests`, `StoreDisapproveTests`). Each write-heavy test cleans up in a `finally`.

---

## Endpoint 1 — GET `api/v1/stores/by-current-user`

No validator, no method-level permission, no failure branch in the handler.
`ResponseResult<IEnumerable<StoreDto>>`. SuperAdmin branch returns all stores
(`IgnoreQueryFilters`, excluding `DataUtils.DefaultStore.Id`); note it returns **inactive stores too**
(`includeInactive` is hard-coded `true`).

- **Happy:** SuperAdmin + 2 seeded stores → 200, `succeeded=true`, list contains both, excludes the
  default store. `StoreDto` has `OwnerName` (from `Owner.User.FullName`) and `Modules`.
- **Edge:** SuperAdmin with only the default store seeded → 200, empty list (default filtered out).
  Seed one **inactive** store → it still appears (pins the hard-coded `includeInactive=true`).
- **Error:** no token → 401; valid token whose user has no SuperAdmin/StoresAdmin grant → 403.
- **Integration:** DB-live claim resolution — the SuperAdmin branch reaches stores across tenants
  (IgnoreQueryFilters); seed a store in a non-default tenant and confirm it is returned.

## Endpoint 2 — GET `api/v1/stores/{id}`

Validator `Id`: `NotEmpty` + `MustAsync(StoreExists)`. Handler always `Success(StoreDto)` once valid.

- **Happy:** seed a store under the default tenant → GET `{id}` → 200, `StoreDto` fields match
  (Name, Address, OwnerName, Modules, Approved, IsActive).
- **Edge:** verify `StoreDto.NextPaymentDate` — it has no backing entity property/mapping and likely
  serializes as `default` (0001-01-01). Assert the actual value rather than assuming a computed one
  (Risks). 
- **Error:** unknown `{id}` → **HTTP 400**, `errors[0].code == "Id"`, description localized
  `StoreNotFound` (validator THROWS — NOT 404, NOT a 200-body, NOT a `Store.NotFound` code; see
  contract fact #2). Empty/`Guid.Empty` id → 400. No token → 401; non-privileged token → 403.
- **Integration:** tenant query-filter trap (fact #5) — a store seeded under the default tenant
  resolves for a default-tenant SuperAdmin; document that a non-default-tenant SuperAdmin would 400.

## Endpoint 3 — POST `api/v1/stores`

Command `CreateStoreCommand(OwnerId, Name, Address?, Description?, Approved, ModuleIds)`.
Validator: `Name` NotEmpty (+ broken uniqueness — see Error), `OwnerId` NotEmpty + `OwnerExists`,
`ModuleIds` NotEmpty + all available to store. Success persists `Store` + `StoreModule` +
`StoreRoleFeature` rows and computes `PaymentStartDate = today + testing-period months`.

- **Happy:** seed `Owner` + at least one available `Module` → POST valid → 200, `succeeded=true`,
  `StoreDto` returned; assert with `IgnoreQueryFilters()` that the `Store`, its `StoreModule` rows,
  and generated `StoreRoleFeature` rows exist, and `PaymentStartDate` ≈ today + configured months.
- **Edge:** OwnerAdmin caller auto-selects the new store (`User.SelectedStoreId = store.Id`) — cover
  only if the OwnerAdmin variant is seeded; otherwise note as deferred. 0-row save → contract fact #3
  (HTTP 200, `succeeded=false`, `actionCode=400`, `Store.NotCreated`) — hard to trigger naturally,
  document as the known Failure shape rather than forcing it.
- **Error:** missing `Name` / `OwnerId` / `ModuleIds` → 400 (validator THROWS). `OwnerId` not
  existing → 400. `ModuleIds` not available to store → 400. No token → 401; non-privileged → 403.
- **Error / KNOWN BUG (pin):** create two stores with the **same `Name`** (distinct valid owners) →
  **both return 200 succeeded** — store-name uniqueness is not enforced on create
  (`IsUniqueName` checks `User.Login`, not `Store.Name`; the correct `IStoreRepository.IsUniqueNameAsync`
  is never called). Test comment: **KNOWN BUG** — when fixed, the second create should fail and this
  test must be updated.
- **Integration:** full `CreateStoreService` pipeline (modules + role-feature generation + payment
  date from `SystemConfiguration`).

## Endpoint 4 — PUT `api/v1/stores/{id}`

Command carries `(Id, Name, Address?, Description?, Approved, PaymentStartDate?, ModuleIds, IsActive)`;
route `{id}` overrides body `Id` (fact #6). Validator: `Id` `StoreExists`, `Name` NotEmpty,
`ModuleIds` available. Handler is all-THROW on failure, always `Success(bool)` on success.

- **Happy:** seed a store → PUT with route id + valid body (as **SuperAdmin, include
  `PaymentStartDate`**) → 200, `succeeded=true`, `data=true`; assert `Name`/`Address` changed and
  module reconciliation applied.
- **Edge:** body `Id` ≠ route `{id}` → the route wins (fact #6); assert the route store changed and
  the body-id store did not. No-op update (same values) → 200, `succeeded=true`, `data=false`
  (fact #4). For an **OwnerAdmin** author, `Description`/`Approved`/`IsActive`/`PaymentStartDate` are
  silently ignored (Risks) — assert they do **not** change.
- **Edge / KNOWN quirk (pin):** SuperAdmin PUT **omitting `PaymentStartDate`** → **HTTP 400** with the
  misleading message `UserNotFound` (it is really a missing-field rule). Pin current behavior.
- **Error:** unknown route `{id}` → 400, `errors[0].code == "Id"` (validator). `Name` colliding with
  **another** store → the handler does `throw new ValidationException(_localizer["StoreAlreadyExists"])`
  via the **string-message ctor**, whose `Errors` list is **empty** → **HTTP 400 with an empty
  `errors[]`**; assert on status 400 only (there is no code in the body for this path). Missing
  `Name`/`ModuleIds` → 400 (`errors[0].code == "Name"` / `"ModuleIds"`). No token → 401;
  non-privileged → 403.
- **Integration:** module reconciliation — removing a module deactivates its `StoreModule` +
  cascades `StoreRoleFeature` to inactive; adding one generates role features. Seed a store with
  module A, PUT with module B, assert A deactivated and B active.

## Endpoint 5 — POST `api/v1/stores/approve`

Method-level `[HasPermission(SuperAdmin)]`. Command `ApproveStoreCommand(Id)`. Validator `Id`
`StoreExists`. Handler sets `Approved = true`, always `Success(saveChanges > 0)`.

- **Happy:** seed a store `Approved=false` → POST `{Id}` → 200, `succeeded=true`, `data=true`; assert
  `store.Approved == true` in DB.
- **Edge:** approve an already-approved store → 200, `succeeded=true`, `data=false` (0-row change,
  fact #4).
- **Error:** unknown `Id` → 400, `errors[0].code == "Id"` (validator). No token → 401.
- **Error / KEY pin:** a token whose user is **StoresAdmin/OwnerAdmin but NOT SuperAdmin** → **403**
  (method-level SuperAdmin-only; the class-level StoresAdmin is insufficient; no feature can grant
  it). Use `SeedStoresAdminUserAsync`.
- **Integration:** SuperAdmin-only enforcement is real authorization, not a body error.

## Endpoint 6 — POST `api/v1/stores/disapprove`

Mirror of Endpoint 5 (`DisapproveStoreCommand(Id)`, sets `Approved = false`). Same method-level
SuperAdmin-only filter, same validator/THROW semantics, same always-`Success(bool)` return.

- **Happy:** seed a store `Approved=true` → disapprove → 200, `succeeded=true`, `data=true`; assert
  `store.Approved == false`.
- **Edge:** disapprove an already-disapproved store → 200, `succeeded=true`, `data=false`.
- **Error:** unknown `Id` → 400, `errors[0].code == "Id"`; no token → 401; StoresAdmin-not-SuperAdmin
  token → 403.
- **Integration:** same SuperAdmin-only enforcement as approve.

---

## Role access matrix (all endpoints — class-level `[HasPermission(SuperAdmin, StoresAdmin)]`)

Every stores endpoint enforces the same class-level filter; approve/disapprove add method-level
SuperAdmin-only. Covered end-to-end (see the implementation plan Tasks 7-8):

| Caller | Class-level (all endpoints) | approve / disapprove (method-level) |
|---|---|---|
| SuperAdmin | pass (bypass) | pass |
| OwnerAdmin/StoresAdmin (selected store has active Management module) | **pass** | **403** |
| StoreUser (no Stores `StoreRoleFeature`) | **403** | 403 |
| ReSeller (only Owners feature) | **403** | 403 |
| No token | **401** | 401 |

All validator failures across the 5 stores validators surface as **HTTP 400** with
`errors[].code` = the property name (`"Id"` / `"Name"` / `"OwnerId"` / `"ModuleIds"`).

## Data isolation

- Reuse `DbTestHelpers.CleanupTenantCascadeAsync` (FK order: StoreRoleFeature → StoreModule → Store
  → UserRole → Owner → User → Tenant, all `IgnoreQueryFilters`) for tests that go through the real
  create pipeline; use `CleanupStoreAsync` for directly-seeded stores.
- Unique random `Name`/`login` per test to avoid unique-index / collision flakiness across runs.
- Seed the SuperAdmin under `DataUtils.DefaultTenant.Id` (sidesteps the query-filter trap and is
  the cheapest passing seed).

## Risks

- **Harness not yet on disk:** `backend/src/SMCA.WebApi.E2ETests/` does **not exist** — the `01`/`02`
  docs are unimplemented plans whose `AppTestFactory`/`WebAppFixture`/`ApiResponse`/`DbTestHelpers`
  live as code blocks inside `02`. This stores plan **depends** on materializing that harness first
  (implement `01`/`02`, or at minimum create the Infrastructure files) before any store test runs.
- **Confirmed bugs pinned, not fixed:** (a) create store-name uniqueness checks `User.Login`
  (duplicate store names allowed); (b) SuperAdmin PUT without `PaymentStartDate` → 400 `UserNotFound`
  (misleading); (c) OwnerAdmin PUT silently drops `Description`/`Approved`/`IsActive`/`PaymentStartDate`.
  When any is fixed, the corresponding pin test fails by design and must be updated.
- **`StoreDto.NextPaymentDate`** has no backing property/mapping → likely `default`; verify before
  asserting on it.
- **Shared `smca_test` DB** (inherited from `01`): no per-run ephemeral DB → keep single-user/local;
  every write-heavy test cleans up in a `finally`.
- **Query-filter trap** (fact #5): asserting against the wrong tenant produces false `Store.NotFound`.

## Open items to verify during implementation

- Which `Module` / `Feature` / `SystemConfiguration` rows are migration-seeded vs need explicit
  seeding for create/update `ModuleIds` validation and `PaymentStartDate` computation.
- Confirm `IJwtProvider.GenerateToken(userId, login)` signature and the claim
  `ClaimsTransformerService` reads for `UserExternalId` / userId.
- Confirm `RoleType.SuperAdmin == 1` and that `SeedSuperAdminAsync` writes `UserRole.IsActive = true`.
- Confirm the response envelope casing after camelCase serialization
  (`succeeded`, `data`, `actionCode`, `errors[].code`) and `StoreDto` field casing.
- Error-code contract (verified): validator not-found/required failures → `errors[].code` = the
  property name (`"Id"`, `"Name"`, `"OwnerId"`, `"ModuleIds"`); create 0-row save → `Store.NotCreated`
  (HTTP 200 + actionCode 400); update name-collision → `ValidationException(string)` with empty
  `errors[]` (HTTP 400, status-only). `StoreErrors` defines only `Store.Inactive` / `Store.NotCreated`
  — no `Store.NotFound`.
