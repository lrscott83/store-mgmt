# Archive Report: b3-login-roundtrip — Truthful B-3 Plan + Pin Residual StoreUser Login Branches

**Change**: `b3-login-roundtrip`
**Archived**: 2026-08-13
**Branch**: `feat/e2e-b3-login-roundtrip`
**Artifact store**: hybrid (openspec filesystem + Engram)
**Archived to**: `openspec/changes/archive/2026-08-13-b3-login-roundtrip/`
**Archive mode**: normal (no partial archive; one documented Engram snapshot reconciliation — see Final State → Tasks)

## Summary

Closed: B-3 (StoreUser/ReSeller real-login roundtrips) was already DELIVERED and verified by the archived change `e2e-b3-auth-login-roundtrip` (2026-08-09, PASS); `docs/testing/e2e-stage-1/plan-backend.md` B-3 table was STALE. This change (1) corrected the plan doc to state DELIVERED with a residual note, and (2) pinned the two remaining HTTP-coverable `HasActiveStore` StoreUser branches with 2 additive `[Fact]`s appended to `AuthLoginStoreUserTests.cs` (3 → 5): branch 1 (role-only StoreUser, no `StoreUser` row → 403 `Store.Inactive`, blind-zone pin mirroring ReSeller D6) and branch 2 (`StoreUser.IsActive == false` → 403 `Store.Inactive`, NoTracking-safe `ExecuteUpdateAsync`). Purely additive: zero production code, zero existing-E2E-test edits, zero helper modifications (CLAUDE.md project rules carried verbatim).

## Requirements Delivered (final state, all COMPLIANT)

| Req | Delta action | Final rule | Evidence |
|-----|--------------|------------|----------|
| R1 | ADDED (`auth-login-e2e`) | `plan-backend.md` B-3 table states StoreUser and ReSeller DELIVERED (`e2e-b3-auth-login-roundtrip`, 2026-08-09) with a note that StoreUser branches 1/2 are now pinned by this change; doc-only | `a3ee3748` (+5/-7): Estado actual fixed, table rows → DELIVERED, residual note, autorización note kept verbatim |
| R2 | MODIFIED (`auth-login-e2e`, "E2E coverage — StoreUser login roundtrip") | StoreUser login coverage extended: role-only StoreUser (no `StoreUser` row) and `StoreUser.IsActive == false` MUST return HTTP 403, `Succeeded == false`, exactly one error `Code == "Store.Inactive"` (never `Auth.AccountInactive`) | `553ccc0e` (+75, 2 additive `[Fact]`s): `StoreUser_with_only_role_and_no_store_row_is_rejected_with_403`, `StoreUser_with_inactive_row_is_rejected_with_403`; log pins `role3-…: no active store` (b1), `suser-…: no active store` (b2) |

## Final State (close-of-cycle, per Final-State Authority)

- **Apply**: 2 commits on `feat/e2e-b3-login-roundtrip` — `553ccc0e` `test(e2e): pin StoreUser login branches 1-2` (+75 insertions, 0 deletions, test file only) and `a3ee3748` `docs(testing): mark B-3 delivered in plan-backend` (+5/-7, doc only). `48276df5` (`docs(testing): frame S3-03/H-11 tenant boundary as business rule`) is a SEPARATE concern on the same branch — not part of this change and NOT included in this archive's commit.
- **Verify**: PASS — **2/2 requirements, 7/7 scenarios, 0 blockers**. Evidence revision `sha256:08ff0ff89487ce6b428e9c9b1438b6e88e9e1c4588fdd20493b5923456a86608` (per `verify-report.md` and Engram #782).
- **Test evidence (final)**: `AuthLoginStoreUserTests` **5/5** (3 existing + 2 new), `AuthLoginReSellerTests` **3/3** (D6-mirror regression), full backend E2E suite **350/350**, `Application.Tests` **337/337**, `dotnet build backend/src/SMCA.sln` clean (exit 0) — all against real PostgreSQL `smca_test`.
- **Findings**: CRITICAL 0. WARNING 0. SUGGESTION 0.
- **Tasks**: all tasks complete; archived `tasks.md` has ZERO unchecked implementation/verification tasks. **Reconciliation note**: the Engram `sdd/b3-login-roundtrip/tasks` observation (#780) is the tasks-phase snapshot (persisted 17:58, pre-apply) and still shows unchecked boxes; the apply phase updated the filesystem `tasks.md` (all `[x]`) but did not upsert the Engram topic. Final completion is proven by the archived filesystem `tasks.md` (byte-verified, all checked), apply-progress #781 ("Status: APPLIED"), and verify-report #782 (completeness table: "Tasks present — all checked [x]"). The archived audit trail contains no stale unchecked tasks; #780 is historical intermediate state, not the terminal record.
- **Design decisions**: all followed — D1 append to existing file (not new file), D2 branch-1 seed via `DbTestHelpers.SeedUserWithRoleAsync((int)RoleType.StoreUser)` (ReSeller D6 mirror), D3 branch-2 deactivation via inline NoTracking-safe `ExecuteUpdateAsync` + `IgnoreQueryFilters` (avoids the `ApplicationDbContext.cs:45` NoTracking trap; mirrors `DeactivateOwnerByUserIdAsync`), D4 snake_case naming with branch-citing doc comments, D5 doc correction scope (table + Estado actual + residual note, autorización kept verbatim).
- **Out of scope (documented)**: production code; existing E2E test edits; helper modifications; ReSeller work (persona complete); `HasActiveStore` branches 3/5 (Store null / Owner null — DB-impossible via FK); rate-limit 429 and refresh-token lifecycle assertions.

## Spec Sync (delta → main spec)

`auth-login-e2e` — delta was merged into `openspec/specs/auth-login-e2e/spec.md` by the spec phase; archive verified the merge is complete and correct (no re-merge performed, nothing missing):

1. **1 ADDED requirement** — "E2E plan doc — B-3 states DELIVERED" (1 scenario) appended verbatim with delivery note.
2. **1 MODIFIED requirement** — "E2E coverage — StoreUser login roundtrip": body extended with branch 1 / branch 2 clauses; 2 new scenarios added (`Role-only StoreUser … (branch 1)`, `StoreUser with inactive row … (branch 2)`); all 3 pre-existing scenarios (active store, deactivated store, deactivated owner) and the cleanup scenario preserved untouched; delivery note added.
3. **Provenance updated** — `Origin` header now includes `b3-login-roundtrip`; In Scope bullet extended (2 additive facts, total 5).
4. No REMOVED / RENAMED requirement blocks in the delta — no deletions performed, no destructive merge warning needed.

## Archive Move

Change folder moved to `openspec/changes/archive/2026-08-13-b3-login-roundtrip/` via shell `Move-Item` (folder untracked — `git ls-files` empty, `git mv` not applicable; same as the login-wrapped-dek and s2-03 precedents). Mandatory `diff -r` readback (pre-move recursive snapshot vs archived tree, using Git-for-Windows `C:\Program Files\Git\usr\bin\diff.exe`): **empty output, exit 0 — byte-identical**. All 7 artifacts archived: `exploration.md`, `proposal.md`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`, `specs/auth-login-e2e/spec.md` (+ this additive `archive-report.md`). Active `openspec/changes/` no longer lists the change.

## Config

`openspec/config.yaml` was NOT modified. The login-wrapped-dek close (`1504ddd0`) already updated the context block with the project-mandated rules (E2E untouchable, backend additive-only) and the Playwright E2E testing commands; the b3 close introduces no new project context, stack facts, or commands, so the config is left untouched.

## Engram Lineage (observation IDs)

Prior change observations read/verified this archive run (via Engram search + full retrieval): explore **#776**, proposal **#777**, spec **#778**, design **#779**, tasks **#780** (pre-apply snapshot — see reconciliation note above), apply-progress **#781**, verify-report **#782**. This archive report persisted as topic `sdd/b3-login-roundtrip/archive-report` (type architecture, capture_prompt false).

## Delivery

Commit-only on `feat/e2e-b3-login-roundtrip` per session preflight — NO PR, NO push. Final archive commit stages ONLY openspec planning/archive artifacts: `openspec/specs/auth-login-e2e/spec.md` (synced main spec) and the archived change folder. Source/test files are NOT staged (already committed in `553ccc0e` and `a3ee3748`); the `48276df5` docs change is owned by a separate concern and is not staged.
