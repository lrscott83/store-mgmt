# Archive Report — store-deactivation-session-revocation

- schema: gentle-ai.archive-report/v1
- change: `store-deactivation-session-revocation`
- archived: 2026-09-15 → `openspec/changes/archive/2026-09-15-store-deactivation-session-revocation/`
- artifact store: openspec (files; engram observations mirror: explore 1062, proposal 1069, spec 1071, design 1072, tasks 1074, apply-progress 1075)
- branch: `qa` @ 25976dfe (final commit)
- verdict: **PASS** — all requirements implemented and verified; zero findings

## Final State (at close)

**Deactivating a store now revokes the active refresh-token sessions of every
affected user** (SelectedStoreId ∪ employment, filter-free), refresh
enforcement rejects stale tokens when user/store/owner go inactive, and /me
blacklists the calling client's token on store/owner-inactive verdicts.

- Commits on `qa`: `9e7b7fb4` (revocation service + repos), `98dd10fe`
  (handler hooks + refresh activation matrix), `8fa84720` (GetMe parity +
  E2E suite), `82c5103f` (SDD artifacts), `18a22a74` (tasks complete +
  apply progress), `25976dfe` (verify report).
- **Test totals at close**: Application 470/470, Domain 22/22, E2E 506/506
  (998 total; E2E grew 500 → 506). Zero existing E2E tests modified.
- **Sync**: `active-store-selection` MODIFIED (1 req) and
  `refresh-token-persistence` MODIFIED (R4 carve-out, 1 req) composed via
  native `sdd-archive-compose`; new `store-deactivation-session-revocation`
  domain spec (4 req) created via mechanical cp (sha256 verified).
- **Archive move**: `git mv`, pre/post snapshot `diff -r` → EMPTY
  (byte-identity preserved).

## Requirements Synced

| Domain spec | Action | Requirements |
|---|---|---|
| `openspec/specs/store-deactivation-session-revocation/spec.md` | Created | 4 NEW |
| `openspec/specs/active-store-selection/spec.md` | Updated (MODIFIED composed) | 1 MODIFIED |
| `openspec/specs/refresh-token-persistence/spec.md` | Updated (MODIFIED composed) | 1 MODIFIED |

## Runtime Accounting

- Apply attempt `sha256:5e9717dbc…`: **passed** (evidence
  `sha256:b722d981…`), 1544 changed lines vs explicit 1200 → maintainer
  approved reset (actor Appollo, reason: additive E2E coverage).
- Verify attempt `sha256:7c6e234f…`: **passed** (evidence
  `sha256:19e7d2ba…`), remediates apply evidence; 79 changed lines vs
  under-sized acquire budget 50 (verify-report artifact) → maintainer
  approved reset (actor Appollo).
- No `reviewOffer` pending; archive proceeded on `nextRecommended: archive`
  with no blockedReasons.

## Notes

- Intentional-with-warnings: none. All 23 tasks complete; no CRITICAL
  findings in verify-report; no partial archive.
- Latent pre-existing defect documented in verify-report (not introduced,
  not fixed in this change): `RefreshToken.IsActive` unmapped computed
  property cannot translate in EF `Where()`; new bulk query uses a
  translatable predicate.