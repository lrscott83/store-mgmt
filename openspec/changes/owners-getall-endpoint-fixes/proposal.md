# Proposal: Owners GetAll Endpoint Fixes

## Intent

Fix 7 bugs in `GET /api/v1/Owners/all/{includeInactive}`: wrong HTTP status on auth failure (400 "UserNotFound"), unbounded queries without safety cap, missing Swagger error metadata, incorrect XML doc, silent Guid.Empty propagation, missing CancellationToken forwarding, and missing null guard before AutoMapper.

## Scope

### In Scope
- Auth gate: `UserNotFound`+400 → proper message+403 on handler auth rejection
- Repository: `.Take(1000)` safety cap on 2 unbounded queries + CancellationToken param
- Controller: `[ProducesResponseType]` for 400, 401, 403, 500
- Controller: XML doc fix ("Get all users" → "Get all owners") + missing `<param name="includeInactive">`
- Handler: `Guid.Empty` guard after `ToGuid()` before DB query (throw 400)
- Handler: `CancellationToken` propagation to repository calls
- Handler: null guard on repository result before AutoMapper projection

### Out of Scope
- Route changes (`all/{includeInactive}` kept as route parameter — project-consistent pattern)
- Full pagination (Page/PageSize) — contract-breaking change
- `Approved` property or AutoMapper mapping changes
- Response envelope format / `ResponseResult` pattern changes
- `[HasPermission]` filter attribute changes
- Commits, pushes, PRs

## Capabilities

### Modified Capabilities
- `owners`: auth rejection 400→403; Guid.Empty pre-DB guard
- `api-controller`: ProducesResponseType 400/401/403/500 additions + XML doc correction
- `repository`: .Take(1000) + CancellationToken on GetAllOwnersIncludingStoreModulesAsync and GetReSellerOwnersIncludingStoreModulesAsync

## Approach

Targeted defensive fixes following patterns established by prior endpoint-fixes changes:

| Fix | Pattern Source |
|-----|---------------|
| Auth gate 403 | `change-password-endpoint-fixes` (real status codes) |
| `.Take(1000)` safety cap | `get-users-all-endpoint-fixes` (RR2) |
| ProducesResponseType 400/401/403/500 | 4 prior `api-controller` deltas (GetAllUsers, GetUserById, etc.) |
| `CancellationToken` with `= default` | `get-users-all-endpoint-fixes` (RR3) |
| Guid.Empty guard | Standard defensive pattern — prevent wasteful DB query |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `SMCA.WebApi/Controllers/v1/OwnersController.cs` | Modified | ProducesResponseType + XML doc |
| `Application/.../Queries/GetAllOwners/GetAllOwnersQuery.cs` | Modified | Auth gate, Guid guard, token, null guard |
| `Domain/Interfaces/Repositories/IOwnerRepository.cs` | Modified | CancellationToken param on 2 methods |
| `Infrastructure/Persistence/Repositories/OwnerRepository.cs` | Modified | .Take(1000), CancellationToken |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `.Take(1000)` changes SQL generation | Low | EF Core emits TOP/LIMIT; identical pattern proven in Users endpoint |
| Interface change breaks callers | Low | `= default` token param — all existing callers compile unchanged |
| ReSeller with empty UserExternalId now gets 400 | Low | Empty GUID is always invalid identity; correct to reject early |

## Rollback Plan

Revert commit. All changes are additive (ProducesResponseType, guards) or defensive (.Take, null guard, token param with default). Zero contract-breaking changes.

## Dependencies

- None

## Success Criteria

- [ ] Non-SuperAdmin/non-ReSeller gets 403 (not 400 "UserNotFound")
- [ ] Both repository queries include `.Take(1000)` before `.ToListAsync()`
- [ ] Swagger shows 400, 401, 403, 500 in addition to 200
- [ ] XML doc says "Get all owners" with `<param name="includeInactive">` documented
- [ ] Handler rejects Guid.Empty with 400 before querying DB
- [ ] CancellationToken flows from handler through repository to EF Core
- [ ] Null repository result returns empty list, not NRE
- [ ] Existing E2E tests (`OwnersListTests`, `OwnersListGapTests`) pass unchanged
