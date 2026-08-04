# Tasks: Owners GetById Endpoint Fixes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~60–100 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | All 7-file fixes, one logical change | PR 1 | `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~OwnersGetByIdTests"` | N/A — E2E suite runs in-process via WebAppFixture, no manual runtime | Revert commit; no DB migration/config |

## Phase 1: Interface

- [x] 1.1 `backend/src/Domain/Interfaces/Repositories/IOwnerRepository.cs:10` — Add `CancellationToken cancellationToken = default` final param to `GetOwnerIncludingUserByIdAsync` (mirror line 8).

## Phase 2: Core Fixes (bottom-up)

- [x] 2.1 `backend/src/Infrastructure/Persistence/Repositories/OwnerRepository.cs:38-46` — Add `.Include(o => o.Stores.Where(s => s.IsActive)).ThenInclude(s => s.StoreModules.Where(sm => sm.IsActive))` and `.ThenInclude(ro => ro.ReSeller).ThenInclude(r => r.User)` (copy pattern from `GetAllOwnersIncludingStoreModulesAsync:24-25`); keep `IgnoreQueryFilters()`; forward token to `FirstOrDefaultAsync(cancellationToken)`.
- [x] 2.2 `backend/src/Application/Features/Administration/Owners/Queries/GetOwnerById/GetOwnerByIdQueryValidator.cs` — Remove `MustAsync(OwnerExists)` rule, `OwnerExists` method, `_ownerRepository` field + ctor param; keep `NotNull().NotEmpty()` with `_localizer` only (zero DB queries).
- [x] 2.3 `backend/src/Application/Features/Administration/Owners/Queries/GetOwnerById/GetOwnerByIdQuery.cs` — Add `IStringLocalizer<I18n> _localizer` ctor param; null-guard: `if (owner is null) return ResponseResult.Failure<OwnerDto>(new Error("Owner.NotFound", _localizer["OwnerNotFound"]), HttpStatusCode.NotFound)`; pass `cancellationToken` to repo call; never map null.
- [x] 2.4 `backend/src/Domain/Entities/Owners/OwnerErrors.cs:7` — Fix copy-paste `NotFound` code `"User.NotFound"` → `"Owner.NotFound"` (unreferenced today — no call-site impact).
- [x] 2.5 `backend/src/SMCA.WebApi/Controllers/v1/OwnersController.cs:43-47` — Add `[ProducesResponseType]` for 400/401/403/404/500 (mirror `GetAllOwnersAsync:27-31`), keep 200.
- [x] 2.6 `backend/src/SMCA.WebApi/Controllers/v1/OwnersController.cs:38` — Fix XML summary "Get user by id" → "Get owner by id" (`<param name="id">` already present).

## Phase 3: E2E Tests

- [x] 3.1 `backend/src/SMCA.WebApi.E2ETests/Owners/OwnersGetByIdTests.cs:30-42` — Rename `..._nonexistent_returns_400_OwnerId` → `..._returns_404`; assert envelope `Succeeded == false` + `ActionCode == 404` + `Errors[].Code == "Owner.NotFound"` — do NOT assert `HttpStatusCode.NotFound` (controller wraps in `Ok()`).
- [x] 3.2 Verify `Get_owner_by_id_returns_200` passes (proves includes + AutoMapper resolves ReSellerName/Stores) and `..._empty_guid_returns_400_IsRequired` unchanged (validator `.NotEmpty()`).

## Phase 4: Build + Verify

- [x] 4.1 `dotnet build backend/src/SMCA.sln` → 0 errors.
- [x] 4.2 Run Owners E2E filter (above) → all pass.
- [x] 4.3 Regression: Owners E2E collection + adjacent GetById-style tests stay green.
