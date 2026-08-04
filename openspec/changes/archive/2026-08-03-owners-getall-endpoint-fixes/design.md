# Design: Owners GetAll Endpoint Fixes

**Change**: `owners-getall-endpoint-fixes` — `GET /api/v1/Owners/all/{includeInactive}`
**Date**: 2026-08-02 | **Mode**: HYBRID

## Technical Approach

Seven targeted defensive fixes across 4 files following the precedent established by `get-users-all-endpoint-fixes` and `change-password-endpoint-fixes`. No new files, DTOs, or migrations. Every fix maps to a specific bug on a specific line in the verified source.

## Architecture Decisions

### D1 — Auth gate: 400 → 403 (GetAllOwnersQuery.cs:38)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Change `HttpStatusCode.BadRequest` to `Forbidden` + proper message | Real HTTP semantics, one-line change | ✅ Chosen |
| Keep 400 "UserNotFound" | Wrong status, wrong message — masks real auth rejection | ❌ Rejected |

**Rationale**: Non-SuperAdmin/non-ReSeller hitting the auth gate is a FORBIDDEN access, not a "user not found". Precedent: `change-password-endpoint-fixes` D2 — real status codes on auth rejection. The `ApiException(string, HttpStatusCode)` overload accepts any status code — swap `HttpStatusCode.BadRequest` to `HttpStatusCode.Forbidden`, message from `_localizer["UserNotFound"]` to `_localizer["Unauthorized"]`.

### D2 — `.Take(1000)` safety cap (OwnerRepository.cs:21-27, 59-66)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `.Take(1000)` before `.ToListAsync()` | Circuit-breaker, zero API change | ✅ Chosen |
| Full pagination (Skip/Take params) | Scope creep, contract-breaking | ❌ Rejected (deferred) |

**Rationale**: Both `GetAllOwnersIncludingStoreModulesAsync` and `GetReSellerOwnersIncludingStoreModulesAsync` have unbounded queries. `.Take(1000)` goes after `.Include()`/`.Where()` chains and before `.ToListAsync(cancellationToken)`. Precedent: `get-users-all-endpoint-fixes` D3 — same cap, same position.

### D3 — `CancellationToken` propagation (`= default`)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `CancellationToken cancellationToken = default` | Backward-compatible, existing callers compile unchanged | ✅ Chosen |
| Mandatory param on interface | Forces 2+ callers to pass token unnecessarily | ❌ Rejected |

**Rationale**: Same pattern from `get-users-all-endpoint-fixes` D2. Interface gains `= default`, implementation forwards to `ToListAsync(cancellationToken)`, handler passes its `cancellationToken` to both repo calls. Precedent verified across `register-endpoint-fixes` and `get-user-by-id-endpoint-fixes`.

### D4 — Guid.Empty pre-DB guard (GetAllOwnersQuery.cs:42)

**Choice**: Guard `_httpContextService.UserExternalId.ToGuid()` result before the reseller branch. If `Guid.Empty`, throw `ApiException("Invalid reseller identity", HttpStatusCode.BadRequest)`. **Rationale**: `ToGuid()` returns `Guid.Empty` on parse failure — passing `Guid.Empty` to EF Core as a filter is always wrong and wasteful. Catch early.

### D5 — Null guard on repository result (GetAllOwnersQuery.cs:43)

**Choice**: `(owners ?? Enumerable.Empty<Owner>())` before AutoMapper. **Rationale**: Same null-guard precedent from `get-users-all-endpoint-fixes`. Repository can return null (no results matching filter) — AutoMapper accepts null but `.ToList()` on null result throws NRE.

### D6 — ProducesResponseType metadata (OwnersController.cs:25-27)

**Choice**: Add `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`, `[ProducesResponseType(500)]`. **Rationale**: Every prior endpoint-fix change adds Swagger error metadata. Without it, Swagger lies about possible responses. Consistent pattern across 8+ sibling changes.

### D7 — XML doc fix (OwnersController.cs:21-24)

**Choice**: "Get all users" → "Get all owners", add `<param name="includeInactive">Whether to include inactive owners</param>`. **Rationale**: The docstring literally says "users" on the Owners controller — copy-paste artifact. The missing param means Swagger has no description for the route parameter.

## Data Flow

```
Client → GET /api/v1/Owners/all/{includeInactive}
  → OwnersController.GetAllOwnersAsync ([ProducesResponseType 200/400/401/403/500])
    → MediatR → GetAllOwnersQueryHandler.Handle(cancellationToken)
      → Auth gate: SuperAdmin || ReSeller → else throw 403
      → [super admin]   GetAllOwnersIncludingStoreModulesAsync(includeInactive, token)
      → [reseller]      Guid.Empty guard → GetReSellerOwnersIncludingStoreModulesAsync(guid, includeInactive, token)
        → OwnerRepository: .Where(...).Include(...).Take(1000).ToListAsync(cancellationToken)
          → EF Core → PostgreSQL
    → Null guard (owners ?? [])
    → AutoMapper Owner → OwnerDto
    → ResponseResult.Success(ownerDtos)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `Controllers/v1/OwnersController.cs` | Modify | ProducesResponseType (400/401/403/500) + XML doc fix + `<param>` |
| `Queries/GetAllOwners/GetAllOwnersQuery.cs` | Modify | Auth gate 400→403, Guid.Empty guard, CancellationToken forwarding, null guard |
| `Domain/Interfaces/Repositories/IOwnerRepository.cs` | Modify | `CancellationToken = default` on 2 methods |
| `Infrastructure/Persistence/Repositories/OwnerRepository.cs` | Modify | `.Take(1000)` on 2 methods, `ToListAsync(cancellationToken)` |

## Interfaces / Contracts

**Modified — IOwnerRepository** (2 method signatures):

```csharp
Task<IEnumerable<Owner>> GetAllOwnersIncludingStoreModulesAsync(
    bool includeInactive, CancellationToken cancellationToken = default);
Task<IEnumerable<Owner>> GetReSellerOwnersIncludingStoreModulesAsync(
    Guid reSellerId, bool includeInactive, CancellationToken cancellationToken = default);
```

API contract (`ResponseResult<IEnumerable<OwnerDto>>`) unchanged. Zero breaking changes.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E | Auth rejects non-authorized user with 403 | New test: `List_owners_as_unauthorized_returns_403` |
| E2E | Guid.Empty returns 400 | New test: `List_owners_as_reseller_with_empty_external_id_returns_400` |
| E2E | 4 existing tests pass unchanged | Regression: `OwnersListTests` + `OwnersListGapTests` (4 tests) |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary changed.

## Migration / Rollout

No migration required. All changes are additive (ProducesResponseType, guards) or defensive (.Take, null guard, token `= default`).

## Open Questions

- None.
