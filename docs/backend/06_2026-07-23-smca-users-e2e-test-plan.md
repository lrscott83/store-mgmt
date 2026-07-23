# 06 — SMCA.WebApi Users E2E — Test Plan

**Date:** 2026-07-23
**Scope:** the 8 endpoints of `UsersController` (`api/v1/Users`). Behavior + validation + bug-pins.
**Depends on / reuses:** the `04`/`05` harness (`AppTestFactory`, `WebAppFixture`, `ApiResponse<T>`,
`DbTestHelpers`, `StoreSeed`, `AuthzSeed`) against real Postgres `smca_test`.

---

## 1. Scope boundary (vs `05`)

`05` (Authorization) owns **who can access** — the role × feature × scope matrix and the 403s. This plan
owns **what each endpoint does**: validation rules, handler success/failure branches, and the pinned bugs.
It does NOT re-run the permission matrix; it uses an OwnerAdmin/SuperAdmin as the happy actor and adds only
a light "wrong role → 403" smoke per gate to confirm wiring.

## 2. Verified contract facts (code-cited — bake into assertions)

- Controllers `return Ok(await Sender.Send(...))` → HTTP is **always 200** unless a handler/pipeline
  **throws**. Real non-200 codes come only from `ErrorHandlerMiddleware` catching exceptions
  (`ErrorHandlerMiddleware.cs:24-70`).
- **Validation = HTTP 400.** `ValidationBehaviour` throws `ValidationException` on any failed rule
  (`ValidationBehaviour.cs:16-28`); `ErrorHandlerMiddleware` maps it to **400**. Body `Errors` = list of
  `(PropertyName, ErrorMessage)`; the **code is the validator error key** (`IsRequired`, `UserNotFound`,
  `EmailFormatInvalid`, `RoleNotFound`), NOT a `UserErrors` code.
- `UsersController` is `[Authorize]` class-level, no class-level `[HasPermission]`
  (`UsersController.cs:20-22`). Each method carries its own `[HasPermission]`.
- Per-endpoint permission: list/get-by-id/delete/activate/AddUserRoles/DeleteUserRoles →
  `UsersAdmin`; update (profile edit)/change-password → `ProfileAdmin` (broader: OwnerAdmin/StoreUser/
  ReSeller). Denial = **403 ForbidResult**; SuperAdmin bypasses.
- **`change-password` failures are soft (200-wrapped):** wrong old password (self-service) OR a non-admin
  changing someone else's password → HTTP **200**, `Succeeded=false`, `ActionCode=400`, code
  `User.InvalidPassword` (`UpdateUserPasswordCommand.cs:51-56`). The validator failures (missing fields)
  are the hard **400** path.
- **`DELETE {id}` is a soft-deactivate** — sets `IsActive=false`, does not remove the row
  (`DeleteUserCommand.cs`). A non-admin caller → `ApiException(..., BadRequest)` → real **400**.
- **`PUT {id}` `IsActive` is privileged** — only applied when the caller `IsSuperAdminOrOwnerAdmin`
  (`UpdateUserCommand.cs:49-50`); a plain StoreUser editing their own profile cannot toggle it.
- **`POST activate` ignores the body `IsActive`** and unconditionally sets `IsActive=true`
  (`ActivateUserCommand.cs`); non-admin caller → `ApiException` 400.

## 3. Bugs to PIN (as-is, like the register-500 in `02`)

- **BUG #1 — activate has no validation.** `ActivateUserCommandValidator : AbstractValidator<DeleteUserCommand>`
  (`ActivateUserCommandValidator.cs:14`) validates the WRONG command, so `ActivateUserCommand` has no
  `UserExists`/`IsRequired` check. `POST /Users/activate` with a nonexistent `Id` bypasses validation and
  NPEs in the handler → **HTTP 500** (not 400). Pin the 500; update when fixed.
- **BUG #2 — new password stored in plaintext.** `UpdateUserPasswordCommand` sets
  `user.Password = request.NewPassword` with no hashing (`UpdateUserPasswordCommand.cs`). Pin by asserting
  the persisted `Password` equals the raw new password (not its SHA-256 hash); update when fixed.

## 4. Endpoints → test classes

| # | Endpoint | Class |
|---|---|---|
| 1 | `GET all/{includeInactive}` | `UsersListTests` |
| 2 | `GET {id}` | `UsersListTests` |
| 3 | `PUT {id}` (profile edit) | `UsersUpdateTests` |
| 4 | `DELETE {id}` (soft-deactivate) | `UsersDeleteActivateTests` |
| 5 | `POST activate` | `UsersDeleteActivateTests` |
| 6 | `POST AddUserRoles` | `UsersRolesTests` |
| 7 | `POST DeleteUserRoles` | `UsersRolesTests` |
| 8 | `POST change-password` | `UsersChangePasswordTests` |

### `UsersListTests`
- `Get_all_users_as_owner_admin_returns_200` (tenant-scoped list)
- `Get_all_users_as_super_admin_returns_200` (all, ignores query filters)
- `Get_user_by_id_returns_the_user`
- `Get_user_by_id_nonexistent_returns_400_UserNotFound` (validator `UserExists`)

### `UsersUpdateTests`
- `Update_user_profile_as_owner_admin_persists_fullname_and_email`
- `Update_user_isactive_applied_for_admin_caller`
- `Update_user_empty_fullname_returns_400` (`IsRequired`)
- `Update_user_invalid_email_returns_400` (`EmailFormatInvalid`)
- `Update_user_nonexistent_id_returns_400_UserNotFound`

### `UsersDeleteActivateTests`
- `Delete_user_soft_deactivates_sets_isactive_false` (assert DB row still exists, `IsActive=false`)
- `Delete_user_nonexistent_id_returns_400`
- `Activate_user_sets_isactive_true` (seed an inactive target, assert reactivated)
- `Activate_user_nonexistent_id_returns_500` **(PIN BUG #1)**

### `UsersRolesTests`
- `Add_user_roles_grants_role`
- `Add_user_roles_empty_roleids_returns_400` (`IsRequired`)
- `Add_user_roles_nonexistent_user_returns_400_UserNotFound`
- `Delete_user_roles_deactivates_role`

### `UsersChangePasswordTests`
- `Change_password_self_with_correct_old_password_succeeds`
- `Change_password_self_with_wrong_old_password_returns_200_InvalidPassword` (soft failure)
- `Change_password_admin_resets_other_without_old_password_succeeds`
- `Change_password_missing_newpassword_returns_400` (`IsRequired`)
- `Change_password_persists_plaintext` **(PIN BUG #2 — assert stored == raw)**

### Scenario-gap classes (feature ids `Users=72`, `Profile=70`)

- `UsersListGapTests` — `GET all` `includeInactive` true includes / false excludes an inactive user;
  `GET all` StoreUser-scoped branch (StoreUser with Users(72) feature) → 200; `GET {id}` `Guid.Empty` →
  400 `IsRequired`.
- `UsersUpdateGapTests` — `PUT {id}` `IsActive` NOT applied for a StoreUser editing self (privileged
  field); non-privileged fields still apply.
- `UsersDeleteActivateGapTests` — `DELETE {id}` and `POST activate` by a StoreUser (passed the gate via
  Users(72) feature) → handler guard **400** (`IsSuperAdminOrOwnerAdmin`).
- `UsersRolesGapTests` — `AddUserRoles` OwnerAdmin assigning SuperAdmin role → 400 `RoleNotFound`;
  `DeleteUserRoles` nonexistent user → 400 `UserNotFound`; empty `RoleIds` → 400 `IsRequired`.
- `UsersChangePasswordGapTests` — nonexistent user → 400 `UserNotFound`; empty `OldPassword` → 400
  `IsRequired`.

> `GET all/{includeInactive}` include/exclude asserts assume the handler honors the flag for a SuperAdmin
> caller — confirm at implementation.

## 5. Seeding needs (reuse `04`/`05`; add only what's missing)

- OwnerAdmin actor: `AuthzSeed.SeedOwnerAdminAsync(_, withManagementModule:true)` (has `UsersAdmin`/`ProfileAdmin` via Management).
- SuperAdmin: `DbTestHelpers.SeedSuperAdminAsync`.
- Target user to act on: `DbTestHelpers.SeedUserWithRoleAsync((int)RoleType.StoreUser)` — a distinct user
  with known `Id`/`Login`. For change-password DB assertions, a helper to read the persisted `Password`
  (extend `DbTestHelpers.GetUserByLoginAsync` if not present).
- A known-nonexistent GUID for the validator-failure / BUG-#1 cases.
- New helper likely needed: `SeedInactiveTargetUserAsync` (to test activate reactivation) — reuse `03b`'s
  `SeedInactiveUserAsync` pattern.

## 6. Out of scope

- The full role×feature matrix and 403 enforcement per role → owned by `05`. Here only a single
  `wrong_role_returns_403` smoke if desired.
- `StoreUsersController` → separate plan `07`.
- `GetAllUsersQuery`/`GetStoreUsersQuery` have no validators (confirmed) — no validation cases for list.

## 7. Open items — RESOLVED

- Error surface (soft 200 vs hard 400 vs thrown 500) → resolved per endpoint in §2/§3.
- `StoreUserErrors` class → does not exist; StoreUsers failures throw `ApiException` (covered in `07`).
- Confirm at implementation: `04`'s `UserFixture` member names; the exact JSON body shape of
  `activate`/`AddUserRoles`/`change-password` commands (fields listed in the endpoint map).
