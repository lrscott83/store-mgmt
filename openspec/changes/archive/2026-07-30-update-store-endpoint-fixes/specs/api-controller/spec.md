# Delta for api-controller: StoresController

**Domain**: `api-controller` — `StoresController.cs` (`UpdateStoreAsync` action)  
**Change**: `update-store-endpoint-fixes`  
**Status**: Draft  
**Last Updated**: 2026-07-30

---

## ADDED Requirements

### Requirement: CT1 — Swagger Documents 400, 401, 403 for UpdateStore

The `UpdateStoreAsync` action in `StoresController` MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, and `[ProducesResponseType(StatusCodes.Status403Forbidden)]` as additional response metadata.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 400 documented | Swagger/OpenAPI document generated | `UpdateStoreAsync` endpoint inspected | 400 Bad Request listed as possible response |
| 1b | 401 documented | Swagger/OpenAPI document generated | `UpdateStoreAsync` endpoint inspected | 401 Unauthorized listed as possible response |
| 1c | 403 documented | Swagger/OpenAPI document generated | `UpdateStoreAsync` endpoint inspected | 403 Forbidden listed as possible response |
| 1d | 200 still documented | Swagger/OpenAPI document generated | `UpdateStoreAsync` endpoint inspected | 200 OK remains in the response list |

## Verification Criteria

- [ ] `UpdateStoreAsync` has `[ProducesResponseType(StatusCodes.Status400BadRequest)]` attribute
- [ ] `UpdateStoreAsync` has `[ProducesResponseType(StatusCodes.Status401Unauthorized)]` attribute
- [ ] `UpdateStoreAsync` has `[ProducesResponseType(StatusCodes.Status403Forbidden)]` attribute
- [ ] Swagger UI renders all 4 response codes for the endpoint
