# Tasks: Update Store Endpoint Fixes

## Phase 1: Command Handler — UpdateStoreCommand.cs

- [x] 1.1 **Remove unused import** — Delete `using static System.Formats.Asn1.AsnWriter;` (line 21)
- [x] 1.2 **Fix auth status code** — Change `HttpStatusCode.BadRequest` → `HttpStatusCode.Forbidden`, update message from `"UserNotFound"` to `"AuthorizationFailed"` (line 72)
- [x] 1.3 **Batch-load modules (N+1 fix)** — Call `_moduleRepository.GetModulesByIdsAsync(moduleIds)` once before loop (lines 128-153); build `ToDictionary()` lookup; replace individual `GetByIdAsync` inside loop with dictionary access
- [x] 1.4 **Fix fire-and-forget** — Replace `ForEach(async ...)` with `foreach` + `await` (line 159)

## Phase 2: Validator — UpdateStoreCommandValidator.cs

- [x] 2.1 **Remove StoreExists rule** — Delete the async `MustAsync` rule calling `_storeByIdService.GetStoreByIdIncludingModulesAsync`; keep only `NotEmpty`/`NotEqual(Guid.Empty)` for `Id`

## Phase 3: Controller — StoresController.cs

- [x] 3.1 **Add ProducesResponseType attributes** — Add `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]` to `UpdatedStoreAsync` action

## Phase 4: Testing

- [ ] 4.1 **Unit: ForEach removed** — Assert `AddAsync` called exactly `storeRoleFeatures.Count` times
- [ ] 4.2 **Unit: N+1 eliminated** — Assert `GetModulesByIdsAsync` called once, `GetByIdAsync` not called
- [ ] 4.3 **Unit: Auth returns 403** — Mock `IsSuperAdminOrOwnerAdmin` = false, assert `ApiException` with `Forbidden`
- [ ] 4.4 **Unit: Validator skips DB** — Assert `_storeByIdService` not called during validation
