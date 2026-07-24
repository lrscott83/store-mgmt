# 11 — SMCA.WebApi ReSellers E2E — Test Plan

**Date:** 2026-07-24
**Scope:** the 5 endpoints of `ReSellersController` (`api/v1/reSellers`), **exhaustive CRUD** (mirrors the
Owners `08` shape) — every reachable behavior, edge, error and auth path is implemented as a test. Includes
the `11c` QA-gap scenarios, merged in (scenario ids `L*`/`G*`/`C*`/`U*`/`D*`); nothing discarded.
**Depends on / reuses:** the on-disk harness (`AppTestFactory`, `WebAppFixture`, `[Collection("e2e")]`,
`ApiResponse<T>`, `DbTestHelpers`) against real Postgres `smca_test`. Adds one new infra helper
`ReSellerSeed` (no `SeedReSeller*` exists yet).
**Closes the controller series** — ReSellers was the deliberately-last controller in the master index §9.3.

---

## 1. Self-contained by directive

Carries its own auth matrix inline for all 5 endpoints; duplicate any seed/auth helper locally if absent.

## 2. Verified contract facts (code-cited — bake into assertions)

- **Class filter** `[HasPermission(StoreRoleFeatures.SuperAdmin)]` (`ReSellersController.cs:16`). **All 5
  endpoints are SuperAdmin-only** — no method-level widening. Auth is purely role-based (no feature/store
  scoping), so the generic `05` engine does not apply here; the per-endpoint `401`/`403` IS the full auth
  surface. A ReSeller actor also gets **403** on its own controller (SuperAdmin bypasses; every other role
  fails the filter).
- **`GET all/{includeInactive}`** (`ReSellersController.cs:23-29`) → `GetAllReSellersQuery`. Handler dead-gate
  `if(!IsSuperAdmin) throw 400` (`GetAllReSellersQuery.cs:36-37`) — unreachable. Returns
  `List<ReSellerDto>` from `GetAllReSellersIncludingUserAsync(includeInactive)`.
- **`GET {id}`** (`:36-41`) → `GetReSellerByIdQuery`. Validator `ReSellerId` NotNull/NotEmpty/**ReSellerExists**
  → `400` code `ReSellerId` on missing/empty (`GetReSellerByIdQueryValidator.cs:17-20`). Returns `ReSellerDto`.
- **`POST`** (`:47-52`) → `CreateReSellerCommand(Login, Password, FullName, Cellphone, Email?, Description?)`.
  Handler dead-gate `if(!IsSuperAdmin) throw 400`; then creates a **new `Tenant`** (`Guid.NewGuid()`) + `User`
  (hashed password) + `ReSeller.Create(userId, approved:false, discountPrice:0, percentDiscountPrice:=system
  default, tenantId, Description ?? "")` + `UserRole(ReSeller)` (`CreateReSellerCommand.cs:59-76`). Returns
  `bool`. Validator: `Login`(+IsUniqueName), `Password`, `FullName`, `Cellphone` NotNull/NotEmpty; `Email`
  EmailAddress when set. Codes = property names.
- **`PUT {id}`** (`:57-63`) → `UpdateReSellerCommand`; controller sets `command.Id = id` **after** `[FromBody]`
  (route id overrides body id). Handler gate `if(!(IsSuperAdmin||IsReSeller)) throw 400` — the `||IsReSeller`
  leg is **dead** (class filter already SuperAdmin). Validator: `Id`(+ReSellerExists→`400 Id`), `FullName`,
  `CellPhone` NotNull/NotEmpty; `DiscountPrice` **≥0** (no upper bound); `PercentDiscountPrice` **≥0 and ≤100**;
  `Email` EmailAddress when set (`UpdateReSellerCommandValidator.cs`). Handler mutates the ReSeller + its User.
- **`DELETE {id}`** (`:68-73`) → `DeleteReSellerCommand`. Handler dead-gate; validator `Id`+**ReSellerExists**
  → `400 Id` on missing (this guard is what prevents the `DeleteAsync(null)` crash). Handler deletes **only
  the `ReSeller` row** (`DeleteReSellerCommand.cs:45-46`) — the `User` + `UserRole` are **left orphaned**.
- **Failures thrown → real status** (`ErrorHandlerMiddleware`): validation → **400**, `Errors[].Code =
  property name`; no token → **401**; authenticated non-SuperAdmin → **403**; route-verb mismatch → **405**.

## 3. Behavior to PIN as-is

- **Delete orphans `User` + `UserRole`** (`D1`) — the handler removes only the `ReSeller` row. Pin: after a
  `200` delete, the `User` and `UserRole(ReSeller)` still exist. Flag for a separate production review.
- **`DiscountPrice` has no upper bound** while `PercentDiscountPrice` is capped at `100` (`U4`) — asymmetry;
  pin a large `DiscountPrice` → `200`.
- **Route id overrides body id** on PUT (`U6`) — pin that the route reseller is updated, not the body's `Id`.
- **List order not guaranteed** (`L3`) — `all` has no `OrderBy`; assert membership only.

## 4. Endpoints → test classes (new folder `ReSellers/`)

| # | Endpoint | Classes |
|---|----------|---------|
| 1 | `GET all/{includeInactive}` | `ReSellersListTests` + `ReSellersListAuthTests` |
| 2 | `GET {id}` | `ReSellersGetByIdTests` + `ReSellersGetByIdAuthTests` |
| 3 | `POST` | `ReSellersCreateTests` + `ReSellersCreateValidationTests` + `ReSellersCreateAuthTests` |
| 4 | `PUT {id}` | `ReSellersUpdateTests` + `ReSellersUpdateValidationTests` + `ReSellersUpdateAuthTests` |
| 5 | `DELETE {id}` | `ReSellersDeleteTests` + `ReSellersDeleteAuthTests` |

### `ReSellersListTests`
- `List_as_super_admin_returns_200`
- `List_includeInactive_true_includes_inactive_reseller` — seed a reseller with `IsActive=false`; `all/true`
  contains it (match by `Id`).
- `List_includeInactive_false_excludes_inactive_reseller` — same reseller absent from `all/false`.
- `List_includeInactive_nonbool_returns_400_or_404` **(L1 · VERIFY&PIN)** — `all/not-a-bool`.
- `List_items_have_dto_shape_and_user` **(L2)** — every `ReSellerDto` has a non-empty `Login` (proves the
  `User` join) + a set `Id`.
- `List_result_is_not_guaranteed_ordered` **(L3 · PIN)** — membership only, never sequence.
- `List_with_POST_verb_returns_405` **(L4)**.

### `ReSellersListAuthTests`
- `List_no_token_returns_401` · `List_malformed_token_returns_401`
- `List_as_owner_admin_returns_403` · `List_as_store_user_returns_403` · `List_as_reseller_returns_403`.

### `ReSellersGetByIdTests`
- `Get_by_id_returns_200`
- `Get_nonexistent_returns_400_ReSellerId`
- `Get_empty_guid_returns_400_ReSellerId`
- `Get_malformed_guid_returns_400_or_404` **(G1 · VERIFY&PIN)** — `/reSellers/not-a-guid`.
- `Get_returned_dto_has_full_shape` **(G2)** — `Login`, `IsActive`, discount fields, `Id` all present.

### `ReSellersGetByIdAuthTests`
- `Get_no_token_returns_401` · `Get_as_owner_admin_returns_403` · `Get_as_store_user_returns_403` ·
  `Get_as_reseller_returns_403`.

### `ReSellersCreateTests`
- `Create_persists_tenant_user_reseller_and_role` — assert new `User`, `ReSeller` (by `UserId`),
  `UserRole(ReSeller)`. **Custom cleanup** (`CleanupReSellerGraphByTenantAsync`) — `CleanupTenantCascadeAsync`
  does not remove the `ReSeller` row.
- `Create_with_email_persists_email` **(C1)**.
- `Create_with_null_description_returns_200` **(C2)** — `Description ?? ""`.
- `Create_reseller_has_default_percent_and_zero_discount` **(C3)** — assert `DiscountPrice==0` and
  `PercentDiscountPrice == ISystemConfigurationRepository.GetReSellerPercentDiscountPriceAsync()` (resolved
  in-test).
- `Create_stored_password_is_hashed` **(C4)** — stored `User.Password != "Password123"`.

### `ReSellersCreateValidationTests`
- `Create_empty_login_400_Login` · `_empty_password_400_Password` · `_empty_fullname_400_FullName` ·
  `_empty_cellphone_400_Cellphone` · `_invalid_email_400_Email` · `_duplicate_login_400_Login`.

### `ReSellersCreateAuthTests`
- `Create_no_token_returns_401` · `_as_owner_admin_returns_403` · `_as_store_user_returns_403` ·
  `_as_reseller_returns_403`.

### `ReSellersUpdateTests`
- `Update_persists_fullname_isactive_and_discounts` — assert `User.FullName`, `ReSeller.IsActive`,
  `DiscountPrice`, `PercentDiscountPrice` written.
- `Update_percent_100_boundary_returns_200` **(U1)**.
- `Update_zero_boundaries_returns_200` **(U2)** — `DiscountPrice=0`, `PercentDiscountPrice=0`.
- `Update_large_discount_returns_200` **(U4 · PIN)** — no upper bound on `DiscountPrice`.
- `Update_email_null_returns_200` **(U5)**.
- `Update_route_id_overrides_body_id` **(U6 · PIN)** — PUT reseller A's route with `{Id:B}` in body updates A.

### `ReSellersUpdateValidationTests`
- `Update_nonexistent_id_400_Id` · `Update_empty_guid_id_400_Id` **(U7)** · `Update_empty_fullname_400_FullName`
  · `Update_empty_cellphone_400_CellPhone` · `Update_invalid_email_400_Email`
  · `Update_discount_negative_400_DiscountPrice` · `Update_percent_over_100_400_PercentDiscountPrice`
  · `Update_percent_negative_400_PercentDiscountPrice` **(U3)**.

### `ReSellersUpdateAuthTests`
- `Update_no_token_returns_401` · `_as_owner_admin_returns_403` · `_as_store_user_returns_403` ·
  `_as_reseller_returns_403`.

### `ReSellersDeleteTests`
- `Delete_reseller_returns_200` — asserts the `ReSeller` row is gone.
- `Delete_orphans_user_and_userrole` **(D1 · BUG-REVEAL)** — after `200`, `User` + `UserRole(ReSeller)` remain.
- `Delete_twice_second_returns_400_Id` **(D2)** — validator `ReSellerExists`.
- `Delete_nonexistent_returns_400_Id` · `Delete_empty_guid_returns_400_Id` **(D3)**.

### `ReSellersDeleteAuthTests`
- `Delete_no_token_returns_401` · `_as_owner_admin_returns_403` · `_as_store_user_returns_403` ·
  `_as_reseller_returns_403`.

## 5. Findings — documented (dead-gates, not e2e-reachable)

Four redundant handler re-checks shielded by the class `[HasPermission(SuperAdmin)]` filter (no e2e actor
passes the filter yet fails the check): `GetAllReSellersQuery`, `CreateReSellerCommand`,
`DeleteReSellerCommand` (`if(!IsSuperAdmin) throw 400`), and `UpdateReSellerCommand`'s dead `||IsReSeller`
leg. Reachable only by handler unit tests — **out of scope** here (per the Usages `10b` deletion decision).

## 6. Seeding needs (new `ReSellerSeed` helper — implementation plan Task 0)

- **SuperAdmin actor:** `DbTestHelpers.SeedSuperAdminAsync` + `AuthedClient`.
- **A ReSeller to GET/PUT/DELETE:** `ReSellerSeed.SeedReSellerAsync(_f, approved, isActive, percent)` →
  inline `User.Create` + `ReSeller.Create` + `UserRole.Create(ReSeller)` in `DataUtils.DefaultTenant`; returns
  `(ReSellerId, UserId)`. `ReSellerSeed.CleanupReSellerAsync(reSellerId, userId)`.
- **Create-test cleanup:** `ReSellerSeed.CleanupReSellerGraphByTenantAsync(tenantId)` — removes `ReSeller` +
  `UserRole` + `User` + `Tenant` (covers the row `CleanupTenantCascadeAsync` misses).
- **403 actors:** `DbTestHelpers.SeedUserWithRoleAsync((int)RoleType.{OwnerAdmin|StoreUser|ReSeller})`.

## 7. Out of scope

- Auth = role-only (SuperAdmin); the `05` feature/scope engine does not apply to ReSellers.
- The `ReSellerOwner` association graph (not exercised by any of the 5 endpoints).
