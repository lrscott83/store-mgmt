# Archive Report: 2026-08-01-user-roles-endpoint-fixes

**Archived**: 2026-08-01
**Status**: ✅ Complete
**Mode**: openspec (filesystem)
**Verdict**: ✅ PASS (re-verified: UsersRolesTests 11/11 GREEN, 5-class Users regression 47/47 GREEN, build 0 errors)

---

## Executive Summary

Hardened the AddUserRoles/DeleteUserRoles endpoints (`UsersController.cs:108-126`, `AddUserRolesCommandHandler`, `GetUserRolesByUserIdQuery`, `VisibleRoleService`, `AddUserRolesCommandValidator`/`DeleteUserRolesCommandValidator`, `IUserRoleRepository`/`UserRoleRepository`, `RoleRepository`) across 8 backend source files + 1 E2E test file: killed a 500 NRE on non-existent RoleId (VisibleRoleService null-guard → false → 400 `RoleNotFound`), killed a 500 composite-PK conflict on duplicate RoleIds (handler `.Distinct()`), removed the redundant User entity load from the handler (no more `user.Id` NRE race), replaced per-role deferred `Where` re-queries with a single materialized `GetByUserIdAsync` lookup (N+1 killed), swapped both validators' `GetByIdAsync` full-fetch for lightweight `ExistsAsync(userId, ct)`, fixed `GetAllActiveRolesAsync` latent bug (WHERE returned only SuperAdmin), and completed Swagger metadata (`[FromBody]` + `[ProducesResponseType]` 400/401/403/404 on both actions). 7 new E2E tests (3 RED→GREEN: non-existent RoleId 400, duplicate RoleIds 200 single-row, Selected body assert; plus contract/401/403 coverage) prove each fix.

**Key deviation resolved at archive (RR-R1 signature)**: delta spec text said `Task<IEnumerable<UserRole>> GetByUserIdAsync(Guid userId)`; implementation returns `IReadOnlyList<UserRole>` + CancellationToken (per orchestrator instruction, apply-progress deviation #3). Main `user-repository` spec aligned to `IReadOnlyList<UserRole>` at archive — spec now matches implementation. `AsTracking()` added (apply-progress deviation #2) documented in the merged spec note (required under `ApplicationDbContext` NoTracking default; zero behavior change for read-only callers).

**Key test-defect resolved (E2E-R5)**: the only RED test (`Add_roles_as_store_user_without_users_admin_returns_403`) was a NEW test's expectation error — it asserted a JSON envelope body on a filter-level 403 whose `ForbidResult()` has an EMPTY body. Fixed in apply to status-code-only (matching sibling convention `UsersListTests`/`StoreRoleAccessTests`/`UsersUpdateTests`); the 403 status contract itself was already correct at runtime. Re-verification: 11/11 + 47/47 GREEN.

**Verification**: build 0 errors, no new warnings; UsersRolesTests 11/11 GREEN; 5-class Users regression 47/47 GREEN; no git operations (working-tree change only, per repo convention).

---

## Specs Synced to Main

| Domain | Action | Details |
|--------|--------|---------|
| `api-controller` | Updated (appended delta) | UC-R1 (`[FromBody]` on both command params), UC-R2 (ProducesResponseType 400/401/403/404 + 200 preserved on both actions) |
| `command-handler` | Updated (appended delta) | CH-R1 (no user load, `request.UserId`), CH-R2 (`.Distinct()` dedup), CH-R3 (single materialized lookup, N+1 killed), CH-R4 (null-guard → false), CH-R5 (single batched query), CH-R6 (query cleanup: no user load, int compare, no `Task.FromResult`) |
| `user-repository` | Updated (appended delta, **RR-R1 aligned to `IReadOnlyList<UserRole>`**) | RR-R1 (`GetByUserIdAsync` single-query contract, no `.Include`; signature text aligned to implementation) |
| `users-e2e` | Updated (R6/R7 tables aligned + delta appended) | R6: "Non-existent UserId" 404→**400**, "Invalid RoleId" 400-or-404→**400 (`RoleNotFound`)**, ADDED "Duplicate RoleIds → 200, no duplicate rows"; R7: "Remove from non-existent user" 404→**400**; auth rows annotated tested; E2E-R1..R6 appended; E2E-R7 marked resolved |
| `validation` | Updated (appended delta) | VL-R1 (AddUserRoles `ExistsAsync(userId, ct)`), VL-R2 (DeleteUserRoles same swap, batch logic untouched), VL-R3 (non-existent RoleId → 400 `RoleNotFound`, not 500) |

> Per repo convention: the per-domain main specs are delta-accumulation files carrying pre-existing uncommitted deltas from earlier batches; the merges above were applied on disk (append-only sections + R6/R7 table row alignments) but left **uncommitted** — no git operations performed in this phase.

---

## Deviations Handled at Archive

1. **RR-R1 signature text (verify SUGGESTION — MUST NOT merge literal `IEnumerable<UserRole>`)**: delta spec said `IEnumerable<UserRole>`; implementation returns `IReadOnlyList<UserRole>` (+ `CancellationToken ct` per orchestrator instruction). Main `user-repository` spec rewritten to `Task<IReadOnlyList<UserRole>> GetByUserIdAsync(Guid userId)` with an archive-alignment note documenting the deviation, the `AsTracking()` addition, and the NoTracking root cause. Verified: merged text contains no `IEnumerable<UserRole>` claim.
2. **users-e2e R6/R7 alignment (E2E-R7)**: R6 "Non-existent UserId" row 404 → **400 (validator ExistsAsync)**; R6 "Invalid RoleId" 400-or-404 → **400 (`RoleNotFound`)**; R6 ADDED "Duplicate RoleIds → 200, no duplicate rows"; R7 "Remove from non-existent user" 404 → **400 (ExistsAsync contract)**. R6/R7 auth rows (401/403) annotated as tested (E2E-R4/R5). E2E-R7 marked RESOLVED in merged spec.
3. **E2E-R5 test defect (verify CRITICAL — resolved in apply before archive)**: the 403 test's envelope-body asserts dropped (status-code-only, sibling convention); re-verification 11/11 GREEN. Merged users-e2e delta documents the fix and assert-style rule (filter-level 403 → status-code-only).

---

## Verification Results

- **Tasks**: 11/12 complete during apply (1.1–3.1, 4.1); task 4.2 (verify gates) executed in verify + re-verify
- **Build**: ✅ 0 errors, no new warnings (incremental verify re-run; full rebuild 0 errors / 163 pre-existing warnings)
- **Tests (verify re-run, real Postgres `smca_test`)**: ✅ UsersRolesTests **11/11 GREEN**; ✅ 5-class Users regression **47/47 GREEN** (was 46/47 before test-defect fix)
- **Spec compliance**: 17/17 scenarios compliant (re-verified), 0 implementation regressions
- **Coverage**: not configured (`openspec/config.yaml` absent)

## Commits

None — per repo convention: **NO GIT COMMITS, NO git add, NO git mutations**. Working tree left dirty (unrelated uncommitted changes from prior batches untouched).

## Archive Contents

```
openspec/changes/archive/2026-08-01-user-roles-endpoint-fixes/
├── proposal.md
├── specs/
│   ├── api-controller/spec.md
│   ├── command-handler/spec.md
│   ├── user-repository/spec.md
│   ├── users-e2e/spec.md
│   └── validation/spec.md
├── design.md
├── tasks.md
├── apply-progress.md
├── verify-report.md
└── archive-report.md
```

Empty `openspec/changes/pending/` dir left in place (pwa-offline-shell lives at `openspec/changes/pwa-offline-shell/` — untouched). Active change no longer under `pending/` (moved).

## Source of Truth Updated

The following main specs now reflect the new behavior:

- `openspec/specs/users-e2e/spec.md` — R6/R7 rows aligned per E2E-R7 (400 contracts + duplicate row added) + appended E2E-R1..R7 delta (uncommitted)
- `openspec/specs/api-controller/spec.md` — appended UC-R1/UC-R2 delta (uncommitted)
- `openspec/specs/command-handler/spec.md` — appended CH-R1..CH-R6 delta (uncommitted)
- `openspec/specs/user-repository/spec.md` — appended RR-R1 delta, signature aligned to `IReadOnlyList<UserRole>` (uncommitted)
- `openspec/specs/validation/spec.md` — appended VL-R1/VL-R2/VL-R3 delta (uncommitted)

## Risks

- **Dirty working tree**: pre-existing uncommitted deltas (pwa-offline-shell + all earlier endpoint-fix batches) remain — orchestrator handles separately. Merged main per-domain specs are on disk, uncommitted by design (sibling precedent).
- **`ToDictionary(ur => ur.RoleId)` duplicate-row invariant** (apply-progress): throws if DB ever holds duplicate (user, role) rows — DB invariant, not triggered by any test.
- **`.AsTracking()` dependency** for reactivation persistence: future refactor removing it silently breaks reactivation (documented in verify-report).
- **RR-R1 spec alignment note**: `IReadOnlyList<UserRole>` + `ct` + `AsTracking()` documented in merged spec; delta draft (archived) still shows the original `IEnumerable<UserRole>` text for audit lineage.
- **No `openspec/config.yaml` / `openspec/project.md`** exists in this repo — no active-change tracker to update; archive conventions followed from sibling precedent.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Ready for the next change.
