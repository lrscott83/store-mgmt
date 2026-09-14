```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:0e59026406b11ed80493c5dc6f8d874a21f7a4976cd2bc55f12e0f781f6752c1
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 8/8
scenarios: 20/20
test_command: dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-restore --filter FullyQualifiedName~DisapprovedStoreBillingViews
test_exit_code: 0
test_output_hash: sha256:3386cae7c1be94c4390a8c86b3c20e2f8bc2a98f3f9ec0ff38e1cab561e9d09c
build_command: dotnet build backend/src/SMCA.sln --nologo -v q
build_exit_code: 0
build_output_hash: sha256:0b1af71ecdbc094996e391f2d89a6f7900751c5d2a7910cef6f82106a60b303f
```

## Verification Report

**Change**: disapproved-store-billing-views
**Phase**: Verify
**Date**: 2026-09-13
**Mode**: Standard (no Strict TDD runner; artifacts full: proposal/specs/design/tasks/apply-progress)
**Branch**: qa @ d9b77ae0 (3 work-unit commits: 0f359f79 backend guard + unit tests, 9ea1a9f2 E2E, d9b77ae0 frontend gates + SDD artifacts)

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 18 (tasks.md 1.1–1.8, 2.1–2.3, 3.1–3.4, 4.1–4.3) |
| Tasks complete | 18 (all `[x]`; every task artifact verified present in the tree) |
| Tasks incomplete | 0 |

### Build & Tests Execution

All commands executed fresh during this verify phase (not inherited from apply).

| Command | Exit | Result | Output hash |
|---|---|---|---|
| `dotnet build backend/src/SMCA.sln --nologo -v q` (declared `build_command`) | 0 | 0 errors, 9 pre-existing warnings | `sha256:0b1af71e…60b303f` |
| `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-restore --filter FullyQualifiedName~DisapprovedStoreBillingViews` (declared `test_command`) | 0 | 1/1 passed | `sha256:3386cae7…e9d09c` |
| `dotnet test backend/src/Application.Tests/Application.Tests.csproj --no-restore` | 0 | 447/447 passed | `sha256:7b19ef3b…40270` |
| `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-restore` (full suite) | 0 | 500/500 passed (1m56s; existing `GetMeBilling*`, `StorePlan*`, `MyStores*` suites all green) | n/a (verified run, output not hashed) |
| `vitest run` card suites (`store-card-list.test.tsx` + `owner-store-card.test.tsx`) | 0 | 24/24 passed (22 + 2), `Type Errors: no errors` | `sha256:de210b73…8efd` |
| `vitest run sync-routes` + `user-routes` (isolation check of apply's full-suite flags) | 0 | 37/37 passed — confirms S-ROUTE-1/S-LIST-1 full-suite failures are isolation noise | n/a |
| `pnpm typecheck` (web-store-pos) | 2 | 2 TS2339 errors, both pre-existing (see W1) | `sha256:c4cc01ff…50bef` |

**Coverage**: ➖ Not available (no coverage threshold configured in this repo).

### Spec Compliance Matrix

Specs: 4 files, **8 requirements / 20 scenarios** (counted from `### Requirement:` / `#### Scenario:` headers in the delta).

| Requirement | Scenario | Covering test | Result |
|---|---|---|---|
| REQ-1 — Plan name "Gratis" on every DTO | Disapproved store with paid snapshot and payment clock | `StoreProfilePlanTypeTests.Map_{StoreDto,StorePlanDto,OwnerStoreDto}_ExposesPlanTypeGratisForDisapprovedPagoStore` (approved:false + Pago + clock) + E2E `DisapprovedStoreBillingViewsTests` (paid snapshot + clock, 3 endpoints) | ✅ COMPLIANT |
| REQ-1 | Approved store plan name unchanged | `Map_StoreDto_ExposesPlanTypePagoForApprovedPagoStore` + E2E control asserts `"Pago"` on by-current-user / my-stores / plan | ✅ COMPLIANT |
| REQ-1 | Null-clock store unchanged | Pre-existing `StoreProfilePlanTypeTests` null-plan-id → `"Gratis"` fallback (unchanged, green in 447/447) | ✅ COMPLIANT |
| REQ-2 — Due dates null on every DTO | Disapproved store hides computed due date | E2E: null `NextPaymentDate`/`NextDueDate` on all 3 endpoints with recorded `StorePayment` + running clock; unit recorded-payment variants in `GetStoresByCurrentUserQueryHandlerTests`, `GetMyStoresQueryHandlerTests`, `GetStorePlanQueryHandlerTests` | ✅ COMPLIANT |
| REQ-2 | Approved store keeps computed due date | E2E control `NextDueDate == 2026-03-10` (canonical start+trial+1mo) + `GetStorePlanQueryHandlerTests.Handle_approved_pago_store_keeps_pago_and_computes_due_date` (06-01 → 08-01) | ✅ COMPLIANT |
| REQ-2 | Null-clock store stays null | Pre-existing handler tests for null `PaymentStartDate` (unchanged, green in 447/447) | ✅ COMPLIANT |
| REQ-3 — Cards render no price for Gratis | Super-admin card hides leak price | `store-card-list.test.tsx` additive s6 case: Gratis + paid module (currentPrice) → no `store-price-s6`, no `store-next-payment-s6`, no `Gratis:` | ✅ COMPLIANT |
| REQ-3 | Owner card hides leak price and date | New `owner-store-card.test.tsx` ds1 case: Gratis + paid module → no `owner-store-price-ds1` / `owner-store-next-due-ds1` | ✅ COMPLIANT |
| REQ-3 | Approved paid store keeps price | `owner-store-card.test.tsx` a1 control (`2,000 USD` + due date) + pre-existing store-card-list price tests | ✅ COMPLIANT |
| REQ-4 — Plan views/filters treat as Gratis | Plan dialog hides payment banner | E2E plan GET returns Gratis + null `NextDueDate` (input to unchanged `store-plan.tsx`, which keys on `planType !== 'Gratis'`) | ✅ COMPLIANT (contract-level; spec mandates no new frontend code) |
| REQ-4 | Admin filter buckets disapproved store as Gratis | E2E by-current-user returns `"Gratis"` for the disapproved store (filter keys on planType) | ✅ COMPLIANT (contract-level) |
| REQ-5 — Billing summary unchanged | /me summary for disapproved store unchanged | `git show 0f359f79^..d9b77ae0 -- backend/src/Application/Services/Billing/BillingService.cs` → **empty diff**; `BillingServiceTests` and existing `GetMeBilling*` E2E untouched and green (447/447, 500/500) | ✅ COMPLIANT (non-goal guard verified by zero-diff + untouched tests) |
| REQ-AS-1 — Super-admin card hides price | Disapproved store with paid snapshot shows no price | `store-card-list.test.tsx` s6 case (same as REQ-3 S1) | ✅ COMPLIANT |
| REQ-AS-1 | Approved paid store keeps its price | Pre-existing store-card-list price assertions (21 pre-existing tests, green in 24/24 run) | ✅ COMPLIANT |
| REQ-MS-1 — My-stores hides payment info | Disapproved paid-snapshot store on my-stores | E2E my-stores assertions (Gratis + null) + `GetMyStoresQueryHandlerTests.Handle_disapproved_store_with_recorded_payment_returns_null_next_due_date` | ✅ COMPLIANT |
| REQ-MS-1 | Owner card renders no price or date | `owner-store-card.test.tsx` ds1 case | ✅ COMPLIANT |
| REQ-MS-1 | Approved paid store card unchanged | `owner-store-card.test.tsx` a1 control | ✅ COMPLIANT |
| REQ-SCU-1 — StoreDto plan contract | Disapproved store with paid modules and clock | E2E by-current-user (disapproved: `PaymentStartDate != null` and `NextPaymentDate == null`) as owner-admin + unit super-admin branch `GetStoresByCurrentUserQueryHandlerTests.Handle_disapproved_store_with_recorded_payment_returns_null_next_payment_date` (isSuperAdmin:true) + mapper-level DTO tests | ✅ COMPLIANT |
| REQ-SCU-1 | Approved store unchanged | E2E by-current-user control (`"Pago"` + non-null `NextPaymentDate` for identical data shape) | ✅ COMPLIANT |
| REQ-SCU-1 | Non-super-admin caller sees the same contract | E2E authenticates the whole suite as the owner-admin (non-super-admin seat) — role-independent contract proven at runtime | ✅ COMPLIANT |

**Compliance summary**: **20/20 scenarios compliant** (8/8 requirements).

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| REQ-1 | ✅ Implemented | `StoreProfile.ResolvePlanType(Store src)` — `if (!src.Approved) return "Gratis";` before enum lookup; all 3 `MapFrom` sites (StoreDto :25, StorePlanDto :32, OwnerStoreDto :38) pass `src`. DTO string is `"Gratis"`, never `"Free"` |
| REQ-2 | ✅ Implemented | `GetStoresByCurrentUserQuery.cs` (:72–75), `GetMyStoresQuery.cs` (:77–81), `GetStorePlanQuery.cs` (:50–54) — `store.Approved ? GetNextDueDate(...) : null`; guard wraps the whole computation (payment/override/clock can't resurrect) |
| REQ-3 / REQ-AS-1 | ✅ Implemented | `store-card-list.tsx` PlanLine: `showPrice = planType !== 'Gratis'`, combined `(showPrice || showDate)` renders the `: ` suffix — no dangling `Gratis:` |
| REQ-3 / REQ-MS-1 | ✅ Implemented | `owner-store-card.tsx`: `isOnPaidPlan = store.planType !== 'Gratis' && getIsOnPaidPlan(modules)` |
| REQ-4 | ✅ Implemented by contract | Plan dialog + admin filter already key on `planType`; E2E proves the backend now feeds them `"Gratis"`/null |
| REQ-5 | ✅ Non-goal held | `BillingService.cs` byte-identical across the change range (empty diff); summary DTO untouched |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 (a) — plan-name guard in `ResolvePlanType(Store)` | ✅ Yes | Single mapping source; idempotent with the existing `"Gratis"` fallback |
| D2 (a) — due-date guard as handler ternary | ✅ Yes | All 3 handlers; mirrors `BillingService`, zero blast radius (verified: `BillingService` untouched) |
| D3 (a) — frontend gate key `planType !== 'Gratis'` | ✅ Yes | Both cards; mirror of `store-plan.tsx` |
| D4 (a) — additive in existing unit suites | ✅ Yes | 3 existing suites +1 additive method each (helper gains a defaulted `approved` param — existing cases unchanged); 1 new file where no suite existed (`GetStorePlanQueryHandlerTests`, real mapper) |

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. **W1 — repo-wide `pnpm typecheck` exits 2 (pre-existing, unrelated drift).** Two TS2339 errors: `configurations.tsx(41,64)` and `store-switcher.tsx(56,59)` — `Property 'isActive' does not exist on type 'StoreSummary'`. Both files have **zero diff** in `0f359f79^..d9b77ae0` (empty `git diff --stat` on the change's exact range) and were last modified by pre-change commits (`12f1e426`, `0014b5d3`). The failing state predates this change and is unchanged by it; no file in this change's diff is implicated. The declared envelope `build_command` is the backend solution build (exit 0) — this change's build surface; the frontend card graphs typecheck clean inside vitest (`Type Errors: no errors`). A green repo-wide typecheck gate would require a separate decision on the `StoreSummary.isActive` contract drift.

**SUGGESTION**:
1. **S1 — apply-progress count nit.** Header says "all 16 tasks complete"; `tasks.md` actually has **18** checkboxes (Phase 2 is 2.1–2.3, not 2.1–2.2). All 18 are `[x]` and every artifact is present — documentation arithmetic only.
2. **S2 — E2E seat deviation (documented in apply-progress).** All three endpoints are asserted as the owner-admin (the real consumer of all three surfaces) instead of super-admin for by-current-user per task 2.2's original wording. No coverage gap: the REQ-SCU-1 SuperAdmin seat is covered by the super-admin unit test (`ArrangeRoles(isSuperAdmin: true)` in `GetStoresByCurrentUserQueryHandlerTests`) plus role-independent mapper tests.
3. **S3 — full frontend suite 3450/3452.** `sync-routes.test.tsx` S-ROUTE-1 and `user-routes.test.tsx` S-LIST-1 fail only in the full-suite run; both pass in isolation (confirmed here: 37/37), and neither file is touched by this change. Vitest module-isolation noise, not a regression.

### No-Touch Audit

`git diff --name-status 0f359f79^..d9b77ae0` (22 entries):

- **Added (A)**: 1 new backend E2E file `SMCA.WebApi.E2ETests/Stores/DisapprovedStoreBillingViewsTests.cs`; 2 new frontend unit files; 1 new backend unit file; 8 SDD artifact files.
- **Modified (M)**: exactly 4 backend production files (`StoreProfile.cs`, 3 query handlers) + 2 frontend components + 3 existing backend unit-test files + 1 existing frontend unit-test file.
- **Zero** modifications to any existing E2E test (backend `SMCA.WebApi.E2ETests/` or frontend `frontend-react/e2e/`) or any E2E support file. The only `M` on test files are the 4 permitted *additive* unit-test changes (verified in diffs: new test methods only; helper signature gains a defaulted parameter). Working tree clean at `d9b77ae0` (`git status --porcelain` empty).

**Result: PASS — no-touch rule held.**

### Verdict

**PASS WITH WARNINGS** — 18/18 tasks complete, 8/8 requirements implemented, 20/20 scenarios compliant with passing runtime evidence (unit 447/447, E2E filtered 1/1, full E2E 500/500, card suites 24/24), BillingService zero-diff, no-touch audit clean. The sole WARNING (repo-wide `pnpm typecheck` exit 2 on zero-diff files) is a pre-existing baseline condition not attributable to this change; the envelope `build_command` is the backend solution build (exit 0), and the typecheck evidence is retained in the table above as measured.