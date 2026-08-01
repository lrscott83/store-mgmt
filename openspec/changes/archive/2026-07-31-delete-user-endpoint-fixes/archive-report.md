# Archive Report: 2026-07-31-delete-user-endpoint-fixes

**Archived**: 2026-07-31
**Status**: ✅ Complete
**Mode**: HYBRID (engram + openspec)
**Verdict**: ✅ PASS (verified: `UsersDeleteTests` 5/5 GREEN, regression run GREEN, no build/test runs in this phase per constraint)

---

## Executive Summary

Hardened `DELETE /api/v1/users/{id}` (`UsersController.DeleteUserAsync` / `DeleteUserCommandHandler`) across 6 files (handler, validator, controller, `I18n.resx` ×2, E2E tests). Fixed the masked auth failure (handler-level 403 `DontHavePermission` guard — feature-granted StoreUser passes the `[HasPermission]` filter but MUST be blocked, previously surfaced as 400 `UserNotFound`), the double round-trip validator (`MustAsync(UserExists)` removed — existence check is now the handler's sole responsibility, making the real 404 reachable), the self-delete hole (400 `CannotDeleteSelf` guard before any repo call — previously self-delete soft-deactivated with 200), and the typo key `UserNotFoud` → `UserNotFound` in both resx (localizes all 42 existing `_localizer["UserNotFound"]` references that fell back to the literal key). Swagger metadata completed (`[ProducesResponseType]` 400/401/403/404, `[FromRoute] id`, `<param name="id">`). 5 E2E tests (2 new RED→GREEN, 1 renamed+re-asserted RED→GREEN, 2 kept) prove each fix; **5/5 GREEN** on the orchestrator-run 5.1 + regression GREEN. Archive-time alignment (5.2 main users-e2e R4, 5.3 plan doc row 54) completed.

**Key deviation resolved at archive (Batch B)**: E2E message asserts initially asserted localized `Description` values ("Usuario no encontrado" etc.) per delta text; culture-coupling was real (`UseRequestLocalization` default culture does NOT override `CurrentUICulture` — host machine culture drives `I18n.en.resx`) and message-text asserts are NOT the house pattern. Reverted to status-code + envelope-structure asserts (`Succeeded == false`, `Errors.NotBeEmpty()`). Handler behavior was correct in logs; failures were test-side only. Gotcha recorded to engram (`e2e/culture-localized-asserts`).

**Second deviation corrected at archive (CH-D3/CH-D4 text)**: delta spec literally said `GetByIdAsync(request.Id, cancellationToken)` but verification proved `GetByIdAsync` has NO CancellationToken overload (`IGenericRepository.cs:22`, design Decision 1(a)); token flows only to `SaveChangesAsync`. Main spec merged text states the verified reality — intent (real 404, single round-trip, token propagation where signature allows) preserved.

**Verification**: 5/5 E2E GREEN (orchestrator, task 5.1), regression GREEN, static verify all 5 deltas satisfied, no git commits (working-tree change only, per user constraint).

---

## Specs Synced to Main

| Domain | Action | Details |
|--------|--------|---------|
| `command-handler` | Updated (appended delta) | CH-D1 (403 auth guard FIRST, real HTTP 403), CH-D2 (400 self-delete before repo call), CH-D3 (404 via `GetByIdAsync` — NO token overload), CH-D4 (soft-delete + `UpdateAsync` REQUIRED under NoTracking + token to `SaveChangesAsync`) |
| `validation` | Updated (appended delta) | VL-D1 REMOVED (`MustAsync(UserExists)` + repo dep), VL-D2 ADDED (structural only, mirrors `DeactivateStoreCommandValidator`), VL-D3 ADDED (404 reachability — handler sole DB responsibility) |
| `api-controller` | Updated (appended delta) | UC-D1 (ProducesResponseType 400/401/403/404), UC-D2 (`[FromRoute] id`), UC-D3 (`<param name="id">` XML doc) |
| `users-e2e` | Updated (R4 aligned at archive + delta appended) | R4: self-delete row added (SuperAdmin → 400 `CannotDeleteSelf`), StoreUser row clarified (feature-granted → handler-level 403), non-existent row stays 404 (was already correct). E2E-D1 (renamed+re-asserted 404), E2E-D2/D3 (2 new RED→GREEN), E2E-D4 (archive alignment), 2 kept |
| `resources` | **Created (NEW domain)** | RS-1 (`CannotDeleteSelf` both resx, exact values/positions), RS-2 (`UserNotFoud` → `UserNotFound` rename, values unchanged), RS-3 (zero `UserNotFoud` in source; Designer.cs stale property out of scope) |

> Per repo convention (GET/update-user precedent): the per-domain main specs are delta-accumulation files carrying pre-existing uncommitted deltas from earlier batches; the merges above were applied on disk (append-only sections) but left **uncommitted** — no git operations performed in this phase.

---

## Deviations Handled at Archive

1. **E2E message-assert culture coupling (verify Addendum — Batch B)**: delta text said assert `UserNotFound`/`DontHavePermission`/`CannotDeleteSelf` messages; implementation initially asserted localized `Description` values → 3 FAILED on first 5.1 run. Root cause: host machine culture (en) drives `IStringLocalizer` — `DefaultRequestCulture` does NOT override `CurrentUICulture` in the E2E host. Reverted to status-code + envelope-structure asserts (house pattern — no other E2E test asserts localized text). 5.1 re-run → **5/5 GREEN**. Merged E2E-D1 text documents the final assertion form.
2. **CH-D3/CH-D4 token wording (archive text correction)**: delta said `GetByIdAsync(request.Id, cancellationToken)` — FALSE, no token overload exists (`IGenericRepository.cs:22`, D1(a)). Merged main spec states `GetByIdAsync(request.Id)` (no token) + token to `SaveChangesAsync` only. Intent preserved; verified reality recorded (mirrors CH-U6 rewrite precedent).
3. **resx line numbers shifted (246→249, 504→507) vs delta**: trivial — +3-line insert delta from `CannotDeleteSelf`; relative position (between `UserNotCreated`/`UserNotRole`) preserved exactly.
4. **Plan doc row 54 `Applied` → `Archived`** (task 5.3 completion): row 54 was marked `✅ Done | ✅ Applied` pre-archive; aligned to `✅ Done | ✅ Archived` mirroring rows 52-53 (`get-user-by-id`, `update-user`).

---

## Artifact Observation IDs (Engram)

| Artifact | Topic Key | Engram ID |
|----------|-----------|-----------|
| Exploration | `sdd/delete-user-endpoint-fixes/explore` | #523 |
| Proposal | `sdd/delete-user-endpoint-fixes/proposal` | #524 |
| Spec | `sdd/delete-user-endpoint-fixes/spec` | #525 |
| Design | `sdd/delete-user-endpoint-fixes/design` | #526 |
| Tasks | `sdd/delete-user-endpoint-fixes/tasks` | #527 |
| Apply Progress | `sdd/delete-user-endpoint-fixes/apply-progress` | #528 |
| Verify Report | `sdd/delete-user-endpoint-fixes/verify-report` | #529 |
| Discovery (culture gotcha) | `e2e/culture-localized-asserts` | (recorded by verify) |
| **Archive Report** | **`sdd/delete-user-endpoint-fixes/archive-report`** | **#531** |
| **DAG State** | **`sdd/delete-user-endpoint-fixes/state`** | **#532** |

---

## Verification Results

- **Tasks**: 11/11 complete (1.1, 1.2, 2.1, 3.1, 3.2, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3); Phase 5 archive flags (5.2, 5.3) executed HERE (this archive)
- **Build**: NOT run in this phase — per constraint (no builds)
- **Tests (orchestrator, task 5.1)**: ✅ `UsersDeleteTests` **5/5 GREEN** (`Passed! - Failed: 0, Passed: 5, Skipped: 0, Total: 5`); regression `UsersListTests | UsersUpdateTests` GREEN
- **Spec compliance**: all 5 delta specs satisfied statically (verify-report per-spec table); runtime proofs via E2E 5/5

## Commits

None — per user constraint: **NO GIT COMMITS, NO git add, NO git mutations**. Working tree only (archive files + merged main specs + plan doc row).

## Archive Contents

```
openspec/changes/archive/2026-07-31-delete-user-endpoint-fixes/
├── proposal.md
├── specs/
│   ├── api-controller/spec.md
│   ├── command-handler/spec.md
│   ├── resources/spec.md
│   ├── users-e2e/spec.md
│   └── validation/spec.md
├── design.md
├── exploration.md
├── tasks.md
├── apply-progress.md
├── verify-report.md
└── archive-report.md
```

Active `openspec/changes/delete-user-endpoint-fixes/` no longer exists (moved). No stray `pending/` duplicates found (unlike update-user — verified).

## Source of Truth Updated

The following main specs now reflect the new behavior:

- `openspec/specs/users-e2e/spec.md` — R4 aligned (self-delete 400 row + StoreUser handler-level-403 clarification) + appended E2E-D1..D4 delta (uncommitted)
- `openspec/specs/command-handler/spec.md` — appended CH-D1..CH-D4 delta (CH-D3/CH-D4 token wording corrected to verified reality) (uncommitted)
- `openspec/specs/validation/spec.md` — appended VL-D1 removed + VL-D2/VL-D3 delta (uncommitted)
- `openspec/specs/api-controller/spec.md` — appended UC-D1..UC-D3 delta (uncommitted)
- `openspec/specs/resources/spec.md` — **CREATED** (new domain, full spec RS-1..RS-3) (uncommitted)
- `docs/plans/endpoints-e2e-coverage.md` — row 54 `Applied` → `Archived` (task 5.3)

## Risks

- **Dirty working tree**: pre-existing uncommitted deltas (get-users-all, set-my-store, approve-store, update-store, get-user-by-id, update-user batches + frontend/middleware/Program.cs) remain — orchestrator handles separately. Merged main specs + new `resources` spec are on disk, uncommitted by design (append-only precedent).
- **Stale `I18n.Designer.cs`** (`UserNotFoud` property at lines 1218, 1220): compile-safe, zero references, explicitly out of scope per RS-3. Regenerate only if a resource generator is ever added.
- **E2E culture gotcha is project-wide**: never assert localized `Description` text in E2E tests — assert status code + envelope structure (or `ActionCode` on `ApiException`, precedent `ApproveStoreCommand.cs:34-36`). Recorded to engram `e2e/culture-localized-asserts`.
- **NoTracking constraint is project-wide**: any handler that mutates a fetched entity MUST call `UpdateAsync` before `SaveChangesAsync` — see `architecture/dbcontext-notracking` observation (#518, update-user archive).

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Ready for the next change.
