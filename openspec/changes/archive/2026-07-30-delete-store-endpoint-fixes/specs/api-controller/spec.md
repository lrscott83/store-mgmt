# Delta for api-controller: StoresController

**Domain**: `api-controller` — `StoresController.cs` (`DeleteAsync` action)  
**Change**: `delete-store-endpoint-fixes`  
**Status**: Draft  

## ADDED Requirements

### Requirement: CT1 — Swagger Documents 400, 401, 403, 404 for DeleteStore

The `DeleteAsync` action in `StoresController` MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]`, and `[ProducesResponseType(StatusCodes.Status404NotFound)]` as additional response metadata.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 400 documented | Swagger/OpenAPI document generated | `DeleteAsync` endpoint inspected | 400 Bad Request listed as possible response |
| 1b | 401 documented | Swagger/OpenAPI document generated | `DeleteAsync` endpoint inspected | 401 Unauthorized listed as possible response |
| 1c | 403 documented | Swagger/OpenAPI document generated | `DeleteAsync` endpoint inspected | 403 Forbidden listed as possible response |
| 1d | 404 documented | Swagger/OpenAPI document generated | `DeleteAsync` endpoint inspected | 404 Not Found listed as possible response |
| 1e | 200 still documented | Swagger/OpenAPI document generated | `DeleteAsync` endpoint inspected | 200 OK remains in the response list |

### Requirement: CT2 — XML Comment Corrected

The XML doc comment on `DeleteAsync` MUST say "Deactivate store by id" instead of "Delete tenant by id".

### Requirement: CT3 — WebApiTest Controller Fix

The `WebApiTest/Controllers/v1/StoresController.cs` `DeleteAsync` method MUST use `new DeactivateStoreCommand(id)` instead of the non-existent `new DeleteStoreCommand(id)`. Its XML comment MUST also say "Deactivate store by id".

## Verification Criteria

- [ ] `DeleteAsync` has `[ProducesResponseType(StatusCodes.Status400BadRequest)]` attribute
- [ ] `DeleteAsync` has `[ProducesResponseType(StatusCodes.Status401Unauthorized)]` attribute
- [ ] `DeleteAsync` has `[ProducesResponseType(StatusCodes.Status403Forbidden)]` attribute
- [ ] `DeleteAsync` has `[ProducesResponseType(StatusCodes.Status404NotFound)]` attribute
- [ ] XML comment says "Deactivate store by id" in both controllers
- [ ] WebApiTest controller compiles with `DeactivateStoreCommand` reference
