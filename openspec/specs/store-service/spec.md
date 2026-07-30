# Store Service Specification

**Capability**: `CreateStoreService` batch operations and fault tolerance  
**Origin**: SDD change `2026-07-30-register-endpoint-fixes`  
**Status**: Active  
**Last Updated**: 2026-07-30

---

## Purpose

Define the module query and insert contract for `CreateStoreService`, eliminating N+1 patterns and adding fault tolerance for ReSeller lookups.

---

## Specification

### SS1: Batch Module Query

**Requirement**: `CreateStoreService` MUST call `GetModulesByIdsAsync(storeTypeId)` once and `AddRangeAsync` once (not N individual calls).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Single module query | N modules for store type | Service creates store | `GetModulesByIdsAsync` called ONCE, `GetByIdAsync` ZERO times |
| 5b | Single module insert | N modules for store type | Service persists modules | `AddRangeAsync` called ONCE, `AddAsync` ZERO times for modules |

### SS2: ReSeller Lookup Fault Tolerance

**Requirement**: ReSeller lookup failures MUST be logged and handled gracefully without breaking registration.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7a | ReSeller lookup throws | Exception in lookup | Registration flow continues | Warning logged with exception, registration succeeds |
| 7b | ReSeller null | Lookup returns null | Registration flow continues | Silent continuation, no `ReSellerOwner` created |
| 7c | ReSeller found | Valid ReSeller returned | Registration completes | `ReSellerOwner` association created |

## Verification Criteria

- [ ] Unit test verifies `GetModulesByIdsAsync` called once, `GetByIdAsync` zero times
- [ ] Unit test verifies `AddRangeAsync` called once, `AddAsync` zero times for modules
- [ ] Unit test verifies `LogWarning` called on ReSeller exception
- [ ] All 52 unit tests + 11 E2E tests pass

## Related Specifications

- **generic-repository** — `AddRangeAsync` used by `CreateStoreService`
- **auth-http** — Registration flow (caller of store creation)
- **rate-limiting** — Registration rate limiting
