# Apply Progress: getme-endpoint-fixes

**Change**: `2026-07-29-getme-endpoint-fixes`  
**Date applied**: 2026-07-30  
**Applied by**: SDD apply sub-agent (batch commit with 2 other endpoint-fix changes)

---

## Implementation Record

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | FilterForBilling → StoreBillingUtils | ✅ Done | `42deff4b` |
| 2 | HasPermissionAttribute async + typo | ✅ Done | `42deff4b` |
| 3 | GetMeQueryHandler blacklist + typo | ✅ Done | `42deff4b` |
| 4 | AuthController ProducesResponseType | ✅ Done | `42deff4b` |
| 5 | BillingService config cache | ✅ Done | `42deff4b` |
| 6 | GetMeQueryHandlerTests mock ITokenBlacklistService | ✅ Done | `42deff4b` |

## Commit

```
42deff4bc38108aaabef830ebad4555ce3df4cce
Author: Lizardo Romero Scott <lrscott83@gmail.com>
Date:   Thu Jul 30 16:24:15 2026 -0400

    fix(api): resolve bugs across stores, auth, users endpoints (SDD batch)
```

## Files Changed

| File | Change |
|------|--------|
| `backend/src/Domain/Common/Utils/StoreBillingUtils.cs` | Added `FilterForBilling` static method |
| `backend/src/Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` | Added `ITokenBlacklistService`, removed `FilterForBilling` duplicate, fixed typo, added `BlacklistCurrentTokenAsync`, uses `StoreBillingUtils.FilterForBilling` |
| `backend/src/SMCA.WebApi/Filters/HasPermissionAttribute.cs` | Changed to `IAsyncAuthorizationFilter`, fixed typo, uses `StoreBillingUtils.FilterForBilling` |
| `backend/src/SMCA.WebApi/Controllers/v1/AuthController.cs` | Added `[ProducesResponseType]` for 200, 401, 404 on GET /auth/me |
| `backend/src/Application/Services/Billing/BillingService.cs` | Added `IMemoryCache` injection, `GetCachedConfigAsync<T>` helper, wrapped 3 config calls |
| `backend/src/Application.Tests/Authentication/Queries/GetMe/GetMeQueryHandlerTests.cs` | Added `Mock<ITokenBlacklistService>`, updated handler constructor calls |
| `backend/src/Application.Tests/Authentication/Queries/GetMe/GetMeOverdueDowngradeTests.cs` | Changed `GetMeQueryHandler.FilterForBilling` → `StoreBillingUtils.FilterForBilling` |
| `backend/src/Application.Tests/Services/Billing/BillingServiceTests.cs` | Added `IMemoryCache` mock |

## Build & Tests

- ✅ `dotnet build SMCA.sln` — 0 errors
- ✅ `dotnet test --filter "GetMeQueryHandlerTests|GetMeOverdueDowngradeTests"` — PASS
- ✅ E2E tests — 237/237 passing overall
