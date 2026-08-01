# Tasks: Approve / Disapprove Store Endpoint Fixes

## Phase 1: Command Handler — ApproveStoreCommand.cs

- [x] 1.1 Remove `_httpContextService` and `_storeByIdService` fields; keep `_storeRepository`, `_applicationUnitOfWork`, `_localizer`
- [x] 1.2 Update constructor — remove `IHttpContextService` and `IGetStoreByIdService` parameters
- [x] 1.3 Remove `IsSuperAdminOrOwnerAdmin` auth guard block (lines 47-48)
- [x] 1.4 Replace `_storeByIdService.GetStoreByIdIncludingModulesAsync(request.Id)` with `_storeRepository.GetStoreByIdAsync(request.Id)`
- [x] 1.5 Add null check: `if (store is null) throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound)` after fetch (plus `AcctionCode = "StoreNotFound"`)
- [x] 1.6 Remove unused `using` imports: `Application.Abstractions.HttpContext`, `Domain.Interfaces.Services.Stores`, and redundant system imports

## Phase 2: Command Handler — DisapproveStoreCommand.cs

- [x] 2.1 Remove `_httpContextService` and `_storeByIdService` fields; keep `_storeRepository`, `_applicationUnitOfWork`, `_localizer`
- [x] 2.2 Update constructor — remove `IHttpContextService` and `IGetStoreByIdService` parameters
- [x] 2.3 Remove `IsSuperAdminOrOwnerAdmin` auth guard block (lines 46-47)
- [x] 2.4 Replace `_storeByIdService.GetStoreByIdIncludingModulesAsync(request.Id)` with `_storeRepository.GetStoreByIdAsync(request.Id)`
- [x] 2.5 Add null check: `if (store is null) throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound)` after fetch (plus `AcctionCode = "StoreNotFound"`)
- [x] 2.6 Remove unused `using` imports: `Application.Abstractions.HttpContext`, `Domain.Interfaces.Services.Stores`, and redundant system imports

## Phase 3: Validator — ApproveStoreCommandValidator.cs

- [x] 3.1 Remove `_storeByIdService` field and its constructor param (keep `_localizer` — still used for `NotNull`/`NotEmpty` messages)
- [x] 3.2 Remove `StoreExists` private method
- [x] 3.3 Remove `MustAsync(StoreExists)` rule line; keep only `NotNull().NotEmpty()`
- [x] 3.4 Remove unused `using Domain.Interfaces.Services.Stores`

## Phase 4: Validator — DisapproveStoreCommandValidator.cs

- [x] 4.1 Remove `_storeByIdService` field and its constructor param (keep `_localizer`)
- [x] 4.2 Remove `StoreExists` private method
- [x] 4.3 Remove `MustAsync(StoreExists)` rule line; keep only `NotNull().NotEmpty()`
- [x] 4.4 Remove unused `using Domain.Interfaces.Services.Stores`

## Phase 5: Controller — StoresController.cs

- [x] 5.1 Add XML `<summary>` doc comment on `ApproveStoreAsync` (e.g. `/// Approve a store by its identifier. Only available for SuperAdmin.`)
- [x] 5.2 Add XML `<summary>` doc comment on `DisapproveStoreAsync`
- [x] 5.3 Add `[FromBody]` attribute on `ApproveStoreCommand command` parameter
- [x] 5.4 Add `[FromBody]` attribute on `DisapproveStoreCommand command` parameter
- [x] 5.5 Add `[ProducesResponseType(StatusCodes.Status400BadRequest)]` on `ApproveStoreAsync`
- [x] 5.6 Add `[ProducesResponseType(StatusCodes.Status401Unauthorized)]` on `ApproveStoreAsync`
- [x] 5.7 Add `[ProducesResponseType(StatusCodes.Status403Forbidden)]` on `ApproveStoreAsync`
- [x] 5.8 Add `[ProducesResponseType(StatusCodes.Status404NotFound)]` on `ApproveStoreAsync`
- [x] 5.9 Add `[ProducesResponseType(StatusCodes.Status400BadRequest)]` on `DisapproveStoreAsync`
- [x] 5.10 Add `[ProducesResponseType(StatusCodes.Status401Unauthorized)]` on `DisapproveStoreAsync`
- [x] 5.11 Add `[ProducesResponseType(StatusCodes.Status403Forbidden)]` on `DisapproveStoreAsync`
- [x] 5.12 Add `[ProducesResponseType(StatusCodes.Status404NotFound)]` on `DisapproveStoreAsync`

## Phase 6: Tests — StoreApproveTests.cs + StoreDisapproveTests.cs

- [x] 6.1 Rename `Approve_already_approved_returns_succeeded_data_false` → `..._true`
- [x] 6.2 Split `AssertApprove400` into `AssertApprove400` (for empty-id, unchanged) and new `AssertApprove404` that asserts `HttpStatusCode.NotFound` + error code `"StoreNotFound"`; update `Approve_unknown_store_returns_400_code_Id` to use `AssertApprove404` and rename to `..._404_code_StoreNotFound`
- [x] 6.3 Rename `Disapprove_already_disapproved_returns_succeeded_data_false` → `..._true`
- [x] 6.4 Same split for `AssertDisapprove400`/`AssertDisapprove404`; update `Disapprove_unknown_store_returns_400_code_Id` to use 404

## Phase 7: Build & Verify

- [x] 7.1 `dotnet build` — 0 errors
- [x] 7.2 Run all Store E2E tests — 10 tests (5 Approve + 5 Disapprove) pass
