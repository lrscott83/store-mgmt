# Proposal: b3-login-roundtrip — truthful B-3 plan + pin residual StoreUser login branches

## Intent

B-3 (real-login roundtrips for StoreUser and ReSeller) is ALREADY delivered and verified by archived change `e2e-b3-auth-login-roundtrip` (2026-08-09, PASS): `AuthLoginStoreUserTests.cs` (a78a0578) and `AuthLoginReSellerTests.cs` (0b2bf0cb) are ancestors of HEAD. `docs/testing/e2e-stage-1/plan-backend.md` B-3 table (lines 106-111) is STALE — still says StoreUser/ReSeller "falta". Residual: `HasActiveStore` StoreUser branches 1 (role-only, no StoreUser row) and 2 (`StoreUser.IsActive=false`) are unpinned over HTTP. This change corrects the stale plan and adds 2 additive facts closing that residual.

## Scope

### In Scope
- Correct `plan-backend.md` B-3 section → DELIVERED (both personas) + note residual now pinned.
- NEW fact: role-only StoreUser (StoreUser role, no StoreUser row) → 403 `Store.Inactive` (branch 1, blind-zone pin mirroring ReSeller D6).
- NEW fact: StoreUser row `IsActive=false` → 403 `Store.Inactive` (branch 2).

### Out of Scope
- Production code changes (CLAUDE.md rule).
- ReSeller work — persona complete (`AuthLoginReSellerTests.cs`).
- Modifying/removing/weakening existing facts (untouchable E2E rule).
- Branches 3/5 (Store null, owner null): DB-impossible (FK-required) — no test.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `auth-login-e2e`: extend "E2E coverage — StoreUser login roundtrip" (Req 2) with branch 1 role-only and branch 2 inactive-row HTTP scenarios → delta spec.

## Approach

- Append 2 `[Fact]`s to `AuthLoginStoreUserTests.cs` (existing 3 untouched), following file conventions: `SeedStoreUserAsync` fixture, `PostAsJsonAsync` to `/api/v1/auth/login`, cleanup via `CleanupStoreGraphAsync(factory, storeId, userId, ownerUserId)`.
- Branch 1: seed via `DbTestHelpers.SeedUserWithRoleAsync((int)RoleType.StoreUser)`, no StoreUser row (mirror ReSeller D6 pin).
- Branch 2: seed active graph, then deactivate StoreUser row via tracked update / `ExecuteUpdateAsync` — NoTracking-safe (mirror `DeactivateOwnerByUserIdAsync`, DbTestHelpers.cs:217-226).
- Both assert: 403, `Succeeded=false`, exactly one error `Code == "Store.Inactive"` (NOT `Auth.AccountInactive`).
- Doc: update B-3 table only (doc-only, no authorization needed).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docs/testing/e2e-stage-1/plan-backend.md` | Modified | B-3 table → DELIVERED + residual note |
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginStoreUserTests.cs` | Modified | +2 facts (additive) |
| `openspec/specs/auth-login-e2e/spec.md` | Modified | Delta: Req 2 branch 1/2 scenarios |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Touching existing facts | Med | Additive-only rule; `git diff --stat` gate |
| NoTracking trap on IsActive mutation | Med | `ExecuteUpdateAsync`/tracked Update precedent |
| Branch-2 unreachable via UI (no deactivate endpoint) | Low | Coverage pin, not user contract — state in test |
| Rate limiter 429 | None | Off under Testing (Program.cs:112-121,157-160) |

## Rollback Plan

Revert the commit: delete the 2 additive facts + restore doc diff. No schema, migration, or production code involved; existing tests untouched.

## Dependencies

- PostgreSQL `smca_test` (localhost:5432), collection `e2e`.
- Reuse existing seed helpers only (no helper modification).

## Success Criteria

- [ ] `--filter FullyQualifiedName~AuthLoginStoreUserTests` → 5/5 green on real PostgreSQL.
- [ ] `git diff --stat`: only the doc + 2 additive facts; zero production/existing-test changes.
- [ ] `plan-backend.md` B-3 table states StoreUser/ReSeller DELIVERED.
