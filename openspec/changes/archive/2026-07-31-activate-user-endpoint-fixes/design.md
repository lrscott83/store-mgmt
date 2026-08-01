# Design: Activate User Endpoint Fixes

## Technical Approach

Mirror the archived `delete-user-endpoint-fixes` end-to-end (guard-chain order, structural validator trim, 404 semantics, Swagger metadata, E2E RED-ability) + F6 namespace move (option B — user decision). Six findings on `POST /api/v1/users/activate`: 400-masked 403, unreachable 404, ignored `IsActive`, validator double round-trip, missing Swagger metadata, namespace drift. **ActivateStore bonus is EXCLUDED (user decision C)** — amendment to the proposal: no ActivateStore work here; its guard debt (400 `UserNotFound` guard + `StoreExists` double-query) is annotated as a follow-up. `IsActive` is NOT tri-state — the flag is explicit in the command; no update-user IDOR/tri-state patterns apply.

## Architecture Decisions

### Decision: Handler guard chain (mirror post-archive `DeleteUserCommand.cs`)

**Choice**: 403 `DontHavePermission` FIRST → `GetByIdAsync(request.Id)` (NO token) → null → 404 `UserNotFound` → `user.IsActive = request.IsActive` → `UpdateAsync` KEPT → `SaveChangesAsync(cancellationToken) > 0`.
**Rationale**: Feature-granted StoreUser passes `[HasPermission(UsersAdmin)]` and must be blocked in the handler (CH-D1 precedent). Both resx keys already exist (`DontHavePermission`, `UserNotFound`) — **NO resx edits** (unlike delete-user, which added `CannotDeleteSelf` and renamed `UserNotFoud`).

### Decision: `GetByIdAsync` — NO CancellationToken

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `GetByIdAsync(request.Id)` | No interface change; `IGenericRepository.cs:22` has no token overload; precedent `UpdateUserCommand.cs:46` | ✅ Chosen |
| Token overload on `IGenericRepository` | Interface change, every consumer touched | ❌ Rejected |
| Token method on `IUserRepository` only | Scope creep | ❌ Rejected |

### Decision: `UpdateAsync` KEPT — NoTracking is real

`ApplicationDbContext.cs:45` sets `QueryTrackingBehavior.NoTracking` → `FindAsync` returns UNTRACKED. `UpdateAsync` (`Entry.State = Modified`) is the attach mechanism; dropping it → `SaveChangesAsync` sees no changes → silent no-op. Same rationale as delete-user; the implemented `UpdateUserCommand.cs:59-63` comment confirms.

### Decision: Validator trim — structural only, KEEP `_localizer`

**Choice**: Remove `MustAsync(UserExists)` rule, `UserExists` method, `_userRepository` field, ctor `IUserRepository` param, `using Domain.Interfaces.Repositories;` (+ dead System/Collections/Linq/Text/Threading usings). Keep `NotNull().NotEmpty()`, `_localizer`, `using Microsoft.Extensions.Localization;` + `using Resources;`. Result = exact 21-line mirror of `DeleteUserCommandValidator.cs` (post-archive).
**Rationale**: NOT the UpdateUser `ExistsAsync` pattern — that belongs to the 400 contract. `ValidationBehaviour` throws `ValidationException` → 400 BEFORE the handler runs; any validator existence rule makes the handler's 404 dead code. Handler owns existence → 404 reachable; single DB responsibility.

### Decision: Namespace move (option B — user decision)

`Application.Features.Management.Users.Commands.ActivateUser` → `Application.Features.UserManagement.Users.Commands.ActivateUser` in BOTH files; `using` at `UsersController.cs:3`; both files moved to `Features/UserManagement/Users/Commands/ActivateUser/`. Grep-verified blast radius: **exactly 3 refs** (2 namespace declarations + 1 controller using). ZERO refs in E2E tests (comment-only mention), WebApiTest legacy project, or DI registrations (MediatR `RegisterServicesFromAssembly` — no explicit registration). Post-move verification: grep `Management.Users.Commands.ActivateUser` across `backend/` → **0 hits**. NOTE: `Features/Management/Users/Commands/` also contains `CreateStoreUser` — folder is NOT emptied; do NOT touch it.

### Decision: No IDOR / tri-state / self-delete guards

Activate is an admin-only users-admin op; the guard is role-based (`IsSuperAdminOrOwnerAdmin`), not ownership-based. `IsActive` is an explicit `bool` in the command — no `bool?` tri-state. No self-delete guard was flagged — do NOT invent one.

### Decision: E2E assert style

Status + `Succeeded == false` + `Errors.NotBeEmpty()` ONLY — NEVER localized `Description` (culture coupling; house pattern per delete-user Batch B regression).

## Data Flow

```
POST /api/v1/users/activate {id, isActive}
 → [Authorize] → [HasPermission(UsersAdmin)]        [feature-granted StoreUser passes filter]
 → Validator: NotNull/NotEmpty only — ZERO DB queries [VL-D2]
 → Handler: IsSuperAdminOrOwnerAdmin ? else 403 DontHavePermission
     → GetByIdAsync → FindAsync (UNTRACKED — NoTracking)
     → null ? 404 UserNotFound
     → user.IsActive = request.IsActive
     → UpdateAsync (Entry.State=Modified) → SaveChangesAsync(ct) > 0 → 200
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/Application/Features/Management/Users/Commands/ActivateUser/ActivateUserCommand.cs` | Move → `.../UserManagement/Users/Commands/ActivateUser/ActivateUserCommand.cs` | Namespace decl; 403 guard FIRST; null→404; `user.IsActive = request.IsActive`; `UpdateAsync` + `SaveChangesAsync(ct)` KEPT (git sees delete+add in dirty tree) |
| `.../Management/Users/Commands/ActivateUser/ActivateUserCommandValidator.cs` | Move → `.../UserManagement/Users/Commands/ActivateUser/ActivateUserCommandValidator.cs` | Namespace decl; remove rule/method/field/ctor-param/using; keep `NotNull`/`NotEmpty` + `_localizer` (21-line mirror) |
| `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` | Modify | Line 3 `using` → `UserManagement.Users.Commands.ActivateUser`; `ActivateUserAsync` (:89-98): add `[ProducesResponseType]` 400/401/403/404 after existing 200 (`typeof(ResponseResult<bool>)`); keep `[FromBody]` + XML summary. Additive — do NOT clobber uncommitted `UpdatedAsync` (:59-70) or post-archive `DeleteUserAsync` (:77-87) |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersActivateTests.cs` | Modify | 4 tests (below); no namespace reference (string routes only) |

## Testing Strategy (E2E only — no unit tests, house precedent)

| # | Test | RED/GREEN | Setup → Assert |
|---|------|-----------|----------------|
| 1 | `Activate_false_deactivates` (RENAMED from `Activate_sets_active_true_ignoring_request`) | **RED** today (DB true) | `SeedSuperAdminAsync` + `SeedUserWithRoleAsync` victim + `UserSeed.DeactivateUserAsync`; POST `{Id, IsActive=false}` → 200; DB `IsActive==false` (`IgnoreQueryFilters`); cleanup `CleanupUserAsync` ×2 — mirrors `UsersDeleteTests` soft-delete pattern |
| 2 | `Activate_true_activates` (NEW happy path) | GREEN-only (hardcoded `true` == request `true` today) | Same setup; POST `{Id, IsActive=true}` → 200; DB `IsActive==true`; same cleanup — fills coverage gap (no test sends `true` today) |
| 3 | `Activate_nonexistent_returns_404` (RENAMED from `_400`) | **RED** today (validator 400) | `SeedSuperAdminAsync`; POST random `Guid` → `NotFound` + `Succeeded==false` + `Errors.NotBeEmpty()`; cleanup — mirrors `UsersDeleteTests:46-60` |
| 4 | `Activate_as_store_user_with_users_feature_returns_403` (NEW) | **RED** today (400 `UserNotFound`) | Actor `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)` (Users=72 passes filter, fails handler guard); victim `SeedUserWithRoleAsync(OwnerAdmin)`; POST → `Forbidden` + envelope; cleanup `CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId)` + `CleanupUserAsync(victim)` — mirrors `UsersDeleteTests:70-88` |

Command: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersActivateTests"` (Postgres `smca_test`). Regression: `UsersDeleteTests | UsersUpdateTests | UsersListTests` GREEN.

## Archive-time (NOT apply): spec/plan alignment

| Artifact | Delta |
|----------|-------|
| `openspec/specs/users-e2e/spec.md` (~line 20 Out-of-Scope note) | Flip known bug #1 + 400-guard note; R5 row "Deactivate with IsActive=false → 200, IsActive=true (KNOWN BUG)" → `200, IsActive=false`; ADD row "Non-existent id \| SuperAdmin \| 404"; clarify StoreUser 403 row as handler-level (feature-granted, CH-D1); remove known-bugs table row (line 163) |
| `openspec/specs/command-handler/spec.md` | Delta CH-A1..A3 mirror CH-D1/D3/D4 (403 guard FIRST, 404, UpdateAsync under NoTracking, `GetByIdAsync` no token) |
| `openspec/specs/validation/spec.md` | Delta VL-A1 mirror VL-D1/D2/D3 (rule removed — NOT ExistsAsync; structural only; single DB responsibility) |
| `openspec/specs/api-controller/spec.md` | Delta UC-A1 mirror UC-D1 (400/401/403/404 metadata) |
| `docs/plans/endpoints-e2e-coverage.md:55` (row 19) | `⬜ Pending` → `✅ Done \| 🔶 Applied \| activate-user-endpoint-fixes` (mirror delete-user row 54) |
| ActivateStore debt | Annotate follow-up note per decision C (guard 400 + validator double-query remain) |

## Migration / Rollout

None — behavior-only, no schema, no feature flags, no resx changes. Revert = per-file (restore hardcoded `true`, 400 guards, validator rule + repo ctor; namespace revert = 3 edits). Dirty tree: additive edits only, NO git operations.

## Open Questions

None blocking.
