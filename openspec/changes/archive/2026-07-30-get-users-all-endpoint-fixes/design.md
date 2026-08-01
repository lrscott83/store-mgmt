# Design: Get Users All Endpoint Fixes

## Technical Approach

Eight targeted fixes across 6 files in the `GET /api/v1/users/all/{includeInactive}` pipeline. Each fix addresses a specific issue (NRE, missing CancellationToken, unbounded query, DRY, missing metadata, no validator, null-safety, missing attribute). No new interfaces, DTOs, or migrations. Pattern follows previous endpoint fix changes (update-store, register, approve-store).

## Architecture Decisions

### Decision: DRY Include chain → private helper method

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Private `IncludeStoreAndRoles(IQueryable<User>)` on `UserRepository` | Single-use helper, contained in class, no contract leak | ✅ Chosen |
| Extension method on `IQueryable<User>` | Reusable elsewhere but pollutes queryable surface — only 3 call sites | ❌ Rejected |
| Base class override | Overkill for one reusable chain | ❌ Rejected |

**Rationale**: All 3 repo methods use the identical chain:
`.Include(u => u.StoreUser).ThenInclude(u => u.Store).ThenInclude(s => s.Owner).ThenInclude(o => o.User)` + `.Include(u => u.UserRoles.Where(...)).ThenInclude(ur => ur.Role)`. Verified identical via grep. A private `IQueryable<User> IncludeStoreAndRoles(IQueryable<User> query)` returns the configured queryable, eliminating 3 inline duplicates. No public API change.

### Decision: CancellationToken default = default

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Mandatory param on 3 methods | Forces all callers to pass token — 4 call sites | ❌ Rejected |
| `CancellationToken cancellationToken = default` | Backward-compatible, existing callers unchanged | ✅ Chosen |

**Rationale**: Same pattern used in `register-endpoint-fixes`. The handler's `cancellationToken` flows: `Handle()` → `FindUsersIncludingRoles(CancellationToken)` → all 3 repo methods → `ToListAsync(cancellationToken)`. Interface uses `= default` to avoid breaking existing callers.

### Decision: Take(1000) as safety cap, not pagination

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `.Take(1000)` before `.ToListAsync()` | Simple safety net, no API change, protects DB from full table scans | ✅ Chosen |
| Skip/Take pagination params | Full pagination feature — scope creep, spec & contract change | ❌ Rejected (deferred) |

**Rationale**: No pagination contract exists for this endpoint. `.Take(1000)` is a circuit-breaker against unbounded results, not a pagination feature. Pagination is tracked as a separate future change. The `.Take(1000)` goes after `.Where()`/`.Include()` and before `.ToListAsync(cancellationToken)`.

### Decision: Validator follows FluentValidation convention

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Empty `AbstractValidator<GetAllUsersQuery>` | Consistent with project convention; no rules needed since param is non-nullable bool | ✅ Chosen |
| Skip validator | Breaks convention — every command/query has a validator in this project | ❌ Rejected |

**Rationale**: Other command/query classes in the codebase follow FluentValidation with `AbstractValidator<T>`. Even a no-rule validator maintains consistency for pipeline validation behavior.

### Decision: [FromRoute] on includeInactive

**Choice**: Add `[FromRoute]` attribute to `bool includeInactive` parameter.
**Rationale**: The route template `"all/{includeInactive}"` binds from the route segment. Other actions in the controller (e.g., `UpdatedAsync(Guid id, [FromBody] UpdateUserCommand)`) explicitly annotate binding sources. This was an inconsistency.

## Data Flow

```
Client → GET /api/v1/users/all/{includeInactive}
  → UsersController.GetAllUsersAsync ([FromRoute], [ProducesResponseType 400/401/403])
    → MediatR → GetAllUsersQueryHandler.Handle(cancellationToken)
      → FindUsersIncludingRoles(includeInactive, cancellationToken)
        → [super admin]   GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync(token)
        → [owner admin]   GetAllUsersIncludingStoreAndRolesAsync(token)
        → [store admin]   GetAllUsersByStoreIdIncludingStoreAndRolesAsync(storeId, token)
          → UserRepository.IncludeStoreAndRoles(query)  [DRY helper]
            → .Where(...).Take(1000).ToListAsync(cancellationToken)
              → EF Core → PostgreSQL
    → AutoMapper User → UserListDto (RoleNames = [] safe init)
    → GetAllUsersQueryValidator (pipeline, no rules)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` | Modify | Add `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]` + `[FromRoute]` on `includeInactive` |
| `backend/src/Application/Features/UserManagement/Users/Queries/GetAllUsers/GetAllUsersQuery.cs` | Modify | Forward `CancellationToken` from `Handle` → `FindUsersIncludingRoles` → all 3 repo calls; update `FindUsersIncludingRoles` signature |
| `backend/src/Domain/Interfaces/Repositories/IUserRepository.cs` | Modify | Add `CancellationToken cancellationToken = default` to 3 method signatures |
| `backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs` | Modify | Add `.ThenInclude(o => o.User)` after `s.Owner` in all 3 chains; add `.Take(1000)` before `.ToListAsync()`; forward `CancellationToken` to `ToListAsync()`; extract private `IncludeStoreAndRoles(IQueryable<User>)` helper |
| `backend/src/Application/Features/UserManagement/Users/Queries/GetAllUsers/GetAllUsersQueryValidator.cs` | **Create** | New empty `AbstractValidator<GetAllUsersQuery>` per project convention |
| `backend/src/Application/Dtos/UserManagement/UserListDto.cs` | Modify | `IEnumerable<string> RoleNames { get; set; } = []` |

## Interfaces / Contracts

**Modified — IUserRepository** (3 method signatures):

```csharp
Task<IEnumerable<User>> GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync(
    bool includeInactive, CancellationToken cancellationToken = default);
Task<IEnumerable<User>> GetAllUsersIncludingStoreAndRolesAsync(
    bool includeInactive, CancellationToken cancellationToken = default);
Task<IEnumerable<User>> GetAllUsersByStoreIdIncludingStoreAndRolesAsync(
    Guid storeId, bool includeInactive, CancellationToken cancellationToken = default);
```

No new interfaces or types. The API contract (`ResponseResult<List<UserListDto>>`) is unchanged.

## Precedent References

- **CancellationToken propagation**: `register-endpoint-fixes` — same `= default` pattern on interface, forward in handler
- **ProducesResponseType**: Added in `update-store-endpoint-fixes`, `set-my-store-endpoint-fixes`, `approve-store-endpoint-fixes`, `delete-store-endpoint-fixes` — consistent pattern across all controller fixes
- **DRY extraction**: Same approach as batch-load fix in `update-store-endpoint-fixes` — private method on repository class
- **Take(1000) safety cap**: First instance in project; pagination tracked as follow-up (all previous endpoint fixes did not need this)

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| DRY refactor if Include chains differ | Low (verified) | All 3 chains grep-confirmed identical before extraction |
| CancellationToken breaks other implementations | Low | Grep all `IUserRepository` call sites — only `GetAllUsersQueryHandler` calls these 3 methods |
| `.Take(1000)` truncates legit large results | Medium | Acceptable safety cap (nobody has 1000+ active users per store); pagination feature tracked in backlog |
| `.ThenInclude(o => o.User)` if Owner.User is already loaded | None | EF Core ignores duplicate includes — safe even if already eager-loaded |

## Open Questions

- None. Each fix has a clear, unambiguous implementation based on verified source code.
