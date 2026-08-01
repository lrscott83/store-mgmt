# Apply Progress: update-user-endpoint-fixes

**Batch A** — tasks 1.1–1.6 (handler, validator, controller, E2E RED, build gate).
**No git commits** (user constraint) — checkpoint = build gate only.

## Completed

- [x] **1.1** `UpdateUserCommand.cs:21` — `bool IsActive` → `bool? IsActive` (class kept; `command.Id = id` controller mutation kept per D6).
- [x] **1.2** Handler `Handle()` rewritten per D1/D2/D4/D9/D10:
  - D9: `User? user = await _userRepository.GetByIdAsync(request.Id); if (user is null) return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);` (before ownership guard). `Task<User>` interface signature untouched; `User?` widening assignment compiles clean (precedent `GetUserByIdQuery.cs:25`).
  - D1: `if (request.Id != _httpContextService.UserExternalId.ToGuid() && !_httpContextService.IsSuperAdminOrOwnerAdmin) return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);` — mirrors `UpdateUserPasswordCommand.cs:49-56` (`UserExternalId.ToGuid()` — `Domain.Common.Extensions` using added; extension verified at `GuidExtensions.cs:12`).
  - D2 tri-state: `if (request.CellPhone is not null) user.CellPhone = request.CellPhone == "" ? null : request.CellPhone;` (same for Email); FullName always assigned.
  - D4: `if (_httpContextService.IsSuperAdminOrOwnerAdmin && request.IsActive.HasValue) user.IsActive = request.IsActive.Value;`
  - D10: `await _userRepository.UpdateAsync(user);` DELETED — FindAsync-tracked entity persists via handler's own `SaveChangesAsync`; kept `return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);`.
- [x] **1.3** `UpdateUserCommandValidator.cs` — `UserExists(Guid tenantId, ...)` → `UserExists(Guid userId, CancellationToken cancellationToken)`; body → `return await _userRepository.ExistsAsync(userId, cancellationToken);` (D11, single round-trip). FullName NotNull/NotEmpty + conditional Email format rules untouched.
- [x] **1.4** `UsersController.cs` `UpdatedAsync` — added `[ProducesResponseType]` 400/401/403/404 after existing 200 (`ResponseResult<bool>`); explicit `[FromRoute] Guid id`; style matches `GetAllUsersAsync:29-32`.
- [x] **1.5** `UsersUpdateTests.cs` — 4 new E2E tests appended (existing 6 untouched):
  1. `Update_other_user_as_store_user_with_profile_feature_returns_envelope_404` (IDOR — RED today: pre-fix handler allows the edit)
  2. `Update_partial_body_preserves_email_and_cellphone` (RED today: nulls them)
  3. `Update_with_empty_cellphone_clears_value` (RED today: stores "")
  4. `Update_omitting_isActive_preserves_active_state` (RED today: deactivates via bool default)
- [x] **1.6** Build gate: `dotnet build src/SMCA.WebApi/SMCA.WebApi.csproj` → **0 errors** (153 warnings, all pre-existing). E2E project also built (modified test file): `dotnet build src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` → **0 errors**.

## Seeding helpers used in new tests (exact signatures verified)

- `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Profile)` → `StoreUserFixture(Guid UserId, string Login, Guid OwnerUserId, Guid OwnerId, Guid StoreId, Guid TenantId)` (grants Profile(70))
- `UserSeed.SeedUserWithRolesAsync(_f, (int)RoleType.StoreUser)` → `DbTestHelpers.UserFixture(Guid UserId, string Login)` (CellPhone "0000000000", Email = login)
- `DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123")` → `Guid`
- `DbTestHelpers.AuthedClient(_f, userId, login)` → authenticated `HttpClient`
- `DbTestHelpers.GetUserByLoginAsync(_f, login)` → `User?` (IgnoreQueryFilters)
- Cleanup: `AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId)` + `DbTestHelpers.CleanupUserAsync(_f, userId)`
- Envelope assert pattern per `AuthMeFailureTests.cs:31-36`: `body.Succeeded == false`, `body.ActionCode == 404`, `body.Errors.ContainSingle(e => e.Code == "User.NotFound")` via `ApiResponse<object>`/`ApiResponse.Json`.

## Not done (later batches)

- Phase 2 (2.1–2.2): run UsersUpdateTests filter → GREEN. `dotnet test` NOT run per batch constraint.
- Phase 3 (3.1–3.3): E2E tests 5–6 + regression.
- Phase 4 (4.1–4.2): archive-time spec alignment — deliberately deferred, main specs untouched.

---

# Batch B — tasks 2.1–2.2 (Run to GREEN)

**Result: 10/10 PASS (x2 stable runs).** One production fix applied (D10 reverted). **No git operations.**

## Test evidence

Run 1 (build + run): `Passed! - Failed: 0, Passed: 10, Skipped: 0, Total: 10, Duration: 423 ms`
Run 2 (stability, `--no-build`): `Passed! - Failed: 0, Passed: 10, Skipped: 0, Total: 10, Duration: 392 ms`

Per-test (all `UsersUpdateTests`):
1. ✅ `Update_as_super_admin_returns_200` (existing — D2/D4 canary)
2. ✅ `Update_as_owner_admin_returns_200` (existing)
3. ✅ `Update_as_store_user_returns_403` (existing)
4. ✅ `Update_without_token_returns_401` (existing)
5. ✅ `Update_empty_body_returns_400` (existing)
6. ✅ `Update_nonexistent_id_returns_400` (existing)
7. ✅ `Update_other_user_as_store_user_with_profile_feature_returns_envelope_404` (new #1 — IDOR)
8. ✅ `Update_partial_body_preserves_email_and_cellphone` (new #2)
9. ✅ `Update_with_empty_cellphone_clears_value` (new #3)
10. ✅ `Update_omitting_isActive_preserves_active_state` (new #4)

## Fix applied (2.2) — D10 REVERTED

**Failure (first run):** 9/10 — `Update_with_empty_cellphone_clears_value`: `Expected dbUser!.CellPhone to be <null>, but found "0000000000"`.

**Diagnosis (envelope instrumentation, then reverted):** handler returned `Succeeded=True, ActionCode=(empty), Data=False` → guards passed, handler succeeded, but **`SaveChangesAsync` returned 0 — NOTHING persisted** (not even FullName).

**Root cause:** `ApplicationDbContext` ctor (`ApplicationDbContext.cs:45`) sets `ChangeTracker.QueryTrackingBehavior = QueryTrackingBehavior.NoTracking` → `GetByIdAsync` (`FindAsync`) returns an **UNTRACKED** entity. Design D10 claimed "FindAsync tracks; handler's own SaveChangesAsync persists" — **premise false in this codebase**. `UpdateAsync` (`Entry.State = Modified`) was the ONLY thing attaching the entity; removing it made `SaveChangesAsync` a no-op. Pre-fix RED evidence corroborates: the 4 new tests were RED pre-fix precisely because `UpdateAsync` persisted the destructive writes.

**Fix (minimal, production):** `backend/src/Application/Features/UserManagement/Users/Commands/UpdateUser/UpdateUserCommand.cs` — restored `await _userRepository.UpdateAsync(user);` before `SaveChangesAsync` (with explanatory comment). Tri-state handler logic makes the restored full-column UPDATE safe: the entity carries fresh DB values (fetched), only body-specified fields are mutated, so non-body columns are written back unchanged. Verified against all spec scenarios (partial→preserve, ""→clear, omitted IsActive→preserve, explicit false→deactivate for Batch C). Zero new repo methods (RR-U1). Matches `UpdateUserPasswordCommandHandler` precedent.

**Test-side:** temporary envelope diagnostic added then fully reverted — `UsersUpdateTests.cs` is byte-identical to Batch A state.

## Deviations from design

- **D10 (remove `UpdateAsync`) REVERTED.** Spec/design intent (tri-state partial updates, no full-column data destruction) is preserved; only the mechanism changed because D10's premise ("FindAsync tracks") is false (context defaults to NoTracking). This is an implementation→spec alignment fix, NOT a test weakening.

## Risk note for verify (Batch C)

- `Update_partial_body_preserves_email_and_cellphone` and `Update_omitting_isActive_preserves_active_state` were **false-positive passes before this fix** (they assert *unchanged* values, which passed even with zero persistence). Post-fix they genuinely verify preservation.
- The D2/D4 canary `Update_as_super_admin_returns_200` only asserts HTTP 200 (never verified persistence) — persistence is now proven by tests 8–10.

---

# Batch C — tasks 3.1–3.3 (E2E tests 5–6 + full suite)

**Result: 12/12 Update suite + 26/26 regression run — ALL GREEN.** No production code changes. No git operations.

## Test evidence

Run 1 (build + run, Update filter): `Passed! - Failed: 0, Passed: 12, Skipped: 0, Total: 12, Duration: 643 ms`
Run 2 (regression, `--no-build`): `Passed! - Failed: 0, Passed: 26, Skipped: 0, Total: 26, Duration: 2 s`
Run 3 (per-test capture, `--no-build` detailed): 26/26 listed as Passed.

## New tests (3.1)

Appended to `backend/src/SMCA.WebApi.E2ETests/Users/UsersUpdateTests.cs` (existing 10 untouched):

- [x] **11. `Update_explicit_is_active_false_as_super_admin_deactivates`** — SuperAdmin actor, target `SeedUserWithRolesAsync` StoreUser; PUT `{FullName="Renamed", IsActive=false}` → HTTP 200; `GetUserByLoginAsync` (IgnoreQueryFilters) → `IsActive == false`. Verifies D4 admin toggle still works.
- [x] **12. `Update_owner_admin_edits_staff_returns_200`** — `UserSeed.SeedOwnerAdminWithStoreAsync` actor, DIFFERENT staff user target (`SeedUserWithRolesAsync`); PUT `{FullName="Edited by OA"}` → HTTP 200 + envelope `Succeeded == true`. Verifies D1 ownership guard allows admin≠self.

## 3.2 — Update suite: 12/12 GREEN

Per-test (all `UsersUpdateTests`):
1. ✅ `Update_as_super_admin_returns_200` (existing)
2. ✅ `Update_as_owner_admin_returns_200` (existing)
3. ✅ `Update_as_store_user_returns_403` (existing)
4. ✅ `Update_without_token_returns_401` (existing)
5. ✅ `Update_empty_body_returns_400` (existing)
6. ✅ `Update_nonexistent_id_returns_400` (existing)
7. ✅ `Update_other_user_as_store_user_with_profile_feature_returns_envelope_404` (new #1 — IDOR)
8. ✅ `Update_partial_body_preserves_email_and_cellphone` (new #2)
9. ✅ `Update_with_empty_cellphone_clears_value` (new #3)
10. ✅ `Update_omitting_isActive_preserves_active_state` (new #4)
11. ✅ `Update_explicit_is_active_false_as_super_admin_deactivates` (new #5 — D4 toggle)
12. ✅ `Update_owner_admin_edits_staff_returns_200` (new #6 — D1 admin≠self)

## 3.3 — Regression: 26/26 GREEN

Filter `FullyQualifiedName~UsersUpdateTests|FullyQualifiedName~UsersListTests` also matched `StoreUsersListTests` (substring) — broader than intended, all pass:
- 12 ✅ `UsersUpdateTests`
- 8 ✅ `UsersListTests`
- 6 ✅ `StoreUsersListTests`

**OwnerAdmin claim chain pre-verified (no production change needed):** `Update_as_owner_admin_returns_200` (GREEN) proves the OwnerAdmin token passes `[HasPermission(ProfileAdmin)]`, which requires `AdminClaim=true` via `ClaimsTransformerService` (`IsStoreAdmin` → `AdminClaim`, read by `HttpContextService.IsOwnerAdmin`). Test 6 confirms the D1 guard's `IsSuperAdminOrOwnerAdmin` branch works for a DIFFERENT target user.

## Deviations

None — implementation matches design (D1/D2/D4/D7/D9 + Batch B's D10 revert standing).

## Not done (later phases)

- Phase 4 (4.1–4.2): archive-time spec alignment — deferred, main specs untouched. **Change is ready for sdd-verify.**

---

# Batch D — Verify WARNING 1 closure: E2E-U4(a) StoreUser+Profile self-IsActive test

**Result: 13/13 Update suite GREEN (x2 stable runs).** One test added (test file only — zero production changes). **No git operations.**

## Test added (verify-report WARNING 1 / CH-U4 4d / E2E-U4 4a — the missing non-admin IsActive-ignore branch coverage)

`Update_as_store_user_with_profile_keeps_own_is_active` — appended to `backend/src/SMCA.WebApi.E2ETests/Users/UsersUpdateTests.cs`:

- Actor: `var actor = await AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Profile);` → `StoreUserFixture(UserId, Login, OwnerUserId, OwnerId, StoreId, TenantId)`; seeded user is ACTIVE by default (`AuditableEntity.IsActive = true` at `AuditableEntity.cs:7`, seed never flips it).
- Actor edits SELF: PUT `/api/v1/users/{actor.UserId}` body `{ FullName = "Self edit", IsActive = false }` — D1 allows self for non-admin; the D4 gate's left conjunct (`IsSuperAdminOrOwnerAdmin`) must be false → `isActive:false` IGNORED.
- Asserts: HTTP 200 + envelope `Succeeded == true` (`ApiResponse<bool>` pattern) + DB (`GetUserByLoginAsync(_f, actor.Login)`, IgnoreQueryFilters) `IsActive == true` (UNCHANGED).
- Cleanup: `AuthzSeed.CleanupStoreGraphAsync(_f, actor.StoreId, actor.UserId, actor.OwnerUserId)` — exact convention from `Update_other_user_as_store_user_with_profile_feature_returns_envelope_404`.
- RED-ability: if the admin gate were removed, `IsActive.HasValue` → `user.IsActive = false` → DB false → assertion fails. Genuine coverage of the ignore branch.

## Test evidence

Run 1 (build + run): `Passed! - Failed: 0, Passed: 13, Skipped: 0, Total: 13, Duration: 554 ms`
Run 2 (stability, `--no-build`): `Passed! - Failed: 0, Passed: 13, Skipped: 0, Total: 13, Duration: 521 ms`

13 = 12 prior (6 existing + 6 Batch A/C) + 1 new. The `ValidationException` ERR log during the run is the expected validator-400 path from `Update_nonexistent_id_returns_400` (ErrorHandlerMiddleware logging — not a failure).

## Deviations

None. Task matched the design's original test 4 intent (`Update_as_store_user_with_profile_keeps_own_is_active`, design.md:65); body deliberately includes `isActive:false` (not omitted) so the ignore-branch — not just the omitted-value branch — is covered.

## Not done (later phases)

- Phase 4 (4.1–4.2): archive-time spec alignment (CH-U6 UpdateAsync rewrite + users-e2e R3 404→400/IDOR row) — still deferred, main specs untouched. **Change is ready for sdd-verify re-check / sdd-archive.**
