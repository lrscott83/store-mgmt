# Archive Report: owners-create-endpoint-fixes

**Archived**: 2026-08-03
**Change**: `owners-create-endpoint-fixes`
**Previous location**: `openspec/changes/owners-create-endpoint-fixes/`
**Archive location**: `openspec/changes/archive/2026-08-03-owners-create-endpoint-fixes/`

## Final State at Close

This report reflects the state of the change AT CLOSE (2026-08-03), not at earlier
snapshot points. Source ranking per the sdd-archive Final-State Authority:
1. Native review authority — reviewGate.delivery is `disabled/unmanaged` (no review governs this change; see Override below).
2. Persisted tasks artifact — 19/19 tasks `- [x]` (verified at archive time, 0 unchecked).
3. Launch-prompt final-state facts — no later commits or fixes occurred after verification.
4. `verify-report.md` (2026-08-02) — most recent verification snapshot; consistent with final state.

- **Verdict**: PASS
- **Blockers**: 0
- **Critical findings**: 0
- **Requirements**: 9/9 compliant
- **Scenarios**: 19/19 compliant (0 UNTESTED)
- **Tasks**: 19/19 complete (persisted tasks.md has zero unchecked implementation tasks at archive time)
- **Build**: `dotnet build backend/src/SMCA.sln` → exit 0, 0 errors (8 pre-existing NU1902/NU1903 warnings)
- **Tests**: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~Owners"` → 31 passed / 0 failed / 0 skipped
- **Evidence revision**: sha256:a579f471570311a472b022904e0009b3be1ce586ab4a05d2622d308db131a070
- **Test output hash**: sha256:4ab7b912d1825a3fb8b933c515fbc6a86cfd1216fecfd8d80469c4f044bd0943
- **Build output hash**: sha256:50f9f2006dfce8292deb6f16dc8a2615e8ea9d7a41e672de426426a58bdb879c

The verification report (`verify-report.md`, persisted 2026-08-02) is the most recent
account of the change and its claims were confirmed consistent with the final state:
no CRITICAL findings, no WARNING findings, and no evidence of later work. Its
SUGGESTION-level notes (string-literal `"GetOwner"` route name, missing I18n resource
keys, pre-existing EF Core warnings) were carried forward as non-blocking observations.

## Intentional Archive Override

**Override type**: intentional-with-warnings (native review gate relaxation, not a
verification waiver).

- **User instruction**: The user explicitly instructed "archiva los dos" — archive this
  change despite the dispatcher's `resolve-review` recommendation.
- **Justification**: RDD (review-driven development) is DISABLED clone-local. `gentle-ai
  review mode status` = off; `gentle-ai review status` reports applicability: unrelated,
  receipt: not_applicable, no candidates. Per the sdd-archive Native Review Receipt Gate,
  with the kill switch off and no review governing this change, reviewGate.delivery is
  `disabled/unmanaged` — the gate relaxes and no terminal receipt is demanded (demanding
  one would be a deadlock).

## Dispatcher Blocked Reasons (non-authoritative, recorded for traceability)

The dispatcher reported two `blockedReasons`; neither blocks archive:

1. **"terminal review receipt is missing"** — NOT blocking: RDD is disabled (see
   Override above). Demanding a receipt with the kill switch off would deadlock.
2. **"verify evidence cannot enter remediation: verify result total 19 does not match
   actual scenario count 0"** — NOT blocking: a dispatcher scenario-counting limitation.
   The verify-report declares `scenarios: 19/19` and both delta specs contain readable
   scenario tables. Not an implementation defect.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| api-controller | Updated (appended delta section) | `openspec/specs/api-controller/spec.md` — ADDED OC-CT1 (Swagger 201/400/401/403/409/500), OC-CT2 (XML doc), OC-CT3 (Location header on 201) for `CreateOwnerAsync` |
| owners | Updated (merged delta) | `openspec/specs/owners/spec.md` — MODIFIED R3 (201 + `ResponseResult<OwnerDto>`), R4 (duplicate login → 409), R7 (201 Created); ADDED OQ-1 (403 auth gate), OQ-3 (ReSeller null guard → 400), OQ-4 (password complexity) |

Merge rules honored: MODIFIED requirements replaced by name in the main spec
(`### R3:` / `### R4:` / `### R7:`); all non-delta requirements (R1, R2, R5, R6, R8, R9,
Known Bugs) preserved unchanged. ADDED requirements OQ-1/OQ-3/OQ-4 were inserted after
R7 to keep create-endpoint requirements grouped; api-controller delta appended as a new
per-change section following the file's existing convention. No destructive merge (no
REMOVED requirements; no large-section deletion).

## Archive Contents (verified at close)

- proposal.md ✅
- specs/api-controller/spec.md ✅
- specs/owners/spec.md ✅
- design.md ✅
- tasks.md ✅ (19/19 tasks complete; 0 unchecked)
- verify-report.md ✅

Active changes directory `openspec/changes/` no longer contains this change.

## Traceability (hybrid persistence)

- Filesystem (openspec): artifacts at `openspec/changes/archive/2026-08-03-owners-create-endpoint-fixes/`; main specs at `openspec/specs/{api-controller,owners}/spec.md`.
- Engram: this archive is also persisted as observation **#596** at topic key `sdd/owners-create-endpoint-fixes/archive-report` (type: architecture, scope: project, project: store-mgmt).

## Non-Blocking Observations Carried From Verification

- `CreatedAtAction` uses string literal `"GetOwner"` rather than `nameof(GetOwnerAsync)`; runtime Location assertion proves URL generation resolves — current form is correct and intentional.
- `_localizer["Unauthorized"]`, `_localizer["ReSellerNotFound"]`, `_localizer["DuplicateLogin"]` keys missing from I18n resources; messages fall back to literal key text (pre-existing pattern). Consider adding keys in a follow-up.
- EF Core MultipleCollectionInclude/NoOrderBy warnings in test output — cosmetic, pre-existing.
