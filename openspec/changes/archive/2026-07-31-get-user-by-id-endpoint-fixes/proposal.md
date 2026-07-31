# Proposal: GET /api/v1/users/{id} — Endpoint Fixes

## Intent

`UsersController.GetUserByIdAsync` returns `ownerName: null` (include chain missing `.ThenInclude(o => o.User)`), double round-trips a full `FindAsync` for validation, returns HTTP 200 `data:null` on the delete race, has incomplete Swagger metadata, and drops `CancellationToken`. This change brings the endpoint in line with the verified `get-store-by-id` precedent (400 via validator + envelope-404 race guard), fixes two same-family repository bugs, and adds E2E coverage that can actually catch the OwnerName regression.

## Scope

### In Scope
- **Contract (D1=A)**: KEEP 400 via validator `MustAsync(UserExists)` for non-existent id; ADD race guard in handler: `if (user is null) return ResponseResult.Failure<UserDto>(UserErrors.NotFound, 404)` — mirror `GetStoreByIdQuery.cs:30-31`
- **Validator efficiency (D2)**: add `Task<bool> ExistsAsync(Guid id)` to `IUserRepository` (impl `_users.IgnoreQueryFilters().AnyAsync(u => u.Id == id)`, mirror `IStoreRepository.cs:22` + `StoreRepository.cs:89-92`); point `MustAsync` at it instead of `GetByIdAsync`
- **F1 (D3)**: reuse `IncludeStoreAndRoles` helper in `GetUserByIdIncludingStoreAndRoles` so `OwnerName` resolves
- **N1**: same one-line `.ThenInclude(o => o.User)` fix in `GetByLoginWithRelatedAsync` (`UserRepository.cs:90-92`)
- **F6**: propagate `CancellationToken` through `GetUserByIdIncludingStoreAndRoles` (interface `IUserRepository.cs:15`, impl `UserRepository.cs:68,74`, handler `GetUserByIdQuery.cs:23-25`)
- **F5**: `[ProducesResponseType(200/400/401/403)]` + `[FromRoute]` on `GetUserAsync` — mirror fixed `GetAllUsersAsync:29-32`
- **LOW (D6)**: `UserDto.cs` — `string?` on `OwnerName`/`StoreName` (:11-12), `RoleNames = []` (:13)
- **E2E (D4)**: add `StoreUser.Create(user.Id, store.Id, tenantId)` row to `UserSeed.SeedOwnerAdminWithStoreAsync`; add ONE body-asserting test (SuperAdmin actor → seeded OwnerAdmin target, actor ≠ target to avoid EF fixup masking): assert `Data.Id`, `ownerName == "E2E OwnerAdmin"`, `storeName` not null, `roleNames` contains OwnerAdmin — RED before include fix, GREEN after
- **Archive-time (D7)**: align `users-e2e` R2:46 "Non-existent id → 404" to 400

### Out of Scope
- Middleware logging (N4)
- `UserListDto` NRT — `UserDto.cs` only
- `StoreUsersController.GetById` ProducesResponseType (N5)
- Missing R2 scenarios (N6) — no new auth-matrix tests
- Contract options B/C (envelope-404 or real HTTP 404) — rejected
- Frontend changes (both frontends treat 400/404 identically)

## Approach

Mirror the canonical `store-getbyid-fixes` / `get-users-all` pattern: validator keeps 400 but via lightweight `AnyAsync` existence check; handler adds envelope-404 race guard; repository reuses the DRY `IncludeStoreAndRoles` helper (already contains `.ThenInclude(o => o.User)`) and forwards tokens; controller mirrors `GetAllUsersAsync` metadata. The new E2E body test proves the include fix (RED→GREEN) and the seed row gives it a real Owner/Store/StoreUser graph.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | 404 contract | **A**: 400 via validator; 404 (envelope) only for race window |
| D2 | Validator existence | New `IUserRepository.ExistsAsync(Guid)` — `AnyAsync` + `IgnoreQueryFilters()` |
| D3 | Include chain | Reuse `IncludeStoreAndRoles` helper |
| D4 | E2E | Keep 400 test; add body-asserting test with graph seed |
| D5 | N1 (GetByLoginWithRelatedAsync) | Included in this change |
| D6 | NRT cleanup | `UserDto` only; middleware logging excluded |
| D7 | users-e2e R2:46 | Align to 400 at archive |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/Domain/Interfaces/Repositories/IUserRepository.cs` | Modified | Add `ExistsAsync(Guid)`; token on `GetUserByIdIncludingStoreAndRoles` |
| `backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs` | Modified | `ExistsAsync` impl; token forward; reuse `IncludeStoreAndRoles`; N1 `.ThenInclude` |
| `backend/src/Application/Features/.../GetUserById/GetUserByIdQuery.cs` | Modified | Race guard → Failure 404; forward token |
| `.../GetUserByIdQueryValidator.cs` | Modified | `MustAsync(UserExists)` → `ExistsAsync` |
| `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` | Modified | ProducesResponseType 200/400/401/403 + `[FromRoute]` |
| `backend/src/Application/Common/Dtos/UserDto.cs` | Modified | `string?` OwnerName/StoreName; `RoleNames = []` |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/UserSeed.cs` | Modified | `StoreUser.Create` row in `SeedOwnerAdminWithStoreAsync` |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersGetByIdTests.cs` | Modified | New body-asserting test (RED→GREEN) |
| `openspec/specs/users-e2e/spec.md` | Modified (archive) | R2:46 → 400 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| EF fixup masks OwnerName in self-lookup | Low | Body test uses actor ≠ target |
| `IgnoreQueryFilters()` in ExistsAsync changes validator semantics | Low | Mirrors `IStoreRepository` precedent; handler query also unfiltered |
| Seed row breaks UsersList/Update tests | Low | Re-run both classes; additive row only |
| Race-path envelope-404 untested | Low | Pre-existing project pattern (stores); out of scope |

## Rollback Plan

Per-file revert, all additive/small: restore inline include chain (drop helper reuse), revert `ExistsAsync` to `GetByIdAsync` in validator, remove handler null guard, drop controller metadata/token params, remove seed row + new test. No schema or migration impact; N1 revert restores prior auth-flow behavior.

## Dependencies

- Postgres `smca_test` running (verified in explore — E2E 4/4 pass)
- `IncludeStoreAndRoles` helper exists (extracted by `get-users-all-endpoint-fixes`)

## Success Criteria

- [ ] New E2E body test FAILS before include fix, PASSES after (`ownerName == "E2E OwnerAdmin"`)
- [ ] `dotnet test`: UsersGetByIdTests, UsersListTests, UsersUpdateTests all pass
- [ ] Validator issues single `AnyAsync` query — no `GetByIdAsync`/`FindAsync` (finding 2)
- [ ] Handler race guard returns `Failure(NotFound, 404)` — no 200 `data:null`
- [ ] Swagger documents 400/401/403; `CancellationToken` reaches EF call
- [ ] `GetByLoginWithRelatedAsync` has `.ThenInclude(o => o.User)`; `UserDto` NRT clean
