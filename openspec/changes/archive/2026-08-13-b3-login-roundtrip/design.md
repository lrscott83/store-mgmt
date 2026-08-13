# Design: b3-login-roundtrip — truthful B-3 plan + pin residual StoreUser login branches

## Technical Approach

B-3 is already delivered (archived change `e2e-b3-auth-login-roundtrip`, PASS 2026-08-09; both test files are ancestors of HEAD); the plan doc's B-3 table is stale. This change (a) corrects `plan-backend.md` B-3 to DELIVERED with a residual note, and (b) pins the two remaining HTTP-coverable `HasActiveStore` StoreUser branches with **2 additive `[Fact]`s** appended to `AuthLoginStoreUserTests.cs` (3 → 5), per delta spec `auth-login-e2e` Req "E2E coverage — StoreUser login roundtrip" (branch 1/2 scenarios). No production code, no existing E2E test, no helper modification.

## Architecture Decisions

### D1: Placement — append to existing file, not a new file

| Option | Tradeoff | Decision |
|---|---|---|
| Append 2 `[Fact]`s to `AuthLoginStoreUserTests.cs` | Same class/`Collection("e2e")`/fixture; main spec mandates "total 5"; additive rule permits new facts in existing files | **Chosen** |
| New `AuthLoginStoreUserResidualTests.cs` | New-file churn; splits persona coverage | Rejected |

### D2: Branch 1 seed — role-only StoreUser (no StoreUser row)

| Option | Tradeoff | Decision |
|---|---|---|
| `DbTestHelpers.SeedUserWithRoleAsync(_factory, (int)RoleType.StoreUser)` (`DbTestHelpers.cs:195-205`) | Exact mirror of ReSeller blind-zone pin D6 (`AuthLoginReSellerTests.cs:143-160`); helper untouched; user + UserRole only | **Chosen** |
| Custom local seed | Duplicates existing helper logic | Rejected |

Branch 1 = `storeUser is null` (`AuthenticationService.cs:126-127`): active user, no StoreUser row → 403 `Store.Inactive`, NOT `Auth.AccountInactive`. Cleanup: `CleanupUserAsync(_factory, f.UserId)` only — no store graph exists to strand (FK Restrict safe).

### D3: Branch 2 deactivation — NoTracking-safe

| Option | Tradeoff | Decision |
|---|---|---|
| Inline `ExecuteUpdateAsync` on `Set<StoreUser>()` filtered by `UserId == f.UserId`, `SetProperty(su => su.IsActive, false)` | Issues UPDATE directly — cannot fall into the NoTracking silent no-op; mirrors `DeactivateOwnerByUserIdAsync` (`DbTestHelpers.cs:217-226`); zero helper modification (proposal dependency rule) | **Chosen** |
| Query-then-mutate + `SaveChangesAsync` | **Silent no-op** — `ApplicationDbContext` is NoTracking globally (`ApplicationDbContext.cs:45`) | Rejected (trap) |
| Tracked `db.Set<T>().Update(entity)` | Works (prior art `UpdateUserCommand.cs:59-62`) but loads the entity | Rejected |
| New shared helper in `DbTestHelpers` | Helper modification — prohibited | Rejected |

Branch 2 = `!storeUser.IsActive` (`:129-130`): seed full active graph via `AuthzSeed.SeedStoreUserAsync`, deactivate the row, login → 403 `Store.Inactive`.

### D4: Naming — file convention

| Option | Tradeoff | Decision |
|---|---|---|
| Snake-case like the existing 3 facts, each with an XML doc comment citing the pinned branch | `StoreUser_with_only_role_and_no_store_row_is_rejected_with_403`; `StoreUser_with_inactive_row_is_rejected_with_403` | **Chosen** |
| PascalCase `Login_RoleOnly…` (ReSeller style) | Cross-file inconsistency | Rejected |

Branch 1's doc comment states the intentional blind-zone contract (mirroring ReSeller D6); branch 2's states it is a coverage pin, not a user contract (no StoreUser-deactivate endpoint exists).

### D5: Doc correction scope (`plan-backend.md` B-3, lines 83-117)

| Option | Tradeoff | Decision |
|---|---|---|
| Table (:106-111) StoreUser/ReSeller → DELIVERED (change ref + date) + residual note "branch 1/2 pineados por b3-login-roundtrip"; fix "Estado actual" (:102) and stale "ninguna probada por HTTP" (:113); keep autorización note (:115) verbatim | Truthful doc; severity (MintToken blind-zone) and authorization notes stay accurate | **Chosen** |
| Table-only edit | Leaves :102/:113 contradicting the table | Rejected |

## Data Flow

```
[Fact] seed ──→ POST /api/v1/auth/login ──→ IsValidUserAsync ──→ HasActiveStore
  (b1: user+role only)      │  (b2: active graph, row deactivated)  storeUser null / !IsActive
                           └── 403 { Succeeded:false, Errors:[{Code:"Store.Inactive"}] }
finally ──→ CleanupUserAsync(f.UserId)  (b1)  |  CleanupStoreGraphAsync(f.StoreId, f.UserId, f.OwnerUserId)  (b2)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginStoreUserTests.cs` | Modify | +2 `[Fact]`s (additive; existing 3 untouched) |
| `docs/testing/e2e-stage-1/plan-backend.md` | Modify | B-3 table + residual note; :102/:113 truthfulness; :115 kept |
| `openspec/specs/auth-login-e2e/spec.md` | Modify | Already carries the delta (spec phase); no design-time edit |

## Interfaces / Contracts

Both facts assert the existing envelope contract (`ApiResponse<object>`, `ApiResponse.Json`): `StatusCode == HttpStatusCode.Forbidden`; `Succeeded == false`; `Errors.Should().ContainSingle(e => e.Code == "Store.Inactive")` — exactly one `Store.Inactive`, never `Auth.AccountInactive` (user row stays active).

Branch 2 mutation (inline in the fact body — the only non-obvious code):

```csharp
using var scope = _factory.Services.CreateScope();
var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
// NoTracking-safe (ApplicationDbContext.cs:45) — mirror DeactivateOwnerByUserIdAsync.
await db.Set<StoreUser>().IgnoreQueryFilters()
    .Where(su => su.UserId == f.UserId)
    .ExecuteUpdateAsync(s => s.SetProperty(su => su.IsActive, false));
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| E2E | Branch 1: role-only StoreUser → 403 `Store.Inactive` | New `[Fact]`, `SeedUserWithRoleAsync((int)RoleType.StoreUser)`, cleanup `CleanupUserAsync` |
| E2E | Branch 2: inactive StoreUser row → 403 `Store.Inactive` | New `[Fact]`, `SeedStoreUserAsync` + `ExecuteUpdateAsync`, cleanup `CleanupStoreGraphAsync(f.StoreId, f.UserId, f.OwnerUserId)` (both user ids — D3 order) |
| E2E | No regression on existing 3 facts | `--filter FullyQualifiedName~AuthLoginStoreUserTests` → 5/5 on PostgreSQL `smca_test` (collection `e2e`) |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration. Delivery: commit-only on a new branch, no PR (review budget ≈110 added lines < 400 guard). Rollback: revert the commit — delete the 2 facts + restore doc diff.

## Open Questions

None blocking. Branch 2 unreachable via production UI is a documented coverage-pin contract, not a user contract (proposal risk, spec scenario).