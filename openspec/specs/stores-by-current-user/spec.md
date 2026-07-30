# Stores-by-Current-User Specification

**Change**: `stores-by-current-user-fixes`  
**Domain**: `stores-by-current-user`  
**Type**: Full spec (new domain)  
**Last Updated**: 2026-07-30

---

## Purpose

Contract for `GET /api/v1/stores/by-current-user`. Returns stores accessible by the authenticated user, gated by `[HasPermission(SuperAdmin, StoresAdmin)]`.

---

## Requirements

### R1: Role-Based Store Filtering

The system MUST return a different store set based on the caller's role, as follows:

| Role | Store scope | Includes inactive? | Excludes DefaultStore? |
|------|-------------|-------------------|----------------------|
| SuperAdmin | All stores, all tenants | Yes | Yes (at DB level) |
| Non-SuperAdmin (StoresAdmin) | Stores where `Owner.UserId == currentUserId` | No | Yes (at DB level) |

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | SuperAdmin includes inactive | SuperAdmin, inactive store exists | Calls endpoint | Inactive store is in response |
| 1b | Non-SuperAdmin filters by user | StoresAdmin, stores from 2 owners exist | Calls endpoint | Only stores owned by current user returned |
| 1c | Non-SuperAdmin active-only | StoresAdmin, inactive store exists | Calls endpoint | Inactive store excluded from response |
| 1d | Non-SuperAdmin no owned stores | StoresAdmin with zero owned stores | Calls endpoint | Empty list, 200 OK |

### R2: OwnerName Population

Every store in the response MUST have `OwnerName` populated with `Owner.User.FullName`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | SuperAdmin sees OwnerName | SuperAdmin, store has Owner with User | DTO mapped | `OwnerName` is non-null, equals `Owner.User.FullName` |
| 2b | StoresAdmin sees OwnerName | StoresAdmin, own store has Owner with User | DTO mapped | `OwnerName` is non-null, equals `Owner.User.FullName` |

### R3: DefaultStore Excluded at DB Level

The `s.Id != DataUtils.DefaultStore.Id` filter MUST execute in the database query (before `.ToListAsync()`), not in memory.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | SuperAdmin excludes DefaultStore | DefaultStore exists in DB | Repository query runs | DefaultStore.Id absent from SQL result set |
| 3b | Non-SuperAdmin excludes DefaultStore | DefaultStore exists in DB | Repository query runs | DefaultStore.Id absent from SQL result set |

### R4: Swagger Documents 401 and 403

The endpoint MUST declare `[ProducesResponseType(StatusCodes.Status401Unauthorized)]` and `[ProducesResponseType(StatusCodes.Status403Forbidden)]`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | 401 documented | Swagger document generated | Endpoint inspected | 401 listed as possible response |
| 4b | 403 documented | Swagger document generated | Endpoint inspected | 403 listed as possible response |

### R5: XML Summary Comment

The endpoint method MUST contain an XML `<summary>` doc comment.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Summary present | Controller source | Method inspected | `/// <summary>` present describing the endpoint |

### R6: 401 on Unauthenticated Request (Unchanged)

Requests without a valid auth token MUST return 401 Unauthorized.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | Anonymous request | No auth token provided | Endpoint called | 401 Unauthorized returned |

---

## Verification Criteria

- [ ] All 4 existing E2E tests pass (3 SuperAdmin tests + 1 anonymous 401 test)
- [ ] New E2E test: StoresAdmin sees only their own stores (R1b + R1c)
- [ ] New E2E test: StoresAdmin sees populated OwnerName (R2b)
- [ ] Integration or unit test verifies DefaultStore exclusion at DB level (R3)
- [ ] Swagger document inspected for 401/403 (R4)
- [ ] XML doc comment present (R5)
