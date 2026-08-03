# Archive Report: 2026-08-02-change-password-endpoint-fixes

**Archived**: 2026-08-02
**Status**: ✅ Complete
**Mode**: HYBRID (openspec + engram)
**Verdict**: ✅ PASS (verify-report: 26/26 spec scenarios compliant; apply evidence: 8/8 change-password E2E GREEN, 33/33 sibling regression GREEN, build 0 errors)

---

## Executive Summary

Hardened the `POST /api/v1/users/change-password` endpoint (`UsersController.ChangePasswordAsync`, `UpdateUserPasswordCommand` + Validator, plan #22, review score 4.5/10) across 5 backend source files + 1 E2E test file + 2 plan docs: **killed the broken BCrypt old-password compare** (handler self-branch was comparing two `HashPassword` outputs — a random-salt compare that can NEVER match; now uses `VerifyPassword` via the active `BcryptHashPasswordService`, DI `DependencyInjection.cs:62`), **closed the cross-tenant IDOR** on the admin branch (tenant-scope check `user.TenantId != TenantId claim` → 404 anti-enumeration, SuperAdmin bypass), **made the endpoint reachable for the first time** by aligning the route to the ONE shape both frontends call (`change-password/{id}` + `[FromBody]` — the body-`UserId` route was 404 at routing), **replaced always-200 business failures** with REAL HTTP statuses via an ActionCode switch (400/401/403/404 mirroring `AuthController.cs:30-41` — required by the React consumer which rejects on non-2xx), added a null-guard → envelope 404, swapped the validator's `GetByIdAsync` double-fetch for a single lightweight `ExistsAsync(userId, ct)`, renamed the misnamed `tenantId` param, added the NewPassword policy (8 + uppercase) with 2 new resx keys (`PasswordMinLength`/`PasswordRequiresUppercase` in BOTH `I18n.resx` + `I18n.en.resx` — also fixes register's latent literal-key fallback), and rewrote the E2E suite to 8 tests with real status asserts + a re-login proof (new password → 200, old password → 401) that kills the old 200-false-positive.

**Key contract corrections at archive (users-e2e R8)**: "Non-existent UserId → 404" aligned to **400** (validator `ExistsAsync`, decision D3 — UpdateUser precedent `Update_nonexistent_id_returns_400`); "Change with wrong OldPassword → 400 or 403" pinned to **400** (product decision D2 — real HTTP 400, not 200+envelope, not 401/403). R8 header updated to `POST change-password/{id}`. Main spec now consistent with implemented behavior.

**Root-cause note (design discrepancy resolved)**: the ACTIVE hash service is `BcryptHashPasswordService` (BCrypt random salt) — the review finding "random-salt compare can never match" was CORRECT; `VerifyPassword` is 3-tier (BCrypt + legacy SHA256+pepper + raw SHA256) so E2E raw-SHA256 seeds verify. NO `StartsWith('$')` upgrade branch reintroduced — every successful change writes a fresh BCrypt hash (upgrade-by-change).

**Plan-frontend delta**: `specs/plan-frontend/spec.md` has **NO main spec** — `openspec/specs/plan-frontend/` does not exist (this is a deliverable-tracker domain for `docs/plans/2026-08-02-change-password-contract-frontend.md`, which was created at apply). Delta spec retained in the archived change folder as the record; frontend executes its own work from the plan doc (out of scope here).

**Verification**: build 0 errors (163 pre-existing warnings, none in modified files); 8/8 change-password E2E GREEN; 33/33 sibling regression GREEN; no git operations (working-tree change only, per repo convention).

---

## Specs Synced to Main

| Domain | Action | Details |
|--------|--------|---------|
| `users-e2e` | Updated (R8 aligned + delta appended) | **R8 table**: "Non-existent UserId" 404→**400 (validator ExistsAsync)**; "Wrong OldPassword" 400-or-403→**400 (pinned — real HTTP 400)**; header → `POST change-password/{id}`; E2E-CPW1..CPW10 appended (8 tests: re-login proof, wrong-old 400, weak 400, nonexistent 400, cross-tenant 404, same-tenant 200, filter 403, SuperAdmin cross-tenant 200) |
| `command-handler` | Updated (appended delta) | CH-CPW1 (null-guard → envelope 404), CH-CPW2 (`VerifyPassword` self branch, zero hash-of-hash), CH-CPW3 (admin tenant-scope check, anti-enumeration), CH-CPW4 (real ActionCodes), CH-CPW5 (`UpdateAsync` + `SaveChangesAsync` untracked-entity semantics) |
| `validation` | Updated (appended delta) | VL-CPW1 (`GetByIdAsync` → `ExistsAsync(userId, ct)` single query), VL-CPW2 (param `tenantId`→`userId`), VL-CPW3 (NewPassword 8+uppercase with 2 new resx keys in BOTH files), VL-CPW4 (required rules retained → real 400) |
| `api-controller` | Updated (appended delta) | UC-CPW1 (route `change-password/{id}` + `[FromBody]` + `command.UserId = id`, filter retained), UC-CPW2 (ProducesResponseType 200/400/401/403/404), UC-CPW3 (ActionCode switch → real statuses, zero `Ok(failure)`) |
| `plan-frontend` | **Not synced — NO main spec exists** | `openspec/specs/plan-frontend/` absent (deliverable-tracker domain; the actual deliverable `docs/plans/2026-08-02-change-password-contract-frontend.md` was created at apply). Delta spec retained in archive for lineage |

> Per repo convention: the per-domain main specs are delta-accumulation files carrying pre-existing uncommitted deltas from earlier batches; the merges above were applied on disk (R8 row alignments + append-only delta sections) but left **uncommitted** — no git operations performed in this phase.

---

## Deviations Handled at Archive

1. **users-e2e R8 alignment (E2E-CPW1/E2E-CPW2)**: R8 "Non-existent UserId" row 404 → **400 (validator `ExistsAsync`)**; R8 "Wrong OldPassword" row "400 or 403" → **400 (pinned)**; R8 header updated `POST change-password` → `POST change-password/{id}` (route contract D1). Aligned to the pre-existing `Update_nonexistent_id_returns_400` / `UpdateUserCommandValidator` precedent — the 400 contract, not 404.
2. **Plan-frontend has no main spec**: `specs/plan-frontend/spec.md` documents the `docs/plans/2026-08-02-change-password-contract-frontend.md` deliverable. `openspec/specs/plan-frontend/` does not exist; per orchestrator instruction the delta is NOT copied to a new main spec — noted here instead. The plan doc itself is the source of truth for frontend execution (PF-CPW1-4 verified compliant).
3. **Hash mechanism (verify/resolved)**: `BcryptHashPasswordService` (BCrypt random salt, DI `Application/DependencyInjection.cs:62`) is the ACTIVE `IHashPasswordService`; `SMCA.WebApi/Services/HashPasswordService.cs` (SHA256-deterministic) is NOT registered in WebApi — dead code there. Verify confirmed handler uses `VerifyPassword` (3-tier) and NO `StartsWith('$')` branch (upgrade-by-change). No main-spec text contradicted this after archive.
4. **403 test is status-only** (accepted risk, documented in verify): filter-level `ForbidResult` has an empty body; assert is `HttpStatusCode.Forbidden` only. If the permission filter ever returns a JSON envelope the test still passes but should assert the body.

---

## Verification Results

- **Tasks**: 9/9 checkbox items complete (1.1, 1.2, 2.1–2.4, 3.1–3.3); apply-progress.md confirms all phases complete
- **Build**: ✅ 0 errors, 163 pre-existing warnings, none in modified files (apply evidence)
- **Tests (apply evidence, real Postgres `smca_test`)**: ✅ change-password E2E **8/8 GREEN**; ✅ sibling regression **33/33 GREEN** (`UsersUpdateTests|UsersDeleteTests|UsersRolesTests|UsersActivateTests` — superset of tasks recommendation). NOTE: test re-run is the orchestrator's job (final E2E run recommended)
- **Spec compliance**: 26/26 scenarios compliant (verify-report, static + documented apply results); 0 CRITICAL/WARNING gaps
- **Coverage**: not configured (`openspec/config.yaml` absent)

## Commits

None — per repo convention: **NO GIT COMMITS, NO git add, NO git mutations**. Working tree left dirty (unrelated uncommitted changes from prior batches untouched).

## Engram Lineage (observation IDs)

| Artifact | Engram ID |
|----------|-----------|
| explore | #563 |
| proposal | #565 |
| spec | #566 |
| design | #567 |
| tasks | #569 |
| apply (session summary) | #571 |
| verify-report | #572 |
| architecture note (Bcrypt active DI) | #568 |
| archive-report (this report) | #573 |

## Archive Contents

```
openspec/changes/archive/2026-08-02-change-password-endpoint-fixes/
├── proposal.md
├── specs/
│   ├── api-controller/spec.md
│   ├── command-handler/spec.md
│   ├── plan-frontend/spec.md
│   ├── users-e2e/spec.md
│   └── validation/spec.md
├── design.md
├── tasks.md
├── apply-progress.md
├── verify-report.md
└── archive-report.md
```

`openspec/changes/pending/` is now EMPTY (change moved). No other changes pending.

## Source of Truth Updated

The following main specs now reflect the new behavior:

- `openspec/specs/users-e2e/spec.md` — R8 rows aligned (nonexistent → 400, wrong-old pinned 400, route `{id}`) + appended E2E-CPW1..CPW10 delta (uncommitted)
- `openspec/specs/command-handler/spec.md` — appended CH-CPW1..CH-CPW5 delta (uncommitted)
- `openspec/specs/validation/spec.md` — appended VL-CPW1..VL-CPW4 delta (uncommitted)
- `openspec/specs/api-controller/spec.md` — appended UC-CPW1..UC-CPW3 delta (uncommitted)
- `docs/plans/2026-08-02-change-password-contract-frontend.md` — created at apply (deliverable; plan-frontend delta has no main spec)

## Risks

- **Dirty working tree**: pre-existing uncommitted deltas (all earlier endpoint-fix batches + this change's 7 modified + 1 new file) remain — orchestrator handles separately. Merged main per-domain specs are on disk, uncommitted by design (sibling precedent).
- **403 test is status-only**: if the permission filter ever returns a JSON envelope, the 403 assert still passes but should assert the body (documented in verify + apply).
- **Cross-tenant 404 vs 400 contract** depends on `UserRepository.ExistsAsync` `IgnoreQueryFilters()` (verified intact at `UserRepository.cs:99-102`) — validator passes for cross-tenant users so the handler's tenant check produces the 404; if the filter changes, the 404 assertion could shift.
- **Re-login proof depends on `VerifyPassword` tier-3 raw-SHA256 acceptance** — `BcryptHashPasswordService` must remain the active DI service; E2E seeds store raw SHA256.
- **`I18n.en.resx` keys** added at the :522 region — if a future resx merge rewrites the file, the keys must survive (string-indexed; Designer.cs untouched).
- **No `openspec/config.yaml` / `openspec/project.md`** exists — no active-change tracker to update; archive conventions followed from sibling precedent.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Ready for the next change.
