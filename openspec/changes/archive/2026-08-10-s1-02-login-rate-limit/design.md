# Design: S1-02 — Login Rate-Limit Policy .NET Parity Tests

## Technical Approach

One NEW autonomous test file `backend/src/SMCA.WebApi.E2ETests/RateLimiting/LoginRateLimitPoliciesTests.cs` mirroring `RateLimitPoliciesTests.cs` (4 `[Fact]` tests) but targeting `RateLimitPolicies.Login` (`RateLimitPolicies.cs:15-24`, 5/1min/3/0). Pure policy-factory tests: no `[Collection]`, no `WebAppFixture`, no PostgreSQL, no new packages — green in any environment. The three private helpers (`ContextWithIp`, `BuildLimiter`, `OptionsOf`, ~20 lines) are **copied**, not shared: grep proves no shared helper exists and extraction would modify the protected existing file. Docs get 3 coverage-state line edits only. Nothing HTTP: the real 429 remains proven solely by Playwright (`frontend-react/e2e/login-rate-limit.spec.ts`); reaching it under Testing would require un-guarding `Program.cs:112-121,157-160` — a production change, out of scope.

## Architecture Decisions

| # | Decision | Options considered | Rationale |
|---|----------|--------------------|-----------|
| D1 | New standalone file; helpers **copied** (~20 lines) | (B) add Login tests into `RateLimitPoliciesTests.cs`; (C) extract shared helper to `Infrastructure/` | Scope rule: existing E2E tests are untouchable without explicit authorization; grep over the E2ETests project shows the 3 helpers exist only in the protected file. Copying yields zero footprint on the protected surface. |
| D2 | No `[Collection("e2e")]`, no fixture | Join e2e collection + `WebAppFixture` | Mirrors the existing factory-test pattern (`RateLimitPoliciesTests.cs` is collection-less and DB-free); xUnit default parallelization is safe (no shared state). Joining would require PostgreSQL `smca_test` and add startup cost for no benefit. |
| D3 | Test names mirror `Register_policy_*` convention | Custom names | One-to-one mapping with the existing file (`Login_policy_options_match_production_config`, `..._limiter_behavior_matches_options`, `..._partition_key_is_per_ip`, `..._null_ip_maps_to_unknown_partition`); greppable and self-evident. |
| D4 | Docs wording: "fija el límite" — never "cubre el 429 HTTP" | Claim HTTP-429 coverage | Factory tests pin policy **options + partition** only. 429 requires un-guarding the limiter under Testing (production change). Playwright stays the sole 429 evidence. |
| D5 | No csproj/package change | Add packages / new helper file | xUnit 2.4.2, FluentAssertions 6.12.0 and `ProjectReference` to `SMCA.WebApi` (for `PolicyCode`) are already in `SMCA.WebApi.E2ETests.csproj`; reflection is BCL. |

## Data Flow

    Test [Fact] ──> RateLimitPolicies.Login(ContextWithIp(ip)) ──> RateLimitPartition<string>
         │                                                            │
         └── BuildLimiter / OptionsOf (reflection _options) ──────────┘
                          │
              assert options / behavior / partition key

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/RateLimiting/LoginRateLimitPoliciesTests.cs` | Create | 4 Login policy parity tests; class `LoginRateLimitPoliciesTests`, namespace `SMCA.WebApi.E2ETests.RateLimiting`, 3 copied private helpers, no collection/fixture |
| `docs/testing/e2e-stage-1/README.md` | Modify (`:96` only) | "La política **Login** no tiene ninguno" → Login cubierta por 4 tests .NET (fábrica: options+partition) |
| `docs/testing/e2e-stage-1/S1-02.md` | Modify (`:82` only) | "**FALTA**: el rate limit de login…" → cubierto por el nuevo fichero |
| `docs/testing/e2e-stage-1/S1-02-backend.md` | Modify (`:27` only) | "solo lo prueba el navegador" → test .NET lo fija; el 429 HTTP sigue siendo Playwright |

No existing E2E test, support file, or production file is touched. `git diff --stat` = 1 new + 3 modified files.

## Interfaces / Contracts

Usings (verified from `RateLimitPoliciesTests.cs:1-7` — note: **no** `Microsoft.Extensions.Http`):

```csharp
using System.Net;
using System.Reflection;
using System.Threading.RateLimiting;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using SMCA.WebApi.PolicyCode;
using Xunit;

namespace SMCA.WebApi.E2ETests.RateLimiting;

public class LoginRateLimitPoliciesTests
{
    // 3 private static helpers copied verbatim from RateLimitPoliciesTests.cs:13-35
    // (ContextWithIp, BuildLimiter, OptionsOf) — targets RateLimitPolicies.Login.
```

Helper bodies are byte-for-byte the existing ones; only the `RateLimitPolicies.Register` call sites become `RateLimitPolicies.Login`.

## Testing Strategy

| Test (names per spec) | Assertions |
|-----------------------|-----------|
| `Login_policy_options_match_production_config` | `PermitLimit == 5`, `Window == 1min`, `SegmentsPerWindow == 3`, `QueueLimit == 0` |
| `Login_policy_limiter_behavior_matches_options` | `ReplenishmentPeriod == 20s` (60s/3), `CurrentAvailablePermits == 5`, `AttemptAcquire(6)` throws `ArgumentOutOfRangeException` `"*permit limit of 5*"`, `AttemptAcquire(5)` acquired |
| `Login_policy_partition_key_is_per_ip` | IPs `"203.0.113.10"` / `"203.0.113.11"` → distinct partition keys matching each IP |
| `Login_policy_null_ip_maps_to_unknown_partition` | Null `RemoteIpAddress` → `"unknown"` |

These are unit-level factory tests (no HTTP server, no DB) — the suite's existing pattern for rate limiting.

## Threat Matrix

No routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary is touched — additive test file + 3 doc lines.

| Row | Applicable | Reason |
|-----|-----------|--------|
| Routing / endpoint exposure | N/A | No route, controller, or `Program.cs` change |
| Shell commands / subprocesses | N/A | None invoked by this change |
| VCS / PR automation | N/A | None |
| Executable-file classification | N/A | None |
| Process integration | N/A | Test-only; no process boundary |

## Migration / Rollout

No migration, no config, no feature flag. Focused run (builds once, then `--no-build`):

```
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~LoginRateLimitPoliciesTests"
```

Expect 4/4 green — production already matches (`RateLimitPolicies.cs:15-24`); the file converts "Login has zero coverage" into pinned coverage (the RED is the absence of the file). Nothing HTTP is exercised. **Rollback**: delete the new file + `git revert` the 3 doc lines; no production diff exists.

## Open Questions

- [x] None blocking. TDD note: `strict_tdd` has no RED phase here — there is no production code to write; the tests pin existing production config and pass on first run.
