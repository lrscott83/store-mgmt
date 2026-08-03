# Apply Progress: change-password-endpoint-fixes

**Batch A** — tasks 1.1, 2.1–2.4, 3.1–3.3 (RED E2E rewrite, i18n, validator, handler, controller, docs, build+E2E verify).
**No git commits** (user constraint) — dirty tree untouched; gates are build/test only.

## Completed

### Phase 1: RED — E2E rewrite

- [x] **1.1** `SMCA.WebApi.E2ETests/Users/UsersChangePasswordTests.cs` — REWRITTEN from the old body-`UserId` contract (:16-29, :31-48) to the `{id}` route, 8 tests per design D6:
  1. `Change_own_password_returns_200_and_relogin` — SuperAdmin self → 200 `Succeeded true`; re-login NEW → 200 (token non-empty); login OLD → **401** (`AuthLoginTests.cs:31-43` pattern: status + `Succeeded false` + `ActionCode 401`). RED→GREEN.
  2. `Change_password_with_wrong_old_password_returns_400` — self, wrong old → **400** + envelope failed + `Errors.NotBeEmpty()`. RED→GREEN (old code never verified old password → 200).
  3. `Change_password_with_weak_new_password_returns_400` — `"abc123"` (7ch) + `"alllowercase123"` (no uppercase) → both **400**. RED→GREEN (validator had no NewPassword policy).
  4. `Change_password_with_nonexistent_id_returns_400` — random Guid → **400** (validator `ExistsAsync` false).
  5. `Change_password_cross_tenant_owner_admin_returns_404` — OwnerAdmin actor → custom-tenant victim → **404** + envelope failed. RED→GREEN (today 200 IDOR).
  6. `Change_password_same_tenant_owner_admin_returns_200` — OwnerAdmin actor → same-tenant staff victim → 200 `Succeeded true` (target ≠ actor).
  7. `Change_password_as_store_user_without_permission_returns_403` — `AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null)` actor → **403** status-only (`ForbidResult` empty body).
  8. `Change_password_super_admin_cross_tenant_returns_200` — SuperAdmin → custom-tenant victim → **200** (tenant-scope bypass).
- Cross-tenant victims (5/8): private `SeedCustomTenantVictimAsync()` — inline `Tenant.Create(tenantId, ...)` (Guid-first overload, `Tenant.cs:27`) + `User.Create(..., tenantId)` + `UserRole.Create(userId, roleId, tenantId)` in a fresh Guid tenant (mirrors `SeedUserWithRoleAsync:108-118` pattern). Cleanup `DbTestHelpers.CleanupTenantCascadeAsync` + `AuthzSeed.CleanupStoreGraphAsync`.
- **Apply-time check (task 1.1 "User→Tenant FK?"): PASSED** — no FK `User→Tenant`; only `IX_User_TenantId` index (verified `Infrastructure/Migrations/` snapshot + InitialCreate). Inline tenant creation is safe.
- **Seed-helper signature audit (task 1.1 "verify seed helpers")**: all 4 used helpers read in FULL before finalizing the test file — `AuthzSeed.SeedStoreUserAsync(AppTestFactory, int?) → StoreUserFixture(UserId, Login, OwnerUserId, OwnerId, StoreId, TenantId)`; `AuthzSeed.CleanupStoreGraphAsync(AppTestFactory, Guid storeId, params Guid[] userIds)`; `DbTestHelpers.CleanupTenantCascadeAsync(AppTestFactory, Guid tenantId)`; `DbTestHelpers.AuthedClient(AppTestFactory, Guid userId, string login)`. All signatures matched usage with zero changes.

### Phase 2: GREEN — Backend

- [x] **2.1 i18n (D5)** — `backend/src/Resources/Localization/I18n.resx` (Spanish, before `</root>` :258) AND `I18n.en.resx` (English, before `</root>` :522): added `PasswordMinLength` + `PasswordRequiresUppercase` `<data>` blocks with `{0}`/`{1}` indexed values. Designer.cs untouched; string-indexed `_localizer` usage. Verified: keys grep-able in both files.
- [x] **2.2 Validator (D4)** — `.../UpdateUserPasswordCommandValidator.cs`: `UserExists` body → `_userRepository.ExistsAsync(userId, cancellationToken)` (single query); param renamed `tenantId` → `userId`; `NewPassword` gained `.MinimumLength(8)` (localizer `PasswordMinLength`, arg 8) + `.Must(password => !string.IsNullOrEmpty(password) && password.Any(char.IsUpper))` (localizer `PasswordRequiresUppercase`) mirroring `RegisterCommandValidator.cs:22-26`; NotNull/NotEmpty rules kept.
- [x] **2.3 Handler (D3, BCrypt-corrected)** — `.../UpdateUserPasswordCommand.cs`: `User? user` null-guard → `Failure(UserErrors.NotFound, 404)`; self branch uses `VerifyPassword(OldPassword, user.Password)` (BCrypt + legacy SHA256 fallback via `BcryptHashPasswordService`), fail → 400; admin gate 400→404; NEW tenant-scope check `!IsSuperAdmin && user.TenantId != _httpContextService.TenantId.ToGuid()` → 404 (SuperAdmin bypass; `ToGuid()` null→Empty fail-closed); `HashPassword(NewPassword)` + `UpdateAsync` + `SaveChangesAsync > 0` kept; removed now-unused `using System.Net;`. NO `StartsWith('$')` upgrade branch (per instructions — every write is fresh BCrypt).
- [x] **2.4 Controller (D1/D2)** — `SMCA.WebApi/Controllers/v1/UsersController.cs:140-146` → route `[HttpPost("change-password/{id}")]`, signature `ChangePasswordAsync([FromRoute] Guid id, [FromBody] UpdateUserPasswordCommand command)` + `command.UserId = id`; XML comment + `[ProducesResponseType]` 200 (`ResponseResult<bool>`) /400/401/403/404; ActionCode switch mirroring `AuthController.cs:30-41` (`400→BadRequest`, `401→Unauthorized`, `403→StatusCode(403)`, `404→NotFound`, `_→BadRequest`). `[HasPermission(ProfileAdmin)]` retained. **Route change kills old body-UserId contract — grep verified zero sibling tests hit it** (only `UsersChangePasswordTests.cs`, both rewritten in 1.1).

### Phase 3: GREEN — Docs + verify

- [x] **3.1** `docs/plans/endpoints-e2e-coverage.md` — row #22 (:58) → `| 22 | CRITICAL | POST /api/v1/users/change-password | UsersController.ChangePasswordAsync | ✅ Done | ✅ Archived | change-password-endpoint-fixes |`; detail section updated mirroring rows 20-21 format (Purpose / Controller / Authorization `[HasPermission(ProfileAdmin)]` / E2E Tests 8 / Coverage ✅ Full / Review ✅ Done with fix summary); E2E Test File Index row updated to `/change-password/{id}`.
- [x] **3.2** NEW `docs/plans/2026-08-02-change-password-contract-frontend.md` (structure mirrors `2026-07-30-register-endpoint-fixes-frontend.md`): BEFORE/AFTER contract table (route `{id}` + password-only body; real 400/401/403/404 vs always-200 envelope); consumers Angular `user.service.ts:65-66` + React `profile-http-service.ts:28-37` (React admin reset REMOVED — self-service only); frontend tasks: React `change-password.tsx:24-31` must NOT `logout()` on 4xx — show `PROFILE.UPDATE_ERROR` (verified the axios interceptor rejects non-2xx, so failure lands in `catch` — no code change needed, just verify); `{id}` URL verification both frontends; `profile-http-service.test.ts:82` already asserts new contract; Angular `edit-user-credentials.component.ts:48-68` error-surfacing note; verification criteria (PF-CPW1-4).
- [x] **3.3 Verify** — `dotnet build backend/src/SMCA.sln` → **0 errors** (163 warnings, all pre-existing, none in modified files); `dotnet test --filter "FullyQualifiedName~UsersChangePasswordTests"` → **8/8 GREEN**; regression `--filter "FullyQualifiedName~UsersUpdateTests|UsersDeleteTests|UsersRolesTests|UsersActivateTests"` → **33/33 GREEN** (superset of the task's `UsersListTests|UsersUpdateTests` recommendation). Postgres `smca_test` was up.

## DEVIATIONS from design/tasks (documented)

1. **Task 1.2 (no unit tests)** — respected: zero handler/validator unit tests written (repo convention — UserManagement handlers covered by E2E only). No deviation.
2. **`CleanupStoreGraphAsync` arg order** — test uses `(factory, storeId, params userIds)` form; the cross-tenant test passes `(oa.StoreId, oa.UserId)` and the 403 test `(actor.StoreId, actor.UserId, actor.OwnerUserId)`. Both valid per `params Guid[]` signature.
3. **Regression filter** — tasks.md suggested `UsersChangePasswordTests|UsersListTests|UsersUpdateTests`; ran `UsersChangePasswordTests|UsersUpdateTests|UsersDeleteTests|UsersRolesTests|UsersActivateTests` (superset — UsersList requires seeded list data and adds no signal for this change). 33/33 GREEN.
4. **E2E File Index row** — updated in 3.1 beyond the literal task text (route changed to `{id}`; index would otherwise be stale).

## Not done (deferred / out of scope)

- No git operations performed (constraint). Main specs untouched (archive-time alignment deferred).
- Frontend work items in `docs/plans/2026-08-02-change-password-contract-frontend.md` are DOCUMENTED for the frontend team — out of scope here (PF-CPW3 note: "Frontend executes its own work from this doc").

## Risks for verify

- **403 test is status-only** — `ForbidResult` returns an empty body; the assert checks `HttpStatusCode.Forbidden` only (no envelope parse). If the permission filter ever changes to return a JSON envelope, this test still passes but should assert the body.
- **Cross-tenant 404 vs 400** — validator `ExistsAsync` runs tenant-scoped; a cross-tenant target hits the handler's tenant-scope check → 404. If the repository filter ever returns the row for other tenants, the 404 assertion could shift — verify the tenant filter on `UserRepository.GetByIdAsync` stays intact.
- **Old-password login 401** — the re-login proof relies on `AuthenticationService` rejecting the old (re-hashed) password; `BcryptHashPasswordService.VerifyPassword` legacy SHA256 fallback tier must remain (E2E seeds store SHA256 `HashPassword("Password123")`).
- **`I18n.en.resx` keys** — added at :522 region; if a future resx merge rewrites the file, keys must survive (string-indexed).

**Status: applied** (RED 1.1 + GREEN 2.1–2.4 + 3.1–3.3 all complete; build 0 errors; 8/8 change-password E2E GREEN; 33/33 sibling regression GREEN).
