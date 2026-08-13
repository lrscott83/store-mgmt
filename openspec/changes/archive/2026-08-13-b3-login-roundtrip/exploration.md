# Exploration — b3-login-roundtrip

**Change**: `b3-login-roundtrip` (B-3 from `docs/testing/e2e-stage-1/plan-backend.md`)
**Date**: 2026-08-13
**Mode**: READ-ONLY investigation; no code/test/doc modified
**Scope rule carried**: backend work may only ADD new E2E tests; existing E2E tests (backend + frontend, incl. `e2e/support/*.ts`) are untouchable without explicit user authorization.

## Headline finding

**B-3 is ALREADY DONE.** The StoreUser and ReSeller real-login roundtrips were delivered by the archived SDD change `e2e-b3-auth-login-roundtrip` (archived `openspec/changes/archive/2026-08-09-e2e-b3-auth-login-roundtrip/`, verify verdict PASS, 7/7 scenarios, 2/2 requirements, 14/14 tasks, 87/87 `~Auth` regression on real PostgreSQL). The two test files are ancestors of the current HEAD (`feat/login-wrapped-dek`):

- `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginStoreUserTests.cs` — commit `a78a0578` (2026-08-09)
- `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginReSellerTests.cs` — commit `0b2bf0cb` (2026-08-09)

The `plan-backend.md` B-3 table (last touched `042baf54` 2026-08-09 17:38) predates those commits (18:32) — the plan's "falta" columns for StoreUser/ReSeller are STALE. The openspec main specs `auth-login-e2e` (Req 2 DELIVERED note) and `auth-login-reseller-e2e` (R1–R3) already carry the delivery notes.

What REMAINS is a narrow residual: **StoreUser branches 2 and 3 of `HasActiveStore` are still unexercised over HTTP** (branch 2 = `!storeUser.IsActive`; branch 3 = `storeUser.Store is null` — the latter is a DB-impossible state, FK-required). Branch 1 (`storeUser is null`, role-only StoreUser with no StoreUser row) is the same MintToken blind-zone shape already pinned for ReSeller (D6) but NOT for StoreUser. The ReSeller persona has full real-login coverage (positive, inactive-row, role-only blind-zone pin).

## Current State

### Login flow (what `POST /api/v1/auth/login` does)

1. `LoginCommandHandler.Handle` (`backend/src/Application/Features/Authentication/Commands/Login/LoginCommand.cs:57-95`):
   - Calls `IAuthenticationService.IsValidUserAsync(login, password)` — the whole persona gate.
   - On success mints JWT via `IJwtProvider.GenerateToken(userId, login)` (`:68`), persists a refresh token (`:71-75`), builds the wrapped DEK tuple (`:77`, `TryBuildLoginDekWrapAsync` `:104-131`), returns `AuthDto`.
2. `AuthenticationService.IsValidUserAsync` (`backend/src/Application/Services/Authentication/AuthenticationService.cs:32-94`):
   - `:34` load user by login with related; `:41` `!user.IsActive` → `Auth.AccountInactive`; `:47` password verify → `Auth.InvalidCredentials`; `:53-66` offline pre-hash backfill (opportunistic, failures swallowed).
   - `:68-77` **ReSeller short-circuit**: `user.ReSeller != null` → inactive row → `Auth.AccountInactive`; else **success immediately — no store graph needed**.
   - `:79-84` Owner inactive → `Auth.AccountInactive`.
   - `:86-91` → `HasActiveStore(user)`.
3. `AuthenticationService.HasActiveStore` (`:96-145`) — verbatim conditions:

   ```csharp
   bool isGlobalAdmin = user.UserRoles?.Any(ur => ur.Role?.Id == (int)RoleType.SuperAdmin) ?? false;   // :98
   if (isGlobalAdmin) return Result.Success();                                                          // :99-100

   bool isStoreAdmin = user.UserRoles?.Any(ur => ur.Role?.Id == (int)RoleType.OwnerAdmin) ?? false;    // :102
   if (isStoreAdmin)                                                                                    // :103
   {
       if (user.Owner is not { } ownerAccount || !ownerAccount.IsActive)                                // :118
           return StoreErrors.Inactive;
       bool hasActiveStore = ownerAccount.Stores?.Any(s => s.IsActive) == true;                        // :121
       return hasActiveStore ? Result.Success() : StoreErrors.Inactive;                                // :122
   }

   var storeUser = user.StoreUser;                                                                      // :125
   if (storeUser is null) return StoreErrors.Inactive;                                                  // :126-127  (branch 1)
   if (!storeUser.IsActive) return StoreErrors.Inactive;                                                // :129-130  (branch 2)
   if (storeUser.Store is not { } activeStore) return StoreErrors.Inactive;                             // :132-133  (branch 3)
   if (!activeStore.IsActive) return StoreErrors.Inactive;                                              // :135-136  (branch 4)
   if (activeStore.Owner is not { } owner) return StoreErrors.Inactive;                                 // :138-139  (branch 5)
   if (!owner.IsActive) return StoreErrors.Inactive;                                                    // :141-142  (branch 6)
   return Result.Success();                                                                             // :144
   ```

4. Error→status mapping (`LoginCommand.cs:133-152`): `Auth.AccountInactive` / `Store.Inactive` → 403; `Auth.InvalidCredentials` → 401; else 400.

### AuthDto shape (`backend/src/Application/Dtos/Authentication/AuthDto.cs:9-17`)

`Login, AuthToken, ExpiresIn, RefreshToken?, RefreshTokenExpiresAt?, WrappedDek="", WrapSalt="", WrapIv=""`. Only the login path populates the DEK wrap fields (`TryBuildLoginDekWrapAsync` — empty when `user.SelectedStoreId == Guid.Empty` or any failure, `LoginCommand.cs:117`).

### JWT claims

`JwtProvider.GenerateToken` (`backend/src/SMCA.WebApi/Authentication/JwtProvider.cs:18-49`) mints claims `NameIdentifier` (userId), `Name` (login), `Jti` only. Tenant/StoreId/role/feature claims are added at request time by `ClaimsTransformerService.TransformAsync` (`backend/src/SMCA.WebApi/Services/ClaimsTransformerService.cs:21-53`) from the DB: `TenantIdClaim = currentUser.TenantId`, `StoreIdClaim = currentUser.SelectedStoreId`, `SuperAdminClaim`, `AdminClaim`, `ReSellerClaim`, `FeaturesClaim`. The token itself carries NO role/store claims — the DB is the source of truth per request.

### ReSeller login semantics

- `ReSeller` entity (`backend/src/Domain/Entities/ReSellers/ReSeller.cs`): `AuditableEntity<Guid>` with `IsActive` (default true), `Approved`, `DiscountPrice`, `PercentDiscountPrice`, `ReSellerOwners` collection. **No store/SelectedStoreId concept on ReSeller.**
- A ReSeller login returns 200 with `AuthDto`; `WrappedDek/WrapSalt/WrapIv` are empty when `SelectedStoreId == Guid.Empty` (the seeded ReSeller fixture sets none). Claims: `ReSellerClaim=true`, `StoreIdClaim` empty.
- Success path requires NO Owner/Store/StoreUser rows (`AuthLoginReSellerTests.Active_re_seller_logs_in_with_no_store_graph`).

### Existing real-login tests per persona (hit `POST /api/v1/auth/login`)

| Persona | File | Facts |
|---|---|---|
| SuperAdmin | `AuthLoginSuccessTests.cs:22` | `Login_with_seeded_super_admin_returns_200_and_token` (1) |
| SuperAdmin | `AuthLoginFailureTests.cs:22,43` | wrong-password 401, inactive user 403 (2) |
| OwnerAdmin | `AuthLoginFailureTests.cs:64` | `Login_with_inactive_store_returns_403` — seeds via `UserSeed.SeedOwnerAdminWithStoreAsync` + `StoreSeed.DeactivateStoreAsync` (1) |
| OwnerAdmin | `AuthLoginOwnerAdminTests.cs:47,99` | register→login 200; inactive-owner 403 (2) |
| **StoreUser** | `AuthLoginStoreUserTests.cs:37,65,91` | active-store 200; store-deactivated 403 `Store.Inactive` (branch 4); store-owner-deactivated 403 `Store.Inactive` (branch 6) (3) |
| **ReSeller** | `AuthLoginReSellerTests.cs:88,115,143` | no-store-graph 200; inactive-row 403 `Auth.AccountInactive`; role-only blind-zone 403 `Store.Inactive` (3) |
| — (wrap) | `AuthLoginDekWrapTests.cs` (6) | StoreUser/OwnerAdmin wrap byte-equal to `GetDek`; first-login backfill; SuperAdmin empty wrap; wrong-password 401 no data; inactive-store 403 no data |
| — (validation) | `AuthLoginTests.cs:17,31`, `AuthLoginValidationTests.cs:24` | empty creds 400; unknown user 401; empty login 400 code `Login` |
| — (other) | `AuthTokenLifetimeTests.cs:39`, `AuthRefreshTokenLifetimeTests.cs:44,92`, `UsersChangePasswordTests.cs:36,44`, `AuthMeDeactivationTests.cs:53` | token lifetime 35d; refresh token; relogin after password change; deactivation login |

### Seed helpers (exact signatures)

- `AuthzSeed.SeedStoreUserAsync(AppTestFactory factory, int? grantedFeatureId)` → `StoreUserFixture(Guid UserId, string Login, Guid OwnerUserId, Guid OwnerId, Guid StoreId, Guid TenantId)` (`AuthzSeed.cs:74-104`): seeds Owner user + Owner + Store + StoreModule + StoreUser role + StoreUser row + `SelectedStoreId = store.Id`. Store and Owner rows default `IsActive=true` (only `approved` arg is the `false` in `Store.Create`). Cleanup: `AuthzSeed.CleanupStoreGraphAsync(factory, storeId, params userIds[])` (`:106-123`).
- `AuthzSeed.SeedOwnerAdminAsync(AppTestFactory factory, bool withManagementModule)` → `OwnerAdminFixture` (`:25-49`). Also `SeedTenantMismatchOwnerAdminAsync` (`:51-72`).
- ReSeller seeding: **no shared helper** — `AuthLoginReSellerTests.SeedReSellerAsync(bool isActive = true)` local to the file (`:47-70`), plus `DbTestHelpers.SeedUserWithRoleAsync(factory, roleId)` for the role-only shape (`:195-205`). Cleanup: local `CleanupReSellerAsync` (`:77-85`, ReSeller row first — FK Restrict, then user).
- `DbTestHelpers`: `HashPassword(string)` (`:48-49`, Argon2id from appsettings.Tests.json), `SeedSuperAdminAsync` (`:51-64`), `SeedInactiveUserAsync` (`:66-80`), `AuthedClient(factory, userId, login)` (`:228-234` — uses `MintToken`), `CleanupUserAsync` (`:89-111`), `CleanupTenantCascadeAsync(factory, tenantId)` (`:113-128`), `DeactivateOwnerByUserIdAsync` (`:217-226`, ExecuteUpdateAsync — NoTracking-safe), `ResetDataAsync` (`:151-191`), `GetUserByLoginAsync` (`:82-87`).
- `UserSeed.SeedOwnerAdminWithStoreAsync(factory)` → `UserWithRolesFixture` (`:45-65`) — includes StoreUser row (guards wrong-reason passes).
- `StoreSeed.DeactivateStoreAsync(factory, storeId)` (`:109-116`) — uses `AsTracking()`.

### Rate limiting (H-12 confirmation)

`backend/src/SMCA.WebApi/Program.cs:112-121` — `AddRateLimiter` is registered ONLY `if (!builder.Environment.IsEnvironment("Testing"))`; middleware `app.UseRateLimiter()` also gated at `:157-160`. **Confirmed: under the Testing env the E2E suite runs with the rate limiter absent — real-login tests are NOT constrained by the 5/1min login policy.**

### Edge/error cases (code behavior, file:line)

| Case | Code path | Result |
|---|---|---|
| User not found | `AuthenticationService.cs:34-39` | 401 `Auth.InvalidCredentials` |
| Wrong password | `:47-51` | 401 `Auth.InvalidCredentials` |
| Inactive user | `:41-45` | 403 `Auth.AccountInactive` |
| Inactive ReSeller row | `:71-75` | 403 `Auth.AccountInactive` |
| Inactive Owner | `:79-84` | 403 `Auth.AccountInactive` |
| ReSeller role-only, no row | `:68` (null) → `:125-127` | 403 `Store.Inactive` (branch 1; blind-zone pin exists) |
| StoreUser no StoreUser row (role-only) | `:125-127` | 403 `Store.Inactive` (branch 1) — **NOT pinned** |
| StoreUser row inactive | `:129-130` | 403 `Store.Inactive` (branch 2) — **NOT covered over HTTP**; feasible via seed (`StoreUser` inherits `IsActive` from `AuditableEntity.cs:7`, default true) |
| StoreUser.Store null | `:132-133` | 403 `Store.Inactive` (branch 3) — DB-impossible (`StoreId` FK required), not worth a test |
| Store inactive | `:135-136` | 403 `Store.Inactive` (branch 4) — covered |
| Store owner null | `:138-139` | 403 `Store.Inactive` (branch 5) — DB-impossible (FK required) |
| Store owner inactive | `:141-142` | 403 `Store.Inactive` (branch 6) — covered |
| OwnerAdmin inactive owner | `:118` | 403 `Store.Inactive` — covered |
| OwnerAdmin no active store | `:121-122` | 403 `Store.Inactive` — covered (inactive-store test) |

## Affected Areas

- `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginStoreUserTests.cs` — EXISTS (3 facts, committed `a78a0578`); any new StoreUser fact lands here (NEW file only if we must avoid touching existing files — but adding a NEW test to an existing file is permitted; modifying/removing existing facts is NOT).
- `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginReSellerTests.cs` — EXISTS (3 facts, committed `0b2bf0cb`); persona complete.
- `backend/src/SMCA.WebApi.E2ETests/Infrastructure/AuthzSeed.cs` / `DbTestHelpers.cs` / `StoreSeed.cs` — reusable seeds; do not modify existing helpers (additive new helpers allowed if needed).
- `docs/testing/e2e-stage-1/plan-backend.md` — B-3 table is STALE (says StoreUser/ReSeller "falta"); doc-only update optional (no authorization needed, not a test).
- `openspec/specs/auth-login-e2e/spec.md`, `openspec/specs/auth-login-reseller-e2e/spec.md` — already record DELIVERED.

## Approaches

1. **Close the change as already-delivered (recommended default)** — B-3's two missing personas are covered and verified. Optionally pair with a doc-only commit updating the stale `plan-backend.md` B-3 table.
   - Pros: zero risk; no test churn; the plan doc gets truthful again; preserves the "each persona has a real-login test" rule.
   - Cons: leaves branch 2 (`!storeUser.IsActive`) unpinned over HTTP — a latent MintToken blind zone of the same class the plan warns about.
   - Effort: Low (doc-only).

2. **Residual coverage: pin the remaining StoreUser branches (additive NEW facts)** — add to `AuthLoginStoreUserTests.cs`: branch 2 (`StoreUser.IsActive = false` via direct seed, NoTracking-safe with a tracked `Added`/`Update` — mirror D5 pattern) → 403 `Store.Inactive`; optionally branch 1 role-only StoreUser (seed via `SeedUserWithRoleAsync((int)RoleType.StoreUser)` + no StoreUser row → 403 `Store.Inactive`, mirroring ReSeller D6 blind-zone pin).
   - Pros: closes the last HTTP-coverable StoreUser branch; pins the same MintToken divergence the ReSeller file pins by design; purely additive; no production code.
   - Cons: branch 2 state may be unreachable via production UI (StoreUser rows have no deactivate endpoint in this codebase — verify before asserting it as a user-facing contract); adds ~2 facts and runtime cost.
   - Effort: Low-Medium.

3. **Full re-run of B-3 as if missing** — NOT recommended: the work exists, verified, archived; re-doing it would duplicate commits and risk touching existing tests.

## Recommendation

Do NOT re-implement B-3. The two personas are delivered and verified (change `e2e-b3-auth-login-roundtrip`, PASS). Recommend **Approach 2** as the substantive option if the user wants to fully close the plan's blind-zone rule for StoreUser: add the branch-2 (and optionally branch-1) facts as NEW additive tests in `AuthLoginStoreUserTests.cs`, plus the stale-plan doc update from Approach 1. If the user prefers zero further test work, **Approach 1** (doc-only) closes the item honestly. Either way, the proposal phase should state the staleness finding up front so the user can choose consciously.

## Risks

- **Stale plan doc**: `plan-backend.md` B-3 table says StoreUser/ReSeller "falta" — any proposal MUST correct this or the user may approve duplicate work.
- **Existing-test boundary**: `AuthLoginStoreUserTests.cs` and `AuthLoginReSellerTests.cs` are EXISTING E2E files — only ADDITIVE new facts are permitted (no modification of existing facts, no renaming).
- **NoTracking trap**: any new branch-2 seed mutating `StoreUser.IsActive` must use a tracked `Added`/`Update` path or `ExecuteUpdateAsync` (see `DbTestHelpers.DeactivateOwnerByUserIdAsync` precedent `DbTestHelpers.cs:217-226`).
- **Rate limiting**: off under Testing (Program.cs:112-121,157-160) — do not write a 429 assertion for the login policy in this suite; Playwright is the documented venue.
- **Cleanup**: any new StoreUser fact must clean up via `CleanupStoreGraphAsync(factory, storeId, userId, ownerUserId)` (both user ids — D3); ReSeller facts must delete the ReSeller row first (FK Restrict, `ReSellerEntityTypeConfiguration.cs:28`).
- **PostgreSQL `smca_test`** on localhost:5432 is required; collection `e2e`; `ResetDataAsync` clears refresh tokens between collections.

## Ready for Proposal

Yes — with the staleness correction as the first item the orchestrator tells the user: "B-3 StoreUser/ReSeller roundtrips are ALREADY delivered and verified (archived change e2e-b3-auth-login-roundtrip, 2026-08-09); plan-backend.md's table is stale. Choose: (1) doc-only close, or (2) additive residual coverage for StoreUser branch 2 (inactive StoreUser row) and optionally branch 1 (role-only StoreUser blind-zone pin)."