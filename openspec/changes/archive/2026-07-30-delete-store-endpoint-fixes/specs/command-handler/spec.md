# Delta for command-handler: DeactivateStoreCommand

**Domain**: `command-handler` — `DeactivateStoreCommand.cs`  
**Change**: `delete-store-endpoint-fixes`  
**Status**: Draft  

## ADDED Requirements

### Requirement: CH1 — Null Check After Store Load

After loading the store entity, the handler MUST check for null and throw `ApiException` with `HttpStatusCode.NotFound` and the `"StoreNotFound"` resource key if the store is not found.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Store not found | Non-existent store ID | Handler executes `GetStoreByIdAsync` | Returns 404 with "StoreNotFound" message |
| 1b | Store exists | Valid store ID | Handler executes `GetStoreByIdAsync` | Continues to deactivation logic |

### Requirement: CH2 — Lightweight Store Load

The handler MUST load the store using a lightweight query that returns only the `Store` entity without navigation properties (Owner, User, StoreModules, Module). It MUST use `_storeRepository.GetStoreByIdAsync(id)` instead of `_storeByIdService.GetStoreByIdIncludingModulesAsync(id)`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Minimal query | Valid store ID | Handler loads store | No JOINs to Owner, User, StoreModules, or Module tables |

### Requirement: CH3 — Correct Auth Failure Status Code

When the authenticated user lacks the required permission, the handler MUST throw `ApiException` with `HttpStatusCode.Forbidden` (403) and the resource key `"DontHavePermission"`. It MUST NOT use `HttpStatusCode.BadRequest` or the key `"UserNotFound"`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | User lacks permission | Authenticated user without SuperAdmin role | Handler validates permissions | 403 Forbidden returned with "DontHavePermission" message |
| 3b | Authorized user proceeds | Authenticated user with SuperAdmin role | Handler validates permissions | Handler continues to deactivation logic |
