# Archive Report: 2026-07-31-activate-user-endpoint-fixes

**Archived**: 2026-07-31
**Status**: ✅ Complete
**Mode**: HYBRID (engram + openspec)
**Verdict**: ✅ PASS (verified: `UsersActivateTests` 4/4 GREEN, regression 32/32 GREEN, no build/test runs in this phase per constraint)

---

## Executive Summary

Hardened `POST /api/v1/users/activate` (`UsersController.ActivateUserAsync` / `ActivateUserCommandHandler`) across 4 files (handler, validator, controller, E2E tests) — a byte-level mirror of the archived `delete-user-endpoint-fixes` flow plus a namespace move. Fixed 6 review findings: (F1) `IsActive` flag honored — hardcoded `true` replaced with `user.IsActive = request.IsActive` (activate AND deactivate per body, zero-risk contract change — frontend never sends `false`); (F2) masked auth failure — 403 `DontHavePermission` guard evaluated FIRST in `Handle` (feature-granted StoreUser passes the `[HasPermission(UsersAdmin)]` filter but MUST be blocked handler-level; previously surfaced as 400 `UserNotFound`); (F3) unreachable 404 — validator `MustAsync(UserExists)` removed (double round-trip + 400 pre-empt), handler fetches via `GetByIdAsync` (NO CancellationToken — no overload at `IGenericRepository.cs:22`) and throws real 404 `UserNotFound`; (F4) validator trimmed to structural-only (21-line mirror of `DeleteUserCommandValidator`, `_localizer` + usings retained); (F5) Swagger `[ProducesResponseType]` 400/401/403/404 added after the existing 200 (additive — `UpdatedAsync`/`DeleteUserAsync` metadata untouched); (F6) namespace moved `Application.Features.Management.Users.Commands.ActivateUser` → `Application.Features.UserManagement.Users.Commands.ActivateUser` (exactly 3 refs: 2 namespace decls + 1 controller using; grep old → 0 hits; `CreateStoreUser` folder untouched). `UpdateAsync` KEPT before `SaveChangesAsync(cancellationToken)` — required under NoTracking (`ApplicationDbContext.cs:45`) or persistence silently no-ops. 4 E2E tests (2 renamed/replaced RED→GREEN, 2 new) prove each fix; **4/4 GREEN** + regression **32/32 GREEN** (orchestrator, task 4.1). Archive-time tasks (5.1 main-spec sync, 5.2 plan doc row 19 + detail section, 5.3 ActivateStore debt annotation) executed HERE.

**User decision C (scope)**: the proposal's "Bonus" item — fixing `ActivateStoreCommand`'s guard + validator — was **OUT OF SCOPE**. `ActivateStoreCommand.cs:46-47` (`UserNotFound` + `BadRequest` guard) and `ActivateStoreCommandValidator.cs:20,24-27` (`MustAsync(StoreExists)` double-query) remain untouched; the debt is annotated in `docs/plans/endpoints-e2e-coverage.md` under a new "## Follow-up Debt" section (dead code today — zero callers; candidates for dead-code removal (option B) or fix if ever wired up).

**No deviations required at archive**: unlike delete-user (Batch B culture-coupling regression), the E2E assert style (status code + envelope structure only, zero localized `Description` asserts) was already correct from the start — verified by grep (0 hits) and the 4/4 GREEN run. The delta spec text matched the verified reality (`GetByIdAsync` no token; `UpdateAsync` kept) — no text corrections needed.

**Verification**: 4/4 E2E GREEN (orchestrator, task 4.1), regression 32/32 GREEN, static verify all 4 deltas satisfied (22/22 scenarios — 17 runtime-proven, 5 static-proven), no git commits (working-tree change only, per user constraint).

---

## Specs Synced to Main

| Domain | Action | Details |
|--------|--------|---------|
| `command-handler` | Updated (appended delta) | CH-A1 (403 auth guard FIRST, real HTTP 403 `DontHavePermission`), CH-A2 (`IsActive` honored — hardcoded `true` replaced), CH-A3 (404 via `GetByIdAsync` — NO token overload), CH-A4 (`UpdateAsync` REQUIRED under NoTracking + token to `SaveChangesAsync` only) |
| `validation` | Updated (appended delta) | VL-A1 REMOVED (`MustAsync(UserExists)` + repo dep + ctor param + using), VL-A2 ADDED (structural-only, `_localizer` + usings retained), VL-A3 ADDED (404 reachability — handler sole DB responsibility) |
| `api-controller` | Updated (appended delta) | UC-A1 (ProducesResponseType 400/401/403/404 after existing 200; `[FromBody]` + XML doc kept; no-clobber `UpdatedAsync`/`DeleteUserAsync`), UC-A2 (namespace move to `UserManagement.Users.Commands.ActivateUser`, 3/3 refs) |
| `users-e2e` | Updated (R5 + Known-Bugs aligned at archive + delta appended) | R5: known-bug row flipped to `200, IsActive=false` (E2E-A1), `Non-existent id → 404` row ADDED (E2E-A3), StoreUser row clarified (feature-granted → handler-level 403, E2E-A4), activate-true row kept (E2E-A2). Line 20 Out-of-Scope note amended (2 of 3 known bugs FIXED; StoreName Guid remains documented). Known Bugs table row "Activate ignores IsActive=false" REMOVED (StoreName Guid row stays). Delta E2E-A1..A5 appended |

> Per repo convention (delete-user precedent): the per-domain main specs are delta-accumulation files; merges applied on disk (R5 alignment + append-only delta sections) but left **uncommitted** — no git operations performed in this phase.

---

## Deviations / Decisions Handled at Archive

1. **Plan doc row 19 status → `✅ Archived` (not `🔶 Applied (pending archive)`)**: the change is being archived IN THIS PHASE, so "pending archive" would be factually wrong. Mirrored rows 51-54 (`✅ Done | ✅ Archived`) — the users endpoints that went through this exact flow — and delete-user's own archive precedent (its report deviation #4 aligned row 54 `Applied` → `Archived` at archive time). Row 19's `🔶`/`Applied` intermediate state never landed in the plan doc.
2. **Plan doc detail section for activate updated to `✅ Done`** with the 6-issue summary + 4 E2E tests (delete-user's detail section was left `⬜ Pending` at ITS archive; this change's orchestrator instruction explicitly required the detail update, so it was done here).
3. **DAG state observation `sdd/activate-user-endpoint-fixes/state` did NOT exist in engram** (orchestrator expected to update an existing one). Created it with the canonical topic key, mirroring the delete-user state format (#532) exactly.
4. **No E2E message-assert culture issue this time**: assert style was correct from the start (status + envelope structure only) — the delete-user Batch B gotcha (`e2e/culture-localized-asserts`) was already applied.

---

## Artifact Observation IDs (Engram)

| Artifact | Topic Key | Engram ID |
|----------|-----------|-----------|
| Exploration | `sdd/activate-user-endpoint-fixes/explore` | #534 |
| Proposal | `sdd/activate-user-endpoint-fixes/proposal` | #535 |
| Spec | `sdd/activate-user-endpoint-fixes/spec` | #537 |
| Design | `sdd/activate-user-endpoint-fixes/design` | #538 |
| Tasks | `sdd/activate-user-endpoint-fixes/tasks` | #541 |
| Apply Progress | `sdd/activate-user-endpoint-fixes/apply-progress` | #542 |
| Verify Report | `sdd/activate-user-endpoint-fixes/verify-report` | #543 |
| Discovery (namespace blast radius) | (manual — `ActivateUser namespace move blast radius verified`) | #539 |
| **Archive Report** | **`sdd/activate-user-endpoint-fixes/archive-report`** | (saved this phase) |
| **DAG State** | **`sdd/activate-user-endpoint-fixes/state`** | (created this phase) |
| **Debt hand-off** | **`store-management/activatestore-debt`** | (saved this phase) |

---

## Verification Results

- **Tasks**: 12/12 complete (1.1, 1.2, 1.3, 2.1, 3.1–3.4, 4.1, 5.1, 5.2, 5.3); Phase 5 archive flags (5.1, 5.2, 5.3) executed HERE (this archive)
- **Build**: NOT run in this phase — per constraint (no builds); `dotnet test` compile in task 4.1 implicitly proved the build
- **Tests (orchestrator, task 4.1)**: ✅ `UsersActivateTests` **4/4 GREEN** (`Passed! - Failed: 0, Passed: 4, Skipped: 0, Total: 4`); regression `UsersDeleteTests | UsersUpdateTests | UsersListTests` **32/32 GREEN**
- **Spec compliance**: all 4 delta specs satisfied (22/22 scenarios — 17 runtime-proven via E2E, 5 static-proven per house precedent)

## Commits

None — per user constraint: **NO GIT COMMITS, NO git add, NO git mutations**. Working tree only (archive files + merged main specs + plan doc updates).

## Archive Contents

```
openspec/changes/archive/2026-07-31-activate-user-endpoint-fixes/
├── proposal.md
├── specs/
│   ├── api-controller/spec.md
│   ├── command-handler/spec.md
│   ├── users-e2e/spec.md
│   └── validation/spec.md
├── design.md
├── exploration.md
├── tasks.md
├── apply-progress.md
├── verify-report.md
└── archive-report.md
```

Active `openspec/changes/pending/2026-07-31-activate-user-endpoint-fixes/` no longer exists (moved to archive).

## Source of Truth Updated

The following main specs now reflect the new behavior:

- `openspec/specs/users-e2e/spec.md` — R5 aligned (known-bug row flipped, non-existent→404 row added, StoreUser row clarified as handler-level), line 20 Out-of-Scope amended, Known Bugs row removed (StoreName row stays) + appended E2E-A1..A5 delta (uncommitted)
- `openspec/specs/command-handler/spec.md` — appended CH-A1..CH-A4 delta (uncommitted)
- `openspec/specs/validation/spec.md` — appended VL-A1 removed + VL-A2/VL-A3 delta (uncommitted)
- `openspec/specs/api-controller/spec.md` — appended UC-A1..UC-A2 delta (uncommitted)
- `docs/plans/endpoints-e2e-coverage.md` — row 19 `⬜ Pending` → `✅ Done | ✅ Archived | activate-user-endpoint-fixes`; activate detail section `Review` → ✅ Done (6-issue summary, 4 E2E tests); new `## Follow-up Debt` section (ActivateStore annotation, decision C)

## Risks

- **Dirty working tree**: pre-existing uncommitted deltas (get-users-all, set-my-store, approve-store, update-store, get-user-by-id, update-user, delete-user batches + frontend/middleware/Program.cs) remain — orchestrator handles separately. Merged main specs + plan doc edits are on disk, uncommitted by design (append-only precedent).
- **ActivateStore debt (dead code)**: `ActivateStoreCommand.cs:46-47` guard (`UserNotFound` + `BadRequest`) + validator `MustAsync(StoreExists)` double-query + missing handler null-check (`:49-50`). Zero callers today. If ever wired up WITHOUT fixing: 400-masked 403 (same bug just fixed on Users) and — if the validator rule is dropped without adding a null-check — an NRE on the store fetch. Annotated in plan doc `## Follow-up Debt`; candidate for dead-code removal (option B). See engram `store-management/activatestore-debt`.
- **NoTracking constraint is project-wide**: any handler that mutates a fetched entity MUST call `UpdateAsync` before `SaveChangesAsync` — see `architecture/dbcontext-notracking` (#518, update-user archive).
- **E2E culture gotcha is project-wide**: never assert localized `Description` text in E2E tests — assert status code + envelope structure. Recorded at `e2e/culture-localized-asserts`.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Ready for the next change.
