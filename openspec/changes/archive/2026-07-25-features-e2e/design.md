# Features E2E — Technical Design

**Change**: `features-e2e`
**Project**: `store-mgmt`
**Status**: Draft
**Designer**: Orchestrator → SDD Design sub-agent
**Date**: 2026-07-25

---

## 1. Technical Approach

Leverage the existing E2E test harness from the auth-e2e pilot (auth/owners/stores) with **zero application code changes**. Every test follows the same pattern established in `SMCA.WebApi.E2ETests/Auth/` and `Stores/`:

| Component | Role in this change |
|-----------|---------------------|
| `WebAppFixture` | Collection fixture: sets `ConnectionStrings__Application` env var, creates `AppTestFactory`, runs `MigrateAsync()` against `smca_test` |
| `AppTestFactory` | `WebApplicationFactory<Program>` with `"Testing"` environment + `appsettings.Tests.json` |
| `DbTestHelpers` | `SeedSuperAdminAsync` (default actor), `SeedUserWithRoleAsync` (403 actors), `AuthedClient` (HttpClient + Bearer token), `CleanupUserAsync` |
| `StoreSeed` | `SeedStoresAdminUserAsync` (available StoresAdmin actor), `CleanupStoresAdminAsync` (cleanup) |
| `ApiResponse<T>` | Deserialization with `ApiResponse.Json` (camelCase, case-insensitive) |
| `AuthTestHelpers.MintToken` | Real `IJwtProvider.GenerateToken` — no test doubles |

The `Features` test suite adds one new shared helper (`FeatureSeed`) for snapshot/restore and gap-specific seeding, and 9 test classes. All follow `[Collection("e2e")]` for serialized DB access.

---

## 2. Architecture Decisions

| # | Decision | Alternatives Considered | Rationale |
|---|----------|------------------------|-----------|
| AD1 | **Self-contained auth matrix** — each endpoint group owns its own 401/403 tests | Delegating to existing auth-e2e tests (Plan 05) | The "E2E per endpoint" convention established in Stores/ and Auth/ keeps tests co-located, independently runnable, and readable. Duplication of the auth-matrix pattern (~30 lines × 3 groups = ~90 lines) is acceptable for test clarity and isolation. No shared test fixtures or base classes needed. |
| AD2 | **`FeatureSeed` static helper class** (shared across 9 test files) | Inline helpers per test class | The activate snapshot/restore logic is non-trivial (5 entity queries, conditional delete, NoTracking workaround) and shared across 4 files. The gap helpers (insert inactive feature, inactive module + feature, set Management active) are shared across 3 gap files. A single helper avoids duplication of complex DB logic. |
| AD3 | **Snapshot/restore pattern for activate** — capture state BEFORE, restore in `finally` | Per-test cleanup only (delete what was modified) | `activate` mutates the **shared seed** (Module 6/5, Feature 60/50, creates Feature 33). Deleting is wrong because these rows are part of the permanent seed. Restoring (reverting mutations + removing created row) is correct. The `[Collection("e2e")]` attribute serializes tests per class, but across classes the shared seed must be exactly as found. |
| AD4 | **`.AsTracking()` is NOT used — `FindAsync` returns tracked entities by default in EF Core** | Explicit `.AsTracking()` in RestoreAsync | This needs a **correction** to the implementation plan. The plan says "NoTracking on DbContext — FindAsync misses restore → use AsTracking". However, EF Core `FindAsync` returns **tracked** entities by default regardless of the context's `QueryTrackingBehavior`. The real issue is that the app's `ApplicationDbContext` may be configured with `QueryTrackingBehavior.NoTracking`. If so, `FindAsync` returns **detached** entities and mutations won't persist. **Solution**: in `RestoreAsync`, read rows with `.AsTracking()` on the query, or use `db.Entry(entity).State = EntityState.Modified` after mutation. The design uses `.AsTracking()` on each `FindAsync` call in `RestoreAsync` for explicitness. |
| AD5 | **Use `Feature.Create()` factory method** for entity construction | Direct `new Feature(...)` via reflection or `Activator.CreateInstance` | `Feature` has a private constructor (domain entity pattern). `Feature.Create()` is the only public factory and raises domain events. Using it matches how the production code (`ActivateFeaturesCommand.cs:79-87`) creates entities. Module also uses `Module.Create()` with the 7-parameter overload for gap helpers. |
| AD6 | **`BeOneOf(400, 404)` for non-bool route binding** | Pin to specific status code | ASP.NET model binding returns `400` when the route param fails to parse. But if a catch-all route or versioning middleware handles it earlier, it could return `404`. Using `BeOneOf` makes the test resilient to whichever layer rejects it first, and a follow-up can pin the exact status once the pipeline is confirmed. Same rationale applies to verb-mismatch tests — use `BeOneOf(404, 405)`. |
| AD7 | **Local `FeatureDtoShape` DTO class** in test file | Reusing `Application.Dtos.Administration.Features.FeatureDto` | `FeatureDto` lives in the Application layer and may have properties (e.g., `DisplayName`, `ModuleName`) that aren't always present. The test DTO defines exactly the shape the test asserts against (`Id`, `Name`, `ModuleId`, `Order`, `AvailableToStore`) — no coupling to app DTOs, no surprise failures when the app DTO changes. |
| AD8 | **`CleanupStoresAdminAsync`** corrects the legacy `CleanupStoresAdminUserAsync` name | Using the old name | The existing method on disk is `CleanupStoresAdminAsync` (confirmed in StoreSeed.cs line 143). The implementation plan's note about the discrepancy is already resolved. |
| AD9 | **`float Price` on Module** confirmed | `decimal Price` | Module.cs line 16 declares `public float Price { get; set; }`. The implementation plan's `float StatisticsPrice` is correct. |

---

## 3. File Structure

All files under `SMCA.WebApi.E2ETests/Features/`:

```
SMCA.WebApi.E2ETests/
├── Features/
│   ├── FeatureSeed.cs                          ← Shared helper (snapshot/restore + gap insert/delete)
│   ├── FeaturesListTests.cs                    ← R1, R2: 4 tests (happy path, toggle x2, DTO shape via FeatureDtoShape)
│   ├── FeaturesListAuthTests.cs                ← R5: 5 tests (401 no-token, 3×403 Theory, malformed token)
│   ├── FeaturesActivateTests.cs                ← R3: 2 tests (mutate + assert, non-idempotent pin)
│   ├── FeaturesActivateAuthTests.cs            ← R6: 4 tests (401 no-token, 3×403 Theory)
│   ├── FeaturesAvailableTests.cs               ← R4: 2 tests (SuperAdmin, StoresAdmin)
│   ├── FeaturesAvailableAuthTests.cs           ← R7: 5 tests (401 no-token, 3×403 Theory, inactive Management)
│   ├── FeaturesListGapTests.cs                 ← R8: 4 tests (non-bool route, DTO shape, unordered pin, malformed)
│   ├── FeaturesActivateGapTests.cs             ← R9: 5 tests (Egress create, no-dup, missing row, 405, body ignored)
│   └── FeaturesAvailableGapTests.cs            ← R10: 7 tests (Admin excl, inactive module, inactive feature, ordering, DTO shape, 405, inactive Management)
└── Infrastructure/                             ← Existing harness (unchanged)
    ├── AppTestFactory.cs
    ├── WebAppFixture.cs
    ├── DbTestHelpers.cs
    ├── StoreSeed.cs
    ├── ApiResponse.cs
    ├── AuthTestHelpers.cs
    ├── TestDtos.cs
    └── UserSeed.cs / AuthzSeed.cs
```

**File count**: 10 new files (9 test classes + 1 helper). Zero modifications to existing files.

---

## 4. Data Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                         dotnet test                                   │
│                           │                                           │
│                    [Collection("e2e")]                                 │
│                           │                                           │
│           ┌───────────────┴───────────────┐                           │
│           │                                │                          │
│    Test Class (e.g.               WebAppFixture (IAsyncLifetime)       │
│    FeaturesListTests)                  │                              │
│           │                             │                              │
│           │                    AppTestFactory                           │
│           │                     (WebApplicationFactory)                 │
│           │                             │                              │
│           │                     CreateScope() → DI                     │
│           │                         │                                  │
│           └──────────┬──────────────┘                                  │
│                      │                                                 │
│         ┌────────────┴────────────┐                                    │
│         │                         │                                    │
│   DbTestHelpers /         HttpClient (AuthedClient)                     │
│   StoreSeed / FeatureSeed        │                                     │
│         │                    GET/POST →                                │
│         │                  /api/v1/Features/…                          │
│         │                         │                                    │
│         │              ┌──────────┴──────────┐                        │
│         │              │                     │                         │
│         │         FeaturesController    Auth Middleware                 │
│         │              │              [HasPermission] filter            │
│         │              │                     │                         │
│         │         Handler (MediatR)          │                         │
│         │              │                     │                         │
│         │         Validator (if any)         │                         │
│         │              │                     │                         │
│         │        ApplicationDbContext         │                        │
│         │              │                     │                         │
│         │         PostgreSQL (smca_test)      │                        │
│         └──────────────┘                     │                         │
│                                │                                      │
│                     Assert (FluentAssertions)                          │
│                                │                                      │
│                    finally: cleanup / restore                          │
└──────────────────────────────────────────────────────────────────────┘
```

### Actor types seeded per test:

| Actor | Seeder | Used in |
|-------|--------|---------|
| SuperAdmin | `DbTestHelpers.SeedSuperAdminAsync` | List, Activate, Available (200 paths) |
| StoresAdmin | `StoreSeed.SeedStoresAdminUserAsync` | Available 200 (StoresAdmin leg) |
| OwnerAdmin (bare) | `DbTestHelpers.SeedUserWithRoleAsync(RoleType.OwnerAdmin)` | Auth 403 (all 3 endpoints) |
| StoreUser | `DbTestHelpers.SeedUserWithRoleAsync(RoleType.StoreUser)` | Auth 403 (all 3 endpoints) |
| ReSeller | `DbTestHelpers.SeedUserWithRoleAsync(RoleType.ReSeller)` | Auth 403 (all 3 endpoints) |
| Anonymous (no token) | — | Auth 401 (all 3 endpoints) |
| Malformed token | `Bearer not-a-real-jwt` | List auth + List gap |

---

## 5. Testing Strategy

| Test Class | Type | Approach | Cleanup Pattern | Tests |
|------------|------|----------|-----------------|-------|
| `FeatureSeed` | Helper (static) | Snapshot/restore: captures Module(6,5) + Feature(60,50,33) state; restore reverts mutations + conditionally deletes created Egress. Gap helpers: insert/delete feature, inactive module+feature, set Management active. | N/A (helper) | — |
| `FeaturesListTests` | Behavioral | SuperAdmin → `GET all/true` → 200 + Succeeded. Toggle: insert inactive feature → assert included when `true`, excluded when `false`. DTO shape via inline class. | `finally`: delete seeded feature + cleanup user | 4 |
| `FeaturesListAuthTests` | Auth matrix | `[Fact]` for 401 no-token. `[Theory]` with 3 role IDs for 403. Malformed token → 401. | `finally`: cleanup user per theory case | 5 |
| `FeaturesActivateTests` | Behavioral | Snapshot BEFORE. Activate → assert Status/Data/DB mutations. 2nd call → false. | `finally`: restore snapshot + cleanup user | 2 |
| `FeaturesActivateAuthTests` | Auth matrix | `[Fact]` for 401. `[Theory]` with 3 roles for 403. | `finally`: cleanup user per theory case | 4 |
| `FeaturesAvailableTests` | Behavioral | SuperAdmin → 200. StoresAdmin (full graph) → 200. | `finally`: cleanup user/StoresAdmin | 2 |
| `FeaturesAvailableAuthTests` | Auth matrix | `[Fact]` for 401. `[Theory]` with 3 roles for 403. Inactive Management → 403 (with flag restore). | `finally`: cleanup user; restore Management flag | 5 |
| `FeaturesListGapTests` | Gap/Edge | Non-bool route → `BeOneOf(400, 404)`. DTO shape: Name + ModuleId > 0. Unordered pin: insert 2 features, assert membership only. Malformed token → 401. | `finally`: cleanup seeded features + user | 4 |
| `FeaturesActivateGapTests` | Gap/Edge | Snapshot BEFORE. Delete Egress → activate creates at Inventory(3)/Order=71. Activate twice → Egress count = 1. Delete TodayReports → activate still 200 (null-guard). GET → 405. Unexpected body → 200. | `finally`: restore snapshot + cleanup user | 5 |
| `FeaturesAvailableGapTests` | Gap/Edge | Insert feature under Administration → excluded. Inactive module + active feature → excluded. Inactive feature → excluded. Order ascending. DTO shape. POST → 405. Inactive Management → 403. | `finally`: cleanup seeded rows; restore Management flag | 7 |

**Total: 37 tests** across 9 test classes.

### Cleanup Discipline

| Scope | Mechanism | Ensures |
|-------|-----------|---------|
| Actor (user + roles) | `finally { DbTestHelpers.CleanupUserAsync }` | No orphan user accounts |
| StoresAdmin graph | `finally { StoreSeed.CleanupStoresAdminAsync }` | Full stores admin graph removed |
| Seeded features/modules | `finally { FeatureSeed.DeleteFeatureAsync / DeleteModuleAsync }` | Our throwaway rows don't pollute |
| Shared seed mutation (activate) | `finally { FeatureSeed.RestoreAsync(snapshot) }` after snapshot BEFORE | Shared seed exactly as found |
| Management module flag flip | `finally { SetManagementModuleActiveAsync(previousValue) }` | Management(7) restored |

---

## 6. Known Constraints

### 6.1 NoTracking on ApplicationDbContext

**Risk**: The app's `ApplicationDbContext` may be configured with `QueryTrackingBehavior.NoTracking`. If so, `FindAsync` returns **detached** entities — mutations to properties (e.g., `stats.IsActive = true`) are NOT persisted by `SaveChangesAsync`.

**Design**: In `FeatureSeed.RestoreAsync`, all entity modifications must use tracked entities. Two approaches:

1. **Use `.AsTracking()` on each query**:
   ```csharp
   var stats = await db.Set<Module>().AsTracking().FirstOrDefaultAsync(m => m.Id == 6);
   ```
   This overrides the context-level NoTracking for that specific query.

2. **Set entity state manually**:
   ```csharp
   db.Entry(stats).State = EntityState.Modified;  // after mutation
   ```

The implementation uses **approach #1** (`.AsTracking()` on query) for clarity — it's explicit at the query site and doesn't require knowing `EntityState` values.

**Note**: The `ActivateFeaturesCommandHandler` uses repositories (`_moduleRepository`, `_featureRepository`) which may apply their own tracking — this is production code, not our concern. Our test helper queries `ApplicationDbContext` directly.

### 6.2 Shared Seed Mutation (activate)

**Risk**: `activate` mutates Module(6,5) and Feature(60,50,33) in the permanent seed. Test classes share the same `smca_test` database. Without protection, tests run in parallel or sequence would collide.

**Mitigations** (stacked):
1. `[Collection("e2e")]` serializes ALL test classes in this collection — no two run concurrently.
2. Snapshot/restore in each activate test: capture state BEFORE mutation, restore in `finally`.
3. `RestoreAsync` runs unconditionally in `finally`, even if the test asserts fail.
4. The snapshot covers: `Statistics.IsActive`, `Statistics.Price`, `Reports.IsActive`, `Dashboard.IsActive`, `TodayReports.IsActive`, `EgressExisted` (boolean — if false at snapshot time, Restore removes the created Egress row).

### 6.3 Verb-Mismatch Uncertainty

**Risk**: ASP.NET routing may return `404 NotFound` instead of `405 MethodNotAllowed` when a route is matched but the verb isn't. The exact behavior depends on the routing configuration, attribute routing, and whether versioning/ convention-based routes catch it first.

**Design**: Use `BeOneOf(HttpStatusCode.MethodNotAllowed, HttpStatusCode.NotFound)` for the two verb-mismatch gap tests (`Activate_with_GET_verb_returns_405`, `Available_with_POST_verb_returns_405`). If the pipeline is later confirmed to return 405, the assertion can be tightened.

### 6.4 Non-bool Route Binding

Same uncertainty as verb mismatch. Use `BeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.NotFound)` for `List_includeInactive_nonbool_route_returns_400_or_404`.

### 6.5 FK on TodayReports(50)

**Risk**: Feature(50) may be referenced by `StoreRoleFeature` child rows. Deleting it (in the "missing optional seed row" test) would violate FK constraints.

**Design**: The implementation plan's approach (confirmed at implementation) is:
1. Read the existing row + its properties.
2. Remove it (may require deleting child `StoreRoleFeature` rows first if FKs exist).
3. Run activate (null-guard skips it → 200).
4. In `finally`, recreate the row via `Feature.Create(...)` with the captured properties.

If `StoreRoleFeature` rows reference Feature(50), the test must delete and recreate them. The design defers this to implementation-time confirmation (check if FKs exist, adapt accordingly).

### 6.6 Activate Non-Idempotent Return (Pinned Bug)

`ActivateFeaturesCommandHandler.Handle` line 90:
```csharp
return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
```

The return is `SaveChangesAsync() > 0` — `true` on first call (something changed), `false` on second call (nothing left to change). This is a **pinned contract**, not a bug to fix in this change. Both values are asserted. If the handler is later made idempotent (always returns `true`), update the second assertion from `BeFalse()` to `BeTrue()`.

### 6.7 Dead Handler Gates (Deferred)

Both `activate` and `available` handlers have unreachable `IsSuperAdmin` / `IsSuperAdminOrOwnerAdmin` guard checks. The controller's `[HasPermission]` filter is at least as strict, making these guards dead code. No E2E tests cover these branches — they are deferred to handler unit tests (separate task).

### 6.8 Feature.Create Argument Order

Confirmed from `Feature.cs`:
```csharp
public static Feature Create(int id, string name, string description, int moduleId, int order, bool availableToStore, bool isActive)
```

The implementation plan's calls match this signature. Module.Create 7-param overload confirmed:
```csharp
public static Module Create(int id, string name, int order, bool priceIncluded, float price, bool availableToStore, bool isActive)
```

---

## 7. Requirements-to-Test Mapping

| Req | Endpoint | Tests | Files |
|-----|----------|-------|-------|
| R1 | `GET all/true` | 1 | `FeaturesListTests.cs` |
| R2 | `GET all/{includeInactive}` | 2 | `FeaturesListTests.cs` |
| R3 | `POST activate` | 2 | `FeaturesActivateTests.cs` |
| R4 | `GET available` | 2 | `FeaturesAvailableTests.cs` |
| R5 | `GET all` auth | 5 | `FeaturesListAuthTests.cs` |
| R6 | `POST activate` auth | 4 | `FeaturesActivateAuthTests.cs` |
| R7 | `GET available` auth | 5 | `FeaturesAvailableAuthTests.cs` |
| R8 | `GET all` gaps | 4 | `FeaturesListGapTests.cs` |
| R9 | `POST activate` gaps | 5 | `FeaturesActivateGapTests.cs` |
| R10 | `GET available` gaps | 7 | `FeaturesAvailableGapTests.cs` |

**Total: 37 tests** (26 behavioral/auth + 11 gap).

---

## 8. FeatureSeed Helper API

```csharp
public static class FeatureSeed
{
    // --- List tests ---
    Task<int> InsertInactiveFeatureAsync(AppTestFactory f);    // Feature(9099, inactive, Inventory)
    Task DeleteFeatureAsync(AppTestFactory f, int id);

    // --- Activate snapshot/restore ---
    Task<ActivateSnapshot> SnapshotAsync(AppTestFactory f);     // Captures Module(6,5) + Feature(60,50,33)
    Task RestoreAsync(AppTestFactory f, ActivateSnapshot s);    // Reverts mutations, removes created Egress

    // --- Gap helpers ---
    Task<int> InsertFeatureUnderModuleAsync(AppTestFactory f, int moduleId, bool isActive, int id);
    Task<(int ModuleId, int FeatureId)> InsertInactiveModuleWithActiveFeatureAsync(AppTestFactory f);
    Task DeleteModuleAsync(AppTestFactory f, int id);
    Task DeleteEgressAsync(AppTestFactory f);                   // Force activate create-branch
    Task<int> EgressCountAsync(AppTestFactory f);               // 0 or 1 (PK row)
    Task<bool> SetManagementModuleActiveAsync(AppTestFactory f, bool isActive);  // Returns previous value
}

public sealed record ActivateSnapshot(
    bool StatisticsActive, float StatisticsPrice, bool ReportsActive,
    bool DashboardActive, bool TodayReportsActive, bool EgressExisted);
```

All methods are `static`, take `AppTestFactory`, open their own DI scope, and dispose it on completion. No instance state — safe to call concurrently within the collection's serialization guarantee.

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `FindAsync` returns detached entities under NoTracking | High | `RestoreAsync` mutations silently lost → seed corrupted | Use `.AsTracking()` on all restore queries. Verify with a snapshot diff assert in the activate tests. |
| FK constraint on Feature(50) deletion | Medium | Test `Activate_tolerates_missing_optional_seed_row` crashes | Check `StoreRoleFeature` references at implementation; delete and recreate child rows if needed. |
| [Collection("e2e")] serialization not sufficient for cross-class seed protection | Low | Activate tests from different classes collide | Snapshot/restore in each test covers this. If a non-activate test runs concurrently, it may read intermediate state — but `[Collection]` prevents concurrency entirely. |
| Verb-mismatch returns 404 instead of 405 | Medium | Test assertion failure | Use `BeOneOf(404, 405)`. Pin to exact code once pipeline behavior is confirmed. |
| Non-bool route returns 404 instead of 400 | Medium | Test assertion failure | Use `BeOneOf(400, 404)`. Pin once confirmed. |
| Implementation plan code has errors (wrong property names, wrong method names) | Medium | Compilation failures | Cross-check every entity property name and method signature against actual source files before committing. `Feature.Create` arg order, `Module.Create` 7-param overload, `CleanupStoresAdminAsync` name — all confirmed correct in this design. |

---

## 10. Implementation Order

| Step | Files | Depends On |
|------|-------|------------|
| 0 | `FeatureSeed.cs` | Nothing (compile first, then use in tests) |
| 1 | `FeaturesListTests.cs` | FeatureSeed |
| 2 | `FeaturesActivateTests.cs` | FeatureSeed |
| 3 | `FeaturesAvailableTests.cs` | Nothing (uses StoreSeed only) |
| 4 | `Features*AuthTests.cs` (3 files) | Nothing (uses DbTestHelpers/StoreSeed) |
| 5 | `FeaturesListGapTests.cs` | FeatureSeed |
| 6 | `FeaturesActivateGapTests.cs` | FeatureSeed |
| 7 | `FeaturesAvailableGapTests.cs` | FeatureSeed |

Steps 1–4 can run independently after Step 0. Steps 5–7 add gap helpers to FeatureSeed but don't change the existing ones.
