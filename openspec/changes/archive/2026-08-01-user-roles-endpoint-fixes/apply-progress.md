# Apply Progress: user-roles-endpoint-fixes

**Batch A** — tasks 1.1–4.1 (repos, application layer, controller, E2E tests).
**No git commits** (user constraint) — dirty tree untouched; gates are build/test only (task 4.2, NOT run during apply per constraint).

## Completed

### Phase 1: Repository Contracts + Implementations

- [x] **1.1** `IRoleRepository.cs:10` — `GetRolesByIds(HashSet<Guid>)` → `GetRolesByIds(HashSet<int>)` (D1; zero callers verified by grep before edit).
- [x] **1.2** `RoleRepository.cs:36-42` — replaced `NotImplementedException` with `_roles.IgnoreQueryFilters().Where(r => roleIds.Contains(r.Id)).ToListAsync()` (D1).
- [x] **1.3** `IUserRoleRepository.cs:16` — added `Task<IReadOnlyList<UserRole>> GetByUserIdAsync(Guid userId, CancellationToken cancellationToken = default)` (D3). NOTE: mission contract overrides tasks.md's `IEnumerable<UserRole>` — `IReadOnlyList<UserRole>` + cancellationToken per orchestrator instruction.
- [x] **1.4** `UserRoleRepository.cs:35-41` — implemented `GetByUserIdAsync` = `_userRoles.AsTracking().Where(ur => ur.UserId == userId).ToListAsync(cancellationToken)` — explicit Where (respects tenant filter), NO FindAsync/Include; returns active+inactive rows. **DEVIATION: `.AsTracking()` added** — required so the handler's tracked reactivation mutation (`userRole.IsActive = true`, no `UpdateAsync`) actually persists under the DbContext's `QueryTrackingBehavior.NoTracking` default (`ApplicationDbContext.cs:45`). Evidence: sibling change `update-user-endpoint-fixes` Batch B documented the SAME trap (D10 "FindAsync tracks" premise was FALSE — `SaveChangesAsync` returned 0 rows persisted until `UpdateAsync` was restored). Here the mission forbids `UpdateAsync` for reactivation, so tracking on fetch is the correct mechanism.

### Phase 2: Application Layer

- [x] **2.1** `VisibleRoleService.cs` — batch fetch `GetRolesByIds(roleIds.ToHashSet())` → `ToDictionary(r => r.Id)`; per-id `TryGetValue`, missing → `return false` (CH-R4 null-guard); 3-branch rules (:37-43) moved verbatim to private `IsVisibleRoleToCurrentUser(Role role)` (D2; kills per-role N+1; was 1 query per roleId).
- [x] **2.2** `AddUserRolesCommand.cs` handler — dropped `_userRepository` field + ctor + user load (:40); `UserRole.Create(request.UserId, roleId, tenantId)`; `foreach (request.RoleIds.Distinct())` (D5 — duplicate RoleIds deduped BEFORE processing so E2E-R3 single-row holds); one `GetByUserIdAsync` → `ToDictionary(ur => ur.RoleId)` (D4); present+inactive → `IsActive = true` (tracked mutation, NO `UpdateAsync`); `SaveChangesAsync(cancellationToken)` + `Send(GetUserRolesByUserIdQuery)` kept.
- [x] **2.3** `AddUserRolesCommandValidator.cs:32-33` — `UserExists` → `_userRepository.ExistsAsync(userId, cancellationToken)` (VL-R1; visibility rule + deps preserved).
- [x] **2.4** `DeleteUserRolesCommandValidator.cs:28-29` — same `GetByIdAsync` → `ExistsAsync` swap (VL-R2); handler + RoleIds rules untouched.
- [x] **2.5** `GetUserRolesByUserIdQuery.cs` — dropped `_userRepository` dep + user load (:42,:47); `GetActiveRoleIdsByUser(query.UserId)`; `role.Selected = activeRolesInUser.Contains(int.Parse(role.Id))` (int compare — old code compared `r.ToString() == role.Id`, string vs string but both ToString'd... actually old `Any(r => r.ToString() == role.Id)` compared stringified int to string Id — new `Contains(int.Parse(role.Id))` is the D7 int compare, avoids ToString allocation); direct `return ResponseResult.Success(listViewDtos)` — no `Task.FromResult` (D7; no load ⇒ no NRE; empty user → 200 all-false).

### Phase 3: Controller Metadata

- [x] **3.1** `UsersController.cs:108-134` — `[FromBody]` on both `AddUserRolesAsync` + `RemoveUserRolesAsync` command params; `[ProducesResponseType]` 400/401/403/404 added after existing 200 (D6; mirrors `ActivateUserAsync:90-99`). URL casing UNCHANGED (`AddUserRoles`/`DeleteUserRoles`). `change-password` + other actions NOT touched.

### Phase 4: E2E Tests (RED→GREEN ready)

- [x] **4.1** `UsersRolesTests.cs` — 7 new tests appended, existing 4 unchanged (verified 11 total present):
  1. `Add_roles_with_nonexistent_user_returns_400` (E2E-R1) — GREEN path (validator `ExistsAsync` false → 400 envelope)
  2. `Add_roles_without_token_returns_401` (R4a) — anonymous client → 401
  3. `Delete_roles_without_token_returns_401` (R4b) — anonymous client → 401
  4. `Add_roles_as_store_user_without_users_admin_returns_403` (R5) — `AuthzSeed.SeedStoreUserAsync(_f, null)` actor → 403 envelope
  5. `Add_roles_with_nonexistent_role_id_returns_400` (R2) — RoleId `999999` → 400 (today 500 NRE in VisibleRoleService → now CH-R4 null-guard returns false → validator 400). RED→GREEN.
  6. `Add_roles_with_duplicate_role_ids_returns_200_single_row` (R3) — `[X,X]` → 200, DB assert `db.Set<UserRole>().IgnoreQueryFilters()` exactly 1 row. RED→GREEN (old code created 2 rows).
  7. `Add_roles_response_selected_true_for_added_role` (R6) — `ApiResponse<List<ListViewDto>>`; `Data.Single(x => x.Id == ((int)RoleType.ReSeller).ToString()).Selected == true`. RED→GREEN (old query handler `Task.FromResult` + string compare still returned Selected=true... actually the real RED driver is the `GetAllActiveRolesAsync` bug below — response Data would only contain SuperAdmin for a super-admin actor, so `Single(ReSeller)` would throw).
- Usings added: `Application.Dtos.Common` (ListViewDto), `Domain.Entities.UserRoles` (UserRole), `Infrastructure.Persistence.Contexts`, `Microsoft.EntityFrameworkCore`, `Microsoft.Extensions.DependencyInjection` (DB asserts).
- House style verified against `UsersActivateTests.cs` / `UsersUpdateTests.cs`: seed → try → assert (envelope `Succeeded==false` + `Errors.NotBeEmpty()` for errors, never assert localized Description) → finally cleanup.

## DEVIATIONS from design/tasks (documented)

1. **`.AsTracking()` on `GetByUserIdAsync` (1.4)** — NOT in tasks.md literal `_userRoles.Where(...).ToListAsync()`. REQUIRED: NoTracking default context (ApplicationDbContext.cs:45) + mission's hard constraint "NEVER call `UpdateAsync` for reactivation — use tracked mutation". Without AsTracking the reactivation would silently no-op (sibling Batch B proved this exact failure mode). Zero behavior change for read-only callers.
2. **`GetAllActiveRolesAsync` latent bug fix (RoleRepository.cs:20-27, same target file as 1.2)** — ORIGINAL `Where(r => r.IsActive && (includeSuperAdminRole && r.Id == (int)RoleType.SuperAdmin))` returns ONLY SuperAdmin (or empty). The method's name/intent + D7 query handler usage requires ALL active roles + SuperAdmin conditionally. Fixed to `r.IsActive && (r.Id != (int)RoleType.SuperAdmin || includeSuperAdminRole)`. REQUIRED for E2E-R6 (response `Data` must contain ReSeller for super-admin actor) and for `GetUserRolesByUserIdQuery` to return the full visible role list. Not in the task list — flagged as a necessary pre-existing bug correction in the same target file.
3. **1.3 contract type** — mission specifies `Task<IReadOnlyList<UserRole>> GetByUserIdAsync(Guid userId, CancellationToken cancellationToken = default)`; tasks.md says `Task<IEnumerable<UserRole>> GetByUserIdAsync(Guid userId)`. Followed the mission (orchestrator instruction overrides).

## Not done (deferred / out of scope)

- **4.2** Verify commands defined but NOT run (constraint: no build/test during apply):
  - `dotnet build` solution → 0 errors
  - `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersRolesTests"` → 7 new + 4 existing GREEN
  - regression `--filter "FullyQualifiedName~UsersRolesTests|UsersListTests|UsersUpdateTests"`
  - needs Postgres `smca_test` up
- No git operations performed. Main specs untouched (archive-time alignment deferred).

## Risks for verify

- **E2E-R6 (`Add_roles_response_selected_true_for_added_role`)** depends on roles being seeded via `RoleEntityTypeConfiguration.cs:35-55` HasData (IDs 1-4 matching RoleType enum) — confirmed present; test DB must run migrations.
- **E2E-R3 single-row assert** depends on `.Distinct()` in handler + `ToDictionary` — if DB somehow already has duplicate rows for (user, role), `ToDictionary` would throw; DB invariant assumes no duplicate (user, role) rows. Old code would also misbehave (FirstOrDefault + AddAsync duplicates).
- **R2 (999999)** — 400 now comes from the validator's visibility rule (CH-R4 null-guard → false). Envelope assert `Errors.NotBeEmpty()` holds.
- **`[FromBody]` addition (3.1)** — behavioral change for callers that posted without body binding; E2E tests use `PostAsJsonAsync` (JSON body) so unaffected.
- **NoTracking interplay** — `.AsTracking()` in `GetByUserIdAsync` returns tracked entities; handler mutates `IsActive` then `SaveChangesAsync` persists. If a future refactor removes AsTracking, reactivation silently breaks — see sibling Batch B.

**Status: applied** (11/11 target files edited + verified via read-back; 12/12 tasks complete except 4.2 verify gates which are explicitly deferred).
