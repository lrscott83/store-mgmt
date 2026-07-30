# Tasks: Fix GET /api/v1/stores/{id} — 7 bugs from code review

## Phase 1: Foundation (Interface + Error Types)

### Task 1.1: Add ExistsAsync to IStoreRepository
**Status**: ✅ Complete
**Priority**: HIGH
**Files**: `backend/src/Domain/Interfaces/Repositories/IStoreRepository.cs`
**Description**: Add `Task<bool> ExistsAsync(Guid id)` to the interface
**Verification**: Compiles, interface exposes new method (used `new` keyword to suppress hiding warning)

### Task 1.2: Add NotFound error to StoreErrors
**Status**: ✅ Complete
**Priority**: HIGH
**Files**: `backend/src/Domain/Entities/Stores/StoreErrors.cs`
**Description**: Add `public static readonly Error NotFound = new("Store.NotFound", "The store was not found.")`
**Verification**: Error constant accessible from handler

## Phase 2: Core Implementation

### Task 2.1: Add Include(Owner.User) to StoreRepository queries
**Status**: ✅ Complete
**Priority**: HIGH
**Files**: `backend/src/Infrastructure/Persistence/Repositories/StoreRepository.cs`
**Description**: Add `.Include(s => s.Owner).ThenInclude(o => o.User)` before `.Include(s => s.StoreModules...)` in both `GetStoreByIdIncludingModules*` methods
**Verification**: No NRE on `Owner.User.FullName` — covers R1a/R1b/R1c

### Task 2.2: Implement ExistsAsync in StoreRepository
**Status**: ✅ Complete
**Priority**: HIGH
**Files**: `backend/src/Infrastructure/Persistence/Repositories/StoreRepository.cs`
**Description**: Implement with `.IgnoreQueryFilters().AnyAsync(s => s.Id == id)` — covers R4a/R4b/R4c
**Verification**: Returns true for existing store, false for missing (used `new` keyword to suppress hiding warning)

### Task 2.3: Update validator to use IStoreRepository.ExistsAsync
**Status**: ✅ Complete
**Priority**: HIGH
**Files**: `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoreById/GetStoreByIdQueryValidator.cs`
**Description**: Replace `IGetStoreByIdService` injection with `IStoreRepository`, replace StoreExists body with `_storeRepository.ExistsAsync(storeId)` — covers R4
**Verification**: Validator runs lightweight AnyAsync, no Include chain

### Task 2.4: Rename GetAllStoresQueryHandler → GetStoreByIdQueryHandler
**Status**: ✅ Complete
**Priority**: MEDIUM
**Files**: `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoreById/GetStoreByIdQuery.cs`
**Description**: Rename class only — MediatR resolves by generic type, no DI changes needed — covers R2
**Verification**: Class name matches query type

### Task 2.5: Remove redundant await Task.FromResult
**Status**: ✅ Complete
**Priority**: MEDIUM
**Files**: `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoreById/GetStoreByIdQuery.cs`
**Description**: Change to `return ResponseResult.Success(storeDto);` — covers R3
**Verification**: No `Task.FromResult` in handler return path

### Task 2.6: Add null store check in handler (race condition)
**Status**: ✅ Complete
**Priority**: HIGH
**Files**: `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoreById/GetStoreByIdQuery.cs`
**Description**: After service call, add `if (store is null) return ResponseResult.Failure<StoreDto>(StoreErrors.NotFound, 404)` — covers R8a/R8b
**Verification**: Deleted store returns 404, not NRE

### Task 2.7: Add ProducesResponseType + XML summary to controller
**Status**: ✅ Complete
**Priority**: LOW
**Files**: `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs`
**Description**: Add `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]`, `[ProducesResponseType(StatusCodes.Status400BadRequest)]` + XML `<summary>` on `GetStoreByIdAsync` — covers R5/R6
**Verification**: Swagger shows 401/403/400 response codes

### Task 2.8: Fix namespace in GetStoreByIdService
**Status**: ✅ Complete
**Priority**: MEDIUM
**Files**: `backend/src/Application/Services/Stores/GetStoreByIdService.cs`
**Description**: Change `namespace Domain.Entities.Stores` → `namespace Application.Services.Stores` — covers R7
**Verification**: Namespace matches file location in project structure
