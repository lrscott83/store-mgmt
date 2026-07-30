# Delta for command-handler: UpdateStoreCommand

**Domain**: `command-handler` — `UpdateStoreCommand.cs`  
**Change**: `update-store-endpoint-fixes`  
**Status**: Draft  
**Last Updated**: 2026-07-30

---

## ADDED Requirements

### Requirement: CH1 — Proper Async Await in UpdateStoreModules

`UpdateStoreModules` MUST use a sequential `foreach` loop with `await` instead of `List<T>.ForEach` with an async lambda, which creates fire-and-forget tasks that may complete after the response is sent.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Modules added sequentially | A set of `StoreRoleFeature` entities | `UpdateStoreModules` executes | Each `AddAsync` completes before the next starts; no unobserved task exception |
| 1b | Exception during add | `AddAsync` throws for one entity | The `foreach` loop reaches it | Exception propagates normally; caller receives the error |

### Requirement: CH2 — Batch Module Load, Not N+1

The handler MUST call `_moduleRepository.GetModulesByIdsAsync(moduleIds)` once before the module iteration loop, then use an in-memory lookup (e.g., dictionary) inside the loop. Individual `GetByIdAsync` calls MUST NOT appear inside the `foreach (var moduleId in moduleIds)` loop.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Single batch query | N module IDs to resolve | Handler processes modules | `GetModulesByIdsAsync` called ONCE, `GetByIdAsync` called ZERO times |
| 2b | Module not found in batch | One module ID has no match in the batch result | Handler looks it up via dictionary | Dictionary lookup returns null, handler handles gracefully |

### Requirement: CH3 — Correct Auth Failure Status Code

When the authenticated user is not found in the database, the handler MUST throw `ApiException` with `HttpStatusCode.Forbidden` (403) and a message key `_localizer["AuthorizationFailed"]` (or equivalent). It MUST NOT use `HttpStatusCode.BadRequest`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | User not found returns 403 | Request with valid JWT but user missing from DB | Handler validates current user | 403 Forbidden returned with "AuthorizationFailed" message |
| 3b | Authorized user proceeds | Valid user exists in DB | Handler validates current user | Handler continues to store-update logic |

## REMOVED Requirements

### Requirement: CH4 — Unused Import Removed

(Reason: `using static System.Formats.Asn1.AsnWriter;` serves no purpose in `UpdateStoreCommand.cs` and generates a compiler warning.)

The `using static System.Formats.Asn1.AsnWriter;` directive MUST be deleted from the file.
