# Delta for documentation: at-rest-encryption archive corrections (T-C3)

**Domain**: `documentation` — `openspec/changes/archive/2026-07-29-at-rest-encryption-backend/verify-report.md` + engram observation #300
**Change**: `backend-test-and-debt-closure`

---

## MODIFIED Requirements

### BT-C3-1 — Engram ID Existence Claim Corrected

The archived `verify-report.md` SUGGESTION (L105) claiming "no such observations exist in engram (searched)" for IDs #294-#300 MUST be corrected: all 7 observations EXIST and are retrievable — #294 proposal, #295 spec, #296 design, #297 tasks, #298 apply, #299 apply-progress, #300 verify-report (verified via `mem_get_observation`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | IDs exist | Observation IDs #294-#300 | Report corrected | States IDs exist with artifact mapping; false "do not exist" claim removed |

### BT-C3-2 — R10 Known-Answer Marked PARTIAL (Resolved by T-A1)

The R10 known-answer row in `verify-report.md` (L52, already PARTIAL) MUST note resolution by T-A1. Engram #300's R10 known-answer row ("✅ COMPLIANT (verified against `HKDF.DeriveKey(SHA256, ...)` call in code)") MUST be corrected to PARTIAL — no independent known-answer assertion exists until T-A1 lands; #300's "15/15 scenarios compliant" summary MUST be corrected to 14/15 + 1 partial.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Report row | Archived verify-report L52 | Row updated | Reads PARTIAL with "(resolved by T-A1)" |
| 2b | Engram #300 | Observation #300 R10 row says COMPLIANT | `mem_update` #300 | R10 row PARTIAL (resolved by T-A1); summary 14/15 + 1 partial |

---

## Verification Criteria

- [ ] Archived `verify-report.md` L105 corrected; L52 notes T-A1
- [ ] Engram #300 R10 row + compliance summary corrected to PARTIAL
