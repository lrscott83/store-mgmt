# Archive Report — `e2e-stage-1-userslist-flake`

**Archived**: 2026-08-08 (folder prefix per orchestrator instruction; archive executed 2026-08-09)
**Archived to**: `openspec/changes/archive/2026-08-08-e2e-stage-1-userslist-flake/`
**Verify verdict carried into this archive**: PASS (0 CRITICAL, 0 WARNING caused-by-change, 1 SUGGESTION, verdict `pass`, blockers 0) — validated with `gentle-ai sdd-verify-validate --requirements 3 --scenarios 7` → valid: true, verdict: pass, blockers 0
**Artifact store**: hybrid (filesystem + Engram) — orchestrator-reported mode `both`
**Branch**: `feat/e2e-stage-1-s1-01-backend`

## Project rule (carried verbatim)

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

This archive phase touched ONLY SDD artifacts under `openspec/` (spec sync + folder move). It touched no test code, no production code, and made no git commit (orchestrator commits after this report). The change itself was the exactly 3 authorized source files: `UserRepository.cs:42` (+1 line OrderBy), `WebAppFixture.cs` (reset reworked to data-only), `DbTestHelpers.cs` (+1 new helper method). **Zero existing E2E tests touched** (R3 guard: `UsersListTests.List_includeInactive_true_includes_inactive_user` byte-identical to HEAD).

## Change Summary

**Source**: follow-up from `2026-08-08-e2e-stage-1-b1-reseller-clock` archive — the pre-existing UsersList flake it documented as separate work (`319/320` full-suite failure, green in isolation, DB pollution).

**Root cause**: `UserRepository.cs:42` applied `.Take(1000)` with no `OrderBy` — with the never-reset shared `smca_test` DB at 1088 users (> 1000 cap), which rows land in the 1000-row window was heap-order luck. Transient rows added before the test ran shifted the heap and pushed the freshly seeded `inactive-{guid}` row out of the window.

**Fix (atomic R1+R2 pair)**: deterministic `OrderBy(u => u.Id)` before `.Take(1000)` on the super-admin list query (stable, PK-indexed, zero-tie column — design decision, rejected `CreatedDate` microsecond ties and collation-dependent `Login`), PLUS a per-run data-only DB reset in `WebAppFixture.InitializeAsync` via the new `DbTestHelpers.ResetDataAsync` helper (FK-safe `ExecuteDeleteAsync` order, preserves migration seed rows: DefaultTenant, admin user + SuperAdmin role, Role/Feature/Module/StorePaymentStatus/SystemConfiguration).

**Authorized deviation (user-approved 2026-08-08, recorded, not drift)**: design.md specified `ClearAllPools()` + `EnsureDeletedAsync()` + re-`MigrateAsync()`; that DROP mechanism was BLOCKED — `EnsureDeletedAsync` emitted `DROP DATABASE smca_test WITH (FORCE);`, a syntax error on the local PostgreSQL **10.3** (EF Core 8 Npgsql always emits `WITH (FORCE)`, requires PG 13+). The user rejected dropping ANY database and approved the data-only `ResetDataAsync` mechanism instead. No `DROP DATABASE`, no `EnsureDeletedAsync`, no `ClearAllPools` anywhere in the final diff.

## Capabilities

**New Capabilities**: `deterministic-user-list-ordering` (delta spec, 3 ADDED Requirements / 7 scenarios — R1 deterministic ordering before Take(1000), R2 per-run DB reset, R3 guard: flaky test untouched and green).
**Modified Capabilities: None. Removed Capabilities: None.**

Cross-referenced canonical specs stay **unchanged** (explicitly declared in the delta): `openspec/specs/repository/spec.md` RR2 (`.Take(1000)` cap — cap, filters, includes, `IgnoreQueryFilters()` semantics intact) and `openspec/specs/users-e2e/spec.md` R1 (List Users scenarios). No existing requirement was modified or removed by this change.

## Spec Sync (openspec) — PERFORMED (new capability)

`openspec/specs/deterministic-user-list-ordering/spec.md` **did not exist** before this change (confirmed by directory scan; no prior capability spec). Per OpenSpec convention and the skill's "If Main Spec Does NOT Exist" rule — the delta spec IS the full spec — copied **verbatim** (byte-identical hash verified at archive time) to:

| Domain | Action | Details |
|--------|--------|---------|
| deterministic-user-list-ordering | Created | 3 requirements / 7 scenarios copied verbatim (new capability, no prior spec) |

No MODIFIED/REMOVED merge was required anywhere; no other canonical spec was touched.

## Status

**ARCHIVED** — SDD cycle complete.

- Proposal — ✅.
- Spec delta — ✅ `deterministic-user-list-ordering` (3 ADDED / 7 scenarios).
- Implementation — ✅ exactly 3 authorized files (2 modified + 1 new helper method), +67/−2.
- Verification — ✅ PASS (validated; full solution green).
- Archive — ✅ this report.

## Evidence (at close time)

Per the orchestrator's final-state handoff (most recent account of the change, highest rank) and the persisted `verify-report` (Engram #674), which outrank intermediate snapshots:

| Evidence | Result |
|----------|--------|
| Verify validation | `gentle-ai sdd-verify-validate --requirements 3 --scenarios 7` → valid: true, verdict: pass, blockers 0 |
| Source changes | Exactly 3 files: `UserRepository.cs:42` `OrderBy(u => u.Id)` before `Take(1000)`; `WebAppFixture.cs` data-only reset (`MigrateAsync` + `DbTestHelpers.ResetDataAsync`, NO DROP — user-approved mechanism change 2026-08-08); `DbTestHelpers.cs` new `ResetDataAsync` helper. Verified live at archive time: `git diff --name-only` = exactly those 3 files, working tree clean otherwise (`UsersListTests.cs` untouched) |
| Focused test | `--filter "FullyQualifiedName~List_includeInactive_true_includes_inactive_user"` → 1/1 PASS, exit 0, **0** "row limiting without OrderBy" warnings on the in-scope `:42` query (spec R1 scenario 3) |
| Full E2E suite | **320/320 PASS**, exit 0 — the previously flaking 320th test green in full-suite context (was 319/320; flake GONE) |
| Full solution | Domain.UnitTests **22/22** ✅, Application.Tests **330/330** ✅, SMCA.WebApi.E2ETests **320/320** ✅ — all exit 0 |
| Live DB state (R2) | `SELECT count(*)` on `smca_test` after the runs: **"User" = 15** (was **1088** pre-change, > cap), Tenant = 2 (DefaultTenant + 1 run leak), Store = 10, UserRole = 10 — table far under the Take(1000) cap, reset works, no accumulation across runs |
| Scope proof | `git diff --stat` = 3 files, 67 insertions, 2 deletions; no test file in diff; no `DROP\|EnsureDeleted\|ClearAllPools` matches; `UserRepository.cs:33/:53` untouched (out of scope) |
| Build | exit 0, 0 errors (8 pre-existing NU1902/NU1903 package-vulnerability warnings, unchanged) |
| Coverage | Not available for E2E harness (config `coverage_threshold: 0`) — informational, never blocking |

## Out-of-Scope Residual Warnings — Follow-up Items (NOT fixed here)

Each requires its **own separate user authorization** before any change (out of scope per the locked user scope and the spec's "Explicitly Out of Scope" section). These are the pre-existing EF "row limiting operator without OrderBy" warnings — 6 occurrences in full-suite output, all attributable to unordered `Take(1000)` queries outside this change's scope. They are the same latent fragility class this change fixed for the `:42` super-admin path:

1. `backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs:33` — store-user / owner-admin list path, unordered `Take(1000)`.
2. `backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs:53` — same, second list path.
3. `backend/src/Infrastructure/Persistence/Repositories/OwnerRepository.cs:27` — owners list, unordered `Take(1000)`.
4. `backend/src/Infrastructure/Persistence/Repositories/OwnerRepository.cs:79` — second owners list path.

Verified by a full codebase `Take(` audit in verify: only those 4 sites plus the now-fixed `:42` exist. Pre-existing, NOT caused by this change, informational only — per CLAUDE.md, a failing/warning state is information, not an obstacle. **Do not chase within a future cycle without explicit authorization.**

## Review Gate Disposition

No structured status with `reviewGate` was supplied in the orchestrator launch prompt; no review artifacts exist for this change (no `reviews/` dir in the change folder, no review transaction/ledger/receipt/gate-context topics in Engram). No review governs this change → gate disposition **`disabled/unmanaged`**: there is no review policy or receipt to validate, consistent with every prior archive in this repository (cf. `2026-08-07-e2e-stage-1-s1-01-backend` and `2026-08-08-e2e-stage-1-b1-reseller-clock`).

## Task Completion Gate

No exceptional reconciliation was required: the persisted `tasks.md` had **zero unchecked implementation tasks** at archive time (1.1, 1.2, 2.1, 2.2, 2.3 all `[x]` — verified programmatically in the archived copy; no `- [ ]` lines). The archived audit trail contains no stale unchecked tasks for completed work. Archive is NOT marked intentional-with-warnings for task reconciliation (clean gate); the only caveat carried is the documented user-approved DROP→data-only mechanism deviation, which is a recorded implementation decision, not a task state issue.

## Traceability

- Engram `sdd/e2e-stage-1-userslist-flake/explore` — observation **#668**
- Engram `sdd/e2e-stage-1-userslist-flake/proposal` — observation **#669**
- Engram `sdd/e2e-stage-1-userslist-flake/spec` (delta `deterministic-user-list-ordering`) — observation **#670**
- Engram `sdd/e2e-stage-1-userslist-flake/design` — observation **#671**
- Engram `sdd/e2e-stage-1-userslist-flake/tasks` — observation **#672**
- Engram `sdd/e2e-stage-1-userslist-flake/apply-progress` — observation **#673**
- Engram `sdd/e2e-stage-1-userslist-flake/verify-report` — observation **#674**
- Engram `sdd/e2e-stage-1-userslist-flake/archive-report` — this report (saved at archive time)
- Filesystem archive: `openspec/changes/archive/2026-08-08-e2e-stage-1-userslist-flake/` (exploration, explore, proposal, specs/deterministic-user-list-ordering, design, tasks, apply-progress, verify-report, archive-report)
- Canonical spec created: `openspec/specs/deterministic-user-list-ordering/spec.md` (verbatim copy, byte-identical to the archived delta)

## Final State Summary

Change **COMPLETE** at close time: UsersList flake eliminated — `UserRepository.cs:42` carries `OrderBy(u => u.Id)` before `.Take(1000)` (spec R1), `WebAppFixture.InitializeAsync` runs a data-only per-run reset via the new `DbTestHelpers.ResetDataAsync` (spec R2, user-approved deviation from the PG-10.3-blocked DROP mechanism), and the flaky test `List_includeInactive_true_includes_inactive_user` is untouched and green in isolation AND full suite (spec R3). Verify **PASS** on real PostgreSQL: focused 1/1 exit 0 with zero in-scope warnings; full E2E 320/320 (was 319/320); full solution Domain 22/22, Application.Tests 330/330, E2E 320/320; live `smca_test` "User" count 1088 → 15. Residual out-of-scope unordered-`Take(1000)` warnings (UserRepository.cs:33/:53, OwnerRepository.cs:27/:79) documented as follow-up items requiring separate authorization. SDD cycle closed.
