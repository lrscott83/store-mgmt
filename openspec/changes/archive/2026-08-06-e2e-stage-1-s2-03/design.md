# Design: Document OwnerAdmin Direct POST /v1/stores (H-10 gap) as E2E

## Technical Approach

New `[Collection("e2e")]` class `StoreCreateAuthorizationGapTests` in a **new file**
`backend/src/SMCA.WebApi.E2ETests/Stores/StoreCreateAuthorizationGapTests.cs`. Two **passing**
tests pin current (defective) behavior per spec R2.10/R2.11:

1. **OwnerAdmin with Stores feature (73)** → direct `POST /api/v1/stores` → **201** + persisted
   `Store`/`StoreModule` rows + `SelectedStoreId` re-pointed to the new store.
2. **StoreUser with feature 73** (passes class gate, not SuperAdmin/OwnerAdmin) → **400 BadRequest**
   (not 403) + **no** `Store` row created.

Zero production code; zero edits to existing tests (add-only rule). Test 1 mirrors `StoreCreateTests`
(body/persistence asserts, `StoreCreateTests.cs:18-19,39-42`) + `StoreAuthorizationTests`
(seed/cleanup, `:16-28`). Test 2 mirrors `AuthMePermissionsTests.cs:64-75`. Both seeds and cleanups
already exist and are proven by passing tests — no seed-helper changes.

## Architecture Decisions

### D-1: New file, not an append to StoreCreateTests

| Option | Tradeoff | Decision |
|--------|----------|----------|
| New `StoreCreateAuthorizationGapTests.cs` | Clean defect documentation; zero ambiguity under the add-only rule | **Chosen** |
| Append to `StoreCreateTests.cs` | Reuses `Body`/`AssertCreate400` but mixes personas in a SuperAdmin-focused file | Rejected (explore) |

### D-2: Two tests — OwnerAdmin 201/persistence/re-point merged into one

| Option | Tradeoff | Decision |
|--------|----------|----------|
| One test: 201 + persistence + re-point | One seed chain, minimal runtime; spec lists them as one enforcement window | **Chosen** |
| Split into 201+persist vs re-point | One failing assertion obscures the other | Rejected |

### D-3: Re-point asserted via DB read with `IgnoreQueryFilters`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `db.Set<User>().IgnoreQueryFilters().FirstAsync(u => u.Id == sa.UserId)` | Deterministic ground truth; no extra HTTP round-trip | **Chosen** |
| `GET /api/v1/auth/me` → `MeData.SelectedStoreId` | Works (claims transformer re-reads per request, `ClaimsTransformerService.cs:41`) but couples assert to token/claims plumbing | Rejected |

### D-4: Cleanup ordering — new store graph FIRST, then fixture graph

Order matters: the new store's `OwnerId == sa.OwnerId` (shared fixture owner). Deleting the owner
(`CleanupStoresAdminAsync` last step) while the new store still references it breaks FK integrity.
`SelectedStoreId` is not a DB FK, so the re-point alone does not block deletion — but the
new-store-first order keeps the whole graph consistent (spec R2.10 cleanup clause).

| Order | Step |
|-------|------|
| 1 | `if (created != Guid.Empty) await StoreSeed.CleanupStoreAsync(_f, created);` |
| 2 | `await StoreSeed.CleanupStoresAdminAsync(_f, sa);` |

### D-5: Test 2 asserts 400 + no Store row (error key optional)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| 400 BadRequest + `!AnyAsync(s => s.Name == name)` | Pins both spec clauses; unique name makes the negative deterministic | **Chosen** |
| Also assert `NotAuthorized` error code in `Errors` | Extra envelope pin; not required by spec | Optional |

## Data Flow

    Seed fixture ──→ AuthedClient(login) ──POST /api/v1/stores──→ Handler
        │                                                       │
        │      StoreUser:   400 @ CreateStoreCommand.cs:50-51 (before any create)
        │      OwnerAdmin:  201 @ :88-90 → Store + StoreModule + re-point :57-61
        ▼                                                       ▼
    finally: CleanupStoreAsync(new) ──→ CleanupStoresAdminAsync(fixture)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Stores/StoreCreateAuthorizationGapTests.cs` | Create | 2 tests pinning H-10 current behavior; `[Collection("e2e")]`, ctor `WebAppFixture` |

No other file touched.

## Interfaces / Contracts

Request body — mirror `StoreCreateTests.cs:18-19` (private static helper in the new file):

```csharp
private static object Body(Guid ownerId, string name, IEnumerable<int> moduleIds) => new
{ OwnerId = ownerId, Name = name, Address = (string?)null, Description = (string?)null,
  Approved = false, ModuleIds = moduleIds };
```

Seeds/cleanup (existing, unchanged):

- `StoreSeed.SeedStoresAdminUserAsync(_f)` → `StoresAdminFixture(UserId, Login, StoreId, OwnerId)`.
  Cleanup: `StoreSeed.CleanupStoreAsync(_f, id)` per store, `StoreSeed.CleanupStoresAdminAsync(_f, sa)` last.
- `AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: AuthzSeed.StoresFeatureId /* 73 */)` →
  `StoreUserFixture`. Cleanup: `AuthzSeed.CleanupStoreGraphAsync(_f, f.StoreId, f.UserId, f.OwnerUserId)`.
- Persistence reads: `db.Set<Store>()` / `Set<StoreModule>()` / `Set<User>()` with
  `.IgnoreQueryFilters()` (global tenant filter; `NoTracking` irrelevant — reads only, no mutation).
  Response: `ApiResponse<StoreData>` with `ApiResponse.Json` (case-insensitive).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E | R2.10 OwnerAdmin 201 + persistence + re-point | Seed `SeedStoresAdminUserAsync`; POST `Body(sa.OwnerId, name, [ManagementModuleId])`; assert Created / `Succeeded` / `Location == /api/v1/stores/{id}`; `AnyAsync` Store + StoreModule (`IgnoreQueryFilters`); `User.SelectedStoreId == created`; ordered cleanup |
| E2E | R2.11 StoreUser 400-not-403 + no Store row | Seed `SeedStoreUserAsync(73)`; POST `Body(f.OwnerId, name, [ManagementModuleId])`; assert BadRequest (handler rejects before owner load); `!AnyAsync(Store, Name == name)`; `CleanupStoreGraphAsync` |

No unit/integration — zero production code. No RED tests: both pass against current behavior.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration. Rollback = delete the single new file.

## Open Questions

- [ ] Should test 2 also assert the `NotAuthorized` error code in `Errors`? Non-blocking; spec R2.11 only requires 400 + no Store row.
- [ ] Coupling warning (from proposal + spec): when H-10 is fixed — action-level `[HasPermission(SuperAdmin)]` or removal of the re-point branch — R2.10/R2.11 and these tests MUST be updated in the same change. Confirm at apply time.
