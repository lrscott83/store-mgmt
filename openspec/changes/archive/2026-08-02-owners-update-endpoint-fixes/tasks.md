# Tasks: Owners Update Endpoint Fixes

Fixes 14 bugs in `PUT /api/v1/Owners/{id}`. Threat matrix is all N/A → no RED-test tasks; E2E assertions are the verification layer.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150–165 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

Decision: confirm proceeding despite BREAKING contract (`ResponseResult<bool>`→`OwnerDto`, nonexistent 400→404) + frontend plan required before release.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Full endpoint fix (repo→validator→handler→controller→E2E) | PR 1 | `dotnet test src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~OwnersUpdate"` (from `backend/`) | E2E WebAppFactory (real API + seeded DB) | Revert PR; code-only, no migrations; GET/DELETE endpoints untouched |

## Phase 1: Repository Foundation

- [x] 1.1 `backend/src/Domain/Interfaces/Repositories/IOwnerRepository.cs` — add `Task<Owner> GetOwnerWithUserTrackedAsync(Guid id, CancellationToken cancellationToken = default);` (RR-O1)
- [x] 1.2 `backend/src/Infrastructure/Persistence/Repositories/OwnerRepository.cs` — implement with `.AsTracking()`, `.Include(o => o.User)` only (no ReSellerOwner/Stores chain), forward token to `FirstOrDefaultAsync` (~+10; RR-O1 1a/1b)

## Phase 2: Validator Structural-Only (Zero DB Queries)

- [x] 2.1 `.../UpdateOwner/UpdateOwnerCommandValidator.cs` — remove `MustAsync(OwnerExists)` rule, `OwnerExists` helper, `_ownerRepository` field + ctor param/assignment, `using Domain.Interfaces.Repositories;`. No `ExistsAsync` replacement (VL-O1)
- [x] 2.2 Same file — remove `MustAsync(ReSellerExists)` When-block, `ReSellerExists` helper, `_reSellerRepository` field + ctor param/assignments (incl. stray line-43 duplicate) (VL-O2)
- [x] 2.3 Same file — verify only structural rules remain: Id/FullName/CellPhone `NotNull().NotEmpty()`, Email format when non-empty; zero queries (VL-O3)

## Phase 3: Handler Core (Command + Persistence + Auth)

- [x] 3.1 `.../UpdateOwner/UpdateOwnerCommand.cs` — `ICommand<bool>`→`ICommand<OwnerDto>`; handler → `ICommandHandler<UpdateOwnerCommand, OwnerDto>`; add `using AutoMapper;` + `using Application.Dtos.Administration.Owners;` (OU-CH5)
- [x] 3.2 Same file — inject `private readonly IMapper _mapper;` (ctor + field) (OU-CH5)
- [x] 3.3 Same file — fetch `Owner? owner = await _ownerRepository.GetOwnerWithUserTrackedAsync(request.Id, cancellationToken);`; null → `ApiException(OwnerNotFound, 404)` + `AcctionCode = "OwnerNotFound"` (launch-prompt override of `ResponseResult.Failure`); never dereference `owner.User` (OU-CH1; `OwnerErrors.NotFound` confirmed to exist)
- [x] 3.4 Same file — tenant-scope: `if (!_httpContextService.IsSuperAdmin && owner.TenantId != _httpContextService.TenantId.ToGuid())` → `ApiException(OwnerNotFound, 404)` (OU-CH2 2a–2c, AUTH-OU1)
- [x] 3.5 Same file — remove role gate `if (!(_httpContextService.IsSuperAdmin || _httpContextService.IsReSeller)) throw ApiException(400)`; `[HasPermission(OwnersAdmin)]` filter stays the 403 gate (design decision A; OU-CH3)
- [x] 3.6 Same file, `UpdateReSellerOwnerAsync` — null-guard `reSeller` → `ApiException` 400 with `AcctionCode = "ReSellerId"` (preserves `Code == "ReSellerId"` envelope; OU-CH6 6a); nested `if (reSellerId.HasValue)` inside `reSellerOwner != null` block deleted (6b)
- [x] 3.7 Same file — remove `_ownerRepository.UpdateAsync(owner);`; `AsTracking()` + `SaveChangesAsync` suffices (OU-CH4 4a); ReSellerOwner tri-state logic intact (OU-CH7)
- [x] 3.8 Same file — return `ResponseResult.Success(_mapper.Map<OwnerDto>(owner))` (OU-CH4 4b, OU-CH5 5a)

## Phase 4: Controller (Swagger + HTTP Mapping)

- [x] 4.1 `backend/src/SMCA.WebApi/Controllers/v1/OwnersController.cs` — XML doc: "Updates an owner by id", `<param name="id">` + `<returns>` added (OC-OU2)
- [x] 4.2 Same file — `[ProducesResponseType(typeof(ResponseResult<OwnerDto>), 200)]` + 400/401/403/404/500 (OC-OU1); explicit `[FromRoute]` on `id`
- [x] 4.3 Same file — keep `Ok(await Sender.Send(command))` (launch-prompt override of the ActionCode switch): handler throws `ApiException` → `ErrorHandlerMiddleware` maps to real HTTP status (404/400), `[HasPermission]` filter yields 403 — simple approach verified as the project pattern (OC-OU3)

## Phase 5: E2E Assertions + New Tests

- [x] 5.1 `backend/src/SMCA.WebApi.E2ETests/Owners/OwnersUpdateTests.cs` — `Update_owner_persists_isactive_and_description`: deserializes `ApiResponse<OwnerDto>`, asserts `Data.FullName == "Updated Owner"`, verifies `User.FullName` persisted in DB (R5 S1; OU-CH4 4a)
- [x] 5.2 Same file — rewrote `Update_owner_nonexistent_id_returns_400_Id` → `Update_owner_nonexistent_id_returns_404`: `NotFound` + `ActionCode == 404` (R5 S2; OU-CH1)
- [x] 5.3 Same file — NEW test `Update_owner_owneradmin_rejected_returns_403`: seeded OwnerAdmin is denied **403** by the class-level `[HasPermission(OwnersAdmin)]` filter (OwnersAdmin feature roles = SuperAdmin+ReSeller only). **DEVIATION**: spec R5 S5 claimed "OwnerAdmin accepted → 200"; verified impossible in this codebase — the filter's `GetAllowedFeatureIdsByRoleAsync(OwnerAdmin, ...)` excludes the Owners feature. Test pins the real 403 contract + no write.
- [x] 5.4 Same file — NEW test `Update_owner_cross_tenant_reseller_returns_404_no_write`: ReSeller in tenant B PUTs tenant A owner → 404 envelope, `User.FullName` unchanged in DB (R5 S6; OU-CH2 2a, AUTH-OU1)
- [x] 5.5 `backend/src/SMCA.WebApi.E2ETests/Owners/OwnersUpdateGapTests.cs` — verified unchanged: CellPhone 400 `Code == "CellPhone"` (structural validator intact) + nonexistent ReSeller 400 `Code == "ReSellerId"` (handler null guard + middleware) still hold (R8; OU-CH6 6a) — no drift, no test changes needed
- [x] 5.6 Left unchanged: empty FullName → 400, invalid Email → 400 (R5 S3/S4) — still green by structural validator

## Phase 6: Verification + Release Dependency

- [x] 6.1 `dotnet build backend/src/SMCA.sln` — **compiles: 0 errors** (163 pre-existing warnings, none in changed files)
- [x] 6.2 Run E2E filter from unit 1 — all OwnersUpdate tests green — **8/8 PASS** (verify phase, per verify-report `test_exit_code: 0`; checkbox reconciled at archive per orchestrator final-state facts)
- [x] 6.3 Run full Owners E2E collection (`--filter "FullyQualifiedName~Owners"`) — catch regressions — **33/33 PASS, 0 regressions** (verify phase, per verify-report; checkbox reconciled at archive per orchestrator final-state facts)
- [x] 6.4 Create `docs/plans/owners-update-endpoint-fixes-frontend.md` — breaking contract doc — **file exists** (release dependency, not an apply deliverable; checkbox reconciled at archive per orchestrator final-state facts + disk evidence)
