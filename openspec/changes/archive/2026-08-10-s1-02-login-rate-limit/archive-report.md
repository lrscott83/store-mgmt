# Archive Report — `s1-02-login-rate-limit`

**Archived**: 2026-08-10
**Archived to**: `openspec/changes/archive/2026-08-10-s1-02-login-rate-limit/`
**Verify verdict carried into this archive**: PASS (0 CRITICAL, 0 WARNING, 0 blockers; `critical_findings: 0`)
**Verify validated by**: `gentle-ai sdd-verify-validate` — `{"valid": true, "verdict": "pass"}`
**Artifact store**: hybrid (filesystem + Engram)
**Branch**: repo-local (no dedicated branch; change folder untracked in git status)

## Project rules (carried verbatim)

> "In this backend test-coverage work, the agent may only ADD new E2E tests. If the work would require modifying production source code or existing E2E tests (backend), the agent MUST stop and notify the user for review and approval before touching anything."

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

This archive phase touched ONLY SDD artifacts under `openspec/` — no production code, no test files, no docs. The change itself was ADD-ONLY (1 new test file + 3 doc-line edits), consistent with both rules.

## Final State (at close time)

Per the Final-State Authority hierarchy: the orchestrator's final-state handoff (most recent account) plus the persisted `verify-report` (Engram #734) both describe the same final state — no work occurred between verification and archive, so the verify-report IS the final-state snapshot. All facts corroborate:

- **Delivered**: NEW file `backend/src/SMCA.WebApi.E2ETests/RateLimiting/LoginRateLimitPoliciesTests.cs` (89 lines, class `LoginRateLimitPoliciesTests`, namespace `SMCA.WebApi.E2ETests.RateLimiting`) — 4 `[Fact]` parity tests pinning `RateLimitPolicies.Login` (5/1min/3/0):
  1. `Login_policy_options_match_production_config` — PermitLimit 5, Window 1min, SegmentsPerWindow 3, QueueLimit 0
  2. `Login_policy_limiter_behavior_matches_options` — ReplenishmentPeriod 20s, permits 5, `AttemptAcquire(6)` throws `ArgumentOutOfRangeException` "permit limit of 5", `AttemptAcquire(5)` acquired
  3. `Login_policy_partition_key_is_per_ip` — two IPs → distinct keys
  4. `Login_policy_null_ip_maps_to_unknown_partition` — null `RemoteIpAddress` → `"unknown"`
  - No `[Collection]`, no `WebAppFixture`, no PostgreSQL (hermetic factory tests). 3 helpers (`ContextWithIp`, `BuildLimiter`, `OptionsOf`) copied byte-for-byte from the protected `RateLimitPoliciesTests.cs:13-35` (extraction would have modified the protected file — design D1).
- **Docs (3 coverage-state edits, 1+/1- each)**: `docs/testing/e2e-stage-1/README.md:96`, `S1-02.md:82`, `S1-02-backend.md:27` — "Login no tiene ninguno" / "FALTA …" / "solo lo prueba el navegador" → Login covered by 4 .NET factory tests; HTTP 429 explicitly credited to Playwright only. No invented runs.
- **Test evidence** (hermetic, no DB):
  - Focused: `--filter "FullyQualifiedName~LoginRateLimitPoliciesTests"` → Passed! 4/4, 13 ms, exit 0.
  - Regression: `--filter "FullyQualifiedName~RateLimiting"` → Passed! 8/8 (4 Login + 4 Register), exit 0. `RateLimitPoliciesTests.cs` untouched (`git diff` empty for it).
  - Build: E2E csproj → exit 0, 0 errors (pre-existing NU1902/NU1903/CS8xxx warnings; new file mirrors the original's CS8602 at :57, same warning/column — accepted by design D-verify note).
- **Purity**: `git status --porcelain` = 3 modified docs + 1 new untracked test file + the change's openspec folder. Zero production files (`Program.cs`, `AuthController.cs`, `RateLimitPolicies.cs` not in status). `frontend-react/openspec/changes/offline-roster-login-actions/` is a pre-existing untracked folder belonging to a DIFFERENT change — untouched, out of scope.

## Spec Sync (openspec) — intentionally NONE

The change's delta spec (`spec.md`) declares itself a **coverage-only delta**: "No New or Modified Capabilities" — the `rate-limiting` main spec (`openspec/specs/rate-limiting/spec.md`) is Register-behavior (R1 = RegisterPolicy 10/10min), **not a coverage log**, and the Non-Goals explicitly list "`LoginPolicy` delta in `openspec/specs/rate-limiting`: OUT — separate decision."

Per the change's own authoritative scope (spec.md:3,7,87-89), NO merge into `openspec/specs/rate-limiting/spec.md` was performed at archive time. A LoginPolicy capability delta remains an open, separate decision. This matches the repo's established pattern for test-only changes (discovery #723: behavioral specs like `rate-limiting` do not get delta specs; only e2e coverage specs do). No destructive delta existed (0 REMOVED, 0 RENAMED), so `config.yaml` `rules.archive` ("Warn before merging destructive deltas") required no warning.

## Task Completion Gate

`tasks.md` (Engram #731): all 12 task checkboxes `[x]` at archive time — 5 file-creation (Phase 1), 3 verification (Phase 2), 4 docs (Phase 3) — plus all 3 Definition-of-Done boxes `[x]`. Verify-report independently confirms 12/12 complete. **No stale unchecked tasks; no exceptional reconciliation needed.**

## Review Gate Disposition

Native status / orchestrator handoff (2026-08-10): review mode is OFF — receipt-driven delivery is `disabled/unmanaged`; no review policy, ledger, receipt, transaction, or `reviews/` dir exists for this change (no `state.yaml`, no `reviews/` in the change folder). Per the Native Review Receipt Gate, `disabled/unmanaged` is the only relaxation and it applies: with the kill switch off and no review governing this change, no terminal receipt is demanded. Gate disposition recorded as **`disabled/unmanaged`**.

## Action Context

`actionContext.mode: repo-local` (interactive; not workspace-planning); archive operations confined to `openspec/changes/...` inside the project root. Scope guard never tripped in apply or verify (no production, no protected-test, no doc-out-of-scope access attempted).

## Traceability (Engram observations)

- Engram `sdd/s1-02-login-rate-limit/explore` — observation **#720**
- Engram `sdd/s1-02-login-rate-limit/proposal` — observation **#722**
- Engram `sdd/s1-02-login-rate-limit/spec` — observation **#724**
- Engram `sdd/s1-02-login-rate-limit/design` — observation **#728**
- Engram `sdd/s1-02-login-rate-limit/tasks` — observation **#731**
- Engram `sdd/s1-02-login-rate-limit/apply-progress` — observation **#733**
- Engram `sdd/s1-02-login-rate-limit/verify-report` — observation **#734**
- Engram `sdd/s1-02-login-rate-limit/archive-report` — this report (saved at archive time)

## PR Preparation (NOT created — orchestrator decides)

Diffs ready for a single PR (per tasks.md forecast: ~96 lines, Low 400-line budget risk, no chain):

| Path | Action | Size |
|------|--------|------|
| `backend/src/SMCA.WebApi.E2ETests/RateLimiting/LoginRateLimitPoliciesTests.cs` | NEW | 89 lines |
| `docs/testing/e2e-stage-1/README.md` | MODIFIED | 1+/1- |
| `docs/testing/e2e-stage-1/S1-02.md` | MODIFIED | 1+/1- |
| `docs/testing/e2e-stage-1/S1-02-backend.md` | MODIFIED | 1+/1- |
| `openspec/changes/archive/2026-08-10-s1-02-login-rate-limit/` | NEW (archive) | 7 files |

Suggested commit units (conventional, per repo style): `test(e2e): add LoginRateLimitPoliciesTests parity coverage` + `docs(testing): mark Login .NET rate-limit coverage` + `chore(openspec): archive s1-02-login-rate-limit`. No commit/push performed in this phase.

## Non-Goals Honored

- Backend scope rule (NON-NEGOTIABLE): only ADDED 1 new E2E test file; zero existing E2E tests or support files touched in either suite.
- Zero production source changes (`Program.cs` limiter guard untouched — 429 stays Playwright-proven).
- H-13 refresh/revoke rate limiting: note only, out of scope.
- `LoginPolicy` capability delta in `openspec/specs/rate-limiting`: OUT — separate decision, recorded as open.
- No packages, no migrations, no config change.

## SDD Cycle Complete

The change was planned (proposal/spec/design), implemented (apply, 12/12 tasks), verified (PASS, 7/7 requirements, 7/7 scenarios, zero CRITICAL/WARNING), and is now archived. Hybrid persistence: this file + Engram observation `sdd/s1-02-login-rate-limit/archive-report` (project `D:\Projects\AutoBusinessPro\Store\store-mgmt`, type `architecture`, capture_prompt false). Archive is an AUDIT TRAIL — archived artifacts are not to be modified. Ready for the next change.
