# Delta for s1-02-login-rate-limit

**Coverage-only delta.** ONE new .NET test file + 3 doc-line edits. No New or Modified Capabilities — consistent with the proposal: the `rate-limiting` spec (`openspec/specs/rate-limiting/spec.md`) is Register-behavior (R1 = RegisterPolicy 10/10min), not a coverage log; a LoginPolicy spec delta is a separate decision, out of scope.

**Scope rule — carried verbatim**: "In this backend test-coverage work, the agent may only ADD new E2E tests. If the work would require modifying production source code or existing E2E tests (backend), the agent MUST stop and notify the user for review and approval before touching anything." / "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

Domain: `rate-limiting` — coverage contract only, no capability delta.

## ADDED Requirements

### Requirement: New Login policy parity test file

A NEW file `backend/src/SMCA.WebApi.E2ETests/RateLimiting/LoginRateLimitPoliciesTests.cs` MUST be added, mirroring `RateLimitPoliciesTests.cs`: no `[Collection]`, no `WebAppFixture`, no PostgreSQL (pure factory tests, green in any environment). It MUST copy the three private helpers (`ContextWithIp`, `BuildLimiter`, `OptionsOf`, ~20 lines) rather than share them — extraction would modify the protected existing file. No existing test file MAY be modified.

#### Scenario: File lands additive and standalone

- GIVEN `RateLimitPoliciesTests.cs` pins only `Register` and no shared rate-limit helper exists
- WHEN the new file is added with copied helpers targeting `RateLimitPolicies.Login`
- THEN `git diff --stat` shows exactly 1 new test file + 3 doc files
- AND no existing E2E test or production file is touched

### Requirement: Options match production config

The Login policy options MUST be pinned as PermitLimit=5, Window=1min, SegmentsPerWindow=3, QueueLimit=0 — matching `RateLimitPolicies.cs:15-24`.

#### Scenario: Config parity

- GIVEN `RateLimitPolicies.Login` partition factory and a hand-built limiter
- WHEN options are read via the `OptionsOf` reflection helper
- THEN PermitLimit is 5, Window is 1 minute, SegmentsPerWindow is 3, QueueLimit is 0

### Requirement: Limiter behavior matches options

The built limiter MUST show ReplenishmentPeriod=20s (1min/3), CurrentAvailablePermits=5, and `AttemptAcquire(6)` MUST throw `ArgumentOutOfRangeException` ("permit limit of 5") while `AttemptAcquire(5)` acquires.

#### Scenario: Acquire within and beyond limit

- GIVEN a limiter built from the Login partition
- WHEN `AttemptAcquire(6)` is called
- THEN it throws `ArgumentOutOfRangeException` mentioning "permit limit of 5"
- AND `AttemptAcquire(5)` returns acquired

### Requirement: Partition key is per IP

Two different IP addresses MUST yield two distinct partition keys.

#### Scenario: Two IPs

- GIVEN `ContextWithIp("1.2.3.4")` and `ContextWithIp("5.6.7.8")`
- WHEN each context's partition key is produced
- THEN the keys are distinct

### Requirement: Null IP maps to "unknown"

A null `RemoteIpAddress` MUST produce the partition key `"unknown"`, matching the production fallback `?? "unknown"`.

#### Scenario: Null IP

- GIVEN a context with no `RemoteIpAddress`
- WHEN the partition key is produced
- THEN it equals `"unknown"`

### Requirement: Coverage boundary — factory pins options/partition, not HTTP 429

The new file MUST pin policy OPTIONS and PARTITION only. The real HTTP 429 MUST remain proven by Playwright (`frontend-react/e2e/login-rate-limit.spec.ts`); making 429 reachable under Testing would require un-guarding the limiter in `Program.cs` (`:112-121`, `:157-160`) — a production change, out of scope. Doc wording MUST say "fija el límite", never "cubre el 429 HTTP".

#### Scenario: Boundary is documented, not re-tested

- GIVEN the new factory tests pass
- WHEN a reader checks the docs coverage statement
- THEN the HTTP 429 path is credited to Playwright and factory pinning to the new file
- AND no production code is changed to reach 429 under Testing

### Requirement: Docs coverage-state updates

`docs/testing/e2e-stage-1/README.md:96`, `S1-02.md:82`, and `S1-02-backend.md:27` MUST be updated to coverage-state only with verified wording: "Login no tiene ninguno" / "FALTA …" / "solo lo prueba el navegador" → Login now covered by 4 .NET tests. Edits MUST NOT invent runs or results.

#### Scenario: Docs reflect real coverage

- GIVEN the new file with 4 green tests
- WHEN the three docs are updated
- THEN each states Login has 4 .NET tests pinning options/partition
- AND no run is claimed beyond what the suite executed

## Non-Goals (explicit)

- Real HTTP 429 .NET E2E under Testing: OUT — requires un-guarding the limiter (production change; Playwright already proves it outside Testing).
- H-13 refresh/revoke rate limiting: OUT — note only (`README.md:284-286`).
- `LoginPolicy` delta in `openspec/specs/rate-limiting`: OUT — separate decision.
- Production (`Program.cs`, `AuthController.cs`, `RateLimitPolicies.cs`) and existing tests (`RateLimitPoliciesTests.cs` et al.): untouched.
