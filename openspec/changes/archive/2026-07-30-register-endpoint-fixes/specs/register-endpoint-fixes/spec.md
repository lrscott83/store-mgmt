# Delta Specs: register-endpoint-fixes

**Date**: 2026-07-30 | **Parent**: `2026-07-30-register-endpoint-fixes/proposal.md`

---

## Domain: auth-register-contract (delta from `auth-http` S2)

### MODIFIED: Register Return Type — `bool` → `AuthDto`

**Previously (S2)**: `register()` returned `Promise<BaseResponseModel<boolean>>`.
**Now**: `POST /api/v1/auth/register` MUST return `201` with `AuthDto { login, authToken, expiresIn }`. Handler MUST NOT discard the JWT.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Registration returns AuthDto | Valid registration payload | `POST /api/v1/auth/register` | Status `201`, body is `AuthDto` with `login`, valid JWT `authToken`, `expiresIn` |

### ADDED: Controller Attributes

`RegisterAsync` MUST declare `[FromBody]` on command param, `[ProducesResponseType]` for 201/400/429/500, and `[EnableRateLimiting("RegisterPolicy")]`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Attributes present | `RegisterAsync` method | Inspecting its annotations | `[FromBody]` on command, `ProducesResponseType` for 201/400/429/500, `[EnableRateLimiting("RegisterPolicy")]` |
| 2b | Location header | Successful registration | Response built | `Location` header = `/api/v1/auth/me` |

---

## Domain: rate-limiting (new)

### ADDED: RegisterPolicy — 10 req / 10 min per IP

`Program.cs` MUST configure a `RegisterPolicy` rate limiter: 10 requests, 10-minute sliding window, per IP.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Within limit | 10 requests from same IP within 10 min | Each arrives | All 2xx |
| 3b | Exceeds limit | 10 requests already from same IP | 11th request arrives | `429 TooManyRequests` |

---

## Domain: user-repository (new)

### ADDED: IsUniqueLoginAsync Uses Real Async

MUST use `AnyAsync()` — NOT `Task.FromResult(All(...))`, `ToList()`, sync `.Any()/.All()`.
Returns `true` when login EXISTS (not unique), `false` when absent.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Login exists | `"existingUser"` in DB | `IsUniqueLoginAsync("existingUser")` | Returns `true` |
| 4b | Login absent | `"newUser"` not in DB | `IsUniqueLoginAsync("newUser")` | Returns `false` |
| 4c | No sync EF | Any call | Implementation inspected | Uses `AnyAsync()` only — no `Task.FromResult`, `ToList`, sync `.Any()/.All()`, `.AsEnumerable`, `.ToArray` |

---

## Domain: store-service (new)

### ADDED: Batch Module Query

`CreateStoreService` MUST call `GetModulesByIdsAsync(storeTypeId)` once and `AddRangeAsync` once (not N individual calls).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Single module query | N modules for store type | Service creates store | `GetModulesByIdsAsync` called ONCE, `GetByIdAsync` ZERO times |
| 5b | Single module insert | N modules for store type | Service persists modules | `AddRangeAsync` called ONCE, `AddAsync` ZERO times for modules |

### ADDED: ReSeller Lookup Fault Tolerance

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7a | ReSeller lookup throws | Exception in lookup | Registration flow continues | Warning logged with exception, registration succeeds |
| 7b | ReSeller null | Lookup returns null | Registration flow continues | Silent continuation, no `ReSellerOwner` created |
| 7c | ReSeller found | Valid ReSeller returned | Registration completes | `ReSellerOwner` association created |

---

## Domain: generic-repository (new)

### ADDED: AddRangeAsync

`IGenericRepository` MUST declare `Task AddRangeAsync(IEnumerable<T>)`. `GenericRepository` MUST implement via `DbContext.AddRangeAsync()`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | Batch add | Multiple entities | `AddRangeAsync(entities)` | All entities tracked by `DbContext` |
| 6b | Empty batch | Empty collection | `AddRangeAsync(empty)` | No error, nothing tracked |

---

## Summary

| Area | Type | Reqs | Scenarios |
|------|------|------|-----------|
| auth-register-contract | Delta | 1M + 1A | 4 |
| rate-limiting | New | 1A | 2 |
| user-repository | New | 1A | 3 |
| store-service | New | 2A | 5 |
| generic-repository | New | 1A | 2 |

**Happy paths**: 8 | **Edge cases**: 5 (empty batch, null ReSeller, exceeded limit, exception, no ReSeller) | **Error states**: 3 (429, 400/500 response attrs, exception logged)
