# Design: H-10 — Enforce SuperAdmin-only store creation

## Technical Approach

Approach D (user-authorized 2026-08-12): close `POST /v1/stores` so only SuperAdmin can create stores, via three coordinated changes:

1. **Action-level `[HasPermission(StoreRoleFeatures.SuperAdmin)]`** on the POST action — mirrors the 4 sibling SuperAdmin-only actions (`StoresController.cs:113/:129/:144/:159`) and yields a real HTTP 403 (`ForbidResult`) before the handler runs.
2. **Handler hardening** — guard tightened to `IsSuperAdmin` with `HttpStatusCode.Forbidden` (defense in depth for direct MediatR callers).
3. **Dead branch removal** — the OwnerAdmin `SelectedStoreId` re-point branch deleted.

The 2 gap E2E tests are rewritten to assert the corrected behavior. The `authorization-e2e` delta (R2.10/R2.11 → 403 semantics, added R2.12/R2.13/R2.14) was already applied in the spec phase; this design notes it, does not re-touch it.

## Architecture Decisions

### D1: Authorization — action-level attribute (primary fix)

| Option | Tradeoff | Decision |
|---|---|---|
| Action-level `[HasPermission(SuperAdmin)]` on POST (A) | Real 403 before handler; consistent with 4 siblings | **Chosen** |
| Handler-only guard change (B) | Still 400-not-403; non-SuperAdmin still reaches handler | Rejected |
| Keep OwnerAdmin allowed; fix 400→403 only (C) | Keeps arbitrary-owner creation + re-point + trial-clock hole | Rejected |

**Rationale**: The filter (`HasPermissionAttribute.cs:57-78`) detects the action-level attribute and lets the class-level filter skip; action-level `[SuperAdmin]` ≠ class-level `[SuperAdmin, StoresAdmin]` (`SequenceEqual` false), so this filter proceeds. `SuperAdmin` carries no `[HasFeature]` (`StoreRoleFeatures.cs:9-10`), so `GetFeatureType()` is null (`StoreRoleFeaturesExtensions.cs:25-29`): for OwnerAdmin/ReSeller, `srf.GetFeatureType().HasValue` is false → `hasPermission=false` → `ForbidResult()` 403 (line 92-95). StoreUser takes the `HasUserAnyFeatureInStoreAsync` branch → false → 403 (line 100-105). SuperAdmin short-circuits (line 84). Unauthenticated stays 401 (line 112) — already pinned by `StoreCreateTests.Create_without_token_returns_401`.

### D2: Handler hardening (defense in depth)

| Option | Tradeoff | Decision |
|---|---|---|
| Guard → `IsSuperAdmin`, status → `Forbidden`, delete re-point branch :57-61 | Closes non-HTTP MediatR path; no dead code | **Chosen** |
| Leave handler unchanged | Latent H-10 re-trigger via direct caller; dead OwnerAdmin branch | Rejected |

**Rationale**: `ApiException.StatusCode` maps to the HTTP status via `ErrorHandlerMiddleware.cs:81-86` (`response.StatusCode = (int)e.StatusCode`; `ResponseResult` envelope). `HttpStatusCode.Forbidden` → 403, satisfying R2.14 for direct handler callers. In the HTTP path the filter 403s first, so this branch is unreachable there — it is pure defense. Deleting :57-61 removes the `SelectedStoreId` re-point side effect entirely. The final `ResponseResult.Failure(StoreErrors.NotCreated, 400)` return (line 65) stays; the controller wraps it in `Ok(...)` (`StoresController.cs:88-90`) — flagged, **out of scope** (adjacent 200-wrapped failure bug, not H-10).

### D3: Test rewrite strategy

| Option | Tradeoff | Decision |
|---|---|---|
| Rewrite both gap tests to assert 403 + no persistence | Matches corrected spec; user-authorized 2026-08-12 | **Chosen** |
| Leave tests pinning the defect | Suite fails after fix | Rejected |

**Rationale**: `ForbidResult` returns an **empty body** — the rewritten tests assert `StatusCode.Should().Be(HttpStatusCode.Forbidden)` only, matching sibling `StoreAuthorizationTests` (lines 31-52). Persistence assertions use `IgnoreQueryFilters` DB reads (existing `StoreCreateTests` pattern, no `NoTracking` trap: read-only queries).

## Data Flow

```
POST /v1/stores
  ├─ SuperAdmin → filter: IsSuperAdmin short-circuit → handler: IsSuperAdmin ✓
  │    → CreateStoreService → 201 Created + Store/StoreModule persisted + Location
  ├─ OwnerAdmin → filter: GetFeatureType(SuperAdmin)==null → ForbidResult → 403 (handler never runs)
  ├─ StoreUser  → filter: HasUserAnyFeatureInStore([SuperAdmin])==false → 403 (handler never runs)
  └─ ReSeller   → filter: GetFeatureType(SuperAdmin)==null → 403 (handler never runs)

S1-01 auto-registration: POST /auth/register → RegisterCommand.cs:82 → ICreateStoreService
directly — never CreateStoreCommand → unaffected (verified in code).
```

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` | Modify | Add `[HasPermission(StoreRoleFeatures.SuperAdmin)]` to POST action (line 83) |
| `backend/src/Application/Features/StoreManagement/Stores/Commands/CreateStore/CreateStoreCommand.cs` | Modify | Guard → `IsSuperAdmin` + `HttpStatusCode.Forbidden` (:50-51); delete re-point branch (:57-61) |
| `backend/src/SMCA.WebApi.E2ETests/Stores/StoreCreateAuthorizationGapTests.cs` | Modify | Both tests assert 403; OwnerAdmin test asserts no Store/StoreModule rows + `SelectedStoreId` unchanged |
| `openspec/changes/s2-03-backend-h10/specs/authorization-e2e/spec.md` | Done (spec phase) | R2.10/R2.11 MODIFIED, R2.12/R2.13/R2.14 ADDED, criterion #8 replaced |

## Interfaces / Contracts

No new interfaces, DTOs, or schema. New behavior contract for `POST /v1/stores`:

| Caller | Status | Side effects |
|---|---|---|
| SuperAdmin | 201 Created + Location | Store + StoreModule persisted |
| OwnerAdmin / StoreUser / ReSeller (authenticated) | 403 (empty body) | None — filter runs before handler |
| Anonymous | 401 | None |
| Direct handler caller (non-SuperAdmin) | 403 via ApiException | None |

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| E2E (rewritten test 1) | OwnerAdmin w/ feature 73 → 403, no persistence, no re-point (R2.10) | Seed `StoreSeed.SeedStoresAdminUserAsync`; POST; assert 403; DB: no `Store` named `name`, no `StoreModule` for it (`IgnoreQueryFilters`); `SelectedStoreId == sa.StoreId`; cleanup `CleanupStoresAdminAsync` only |
| E2E (rewritten test 2) | StoreUser w/ feature 73 → 403 not 400 (R2.11) | Seed `AuthzSeed.SeedStoreUserAsync(grantedFeatureId: AuthzSeed.StoresFeatureId)`; POST; assert 403; no `Store` row; cleanup `CleanupStoreGraphAsync` |
| E2E regression | SuperAdmin creation intact (R2.12) | Existing `StoreCreateTests` (201 + persist + Location) — unchanged |
| E2E regression | Auto-registration one-step (R2.13) | Existing `StoreCreationTrialTests` registration path + `AuthRegisterDataAssertionsTests` — unchanged |

Run order:
1. `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~StoreCreateAuthorizationGap"` — proves the fix
2. `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~SMCA.WebApi.E2ETests.Stores"` — Stores-area regression (SuperAdmin creation, sibling 403 patterns, `StoreCreateTests` 400 validation cases)
3. Billing `StoreCreationTrialTests` + `AuthRegisterDataAssertionsTests` — S1-01 regression

No new unit tests: `CreateStoreCommandHandler` has no Application.Tests coverage today and none is required (R2.14 is enforced at the filter boundary, covered by E2E; handler branch is defense-in-depth).

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration, no feature flag. Prior OwnerAdmin-created stores are untouched (forward-only). Rollback: `git revert` the change commit (2 production files + 1 test file + spec delta); no schema change; re-run Stores E2E.

## Open Questions

None blocking. Flagged out of scope: `StoresController.cs:88-90` returns `Ok(result)` (HTTP 200) when the handler returns `Failure(NotCreated, 400)` — a 200-wrapped error envelope, unrelated to H-10's authorization gap, deliberately excluded.
