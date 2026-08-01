# Delta for command-handler: SetMyStoreCommand

**Domain**: `command-handler` — `SetMyStoreCommand.cs` (`SetStoreCommandHandler`)
**Change**: `2026-07-30-set-my-store-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-30

---

## ADDED Requirements

### Requirement: SM-CH1 — Null User Returns 403 Forbidden

When `_userRepository.GetByIdAsync(...)` returns null (user from JWT not found in DB), the handler MUST throw `ApiException` with `HttpStatusCode.Forbidden` (403) and a localized message. It MUST NOT continue to `user.SelectedStoreId` which would cause a NullReferenceException.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User not found returns 403 | Request with valid JWT but user GUID missing from DB | Handler calls `GetByIdAsync` and gets null | `ApiException` with 403 Forbidden is thrown; no NRE occurs |
| 1b | Existing user proceeds | Valid user exists in DB matching JWT sub claim | Handler calls `GetByIdAsync` and gets non-null | Handler continues to SetSelectedStoreId logic |

### Requirement: SM-CH2 — Handler Class Renamed to SetMyStoreCommandHandler

The handler class MUST be renamed from `SetStoreCommandHandler` to `SetMyStoreCommandHandler` to match the command it handles (`SetMyStoreCommand`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Class name matches command | Project compiled after rename | Inspect handler class | Class is `SetMyStoreCommandHandler : ICommandHandler<SetMyStoreCommand, bool>` |
| 2b | DI registration unaffected | MediatR scans assembly | Handler injected | Registration works — MediatR resolves by handler interface, not class name |

### Requirement: SM-CH3 — Store Access Validation

The handler MUST verify that `request.StoreId` belongs to the user's accessible stores before assigning it. It MUST call `IStoreRepository.GetActiveStoresByUserIdAsync(user.Id)` and check the returned list contains `request.StoreId`. If not found, throw `ApiException` with `HttpStatusCode.Forbidden`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Access granted | User has access to store with ID in request | Handler validates access | Store ID assigned to `user.SelectedStoreId` and saved |
| 3b | Access denied | User does NOT have access to store ID in request | Handler validates access | `ApiException` with 403 Forbidden thrown; SelectedStoreId unchanged |
| 3c | SuperAdmin bypass | SuperAdmin user requests any store ID | Handler validates access | Access check passes (or skipped) — store ID assigned |

## REMOVED Requirements

### Requirement: SM-CH4 — Dead Constructor Parameter Removed

(Reason: After renaming, the handler class has a suspicious blank line between constructor parameters — `_applicationUnitOfWork` has an extra blank line preceding it.)

The extraneous blank line between `_userRepository` and `_applicationUnitOfWork` in the constructor parameter list MUST be removed.
