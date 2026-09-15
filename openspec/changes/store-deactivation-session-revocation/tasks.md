# Tasks: Store Deactivation Session Revocation

Change: `store-deactivation-session-revocation` · Branch: `qa` · 2026-09-14

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~650–800 (prod ~200; tests ~450–600) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No (single work unit; direct commits to qa per user preference) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
400-line budget risk: Medium

(Previous change on this repo used direct commits to `qa` with no PRs; user preflight chose ask-on-risk. Estimate is Medium but under reliable split thresholds and tests dominate — single work unit, work-unit commits.)

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Active revocation (points 1+2) | Direct commit | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~StoreDeactivationSession"` | `dotnet test backend/src/SMCA.sln` | Revert commit(s); no schema |
| 2 | /me blacklist parity (point 3) | Direct commit | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~StoreDeactivationSession"` | `dotnet test backend/src/SMCA.sln` | Revert commit(s) |

## Phase 1: Repository layer (foundation)

- [ ] 1.1 RED: `backend/src/Application.Tests/Repositories/…` — write failing unit test for new `GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(Guid)` contract (returns SelectedStoreId-matching user ids, filter-free); add to new test file following `RefreshCommandHandlerTests` Moq pattern
- [ ] 1.2 GREEN: `backend/src/Domain/Interfaces/Repositories/IUserRepository.cs` + `backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs` — add method (IgnoreQueryFilters, Select Id, Distinct)
- [ ] 1.3 RED: unit test for new `GetActiveByUserIdsAsync(IReadOnlyCollection<Guid>)` (bulk active-token load)
- [ ] 1.4 GREEN: `backend/src/Domain/Interfaces/Repositories/IRefreshTokenRepository.cs` + `backend/src/Infrastructure/Persistence/Repositories/RefreshTokenRepository.cs` — add bulk method
- [ ] 1.5 Verify both repo tests GREEN: `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~Repositories"`

## Phase 2: Revocation service (point 1 core)

- [ ] 2.1 RED: `backend/src/Application.Tests/StoreManagement/Stores/StoreSessionRevocationServiceTests.cs` (NEW file) — set-union correctness (SelectedStoreId ∪ StoreUser; distinct; missing store → empty), bulk revoke staging (Revoke+Update per token; no SaveChanges inside service), zero-token no-op
- [ ] 2.2 GREEN: `backend/src/Domain/Interfaces/Services/Stores/IStoreSessionRevocationService.cs` (Create: `Task RevokeStoreSessionsAsync(Guid storeId, CancellationToken ct)`) + `backend/src/Application/Services/Stores/StoreSessionRevocationService.cs` (Create) + DI registration alongside `IGetStoreByIdService`
- [ ] 2.3 RED: handler-hook tests — `SetStoreActivationCommandHandler` revokes on true→false, skips same-value and false→true; same for `DeactivateStoreCommand` (always-flip semantics: wasActive capture) and `UpdateStoreCommand` (SuperAdmin branch only)
- [ ] 2.4 GREEN: hook the 3 handlers — `SetStoreActivationCommand.cs` (wasActive capture at :54; call service after `store.IsActive = request.IsActive`), `DeactivateStoreCommand.cs` (:43), `UpdateStoreCommand.cs` (SuperAdmin block :104-108)
- [ ] 2.5 Verify unit suite GREEN: `dotnet test backend/src/Application.Tests/Application.Tests.csproj`

## Phase 3: Refresh hardening (point 2)

- [ ] 3.1 RED: additive methods in `backend/src/Application.Tests/Authentication/Commands/Refresh/RefreshCommandHandlerTests.cs` — inactive user → 401 `Auth.AccountInactive` + presented token revoked; inactive selected store → 401 `Store.Inactive` + revoked; inactive owner → 401 `Owner.Inactive` + revoked; null store/owner → skip check (proceeds); active user/store/owner → rotation intact (R2 contract)
- [ ] 3.2 GREEN: `backend/src/Application/Features/Authentication/Commands/Refresh/RefreshCommand.cs` — insert activation matrix after user resolution (step 2), before minting; revoke presented token in each failure branch; mirror /me's `is not null && !IsActive` semantics
- [ ] 3.3 Verify: `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~Refresh"`

## Phase 4: /me blacklist parity (point 3)

- [ ] 4.1 RED: additive methods in `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeBlacklistParityTests.cs` (NEW file — do NOT touch `AuthMeInactiveStoreOwnerTests`) — second /me call after store-inactive verdict → 401; same for owner-inactive; first call still 404 with exact error codes
- [ ] 4.2 GREEN: `backend/src/Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` — add `await BlacklistCurrentTokenAsync();` before store-inactive return (:82) and owner-inactive return (:90)
- [ ] 1 vs 2 call check: `AuthMeInactiveStoreOwnerTests` calls /me once post-flip → still green (verified in exploration; re-run after GREEN)

## Phase 5: E2E suite (point 4)

- [ ] 5.1 NEW file `backend/src/SMCA.WebApi.E2ETests/Stores/StoreDeactivationSessionTests.cs` — only-active-store scenario: login store-user + owner (owner gets 2nd refresh token via login), deactivate via API (SuperAdmin), refresh 401s for both, /me still 404-verdict, login 403 until SuperAdmin reactivation, re-login OK after reactivation
- [ ] 5.2 same file — non-last-store isolation: two stores/users; deactivate one; other store's user refresh OK; deactivated store's user refresh 401
- [ ] 5.3 same file — owner with second active store unaffected: owner SelectedStoreId=Y; deactivate X; owner refresh OK + /me 200
- [ ] 5.4 same file — idempotent same-value deactivation (A-13 semantics): re-deactivate inactive store → 200, no token damage beyond first pass
- [ ] 5.5 Run full suite: `dotnet test backend/src/SMCA.sln` — all green, zero existing E2E modified

## Phase 6: Regression & hygiene

- [ ] 6.1 Full backend suite green (500+ tests): `dotnet test backend/src/SMCA.sln`
- [ ] 6.2 `git status` clean of unintended files; work-unit commits per skill `C:\Users\Appollo\.config\opencode\skills\work-unit-commits\SKILL.md`
