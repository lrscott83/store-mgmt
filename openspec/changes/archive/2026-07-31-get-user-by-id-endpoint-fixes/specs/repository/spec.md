# Delta for repository: IUserRepository + UserRepository

**Domain**: `repository` — `IUserRepository.cs` + `UserRepository.cs`
**Change**: `get-user-by-id-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## ADDED Requirements

### Requirement: RR-G1 — `ExistsAsync(Guid)` on IUserRepository

`IUserRepository` MUST expose `Task<bool> ExistsAsync(Guid id)`. The implementation MUST execute `_users.IgnoreQueryFilters().AnyAsync(u => u.Id == id)` — mirroring `StoreRepository.cs:89-92`. Note: `IgnoreQueryFilters()` is intentional and matches the store precedent; the existence check must not be filtered out by soft-delete/tenant query filters.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User exists | Valid user GUID in DB (including inactive/soft-deleted rows) | `ExistsAsync(id)` | Returns `true`, single `AnyAsync` query, no `.Include()` |
| 1b | User does not exist | GUID not in DB | `ExistsAsync(id)` | Returns `false` |
| 1c | IgnoreQueryFilters applied | User row hidden by active-only/tenant filter | `ExistsAsync(id)` | `IgnoreQueryFilters()` present in query; filter does not hide the row |

## MODIFIED Requirements

### Requirement: RR-G2 — `GetUserByIdIncludingStoreAndRoles` Reuses `IncludeStoreAndRoles` + Forwards Token

`GetUserByIdIncludingStoreAndRoles` MUST replace its inline Include chain with the existing private `IncludeStoreAndRoles(query)` helper (already contains `.ThenInclude(o => o.User)` on Store → Owner, `UserRepository.cs:59`) so `OwnerName` resolves to `Owner.User.FullName`. The method MUST also accept `CancellationToken cancellationToken = default` (interface + implementation) and forward it to `FirstOrDefaultAsync(cancellationToken)`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | OwnerName resolved | User with Owner→User graph (StoreUser row present) | Endpoint called | `ownerName` in DTO equals `Owner.User.FullName` — not null |
| 2b | Helper reused | Method inspected | Source examined | `IncludeStoreAndRoles(query)` called; no inline duplicate chain |
| 2c | Token forwarded | Request with cancellation token | Query executes | `FirstOrDefaultAsync(cancellationToken)` receives the token |
| 2d | Default token | Existing callers not passing token | Same method called | `cancellationToken = default` applies; no compile errors |

### Requirement: RR-G3 — `GetByLoginWithRelatedAsync` Adds `.ThenInclude(o => o.User)` + Forwards Token

`GetByLoginWithRelatedAsync` MUST add `.ThenInclude(o => o.User)` after `.ThenInclude(s => s.Owner)` on the StoreUser → Store → Owner chain (`UserRepository.cs:90-92`), fixing the same OwnerName resolution in the login flow. It MUST also accept `CancellationToken cancellationToken = default` and forward it to `FirstOrDefaultAsync(cancellationToken)`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | OwnerName in login flow | User with StoreUser→Store→Owner→User graph | `GetByLoginWithRelatedAsync(login)` executes | `Owner.User` eagerly loaded; no null `Owner.User.FullName` when mapped |
| 3b | Call site unaffected | `AuthenticationService.cs:31` calls with login only | Method called | Optional `= default` token parameter — call site compiles unchanged (single production call site, verified) |
| 3c | Token forwarded | Request with cancellation token | Query executes | `FirstOrDefaultAsync(cancellationToken)` receives the token |

## Verification Criteria

- [ ] `ExistsAsync(Guid)` on interface + impl; impl uses `IgnoreQueryFilters().AnyAsync`
- [ ] `GetUserByIdIncludingStoreAndRoles` calls `IncludeStoreAndRoles`; signature includes `CancellationToken cancellationToken = default`
- [ ] `GetByLoginWithRelatedAsync` has `.ThenInclude(o => o.User)`; signature includes `CancellationToken cancellationToken = default`
- [ ] `dotnet build` passes — `AuthenticationService.cs` compiles without modification
