# Proposal: User Roles Endpoint Fixes

## Intent
Fix review findings on `POST /api/v1/users/AddUserRoles` + `DeleteUserRoles` (plan tracker #20/#21, CRITICAL): 3x 500 paths, 2x N+1, last validator anti-pattern, missing Swagger contract, weak E2E.

## Motivation
- **3x 500**: NRE `role.Name` (bad RoleId); NRE `user.Id` (deleted-user race); duplicate RoleIds -> composite-PK conflict on SaveChanges.
- **2x N+1**: per-role re-query in AddUserRoles handler; per-role `GetByIdAsync` in VisibleRoleService.
- **Anti-pattern**: validators full-load User via `GetByIdAsync` — last `MustAsync` after sibling fixes moved to `ExistsAsync`.
- **Query debt**: GetUserRolesByUserId over-fetches User, NRE risk, redundant `Task.FromResult`, string Id compare.
- **Contract**: only 200 declared; no `[FromBody]`; tests miss 401/403/404.

## Scope
**In:**
- **AddUserRolesCommand.cs**: null-guard `user` -> 400 `UserNotFound` (keep contract); `UserRole.Create(request.UserId, ...)`; `.Distinct()`; single materialized lookup (kill re-query).
- **Both validators**: `GetByIdAsync` UserExists -> `_userRepository.ExistsAsync` (UserRepository.cs:99-102); drop unused deps.
- **VisibleRoleService.cs:31**: null-guard `role` -> false (-> 400 `RoleNotFound`); single batched check keeping grant rules (:28-38).
- **IUserRoleRepository**: add `GetByUserIdAsync` (+ impl) for AddUserRoles handler.
- **GetUserRolesByUserIdQuery.cs**: drop `user` load, use `query.UserId`; null-guard; drop `Task.FromResult`; int Id compare.
- **UsersController.cs:108-126**: `[FromBody]` + `[ProducesResponseType]` 400/401/403 on both.
- **E2E** `UsersRolesTests.cs` (6): nonexistent UserId -> 400; nonexistent RoleId -> 400 (NRE fix); duplicate RoleIds -> 200 no dup (Distinct); 401; 403 w/o UsersAdmin; body `Selected` reflects added role.
- **Specs** deltas: users-e2e, validation, api-controller, user-repository; plan doc #20/#21 -> Done.

**Out:**
- URL casing stays (frontend+tests depend) — debt only.
- 400/404 contract change (keep 400, users-e2e R2).
- `ActivateStoreCommand` dead code — separate concern.
- Any frontend changes.

## Approach
Mirror `activate-user-endpoint-fixes` / `update-user-endpoint-fixes` / `get-user-by-id-endpoint-fixes`: validators -> `ExistsAsync`; handlers -> null-guards -> 400 envelope; repository batch methods; additive-only edits; E2E RED->GREEN.

## Risks
| Risk | Mitigation |
|---|---|
| `FindAsync` (GenericRepository.cs:84) skips global query filters | Keep as-is; null-guards only |
| Dirty tree (uncommitted sibling edits) | Additive edits only |
| Response shape change breaks frontend | `ListViewDto` shape unchanged |
| Culture-coupled asserts | Status + envelope only |

## Rollback
Revert per-file: command guards, validator swap, service null-guard, controller attributes. Behavior-only; no data impact.

## Dependencies
None. `ExistsAsync`/`UserNotFound`/`RoleNotFound` exist; `GetActiveRoleIdsByUser` reused.

## Success Criteria
- [ ] 6 E2E pass; roles+users suites GREEN
- [ ] No 500 on nonexistent role / duplicate RoleIds
- [ ] Swagger shows 400/401/403 on both actions
- [ ] N+1 removed (single query per handler path)
