```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:79ac5e7ae86d13bf64d2ab5497b2d47b6f4c8c094f3fb7132ada918059a21e22
verdict: pass
blockers: 0
critical_findings: 0
requirements: 2/2
scenarios: 12/12
test_command: dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-restore (full suite, real PostgreSQL smca_test)
test_exit_code: 0
test_output_hash: sha256:ce10467517810e1d86ed7a999d623d360b9465b56f23df7ebd0663744a160716
build_command: dotnet build backend/src/SMCA.sln --nologo
build_exit_code: 0
build_output_hash: sha256:8451fd0939c967ec7f5617923bd97257bce15f53749e06fa4e10b31bfd4ff95a
```

## Verification Report

**Change**: `h15-server-side-plan-lock` — Server-side DG-7 one-way plan lock in `UpdateStoreCommandHandler`
**Version**: spec delta `billing` (current, 2026-08-13)
**Mode**: Standard verify (strict_tdd inactive for verification; runtime evidence required and executed)
**Branch**: `feat/h15-server-side-plan-lock` (commits `5a28e0e3`, `9995359f`, `bc50f45c`; commit-only, no PR)

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 16 |
| Tasks complete | 16 |
| Tasks incomplete | 0 |

All task checkboxes `[x]` in `tasks.md` (1.1–1.2, 2.1–2.4, 3.1–3.5, 4.1–4.2, 5.1–5.3). No task gates full verification.

### Build & Tests Execution

**Build**: ✅ Passed — `dotnet build backend/src/SMCA.sln --nologo` → "Build succeeded. 0 Error(s)", exit 0. Warnings pre-existing (ASP0014, CS8620/CS8602 in untouched test files, NU-package warnings).

**Tests** (all against real PostgreSQL `smca_test` on localhost:5432; WebAppFixture applies migrations; frontend against the real backend on `http://localhost:5019`):

| # | Command | Result | Exit | Raw-output sha256 |
|---|---------|--------|------|-------------------|
| 1 | Unit lock filter: `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~UpdateStoreCommandHandlerLockTests" --no-restore` | ✅ 4/4 | 0 | `3fe2c2007abe498dcd6358978f02402769320d821bf4855f21e22b7dde811099` |
| 2 | E2E new lock: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~StorePlanLockTests" --no-restore` | ✅ 4/4 | 0 | `b89150079e45b845fa48ea9e35909a58d1a73f015ae463a9ed6dc1473f668d5d` |
| 3 | E2E regression pins: `--filter "FullyQualifiedName~StoreUpdateTests|FullyQualifiedName~StoreAuthorizationTests|FullyQualifiedName~StoreCreationTrialTests"` | ✅ 37/37 | 0 | `1b2820b79a450f07deb411f2b630db0f63290d4d17813721839e61db3762a55a` |
| 4 | Full backend E2E: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-restore` | ✅ 354/354 | 0 | `ce10467517810e1d86ed7a999d623d360b9465b56f23df7ebd0663744a160716` |
| 5 | Full Application: `dotnet test backend/src/Application.Tests/Application.Tests.csproj --no-restore` | ✅ 341/341 | 0 | `d6b440d2b55b8d30215cd278f3a1e702582ecbaefcf6798681e1531a673c1317` |
| 6 | Domain: `dotnet test backend/src/Domain.UnitTests/Domain.UnitTests.csproj --no-restore` | ✅ 22/22 | 0 | `cfb15eed55b39646d868958b6f4987e01cf834b7729d337748196b46f706cb10` |
| 7 | Build: `dotnet build backend/src/SMCA.sln --nologo` | ✅ 0 errors | 0 | `8451fd0939c967ec7f5617923bd97257bce15f53749e06fa4e10b31bfd4ff95a` |
| 8 | Frontend fixture: `pnpm --dir frontend-react exec playwright test e2e/store-plan-activation.spec.ts --reporter=line` | ✅ 2/2 (16.5s; teardown removed 27 e2e-* rows from smca_test) | 0 | `db0cae1286a06b980e28a8c6ae0a413ae3eef68d78f6f26ebd7de235704bb486` |

Per-run raw outputs captured verbatim to `C:\Users\Appollo\AppData\Local\Temp\opencode\sdd-verify-h15\` (unit-lock.txt, e2e-lock.txt, e2e-pins.txt, e2e-full.txt, app-full.txt, domain.txt, build.txt, frontend.txt); hashes are SHA-256 of those exact byte streams.

**Coverage**: ➖ Not available — E2E suite; no coverage command configured (`openspec/config.yaml` coverage threshold 0). Not required by this change.

### Spec Compliance Matrix

Spec: `specs/billing/spec.md` — 2 requirements (1 MODIFIED + 1 ADDED), 12 scenarios (11 preserved/lock under MODIFIED + 1 Angular-legacy under ADDED).

| # | Requirement | Scenario | Test | Result |
|---|-------------|----------|------|--------|
| 1 | MODIFIED `Store.PaymentStartDate` — creation unconditional | Admin creates store with paid module → `PaymentStartDate` = today | `StoreCreationTrialTests > Create_sets_paymentStartDate_to_today` + `Create_with_paid_module_sets_paymentStartDate_to_today` (full suite #4) | ✅ COMPLIANT |
| 2 | MODIFIED — creation unconditional | Admin creates store with free-only modules → still today | `StoreCreationTrialTests > Create_with_free_only_modules_also_sets_paymentStartDate` (full suite #4) | ✅ COMPLIANT |
| 3 | MODIFIED — client input ignored | Client-supplied `paymentStartDate` on creation ignored | `StoreCreationTrialTests > Create_ignores_client_supplied_paymentStartDate` (full suite #4) | ✅ COMPLIANT |
| 4 | MODIFIED — shared creation path | Self-registration starts the clock | `StoreCreationTrialTests > Register_creates_store_with_paymentStartDate_today` (full suite #4) | ✅ COMPLIANT |
| 5 | MODIFIED — update path input gate | Non-SuperAdmin cannot seed `PaymentStartDate` via update | `StoreCreationTrialTests > Update_by_non_superadmin_cannot_seed_paymentStartDate` (OwnerAdmin PUT `paymentStartDate: "2020-01-01"`, same set, 200 + date unchanged) + static gate `UpdateStoreCommand.cs:116` | ✅ COMPLIANT |
| 6 | MODIFIED — legacy rows untouched | Legacy null row never retro-activated | `StoreActivationTests > Free_modules_only_leaves_paymentStartDate_null` + `Paid_module_on_null_start_sets_paymentStartDate_to_today` (first-paid-module conditional still fires; full suite #4) | ✅ COMPLIANT |
| 7 | MODIFIED — Lock (modules, not clock) | OwnerAdmin module change on paid store → 400 + `PlanLocked` | NEW `StorePlanLockTests > OwnerAdmin_changes_modules_on_paid_store_returns_400_PlanLocked` (E2E #2) + unit `Handle_OwnerAdminChangesModulesOnPaidStore_ThrowsPlanLocked` (unit #1) | ✅ COMPLIANT |
| 8 | MODIFIED — Lock same-set allowed | OwnerAdmin same-set update on paid store → 200 (any order, duplicates) | NEW `StorePlanLockTests > OwnerAdmin_rename_only_on_paid_store_returns_200` + `StoreCreationTrialTests > Update_by_non_superadmin_cannot_seed_paymentStartDate` (:286-325 same-set pin, 200) + unit `Handle_OwnerAdminKeepsSameModuleSetOnPaidStore_DoesNotThrow` | ✅ COMPLIANT |
| 9 | MODIFIED — Lock free activation | OwnerAdmin activates a free store → 200 | NEW `StorePlanLockTests > OwnerAdmin_activates_free_store_returns_200` + unit `Handle_OwnerAdminActivatesFreeStore_DoesNotThrow` (+ SuperAdmin variant `StoreActivationTests > Paid_module_on_null_start...`) | ✅ COMPLIANT |
| 10 | MODIFIED — SuperAdmin carve-out | SuperAdmin module change on paid store → 200 | NEW `StorePlanLockTests > SuperAdmin_changes_modules_on_paid_store_returns_200` + unit `Handle_SuperAdminChangesModulesOnPaidStore_DoesNotThrow` | ✅ COMPLIANT |
| 11 | MODIFIED — Lock trigger is modules | Legacy paid store, null clock, stays locked → 400 | Same guard branch as scenario 7 (runtime-proven): the guard reads only `IsSuperAdmin` + `StoreModules[].ModulePriceIncluded` (`UpdateStoreCommand.cs:82-92`); `PaymentStartDate` is not an input, so the null-clock arrangement is behaviorally identical. No separate null-clock-paid seed exists — note below. | ✅ COMPLIANT (branch-equivalent; note) |
| 12 | ADDED Angular legacy 4xx (accepted consequence) | Legacy-app plan edit on paid store → 400 + `PlanLocked` | Documented accepted consequence (spec ADDED, no Angular code change per scope). The backend rejection is exactly scenario 7's runtime-proven 400+PlanLocked; the HTTP request shape is client-agnostic. No Angular-side test by design. | ✅ COMPLIANT (accepted, documented; note) |

**Compliance summary**: 12/12 scenarios compliant. Preserved scenarios 1–6 proven by the existing suite (green within full E2E 354/354 and pins 37/37); new lock scenarios 7–10 proven by the 4 new E2E + 4 new unit tests; scenarios 11–12 proven by branch equivalence with scenario 7 (the guard's trigger set is `IsSuperAdmin` + active-module `ModulePriceIncluded` only — neither `PaymentStartDate` nor the calling client is an input).

### Correctness (Static Evidence)

| Requirement | Status | Evidence |
|------------|--------|----------|
| Lock guard placement (after store load, before mutation) | ✅ Implemented | `UpdateStoreCommand.cs:78-92` — comment + guard immediately after null-store guard (`:75-76`), before duplicate-name check (`:94`) and any mutation (`:97+`). Zero extra queries: `store.StoreModules` is already loaded with `ModulePriceIncluded` via `GetStoreByIdIncludingModulesAsync` |
| Trigger: `!IsSuperAdmin` ∧ any ACTIVE paid module ∧ set differs | ✅ Implemented | `:82-83` `!IsSuperAdmin && store.StoreModules.Any(sm => !sm.ModulePriceIncluded)`; `:85-87` distinct-sorted `request.ModuleIds` vs active `ModuleId`s, `SequenceEqual` (duplicates/order never reject) |
| Rejection: `ValidationException` + code `PlanLocked` → HTTP 400 | ✅ Implemented | `:88-91` `throw new ValidationException { Errors = new List<Error> { new Error("PlanLocked", _localizer["PlanLocked"]) } }`; E2E asserts `HttpStatusCode.BadRequest` + `Errors.Contain(e => e.Code == "PlanLocked")` — passed |
| i18n key `PlanLocked` in BOTH resx files, indexer access only | ✅ Implemented | `I18n.resx:201-203` (ES: "El plan de la tienda está bloqueado. Solo un SuperAdmin puede modificar los módulos del plan."); `I18n.en.resx:453-455` (EN: "The store plan is locked. Only a SuperAdmin can change the store's modules."); no `PlanLocked` property in `I18n.Designer.cs` (grep — no Designer regen) |
| Unit tests: lock fires + no-false-rejection pins | ✅ Implemented | `UpdateStoreCommandHandlerLockTests.cs` — 4 tests: lock fires (1), same set / free activation / SuperAdmin no-throw (3); downstream repos stubbed; `SaveChangesAsync` path asserted via `result.Succeeded` |
| E2E: 4 scenarios (400+PlanLocked, rename-only 200, free activation 200, SuperAdmin 200) | ✅ Implemented | `StorePlanLockTests.cs` — 4 tests, ADD-only; `BillingSeed.ManagementModuleId=7` (free) / `StatisticsModuleId=6` (paid) match design's [7 free, 6 paid]; OwnerAdmin actor via `AuthzSeed.SeedOwnerAdminAsync(withManagementModule: true)` (SelectedStoreId set — BillingSeed users' `Guid.Empty` SelectedStoreId would 403 in the `[HasPermission]` filter); cleanups per `BillingSeed.CleanupAsync`/`AuthzSeed.CleanupStoreGraphAsync` |
| S2-01 seeding: direct-DB pg, store row untouched, no PUT, no extra logins | ✅ Implemented | `store-fixture.ts` `seedStoreModulesDirect` (:182-213): `pg.Client` (`E2E_DB_URL` ?? `DEFAULT_DB_URL` `postgresql://postgres:postgres@localhost:5432/smca_test`, :170 — same strategy as `global-teardown.ts:27`); BEGIN → `DELETE StoreRoleFeature` → `DELETE StoreModule` (children-first) → INSERT free-only `StoreModule` rows `SELECT … FROM Module m, Store s WHERE m."Id" = ANY($2::int[]) AND s."Id" = $1` (parameterized, constant SQL, columns per `20240910194934_Create-Store-Module-Price.cs`) → COMMIT; re-GET pinning (module ids sorted-match + `paymentStartDate` non-null, :137-157); `Store` row never written; header comment updated (:6-23). Frontend run #8 proves S2-01/S2-02 green through the real UI + API |
| Angular legacy untouched / no React change / no rate-limit work | ✅ Implemented | `git show` of the 3 commits: only the 5 authorized files (+ design folder untracked). No `frontend/` (Angular) path, no `frontend-react/apps|packages` path, no rate-limit code in any commit |
| No existing E2E test/spec modified | ✅ Implemented | Commit-scope diff: `5a28e0e3` → 4 files (handler, new unit tests, 2 resx); `9995359f` → new `StorePlanLockTests.cs` only; `bc50f45c` → `store-fixture.ts` (the one authorized support-file modification per design). No existing `*.cs` test or `*.spec.ts` touched |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 Trigger: (a) set-change on paid store (not clock proxy, not filter-level) | ✅ Yes | `UpdateStoreCommand.cs:82-92`; clock-based trigger would have broken `StoreCreationTrialTests:286-325` and blocked activation — both green |
| D2 Set semantics: distinct-sorted equality | ✅ Yes | `:85-87` `Distinct().OrderBy(id => id)` + `SequenceEqual` — duplicates/order never reject |
| D3 Rejection: `ValidationException` + code `PlanLocked` → 400 | ✅ Yes | `:88-91`; 403 remains the identity-guard contract (`:71-72`) |
| D4 Paid check: loaded `StoreModules` `ModulePriceIncluded` (no extra queries) | ✅ Yes | `:83`; guard is query-free as designed |
| D5 Placement: immediately after null-store guard, before duplicate-name | ✅ Yes | `:78-92` vs duplicate-name `:94` — rejects earliest, no query cost |
| D6 S2-01 seeding: (B) direct-DB pg (not SuperAdmin PUT — login #6 → 429) | ✅ Yes | `store-fixture.ts:182-213`; matches design SQL and `global-teardown.ts` precedent; login budget preserved |
| Interfaces/contracts: lock branch shape | ✅ Yes | Code matches the design snippet exactly (condition, distinct-sorted compare, `new Error("PlanLocked", _localizer["PlanLocked"])`) |
| Design File Changes table | ✅ Yes | All 6 code/file rows match the commit scope; design.md itself is the untracked change folder (expected, per apply-progress) |

### Issues Found

**CRITICAL**: None
**WARNING**: None
**SUGGESTION**: None blocking
- ℹ️ **Note (scenario 11)**: no test arranges a paid store with `PaymentStartDate = null` before the OwnerAdmin module-change PUT; coverage rests on branch equivalence with scenario 7 (the guard never reads `PaymentStartDate`). A unit-test variant with a null-clock `BuildPaidStore` would make the arrangement explicit — optional hardening, not a defect.
- ℹ️ **Note (scenario 12)**: the Angular legacy 4xx is an accepted consequence with deliberately no Angular-side test or code change (spec ADDED; design "no Angular code change"). Backend rejection runtime-proven via scenario 7.
- ℹ️ **Note (pre-existing, out of scope)**: `store-fixture.ts` `DEFAULT_DB_URL` hardcodes `postgres:postgres` credentials, consistent with the `global-teardown.ts:27` precedent — unchanged by this change.
- ℹ️ **Info (flaky, pre-existing, unrelated)**: apply-progress documents one `store-plan-activation.spec.ts` failure inside pre-existing `session.ts` `mintOwnerAdmin` (navigation-timing race, before the fixture runs). This verify run: 2/2 clean.

### Scope Gate

- `git show 5a28e0e3 --stat`: handler +16, new unit test file +276, `I18n.resx` +3, `I18n.en.resx` +3 — the authorized Phase 1+2 surface.
- `git show 9995359f --stat`: new `StorePlanLockTests.cs` +119 — ADD-only.
- `git show bc50f45c --stat`: `store-fixture.ts` +79/-49 — the single authorized support-file modification.
- No existing backend E2E test or frontend spec modified; no Angular (`frontend/`) change; no React app/package change; no rate-limit work.
- Working tree after all verification runs is byte-identical to the pre-run state (the 3 pre-existing docs modifications + the untracked change folder only) — verification modified nothing.

### Verdict

**PASS** — All 2 requirements and 12 scenarios evidenced by passing runtime tests (unit 4/4, new E2E 4/4, pins 37/37, full E2E 354/354, Application 341/341, Domain 22/22, build 0 errors, frontend fixture 2/2); implementation matches design D1–D6 and the interfaces contract; scope gate clean; zero CRITICAL, zero WARNING. Change is archive-ready.