# Archive Report: owners-getbyid-endpoint-fixes

**Archived**: 2026-08-03
**Change**: `owners-getbyid-endpoint-fixes`
**Previous location**: `openspec/changes/owners-getbyid-endpoint-fixes/`
**Archive location**: `openspec/changes/archive/2026-08-03-owners-getbyid-endpoint-fixes/`

## Final State at Close

This report reflects the state of the change AT CLOSE (2026-08-03), not at earlier
snapshot points. Source ranking per the sdd-archive Final-State Authority:
1. Native review authority — reviewGate.delivery is `disabled/unmanaged` (no governing
   review receipt; RDD is disabled clone-local — see Override and Contradiction Note below).
2. Persisted tasks artifact — 12/12 tasks `- [x]` (verified at archive time, 0 unchecked).
3. Launch-prompt final-state facts — no later commits or fixes occurred after verification.
4. `verify-report.md` (2026-08-02) — most recent verification snapshot; consistent with final state.

- **Verdict**: PASS
- **Blockers**: 0
- **Critical findings**: 0
- **Requirements**: 7/7 compliant (api-controller OC-CT1/OC-CT2, owners R2/OQ-2/OQ-3, repository RR-1/RR-2)
- **Scenarios**: 20/20 compliant (12 with runtime tests, 8 with definitive static evidence)
- **Tasks**: 12/12 complete (persisted tasks.md has zero unchecked implementation tasks at archive time)
- **Build**: `dotnet build backend/src/SMCA.sln` → exit 0, 0 errors (8 pre-existing NuGet vulnerability warnings, unrelated to this change)
- **Tests**: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~Owners"` → 27 passed / 0 failed / 0 skipped
- **Evidence revision**: sha256:a8ed19db6d590a9a5bdc0e9951733012202d4483bb960a2bd8b3ed0c9b6009cf
- **Test output hash**: sha256:f6c8bef8d6610af6dc19f24e56278843c81f4c1b672cb5b0673f74173d2700ca
- **Build output hash**: sha256:11db7b7cf01ee89669a4f3534ab0e15f2ea2614220948f89ad22c85fbaf7c82b

The verification report (`verify-report.md`, persisted 2026-08-02) is the most recent
account of the change and its claims were confirmed consistent with the final state:
no CRITICAL findings, no WARNING findings, and no evidence of later work (launch-prompt
fact: "No later commits or fixes occurred after verification"). Its SUGGESTION-level
notes were carried forward as non-blocking observations (see below).

## Intentional Archive Override

**Override type**: intentional-with-warnings (native review gate relaxation, not a
verification waiver).

- **User instruction**: The user explicitly instructed "archiva los dos" — archive this
  change despite the dispatcher's `resolve-review` recommendation.
- **Justification**: RDD (receipt-driven development) is DISABLED clone-local.
  Verified at archive time via `gentle-ai review mode status` →
  `receipt-driven development: off (decided by clone_local)`. Per the sdd-archive
  Native Review Receipt Gate, with the kill switch off and no review governing this
  change, reviewGate.delivery is `disabled/unmanaged` — the gate relaxes and no
  terminal receipt is demanded (demanding one would be a deadlock).

## Contradiction Note (recorded per Final-State Authority)

The launch context asserted `gentle-ai review status` reports `applicability: unrelated,
receipt: not_applicable, no candidates`. Repository evidence at archive time shows one
pre-existing review transaction, `review-466bdf8c7a9bb331` (at
`.git/gentle-ai/review-transactions/v2/`), with state `reviewing`, generation 1, no
terminal receipt, no approved outcome, `findings: []`, and a `current-changes` candidate
snapshot (base 8cbb7b10, candidate 2cde9e55) that includes this change's files among 74
paths. Both statements are recorded here — the dispatcher's not_applicable resolution and
the observed mid-flight transaction — because they cannot be ranked against each other.

Resolution applied (no silent assumption): the transaction predates the kill-switch
disable, is mid-flight/non-terminal, and produced no receipt or outcome, so it does not
constitute a governing terminal receipt. RDD being off, the gate's `disabled/unmanaged`
relaxation applies; this change is not blocked by it. The transaction was neither
modified nor settled by this archive.

## Dispatcher Blocked Reasons (non-authoritative, recorded for traceability)

The dispatcher reported two `blockedReasons`; neither blocks archive:

1. **"terminal review receipt is missing"** — NOT blocking: RDD is disabled (see
   Override above). Demanding a receipt with the kill switch off would deadlock.
2. **"verify evidence cannot enter remediation: verify result total 20 does not match
   actual scenario count 0"** — NOT blocking: a dispatcher scenario-counting limitation.
   The verify-report declares `scenarios: 20/20` and the delta specs contain readable
   scenario tables (8 api-controller + 7 owners + 5 repository). Not an implementation
   defect.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| api-controller | Updated (appended delta section) | `openspec/specs/api-controller/spec.md` — ADDED OC-CT1 (Swagger 400/401/403/404/500 for `GetOwnerAsync`, 6 scenarios), OC-CT2 (XML summary + `<param name="id">`, 2 scenarios) |
| owners | Updated (merged delta) | `openspec/specs/owners/spec.md` — MODIFIED R2 (nonexistent owner → envelope `Succeeded==false` + `ActionCode==404` + `Code=="Owner.NotFound"`; empty GUID → 400 `Code=="OwnerId"` structural); ADDED OQ-2 (validator structural-only, zero DB queries), OQ-3 (handler null guard → `Failure(404)`, no AutoMapper on null) |
| repository | Updated (appended delta section) | `openspec/specs/repository/spec.md` — ADDED RR-1 (complete include chain on `GetOwnerIncludingUserByIdAsync`), RR-2 (`CancellationToken` parameter on interface + implementation) |

Merge rules honored: MODIFIED R2 replaced by name (`### R2: GET /api/v1/Owners/{id}`)
with the full updated requirement including all scenarios; all non-delta requirements
(R1, R3–R9, OQ-1, OQ-4, Known Bugs) preserved unchanged; the sibling change
`owners-create-endpoint-fixes` was archived earlier in the same session and its merged
content (R3/R4/R7, OQ-1/OQ-3/OQ-4 in `owners`; OC-CT1/OC-CT2/OC-CT3 in `api-controller`)
was read as the current state and preserved on top of this merge. api-controller and
repository deltas were appended as new per-change sections following each file's existing
concatenation convention. No destructive merge (no REMOVED requirements; no large-section
deletion).

**Requirement-ID reuse note**: this change's ADDED `### OQ-3: Handler Null Guard`
(`GetOwnerByIdQueryHandler`) intentionally reuses the `OQ-3` identifier already present
as `### OQ-3: Null Guard — Nonexistent ReSeller Returns 400` (`CreateReSellerOwner`, from
`owners-create-endpoint-fixes`); likewise OC-CT1/OC-CT2 now identify requirements for
both `CreateOwnerAsync` and `GetOwnerAsync` in `api-controller`. These are distinct
requirements scoped by title + action; the IDs were assigned per-change by the source
specs and are preserved verbatim (not silently renamed or merged).

## Archive Contents (verified at close)

- proposal.md ✅
- specs/api-controller/spec.md ✅
- specs/owners/spec.md ✅
- specs/repository/spec.md ✅
- design.md ✅
- tasks.md ✅ (12/12 tasks complete; 0 unchecked)
- verify-report.md ✅

Active changes directory `openspec/changes/` no longer contains this change.

## Traceability (hybrid persistence)

- Filesystem (openspec): artifacts at `openspec/changes/archive/2026-08-03-owners-getbyid-endpoint-fixes/`; main specs at `openspec/specs/{api-controller,owners,repository}/spec.md`.
- Engram: this archive is also persisted as an observation at topic key `sdd/owners-getbyid-endpoint-fixes/archive-report` (type: architecture, scope: project, project: store-mgmt).

## Non-Blocking Observations Carried From Verification

- `OwnerNotFound` localization key exists only in `I18n.resx` (default/es), not
  `I18n.en.resx` — English clients fall back to "Propietario no encontrado". Follow-up:
  add the key to the English resource.
- `design.md` testing-strategy text (lines 58, 79) is stale at close: it describes
  asserting raw `HttpStatusCode.NotFound` and removing the error-code assertion, while
  the spec, tasks, implementation, and E2E assert the envelope contract
  (`Succeeded==false`, `ActionCode==404`, `Code=="Owner.NotFound"`) inside an HTTP 200
  wrapper. Spec-compliant; design doc was not corrected before archive (no later commits
  per launch-prompt fact). Follow-up: correct `design.md`.
- EF Core emits `MultipleCollectionIncludeWarning` for the new multi-collection includes
  (SingleQuery cartesian); bounded here by `Take(1)`. Consider `AsSplitQuery()` for the
  GetById query in a follow-up.
- No dedicated unit test proves the validator issues zero DB queries (static evidence
  only in verify-report). Consider a validator unit test with a mocked
  `IOwnerRepository` asserting it is never invoked.
