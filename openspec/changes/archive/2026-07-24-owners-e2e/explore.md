# Exploration: owners-e2e

## Current State

The `OwnersController` exposed 5 endpoints under `api/v1/Owners` with class-level `[HasPermission(StoreRoleFeatures.OwnersAdmin)]`. The controller returns `Ok(...)` on success only — all failures are thrown exceptions (400 for validation, 400 for hard-gates). Testing harness from `04`/`05` (DbTestHelpers, StoreSeed, WebAppFixture, AppTestFactory) exists and is proven against real Postgres `smca_test`.

## Verified Claims (code-confirmed)

### 1. OwnersController.cs ✅
| Endpoint | Route | Action | Verified |
|---|---|---|---|
| GET all | `all/{includeInactive}` | `GetAllOwnersAsync(bool)` | ✅ Line 25-30 |
| GET by id | `{id}` | `GetOwnerAsync(Guid id)` | ✅ Line 36-40 |
| POST | (root) | `CreateOwnerAsync(CreateOwnerCommand)` | ✅ Line 46-50 |
| PUT | `{id}` | `UpdatedAsync(Guid id, UpdateOwnerCommand)` | ✅`command.Id = id` at line 60 |
| DELETE | `{id}` | `DeleteOwnerAsync(Guid id)` | ✅ Line 66-70 |

Class attribute: `[HasPermission(StoreRoleFeatures.OwnersAdmin)]` at line 18.

### 2. Handler Hard-Gates ✅

| Handler | Gate | File+Line | Verified |
|---|---|---|---|
| `GetAllOwnersQuery` | `IsSuperAdmin \|\| IsReSeller` | GetAllOwnersQuery.cs:37-38 | ✅ |
| `GetOwnerByIdQuery` | **No gate** (handler only) | GetOwnerByIdQuery.cs (no gate code) | ✅ |
| `CreateOwnerCommand` | `IsSuperAdmin \|\| IsReSeller` | CreateOwnerCommand.cs:47-48 | ✅ |
| `UpdateOwnerCommand` | `IsSuperAdmin \|\| IsReSeller` | UpdateOwnerCommand.cs:56-57 | ✅ |
| `DeleteOwnerCommand` | `IsSuperAdminOrOwnerAdmin` | DeleteOwnerCommand.cs:66-67 | ✅ |

**Inconsistency confirmed**: ReSeller passes list/create/update but **rejected on delete** (SuperAdmin || OwnerAdmin).

### 3. DeleteOwnerCommandHandler BUG ✅ CONFIRMED

- `_storeUserRepository` declared as field at line 19
- Constructor (lines 24-40) takes 11 params but **MISSES** `IStoreUserRepository`
- Line 74: `await _storeUserRepository.DeleteAsync(...)` → **guaranteed NullReferenceException** → HTTP 500
- This fires AFTER the hard-gate check + AFTER the validator (valid Id + owner exists), so any authorized, valid delete → 500.

### 4. CreateOwnerService Entity Graph ✅

```
CreateOwnerService.CreateOwnerAsync() creates:
  Tenant.Create(login, ...)
  → User.Create(login, password, ..., tenant.Id)
  → Owner.Create(user.Id, ..., tenant.Id) with owner.User = user
  → UserRole.Create(user.Id, RoleType.OwnerAdmin, tenant.Id)
Cleanup: DbTestHelpers.CleanupTenantCascadeAsync(tenantId)
```

### 5. Validators — Error Codes = Property Names ✅

| Validator | Rules (property → error code) |
|---|---|
| Create | `Login`, `Password`, `FullName`, `Cellphone`, `Email` (when provided), `ReSellerId` (when provided) |
| Update | `Id`, `FullName`, `CellPhone` (note capital P), `Email` (when provided), `ReSellerId` (when provided) |
| Delete | `Id` |
| GetById | `OwnerId` |

**Note on Update vs Create**: Update uses `CellPhone` (capital P), Create uses `Cellphone` (lowercase p). Tests must match exactly.

### 6. StoreSeed Helpers ✅

| Method | Exists | Returns |
|---|---|---|
| `SeedOwnerAsync(factory)` | ✅ | `OwnerFixture(OwnerId, UserId)` |
| `CleanupOwnerAsync(factory, ownerId, userId)` | ✅ | void |
| `CleanupTenantCascadeAsync(factory, tenantId)` | ✅ in `DbTestHelpers` | void |

### 7. Open Items Answered

- **`FeatureType.Owners = 11`** ✅ — confirmed at `Domain/Common/Enums/FeatureType.cs:10`
- **`OwnersAdmin` has no `[HasModule]`** ✅ — only `[HasRoles(SuperAdmin, ReSeller)]` + `[HasFeature(FeatureType.Owners)]`. This means a plain StoreUser with module-level feature filtering would NOT pass the controller filter for OwnersAdmin. The test plan's uncertainty about whether a StoreUser could pass the controller filter is valid — without a module, `HasUserAnyFeatureInStoreAsync` behavior for a module-less feature is untested.
- **`CreateOwnerService` entity graph** ✅ — detailed above with cleanup strategy.

## Additional Findings

### Redundant line in UpdateOwnerCommandValidator
```csharp
_reSellerRepository = reSellerRepository;
```
Appears TWICE in the constructor (lines 18 AND 47). Harmless — just an extra assignment — but worth noting as a minor code quality issue.

### OwnerRepository Query Behavior
- `GetAllOwnersIncludingStoreModulesAsync`: `IgnoreQueryFilters()` → SuperAdmin sees ALL tenants
- `GetReSellerOwnersIncludingStoreModulesAsync`: Filters by `ReSellerOwner.ReSeller.UserId == reSellerId` → ReSeller sees only linked owners
- Both filter `Where(o => includeInactive || o.IsActive)`

## Risks

| Risk | Severity | Details |
|---|---|---|
| **BUG #1 (delete-500)** | HIGH | Blocks any successful delete test. Must pin as 500 and update when fixed. |
| **FeatureType.Owners (11) without [HasModule]** | MEDIUM | If future tests explore StoreUser-with-Owners-feature behavior, the controller filter behavior for module-less features is unverified. Not in scope for this plan. |
| **CellPhone vs Cellphone naming asymmetry** | LOW | Create uses `Cellphone`, Update uses `CellPhone`. Tests must use the exact property name for `Errors[].Code` assertions. |
| **ReSeller fixture dependency** | LOW | Tests needing a VALID ReSeller (for ReSellerOwner link assertions) depend on plan `09` seeding. Deferred. |

## Ready for Proposal

**Yes.** The plan is fully verified against real code. All 5 endpoints, handler gates, validators, bug, and seeding helpers match the test plan's claims. No blockers for the 22 tests as designed.

The orchestrator should tell the user: "Exploration complete — all 7 verification points confirmed against real code. The delete bug is real (NRE at line 74), the handlers match the documented gate inconsistencies, and all validators match expected error codes. Ready for proposal."