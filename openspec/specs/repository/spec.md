# Delta for repository: IUserRepository + UserRepository

**Domain**: `repository` — `IUserRepository.cs` + `UserRepository.cs`
**Change**: `2026-07-30-get-users-all-endpoint-fixes`
**Status**: Active
**Last Updated**: 2026-07-30

---

## ADDED Requirements

### Requirement: RR1 — `.ThenInclude(o => o.User)` in All 3 Include Chains

Each of the 3 methods in `UserRepository` SHALL add `.ThenInclude(o => o.User)` after `.ThenInclude(s => s.Owner)` on the StoreUser → Store → Owner chain. This eliminates the NRE when AutoMapper accesses `Owner.User.FullName` (`UserProfile.cs` line 15).

**Affected methods:**
- `GetAllUsersByStoreIdIncludingStoreAndRolesAsync`
- `GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync`
- `GetAllUsersIncludingStoreAndRolesAsync`

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | NPE prevented | User with Owner but Owner.User lazy-loaded | AutoMapper maps `Owner.User.FullName` | `Owner.User` is eagerly loaded — no NRE, correct name returned |

### Requirement: RR2 — `.Take(1000)` Safety Limit on All 3 Queries

Each of the 3 repository methods MUST append `.Take(1000)` before `.ToListAsync()` to prevent unbounded result sets.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Limit applied | DB has 5000+ users | Query executes | SQL includes TOP(1000) / LIMIT 1000, exactly 1000 rows returned |
| 2b | Small result unaffected | DB has 50 users | Query executes | SQL includes LIMIT 1000, all 50 rows returned |

### Requirement: RR3 — CancellationToken Parameter on Interface + Implementation

All 3 repository methods in `IUserRepository` MUST add `CancellationToken cancellationToken = default` as the final parameter. The corresponding implementations in `UserRepository` MUST accept and pass the token to `ToListAsync(cancellationToken)`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Token passed to EF | Request with cancellation token | Query executes | `ToListAsync(cancellationToken)` called with the provided token |
| 3b | Default when omitted | Existing callers not passing token (legacy) | Same method called | `cancellationToken = default` applies, no compile errors |

### Requirement: RR4 — Private `IncludeStoreAndRoles()` Helper Method

A private helper method SHALL be extracted in `UserRepository` to eliminate the duplicated Include/ThenInclude chain (`StoreUser → Store → Owner` + `UserRoles → Role`) across the 3 methods.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | DRY applied | All 3 query methods inspected | Include chain examined | Single helper called instead of inline duplicates |
| 4b | Semantic equivalence | Any of the 3 query methods | Query executes | Generated SQL is identical to inline version |

## Verification Criteria

- [ ] All 3 Include chains have `.ThenInclude(o => o.User)` on the Owner navigation
- [ ] All 3 queries have `.Take(1000)` before `ToListAsync`
- [ ] All 3 interface signatures include `CancellationToken cancellationToken = default`
- [ ] All 3 implementations pass token to `ToListAsync(cancellationToken)`
- [ ] Private `IncludeStoreAndRoles()` helper eliminates duplicated Include chains

---

## Delta for repository: IUserRepository + UserRepository

**Change**: `get-user-by-id-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: RR-G1 — `ExistsAsync(Guid)` on IUserRepository

`IUserRepository` MUST expose `Task<bool> ExistsAsync(Guid id)`. The implementation MUST execute `_users.IgnoreQueryFilters().AnyAsync(u => u.Id == id)` — mirroring `StoreRepository.cs:89-92`. Note: `IgnoreQueryFilters()` is intentional and matches the store precedent; the existence check must not be filtered out by soft-delete/tenant query filters.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User exists | Valid user GUID in DB (including inactive/soft-deleted rows) | `ExistsAsync(id)` | Returns `true`, single `AnyAsync` query, no `.Include()` |
| 1b | User does not exist | GUID not in DB | `ExistsAsync(id)` | Returns `false` |
| 1c | IgnoreQueryFilters applied | User row hidden by active-only/tenant filter | `ExistsAsync(id)` | `IgnoreQueryFilters()` present in query; filter does not hide the row |

### MODIFIED Requirements

#### Requirement: RR-G2 — `GetUserByIdIncludingStoreAndRoles` Reuses `IncludeStoreAndRoles` + Forwards Token

`GetUserByIdIncludingStoreAndRoles` MUST replace its inline Include chain with the existing private `IncludeStoreAndRoles(query)` helper (already contains `.ThenInclude(o => o.User)` on Store → Owner, `UserRepository.cs:59`) so `OwnerName` resolves to `Owner.User.FullName`. The method MUST also accept `CancellationToken cancellationToken = default` (interface + implementation) and forward it to `FirstOrDefaultAsync(cancellationToken)`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | OwnerName resolved | User with Owner→User graph (StoreUser row present) | Endpoint called | `ownerName` in DTO equals `Owner.User.FullName` — not null |
| 2b | Helper reused | Method inspected | Source examined | `IncludeStoreAndRoles(query)` called; no inline duplicate chain |
| 2c | Token forwarded | Request with cancellation token | Query executes | `FirstOrDefaultAsync(cancellationToken)` receives the token |
| 2d | Default token | Existing callers not passing token | Same method called | `cancellationToken = default` applies; no compile errors |

#### Requirement: RR-G3 — `GetByLoginWithRelatedAsync` Adds `.ThenInclude(o => o.User)` + Forwards Token

`GetByLoginWithRelatedAsync` MUST add `.ThenInclude(o => o.User)` after `.ThenInclude(s => s.Owner)` on the StoreUser → Store → Owner chain (`UserRepository.cs:90-92`), fixing the same OwnerName resolution in the login flow. It MUST also accept `CancellationToken cancellationToken = default` and forward it to `FirstOrDefaultAsync(cancellationToken)`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | OwnerName in login flow | User with StoreUser→Store→Owner→User graph | `GetByLoginWithRelatedAsync(login)` executes | `Owner.User` eagerly loaded; no null `Owner.User.FullName` when mapped |
| 3b | Call site unaffected | `AuthenticationService.cs:31` calls with login only | Method called | Optional `= default` token parameter — call site compiles unchanged (single production call site, verified) |
| 3c | Token forwarded | Request with cancellation token | Query executes | `FirstOrDefaultAsync(cancellationToken)` receives the token |

### Verification Criteria

- [ ] `ExistsAsync(Guid)` on interface + impl; impl uses `IgnoreQueryFilters().AnyAsync`
- [ ] `GetUserByIdIncludingStoreAndRoles` calls `IncludeStoreAndRoles`; signature includes `CancellationToken cancellationToken = default`
- [ ] `GetByLoginWithRelatedAsync` has `.ThenInclude(o => o.User)`; signature includes `CancellationToken cancellationToken = default`
- [ ] `dotnet build` passes — `AuthenticationService.cs` compiles without modification

---

## Delta for repository: IUserRepository — ExistsAsync Signature Alignment

**Change**: `update-user-endpoint-fixes`

---

### MODIFIED Requirements

#### Requirement: RR-U1 — ExistsAsync Documented Signature Gains CancellationToken

RR-G1 documented `Task<bool> ExistsAsync(Guid id)`; the implemented signature (`IUserRepository.cs:19`) is `Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken = default)`, with the implementation forwarding the token (`UserRepository.cs:99-102` — `IgnoreQueryFilters().AnyAsync(u => u.Id == id, cancellationToken)`). This delta aligns the spec to the code: NO new method is needed — the UpdateUser validator (validation delta VL-U1) consumes this existing signature, passing `userId` + `cancellationToken`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Signature matches code | Spec compared with `IUserRepository.cs:19` | Signature inspected | `ExistsAsync(Guid id, CancellationToken cancellationToken = default)` documented |
| 1b | No new method | UpdateUser change implemented | Repository interface inspected | Zero new repository methods — existing `ExistsAsync` reused |
| 1c | Validator consumes | UpdateUserValidator runs | `ExistsAsync(userId, ct)` | Single `AnyAsync` query with token forwarded |

### Verification Criteria

- [ ] Main repository spec documents the `CancellationToken` parameter on `ExistsAsync` (merged at archive)
- [ ] No new repository method introduced by this change

---

## Delta for repository: IOwnerRepository + OwnerRepository

**Change**: `owners-update-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: RR-O1 — GetOwnerWithUserTrackedAsync (AsTracking, Owner+User Only)

`IOwnerRepository` MUST add `Task<Owner> GetOwnerWithUserTrackedAsync(Guid id, CancellationToken cancellationToken = default)`. Implementation MUST use `AsTracking()`, `.Include(o => o.User)` only (no ReSellerOwner/Stores chain), and forward the token to `FirstOrDefaultAsync`. The update path MUST stop using `GetOwnerIncludingUserByIdAsync`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Tracked load | Any update | Query executes | `AsTracking()` present; Owner+User loaded; no 5-join chain |
| 1b | Token forwarded | Request with token | Query executes | Token reaches `FirstOrDefaultAsync` |
| 1c | Update path light | Update flow | Repository call | Heavy include method not used on update path |

---

## Delta for repository: IOwnerRepository + OwnerRepository

**Change**: `owners-getbyid-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: RR-1 — Complete Include Chain on GetOwnerIncludingUserByIdAsync

`GetOwnerIncludingUserByIdAsync` MUST eagerly load the full navigation graph AutoMapper requires: `User`, `ReSellerOwner → ReSeller → User`, and `Stores.Where(s => s.IsActive) → StoreModules.Where(sm => sm.IsActive)` — mirroring `GetAllOwnersIncludingStoreModulesAsync` (`OwnerRepository.cs:23-25`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | ReSeller resolved | Owner with ReSellerOwner→ReSeller→User graph | Query executes | `ReSellerOwner.ReSeller.User` eagerly loaded; DTO `GetReSellerName` resolves — no null |
| 1b | Stores resolved | Owner with active Stores + active StoreModules | Query executes | `Stores.StoreModules` eagerly loaded with active-only filter |
| 1c | Inactive excluded | Owner has inactive Store/StoreModule rows | Query executes | Inactive Stores/StoreModules not included in result |

#### Requirement: RR-2 — CancellationToken Parameter on Interface + Implementation

`IOwnerRepository.GetOwnerIncludingUserByIdAsync` MUST add `CancellationToken cancellationToken = default` as the final parameter (interface + implementation). The implementation MUST forward the token to `FirstOrDefaultAsync(cancellationToken)`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Token passed to EF | Request with cancellation token | Query executes | `FirstOrDefaultAsync(cancellationToken)` receives the token |
| 2b | Default when omitted | Existing callers not passing token | Same method called | `cancellationToken = default` applies; no compile errors |

### Verification Criteria

- [ ] Interface signature includes `CancellationToken cancellationToken = default`
- [ ] Implementation has both ThenInclude chains + active filters, forwards token to `FirstOrDefaultAsync`
- [ ] E2E `Get_owner_by_id_returns_200` passes with complete AutoMapper resolution
- [ ] `dotnet build` passes — handler call site compiles unchanged (optional token param)

---

## Delta for repository: IOwnerRepository + OwnerRepository — GetAllOwners Queries

**Change**: `owners-getall-endpoint-fixes`

---

### ADDED Requirements

#### Requirement: RR-OC1 — `.Take(1000)` Safety Cap on Both GetAll Queries

`GetAllOwnersIncludingStoreModulesAsync` and `GetReSellerOwnersIncludingStoreModulesAsync` MUST append `.Take(1000)` before `.ToListAsync()` to prevent unbounded result sets (mirrors RR2 in the `get-users-all-endpoint-fixes` Users repository delta).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Limit applied | DB has 5000+ owners | Query executes | SQL includes TOP(1000)/LIMIT 1000; exactly 1000 rows returned |
| 1b | Small result unaffected | DB has 50 owners | Query executes | SQL includes LIMIT 1000; all 50 rows returned |

#### Requirement: RR-OC2 — CancellationToken Parameter on Interface + Implementation

Both methods in `IOwnerRepository` MUST add `CancellationToken cancellationToken = default` as the final parameter. The implementations in `OwnerRepository` MUST accept and forward the token to `ToListAsync(cancellationToken)`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Token passed to EF | Request with cancellation token | Query executes | `ToListAsync(cancellationToken)` receives the provided token |
| 2b | Default when omitted | Existing callers not passing token | Same method called | `cancellationToken = default` applies; no compile errors |

### Verification Criteria

- [ ] Both interface methods include `CancellationToken cancellationToken = default`
- [ ] Both implementations append `.Take(1000)` before `.ToListAsync(cancellationToken)`
- [ ] `dotnet build` passes — existing callers compile unchanged (optional token param)
