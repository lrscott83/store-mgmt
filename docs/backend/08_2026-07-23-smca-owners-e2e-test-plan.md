# 08 — SMCA.WebApi Owners E2E — Test Plan

**Date:** 2026-07-23
**Scope:** the 5 endpoints of `OwnersController` (`api/v1/Owners`) — behavior + validation + the
endpoint-specific handler hard-gates + one major bug-pin.
**Depends on / reuses:** the `04`/`05` harness (`AppTestFactory`, `WebAppFixture`, `ApiResponse<T>`,
`DbTestHelpers`, `StoreSeed`, `AuthzSeed`) against real Postgres `smca_test`.

---

## 1. Scope boundary (vs `05`)

`05` owns the generic role×feature 403 matrix (the controller `[HasPermission]` filter). This plan owns
**what each Owners endpoint does**: behavior, validators, the **handler-level hard-gates** (which differ
per endpoint — an Owners-specific inconsistency, not the generic matrix), and the delete bug. Default actor
= SuperAdmin (bypasses the filter and passes every handler gate).

## 2. Verified contract facts (code-cited — bake into assertions)

- Class-level `[HasPermission(StoreRoleFeatures.OwnersAdmin)]` on all 5 actions
  (`OwnersController.cs:18`); `OwnersAdmin = [HasRoles(SuperAdmin, ReSeller)] [HasFeature(Owners)]`
  (`StoreRoleFeatures.cs:12-14`).
- **All failures are THROWN exceptions → real HTTP status** (not 200-wrapped). Validation failure = **400**
  (`ValidationException`, `Errors[].code` = property name); handler hard-gate = **400** (`ApiException`).
  The controllers' `Ok(...)` runs only on success.
- **Handler hard-gates differ per endpoint** (the inconsistency):
  - `GetAllOwnersQuery` → `SuperAdmin || ReSeller` else `ApiException` 400 (`GetAllOwnersQuery.cs:37-38`).
  - `CreateOwnerCommand` → `SuperAdmin || ReSeller` else 400 (`CreateOwnerCommand.cs:47-48`).
  - `UpdateOwnerCommand` → `SuperAdmin || ReSeller` else 400 (`UpdateOwnerCommand.cs:56-57`).
  - `DeleteOwnerCommand` → `SuperAdmin || OwnerAdmin` else 400 (`DeleteOwnerCommand.cs:66-67`) — **excludes
    ReSeller**.
  - `GetOwnerByIdQuery` → **no handler gate** (only the controller filter).
- `GetAllOwnersQuery`: SuperAdmin sees all tenants (IgnoreQueryFilters); ReSeller sees only owners linked
  via `ReSellerOwner.ReSeller.UserId == currentUser` (`OwnerRepository.cs:59-67`).
- `CreateOwnerCommand` on success creates a NEW `Tenant` + `User` + `Owner` + `UserRole(OwnerAdmin)`
  (+ optional `ReSellerOwner`) via `CreateOwnerService` (`CreateOwnerService.cs:31-49`) → 200
  `Success(rows>0)`.
- `PUT {id}` overwrites `command.Id` from the route (`OwnersController.cs:63`).

## 3. Bugs to PIN (as-is, like the register-500 in `02` / activate-500 in `06`)

- **BUG #1 (major) — `DELETE` always 500.** `DeleteOwnerCommandHandler` declares
  `IStoreUserRepository _storeUserRepository` (`DeleteOwnerCommand.cs:26`) but the constructor never injects
  it; it is used at `DeleteOwnerCommand.cs:74` → guaranteed `NullReferenceException` for any authorized,
  valid delete → HTTP **500** `App.Unexpected`. Pin the 500; update when fixed.

## 4. Endpoints → test classes

| # | Endpoint | Class |
|---|---|---|
| 1 | `GET all/{includeInactive}` | `OwnersListTests` |
| 2 | `GET {id}` | `OwnersGetByIdTests` |
| 3 | `POST` | `OwnersCreateTests` + `OwnersCreateValidationTests` |
| 4 | `PUT {id}` | `OwnersUpdateTests` |
| 5 | `DELETE {id}` | `OwnersDeleteTests` |

### `OwnersListTests`
- `List_owners_as_super_admin_returns_200`
- `List_owners_as_reseller_returns_200` (ReSeller-scoped)

### `OwnersGetByIdTests`
- `Get_owner_by_id_returns_200`
- `Get_owner_by_id_nonexistent_returns_400_OwnerNotFound`
- `Get_owner_by_id_empty_guid_returns_400_IsRequired`

### `OwnersCreateTests`
- `Create_owner_persists_tenant_user_owner_and_role` (integration: DB assertions on the new tenant graph)

### `OwnersCreateValidationTests`
- `Create_empty_login_400_IsRequired`, `Create_empty_password_400_IsRequired`,
  `Create_empty_fullname_400_IsRequired`, `Create_empty_cellphone_400_IsRequired`
- `Create_duplicate_login_400_UserAlreadyExists`
- `Create_nonexistent_reseller_400_ReSellerNotFound`
- `Create_invalid_email_400_EmailFormatInvalid`

### `OwnersUpdateTests`
- `Update_owner_persists_fullname_and_isactive`
- `Update_owner_nonexistent_id_returns_400_OwnerNotFound`
- `Update_owner_empty_fullname_returns_400_IsRequired`
- `Update_owner_invalid_email_returns_400_EmailFormatInvalid`

### `OwnersDeleteTests`
- `Delete_owner_currently_returns_500` **(PIN BUG #1)**
- `Delete_owner_nonexistent_id_returns_400_OwnerNotFound`
- `Delete_owner_as_reseller_returns_400_guard` (the ReSeller-exclusion inconsistency)

### `OwnersCreateGapTests` (scenario-level gap)
- `Create_owner_as_reseller_returns_200` — the create gate is `SuperAdmin || ReSeller`, so a ReSeller actor can create (200).

### `OwnersUpdateGapTests` (scenario-level gaps)
- `Update_owner_empty_cellphone_returns_400_CellPhone` — `UpdateOwnerCommandValidator` `CellPhone` `NotNull/NotEmpty` → `Code=="CellPhone"`.
- `Update_owner_nonexistent_reseller_returns_400_ReSellerId` — `When(ReSellerId.HasValue)` `ReSellerExists` → `Code=="ReSellerId"`.

### `OwnersListGapTests` (scenario-level gaps)
- `List_owners_includeInactive_true_includes_inactive_owner` — `GetAllOwnersIncludingStoreModulesAsync(true)` includes an `Owner.IsActive==false` owner.
- `List_owners_includeInactive_false_excludes_inactive_owner` — `includeInactive==false` filters `Where(o => o.IsActive)`, excluding the deactivated owner.

## 5. Seeding needs (reuse `04`/`05`; likely no new helper class)

- SuperAdmin actor: `DbTestHelpers.SeedSuperAdminAsync`.
- ReSeller actor: `DbTestHelpers.SeedUserWithRoleAsync((int)RoleType.ReSeller)` → `IsReSeller` claim true,
  passes the controller filter via the ReSeller allowed-features branch.
- Target Owner to act on: `StoreSeed.SeedOwnerAsync` (Owner + User in DefaultTenant) → `OwnerFixture(OwnerId,
  UserId)`.
- Create: the created owner lands in a NEW tenant → clean up with `DbTestHelpers.CleanupTenantCascadeAsync`
  (resolve the created user's `TenantId` first). Duplicate login: seed a colliding user; nonexistent
  ReSeller: a random GUID for `ReSellerId`.

## 6. Out of scope

- The generic 403 matrix / no-token 401 → `05`.
- `ReSeller` / `Features` / `Usages` controllers → later plans.
- The 4 minor findings (missing resx key `UserNotFound`; misplaced `OwnerErrors` class; no null-checks in
  handlers masked by validators; redundant validator field assignment) — noted, not asserted (they do not
  change observable HTTP behavior for the actors tested).

## 7. Open items

- **Confirm at implementation:** `FeatureType.Owners` id (only needed if adding a "StoreUser-with-Owners-
  feature → handler 400" case for List/Create/Update; the ReSeller→Delete-400 case already covers the
  hard-gate inconsistency without it). `CreateOwnerService` exact entity graph for the integration
  assertions.
- The delete bug means `OwnersDeleteTests` cannot assert a successful delete until the injection is fixed;
  the 500-pin documents current behavior.

## 8. Deeper gaps deferred (flagged — need more setup / confirmation)

- **Create/Update with a VALID `ReSellerId`** → a `ReSellerOwner` link is created (integration). Needs a
  seeded **ReSeller entity**, which is the subject of plan `09`; writing it here would duplicate that
  seeding. Deferred to `09` or a follow-up once a `SeedReSellerAsync` helper exists.
- **List as ReSeller returns only linked owners** (scoped content) — same `ReSellerOwner` seeding dependency.
- **StoreUser with the Owners(11) feature → handler 400** on List/Create/Update — `OwnersAdmin` has no
  `[HasModule]`, so whether a plain StoreUser can pass the controller filter for it is unconfirmed; verify
  `HasUserAnyFeatureInStoreAsync` behavior for a module-less feature before writing.
