# Delta for repository: IOwnerRepository + OwnerRepository

**Domain**: `repository` — `Domain/Interfaces/Repositories/IOwnerRepository.cs` + `Infrastructure/Persistence/Repositories/OwnerRepository.cs`
**Change**: `owners-getall-endpoint-fixes`
**Source**: proposal.md → Modified Capabilities → `repository`
**Status**: Draft
**Last Updated**: 2026-08-02

---

## ADDED Requirements

### Requirement: RR-OC1 — `.Take(1000)` Safety Cap on Both GetAll Queries

`GetAllOwnersIncludingStoreModulesAsync` and `GetReSellerOwnersIncludingStoreModulesAsync` MUST append `.Take(1000)` before `.ToListAsync()` to prevent unbounded result sets (mirrors RR2 in the `get-users-all-endpoint-fixes` Users repository delta).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Limit applied | DB has 5000+ owners | Query executes | SQL includes TOP(1000)/LIMIT 1000; exactly 1000 rows returned |
| 1b | Small result unaffected | DB has 50 owners | Query executes | SQL includes LIMIT 1000; all 50 rows returned |

### Requirement: RR-OC2 — CancellationToken Parameter on Interface + Implementation

Both methods in `IOwnerRepository` MUST add `CancellationToken cancellationToken = default` as the final parameter. The implementations in `OwnerRepository` MUST accept and forward the token to `ToListAsync(cancellationToken)`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Token passed to EF | Request with cancellation token | Query executes | `ToListAsync(cancellationToken)` receives the provided token |
| 2b | Default when omitted | Existing callers not passing token | Same method called | `cancellationToken = default` applies; no compile errors |

## Verification Criteria

- [ ] Both interface methods include `CancellationToken cancellationToken = default`
- [ ] Both implementations append `.Take(1000)` before `.ToListAsync(cancellationToken)`
- [ ] `dotnet build` passes — existing callers compile unchanged (optional token param)
