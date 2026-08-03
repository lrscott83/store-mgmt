# Design: Owners Update Endpoint Fixes

## Technical Approach

Thirteen targeted fixes to `PUT /api/v1/Owners/{id}` following proven codebase patterns: ActionCode→HTTP switch from `UsersController.ChangePasswordAsync`, null-guard+404 from `owners-create-endpoint-fixes`, tenant-scope from `change-password-endpoint-fixes`, and AsTracking persistence from `update-user-endpoint-fixes`. The handler returns `OwnerDto` via AutoMapper instead of bool. The validator becomes structural-only (zero DB queries). A new `GetOwnerWithUserTrackedAsync` repository method loads Owner+User with `AsTracking()`.

## Architecture Decisions

| Decision | Option A | Option B | Chosen | Rationale |
|----------|----------|----------|--------|-----------|
| Auth gate | Remove handler gate; let `[HasPermission(OwnersAdmin)]` be sole gate | Keep handler gate with OwnerAdmin check | **A** | Controller-level filter already returns 403 via `ForbidResult`; handler duplicate is defensive noise. `[HasPermission]` filter line 89 already checks `IsOwnerAdmin`. |
| UpdateAsync removal | Remove `_ownerRepository.UpdateAsync(owner)` | Keep explicit UpdateAsync | **A** | `AsTracking()` entity changes are already tracked; `SaveChangesAsync` suffices. Explicit UpdateAsync is redundant and can mask change-tracking issues. |
| OwnerDto projection after tracked load | `_mapper.Map<OwnerDto>(owner)` | Project manually | **A** | `OwnerProfile` already maps `Owner→OwnerDto`. ReSellerOwner/Stores data absent in light query → null/empty in DTO (acceptable for PUT response). |
| ReSeller null guard error shape | `ApiException` with `AcctionCode = "ReSellerId"` | Use `ResponseResult.Failure` | **A** | Must preserve `Code == "ReSellerId"` envelope shape; `ApiException` + `AcctionCode` setter flows through middleware to correct error code. |

## Data Flow

```
PUT /api/v1/Owners/{id}
  │
  ▼
[HasPermission(OwnersAdmin)] filter ──Deny──▶ 403 ForbidResult
  │ Pass
  ▼
FluentValidation: Id/FullName/CellPhone NotNull+NotEmpty, Email format (0 DB queries)
  │ Pass
  ▼
Handler: GetOwnerWithUserTrackedAsync(id) ──null──▶ ResponseResult.Failure<OwnerDto>(404)
  │ Found
  ▼
Tenant-scope: !IsSuperAdmin && owner.TenantId ≠ TenantId ──Yes──▶ ResponseResult.Failure<OwnerDto>(404)
  │ Same tenant or SuperAdmin
  ▼
Update fields: owner.User.FullName/CellPhone/Email, owner.IsActive/Description/Guest
  │
  ▼
UpdateReSellerOwnerAsync: fetch ReSellerOwner + ReSeller
  ├─ reSellerId.HasValue → null-guard ReSeller → update/create ReSellerOwner
  └─ !reSellerId.HasValue → delete ReSellerOwner if exists
  │
  ▼
SaveChangesAsync → AutoMapper: Owner→OwnerDto → ResponseResult.Success(ownerDto)
  │
  ▼
Controller: Succeeded → Ok(result) | Failed → ActionCode switch → real HTTP status
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `SMCA.WebApi/Controllers/v1/OwnersController.cs` | Modify | Fix XML doc, add `[FromRoute]`, `[ProducesResponseType]` for 200(OwnerDto)/400/401/403/404/500, ActionCode→HTTP switch |
| `Application/.../UpdateOwner/UpdateOwnerCommand.cs` | Modify | `ICommand<bool>`→`ICommand<OwnerDto>`, handler: remove auth gate, null guard, tenant check, IMapper injection, remove UpdateAsync, OwnerDto return |
| `Application/.../UpdateOwner/UpdateOwnerCommandValidator.cs` | Modify | Remove `OwnerExists`+`ReSellerExists` rules, fields, helpers, and ctor deps; structural-only `NotNull().NotEmpty()`+`EmailAddress()` |
| `Domain/.../IOwnerRepository.cs` | Modify | Add `GetOwnerWithUserTrackedAsync(Guid id, CancellationToken ct)` |
| `Infrastructure/.../OwnerRepository.cs` | Modify | Implement `GetOwnerWithUserTrackedAsync`: `.AsTracking()`, `.Include(o => o.User)`, `FirstOrDefaultAsync(ct)` |
| `SMCA.WebApi.E2ETests/Owners/OwnersUpdateTests.cs` | Modify | 200→`ApiResponse<OwnerDto>`, 400→404 for nonexistent, new OwnerAdmin acceptance test, new CellPhone/ReSeller gap tests |

## Interfaces / Contracts

```csharp
// IOwnerRepository — new method
Task<Owner> GetOwnerWithUserTrackedAsync(Guid id, CancellationToken cancellationToken = default);

// UpdateOwnerCommand — command type change
public sealed class UpdateOwnerCommand : ICommand<OwnerDto> { ... }

// Handler signature change
public class UpdateOwnerCommandHandler : ICommandHandler<UpdateOwnerCommand, OwnerDto>
{
    // Added dependency
    private readonly IMapper _mapper;
}
```

## Entity/DTO Mapping

`OwnerProfile` already maps `Owner→OwnerDto`. With the lightweight `AsTracking()` query (Owner+User only, no ReSellerOwner/Stores), the DTO fields behave as follows:

| DTO Field | Source | Post-fix behavior |
|-----------|--------|-------------------|
| Login, FullName, CellPhone, Email | `User.*` (loaded) | ✅ Populated |
| Id, UserId, Description, Guest, IsActive | `Owner.*` (loaded) | ✅ Populated |
| ReSellerId, ReSellerName | `ReSellerOwner` (not loaded → null) | `null` (acceptable for PUT response) |
| Approved, StoreModules | `Stores` (not loaded → empty) | `false` / `[]` (acceptable for PUT response) |

## Error Flow (ActionCode → HTTP)

Controller maps `ActionCode` to HTTP status (mirrors `UsersController.cs:156-163`):

| ActionCode | HTTP | Trigger |
|-----------|------|---------|
| — (Succeeded) | 200 | Valid update |
| 400 | 400 | Validation / handler ReSeller missing |
| 404 | 404 | Nonexistent owner / cross-tenant |
| 403 | 403 | Filter denial |

Middleware catches unhandled `ApiException` (ReSeller null guard) → 400 + `Code == "ReSellerId"`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E | 200 returns `ApiResponse<OwnerDto>`, User.FullName persists | Update `Update_owner_persists_isactive_and_description` |
| E2E | 404 for nonexistent (was 400) | Update `Update_owner_nonexistent_id_returns_400_Id` |
| E2E | OwnerAdmin actor accepted (200) | New test: seed OwnerAdmin via `SeedStoresAdminUserAsync`, PUT → 200 |
| E2E | Empty CellPhone → 400, nonexistent ReSellerId → 400 Code=="ReSellerId" | New gap tests |
| E2E | Empty FullName → 400, invalid Email → 400 | Assertions unchanged |

### Test Assertion Updates (existing tests)

| Test Method | Old | New |
|-------------|-----|-----|
| `Update_owner_persists_isactive_and_description` | 200 + no DTO check | 200 + `ApiResponse<OwnerDto>` + `Data.FullName == "Updated Owner"` + verify User.FullName in DB |
| `Update_owner_nonexistent_id_returns_400_Id` | `HttpStatusCode.BadRequest`, `Code == "Id"` | `HttpStatusCode.NotFound`, `ActionCode == 404` |
| `Update_owner_empty_fullname_returns_400_FullName` | 400 + `Code == "FullName"` | Unchanged |
| `Update_owner_invalid_email_returns_400_Email` | 400 + `Code == "Email"` | Unchanged |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

**BREAKING**: `ResponseResult<bool>`→`ResponseResult<OwnerDto>`, nonexistent 400→404. Frontend must update response deserialization. Frontend contract plan at `docs/plans/owners-update-endpoint-fixes-frontend.md`. Rollback: revert single commit. No DB migration.

## Open Questions

None — all patterns are proven in the codebase.
