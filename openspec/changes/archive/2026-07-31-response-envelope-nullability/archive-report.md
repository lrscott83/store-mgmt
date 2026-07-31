# Archive Report: response-envelope-nullability

**Change**: response-envelope-nullability
**Archived**: 2026-07-31
**Mode**: hybrid (repo-root openspec/ filesystem + Engram)
**Branch**: feat/response-envelope-nullability, final HEAD `a9288bb`, tree clean

## Traceability — Engram Observation IDs

| Artifact | Observation ID | Topic Key |
|---|---|---|
| Spec | #1711 | `sdd/response-envelope-nullability/spec` |
| Design | #1712 | `sdd/response-envelope-nullability/design` |
| Tasks | #1716 | `sdd/response-envelope-nullability/tasks` |
| Apply progress | #1718 | `sdd/response-envelope-nullability/apply-progress` |
| Verify report | #1722 | `sdd/response-envelope-nullability/verify-report` |

## Verify Outcome

PASS WITH WARNINGS (0 CRITICAL, 1 WARNING, 2 SUGGESTION) at verify-time HEAD `5290a72`. The 1 WARNING — the `owner-edit.tsx` `getOwner` RED test (task 3.1) could not runtime-discriminate guard-present vs guard-absent, because the adjacent `.catch` swallows the `null.fullName` throw into the same `OWNER.ERROR` outcome — was subsequently FIXED by the orchestrator in commit `bcf8aea`, which added a type-level `@ts-expect-error` probe asserting the guard where the compiler enforces it. Commit `5290a72` (already reflected in the verify report) removed 6 dead pre-union casts. Final gates at HEAD `a9288bb`: `pnpm typecheck` 5/5 packages, `pnpm test` 2173/2173 (155 files), `pnpm lint --max-warnings=0` 4/4 packages — all green.

## Specs Synced

| Domain | Action | Details |
|---|---|---|
| `response-envelope` | Created | New capability — `openspec/specs/response-envelope/spec.md`. 5 Requirements: Discriminated Union Shape, message/actionCode Nullable on Both Branches, Union Must Not Collapse to boolean, No Unsafe Cast in failure(), Supersedes Stale Non-Nullable Claim in frontend-react/openspec Admin Spec. |
| `admin-owners-resellers` | Updated | 5 Requirements ADDED (folded into existing Owners/Resellers sections, all pre-existing requirements untouched): Owner List / Owner Edit Load / Owner Edit Reseller Dropdown / Owner Edit Stores Tab (all under Owners) + Reseller List (under Resellers). Added a "Notes — succeeded:false Guard Coverage" section documenting the 6-site/5-file scope and the two divergent owner-edit idioms. |
| `admin-stores` | Updated | 1 Requirement ADDED: Store List Surfaces succeeded:false via STORES.ERROR, inserted after the existing "Store List Create Label Copy Parity" requirement, with a scope note that Approve/Disapprove/lifecycle-CSS requirements are unaffected. |
| `management-users` | Updated | 1 Requirement ADDED: Users List Surfaces succeeded:false via USERS.ERROR, inserted between "Users List Uses Shared Chrome and Deactivated Indicator" and "Copy Matches Angular Terminology Exactly", noting the `.then/.catch` idiom differs from the try/catch idiom used elsewhere in this change. |

All merges were additive (ADDED Requirements only — no MODIFIED/REMOVED sections in any delta spec). Zero pre-existing requirements were altered or removed in any of the three modified canonical specs.

## Task 5.1 — Cross-Tree Spec Correction (Performed by sdd-archive)

Per the deferred task, corrected `frontend-react/openspec/specs/admin/spec.md` at lines **312, 596, 1114**. Each previously read (verbatim, all three identical):

> `BaseResponseModel<T>` fields `message`, `actionCode`, and `errors` are NON-nullable; test mocks MUST use `''`, `0`, and `[]` respectively — never `null`.

Each now reads:

> `BaseResponseModel<T>` fields `message` and `actionCode` are nullable (`string | null` / `number | null`) on both branches; `errors` remains non-nullable. Test mocks MAY use `null` for `message`/`actionCode`; `errors` mocks MUST still use `[]` (or a populated array) — never `null`.

`errors` non-nullability was preserved exactly, per the spec's own "Supersedes Stale Non-Nullable Claim" requirement — only the `message`/`actionCode` portion was corrected. Each edit was surgical: the surrounding sentences in all three locations (usage-http, reseller-http, owner-http sections) were read in context first and left otherwise intact. Neither the repo-root `openspec/` tree nor `frontend-react/openspec/` was moved, merged, or restructured — they remain two independent git-tracked trees, exactly as the design/spec mandated. Archived `tasks.md` for this change has 5.1 marked complete with a note explaining it was performed during archival, including the post-verify WARNING fix.

## Archive Contents

- `proposal.md` — written to archive (content-identical to source)
- `design.md` — written to archive (content-identical to source)
- `tasks.md` — written to archive with task 5.1 checked off and an added note
- `verify-report.md` — written to archive (content-identical to source, PLUS an appended "Post-Verify Update" section documenting commits `bcf8aea`/`5290a72` and final gate results at HEAD `a9288bb`)
- `specs/response-envelope/spec.md` — written to archive (content-identical to source)
- `specs/admin-owners-resellers/spec.md` — written to archive (content-identical to source)
- `specs/admin-stores/spec.md` — written to archive (content-identical to source)
- `specs/management-users/spec.md` — written to archive (content-identical to source)

## Source of Truth Updated

- `openspec/specs/response-envelope/spec.md` (new)
- `openspec/specs/admin-owners-resellers/spec.md` (updated)
- `openspec/specs/admin-stores/spec.md` (updated)
- `openspec/specs/management-users/spec.md` (updated)
- `frontend-react/openspec/specs/admin/spec.md` (3 lines corrected — task 5.1)

## IMPORTANT — Filesystem Move NOT Yet Complete (No Bash access)

This executor has no Bash tool and cannot delete or move files. The following NEW files have been WRITTEN (copies), but the ORIGINAL `openspec/changes/response-envelope-nullability/` folder still exists and has NOT been deleted. The orchestrator MUST:

1. Delete the original folder: `openspec/changes/response-envelope-nullability/` (proposal.md, design.md, tasks.md, verify-report.md, specs/response-envelope/spec.md, specs/admin-owners-resellers/spec.md, specs/admin-stores/spec.md, specs/management-users/spec.md)
2. Confirm the new archive folder `openspec/changes/archive/2026-07-31-response-envelope-nullability/` (listed below) is complete and correct
3. Commit the merge + archive move + task 5.1 correction (per constraints, this executor did NOT commit)

### Files written by this executor (new, need to be kept)
- `openspec/specs/response-envelope/spec.md` (new canonical capability)
- `openspec/specs/admin-owners-resellers/spec.md` (updated in place — merge, not a copy)
- `openspec/specs/admin-stores/spec.md` (updated in place — merge, not a copy)
- `openspec/specs/management-users/spec.md` (updated in place — merge, not a copy)
- `frontend-react/openspec/specs/admin/spec.md` (updated in place — task 5.1, 3 lines)
- `openspec/changes/archive/2026-07-31-response-envelope-nullability/proposal.md`
- `openspec/changes/archive/2026-07-31-response-envelope-nullability/design.md`
- `openspec/changes/archive/2026-07-31-response-envelope-nullability/tasks.md`
- `openspec/changes/archive/2026-07-31-response-envelope-nullability/verify-report.md`
- `openspec/changes/archive/2026-07-31-response-envelope-nullability/specs/response-envelope/spec.md`
- `openspec/changes/archive/2026-07-31-response-envelope-nullability/specs/admin-owners-resellers/spec.md`
- `openspec/changes/archive/2026-07-31-response-envelope-nullability/specs/admin-stores/spec.md`
- `openspec/changes/archive/2026-07-31-response-envelope-nullability/specs/management-users/spec.md`
- `openspec/changes/archive/2026-07-31-response-envelope-nullability/archive-report.md` (this file)

### Files the orchestrator MUST delete (originals, now duplicated into archive)
- `openspec/changes/response-envelope-nullability/proposal.md`
- `openspec/changes/response-envelope-nullability/design.md`
- `openspec/changes/response-envelope-nullability/tasks.md`
- `openspec/changes/response-envelope-nullability/verify-report.md`
- `openspec/changes/response-envelope-nullability/specs/response-envelope/spec.md`
- `openspec/changes/response-envelope-nullability/specs/admin-owners-resellers/spec.md`
- `openspec/changes/response-envelope-nullability/specs/admin-stores/spec.md`
- `openspec/changes/response-envelope-nullability/specs/management-users/spec.md`
- (then the now-empty `openspec/changes/response-envelope-nullability/` directory tree itself)

## SDD Cycle Complete (pending orchestrator cleanup)

The change has been fully planned, implemented, verified, and its specs merged/archived at the content level. Ready for the next change once the orchestrator performs the filesystem cleanup (delete originals) and commits.
