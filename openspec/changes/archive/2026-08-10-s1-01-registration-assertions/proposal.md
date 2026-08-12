# Proposal: s1-01-registration-assertions — Doc-Sync Close (no code)

## Intent

Close the change `s1-01-registration-assertions` as a **doc-sync without code**. The 6 registration
data assertions this change was created to cover are ALREADY implemented, verified, and merged into
`main` — re-creating them on this branch would be duplicate work. The only residual deliverable is
synchronizing the two stale coverage documents with the real state of the codebase.

## Evidence — the work is already in `main`

- Commit `edcf7397` (2026-08-08) created `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterDataAssertionsTests.cs`
  (6 `[Fact]`s, one per plan assertion: SelectedStoreId :121, owner description :138, store
  description/approved :158, all available modules incl. paid H-1 :178, no refresh token :222,
  ReSellerOwner :257). Merged into `main` via `af304402` (2026-08-09).
- The full SDD cycle for that work ran as `e2e-stage-1-s1-01-backend` and is archived at
  `openspec/changes/archive/2026-08-07-e2e-stage-1-s1-01-backend/` (verify PASS 6/6 against real PostgreSQL).
- Explore phase (2026-08-11) re-ran the 6 tests against the live database → **Passed 6 / Failed 0**,
  and confirmed zero drift between production code and the plan's 6 assertions.
- Branch `feat/e2e-s1-01-registration-assertions` is even with `main` (zero diff).

## Backend scope + E2E untouchable rule (NON-NEGOTIABLE)

> "In this backend test-coverage work, the agent may only ADD new E2E tests. If the work would require modifying production source code or existing E2E tests (backend), the agent MUST stop and notify the user for review and approval before touching anything."
>
> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

Nothing in this change touches production source or existing E2E tests — no authorization was needed
and none was triggered.

## Decision (user, 2026-08-11): Option A — Close with doc-sync

- **Option A (chosen)** — no new tests; sync the two stale docs to reflect that the 6 assertions are
  covered by `AuthRegisterDataAssertionsTests.cs`, then archive this change pointing to the already-archived
  cycle `2026-08-07-e2e-stage-1-s1-01-backend`. Effort: Low.
- **Option B (rejected)** — no-op close without doc sync: would leave the stale coverage catalog in place.
- **Option C (rejected)** — re-run the formal SDD cycle for this change name: duplicates the archived
  cycle with zero new code value.

## Scope

### In Scope (docs-only, already applied to the working tree — NOT re-authored here)
1. `docs/testing/e2e-stage-1/S1-01.md` — flip the 6 .NET assertion checkboxes `[ ]` → `[x]` citing
   `Auth/AuthRegisterDataAssertionsTests.cs` + test names (line refs :121/:138/:158/:178/:222/:257);
   add the file to "Estado de cobertura"; replace the stale pre-merge note.
2. `docs/testing/e2e-stage-1/S1-01-backend.md` — mark the plan EJECUTADO y MERGEADO (superseded),
   pointing at the archived cycle; historical diagnosis preserved.
3. `openspec/changes/s1-01-registration-assertions/` — SDD artifacts for this change name
   (`explore.md` already persisted by sdd-explore; `proposal.md` [this]; `archive-report.md` at archive).

### Out of Scope
- Any new or modified test file (the E2E file already exists and passes in `main`).
- Production source code.
- Frontend post-register destination assertion (`/sales/products`, F-2) — the only remaining `[ ]` in
  `S1-01.md`; it is frontend work, outside this backend-scoped change.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docs/testing/e2e-stage-1/S1-01.md` | Modified | 6 checkboxes → `[x]` with test refs; coverage catalog updated |
| `docs/testing/e2e-stage-1/S1-01-backend.md` | Modified | Marked EJECUTADO/MERGEADO (superseded) |
| `openspec/changes/s1-01-registration-assertions/` | New (archive) | explore.md, proposal.md, archive-report.md |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Stale catalog misleads future audits | Removed by this change | `[x]` + test refs + coverage entry |
| Duplicate implementation on this branch | Low | None possible — no test code in scope |
| Docs claim unverified runs | Low | Doc-sync cites the archived verify PASS 6/6 and the explore re-run |

## Rollback Plan

Revert the two doc edits (`git checkout` the files); delete the archived change folder. No production diff.

## Dependencies

None. No packages, migrations, PostgreSQL, or config changes.

## Success Criteria

- [ ] `docs/testing/e2e-stage-1/S1-01.md` and `S1-01-backend.md` reflect the real coverage state (6/6 assertions covered by `AuthRegisterDataAssertionsTests.cs`)
- [ ] Change archived to `openspec/changes/archive/2026-08-10-s1-01-registration-assertions/` with explore.md, proposal.md, archive-report.md
- [ ] `git diff --stat` for the cycle = 2 doc files + archive folder only; zero test/production diffs
