# Proposal: Owners GetById Endpoint Fixes

## Intent

Fix 7 bugs found in `GET /api/v1/Owners/{id}` (score: 5/10): N+1 incomplete includes, double DB-query + wrong 400, missing CancellationToken, incomplete Swagger metadata, missing null check, wrong XML doc, and misnamed validator param.

## Scope

### In Scope
- **N+1 fix**: Add missing `.ThenInclude` chains to `OwnerRepository.GetOwnerIncludingUserByIdAsync` — `ReSellerOwner → ReSeller → User` and `Stores.Where(IsActive) → StoreModules.Where(IsActive)`
- **Double-query → single + 400→404**: Remove `MustAsync(OwnerExists)` from `GetOwnerByIdQueryValidator`. Move existence check to handler with `ResponseResult.Failure(404)` when null
- **CancellationToken**: Add `CancellationToken cancellationToken = default` to `IOwnerRepository.GetOwnerIncludingUserByIdAsync`; propagate handler → repo → `FirstOrDefaultAsync`
- **ProducesResponseType**: Add 400, 401, 403, 404, 500 to `GetOwnerAsync` (mirror `GetAllOwnersAsync:27-31`)
- **Null check**: Guard handler against null owner (race window after validation removal)
- **XML doc**: "Get user by id" → "Get owner by id"
- **Validator param**: `OwnerExists(Guid tenantId, ...)` → `OwnerExists(Guid ownerId, ...)`
- **E2E test**: Update `OwnersGetByIdTests` — nonexistent ID expects 404 (was 400)

### Out of Scope
- Per-owner authorization (ownership validation)
- `[OutputCache]` / caching
- Other controller action XML docs
- Git operations (commits, PRs)

## Capabilities

### Modified Capabilities
- **owners**: R2 contract — nonexistent ID returns 404, not 400
- **validation**: `GetOwnerByIdQueryValidator` — remove `MustAsync(OwnerExists)`, keep structural `NotNull().NotEmpty()`
- **repository**: `IOwnerRepository.GetOwnerIncludingUserByIdAsync` — add `CancellationToken` param + missing `.ThenInclude` chains
- **command-handler**: `GetOwnerByIdQueryHandler` — null check returns `Failure(404)`, propagate CancellationToken
- **api-controller**: `GetOwnerAsync` — add 400/401/403/404/500 `[ProducesResponseType]`

## Approach

Follow established patterns from `delete-user-endpoint-fixes` and `activate-user-endpoint-fixes`: validator performs structural-only validation, handler is the single gate for existence → 404. Repository gets cancelled-token support and complete include chain (mirror `GetAllOwnersIncludingStoreModulesAsync`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Infrastructure/Persistence/Repositories/OwnerRepository.cs` | Modified | Add ThenInclude chains + token param |
| `Domain/Interfaces/Repositories/IOwnerRepository.cs` | Modified | Add CancellationToken param |
| `Application/.../GetOwnerById/GetOwnerByIdQueryValidator.cs` | Modified | Remove MustAsync, keep structural rules, rename param |
| `Application/.../GetOwnerById/GetOwnerByIdQuery.cs` | Modified | Null check + 404 in handler, forward token |
| `SMCA.WebApi/Controllers/v1/OwnersController.cs` | Modified | ProducesResponseType + XML doc |
| `SMCA.WebApi.E2ETests/Owners/OwnersGetByIdTests.cs` | Modified | 404 assertion for nonexistent ID |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking 400→404 breaks frontend error handling | Medium | Documented breaking change; frontend plan created separately |
| Missing include chain still incomplete | Low | Verify AutoMapper profile resolves all nav props in E2E test |

## Rollback Plan

Revert the single commit containing all changes. No DB migration, no config changes — pure code rollback.

## Dependencies

- None (self-contained backend fix)

## Success Criteria

- [ ] E2E `Get_owner_by_id_returns_200` passes with complete AutoMapper resolution
- [ ] E2E nonexistent ID returns 404 with `ActionCode=404`
- [ ] Validator issues zero DB queries (structural-only)
- [ ] Handler issues exactly 1 DB query with all includes
- [ ] Swagger shows 200, 400, 401, 403, 404, 500
- [ ] XML doc reads "Get owner by id"
- [ ] `CancellationToken` reaches `FirstOrDefaultAsync`
- [ ] All existing green E2E tests still pass
