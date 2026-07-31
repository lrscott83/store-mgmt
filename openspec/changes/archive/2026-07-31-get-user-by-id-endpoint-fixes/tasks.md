# Tasks: GetUserById Endpoint Fixes

**Change**: `get-user-by-id-endpoint-fixes` — `GET /api/v1/users/{id}` (`UsersController.GetUserAsync`)
**Sequence**: RED→GREEN — **Commit A** (tasks 1–8, new E2E test RED, 4 existing GREEN) → **Commit B** (task 9, test GREEN). Tasks 10–13 are apply-flow verification (no code).

## Phase 1: Commit A — Seed, E2E Test, DTO, Interface, Repo, Validator, Handler, Controller

### Task 1 — Seed StoreUser row (E2E-G1) — [x] DONE
- **Files**: `backend/src/SMCA.WebApi.E2ETests/Infrastructure/UserSeed.cs`
- **Description**: In `SeedOwnerAdminWithStoreAsync` 2nd SaveChanges batch (before line 61): add `using Domain.Entities.StoreUsers;` + `db.Set<StoreUser>().Add(StoreUser.Create(user.Id, store.Id, tenantId));`
- **Acceptance**: User→StoreUser→Store→Owner→User graph seeded; cleanup-safe (`AuthzSeed.CleanupStoreGraphAsync` deletes StoreUser by storeId); additive — no existing assertion breaks
- **Verification**: Tasks 11, 12

### Task 2 — Body-asserting E2E test (E2E-G2) — [x] DONE
- **Files**: `backend/src/SMCA.WebApi.E2ETests/Users/UsersGetByIdTests.cs`
- **Description**: Add inline `UserByIdData` class (Id, string? OwnerName/StoreName, List<string> RoleNames) + ONE test `Get_owner_admin_returns_full_body_with_owner_store_and_roles`: SuperAdmin actor ≠ seeded OwnerAdmin target; assert 200, `Data.Id == target.UserId`, `ownerName == "E2E OwnerAdmin"`, `storeName` not null, `roleNames` contains "OwnerAdmin"; finally-block cleanup (AuthzSeed + CleanupUserAsync)
- **Acceptance**: RED pre-fix (ownerName null), GREEN post-fix; actor≠target avoids EF fixup masking
- **Verification**: Task 11 (RED after A, GREEN after B)
- **Note**: RoleNames assertion uses `RoleType.OwnerAdmin.GetDisplayName()` (seeded Role.Name is the localized display name, e.g. "Administrador de tienda", not the enum name) — design literal "OwnerAdmin" was factually wrong (see apply-progress deviation 1).

### Task 3 — UserDto NRT (DT-G1/DT-G2) — [x] DONE
- **Files**: `backend/src/Application/Dtos/UserManagement/UserDto.cs`
- **Description**: `OwnerName`/`StoreName` → `string?`; `RoleNames` → `IEnumerable<string> RoleNames { get; set; } = [];`
- **Acceptance**: No NRE serializing owner/store-less user; RoleNames never null
- **Verification**: Task 10 (build)

### Task 4 — IUserRepository interface (RR-G1/RR-G2/RR-G3) — [x] DONE
- **Files**: `backend/src/Domain/Interfaces/Repositories/IUserRepository.cs`
- **Description**: Add `new Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken = default);`; add `CancellationToken cancellationToken = default` to `GetUserByIdIncludingStoreAndRoles(Guid, ...)` and `GetByLoginWithRelatedAsync(string, ...)`
- **Acceptance**: Compiles; `new` hides base generic `ExistsAsync(TId)` (store precedent `IStoreRepository.cs:22`)
- **Verification**: Task 10 (build)
- **Note**: `GetByLoginWithRelatedAsync` implemented as TWO overloads (1-arg delegates to 2-arg with `default`) instead of one optional-param member — Moq expression trees cannot omit optional args (CS0854). Orchestrator-approved Option A, commit `235bc990`.

### Task 5 — UserRepository impl (RR-G1 impl + RR-G3) — [x] DONE
- **Files**: `backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs`
- **Description**: Implement `public new async Task<bool> ExistsAsync(Guid id, CancellationToken ct = default) => await _users.IgnoreQueryFilters().AnyAsync(u => u.Id == id, ct);`; `GetUserByIdIncludingStoreAndRoles`: add token param + forward to `FirstOrDefaultAsync(cancellationToken)` — KEEP old inline chain (Commit B swaps it); `GetByLoginWithRelatedAsync`: insert `.ThenInclude(o => o.User)` after `.ThenInclude(s => s.Owner)` (line 92), add optional token param
- **Acceptance**: Single `AnyAsync`, no Include in ExistsAsync; `AuthenticationService.cs` untouched (one-arg call site compiles)
- **Verification**: Tasks 10 (build), 13 (auth regression)

### Task 6 — Validator → ExistsAsync (VL-G1/VL-G2) — [x] DONE
- **Files**: `backend/src/Application/Features/UserManagement/Users/Queries/GetUserById/GetUserByIdQueryValidator.cs`
- **Description**: Rename `tenantId`→`userId`; `MustAsync(UserExists)` body → `return await _userRepository.ExistsAsync(userId, cancellationToken);`
- **Acceptance**: Single `AnyAsync` per validation; zero `GetByIdAsync`/`FindAsync`; non-existent id still 400 (contract D1=A)
- **Verification**: Task 10 (build)

### Task 7 — Handler race guard + token (CH-G1/CH-G2) — [x] DONE
- **Files**: `backend/src/Application/Features/UserManagement/Users/Queries/GetUserById/GetUserByIdQuery.cs`
- **Description**: `User? user = await _userRepository.GetUserByIdIncludingStoreAndRoles(query.UserId, cancellationToken);` + `if (user is null) return ResponseResult.Failure<UserDto>(UserErrors.NotFound, 404);` (mirror `GetStoreByIdQuery.cs:30-31`)
- **Acceptance**: Never 200 `data:null` on race; token forwarded to repo
- **Verification**: Task 10 (build)

### Task 8 — Controller metadata (UC-G1/UC-G2) — [x] DONE
- **Files**: `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs`
- **Description**: `GetUserAsync([FromRoute] Guid id)` + add `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `Status401Unauthorized`, `Status403Forbidden` (mirror `GetAllUsersAsync:29-32`; 200 with `ResponseResult<UserDto>` stays)
- **Acceptance**: Swagger lists 200/400/401/403; `[FromRoute]` present
- **Verification**: Task 10 (build)

## Phase 2: Commit B — Include-Chain Swap

### Task 9 — Reuse IncludeStoreAndRoles helper (RR-G2) — [x] DONE
- **Files**: `backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs`
- **Description**: `GetUserByIdIncludingStoreAndRoles` body → `return await IncludeStoreAndRoles(_users.Where(u => u.Id == userId)).FirstOrDefaultAsync(cancellationToken);`
- **Acceptance**: `OwnerName` resolves (`Owner.User.FullName`); no inline duplicate chain
- **Verification**: Task 11 → 5 GREEN

## Phase 3: Verification (apply flow — NOT code)

### Task 10 — Build gate — [x] DONE (WebApi 0 errors + E2E project 0 errors + Application.Tests 0 errors after T13 fix)
- **Description**: `dotnet build` — 0 errors
- **Verification**: `dotnet build backend/src/SMCA.WebApi/SMCA.WebApi.csproj`

### Task 11 — E2E RED→GREEN — [x] DONE (RED: 1 fail/4 pass; GREEN: 5/5 pass, re-confirmed after T13 fix)
- **Description**: After A: new body test RED + 4 existing GREEN; after B: 5 GREEN
- **Verification**: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersGetByIdTests"`

### Task 12 — Seed regression — [x] DONE (20/20 pass)
- **Description**: UsersList + UsersUpdate unaffected by StoreUser row
- **Verification**: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersListTests|FullyQualifiedName~UsersUpdateTests"`

### Task 13 — Auth signature regression — [x] DONE (Option A overloads, commit `235bc990`; Application.Tests 19/19 pass)
- **Description**: `GetByLoginWithRelatedAsync` token param doesn't break one-arg call site (`AuthenticationService.cs:31`, Moq setups)
- **Verification**: `dotnet test backend/src/Application.Tests --filter "FullyQualifiedName~AuthenticationServiceTests"`

## Out of Scope (guard)
Middleware logging (N4); `UserListDto` NRT (`UserDto.cs` only); `StoreUsersController`; other endpoints; contract options B/C; frontend; new unit tests; schema/migration; main `users-e2e` spec R2:46 404→400 alignment (archive-time D7 — main spec untouched now); get-store-by-id R4 spec text alignment (#504).
