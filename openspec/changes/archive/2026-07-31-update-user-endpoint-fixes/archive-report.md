# Archive Report: 2026-07-31-update-user-endpoint-fixes

**Archived**: 2026-07-31
**Status**: ✅ Complete
**Mode**: HYBRID (engram + openspec)
**Verdict**: ✅ PASS (verified: Update suite 13/13 GREEN, regression 26/26 GREEN, build 0 errors)

---

## Executive Summary

Hardened `PUT /api/v1/users/{id}` (`UsersController.UpdatedAsync` / `UpdateUserCommandHandler`) across 4 source files + 1 E2E test file: closed a REAL IDOR (StoreUser WITH the Profile feature passed the filter and could edit ANY user — handler now enforces ownership self-or-admin, envelope-404), replaced the validator's double round-trip `GetByIdAsync` with the existing lightweight `ExistsAsync(userId, ct)` (renamed misleading `tenantId` param, token forwarded), added tri-state partial-update semantics for CellPhone/Email (null=keep / ""=clear / value=assign — no more silent nulling on `{FullName}`-only bodies), added the null-race guard (envelope-404, never 500), gated `IsActive` behind `bool?` + admin-only HasValue (kills the Angular profile self-deactivate bug), and completed Swagger metadata (`[ProducesResponseType]` 400/401/403/404 + `[FromRoute] id`). 7 new E2E tests (6 matrix + 1 verify-closure) prove each fix RED→GREEN; 13/13 Update suite + 26/26 regression GREEN on x2 stable runs, build 0 errors.

**Key deviation resolved at archive (D10/CH-U6)**: design D10 said "remove UpdateAsync" (premise: FindAsync tracks). FALSE for this codebase — `ApplicationDbContext.cs:45` sets `QueryTrackingBehavior.NoTracking`, so the fetched entity is UNTRACKED; without `UpdateAsync` (the only attach mechanism, `Entry.State=Modified`), `SaveChangesAsync` returns 0 and nothing persists (measured in Batch B: envelope `Succeeded=True, Data=False`). Implementation correctly KEEPS `UpdateAsync`; CH-U6 spec rewritten at archive to reflect "UpdateAsync is REQUIRED under NoTracking". Intent (tri-state partial updates, no data destruction) preserved and proven by E2E.

**Verification**: 13/13 E2E GREEN (x2 stable runs), regression 26/26 GREEN, build 0 errors, no git commits (working-tree change only, per user constraint).

---

## Specs Synced to Main

| Domain | Action | Details |
|--------|--------|---------|
| `api-controller` | Updated (appended delta) | UC-U1 (ProducesResponseType 400/401/403/404) + UC-U2 ([FromRoute] id) + UC-U3 (200 + envelope contract, ActionCode 404) |
| `command-handler` | Updated (appended delta, **CH-U6 REWRITTEN**) | CH-U1 (IDOR ownership guard), CH-U2 (tri-state), CH-U3 (race guard), CH-U4 (IsActive admin-gated), CH-U5 (token), CH-U6 (**UpdateAsync REQUIRED — NoTracking context**; no false tracking premise) |
| `validation` | Updated (appended delta) | VL-U1 (ExistsAsync(userId, ct), tenantId→userId), VL-U2 (conditional Email format), VL-U3 (no IsActive rule) |
| `users-e2e` | Updated (R3 rows aligned + delta appended) | R3 "Non-existent id" 404→**400 (validator)**; IDOR row added; E2E-U1..U6 (7 tests incl. Batch D closure test); E2E-U7 marked resolved |
| `repository` | Updated (appended delta) | RR-U1 (`ExistsAsync(Guid id, CancellationToken cancellationToken = default)` documented; zero new methods) |

> Per repo convention (GET precedent): the per-domain main specs are delta-accumulation files carrying pre-existing uncommitted deltas from earlier batches; the merges above were applied on disk (append-only sections) but left **uncommitted** — no git operations performed in this phase.

---

## Deviations Handled at Archive

1. **CH-U6 / D10 (verify WARNING 2 — MUST NOT merge literal "remove UpdateAsync")**: The delta spec CH-U6 said "MUST remove UpdateAsync"; implementation KEEPS it with justification (`ApplicationDbContext.cs:45` NoTracking → FindAsync does NOT track → without `UpdateAsync` `SaveChangesAsync` returns 0, nothing persists — measured in Batch B). Main spec rewritten: "handler persists via UpdateAsync + SaveChangesAsync; UpdateAsync is REQUIRED because the DbContext is NoTracking" + rationale comment requirement. Verified: merged text contains NO false premise about tracking.
2. **users-e2e R3 alignment (tasks 4.1 / E2E-U7)**: R3 row "Non-existent id | SuperAdmin | 404" → **400 (validator)** (matches contract `ValidationException` → 400 and existing test `Update_nonexistent_id_returns_400`); added IDOR row "Update other user as StoreUser+Profile → 200, envelope ActionCode 404". "Update as StoreUser → 403" row clarified as filter-level (no Profile feature) — unchanged. E2E-U7 marked RESOLVED in merged spec.
3. **RR-U1 (tasks 4.2)**: main repository spec now documents `ExistsAsync(Guid id, CancellationToken cancellationToken = default)` (token param + `IgnoreQueryFilters().AnyAsync` forwarding, `UserRepository.cs:99-102`); zero new repo methods.
4. **E2E-U4(a) (verify WARNING 1)**: closed in Batch D (apply-progress) via `Update_as_store_user_with_profile_keeps_own_is_active` — the non-admin IsActive-ignore branch now has runtime coverage; merged users-e2e delta documents the 7th test with its scenario.

---

## Artifact Observation IDs (Engram)

| Artifact | Topic Key | Engram ID |
|----------|-----------|-----------|
| Proposal | `sdd/update-user-endpoint-fixes/proposal` | #513 |
| Spec | `sdd/update-user-endpoint-fixes/spec` | #514 |
| Design | `sdd/update-user-endpoint-fixes/design` | #515 |
| Tasks | `sdd/update-user-endpoint-fixes/tasks` | #516 |
| Apply Progress | `sdd/update-user-endpoint-fixes/apply-progress` | #517 |
| Verify Report | `sdd/update-user-endpoint-fixes/verify-report` | #519 |
| Discovery (NoTracking gotcha) | `architecture/dbcontext-notracking` | #518 |
| **Archive Report** | **`sdd/update-user-endpoint-fixes/archive-report`** | **#520** |

---

## Verification Results

- **Tasks**: 11/11 complete (1.1–1.6, 2.1–2.2, 3.1–3.3); Phase 4 archive flags (4.1, 4.2) executed HERE (this archive)
- **Build**: ✅ 0 errors (`dotnet build backend/src/SMCA.WebApi/SMCA.WebApi.csproj`; E2E project also 0 errors)
- **Tests (verify re-run)**: ✅ Update suite 12/12 GREEN (570 ms) → **13/13 GREEN after Batch D closure test** (x2 stable runs: 554 ms, 521 ms); regression 26/26 GREEN (2 s)
- **Spec compliance**: 25/28 scenarios fully compliant + GREEN; 2 PARTIAL (race 3c / value-assign 2c — static-only, inherently hard to E2E); 1 UNTESTED row (CH-U4 4d / E2E-U4 4a) → **CLOSED by Batch D test**; CH-U6 DEVIATION → **resolved by spec rewrite at archive**

## Commits

None — per user constraint: **NO GIT COMMITS, NO git add, NO git mutations**. Working tree only (unrelated uncommitted changes from prior batches untouched).

## Archive Contents

```
openspec/changes/archive/2026-07-31-update-user-endpoint-fixes/
├── proposal.md
├── specs/
│   ├── api-controller/spec.md
│   ├── command-handler/spec.md
│   ├── repository/spec.md
│   ├── users-e2e/spec.md
│   └── validation/spec.md
├── design.md
├── explore.md
├── tasks.md
├── apply-progress.md
├── verify-report.md
└── archive-report.md
```

Duplicate `openspec/changes/pending/update-user-endpoint-fixes/explore.md` (byte-identical to the canonical explore) **deleted**; empty `pending/` dir removed. Active `openspec/changes/update-user-endpoint-fixes/` no longer exists (moved).

## Source of Truth Updated

The following main specs now reflect the new behavior:

- `openspec/specs/users-e2e/spec.md` — R3 "Non-existent id" aligned 404 → 400 (validator) + IDOR row added + appended E2E-U1..U7 delta (uncommitted)
- `openspec/specs/api-controller/spec.md` — appended UC-U1/UC-U2/UC-U3 delta (uncommitted)
- `openspec/specs/command-handler/spec.md` — appended CH-U1..U5 + CH-U6 REWRITTEN (UpdateAsync REQUIRED under NoTracking) (uncommitted)
- `openspec/specs/validation/spec.md` — appended VL-U1/VL-U2/VL-U3 delta (uncommitted)
- `openspec/specs/repository/spec.md` — appended RR-U1 delta (ExistsAsync token param) (uncommitted)

## Risks

- **Dirty working tree**: pre-existing uncommitted deltas (get-users-all, set-my-store, approve-store, update-store, get-user-by-id batches + frontend/middleware/Program.cs) remain — orchestrator handles separately. Merged main per-domain specs are on disk, uncommitted by design (GET precedent).
- **Docs gap (recommended follow-up)**: `docs/plans/endpoints-e2e-coverage.md` (or equivalent coverage plan) still needs the UsersUpdate row(s) updated for the 7 new tests + R3 IDOR row; a final E2E confirmation run is recommended after any doc edits.
- **NoTracking constraint is project-wide**: any future handler that mutates a fetched entity MUST call `UpdateAsync` before `SaveChangesAsync` — `architecture/dbcontext-notracking` observation (#518) documents the gotcha and the false-positive test pattern.
- **Race guard (CH-U3 3a / UC-U3 3c)** has no automated test — inherently racy; static guard + GET precedent acceptable.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Ready for the next change.
