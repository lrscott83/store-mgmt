# Design: Owners GetById Endpoint Fixes

## Technical Approach

Six targeted fixes on the `GET /api/v1/Owners/{id}` pipeline, following established patterns from `delete-user-endpoint-fixes` and `activate-user-endpoint-fixes`: validator performs structural-only validation, handler is the single gate for existence → 404, repository gets complete includes + CancellationToken support. No new abstractions or architectural changes — pure bug fixes.

## Architecture Decisions

| Decision | Options | Tradeoffs | Chosen |
|----------|---------|-----------|--------|
| **D1: N+1 includes** | (A) Copy GetAll pattern: `ThenInclude(ro => ro.ReSeller).ThenInclude(r => r.User)` + `Stores.StoreModules` (B) Use `.Include()` without filtering (C) Eager-load everything | (A) mirrors existing correct pattern, avoids lazy-load trips for AutoMapper's `GetReSellerName` and `Stores`→`StoreModules`; (B) misses active-filter on Stores; (C) over-fetches deleted/inactive data | (A) |
| **D2: Existence check** | (A) Move to handler: `if (owner is null) return Failure(404)` (B) Keep in validator as-is (C) Use `SingleOrDefaultAsync` + exception | (A) single DB query, correct HTTP semantics (not found = 404), matches `delete-user`/`activate-user` patterns; (B) double-query + wrong 400; (C) exceptions for control flow | (A) |
| **D3: CancellationToken** | (A) Add to interface + repo + pass from handler (B) Leave as-is; (C) `CancellationToken.None` hardcoded | (A) respects caller cancellation, matches `GetAllOwnersIncludingStoreModulesAsync` signature; (B) ignores ASP.NET request abortion; (C) defeats the purpose | (A) |
| **D4: Swagger metadata** | (A) Add 400/401/403/404/500 (B) Add 404 only | (A) mirrors `GetAllOwnersAsync:27-31`, complete OpenAPI contract; (B) incomplete | (A) |
| **D5: XML doc** | Fix "Get user by id" → "Get owner by id" | Trivial copy-paste error — no tradeoffs | Fix |
| **D6: Validator** | (A) Keep with `.NotEmpty()` only + remove `_ownerRepository` dep (B) Delete file entirely | (A) catches `Guid.Empty` early as 400 validation error, consistent with existing E2E test; (B) Guid.Empty flows to handler → 404, still correct but less explicit | (A) |

## Data Flow

```
HTTP GET /api/v1/Owners/{id}
  │
  ▼
OwnersController.GetOwnerAsync(id)
  │ [ProducesResponseType: 200,400,401,403,404,500]
  ▼
Sender.Send(GetOwnerByIdQuery(id))
  │
  ▼
GetOwnerByIdQueryValidator (structural-only: NotEmpty)
  │ 400 if Guid.Empty
  ▼
GetOwnerByIdQueryHandler.Handle(query, ct)
  │
  ▼
IOwnerRepository.GetOwnerIncludingUserByIdAsync(ownerId, ct)
  │  Single query: Includes User, ReSellerOwner→ReSeller→User, Stores(active)→StoreModules(active)
  ▼
owner is null? ──yes──▶ ResponseResult.Failure(404)
  │
  no
  ▼
AutoMapper → OwnerDto (all nav props resolved)
  │
  ▼
ResponseResult.Success(ownerDto) → 200
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `IOwnerRepository.cs` | Modify | Add `CancellationToken cancellationToken = default` to `GetOwnerIncludingUserByIdAsync` |
| `OwnerRepository.cs` | Modify | Add `ThenInclude(ro => ro.ReSeller).ThenInclude(r => r.User)` + `.Include(o => o.Stores.Where(s => s.IsActive)).ThenInclude(s => s.StoreModules.Where(sm => sm.IsActive))` + pass `cancellationToken` to `FirstOrDefaultAsync` |
| `GetOwnerByIdQuery.cs` | Modify | Add `_localizer` + null guard returning `Failure(404)`; pass `cancellationToken` to repo call |
| `GetOwnerByIdQueryValidator.cs` | Modify | Remove `MustAsync(OwnerExists)` + `_ownerRepository` field; keep `.NotEmpty()` rule with existing `_localizer`; delete `OwnerExists` private method |
| `OwnersController.cs` | Modify | Add `[ProducesResponseType]` for 400/401/403/404/500; fix XML doc "user" → "owner" |
| `OwnersGetByIdTests.cs` | Modify | `Get_owner_by_id_nonexistent_returns_400_OwnerId` → expect 404, remove error-code assertion |

## Interfaces / Contracts

```csharp
// IOwnerRepository — signature change only
Task<Owner> GetOwnerIncludingUserByIdAsync(Guid ownerId, CancellationToken cancellationToken = default);
```

Handler null-guard pattern:
```csharp
if (owner is null)
    return ResponseResult.Failure<OwnerDto>(
        new Error("Owner.NotFound", _localizer["OwnerNotFound"]),
        HttpStatusCode.NotFound);
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E | Nonexistent ID returns 404 | Update existing test: assert `HttpStatusCode.NotFound`, remove `Errors` assertion |
| E2E | Valid ID returns 200 with complete DTO | Existing `Get_owner_by_id_returns_200` — passes when includes are complete (AutoMapper resolves all nav props) |
| E2E | Empty GUID returns 400 | Existing test stays — validator `.NotEmpty()` catches `Guid.Empty` |
| E2E | All existing green tests still pass | Regression run |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. Pure code fix. Rollback: revert the commit. Breaking change: nonexistent ID now returns 404 instead of 400 — frontend consumers must handle 404.

## Open Questions

None — all decisions have clear precedent in the codebase.
