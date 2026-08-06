# Design: S1-02 — E2E coverage for inactive-store login → 403 `Store.Inactive`

## Technical Approach

Purely additive test-coverage change (spec `auth-login-e2e`, Requirement 1). Add ONE new `[Fact]` to `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginFailureTests.cs` mirroring the existing inactive-ACCOUNT Fact (`:42-61`): seed a full OwnerAdmin store graph, deactivate the store, POST `/api/v1/auth/login`, assert 403 + `Succeeded=false` + single `Store.Inactive` error, cleanup via `AuthzSeed.CleanupStoreGraphAsync`. Zero production code, zero edits to existing tests. All seed/cleanup helpers already exist — no new infrastructure.

## Architecture Decisions

| # | Decision | Options | Tradeoff | Decision |
|---|----------|---------|----------|----------|
| D1 | Seed | `UserSeed.SeedOwnerAdminWithStoreAsync` vs `StoreSeed.SeedStoresAdminUserAsync` | `SeedStoresAdminUserAsync` creates NO `StoreUser` row → login fails at `AuthenticationService.cs:109-110` ("no StoreUser.Store") even with an ACTIVE store → **test passes for the wrong reason** and proves nothing about `:112-114` | Use `SeedOwnerAdminWithStoreAsync` (creates `StoreUser` row at `UserSeed.cs:61`). This is a locked requirement, not a preference — see seed trap below |
| D2 | Persona coverage | OwnerAdmin only (baseline) vs +StoreUser sibling | Sibling covers `:127-128` too, but needs a second full graph seed; spec marks it OPTIONAL, proposal settled on baseline | Baseline = ONE OwnerAdmin `[Fact]`. StoreUser sibling excluded unless user opts in (open question) |
| D3 | Cleanup | `AuthzSeed.CleanupStoreGraphAsync(_f, storeId, userId)` vs `DbTestHelpers.CleanupUserAsync` | `CleanupUserAsync` deletes Owner before Store/StoreUser → strands rows via FK `Owner_User_UserId`; graph cleanup is FK-safe (`StoreRoleFeature → StoreUser → StoreModule → Store → Owner → User`) | `CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId)` |
| D4 | Placement / fixture | New test class vs append to existing | New class duplicates the `[Collection("e2e")]` + `WebAppFixture` ctor boilerplate for no benefit; the file is the logical home and is the file the spec names | Append the `[Fact]` to `AuthLoginFailureTests.cs`; reuse `_factory`/`_client` from ctor |
| D5 | Assertion shape | `ContainSingle(e => e.Code == "Store.Inactive")` vs `.Contain(...)` | `ContainSingle` enforces "exactly one" per spec; `Contain` would pass if extra errors appeared | `body.Errors.Should().ContainSingle(e => e.Code == "Store.Inactive")`, matching the sibling Fact at `:55` |

### Seed trap (documented per spec Scenario 2)

`StoreSeed.SeedStoresAdminUserAsync` (`StoreSeed.cs:53-72`) seeds User + Owner + Store + StoreModule + OwnerAdmin role but **no `StoreUser` row**. `HasActiveStore` (`AuthenticationService.cs:109-110`) would return `Store.Inactive` because `user.StoreUser?.Store` is null — **even while the store is ACTIVE**. Such a test would pass for the wrong reason and would NOT catch a regression where the store becomes active again. `SeedOwnerAdminWithStoreAsync` creates the `StoreUser` row, so the 403 can only come from the `store.IsActive == false` branch (`:112-114`). This seed is MANDATORY.

Note: `SeedOwnerAdminWithStoreAsync` does not set `OfflinePasswordPreHash`; verified harmless — login backfills it lazily (`AuthenticationService.cs:53-66`) and never rejects on null.

## Data Flow

```
AuthLoginFailureTests.Fact
  │
  ├─1 UserSeed.SeedOwnerAdminWithStoreAsync(_factory) ──→ User+Owner+Store+StoreModule+OwnerAdmin role+StoreUser row
  │    └── f: UserWithRolesFixture(UserId, Login, OwnerId, StoreId, RoleIds)
  ├─2 StoreSeed.DeactivateStoreAsync(_factory, f.StoreId) ──→ IgnoreQueryFilters+AsTracking, s.IsActive = false
  ├─3 POST /api/v1/auth/login { Login=f.Login, Password="Password123" }
  │    └── AuthenticationService.IsValidUserAsync → HasActiveStore :112-114 → store.IsActive==false → StoreErrors.Inactive
  │         └── LoginCommand.MapErrorToStatusCode :84-86 → HTTP 403
  ├─4 assert 403 | Succeeded==false | Errors.ContainSingle(Code=="Store.Inactive")
  └─5 finally AuthzSeed.CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId)  (FK-safe)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginFailureTests.cs` | Modify (additive) | +1 `[Fact]` `Login_with_inactive_store_returns_403`; existing Facts untouched |
| `openspec/changes/e2e-stage-1-s1-02/design.md` | Create | This design |
| `docs/testing/e2e-stage-1/S1-02.md:72,80` | Modify (deferred) | 🆕 → covered; flipped by verify phase, NOT apply — docs only, not E2E tests |

## Interfaces / Contracts

No new public interfaces. Skeleton (mirrors `:42-61` pattern):

```csharp
[Fact]
public async Task Login_with_inactive_store_returns_403()
{
    var f = await UserSeed.SeedOwnerAdminWithStoreAsync(_factory);
    try
    {
        await StoreSeed.DeactivateStoreAsync(_factory, f.StoreId);
        var res = await _client.PostAsJsonAsync("/api/v1/auth/login",
            new { Login = f.Login, Password = "Password123" });
        res.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        var body = await res.Content.ReadFromJsonAsync<ApiResponse<object>>(ApiResponse.Json);
        body!.Succeeded.Should().BeFalse();
        body.Errors.Should().ContainSingle(e => e.Code == "Store.Inactive");
    }
    finally
    {
        await AuthzSeed.CleanupStoreGraphAsync(_factory, f.StoreId, f.UserId);
    }
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E (this change) | Inactive store → 403 `Store.Inactive` | New `[Fact]` above; runs against real Postgres `smca_test` via `WebAppFixture` (migrations applied by fixture); filtered run: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthLoginFailureTests"` |
| E2E (regression) | Existing suite stays green | Full `backend/src/SMCA.sln` at verify; existing tests prove ADD-ONLY compliance |

RED behavior: with an active store (pre-regression) the test fails on the 403 assertion — it would receive 200 and `Succeeded=true`; with the wrong seed it would pass only because `StoreUser.Store` is null, which the mandatory-seed requirement prevents.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. This change adds one xUnit `[Fact]` only.

## Migration / Rollout

No migration required. Rollback = `git revert` the Fact commit; file returns to prior state. No schema, config, or production code involved.

## Open Questions

- [ ] StoreUser sibling Fact (spec Requirement 2, `AuthenticationService.cs:127-128` branch): include in this change or defer? Baseline is OwnerAdmin-only per proposal; both personas are cheap (~25 extra lines via `AuthzSeed.SeedStoreUserAsync`).
