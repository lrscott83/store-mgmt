# Proposal: Offline Roster Export Endpoint

## Intent

Add `GET /api/v1/storeusers/{storeId}/offline-roster` that lets SuperAdmin/OwnerAdmin export a store's user roster with per-user PBKDF2 verifiers + anti-replay metadata as JSON, so devices authenticate users offline without the API.

## Scope

### In Scope
- `IOfflineVerifierService` — PBKDF2-HMAC-SHA256, 210000 iters, 16B salt, 32B key
- `IStoreUserRepository.GetStoreUsersByStoreIdAsync(Guid, bool)` — store-scoped user query
- `IAllowedFeaturesService.GetAllowedFeatureIdsForUserAsync(Guid, List<int>)` — per-user overload
- `ExportOfflineRosterQuery` + handler — MediatR query assembling the roster
- 3 DTOs: `OfflineRosterDto`, `OfflineRosterUserDto`, `OfflineVerifierDto`
- `StoreUsersController.ExportOfflineRosterAsync` — controller action
- `Program.cs` DI registration
- Unit tests (OfflineVerifierService, AllowedFeaturesService overload, handler)
- E2E tests (SuperAdmin success, OwnerAdmin own store, OwnerAdmin other store, plain user denied)

### Out of Scope
- No changes to existing online auth (`POST /login`, `/me`, session logic)
- No server-side flag, migration, or opt-in for offline mode
- No client-side file encryption — that's frontend work
- No changes to existing DTOs or repository methods
- No performance optimizations (small stores, <100 users expected)

## Approach

Layered addition following Clean Architecture:

1. **Domain**: One new method on `IStoreUserRepository`
2. **Application**: 
   - `IOfflineVerifierService` (abstraction) + `OfflineVerifierService` (PBKDF2 impl)
   - `IAllowedFeaturesService` overload (inject `IUserRoleRepository`, reuse private helpers)
   - `ExportOfflineRosterQuery` + handler (authorize caller, load users, compute per-user verifier, bundle with metadata)
3. **Infrastructure**: `StoreUserRepository.GetStoreUsersByStoreIdAsync` (mirrors `GetStoreUsersIgnoreQueryFiltersAsync` but filtered by store)
4. **WebApi**: One new controller action + DI registration

Auth: `[Authorize]` + `[HasPermission(StoreRoleFeatures.UsersAdmin)]` at class level; handler further narrows to SuperAdmin (any store) and OwnerAdmin (owned stores only) via `IHttpContextService` + `IStoreRepository`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Domain/Interfaces/Repositories/IStoreUserRepository.cs` | Modified | +`GetStoreUsersByStoreIdAsync(Guid, bool)` |
| `Infrastructure/.../StoreUserRepository.cs` | Modified | Implement above (mirror existing pattern) |
| `Application/Abstractions/Authentication/IOfflineVerifierService.cs` | **New** | Interface + `OfflineVerifierResult` record |
| `Application/Services/Authentication/OfflineVerifierService.cs` | **New** | PBKDF2 impl via `Rfc2898DeriveBytes.Pbkdf2` |
| `Application/Abstractions/Features/IAllowedFeaturesService.cs` | Modified | +`GetAllowedFeatureIdsForUserAsync(Guid, List<int>)` |
| `Application/Services/Features/AllowedFeaturesService.cs` | Modified | Inject `IUserRoleRepository`, add per-user overload |
| `Application/Dtos/Management/StoreUsers/OfflineRosterDto.cs` | **New** | Bundle-level DTO |
| `Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs` | **New** | Per-user DTO (mirrors `/me` shape) |
| `Application/Dtos/Management/StoreUsers/OfflineVerifierDto.cs` | **New** | `{ Hash, Salt, Iterations }` |
| `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` | **New** | Query + handler |
| `SMCA.WebApi/Controllers/v1/StoreUsersController.cs` | Modified | +`ExportOfflineRosterAsync` action |
| `SMCA.WebApi/Program.cs` | Modified | Register `IOfflineVerifierService` |
| `Application.Tests/.../OfflineVerifierServiceTests.cs` | **New** | 2 tests (reproducibility, fresh salt) |
| `Application.Tests/.../ExportOfflineRosterQueryHandlerTests.cs` | **New** | 4 test cases |
| `SMCA.WebApi.E2ETests/.../ExportOfflineRosterTests.cs` | **New** | 4 E2E scenarios |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| PBKDF2 params mismatch with frontend (iterations, algo, input encoding) | Med | Plan documents exact params; E2E test verifies structure; frontend team must match byte-for-byte |
| Handler too many `foreach` DB calls (N+1 on role features per user) | Low | `GetStoreRoleFeaturesByUserIdAsync` is one call per user; stores expected <100 users |
| `AllowedFeaturesService` ctor change breaks existing tests | Med | Update existing mocks to include `IUserRoleRepository`; run full suite before commit |
| `User.Password` field access via navigation property in StoreUser query | Low | `.Include(su => su.User)` in the repo query; confirmed existing repos do this |

## Rollback Plan

- Revert commits in reverse order: controller action → handler → service → repo method
- No migration or data change — pure code rollback
- Existing tests remain passing at each revert step

## Dependencies

- `IUserRoleRepository` — already exists, injected into `AllowedFeaturesService`
- `IStoreRepository.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(Guid)` — exists, used for ownership check

## Success Criteria

- [ ] All new unit tests pass (OfflineVerifierService, AllowedFeaturesService overload, handler)
- [ ] All new E2E tests pass (4 scenarios)
- [ ] Existing test suite passes unchanged
- [ ] Endpoint returns valid roster JSON with correct bundle metadata, per-user verifiers, and permission shape matching `/me`
