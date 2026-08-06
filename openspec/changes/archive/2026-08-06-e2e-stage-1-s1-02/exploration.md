# Exploration: S1-02 — Inactive store login returns 403 `Store.Inactive` (missing .NET E2E coverage)

Change: `e2e-stage-1-s1-02` · Branch: `feat/e2e-s1-02` · Artifact: explore (read-only)

## Current State

The user story's claim (docs/testing/e2e-stage-1/S1-02.md:72) is **verified against real code**. `Store.Inactive` IS reachable through `POST /api/v1/auth/login` (route prefix `api/` in the E2E suite) and is genuinely untested.

Login flow:

1. `POST /api/v1/auth/login` → `LoginCommandHandler.Handle` (`Application/Features/Authentication/Commands/Login/LoginCommand.cs:45`) calls `IAuthenticationService.IsValidUserAsync`.
2. `AuthenticationService.IsValidUserAsync` (`Application/Services/Authentication/AuthenticationService.cs:32-94`):
   - `:41-45` — inactive USER → `UserErrors.AccountInactive` (the branch already covered by E2E).
   - `:68-77` — inactive reseller → `AccountInactive`; `:79-84` — inactive owner → `AccountInactive`.
   - `:86-91` — `HasActiveStore(user)` failure returns its errors (flows to `Store.Inactive`).
3. `MapErrorToStatusCode` (`LoginCommand.cs:75-94`): `:84-86` maps BOTH `"Auth.AccountInactive"` and `"Store.Inactive"` → **403 Forbidden**. The switch/key matches the US exactly.
4. Error code string confirmed: `StoreErrors.Inactive = new("Store.Inactive", "Invalid credentials")` (`Domain/Entities/Stores/StoreErrors.cs:7`).

**Store resolution during login**: NOT via `user.SelectedStoreId`. The store comes from the `User → StoreUser → Store → Owner` nav graph loaded by `UserRepository.GetByLoginWithRelatedAsync` (`Infrastructure/Persistence/Repositories/UserRepository.cs:83-97`) **with `.IgnoreQueryFilters()`** (`:95`), so inactive rows ARE loaded and `store.IsActive` is genuinely evaluated — the branch is not dead code.

**What makes a store "inactive"**: `Store`/`Owner`/`User`/`StoreUser` have no own `IsActive`; it is inherited from `AuditableEntity` (`Domain/Common/Entities/AuditableEntity.cs:7,22`), default `true`. An "inactive store" is a soft-deleted row (`IsActive = false`).

**Where `Store.Inactive` originates** (`AuthenticationService.HasActiveStore`, `:96-137`):
- `:98-100` SuperAdmin → always success (bypasses store check).
- `:102-115` OwnerAdmin branch: `:109-110` no `StoreUser.Store` → `Store.Inactive`; `:112-114` `store.IsActive && store.Owner?.IsActive == true` else `Store.Inactive` (THE branch to cover).
- `:117-136` StoreUser branch: `:121-122` `!storeUser.IsActive`; `:124-125` no store; `:127-128` `!store.IsActive`; `:130-134` owner null/inactive → all `Store.Inactive`.

**Zero coverage confirmed** (grep over `backend/src/SMCA.WebApi.E2ETests/**/*.cs`): `Store.Inactive` → 0 matches, `StoreInactive` → 0 matches, `Store.IsActive` → 0 matches. The `IsActive = false` hits are unrelated to login: payload fields (`StoreAuthorizationTests.cs:64`, `UsersActivateTests.cs:29`, `UsersUpdateTests.cs:193,235`), user-inactive seeds (`DbTestHelpers.cs:68`, `UserSeed.cs:75`), owner-inactive seed (`OwnersListGapTests.cs:32`), and the helper `StoreSeed.DeactivateStoreAsync` (`StoreSeed.cs:114`) which exists but is never used in an auth/login test.

## Affected Areas

- `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginFailureTests.cs` — the ONLY file to change during apply: add one (or two) new `[Fact]`s. Existing tests at `:21-40` (401) and `:42-61` (403 account-inactive) must not be touched (CLAUDE.md rule).
- Seeds/helpers — all already exist, **zero changes needed**: `UserSeed.SeedOwnerAdminWithStoreAsync` (`UserSeed.cs:45-65`), `StoreSeed.DeactivateStoreAsync` (`StoreSeed.cs:109-116`), `AuthzSeed.CleanupStoreGraphAsync` (`AuthzSeed.cs:106-123`), `AuthzSeed.SeedStoreUserAsync` (`AuthzSeed.cs:74-104`, StoreUser persona option).
- `docs/testing/e2e-stage-1/S1-02.md:72,80` — the 🆕 assertion and "FALTA" line to flip to covered after verify (docs touch, not E2E tests).
- `openspec/changes/e2e-stage-1-s1-02/` — this exploration artifact.

## Approaches

1. **Single OwnerAdmin Fact** — mirror `AuthLoginFailureTests.cs:43-61`: seed `SeedOwnerAdminWithStoreAsync`, deactivate store via `StoreSeed.DeactivateStoreAsync`, POST login, assert 403 + `Succeeded=false` + single error `Code == "Store.Inactive"`, cleanup `AuthzSeed.CleanupStoreGraphAsync(_f, fixture.StoreId, fixture.UserId)`.
   - Pros: minimal, exercises the exact `:112-114` branch, matches existing test style byte-for-byte.
   - Cons: covers only the OwnerAdmin persona branch of the US (S1-02 also names StoreUser).
   - Effort: Low (~25 lines, purely additive).

2. **Two Facts (OwnerAdmin + StoreUser)** — add a second Fact seeding `AuthzSeed.SeedStoreUserAsync` + `DeactivateStoreAsync`, exercising `:127-128`.
   - Pros: covers both personas the US declares (`OwnerAdmin y StoreUser`); guards the second `store.IsActive` branch too.
   - Cons: two seeds per test (owner user + store user) — slightly more code; strictly only ONE new test is needed to close the documented gap.
   - Effort: Low (~50 lines).

## Recommendation

**Approach 1**, optionally extended with the StoreUser Fact (Approach 2) — both are cheap. Critical seed-selection trap: use `UserSeed.SeedOwnerAdminWithStoreAsync` (creates the `StoreUser` row at `UserSeed.cs:61`), NOT `StoreSeed.SeedStoresAdminUserAsync` — that seed (`StoreSeed.cs:53-72`) creates User+Owner+Store+OwnerAdmin role but **no `StoreUser` row**, so login would fail at `AuthenticationService.cs:109-110` with `Store.Inactive` even when the store is ACTIVE (test would pass for the wrong reason and prove nothing about the `IsActive` branch). Password for both fixtures is `"Password123"` (hashed with `DbTestHelpers.HashPassword`, same pepper as the app under test — `DbTestHelpers.cs:26-44`).

## Risks

- E2E suite requires PostgreSQL on `localhost:5432` (db `smca_test`); the new test needs the DB up to run.
- Cleanup MUST use `AuthzSeed.CleanupStoreGraphAsync` (removes StoreUser → Store → Owner → User in FK-safe order). `DbTestHelpers.CleanupUserAsync` alone would delete Owner first and strand Store/StoreUser rows (FK `Owner_User_UserId`).
- Non-negotiable rule: only ADD tests; do not modify `AuthLoginFailureTests.cs` existing Facts or any other E2E test.
- H-12 (README.md:246-259): rate limit is off under `Testing` — the OTHER missing S1-02 assertion (429) is unreachable from the .NET suite; do not attempt it here.

## Ready for Proposal

Yes — gap confirmed, branch reachable, seeds and cleanup helpers already exist, minimal test shape is fully specified above.

## Evidence

- `Application/Features/Authentication/Commands/Login/LoginCommand.cs:84-86` — switch: `"Auth.AccountInactive" or "Store.Inactive"` → 403; `:89-90` — `"Auth.InvalidCredentials"` → 401.
- `Application/Services/Authentication/AuthenticationService.cs:41-45` (user inactive → AccountInactive), `:86-91` (HasActiveStore failure → errors flow out), `:102-115` (OwnerAdmin branch; `:109-110` no StoreUser.Store; `:112-114` store.IsActive && owner.IsActive), `:117-136` (StoreUser branch; `:121-122,124-125,127-128,130-134`).
- `Infrastructure/Persistence/Repositories/UserRepository.cs:83-97` — `GetByLoginWithRelatedAsync` loads `StoreUser → Store → Owner → User` + roles with `IgnoreQueryFilters` (`:95`).
- `Domain/Entities/Stores/StoreErrors.cs:7` — `Inactive = new("Store.Inactive", ...)`.
- `Domain/Common/Entities/AuditableEntity.cs:7,22` — `IsActive { get; set; } = true` (soft-delete flag; Store/Owner inherit it).
- `SMCA.WebApi.E2ETests/Auth/AuthLoginFailureTests.cs:43-61` — existing inactive-ACCOUNT Fact: `SeedInactiveUserAsync` (:46), POST `/api/v1/auth/login` (:49-50), 403 (:52), `Errors.ContainSingle(e => e.Code == "Auth.AccountInactive")` (:55), cleanup `CleanupUserAsync` (:59). `:21-40` — wrong-password 401 pattern.
- Envelope: `Infrastructure/ApiResponse.cs:5-18` — `Succeeded`, `Data`, `Errors[].Code/Description`, `ActionCode`; asserted with `ApiResponse.Json` options (:22). `AuthLoginTests.cs:42` shows `ActionCode` assertion for 401.
- `Infrastructure/DbTestHelpers.cs:61-75` — `SeedInactiveUserAsync` (user.IsActive=false + SuperAdmin role); `:46-59` — `SeedSuperAdminAsync`; `:84-106` — `CleanupUserAsync` (Owner first, FK note).
- `Infrastructure/UserSeed.cs:45-65` — `SeedOwnerAdminWithStoreAsync`: User+Owner+Store+StoreModule+OwnerAdmin role+**StoreUser row** (:61)+SelectedStoreId (:62); returns `UserWithRolesFixture(UserId, Login, OwnerId, StoreId, RoleIds)`.
- `Infrastructure/StoreSeed.cs:109-116` — `DeactivateStoreAsync` (IgnoreQueryFilters + AsTracking, sets `s.IsActive = false`); `:53-72` — `SeedStoresAdminUserAsync` (NO StoreUser row — wrong seed for login).
- `Infrastructure/AuthzSeed.cs:74-104` — `SeedStoreUserAsync` (full owner+store+StoreUser graph, returns fixture with login, storeId, ownerUserId); `:106-123` — `CleanupStoreGraphAsync(storeId, params userIds)`.
- `docs/testing/e2e-stage-1/S1-02.md:72` — the 🆕 assertion (grep-verified gap); `:80` — "FALTA: tienda inactiva → 403"; `docs/testing/e2e-stage-1/README.md:246-259` — H-12 (rate limit off under `Testing`); README `:276` — "Store.Inactive → 403: Negativo documentado: el mapeo existe, ningún test lo cubre".
