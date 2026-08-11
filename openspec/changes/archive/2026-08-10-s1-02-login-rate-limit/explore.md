# Exploration — S1-02 Login Rate Limit (.NET E2E parity)

- Change: `s1-02-login-rate-limit`
- Phase: explore
- Artifact store: hybrid (openspec + engram)
- Date: 2026-08-10
- Author: sdd-explore sub-agent

## Status

`success` — exploration complete. Enough evidence to propose a change that ONLY ADDS a new test file; no production code and no existing test is touched.

## Executive Summary

The Register rate-limit policy is pinned by 4 factory-level tests in `backend/src/SMCA.WebApi.E2ETests/RateLimiting/RateLimitPoliciesTests.cs` (all 4 cover `RateLimitPolicies.Register`, none cover `Login`). The Login policy (`RateLimitPolicies.cs:15-24`, 5/1min/3) has zero .NET coverage; its 429 branch is only proven by Playwright (`login-rate-limit.spec.ts`). This exploration confirms a new, self-contained test file `RateLimiting/LoginRateLimitPoliciesTests.cs` mirroring the 4 Register tests is feasible, needs NO changes to production or existing tests, does not require PostgreSQL, and can reuse the same helper pattern (copied, not shared).

## Constraints carried verbatim (CLAUDE.md)

> "In this backend test-coverage work, the agent may only ADD new E2E tests. If the work would require modifying production source code or existing E2E tests (backend), the agent MUST stop and notify the user for review and approval before touching anything."
>
> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

Scope proposed below respects both rules: **new test file only**.

---

## Findings (file:line)

### 1. Production policies

- `backend/src/SMCA.WebApi/PolicyCode/RateLimitPolicies.cs:15-24` — `RateLimitPolicies.Login`: sliding window, `PermitLimit = 5`, `Window = 1min`, `SegmentsPerWindow = 3`, `QueueLimit = 0`, partition key = `RemoteIpAddress?.ToString() ?? "unknown"`.
- `RateLimitPolicies.cs:26-35` — `Register`: `10 / 10min / 10 / 0`, same partition key.
- `backend/src/SMCA.WebApi/Program.cs:112-121` — `AddRateLimiter` registered ONLY outside `"Testing"` (`!IsEnvironment("Testing")`); `:157-160` — `UseRateLimiter()` only outside Testing. **Under Testing the rate limiter middleware is not registered** (existing docs H-12; refuted in the sense that a real 429 was observed via Playwright against a non-Testing environment, `docs/testing/e2e-stage-1/S1-02.md:84`).
- `backend/src/SMCA.WebApi/Controllers/v1/AuthController.cs:27` — `[EnableRateLimiting("LoginPolicy")]` on `POST /v1/auth/login`; `:102` — `[EnableRateLimiting("RegisterPolicy")]` on register.
- `AuthController.cs:44` (refresh), `:57` (revoke), `:66` (logout), `:74` (me), `:117` (ping) — NO `[EnableRateLimiting]`. Only login and register are rate-limited (grep across `backend/src` confirms exactly 2 matches).

### 2. The 4 existing Register tests — exact shape

`backend/src/SMCA.WebApi.E2ETests/RateLimiting/RateLimitPoliciesTests.cs` (89 lines, class `RateLimitPoliciesTests`, NO `[Collection]` attribute — see §6):

| Lines | Member | Purpose |
|---|---|---|
| `:13-22` | `private static HttpContext ContextWithIp(string? ip)` | Builds a `DefaultHttpContext`, sets `Connection.RemoteIpAddress` when non-null. |
| `:24-25` | `private static SlidingWindowRateLimiter BuildLimiter(RateLimitPartition<string> partition)` | Invokes the partition factory: `(SlidingWindowRateLimiter)partition.Factory(partition.PartitionKey)`. |
| `:27-35` | `private static SlidingWindowRateLimiterOptions OptionsOf(...)` | Reads the private `_options` field of `SlidingWindowRateLimiter` via reflection (BCL exposes no public options accessor). |
| `:38-46` | `Register_policy_options_match_production_config` | Asserts PermitLimit=10, Window=10min, SegmentsPerWindow=10, QueueLimit=0. |
| `:49-69` | `Register_policy_limiter_behavior_matches_options` | Asserts ReplenishmentPeriod=1min (Window/Segments), CurrentAvailablePermits=10, `AttemptAcquire(11)` throws `ArgumentOutOfRangeException` ("permit limit of 10"), `AttemptAcquire(10)` is acquired. |
| `:72-80` | `Register_policy_partition_key_is_per_ip` | Two IPs → distinct partition keys. |
| `:83-88` | `Register_policy_null_ip_maps_to_unknown_partition` | Null IP → `"unknown"`. |

These are NOT HTTP E2E tests — they unit-test the policy factory with a hand-built limiter (no WebAppFixture, no PostgreSQL).

### 3. Helpers location

All three helpers are private members of `RateLimitPoliciesTests.cs` itself. Grep over `backend/src/SMCA.WebApi.E2ETests/Infrastructure/` for `ContextWithIp|BuildLimiter|OptionsOf|RateLimit` → **0 matches**. No shared helper exists. A new Login test file that duplicates these ~20 lines does not touch any existing file.

### 4. Other rate-limited endpoints

Only login (`AuthController.cs:27`) and register (`AuthController.cs:102`) carry `[EnableRateLimiting]`. refresh/revoke are documented as an existing gap in `docs/testing/e2e-stage-1/README.md:284-286` (**H-13**). **Out of scope for this change** — note for the proposal, do not touch production.

### 5. Documentation to update (propose only, no edits here)

- `docs/testing/e2e-stage-1/README.md:96` — states "La política **Login** no tiene ninguno" (4 tests all Register). Would need a sentence once Login tests land.
- `docs/testing/e2e-stage-1/S1-02.md:82` — "**FALTA**: el rate limit de login en la capa .NET — no hay test de servidor que lo fije."
- `docs/testing/e2e-stage-1/S1-02-backend.md:27` — "Lo que sigue faltando es un test .NET que lo fije — el límite hoy solo lo prueba el navegador."
- `openspec/specs/rate-limiting/spec.md` — the whole spec is Register-only (capability "Register endpoint rate limiting", R1 = RegisterPolicy 10/10min). A Login capability/spec delta is a candidate once the change is formalized; not part of this exploration's scope decision.
- Root `README.md` is a 12-byte stub — nothing rate-limit related there.

### 6. Suite interaction / collection pattern

- `RateLimitPoliciesTests.cs` is **not** in `[Collection("e2e")]` and does not use `WebAppFixture` — the policy factory tests run without PostgreSQL (consistent with the xUnit default parallelization; no shared state).
- HTTP-level tests that hit `POST /v1/auth/login` (e.g. `Auth/AuthLoginFailureTests.cs:9-19`) DO use `[Collection("e2e")]` + `WebAppFixture` and require PostgreSQL (`WebAppFixture.cs:21-32`, migrations + data reset).
- A new Login **factory-parity** file should follow the `RateLimitPoliciesTests` pattern: **no collection, no fixture, no DB**. It stays green in any environment and cannot interfere with the e2e collection.
- **Requires authorization** (touches production): any option that would make a real HTTP 429 reachable under Testing would require changing `Program.cs:112-121` / `:157-160` (un-guard the rate limiter). Per the scope rules this is NOT included in the proposed scope; it is listed only as a tradeoff/decision point. NOTE: the existing Playwright spec `frontend-react/e2e/login-rate-limit.spec.ts` already proves the real 429 outside Testing (documented `S1-02.md:86-87`), so an HTTP 429 .NET test under Testing would duplicate evidence at the cost of production change.

---

## Proposed scope (parity with Register) — options and tradeoffs

### Option A — New file `RateLimiting/LoginRateLimitPoliciesTests.cs` (RECOMMENDED)

4 tests mirroring Register exactly, with the 3 private helpers copied (self-contained), targeting `RateLimitPolicies.Login`:

1. `Login_policy_options_match_production_config` — PermitLimit=5, Window=1min, SegmentsPerWindow=3, QueueLimit=0.
2. `Login_policy_limiter_behavior_matches_options` — ReplenishmentPeriod=20s (1min/3), CurrentAvailablePermits=5, `AttemptAcquire(6)` throws with "permit limit of 5", `AttemptAcquire(5)` acquired.
3. `Login_policy_partition_key_is_per_ip` — two IPs → distinct keys.
4. `Login_policy_null_ip_maps_to_unknown_partition` — null → `"unknown"`.

- Pros: adds zero risk to existing tests (nothing shared/modified); follows the existing file's exact pattern; runs without PostgreSQL; respects the E2E-untouchable rule verbatim.
- Cons: ~20 lines of helper duplication across two files (acceptable: pattern already self-contained; extracting shared helpers would require touching the existing test file → requires authorization).
- Effort: **Low** (single new file, ~80 lines, no production change, no new dependencies).

### Option B — Add Login tests to the existing `RateLimitPoliciesTests.cs`

- Pros: no duplication.
- Cons: modifies an existing E2E test file. Even though the 4 Register tests' behavior would not change, the file is in the protected zone ("touching any existing one in any way requires explicit authorization"). Also mixes two policies in one class name (`RateLimitPoliciesTests` is generic enough, but naming drift).
- Effort: Low, but **requires user authorization** per CLAUDE.md.

### Option C — HTTP-level 429 test under Testing (un-guard the limiter)

- Pros: would actually exercise `UseRateLimiter()` + `[EnableRateLimiting]` end to end.
- Cons: requires modifying production `Program.cs` (removing the `!IsEnvironment("Testing")` guards) — explicitly **requires authorization** and contradicts the backend test-coverage rule; would also expose the whole e2e suite to rate limiting (existing tests could start hitting 429s); duplicates evidence Playwright already provides.
- Effort: Medium-High. NOT recommended.

## Recommendation

**Option A** — new file `backend/src/SMCA.WebApi.E2ETests/RateLimiting/LoginRateLimitPoliciesTests.cs` with 4 parity tests and copied helpers, no `[Collection]`, no fixture. It delivers the missing "test .NET que fije el límite" (`S1-02-backend.md:27`) with zero risk to the protected surface. Documentation updates (README.md:96, S1-02.md:82, S1-02-backend.md:27) belong to the same change as docs-only work. refresh/revoke rate limiting (H-13) stays out of scope as a documented note.

## Risks

- **Risk 1**: Copying helpers instead of sharing them creates duplication; if a third policy appears, refactoring will require authorization because the original file is protected. Mitigate by documenting the choice in the proposal.
- **Risk 2**: A future contributor might assume the factory tests prove the HTTP 429 path. They do not — they pin the policy options/partition only. Keep the docs wording precise ("fija el límite", not "cubre el 429 HTTP").
- **Risk 3**: If someone picks Option C later, the e2e suite's rate-limit exposure could make unrelated tests flaky (login tests in the `e2e` collection). Do not go there without explicit user decision.

## Ready for Proposal

**Yes** — recommend Option A (new test file only). Tell the user: the change adds one new .NET test file (4 tests) pinning LoginPolicy 5/1min/3 + partition key, touches no production and no existing tests, requires no PostgreSQL to run, and includes docs-only updates in the three stage-1 files. refresh/revoke (H-13) is a separate, out-of-scope note.
