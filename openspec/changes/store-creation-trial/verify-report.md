```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:c6c924b21529592ed5f7a8ccb36bd1f98c634ce170bb8593dec51a614fbd22ba
verdict: pass
blockers: 0
critical_findings: 0
requirements: 9/9
scenarios: 36/36
test_command: dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~StoreCreationTrial|FullyQualifiedName~StoreActivation|FullyQualifiedName~RegisterStorePayment"
test_exit_code: 0
test_output_hash: sha256:c6c924b21529592ed5f7a8ccb36bd1f98c634ce170bb8593dec51a614fbd22ba
build_command: dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-restore
build_exit_code: 0
build_output_hash: sha256:af17e2255de94bc2dd7fc7930465a020b1a8efc9e557c34479295665d49f7589
```

## Verification Report

**Change**: store-creation-trial — "Every Created Store Starts Its Trial Clock (Backend)"
**Branch**: `feat/e2e-s2-01-backend` (change code already on `main`, ancestor of HEAD: commits `855a38c0..61089680`)
**Mode**: Verification of already-merged implementation against spec/design/tasks (22/22 tasks `[x]`)
**Scope rule**: VERIFY phase performs no code edits — inspection + test execution only. No production source, no existing E2E test, no support file touched (see Purity).

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 22 (14 work-unit boxes WU1–WU9 + 8 success criteria) |
| Tasks complete | 22 |
| Tasks incomplete | 0 |

All 22 boxes are `[x]` in `tasks.md`; the 7 success-criteria evidence blocks cite `file:line` that was re-verified line-by-line (see Task Coverage), and task 8 (user confirms green) was closed by the user on 2026-08-11 ("Confirmo: sigo a verify") on the 24/24 + 28/28 observed evidence — reproduced in this verify with fresh runs.

### Build & Tests Execution (fresh, 2026-08-11 second pass — real PostgreSQL `localhost:5432`, db `smca_test`)

**Build**: ✅ `dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-restore` → exit 0, 0 errors (4 warnings, all pre-existing package-vulnerability notices NU1903/NU1902).

```text
Build succeeded.
    4 Warning(s)
    0 Error(s)
```

**Tests — full E2E assembly (regression)**: ✅ **342 passed / 0 failed / 0 skipped** — `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-build` → exit 0, output hash `sha256:270c08abff3ff416611eed1dcb3386b54d1c129d15f47d16b284bc4b529afa8c`. Covers all 18 `StoreCreationTrialTests` + all 3 `StoreActivationTests` + every billing/auth/stores suite (69 classes, `[Collection("e2e")]`, sequential). The `[ERR]`/`WRN` log lines are expected negative-path assertions (duplicate-login seeds, forced 4xx/5xx paths) — the run reports 0 failures.

**Tests — focused E2E (change suites)**: ✅ **24 passed / 0 failed / 0 skipped** (18 StoreCreationTrial + 3 StoreActivation + 2 RegisterStorePaymentTests + 1 RegisterStorePaymentValidationTests) — exit 0, output hash `sha256:c6c924b21529592ed5f7a8ccb36bd1f98c634ce170bb8593dec51a614fbd22ba`.

```text
Passed!  - Failed:     0, Passed:    24, Skipped:     0, Total:    24, Duration: 8 s - SMCA.WebApi.E2ETests.dll (net8.0)
```

**Tests — full unit assembly (regression)**: ✅ **330 passed / 0 failed / 0 skipped** — `dotnet test backend/src/Application.Tests/Application.Tests.csproj --no-build` → exit 0, output hash `sha256:78fa23eeb0082381d28135a472c976ea74ec89aa6e672fa0e643d61d8e5f62bb`. Includes all BillingService/GetMe/RegisterStorePayment store-creation unit tests.

**Tests — unit collateral**: ✅ **28 passed / 0 failed / 0 skipped** — `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~CreateStoreServiceTests"` → exit 0, output hash `sha256:4bf40d871b1882f324ef17dc6462d0ccfe02eb6323555650d979d946b1279554`.

```text
Passed!  - Failed:     0, Passed:    28, Skipped:     0, Total:    28, Duration: 67 ms - Application.Tests.dll (net8.0)
```

**Runtime harness**: real PostgreSQL (WebAppFixture applies migrations itself); real HTTP admin-create / self-register / `/auth/me` / to-collect / payments flows executed against the app under pinned clock (`MutableDateTimeProvider.Pin`) and pinned config (`BillingConfigSeed.PinAsync`).

### Spec Compliance Matrix

Authoritative counts (from the two delta specs): **9 requirements / 36 scenarios** — `specs/billing/spec.md` (4 requirements: Domain Model `Store.PaymentStartDate` [6 scenarios], R4 Enforcement/PlanType [4 scenarios], to-collect free-plan zero-amount [1], free-only Vencido while owing $0 [1] = 12 scenarios) and `specs/billing-e2e-coverage/spec.md` (5 requirements: StoreCreationTrialTests suite [18], pin SystemConfiguration rows [1], R8 update activation [3], R9 stats module price [1], StoreActivationTests unchanged [1] = 24 scenarios).

| Requirement | Scenarios | Coverage | Result |
|-------------|-----------|----------|--------|
| Domain Model: `Store.PaymentStartDate` — creation sets today unconditionally, both entry points; client cannot seed; legacy rows untouched | 6 | E2E tests 1–6 + 18 (`StoreCreationTrialTests.cs:214-283, 332-345, 660-674`); unit `CreateStoreServiceTests.cs:155-195` | ✅ COMPLIANT — 6/6 via passing tests |
| R4: Enforcement — Overdue Downgrade + `CurrentUserDto.PlanType` | 4 | Paid `PlanType` wire: test 7 (`:361`); Free plan type: `BillingServiceTests.cs:126` (unit, green); overdue downgrade: test 14 (`:520-521`); paid full access: `GetMeBillingTests.cs:90-91` / `GetMeBillingStatesTests.cs:86-87,118-119` (pre-existing, green in 342-run) | ✅ COMPLIANT — 4/4 via passing tests |
| Free-plan stores surface in to-collect at Amount = 0 (accepted consequence) | 1 | Test 16 (`:580-582`) | ✅ COMPLIANT — 1/1 |
| Free-only stores may report Vencido while owing $0 (all modules retained) | 1 | Tests 13–14 (`:479-495, 498-527`) | ✅ COMPLIANT — 1/1 |
| StoreCreationTrialTests suite (18 scenarios A–F) | 18 | 18 `[Fact]`s, all passing in both filtered (24-run) and full (342-run) | ✅ COMPLIANT — 18/18 |
| Suite MUST pin SystemConfiguration rows (TestingPeriodInMonths/PaymentGraceDays/DueSoonDays) | 1 | `BillingConfigSeed.cs:37-55,110-133`; pinned in every config-dependent test (7–17); restore-delete for the absent Id-4 row | ✅ COMPLIANT — 1/1 |
| R8: PUT /stores/{id} activation on first paid (unchanged) | 3 | `StoreActivationTests.cs:37,71,105` — byte-identical to main, all passing | ✅ COMPLIANT — 3/3 |
| R9: Statistics module price 1000 (unchanged) | 1 | Pre-existing activate test, green in 342-run | ✅ COMPLIANT — 1/1 |
| StoreActivationTests remains unchanged | 1 | `git diff main -- StoreActivationTests.cs` empty (byte-identical); 3/3 passing | ✅ COMPLIANT — 1/1 |

**Compliance summary**: 9/9 requirements, 36/36 scenarios covered by passing runtime tests (fresh full-suite evidence, not only accredited prior runs).

### Correctness (Static Evidence — line-by-line re-verification)

**WU1 — creation always starts the clock** — ✅ Implemented
- `CreateStoreService.cs:20,24` — `IDateTimeProvider` is the 8th/last ctor param with `_dateTimeProvider` field; `:42-43` — `Store.Create(name, ownerId, approved, tenantId, DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime), address, description)`; no `null` in the 5th positional arg. Expression character-identical to `UpdateStoreCommand.cs:97`.
- `RegisterStorePaymentCommand.cs:67` — comment-only refresh ("Legacy rows can still carry a null start date (no migration/backfill); new stores always carry one."); guard `:68-69` (`PaymentStartDate is null` → 400) byte-identical.
- Collateral `CreateStoreServiceTests.cs`: mock at `:32,48`; `FixedNow` `:37`; default `UtcNow` setup `:76-78` (mandatory per D11 — proven by the 28/28 green run); `CreateService()` 8-arg call `:55-63`; renamed test `:155` with provider-today assert `:171`; optional clock-triangulation test `:175-195`.

**WU2 — PlanType on /auth/me** — ✅ Implemented
- `CurrentUserDto.cs:23` — `public string PlanType { get; set; } = "Free";` positioned after `PaymentStatus` (`:22`).
- `GetMeQuery.cs:104` — `PlanType = billing.PlanType,` adjacent to `PaymentStatus = billing.Status.ToString(),` (`:103`). No mapping profile touched.
- `BillingService.cs:53` — store-not-found early return adds `PlanType = "Free"` (scope addition per D4, accepted); `:58` — `hasPaidModule && PaymentStartDate is not null ? "Paid" : "Free"`; `:104` — summary exposure. Cache keys `:63-65` match `BillingConfigSeed.CacheKeys` exactly.

**WU3 — BillingConfigSeed** — ✅ Implemented
- `BillingConfigSeed.cs:24-135` — `PinAsync` returns `IAsyncDisposable` (`:37-55`); snapshot-as-(Id, string?) with `null` = row absent (`:57-68`); upsert enter (`:77-90`); dispose restores via conditional DELETE-if-absent (`:118-124`) / UPDATE-if-present (`:125-128`); cache eviction on both paths with the three literal keys (`:35,92-97`). Matches D2/D3 and the migration-collision trap documentation.

**WU4–WU9 — StoreCreationTrialTests (18 tests)** — ✅ Implemented
- File-level: `[Collection("e2e")]`, WebAppFixture ctor, header two-pin trap comment (`:24-37`), anchors `:46-47,52` (`AnchorInstant` 2026-03-10; test 5 uses near-wall-clock `AnchorCloseInstant` per D6), flat `using var` pins throughout, `try/finally` cleanup in every test, `AsNoTracking` DB reads (`:179-185`), unique names, local helpers only.
- Group A (1–5): `:214-325` — persisted `Start` asserts at `:224,241,259,275-277`; test 5 asserts `200 OK` first at `:314`, then unchanged `:316-318`, OwnerAdmin actor via `AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true)`.
- Group B (6–7): `:332-369` — register path; test 7 asserts `IsInTrial=true` `:358`, `PlanType="Paid"` `:361`, `AlDia` `:362`, `PaymentDueDate = Start.AddMonths(2)` `:363`, under `BillingConfigSeed.PinAsync` `:351`.
- Group C (8–14): `:380-527` — day one `:389-390`; trial ends at +1mo+1d `:407-410` (two flat pins); first due +2mo `:428`; PorVencer at due-5 `:445-447`; EnGracia both boundaries `:466-470`; Vencido at due+6 `:487-489`; module filter Contains/NotContain `:520-521` with precondition asserts `:517-518`.
- Group D (15–16): `:534-589` — non-membership by id `:551`; free-only admin-created store present with `Amount == 0` `:580-582` (at `due-3`, uncached path, config pinned).
- Group E (17): `:596-653` — HTTP 200 `:612`, `Succeeded=true`/`Data=true` `:614-615`, `Price == 6 * 500f` `:628` with the six-module derivation comment `:624-627` (**3000 — the corrected value, not 500**), `PaymentBeforeDate = Start.AddMonths(3)` `:631`, Year/Month `:632-633`, `StorePaymentStatusId == Paid` `:634`, `ByReSeller == false` `:635`, `CurrentMonthAmount` deliberately not asserted `:637-639`.
- Group F (18): `:660-674` — direct `BillingSeed.SeedFreeStoreAsync` seed (bypasses creation path, `paymentStartDate: null`), persisted value stays null `:668`.

**Supporting facts re-verified by reading** (design D1–D10 dependencies): `Store.cs:33,62-63` (`DateOnly?` + 5th positional arg); `RegisterCommand.cs:73,82,91` (register assigns all modules via `GetAvailableModulesToStore`, shares `CreateStoreAsync`, sets `SelectedStoreId`); `StoreBillingUtils.cs:28,33,35-38,44-45,55-61` (due/trial/status/filter formulas); `StoreBillingSummary.cs:9` (PlanType); `BillingSeed.cs:50` (`paymentStartDate: null` seed); `UpdateStoreCommand.cs:26,71-72,96-97,100-101` (Dto nullable field, SuperAdminOrOwnerAdmin guard, activation conditional surviving, SuperAdmin-only explicit date).

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 — ctor append + identical date expression | ✅ Yes | `CreateStoreService.cs:24,42-43`; expression identical to `UpdateStoreCommand.cs:97` |
| D2 — per-test disposable config pin with delete-restore | ✅ Yes | `BillingConfigSeed.cs:37-55,110-133`; Id-4 restore-to-absent implemented |
| D3 — evict the 3 cache keys, both paths | ✅ Yes | `:35,92-97`; literals match `BillingService.cs:63-65` |
| D4 — PlanType DTO + mapping + early-return "Free" | ✅ Yes | `CurrentUserDto.cs:23`; `GetMeQuery.cs:104`; `BillingService.cs:53` (flagged scope addition) |
| D5 — comment-only on payment guard | ✅ Yes | `RegisterStorePaymentCommand.cs:67`; guard intact `:68-69` |
| D6 — test 5 live gate, 200-OK-first, near-now anchor | ✅ Yes | `:286-325` (`AnchorCloseInstant` `:52`, `200` at `:314`) |
| D7 — shared anchor, flat two-pin idiom, header trap comment | ✅ Yes | `:24-37,46-47`; tests 9/11/12/13/14 use flat re-pins |
| D8 — admin endpoint for small module sets; register for paid lifecycle | ✅ Yes | tests 2/3/5/14/16 admin-created; 6–13,15,17 register |
| D9 — payment advances start+2mo → start+3mo; Price 3000 | ✅ Yes | `:628-635`; derivation comment present |
| D10 — house shape, local helpers, AsNoTracking reads, try/finally | ✅ Yes | throughout |
| D11 — unit collateral mechanics | ✅ Yes | mock/default/factory/renamed test + optional triangulation |
| D12 — no test deletions, no migration, no gates, no fixes | ✅ Yes | `StoreActivationTests` byte-identical; no EF migration files |

No deviations from design D1–D12.

### Non-Goals Honored
- ✅ `UpdateStore` activation-on-first-paid conditional survives (`UpdateStoreCommand.cs:96-97`).
- ✅ No test deletions in `StoreActivationTests` (3/3 present, byte-identical to main).
- ✅ No `hasPaidModule` gate on to-collect; free-plan Amount=0 pinned by test 16.
- ✅ No EF migration / backfill (`Store.PaymentStartDate` stays `DateOnly?`, `Store.cs:33`).
- ✅ `StoreBillingUtils` math untouched; `Math.Max(1,…)` divergence and `CurrentMonthAmount` divergence recorded, not fixed (D3/D9).
- ✅ Cache-key literals duplicated, not extracted (D3).

### Purity
`git status --porcelain` on `feat/e2e-s2-01-backend`:
```text
 M openspec/changes/store-creation-trial/tasks.md
```
The only working-tree change is the apply phase's `[x]` marking in `tasks.md` (docs, not code). This VERIFY phase ran tests and wrote this report only — zero production source, zero existing test, zero support-file edits. `git diff main -- backend/src/SMCA.WebApi.E2ETests/Billing/StoreActivationTests.cs` is empty (byte-identical to main).

### Task Coverage
All 14 work-unit task boxes (WU1–WU9) showed `[x]`; evidence citations re-verified as accurate against current line numbers (see Correctness). All 8 success criteria `[x]` with evidence re-confirmed by fresh runs: creation writes today for admin + register (`:224,241,259,339` + `CreateStoreServiceTests.cs:171`); non-SuperAdmin cannot seed (`:314-318` + `UpdateStoreCommand.cs:100-101`); `GET /auth/me` PlanType (`CurrentUserDto.cs:23`, `GetMeQuery.cs:104`, `BillingService.cs:53,104`; wire asserted `:361`); group-C boundaries under pinned clock + config (342-run green); register-payment at 3000 (`:628`); legacy rows stay null (`:668`); `StoreActivationTests` 3/3 passing and byte-identical; user confirmation reproduced (24/24 + 28/28 → full 342/342 + 330/330 re-run green on the same branch state).

### Issues Found
**CRITICAL**: None.
**WARNING**: None.
**SUGGESTION**:
1. The E2E suite asserts the `"Paid"` branch of the new wire field only (`StoreCreationTrialTests.cs:361`). The `"Free"` branch of `CurrentUserDto.PlanType` is covered at unit level (`BillingServiceTests.cs:126`, green in the 330-run) and by code reading of `BillingService.cs:58`, but no E2E `/auth/me` assertion pins `PlanType == "Free"` on the wire. Optional future parity — not required by these 18 scenarios.
2. `specs/billing-e2e-coverage/spec.md` group-C baseline text uses absolute dates `start = 2026-01-10` → `due = 2026-03-10`, while the implementation (and `design.md` D7, `tasks.md` WU4) uses anchor `2026-03-10` → due `2026-05-10`. All relative assertions match (`+2mo`, `-5d`, `+1..+5d`, `+6d`); the absolute dates are baseline illustrations. Recommend aligning the absolute dates to `2026-03-10`/`2026-05-10` during the archive doc-sync so the delta→baseline copy carries consistent numbers.
3. The no-selected-store early return `PlanType = "Free"` (`BillingService.cs:53`) has no test asserting the wire result for a user without a selected store — explicitly accepted in design D4 ("blast radius is nil"; no pre-existing test asserts the null-store path). Recorded here as a known untested edge, not a defect.
4. Build output flags pre-existing package vulnerabilities (NU1903 AutoMapper 13.0.1; NU1903 System.Text.Json 8.0.1; NU1902 RestSharp 110.2.0) — unrelated to this change; surfaced for the dependency-upgrade backlog.

### Verdict
**PASS** — 9/9 requirements and 36/36 scenarios covered by passing runtime tests; full regression green on fresh evidence (E2E 342/342, unit 330/330; focused 24/24 + 28/28); build 0 errors; `StoreActivationTests` byte-identical to main; purity confirmed (verify wrote no code); zero findings above SUGGESTION.

### Delivery Note
- **Scope**: change code lives on `main` (ancestor of HEAD); this phase added only the verify-report artifact.
- **Readiness**: `archive` — the delta specs can be synced to `openspec/specs/`; apply SUGGESTION 2's absolute-date alignment during that sync.
- **Risk**: LOW — production behavior proven live against real PostgreSQL across the whole E2E assembly; remaining suggestions are coverage/doc-parity only.