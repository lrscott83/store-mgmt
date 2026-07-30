# Generic Repository Specification

**Capability**: `IGenericRepository.AddRangeAsync`  
**Origin**: SDD change `2026-07-30-register-endpoint-fixes`  
**Status**: Active  
**Last Updated**: 2026-07-30

---

## Purpose

Define the `AddRangeAsync` contract on `IGenericRepository` and `GenericRepository` to support batch entity insertion.

---

## Specification

### GR1: AddRangeAsync

**Requirement**: `IGenericRepository` MUST declare `Task AddRangeAsync(IEnumerable<T>)`. `GenericRepository` MUST implement via `DbContext.AddRangeAsync()`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | Batch add | Multiple entities | `AddRangeAsync(entities)` | All entities tracked by `DbContext` |
| 6b | Empty batch | Empty collection | `AddRangeAsync(empty)` | No error, nothing tracked |

## Verification Criteria

- [ ] `IGenericRepository<TEntity>` has `Task AddRangeAsync(IEnumerable<TEntity> entities)`
- [ ] `GenericRepository<TEntity>` implements via `await _dbContext.Set<TEntity>().AddRangeAsync(entities)`
- [ ] Unit tests verify batch add and empty batch scenarios

## Related Specifications

- **store-service** — Consumer of `AddRangeAsync` in `CreateStoreService`
