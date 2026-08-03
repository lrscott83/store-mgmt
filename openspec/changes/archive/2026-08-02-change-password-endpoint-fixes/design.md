# Design: Change Password Endpoint Fixes

**Change**: `change-password-endpoint-fixes` — `POST /api/v1/users/change-password/{id}` (plan #22)
**Date**: 2026-08-02 | **Mode**: HYBRID

## Technical Approach

Mirror the archived sibling pattern (`update-user-endpoint-fixes` D9/D11, `user-roles-endpoint-fixes`): handler null-guard → envelope 404, validator `GetByIdAsync` → `ExistsAsync`, controller metadata per `UpdatedAsync:59-70`. Deltas where evidence is unambiguous: route gains `{id}` + `[FromBody]` (the ONLY shape both frontends call — the current body-`UserId` route is unreachable), failure ActionCodes map to REAL HTTP statuses via an `AuthController.cs:30-41`-style switch (spec UC-CPW3 requires real 404 — unlike UpdateUser's 200+envelope), admin branch gains a tenant-scope check (closes the `FindAsync` filter-skip IDOR), and 2 missing resx keys fix register's literal-key fallback.

**Root cause mechanism (verified against DI, not class presence)**: the ACTIVE `IHashPasswordService` is **`BcryptHashPasswordService`** — registered at `Application/DependencyInjection.cs:62`, wired into SMCA.WebApi via `AddApplication` (`Program.cs:56-57`). `HashPassword` = `BCrypt.Net.BCrypt.HashPassword(password, workFactor)` (**random salt** per call — `BcryptHashPasswordService.cs:15-18`; proven by `BcryptHashPasswordServiceTests.cs:48-57`: same password → different hashes). Therefore the handler's self-branch compare `HashPassword(request.OldPassword) != user.Password` (`UpdateUserPasswordCommand.cs:51-53`) can NEVER match ANY stored hash (fresh random salt every call) — **self-service old-password verification is 100% broken for ALL users**. Review finding #1 is confirmed as written. The SHA256-deterministic `SMCA.WebApi/Services/HashPasswordService.cs` is NOT registered in SMCA.WebApi (grep: class definition only) — dead code in that project; only `WebApiTest/Program.cs:39` registers it (unit-test harness project).

`BcryptHashPasswordService.VerifyPassword` (`:20-36`) is 3-tier: BCrypt (stored hash starts `$`), legacy SHA256+pepper (`LegacyHash` `:47-65`), legacy raw SHA256 (`:31-35`). E2E seeds store **raw SHA256** (`DbTestHelpers.HashPassword`, `DbTestHelpers.cs:21-22`) → tier-3 fallback accepts them → VerifyPassword-based handler + re-login assertions remain valid for both real BCrypt users and E2E seeds. The `AuthenticationService.cs:51-56` login-time upgrade (`!user.Password.StartsWith('$')` → re-hash BCrypt) is REAL (matches `NeedsUpgrade` `:42-45`) — legacy accounts upgrade at login.

## Architecture Decisions

### D1 — Route contract (`UsersController.cs:140-146`)

```csharp
/// <summary>
/// Change password for user by id
/// </summary>
/// <param name="id">User Id</param>
/// <returns></returns>
[HttpPost("change-password/{id}")]
[ProducesResponseType(typeof(ResponseResult<bool>), StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
[HasPermission(StoreRoleFeatures.ProfileAdmin)]
public async Task<IActionResult> ChangePasswordAsync([FromRoute] Guid id, [FromBody] UpdateUserPasswordCommand command)
{
    command.UserId = id;
    var result = await Sender.Send(command);
    return result.Succeeded ? Ok(result) : result.ActionCode switch { ... };  // D2
}
```

Choice: route `{id}` + `[FromBody]`, id authoritative via `command.UserId = id` (mirrors `UpdatedAsync:66-69`). Rationale: Angular `user.service.ts:65-66` and React `profile-http-service.ts:28-37` both call `change-password/{id}` — zero in-repo consumers of the body-`UserId` contract (verified: proposal finding #6). XML comment + ProducesResponseType 400/401/403/404 added (siblings `UpdatedAsync:59-64` / `DeleteUserAsync:72-83` have both; current action has neither). Filter retained (`[HasPermission(StoreRoleFeatures.ProfileAdmin)]`, UC-CPW1 1c).

### D2 — ActionCode switch for REAL statuses

```csharp
if (result.Succeeded) return Ok(result);
return result.ActionCode switch
{
    400 => BadRequest(result),
    401 => Unauthorized(result),
    403 => StatusCode(403, result),
    404 => NotFound(result),
    _ => BadRequest(result)
};
```

Choice: **controller switch** (PICKED over ApiException in handler). Rationale: mirrors `AuthController.cs:30-41`; `ResponseResult.Failure<T>(error, actionCode)` already carries ActionCode (`ResponseResult.cs:14-15` → ctor `ActionCode = actionCode` at `:29`) — zero handler changes needed for status mapping. 404 is REAL `NotFound` (spec UC-CPW3 + D2 product decision) — the ONE deliberate deviation from the sibling's 200+envelope, required by the React consumer which rejects on non-2xx. Validation failures reach here as thrown `ValidationException` → real 400 via the FluentValidation pipeline (proven by `Update_empty_body_returns_400`), not via this switch.

### D3 — Handler rewrite (`UpdateUserPasswordCommand.cs`)

```csharp
public async Task<ResponseResult<bool>> Handle(UpdateUserPasswordCommand request, CancellationToken cancellationToken)
{
    User? user = await _userRepository.GetByIdAsync(request.UserId);
    if (user is null)                                       // CH-CPW1 null guard
        return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);

    if (request.UserId == _httpContextService.UserExternalId.ToGuid())
    {
        if (!_hashPasswordService.VerifyPassword(request.OldPassword, user.Password))   // CH-CPW2
            return ResponseResult.Failure<bool>(UserErrors.InvalidCredentials, 400);
    }
    else if (!_httpContextService.IsSuperAdminOrOwnerAdmin) // CH-CPW3 3d — gate value 400→404
        return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);

    if (!_httpContextService.IsSuperAdmin
        && user.TenantId != _httpContextService.TenantId.ToGuid())   // CH-CPW3 tenant scope
        return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);

    user.Password = _hashPasswordService.HashPassword(request.NewPassword);
    await _userRepository.UpdateAsync(user);                // CH-CPW5 untracked-entity attach
    return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
}
```

- **Null guard** `User? user` + `Failure(UserErrors.NotFound, 404)` — mirrors `UpdateUserCommand.cs:46-48`. `GetByIdAsync`→`FindAsync` returns null despite `Task<User>` (`GenericRepository.cs:82-85`); `User?` assignment is the sibling-verified widening (no interface change).
- **Self branch** uses `VerifyPassword` (mirror `AuthenticationService.cs:44`); zero `HashPassword` calls against `OldPassword` (CH-CPW2 2c). Wrong old → ActionCode **400** (product decision D2 — user is authed; NOT 401). `VerifyPassword` (`BcryptHashPasswordService.cs:20-36`) accepts BCrypt AND legacy SHA256+pepper AND raw SHA256 — real BCrypt users and E2E raw-SHA256 seeds (DbTestHelpers.cs:22) both verify.
- **Admin branch** keeps the `IsSuperAdminOrOwnerAdmin` gate (structure unchanged, value 400→**404** — sibling anti-enumeration `UpdateUserCommand.cs:50-51`; spec CH-CPW3 3d says 404; today it's 400 at `:56`, no E2E covers the path). Tenant-scope: SuperAdmin bypasses (`!IsSuperAdmin` short-circuit — E2E-CPW10); OwnerAdmin/others must have `user.TenantId == _httpContextService.TenantId.ToGuid()` or 404 anti-enumeration (CH-CPW3 3a). `User.TenantId` readable (`User.cs:25`); claim populated per-request by `ClaimsTransformerService.cs:40` (registered `Program.cs:54` — INCLUDING E2E-minted tokens).
- **ToGuid() null behavior**: `GuidExtensions.cs:12-21` — null/unparseable → `Guid.Empty`. Fail-closed: real tenant ids are never `Guid.Empty`, so a missing claim ⇒ mismatch ⇒ 404 (correct anti-enumeration). No extra guard needed.
- **Legacy-upgrade branch: SKIPPED — do NOT reintroduce `StartsWith('$')` here** (decided). Correct rationale: this handler ALWAYS writes a fresh BCrypt hash (`user.Password = HashPassword(NewPassword)`, `BcryptHashPasswordService.cs:15-18`) — every successful change IS the upgrade (upgrade-by-change), so an explicit `NeedsUpgrade`/`StartsWith('$')` check would be redundant. The login-time upgrade at `AuthenticationService.cs:51-56` remains the mechanism for the read path (legacy account logs in → hash upgraded); this handler's write path normalizes unconditionally.
- **UpdateAsync retained** (CH-CPW5): `ApplicationDbContext` is `NoTracking`; `GetByIdAsync` returns an UNTRACKED entity; `UpdateAsync` (`Entry.State = Modified`, GenericRepository.cs:39-43) attaches it — same note as `UpdateUserCommand.cs:59-62`.

### D4 — Validator (`UpdateUserPasswordCommandValidator.cs`)

- `MustAsync(UserExists)` body → `return await _userRepository.ExistsAsync(userId, cancellationToken);` — verified: `UserRepository.cs:99-102` (`IgnoreQueryFilters().AnyAsync`, `new` hides base, `IUserRepository.cs:19`). Single lightweight query, no `GetByIdAsync` double-fetch (VL-CPW1; finding #5).
- Param rename `tenantId` → `userId` (VL-CPW2; `:38` today misnames a user id as tenant id — hides the cross-tenant bug class).
- NewPassword policy (VL-CPW3), mirroring `RegisterCommandValidator.cs:22-26`:

```csharp
RuleFor(x => x.NewPassword)
  .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
  .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
  .MinimumLength(8).WithMessage(_localizer["PasswordMinLength", "{PropertyName}", 8])
  .Must(password => !string.IsNullOrEmpty(password) && password.Any(char.IsUpper))
      .WithMessage(_localizer["PasswordRequiresUppercase", "{PropertyName}"]);
```

OldPassword/NewPassword `NotNull/NotEmpty` retained (VL-CPW4). Failures → `ValidationException` → real HTTP 400.

### D5 — i18n keys (BOTH files; string-indexed, Designer.cs untouched)

Keys do NOT exist today (grep: zero hits) — register currently falls back to literal key names. resx values use indexed placeholders (`IsRequired` = `{0} es requerido`, I18n.resx:168-170). Insert before `</root>` (I18n.resx:258; I18n.en.resx:522):

I18n.resx (Spanish default):
```xml
<data name="PasswordMinLength" xml:space="preserve">
  <value>{0} debe tener al menos {1} caracteres</value>
</data>
<data name="PasswordRequiresUppercase" xml:space="preserve">
  <value>{0} debe contener al menos una letra mayúscula</value>
</data>
```
I18n.en.resx (English):
```xml
<data name="PasswordMinLength" xml:space="preserve">
  <value>{0} must be at least {1} characters</value>
</data>
<data name="PasswordRequiresUppercase" xml:space="preserve">
  <value>{0} must contain at least one uppercase letter</value>
</data>
```

### D6 — E2E rewrite (`UsersChangePasswordTests.cs`) — 8 tests

Seed/assert conventions (proven siblings): `DbTestHelpers.SeedSuperAdminAsync` / `AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId)` / `UserSeed.SeedOwnerAdminWithStoreAsync` / `UserSeed.SeedUserWithRolesAsync`; `DbTestHelpers.AuthedClient` (minted token — claims enriched by ClaimsTransformerService per request); envelope asserts `Succeeded == false` + `Errors.NotBeEmpty()` (never localized `Description`); login via `POST /api/v1/auth/login` `{ Login, Password }` (AuthLoginSuccessTests.cs:28-29). E2E seeds store raw SHA256 → `VerifyPassword` tier-3 fallback accepts them → the re-login assertions (new password 200 / old password 401) are valid.

| # | Test | RED→GREEN | Setup → Assert |
|---|------|-----------|----------------|
| 1 | `Change_own_password_returns_200_and_relogin` | **RED** (kills 200 false-positive) | SuperAdmin self; POST `change-password/{id}` `{ OldPassword="Password123", NewPassword="NewPass123!" }` → 200 `Succeeded true`; re-login new → 200+token; login old → **401** (E2E-CPW3) |
| 2 | `Change_password_with_wrong_old_password_returns_400` | **RED** (today 200+envelope-failed) | Self; wrong old → **400** + envelope failed (E2E-CPW4) |
| 3 | `Change_password_with_weak_new_password_returns_400` | RED | Self; `"abc123"` (7) and `"alllowercase123"` → 400 (E2E-CPW5) |
| 4 | `Change_password_with_nonexistent_id_returns_400` | GREEN (contract guard) | SuperAdmin; random Guid route → 400 (E2E-CPW6; validator ExistsAsync single query) |
| 5 | `Change_password_cross_tenant_owner_admin_returns_404` | **RED** (today 200 — IDOR) | OwnerAdmin actor (`SeedOwnerAdminWithStoreAsync`); victim in custom tenant → **404** + envelope (E2E-CPW7) |
| 6 | `Change_password_same_tenant_owner_admin_returns_200` | GREEN (guard not over-blocking) | OwnerAdmin → same-tenant StoreUser target (≠ actor) → 200 `Succeeded true` (E2E-CPW8) |
| 7 | `Change_password_as_store_user_without_permission_returns_403` | GREEN (filter contract) | `SeedStoreUserAsync(_f, grantedFeatureId: null)` → 403, **status-only** (ForbidResult empty body; E2E-CPW9) |
| 8 | `Change_password_super_admin_cross_tenant_returns_200` | RED (needs tenant check to NOT block) | SuperAdmin → custom-tenant target → 200 (E2E-CPW10) |

**Cross-tenant victim seeding** (tests 5/8 — no existing seed produces a non-default `User.TenantId`): inline in-test via scope — `db.Set<Tenant>().Add(Tenant.Create(tenantId, "E2E XTenant", "e2e", DateTimeOffset.UtcNow))` + `User.Create(login, DbTestHelpers.HashPassword("Password123"), ..., tenantId)` + `UserRole.Create(user.Id, RoleType.StoreUser, tenantId)` (pattern: `DbTestHelpers.SeedUserWithRoleAsync:108-118` + custom tenant; register precedent `AuthRegisterSuccessTests` uses `CleanupTenantCascadeAsync`). Cleanup: `DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId)` (DbTestHelpers.cs:82-97) + actor cleanup via `AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId)`. **Apply-time check**: whether `User` has an FK to `Tenant` — if yes, Tenant row required (designed); if no, Tenant insert harmless.

Re-login (test 1) works because SuperAdmin skips the active-store gate (`AuthenticationService.cs:88-90`).

### D7 — Plan doc row #22 (`docs/plans/endpoints-e2e-coverage.md:58`)

Row 58 → `| 22 | CRITICAL | POST /api/v1/users/change-password | UsersController.ChangePasswordAsync | ✅ Done | ✅ Archived | change-password-endpoint-fixes |` (exact format of rows 20-21 at :56-57). Detail section :306-313 mirrors rows 20-21 (:288-304): Purpose / Controller / Authorization `[HasPermission(ProfileAdmin)]` / E2E Tests (8 tests list) / Coverage ✅ Full / Review ✅ Done (summary of fixes). **Note**: statuses set at APPLY (D11) — the change must be applied+archived before the row reads "Archived".

### D8 — Plan-frontend doc (`docs/plans/2026-08-02-change-password-contract-frontend.md`, NEW)

Structure per `2026-07-30-register-endpoint-fixes-frontend.md`:
1. **Header**: `# Change Password Endpoint Fixes — Frontend Impact`, Date 2026-08-02, Backend change ref.
2. **Contract BEFORE vs AFTER table**: `POST /api/v1/users/change-password` + body `UserId` → `POST /api/v1/users/change-password/{id}` + password-only body; HTTP 200 always → real 400/401/403/404 + envelope (PF-CPW1).
3. **Consumers** (PF-CPW2): Angular `user.service.ts:65-66` already calls `change-password/${id}` (no URL change); React `profile-http-service.ts:28-37` already calls `/v1/users/change-password/${userId}` — **note React admin reset REMOVED**, self-service profile only.
4. **Frontend tasks** (PF-CPW3): (a) React `change-password.tsx:24-31` calls `logout()` on ANY resolved response — with real 4xx the failure lands in `catch`; must show `PROFILE.UPDATE_ERROR` instead of logout; (b) verify `{id}` URL in both frontends; (c) update tests — `profile-http-service.test.ts:82` keeps `POST /v1/users/change-password/u1` (verify against new contract), remove any body-`UserId` shape asserts.
5. **Verification** (PF-CPW4): reachability with `{id}`; wrong-old-password → inline error + session survives; success still logs out (product decision — password change forces re-auth); frontend unit tests pass.

## Data Flow

```
POST /api/v1/users/change-password/{id}  [Authorize] → [HasPermission(ProfileAdmin)]   [filter: 403 ForbidResult]
 → Validator: UserId ExistsAsync(userId, ct) [1 q, IgnoreQueryFilters] + NewPassword 8/upper   [fail → ValidationException → real 400]
 → Handler: GetByIdAsync → FindAsync (SKIPS tenant filter, GenericRepository.cs:84)
     → user null ? Failure(UserErrors.NotFound, 404)                        [D3 null guard]
     → self ? VerifyPassword(old, user.Password)                            [fail → 400]
     → !IsSuperAdminOrOwnerAdmin ? Failure(NotFound, 404)                   [gate 400→404]
     → !IsSuperAdmin && user.TenantId != claim.ToGuid() ? Failure(NotFound, 404)   [tenant scope]
     → user.Password = HashPassword(new) [BCrypt random salt]; UpdateAsync; SaveChangesAsync > 0 → Success
 → Controller: Succeeded ? Ok : ActionCode switch 400/401/403/404 → real HTTP status + envelope   [D2]
```

## File Changes

| File | Action | Change |
|------|--------|--------|
| `backend/src/Application/.../Commands/UpdateUserPassword/UpdateUserPasswordCommand.cs` | Modify | D3: null guard, VerifyPassword, gate→404, tenant-scope check, keep UpdateAsync+SaveChangesAsync |
| `.../UpdateUserPasswordCommandValidator.cs` | Modify | D4: ExistsAsync + rename + NewPassword policy |
| `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` | Modify | D1/D2: route `{id}`, `[FromBody]`, `command.UserId = id`, ProducesResponseType, XML comment, ActionCode switch |
| `backend/src/Resources/Localization/I18n.resx` + `I18n.en.resx` | Modify | D5: 2 keys each (before `</root>`) |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersChangePasswordTests.cs` | Rewrite | D6: 8 tests, real statuses + re-login + cross-tenant seeds |
| `docs/plans/endpoints-e2e-coverage.md` | Modify | D7: row #22 + detail section (at apply) |
| `docs/plans/2026-08-02-change-password-contract-frontend.md` | Create | D8 |
| `openspec/specs/users-e2e/spec.md` R8 | Modify (archive) | 404→400; wrong-old pinned 400 (E2E-CPW1/2) |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| E2E | 8 tests above | RED→GREEN matrix; envelope asserts `Succeeded false` + `Errors.NotBeEmpty()`; never localized Description; 403 status-only |
| Regression | UsersListTests / UsersUpdateTests | `dotnet test backend/src/SMCA.WebApi.E2ETests` (Postgres `smca_test`) |

## Migration / Rollout

No migration, no feature flags. Per-file additive revert per proposal Rollback Plan. Route change breaks zero in-repo consumers (verified). No git commits this phase.

## Open Questions / Discrepancies (apply must adapt)

1. **Hash mechanism (RESOLVED — no discrepancy)**: the active implementation is `BcryptHashPasswordService` (BCrypt random salt, `DependencyInjection.cs:62`). The review finding #1 ("random-salt compare can never match") is CORRECT as written; the previous design revision's "no BCrypt in the stack" claim was an error (it read the unregistered `SMCA.WebApi/Services/HashPasswordService.cs` instead of the DI registration). Design decisions are unaffected: fix = `VerifyPassword` (3-tier, `BcryptHashPasswordService.cs:20-36`); do NOT reintroduce a `StartsWith('$')` upgrade branch in this handler (upgrade-by-change — every write is a fresh BCrypt hash).
2. **Spec CH-CPW3 row 3d** ("envelope 404, unchanged gate") vs source `UpdateUserPasswordCommand.cs:56` (returns 400): designed 404 per spec/sibling anti-enumeration; no E2E covers it.
3. **Cross-tenant E2E victim** requires a non-default `User.TenantId` — no existing seed does this; inline Tenant+User+UserRole seeding designed (check Tenant FK at apply; `CleanupTenantCascadeAsync` proven).
4. **E2E-CPW9 cleanup**: spec says `CleanupStoreGraphAsync` (implies `SeedStoreUserAsync(null)`); simpler proven alternative = bare StoreUser + `CleanupUserAsync` (current test). Design picks `SeedStoreUserAsync(null)` per sibling precedent (user-roles D6).
5. **Plan doc row #22** "✅ Done | ✅ Archived" is set at apply, not design.
