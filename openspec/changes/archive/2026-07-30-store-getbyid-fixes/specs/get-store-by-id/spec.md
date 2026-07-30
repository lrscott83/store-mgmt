# GetStoreById Specification

**Change**: `2026-07-30-store-getbyid-fixes`
**Domain**: `get-store-by-id`
**Type**: Full spec (new domain)
**Status**: Pending
**Last Updated**: 2026-07-30

---

## Purpose

Contract for `GET /api/v1/stores/{id}`. Returns a single store with modules, owner name, and role-based query filter (superadmin bypasses tenant isolation).

---

## Requirements

### R1: OwnerName Population via Include Chain

The repository methods `GetStoreByIdIncludingModulesAsync` and `GetStoreByIdIncludingModulesIgnoreQueryFiltersAsync` MUST include `.Include(s => s.Owner).ThenInclude(o => o.User)` BEFORE the `.Include(s => s.StoreModules...)` chain, so AutoMapper can resolve `Owner.User.FullName` without NullReferenceException.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | OwnerName resolved | Store with Owner and User exists | Endpoint called | `ownerName` in response matches `Owner.User.FullName` |
| 1b | Owner is null | Store with no Owner in DB | Endpoint called | `ownerName` is null, no NRE |
| 1c | Owner.User is null | Store with Owner but no User linked | Endpoint called | `ownerName` is null, no NRE |

### R2: Handler Class Naming

The handler class implementing `IQueryHandler<GetStoreByIdQuery, StoreDto>` MUST be named `GetStoreByIdQueryHandler`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Correct class name | Source compiled | Handler inspected | Class name is `GetStoreByIdQueryHandler`, not `GetAllStoresQueryHandler` |

### R3: No Redundant Task.FromResult

The handler MUST NOT wrap the return value in `await Task.FromResult(...)`. It MUST return `ResponseResult<StoreDto>` directly.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Direct return | Handler executes successfully | Returns result | `ResponseResult.Success(storeDto)` returned directly, no `Task.FromResult` wrapper |

### R4: Lightweight Existence Check in Validator

The `StoreExists` validation rule MUST use `IStoreRepository.ExistsAsync(Guid id)` — a lightweight `AnyAsync` query — instead of calling `IGetStoreByIdService.GetStoreByIdIncludingModulesAsync` (which executes a full query with Include chains).

`IStoreRepository` MUST expose a new method `Task<bool> ExistsAsync(Guid id)` that executes `_stores.AnyAsync(s => s.Id == id)`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Store exists | Valid store ID | Validation runs | Single `AnyAsync` query executed, validator passes |
| 4b | Store does not exist | Non-existent store ID | Validation runs | `AnyAsync` returns false, validation fails with "StoreNotFound" |
| 4c | No Include chain in existence check | Any store ID | Validation runs | Query is `AnyAsync(Id)` only — no `.Include()` or `.ThenInclude()` |

### R5: Swagger Documents 401, 403, 400

The endpoint MUST declare `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]`, and `[ProducesResponseType(StatusCodes.Status400BadRequest)]` in addition to the existing `[ProducesResponseType(StatusCodes.Status200OK)]`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | 401 documented | Swagger document generated | Endpoint inspected | 401 listed as possible response |
| 5b | 403 documented | Swagger document generated | Endpoint inspected | 403 listed as possible response |
| 5c | 400 documented | Swagger document generated | Endpoint inspected | 400 listed as possible response |

### R6: XML Summary Comment

The `GetStoreByIdAsync` method in `StoresController` MUST contain an XML `<summary>` doc comment describing the endpoint's behavior.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | Summary present | Controller source | Method inspected | `/// <summary>` present describing the endpoint |

### R7: Correct Namespace in GetStoreByIdService

`GetStoreByIdService.cs` MUST declare `namespace Application.Services.Stores` instead of `namespace Domain.Entities.Stores`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7a | Namespace matches location | Source compiled | File inspected | Namespace is `Application.Services.Stores` |

### R8: Null Store Handling (Race Condition)

After calling `_storeByIdService.GetStoreByIdIncludingModulesAsync(query.Id)`, the handler MUST check if the returned store is null and return `ResponseResult.NotFound(...)` (HTTP 404) if the store was deleted between validation and execution.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 8a | Store deleted race condition | Store exists at validation, deleted before handler executes | Handler runs | Returns 404 NotFound, no NRE |
| 8b | Normal flow | Store exists and is not deleted | Handler runs | Returns 200 OK with valid StoreDto |

---

## Error Responses

| Status | Condition | Trigger |
|--------|-----------|---------|
| 200 OK | Store found, DTO returned | Valid request |
| 400 Bad Request | Validation fails (empty/null ID, store not found by validator) | Validator rejects |
| 401 Unauthorized | No valid auth token | `[Authorize]` on controller |
| 403 Forbidden | Authenticated user lacks SuperAdmin or StoresAdmin role | `[HasPermission]` on controller |
| 404 Not Found | Store deleted between validation and handler execution | Handler null check (R8) |

---

## Affected Files

| File | Change |
|------|--------|
| `backend/src/Infrastructure/Persistence/Repositories/StoreRepository.cs` | Add `.Include(s => s.Owner).ThenInclude(o => o.User)` to both `GetStoreByIdIncludingModules*` methods; add `ExistsAsync()` impl |
| `backend/src/Domain/Interfaces/Repositories/IStoreRepository.cs` | Add `Task<bool> ExistsAsync(Guid id)` signature |
| `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoreById/GetStoreByIdQuery.cs` | Rename class to `GetStoreByIdQueryHandler`; remove `Task.FromResult`; add null store check |
| `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoreById/GetStoreByIdQueryValidator.cs` | Replace `IGetStoreByIdService` with `IStoreRepository.ExistsAsync` |
| `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` | Add `[ProducesResponseType(401,403,400)]` + XML `<summary>` on `GetStoreByIdAsync` |
| `backend/src/Application/Services/Stores/GetStoreByIdService.cs` | Fix namespace to `Application.Services.Stores` |

---

## Verification Criteria

- [ ] E2E: `GET /api/v1/stores/{id}` returns 200 with `ownerName` populated (no NRE) — R1
- [ ] Unit: handler class name is `GetStoreByIdQueryHandler` — R2
- [ ] Unit: handler return has no `await Task.FromResult` — R3
- [ ] Unit: validator executes `AnyAsync`, not full Include query — R4
- [ ] Integration: `ExistsAsync` returns true/false correctly — R4
- [ ] Swagger: 401/403/400 response codes documented — R5
- [ ] Code review: XML summary present — R6
- [ ] Code review: namespace is `Application.Services.Stores` — R7
- [ ] E2E: deleted store (race) returns 404, not NRE — R8
