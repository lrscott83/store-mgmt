# 07 — SMCA.WebApi StoreUsers E2E — Test Plan

**Date:** 2026-07-23
**Scope:** the 3 endpoints of `StoreUsersController` (`api/v1/StoreUsers`), exhaustively — behavior +
validation + the double-gate guard. Supersedes the earlier single-file suite.
**Depends on / reuses:** the `04`/`05` harness (`AppTestFactory`, `WebAppFixture`, `ApiResponse<T>`,
`DbTestHelpers`, `StoreSeed`, `AuthzSeed`) against real Postgres `smca_test`.

---

## 1. Scope boundary (vs `05`)

`05` owns the role×feature 403 matrix (who can access). This plan owns **what each StoreUsers endpoint
does**: behavior, validators, and the controller-specific **double-gate** (a caller can pass
`[HasPermission(UsersAdmin)]` yet still be rejected **inside the handler**). Actor for behavior/validation =
SuperAdmin (bypasses both gates → cheapest seeding).

## 2. Verified contract facts (code-cited — bake into assertions)

- Class-level `[HasPermission(StoreRoleFeatures.UsersAdmin)]` on all 3 actions
  (`StoreUsersController.cs:16`); `[Authorize]` too.
- **Every handler hard-gates on `IsSuperAdminOrOwnerAdmin`** → `throw ApiException(..., BadRequest)` (real
  **HTTP 400**) for any other caller — this fires ABOVE the class-level permission gate. So a StoreUser
  who passes `[HasPermission(UsersAdmin)]` (via a `StoreRoleFeature` granting Users=72) is still rejected
  with 400 inside the handler.
- Controllers `return Ok(...)` → HTTP 200 unless thrown. Validation failure = **HTTP 400**
  (`ValidationException` → `ErrorHandlerMiddleware`); `Errors[].Code` = the PROPERTY NAME (the validator
  message key lives in the `Description`; `ValidationException.cs` builds `new Error(PropertyName, ErrorMessage)`).
- **No `StoreUserErrors` class exists** — StoreUsers handler failures throw a generic
  `ApiException(_localizer["UserNotFound"], BadRequest)` (real 400), never a coded soft failure.
- `GetStoreUsersQuery` and `GetStoreUserByIdQuery` scoping: SuperAdmin ignores query filters; OwnerAdmin is
  tenant/store-scoped.
- `CreateStoreUserCommand` on success creates `User` (+ `SelectedStoreId=StoreId`), `StoreUser`, and a
  `UserRole` per `RoleId`; returns `ResponseResult.Success(saved > 0)` (200).
- Constant: `FeatureType.Users = 72` (for the double-gate seeding).

## 3. Endpoints → validators

| Verb + route | Query/Command | Validator rules (code = key) |
|---|---|---|
| `GET StoreUsers/list/{includeInactive}` | `GetStoreUsersQuery(bool)` | none |
| `GET StoreUsers/{id}` | `GetStoreUserByIdQuery(Guid StoreUserId)` | `IsRequired`, `UserExists`→`UserNotFound` |
| `POST StoreUsers` | `CreateStoreUserCommand(StoreId, Login, Password, FullName, CellPhone?, Email?, RoleIds)` | `StoreId`: `IsRequired`+`StoreExists`(`StoreNotFound`); `Login`: `IsRequired`+`IsUniqueName`(`UserAlreadyExists`); `Password`: `IsRequired`; `FullName`: `IsRequired`; `Email`: `EmailFormatInvalid` (when non-empty); `RoleIds`: `IsRequired`+`AreRolesVisibles`(`RoleNotFound`) |

## 4. Test classes

### `StoreUsersListTests`
- `List_store_users_as_super_admin_returns_200`
- `List_store_users_as_owner_admin_returns_200`

### `StoreUsersGetByIdTests`
- `Get_store_user_by_id_returns_200`
- `Get_store_user_by_id_nonexistent_returns_400_UserNotFound`
- `Get_store_user_by_id_empty_guid_returns_400_IsRequired`

### `StoreUsersCreateTests`
- `Create_store_user_persists_user_storeuser_and_role` (integration: DB assertions)

### `StoreUsersCreateValidationTests`
- `Create_empty_login_400_IsRequired`, `Create_empty_password_400_IsRequired`,
  `Create_empty_fullname_400_IsRequired`, `Create_empty_roleids_400_IsRequired`
- `Create_invalid_email_400_EmailFormatInvalid`
- `Create_nonexistent_store_400_StoreNotFound`
- `Create_invisible_role_400_RoleNotFound`
- `Create_duplicate_login_400_UserAlreadyExists`

### `StoreUsersGuardTests` (the double-gate — controller-specific)
- `List_as_store_user_with_users_feature_returns_400_guard`
- `Get_by_id_as_store_user_with_users_feature_returns_400_guard`
- `Create_as_store_user_with_users_feature_returns_400_guard`

### `StoreUsersCreateGapTests`
- `Create_with_multiple_roles_persists_a_userrole_each` (DB assert — one `UserRole` per `RoleId`,
  verified `foreach` at `CreateStoreUserCommand.cs:69-71`)
- `Create_with_valid_email_persists_email`

### `StoreUsersListGapTests`
- `List_includeInactive_true_includes_inactive_store_user`
- `List_includeInactive_false_excludes_inactive_store_user`
  (the flag filters on `StoreUser.IsActive`, `StoreUserRepository.cs:47,56`; matched by `StoreUserDto.Login`)

## 5. Seeding needs (reuse `04`/`05`; no new helper class)

- SuperAdmin actor: `DbTestHelpers.SeedSuperAdminAsync`.
- OwnerAdmin actor: `AuthzSeed.SeedOwnerAdminAsync(_, withManagementModule:true)`.
- StoreUser-with-Users-feature (for the guard): `AuthzSeed.SeedStoreUserAsync(_, grantedFeatureId: 72)`.
- Store for create: `StoreSeed.SeedStoreAsync`. Visible role for create/happy: `StoreUser=3`.
- Existing StoreUser for get-by-id happy: `AuthzSeed.SeedStoreUserAsync`.
- Nonexistent GUID for validators; a duplicate login for `IsUniqueName`.

## 6. Out of scope

- The role×feature 403 matrix and no-token 401 → owned by `05`.
- `UsersController` → `06`.

## 7. Open items

- **Confirm at implementation:** `GetStoreUserByIdQuery.StoreUserId` semantics — `User.Id` vs
  `StoreUser`-entity id. If the latter, the get-by-id happy test must use the entity id.
- `RoleNotFound` via `RoleId 999999`: if `IVisibleRoleService` NPEs on a nonexistent id instead of
  returning false, use an existing-but-invisible role (e.g. `SuperAdmin=1` with an OwnerAdmin actor).
