# Proposal: S1-02 — Login Rate-Limit Policy .NET Parity Tests

## Intent

The `Login` policy (`RateLimitPolicies.cs:15-24`, 5/1min/3) has zero .NET coverage — all 4 tests in `RateLimitPoliciesTests.cs` pin only `Register`; the 429 path is proven only by Playwright. Deliver the missing ".NET test que fije el límite" (`S1-02-backend.md:27`) as a self-contained parity file. Additive only.

## Backend scope + E2E untouchable rule (NON-NEGOTIABLE)

> "In this backend test-coverage work, the agent may only ADD new E2E tests. If the work would require modifying production source code or existing E2E tests (backend), the agent MUST stop and notify the user for review and approval before touching anything."
>
> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

## Scope

User decisions (2026-08-10): Option A (new file, helpers copied); docs in-change; H-13 out.

### In Scope
1. NEW `backend/src/SMCA.WebApi.E2ETests/RateLimiting/LoginRateLimitPoliciesTests.cs` — mirrors `RateLimitPoliciesTests.cs` (no `[Collection]`, no fixture, no PostgreSQL); helpers copied (`ContextWithIp`, `BuildLimiter`, `OptionsOf`). 4 `[Fact]` tests:
   - `Login_policy_options_match_production_config` — PermitLimit=5, Window=1min, SegmentsPerWindow=3, QueueLimit=0
   - `Login_policy_limiter_behavior_matches_options` — Replenishment=20s, permits=5, `AttemptAcquire(6)` throws "permit limit of 5", `AttemptAcquire(5)` acquired
   - `Login_policy_partition_key_is_per_ip` — 2 IPs → distinct keys
   - `Login_policy_null_ip_maps_to_unknown_partition` — null → "unknown"
2. Docs — coverage state only, verified wording (tests pin policy OPTIONS + PARTITION; NOT the HTTP 429 — Playwright stays): `docs/testing/e2e-stage-1/README.md:96`, `S1-02.md:82`, `S1-02-backend.md:27`.

### Out of Scope
- Production (`Program.cs`, `AuthController.cs`, `RateLimitPolicies.cs`); existing tests (`RateLimitPoliciesTests.cs` et al.)
- H-13 refresh/revoke rate limiting — note only (`README.md:284-286`)
- Real HTTP 429 E2E under Testing (requires un-guarding the limiter → production change)
- LoginPolicy delta in `openspec/specs/rate-limiting` (separate decision)

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None — test-only; `rate-limiting` spec is Register-behavior, not a coverage log.

## Approach

Mirror `RateLimitPoliciesTests.cs`: invoke the `RateLimitPolicies.Login` partition factory with hand-built limiters; 3 helpers copied (~20 lines), not shared — extraction would modify the protected existing file. Docs edited only where coverage state changes; no invented runs.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/RateLimiting/LoginRateLimitPoliciesTests.cs` | New | 4 Login policy parity tests |
| `docs/testing/e2e-stage-1/README.md:96` | Modified | "Login no tiene ninguno" → 4 tests |
| `docs/testing/e2e-stage-1/S1-02.md:82` | Modified | "FALTA …" → covered |
| `docs/testing/e2e-stage-1/S1-02-backend.md:27` | Modified | "solo lo prueba el navegador" → covered |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Helper duplication (~20 lines) | Med | Documented; shared-helper refactor requires authorization |
| Factory tests mistaken for 429 coverage | Med | Docs wording: options/partition only; 429 stays Playwright |
| Docs claim unverified runs | Low | Coverage-state edits only |

## Rollback Plan

Delete the new file; `git revert` the 3 doc-line edits. No production diff.

## Dependencies

None. No packages, migrations, PostgreSQL, or config changes.

## Success Criteria

- [ ] 4 new tests green via `dotnet test` (E2ETests project); no existing test modified/failing
- [ ] `git diff --stat` = 1 new test file + 3 doc files only
- [ ] Docs credit the HTTP 429 to Playwright, factory pinning to the new file
