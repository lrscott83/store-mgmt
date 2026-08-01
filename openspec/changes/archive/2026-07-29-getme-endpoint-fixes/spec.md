# Spec: getme-endpoint-fixes

**Change**: `2026-07-29-getme-endpoint-fixes`  
**Last Updated**: 2026-07-30  
**Status**: Implemented ✅

---

## Summary

This change fixes bugs and code smells identified in the `api-endpoint-review` of `GET /api/v1/auth/me`, plus improvements discovered during code reading.

---

## Requirements

### R1: JWT Blacklist in GetMeQueryHandler

**Requirement**: When a user is inactive (`!user.IsActive`), the handler MUST blacklist the current JWT via `ITokenBlacklistService` instead of calling `SignOutAsync()` (which only removes the response header).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Inactive user blacklists token | User with `IsActive=false` calls GET /auth/me | Handler executes | JTI extracted from `AccessToken`, blacklisted for remaining token lifetime, returns 404 NotFound |
| 1b | Active user unaffected | Active user calls GET /auth/me | Handler executes | No blacklist call, handler continues normally |
| 1c | Malformed token skipped | Inactive user with unparseable token | Handler calls `BlacklistCurrentTokenAsync` | Exception caught silently, handler still returns 404 NotFound |

### R2: FilterForBilling → StoreBillingUtils

**Requirement**: The `FilterForBilling` method MUST be defined once in `StoreBillingUtils` and consumed by both `GetMeQueryHandler` and `HasPermissionAttribute`. No duplication.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Shared utility used | GetMeQueryHandler filters modules | Handler executes | `StoreBillingUtils.FilterForBilling(...)` is called |
| 2b | Shared utility from attribute | HasPermissionAttribute filters modules | Attribute executes | `StoreBillingUtils.FilterForBilling(...)` is called |
| 2c | Tests reference utility | GetMeOverdueDowngradeTests run | Tests execute | All references point to `StoreBillingUtils.FilterForBilling` |

### R3: HasPermissionAttribute — Async Fix

**Requirement**: `HasUserPermissionRequirementFilter` MUST implement `IAsyncAuthorizationFilter` instead of `IAuthorizationFilter`. All `.Result` calls MUST be replaced with `await`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Async authorization | Request hits `[HasPermission]` attribute | Attribute executes | `OnAuthorizationAsync` runs with proper `await`, no sync-over-async deadlock risk |

### R4: HasPermissionAttribute + GetMeQueryHandler — Typo Fix

**Requirement**: The field `_storeModuleRepositorytory` MUST be renamed to `_storeModuleRepository` in both `HasPermissionAttribute` and `GetMeQueryHandler`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Typo fixed in attribute | HasPermissionAttribute compiled | Build runs | No `_storeModuleRepositorytory` reference exists |
| 4b | Typo fixed in handler | GetMeQueryHandler compiled | Build runs | No `_storeModuleRepositorytory` reference exists |

### R5: AuthController ProducesResponseType

**Requirement**: `GET /auth/me` in `AuthController` MUST declare `[ProducesResponseType]` for 200, 401, and 404.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | 200 documented | Swagger/OpenAPI doc generated | `GET /auth/me` endpoint inspected | 200 OK with `ResponseResult<CurrentUserDto>` listed |
| 5b | 401 documented | Swagger/OpenAPI doc generated | `GET /auth/me` endpoint inspected | 401 Unauthorized listed |
| 5c | 404 documented | Swagger/OpenAPI doc generated | `GET /auth/me` endpoint inspected | 404 NotFound listed |

### R6: BillingService Config Cache

**Requirement**: `BillingService.GetStoreBillingSummaryAsync()` MUST cache the 3 system configuration reads (PaymentGraceDays, DueSoonDays, TestingPeriodInMonths) in `IMemoryCache` with 5-minute expiration to reduce DB round trips.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | Config cached after first read | First call to `GetStoreBillingSummaryAsync` | Config read | Value stored in cache via `GetCachedConfigAsync` |
| 6b | Config served from cache | Second call within 5 minutes | Config read | `_cache.TryGetValue` returns cached value, no DB call |
| 6c | Cache expires and re-fetches | Second call after 5+ minutes | Config read | Cache miss triggers new DB read |

### R7: GetMeQueryHandlerTests Updated

**Requirement**: `GetMeQueryHandlerTests` MUST include `Mock<ITokenBlacklistService>` in `TestMocks` and pass it to the handler constructor.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7a | Test mock present | `TestMocks` class inspected | Tests run | `TokenBlacklistService` mock property exists |
| 7b | Handler created with mock | Each test creates handler | Constructor call | `ITokenBlacklistService` parameter receives mock object |
| 7c | AccessToken setup | Tests with inactive user scenario | Test runs | `IHttpContextService.AccessToken` return value is set up |

---

## Verification Criteria

- [x] Build: `dotnet build SMCA.sln` passes with 0 errors
- [x] Unit tests: `dotnet test --filter "GetMeQueryHandlerTests|GetMeOverdueDowngradeTests"` passes
- [x] E2E tests: `dotnet test --filter "AuthMeTests|AuthMeFailureTests|AuthMePermissionsTests|GetMeBillingTests|GetMeBillingStatesTests"` passes
- [x] No duplicate `FilterForBilling` method exists
- [x] No `_storeModuleRepositorytory` typo exists
- [x] No `.Result` sync-over-async calls remain in HasPermissionAttribute
- [x] JWT blacklist replaces `SignOutAsync()` in GetMeQueryHandler
- [x] `IMemoryCache` injected and used in `BillingService`
