# Tasks: Owners GetAll Endpoint Fixes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~120–150 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (no commits) |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | All 7 fixes + 2 new E2E tests | PR 1 | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~Owners"` | WebAppFixture E2E suite — real HTTP + PostgreSQL | Revert 4 source files + 2 test files; no migrations |

## Phase 1: Interface Contract (Foundation)

- [x] 1.1 `backend/src/Domain/Interfaces/Repositories/IOwnerRepository.cs`: add `CancellationToken cancellationToken = default` as final param to `GetAllOwnersIncludingStoreModulesAsync` and `GetReSellerOwnersIncludingStoreModulesAsync`.

## Phase 2: Core Implementation

- [x] 2.1 `backend/src/Infrastructure/Persistence/Repositories/OwnerRepository.cs:21-27`: in `GetAllOwnersIncludingStoreModulesAsync`, insert `.Take(1000)` before `.ToListAsync(cancellationToken)`; accept and forward the token param.
- [x] 2.2 `OwnerRepository.cs:59-66`: in `GetReSellerOwnersIncludingStoreModulesAsync`, insert `.Take(1000)` before `.ToListAsync(cancellationToken)`; accept and forward the token param.
- [x] 2.3 `backend/src/Application/.../Queries/GetAllOwners/GetAllOwnersQuery.cs:38`: change auth gate to `throw new ApiException(_localizer["Unauthorized"], HttpStatusCode.Forbidden)`.
- [x] 2.4 `GetAllOwnersQuery.cs:42`: guard `_httpContextService.UserExternalId.ToGuid()` — if `Guid.Empty`, throw `ApiException("Invalid reseller identity", HttpStatusCode.BadRequest)` before the reseller repo call.
- [x] 2.5 `GetAllOwnersQuery.cs:41-42`: forward handler `cancellationToken` to both repository calls.
- [x] 2.6 `GetAllOwnersQuery.cs:43`: null guard `(owners ?? Enumerable.Empty<Owner>())` before AutoMapper projection.
- [x] 2.7 `backend/src/SMCA.WebApi/Controllers/v1/OwnersController.cs:26`: add `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `401Unauthorized`, `403Forbidden`, `500InternalServerError`.
- [x] 2.8 `OwnersController.cs:21-24`: XML summary "Get all users" → "Get all owners"; add `<param name="includeInactive">Whether to include inactive owners</param>`.

## Phase 3: E2E Tests

- [x] 3.1 New `backend/src/SMCA.WebApi.E2ETests/Owners/OwnersListAuthTests.cs`: `List_owners_as_unauthorized_returns_403` — seed authenticated non-SuperAdmin/non-ReSeller actor (mirror `UsersListTests.List_as_store_user_returns_403`), GET `/api/v1/Owners/all/true`, assert 403 and message != "UserNotFound" (OQ-1 1a).
- [x] 3.2 `OwnersListGapTests.cs`: add `List_owners_as_reseller_with_empty_external_id_returns_400` — mint ReSeller token whose NameIdentifier claim fails Guid parse (`ToGuid()` → empty; real `JwtProvider` always mints valid Guid, so add a custom claim-minting helper), GET `/all/false`, assert 400 before query (OQ-2 2a).
- [x] 3.3 Regression: `OwnersListTests` + `OwnersListGapTests` (4 tests) pass unchanged — reseller 200 path must stay green (OQ-1 1b; RR-OC2 2b).

## Phase 4: Verification

- [x] 4.1 `dotnet build backend/src/...` — solution compiles with new interface param; existing callers unchanged (RR-OC2 2b).
- [x] 4.2 Run Owners E2E filter — 6 tests green (4 regression + 2 new).
