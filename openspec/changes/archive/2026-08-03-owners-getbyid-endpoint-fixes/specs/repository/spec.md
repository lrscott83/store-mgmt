# Delta for repository: IOwnerRepository + OwnerRepository

**Domain**: `repository` — `Domain/Interfaces/Repositories/IOwnerRepository.cs` + `Infrastructure/Persistence/Repositories/OwnerRepository.cs`
**Change**: `owners-getbyid-endpoint-fixes`
**Source**: proposal.md → Modified Capabilities → `repository`
**Status**: Draft
**Last Updated**: 2026-08-02

---

## ADDED Requirements

### Requirement: RR-1 — Complete Include Chain on GetOwnerIncludingUserByIdAsync

`GetOwnerIncludingUserByIdAsync` MUST eagerly load the full navigation graph AutoMapper requires: `User`, `ReSellerOwner → ReSeller → User`, and `Stores.Where(s => s.IsActive) → StoreModules.Where(sm => sm.IsActive)` — mirroring `GetAllOwnersIncludingStoreModulesAsync` (`OwnerRepository.cs:23-25`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | ReSeller resolved | Owner with ReSellerOwner→ReSeller→User graph | Query executes | `ReSellerOwner.ReSeller.User` eagerly loaded; DTO `GetReSellerName` resolves — no null |
| 1b | Stores resolved | Owner with active Stores + active StoreModules | Query executes | `Stores.StoreModules` eagerly loaded with active-only filter |
| 1c | Inactive excluded | Owner has inactive Store/StoreModule rows | Query executes | Inactive Stores/StoreModules not included in result |

### Requirement: RR-2 — CancellationToken Parameter on Interface + Implementation

`IOwnerRepository.GetOwnerIncludingUserByIdAsync` MUST add `CancellationToken cancellationToken = default` as the final parameter (interface + implementation). The implementation MUST forward the token to `FirstOrDefaultAsync(cancellationToken)`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Token passed to EF | Request with cancellation token | Query executes | `FirstOrDefaultAsync(cancellationToken)` receives the token |
| 2b | Default when omitted | Existing callers not passing token | Same method called | `cancellationToken = default` applies; no compile errors |

## Verification Criteria

- [ ] Interface signature includes `CancellationToken cancellationToken = default`
- [ ] Implementation has both ThenInclude chains + active filters, forwards token to `FirstOrDefaultAsync`
- [ ] E2E `Get_owner_by_id_returns_200` passes with complete AutoMapper resolution
- [ ] `dotnet build` passes — handler call site compiles unchanged (optional token param)
