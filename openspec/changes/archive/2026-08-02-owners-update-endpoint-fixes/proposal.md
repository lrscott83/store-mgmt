# Proposal: Owners Update Endpoint Fixes

## Intent

Fix 14 bugs in `PUT /api/v1/Owners/{id}` — 3 production-critical (NoTracking silent drops, NRE→500, cross-tenant IDOR), REST contract violations, authorization mismatch, performance double-query, and clean-code issues.

## Scope

### In Scope
- **NoTracking persistence**: Replace `GetOwnerIncludingUserByIdAsync` with dedicated `GetOwnerWithUserTrackedAsync` using `AsTracking()` — fixes User navigation props silently dropped
- **NRE→404**: Null guard after fetch returns real HTTP 404, not 500
- **Tenant-scoped auth**: Handler MUST verify `owner.TenantId == _httpContextService.TenantId` (SuperAdmin bypass) — closes cross-tenant IDOR
- **BREAKING**: `ResponseResult<bool>` → `ResponseResult<OwnerDto>` with OwnerDto projection
- **BREAKING**: Non-existent owner returns 404 (was 400 via validator)
- **Auth alignment**: Handler gate accepts `OwnerAdmin` role (matches `[HasPermission(StoreRoleFeatures.OwnersAdmin)]`), returns 403 on denial
- **Single query**: Remove validator `MustAsync(OwnerExists)` → handler-only existence check
- **Lightweight query**: Replace 5-join include chain with minimal query (Owner+User only, AsTracking)
- **Swagger**: `[ProducesResponseType]` for 400, 401, 403, 404, 500
- **XML docs**: "Updated user by id" → "Updates an owner by id", proper `<param>`/`<returns>`
- **Validator param rename**: `OwnerExists(Guid tenantId, ...)` → `OwnerExists(Guid ownerId, ...)`
- **Redundant guard**: Remove nested `if (reSellerId.HasValue)` inside outer `.HasValue` block
- **ReSeller null guard**: `GetByIdAsync(reSellerId.Value)` → null check before accessing `.DiscountPrice`
- **E2E**: Update assertions for 201→200, bool→OwnerDto, 400→404, auth gate OwnerAdmin accepted

### Out of Scope
- Method rename (`UpdatedAsync`) — deferred, breaking
- ReSeller repository DI deduplication (line 43 duplicates 17) — cosmetic only
- DELETE endpoint `ResponseResult<bool>` → `ResponseResult<OwnerDto>` — separate change
- Git operations (commits, PRs)

## Capabilities

### Modified Capabilities
- **owners**: R5 contract — 400→404 for nonexistent, `ResponseResult<bool>`→`ResponseResult<OwnerDto>`, tenant-scope enforcement
- **command-handler**: `UpdateOwnerCommandHandler` — null guard, tenant-scope auth, OwnerAdmin gate fix, tracked entity persistence, OwnerDto return
- **validation**: `UpdateOwnerCommandValidator` — remove `MustAsync(OwnerExists)`, structural-only `NotNull().NotEmpty()`, rename param
- **repository**: `IOwnerRepository`/`OwnerRepository` — new `GetOwnerWithUserTrackedAsync(Guid id)` with `AsTracking()`, Owner+User only (no 5-join include)
- **api-controller**: `UpdatedAsync` — `ProducesResponseType` 400/401/403/404/500, ActionCode switch for real HTTP statuses, XML doc, `[FromRoute]`
- **auth-authorization**: Handler-level tenant-scope check (SuperAdmin bypass) — new requirement

## Approach

| Fix | Pattern Source |
|-----|---------------|
| AsTracking persistence | `update-user-endpoint-fixes` CH-U6 (NoTracking context → `UpdateAsync` required) |
| Null→404 + single query | `delete-user-endpoint-fixes` (validator structural-only, handler single gate) |
| Tenant-scope check | `change-password-endpoint-fixes` CH-CPW3 (cross-tenant → 404, SuperAdmin bypass) |
| ResponseResult\<OwnerDto\> | `owners-create-endpoint-fixes` (201+OwnerDto+AutoMapper projection) |
| ActionCode→real HTTP switch | `change-password-endpoint-fixes` UC-CPW3 |
| NRE guard (ReSeller) | `owners-create-endpoint-fixes` (ApiException on null) |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `SMCA.WebApi/Controllers/v1/OwnersController.cs` | Modified | ProducesResponseType, ActionCode switch, XML doc |
| `Application/.../UpdateOwner/UpdateOwnerCommand.cs` | Modified | Record→`ICommand<OwnerDto>`, handler: null guard, tenant check, OwnerAdmin gate, OwnerDto return |
| `Application/.../UpdateOwner/UpdateOwnerCommandValidator.cs` | Modified | Remove OwnerExists, structural-only, param rename |
| `Domain/Interfaces/Repositories/IOwnerRepository.cs` | Modified | Add `GetOwnerWithUserTrackedAsync(Guid id)` |
| `Infrastructure/.../Repositories/OwnerRepository.cs` | Modified | New tracked method, deprecate heavy include chain on update path |
| `SMCA.WebApi.E2ETests/Owners/OwnersUpdateTests.cs` | Modified | 200 OK, `OwnerDto` assertions, 404 nonexistent, OwnerAdmin accepted |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| BREAKING: bool→OwnerDto + 400→404 breaks frontend | High | Document in `docs/plans/owners-update-endpoint-fixes-frontend.md`; coordinate UI team |
| OwnerAdmin auth gate change may expose unintended access | Low | `[HasPermission(OwnersAdmin)]` already gates endpoint; handler alignment is defensive |
| AsTracking entity lifetime may bleed into other requests | Low | `AsTracking()` call scoped to method; DbContext is request-scoped |

## Rollback Plan

Revert the single commit. No DB migration, no config changes — pure code rollback.

## Dependencies

- `IMapper` (AutoMapper) — already registered; `OwnerProfile` maps `Owner→OwnerDto`
- `docs/plans/owners-update-endpoint-fixes-frontend.md` — required BEFORE release for breaking changes

## Success Criteria

- [ ] User.FullName/CellPhone/Email changes persist (NoTracking bug fixed)
- [ ] Non-existent owner returns 404 (not 500, not 400)
- [ ] Cross-tenant update blocked (404 envelope) for non-SuperAdmin
- [ ] OwnerAdmin actor accepted (matches controller filter)
- [ ] Response envelope contains `OwnerDto` with updated fields
- [ ] Swagger shows 200, 400, 401, 403, 404, 500
- [ ] Single DB round-trip: validator zero queries, handler one tracked query
- [ ] All existing green E2E tests pass after assertion updates
- [ ] Frontend contract plan created at `docs/plans/owners-update-endpoint-fixes-frontend.md`
