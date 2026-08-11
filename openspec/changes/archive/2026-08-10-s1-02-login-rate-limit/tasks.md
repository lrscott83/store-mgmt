# Tasks: S1-02 — Login Rate-Limit Policy .NET Parity Tests

## Overview

Add ONE new E2E file `backend/src/SMCA.WebApi.E2ETests/RateLimiting/LoginRateLimitPoliciesTests.cs` (4 `[Fact]` parity tests for `RateLimitPolicies.Login`, 5/1min/3/0, 3 helpers copied) + 3 coverage-state doc-line edits. No production file, no existing test.

**Scope guard (verbatim — carries into apply)**: "In this backend test-coverage work, the agent may only ADD new E2E tests. If the work would require modifying production source code or existing E2E tests (backend), the agent MUST stop and notify the user for review and approval before touching anything." / "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~96 (new file ~90 + 6 doc edits) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low
```

### Suggested Work Units

| Unit | Goal | Focused test command | Runtime harness | Rollback boundary |
|------|------|----------------------|-----------------|-------------------|
| 1 | New `LoginRateLimitPoliciesTests.cs` | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~LoginRateLimitPoliciesTests"` → 4/4 green | N/A — in-process factory tests; no server, no PostgreSQL | Delete the new file; nothing else touched |
| 2 | RateLimiting regression | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~RateLimiting"` → 8/8 (4 Login + 4 Register) | N/A — hermetic harness, no environment state | No diff; re-run only |
| 3 | Docs coverage edits | `git diff --stat` = 1 new + 3 modified; grep old phrases gone | N/A — docs-only, no runtime | `git revert` the 3 doc lines |

## Phase 1: WU-1 — New test file (additive only)

- [x] 1.1 Create skeleton: class `LoginRateLimitPoliciesTests`, namespace `SMCA.WebApi.E2ETests.RateLimiting`, usings copied verbatim from `RateLimitPoliciesTests.cs:1-7` (no `Microsoft.Extensions.Http`), no `[Collection]`, no fixture; copy helpers `ContextWithIp`/`BuildLimiter`/`OptionsOf` (`:13-35`) targeting `RateLimitPolicies.Login`.
- [x] 1.2 Add `Login_policy_options_match_production_config`: `OptionsOf(RateLimitPolicies.Login(ContextWithIp(null)))` → PermitLimit=5, Window=1min, SegmentsPerWindow=3, QueueLimit=0 (matches `RateLimitPolicies.cs:15-24`).
- [x] 1.3 Add `Login_policy_limiter_behavior_matches_options`: ReplenishmentPeriod=20s, CurrentAvailablePermits=5, `AttemptAcquire(6)` throws `ArgumentOutOfRangeException` "*permit limit of 5*", `AttemptAcquire(5)` acquired.
- [x] 1.4 Add `Login_policy_partition_key_is_per_ip`: "203.0.113.10" vs "203.0.113.11" → distinct keys matching each IP.
- [x] 1.5 Add `Login_policy_null_ip_maps_to_unknown_partition`: null `RemoteIpAddress` → `"unknown"`.

> TDD note: `strict_tdd` has no RED here — there is no production code to write; the tests pin existing production config and pass on first run (design Open Questions). No production WU exists by design.

## Phase 2: WU-2 — Verification

- [x] 2.1 Focused run (build once, then `--no-build`): filter `FullyQualifiedName~LoginRateLimitPoliciesTests` → EXACTLY 4/4 green.
- [x] 2.2 Regression: filter `FullyQualifiedName~RateLimiting` → 8/8 (Register 4/4 unchanged). Do NOT modify `RateLimitPoliciesTests.cs`.
- [x] 2.3 Purity: `git status --porcelain` → exactly 1 new test + 3 doc files (+ openspec artifacts).

## Phase 3: WU-3 — Docs (coverage state only, verified wording)

- [x] 3.1 `docs/testing/e2e-stage-1/README.md:96`: replace "La política **Login** no tiene ninguno" → Login cubierta por 4 tests .NET (`LoginRateLimitPoliciesTests.cs`, fábrica: options+partición); el 429 HTTP lo sigue probando Playwright.
- [x] 3.2 `docs/testing/e2e-stage-1/S1-02.md:82`: replace "**FALTA**: el rate limit de login en la capa .NET — no hay test de servidor que lo fije." → CUBIERTO por el nuevo fichero (options+partición); 429 real sigue Playwright.
- [x] 3.3 `docs/testing/e2e-stage-1/S1-02-backend.md:27`: replace "Lo que sigue faltando es un test .NET que lo fije — el límite hoy solo lo prueba el navegador" → el test .NET lo fija (options/partición); el 429 HTTP sigue solo en Playwright.
- [x] 3.4 Grep docs: never claim "cubre el 429 HTTP" nor invent runs.

## Dependencies

WU-1 → WU-2 (verify) → WU-3 (docs reflect real coverage). No packages, migrations, config, PostgreSQL.

## Definition of Done

- [x] 4/4 Login tests green; RateLimiting suite 8/8; no existing test modified or failing. — verified 2026-08-10: `--filter FullyQualifiedName~LoginRateLimitPoliciesTests` → Passed! 4/4 (19ms); `--filter FullyQualifiedName~RateLimiting` → Passed! 8/8 (11ms); `RateLimitPoliciesTests.cs` untouched.
- [x] `git diff --stat` = 1 new test file + 3 doc files only. — verified: `git diff --stat` = README.md 1+/1-, S1-02-backend.md 1+/1-, S1-02.md 1+/1-; new untracked `LoginRateLimitPoliciesTests.cs` (89 lines).
- [x] Docs credit HTTP 429 to Playwright and factory pinning to the new file; no invented runs. — verified: 3 doc diffs credit the 429 to Playwright and the new file to factory pinning (options+partición); grep confirms no "cubre el 429" phrase remains.
