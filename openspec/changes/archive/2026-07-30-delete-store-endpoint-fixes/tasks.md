# Tasks: Delete Store Endpoint Fixes

## Phase 1: Repository — Add Lightweight GetStoreByIdAsync

- [x] 1.1 **Add method to IStoreRepository** — Add `Task<Store?> GetStoreByIdAsync(Guid id);` to `IStoreRepository` interface
- [x] 1.2 **Implement in StoreRepository** — Add `GetStoreByIdAsync` that does `_stores.Where(s => s.Id == id).FirstOrDefaultAsync()` (respects query filters, no includes)

## Phase 2: Command Handler — DeactivateStoreCommand.cs

- [x] 2.1 **Fix auth status code and message** — Change `HttpStatusCode.BadRequest` → `HttpStatusCode.Forbidden`, change `"UserNotFound"` → `"DontHavePermission"` (line 42)
- [x] 2.2 **Add null check after store load** — After `GetStoreByIdAsync`, if store is null throw `ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound)` (after line 44)
- [x] 2.3 **Switch to lightweight load** — Replace `_storeByIdService.GetStoreByIdIncludingModulesAsync(request.Id)` with `_storeRepository.GetStoreByIdAsync(request.Id)`

## Phase 3: Validator — DeactivateStoreCommandValidator.cs

- [x] 3.1 **Remove StoreExists rule** — Delete the `MustAsync` rule, the `StoreExists` method, and the `_storeByIdService` field/parameter
- [x] 3.2 **Remove unused import** — Delete `using Domain.Interfaces.Repositories;`

## Phase 4: Controller — SMCA.WebApi StoresController.cs

- [x] 4.1 **Add ProducesResponseType attributes** — Add `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]`, `[ProducesResponseType(StatusCodes.Status404NotFound)]` to `DeleteAsync` action
- [x] 4.2 **Fix XML comment** — Change `/// Delete tenant by id` → `/// Deactivate store by id`

## Phase 5: Controller — WebApiTest StoresController.cs

- [x] 5.1 **Fix broken class reference** — Change `new DeleteStoreCommand(id)` → `new DeactivateStoreCommand(id)`
- [x] 5.2 **Fix XML comment** — Change `/// Delete tenant by id` → `/// Deactivate store by id`

## Phase 6: Build & Verify

- [x] 6.1 **Build solution** — `dotnet build` succeeds with 0 errors
- [x] 6.2 **Run existing Store E2E tests** — All existing store endpoint E2E tests pass
