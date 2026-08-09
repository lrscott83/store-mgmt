# Exploration — e2e-stage-1-s1-01-backend

> Phase: sdd-explore · Date: 2026-08-07 · Mode: both (OpenSpec + Engram) · Strict TDD: active
>
> Sources audited: `docs/testing/e2e-stage-1/S1-01.md`, `docs/testing/e2e-stage-1/S1-01-backend.md`,
> `backend/src/SMCA.WebApi.E2ETests/` (full suite grep), `RegisterCommand.cs`,
> `ModuleRepository.cs`, `CreateStoreService.cs`, `ModuleEntityTypeConfiguration.cs`,
> `ReSellerRepository.cs`, entities `Module/Store/StoreModule/Owner/User/ReSeller/ReSellerOwner`,
> `DbTestHelpers.cs`, `StoreCreationTrialTests.cs`, `AuthTokenLifetimeTests.cs`,
> `AuthLoginOwnerAdminTests.cs`, `TestDtos.cs`.

## Verdict on the audit

**The audit (`S1-01-backend.md`) is CONFIRMED on all 6 claims.** The US file
(`S1-01.md`) marks 8 backend assertions `[x]`; only 2 (`PaymentStartDate`, `ExpiresIn`) are
actually covered by E2E tests. The other 6 describe production behavior in
`RegisterCommand.cs` that no E2E test asserts. `AuthRegisterSuccessTests.cs` asserts only:
201 Created, `Succeeded`, `login` returned, `AuthToken` non-empty, `ExpiresIn` after now,
and existence of an `Owner` + `Store` row for the tenant — nothing else.

## Confirmed assertions map

| # | US assertion | Covered? | Evidence (code) | Evidence (tests) |
|---|---|---|---|---|
| 1 | `owner.User.SelectedStoreId` == new store id after `POST /v1/auth/register` | **NO** | `RegisterCommand.cs:91` | `SelectedStoreId` asserted only off the register path: `StoreCreateAuthorizationGapTests.cs:51-52` (admin re-point), `AuthMePermissionsTests.cs:72` (after manual seed), `StoreCreationTrialTests.cs:517` (after manual `SetSelectedStoreIdAsync` at `:509`, helper at `:187-198`). `AuthLoginOwnerAdminTests.cs:25` mentions it only in a comment; its tests assert login/token, never the DB value. |
| 2 | Owner `Description` == `"Nombre de la tienda: " + storeName` | **NO** | `RegisterCommand.cs:67` | Grep of literal `Nombre de la tienda` across `SMCA.WebApi.E2ETests`: **0 matches**. |
| 3 | Store `description = "Tienda de prueba"` and `approved = false` | **NO** | `RegisterCommand.cs:82-83` | Grep of literal `Tienda de prueba` across `SMCA.WebApi.E2ETests`: **0 matches**. `AuthRegisterSuccessTests.cs:60-61` asserts only row existence (`AnyAsync`). |
| 4 | Store receives ALL modules from `GetAvailableModulesToStore()` incl. paid (**H-1**) | **NO (direct)** | `RegisterCommand.cs:73,81-83`; filter `ModuleRepository.cs:17-23`; store-module creation `CreateStoreService.cs:46-61` | No test links the `StoreModules` set to registration. Indirect signals only: `StoreCreationTrialTests.cs:359-361` (`PlanType=="Paid"`) and `:624-628` (payment = 6×500 from StoreModules) — billing effects, never the module-set equality. |
| 5 | `AuthDto` has NO refresh token | **NO** | `RegisterCommand.cs:132` returns `new AuthDto(login, token, expiresAt)`; default null at `AuthDto.cs:7` | `AuthRefreshTokenLifetimeTests.cs:44,60-62` (login HAS refresh token) and `:86,111-113` (refresh endpoint) — nothing asserts register's absence. `TestDtos.cs:12-13` already models the fields. |
| 6 | Matching `code` creates a `ReSellerOwner` | **NO** | `RegisterCommand.cs:93-119` (`ReSellerOwner.Create` at `:110`); match is `r.User.Login == code` at `ReSellerRepository.cs:34-40` | `ReSellerOwner` appears only in hand-seeded billing tests: `GetReSellerCommissionsTests.cs:62-63`, `RegisterStorePaymentTests.cs:62-63`, `BillingSeed.cs:124`. Never as a register effect. |

**Already covered (verified, do NOT re-verify):**
- `PaymentStartDate = today` → `StoreCreationTrialTests.cs:331-332` (`Register_creates_store_with_paymentStartDate_today`, uses clock pin + `RegisterStoreAsync`).
- `ExpiresIn = UtcNow + TokenLifetimeDays` → `AuthTokenLifetimeTests.cs:69-95` (`Register_returns_a_token_that_expires_in_35_days`, asserts reported `ExpiresIn` AND JWT `ValidTo`).

## What "all modules" means (assertion 4)

`GetAvailableModulesToStore()` (`ModuleRepository.cs:17-23`) returns modules where
`IsActive && AvailableToStore && Features.Any(f => f.IsActive && f.AvailableToStore)`,
ordered by `PriceIncluded` desc, then `Order`.

Seeded catalog (`ModuleEntityTypeConfiguration.cs:32-149`, applied via migrations — `WebAppFixture`
applies migrations itself, so the catalog exists in the E2E DB):
- Administration (1): `availableToStore: false` → **never qualifies**.
- Free (`PriceIncluded: true`, price 0): Sales (2), Inventory (3), Synchronization (4), Management (7).
- Paid (`PriceIncluded: false`, price 2000): Reports (5), Statistics (6), Expenses (8), Billing (9), Histories (10), Credits (11).

`StoreCreationTrialTests.cs:624-626` pins the **6 paid** modules as qualifying (5,6,8,9,10,11).
The exact qualifying set is a **runtime fact** (features come from a separate seed, and the module
list already changed once via migration `20260306191127_Update-Module-Prices`). A new test MUST NOT
hardcode a count — it must derive the expected set at runtime (replicate the filter in the query, or
use `GET /api/v1/modules/available-to-store`, `ModulesController.cs:22-24`), assert set equality with
the store's `StoreModules`, and additionally assert **at least one paid module** (`PriceIncluded == false`)
is present — that is the H-1 regression this change exists to catch.

## How to assert modules from DB (assertion 4 mechanics)

- Tables: `StoreModule` (`StoreModule.cs:8-42`: `StoreId`, `ModuleId`, `Price`, `ModulePriceIncluded`, `TenantId`), `Module` (`Module.cs:8-49`: `PriceIncluded`, `Price`, `IsActive`, `AvailableToStore`).
- Store navigates `Store.StoreModules` (`Store.cs:24`); `StoreModule.Module` navigation exists (`StoreModule.cs:13`).
- Read pattern (established): `scope` → `ApplicationDbContext` → `db.Set<StoreModule>().IgnoreQueryFilters().AsNoTracking().Where(sm => sm.StoreId == storeId)`, join to `Module` for `PriceIncluded`/`Price`.
- Registration creates an isolated tenant per call — scope the store lookup by `user.TenantId` (`StoreCreationTrialTests.cs:166-168` pattern).

## Stack & conventions observed

- xUnit; `[Collection("e2e")]`; constructor-injected `WebAppFixture` → `_factory` (`AppTestFactory`) + `_client`.
- Register payload: `new { Login, Password, FullName, CellPhone, Email, StoreName, Code }`; response deserialized via `ApiResponse<AuthDto>` (`ApiResponse.Json`) or `ApiResponse<AuthData>`.
- DB assertions: `_factory.Services.CreateScope()` → `ApplicationDbContext`; `IgnoreQueryFilters().AsNoTracking()` on every read; `DbTestHelpers.GetUserByLoginAsync(_factory, login)` → `TenantId`.
- Cleanup: `DbTestHelpers.CleanupTenantCascadeAsync(_factory, tenantId)` (removes StoreRoleFeature, StoreModule, Store, UserRole, Owner, User, Tenant by TenantId — **NOT ReSellerOwner**); `CleanupUserAsync` DOES remove ReSellerOwner (`DbTestHelpers.cs:93-97`).
- NoTracking trap (CLAUDE.md): reads are untracked; writes need `db.Set<T>().Update(...)` (`StoreCreationTrialTests.cs:187-198`, `UpdateUserCommand.cs:59-62`).
- Existing auth-register files: `AuthRegisterSuccessTests.cs`, `AuthRegisterValidationTests.cs`, `AuthRegisterDuplicateTests.cs`, `AuthTokenLifetimeTests.cs` — new file next to them fits the convention.

## Recommended test approach

**New file `Auth/AuthRegisterDataAssertionsTests.cs`** (namespace `SMCA.WebApi.E2ETests.Auth`) —
do NOT extend `AuthRegisterSuccessTests.cs`: modifying an existing E2E test requires explicit user
authorization (CLAUDE.md); a new file is additive and does not. One `[Fact]` per assertion area
(6 tests), each following the register → read-DB → `CleanupTenantCascadeAsync` pattern:

1. `Register_sets_SelectedStoreId_to_new_store_id` — load `User` by login, `Store` by `TenantId`, assert `user.SelectedStoreId == store.Id`.
2. `Register_composes_owner_description_from_store_name` — assert `owner.Description == $"Nombre de la tienda: {storeName}"`.
3. `Register_creates_store_with_test_description_and_not_approved` — assert `store.Description == "Tienda de prueba"` and `store.Approved == false`.
4. `Register_assigns_all_available_modules_including_paid` — derive expected ids at runtime (filter replication or endpoint), compare `StoreModules` ids as sets, assert ≥1 paid module.
5. `Register_response_has_no_refresh_token` — assert `body.Data.RefreshToken` is null (and `RefreshTokenExpiresAt` null) — trivially possible on the existing `ApiResponse<AuthDto>`/`ApiResponse<AuthData>` shape (`TestDtos.cs:12-13`).
6. `Register_with_reseller_code_creates_ReSellerOwner` — seed a ReSeller user (login = code), register with `Code = login`, assert a `ReSellerOwner` row exists with `ReSellerId`, `OwnerId`, and discount fields copied from the ReSeller (`RegisterCommand.cs:110`).

Also part of the change scope (docs, no test touched): correct the 6 checkboxes in
`docs/testing/e2e-stage-1/S1-01.md` (lines 53-59) from `[x]` to `[ ]` (or annotate
"behavior verified by code reading, no E2E test"), per the audit's section "Corrección al propio
fichero de la US".

## Risks & edge cases

1. **ReSellerOwner cleanup gap**: `CleanupTenantCascadeAsync` (`DbTestHelpers.cs:108-123`) does NOT delete ReSellerOwner, and the FK `ReSellerOwner → Owner` is `DeleteBehavior.Restrict` (`ReSellerOwnerEntityTypeConfiguration.cs:29`). After a ReSeller-code register test, the tenant cleanup would hit an FK violation or leak the row. Test must delete ReSellerOwner explicitly (pattern `RegisterStorePaymentTests.cs:120-121`) before tenant cleanup, and clean the seeded ReSeller + its User separately (it lives in the seed tenant, not the registered one; pattern `GetReSellerCommissionsTests.cs:124-125`). Note `IX_ReSellerOwner_OwnerId` is UNIQUE (`:23`) — one ReSellerOwner per owner.
2. **Module-list stability**: the qualifying set is runtime-derived (migration `20260306191127` already changed prices; the filter depends on the Feature seed). Hardcoding counts makes the test brittle and defeats H-1's purpose. Derive expected ids at runtime.
3. **Tenant scoping**: each registration creates a fresh tenant; store lookups must be scoped to `user.TenantId` (`StoreCreationTrialTests.cs:166-168`), never `FirstAsync` on the whole table.
4. **NoTracking trap**: all DB reads must use `AsNoTracking()` (or accept untracked defaults); nothing in the new tests writes, so no `Update()` needed — but the trap applies if a helper mutates a loaded row.
5. **Clock pinning**: `PaymentStartDate`/`ExpiresIn` are already covered and do not need re-assertion; if any new test needs "today", respect the two-pin trap (`StoreCreationTrialTests.cs:24-37`).
6. **Endpoint auth gating**: if assertion 4 uses `GET /api/v1/modules/available-to-store` instead of a DB filter replication, verify its authorization requirements during design (it may be admin-gated via `ModulesController`); the DB-filter approach avoids that dependency.

## Recommended change name

`e2e-stage-1-s1-01-backend` — matches the branch (`feat/e2e-stage-1-s1-01-backend`) and the audit's
deferred-work plan. Scope: add new E2E file (6 assertions) + US doc checkbox correction. No existing
test or production code modified.

## Ready for proposal

**Yes.** The 6 gaps are confirmed with file:line evidence, the approach (new file, additive) complies
with the CLAUDE.md E2E rule, and all required helpers/patterns exist. The orchestrator should tell the
user: (a) the audit is accurate; (b) the only thing needing explicit authorization is NOT present —
no existing test is touched; (c) the ReSellerOwner cleanup gap (`DbTestHelpers`) is a real design
decision to surface in the design phase.
