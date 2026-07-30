# Tasks: Set My Store Endpoint Fixes

## Phase 1: Command Handler — SetMyStoreCommand.cs

- [x] 1.1 **Rename handler class** — Change `SetStoreCommandHandler` → `SetMyStoreCommandHandler` (class decl line 12 + constructor line 19)
- [x] 1.2 **Add new dependencies** — Inject `IStoreRepository _storeRepository` and `IStringLocalizer<I18n> _localizer` as fields + constructor params + assignments
- [x] 1.3 **Add missing usings** — Add `using Application.Exceptions;`, `using Microsoft.Extensions.Localization;`, `using Resources;`, `using System.Net;`
- [x] 1.4 **Null user check** — After `GetByIdAsync`, if `user is null` throw `new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden)`
- [x] 1.5 **Store access validation** — If not `IsSuperAdmin`, call `GetActiveStoresByUserIdAsync(user.Id)` and throw 403 if `request.StoreId` not in result
- [x] 1.6 **Remove extraneous blank line** — Delete blank line between `_applicationUnitOfWork` field and constructor (SM-CH4)

## Phase 2: Validator — SetMyStoreCommandValidator.cs

- [x] 2.1 **Swap dependency** — Replace `IGetStoreByIdService _storeByIdService` with `IStoreRepository _storeRepository` (field, ctor param, assignment)
- [x] 2.2 **Remove `.NotNull()` on Guid** — Delete `.NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])` line; keep only `.NotEmpty()`
- [x] 2.3 **Simplify StoreExists** — Replace body with `return await _storeRepository.ExistsAsync(storeId);`
- [x] 2.4 **Clean usings** — Remove `using Domain.Interfaces.Services.Stores;`

## Phase 3: Controller — StoresController.cs

- [x] 3.1 **Add ProducesResponseType attributes** — Insert `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]` after existing `[ProducesResponseType(StatusCodes.Status200OK)]` on `SetMyStoreIdAsync`

## Phase 4: Testing

- [ ] 4.1 **Unit: null user → 403** — Mock `GetByIdAsync` → null, assert `ApiException` with `Forbidden` thrown
- [ ] 4.2 **Unit: access denied → 403** — Mock `GetActiveStoresByUserIdAsync` → list without `request.StoreId`, assert `ApiException` with `Forbidden`
- [ ] 4.3 **Unit: SuperAdmin bypass** — Mock `IsSuperAdmin` → true, assert `GetActiveStoresByUserIdAsync` NOT called
- [ ] 4.4 **Unit: validator uses ExistsAsync** — Assert `_storeRepository.ExistsAsync` called once; `_storeByIdService` never called
- [ ] 4.5 **Unit: no .NotNull() on Guid** — Assert rule chain has `.NotEmpty()` but not `.NotNull()`
- [ ] 4.6 **Integration: happy path** — Valid SuperAdmin sets store ID → 200, `SelectedStoreId` updated in DB
