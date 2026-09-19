# Apply Progress: store-default-plan-and-owner-plan-restriction

- **Change**: store-default-plan-and-owner-plan-restriction
- **Status**: IMPLEMENTATION COMPLETE — 23/23 tasks done, all work units committed to local `main`. VERIFICATION mostly green; 1 backend E2E assertion blocked by shared-DB pollution (module 17 from a foreign migration) — user decision pending.
- **Mode**: STRICT TDD (RED → GREEN): the gate unit tests were authored with RED-reasoning pinned in comments (`Handle_ownerTargetsSuperior_throwsForbidden`: "No plan fetch is arranged: the gate fires BEFORE the plan lookup, so without the gate this would throw PlanNotFound (400) — failing this test (RED)"); GREEN verified by run, `dotnet test --filter "StoreCreatePlanTests|ChangeStorePlanCommand"` = 16/16.
- **Artifact store**: hybrid (engram + `openspec/changes/<change-name>/`)
- **Implementation**: 7 commits on local `main`, no PR, no push (per project convention)
- **Workload decision**: Single PR within budget (est. 150–250 lines, `size-exception` chain strategy recorded in tasks.md; actual top-line change ≈ 200 lines across the 3 PR-shaped slices)

## Delivery Path (Workload Enforcement)

- Review Workload Forecast: `400-line budget risk: Low`, `Chained PRs recommended: No`, `Suggested split: Single PR`, `Delivery strategy: ask-on-risk`, `Chain strategy: size-exception` — implemented as single-PR mode; no `size:exception` needed. No artificial line trimming.

## Work Units

| Unit | Tasks | Commit | State |
|------|-------|--------|-------|
| WU-1 | 1.1 | `df3695a6 fix(domain): birth stores on the Pago plan instead of Superior` | committed |
| WU-2 | 1.2, 2.1, 2.2 | `f98da701 feat(domain): gate Superior/VIP plan changes to SuperAdmin callers` | committed |
| WU-3 | 3.1–3.8 | `50bf6f5b test(domain): re-anchor E2E suite to Pago birth plan and SuperAdmin gate` | committed |
| WU-4 | 4.1–4.3, 5.2 | `467d3e41 feat(ui): restrict owner plan modal to Gratis/Pago panels, re-anchor parity tests` | committed |
| WU-5 | 5.1, 5.3, 5.4, 5.5 | `d93cb5fb test(web-store-pos): re-anchor frontend unit and E2E specs to Pago/Statistics delta` | committed |
| WU-3 cleanup | 3.1 (comment) | `f4af62c3 docs(domain): fix stale birth-plan comment in StorePlanCreateTests` | committed |
| WU-6 | 5.6, 6.1, 6.2 | `docs(sdd): mark store-default-plan-and-owner-plan-restriction apply complete` (this commit) | committed |

## Completed Tasks (cumulative)

- [x] 1.1 `CreateStoreService.cs:45` — Superior → Pago birth plan (one line; verified at HEAD)
- [x] 1.2 `ChangeStorePlanCommandHandler.cs:97-101` — non-SA + Superior/VIP → 403, after ownership guard (:89-95), before preconditions (:103); reuses `IsSuperAdmin` at :90
- [x] 2.1 `ChangeStorePlanCommandHandlerTests.cs` — `Handle_ownerTargetsSuperior_throwsForbidden` + `Handle_ownerTargetsVIP_throwsForbidden`
- [x] 2.2 `ChangeStorePlanCommandHandlerTests.cs` — override-rule tests switched to `ArrangeSuperAdmin()` (VIP + Superior)
- [x] 3.1 `StoreCreatePlanTests.cs` — birth-plan assertions → Pago; class doc + const updated; divergence pinned (`Create_store_defaults_to_pago_but_modules_are_request_driven`); stale comment corrected (f4af62c3)
- [x] 3.2 `ChangeStorePlanTests.cs` — owner→Pago overdue-leg (Superior now SA-reserved), owner→VIP leg re-authored as SA→VIP, SA→Superior stays
- [x] 3.3 `ChangePlanPermissionFlipTests.cs` — SA performs flips; owner token proves create-gate 403→201→403 same-token; owner→Superior 403 pin
- [x] 3.4 `OwnerCreateStoreTests.cs` OC04 — default-plan assertion → Pago
- [x] 3.5 `MultiMonedasModuleTests.cs` — owner→Superior/VIP 403 pins + SA-driven activation legs
- [x] 3.6 `MeAfterOwnerPlanChangeTests.cs` — owner→Superior 403 pin; SA-flips with same owner token; Pago-based B3 leg intact
- [x] 3.7 `StorePlanCanonicalPriceTests.cs` — P4 flip runs as SA (owner card read unchanged)
- [x] 3.8 `AuthRegisterPlanTests.cs` — birth plan assertion → Pago
- [x] 4.1 `edit-plan-modal.tsx` — `visiblePlans` filtered to Gratis/Pago for non-SuperAdmin
- [x] 4.2 `store-plan.tsx` — same filter (OwnerAdmin route)
- [x] 4.3 `store-list.tsx` (read-only review) — SuperAdmin view unfiltered, no code change
- [x] 5.1 `store-creation-trial.test.tsx` — birth planId comments/names → Pago; moduleIds `[2,3,4]` assertion unchanged (Option A)
- [x] 5.2 `my-stores.test.tsx` — owner click target → `/Gratis/` + Superior-absent pin
- [x] 5.3 `store-plan.test.tsx` (:436-454; tasks pin says `store-routes.test.tsx` — pre-existing typo, same range) — PlanPanels filter behavior; catalog factory unchanged :47-63
- [x] 5.4 `owner-stores.spec.ts` — E-03 `'Plan: Pago'`
- [x] 5.5 `plan-change-permission-refresh.spec.ts` — Pago/Statistics(6)+feature 60 ↔ Gratis delta (replaces Superior/Warehouses(13) premise)
- [x] 5.6 Full frontend suite verification (see verification table below)
- [x] 6.1 Canonical specs NOT modified — `git diff 4b8a54dc..HEAD -- openspec/specs/` empty
- [x] 6.2 Visual delta-spec alignment review — no drift (pre-existing pin typo `store-routes.test.tsx` → actual `store-plan.test.tsx`)

## Verification Table (final apply pass — commands actually run this pass)

| # | Command | Result |
|---|---------|--------|
| 1 | `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "StoreCreatePlanTests\|ChangeStorePlanCommand"` | **16/16 passed** (gate + birth-plan unit) |
| 2 | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "ChangeStorePlan\|ChangePlanPermission\|MultiMonedas\|MeAfterOwner\|StorePlanCanonicalPrice\|AuthRegisterPlan"` | **28/29 passed** — 1 environmental failure: `MeAfterOwnerPlanChangeTests.Me_follows_the_plan_across_superadmin_flips_with_same_owner_token` (:120) expects Superior universe `{2..15}` (14), DB yields `{2..15,17}`. Root cause: foreign migration `20260918153139_Add-Elaboration-Module` applied to shared `smca_test` seeds module 17 `Elaboración` + `StorePlanModule` (3,17)/(4,17); the migration does not exist in this repo. Not caused by this change. More below. |
| 3 | `pnpm typecheck` (frontend-react) | **clean** |
| 4 | `pnpm test` (frontend-react, Vitest) | **3736/3736 passed, 259 files, 0 failures, no type errors** |
| 5 | `npx playwright test e2e/owner-stores.spec.ts e2e/plan-change-permission-refresh.spec.ts` | **6/6 passed (57.7s)** — teardown cleaned 95 `e2e-*` rows |
| 6 | Canonical spec check | `git diff 4b8a54dc..HEAD -- openspec/specs/` **empty** + workspace paths clean |

> Prior-pass evidence (pre-foreign-migration, same code): the E2E authorized set was reported 29/29 and the full suite 532/533 with only `StorePlanCatalogTests` failing. That catalog failure is the SAME module-17 pollution once it arrives on the shared DB; the prior note attributed it to "VIP 15 modules / MultiMonedas(16)" — that description is incorrect (MultiMonedas is 15; the extra row is 17 `Elaboración`); the failure class (exact-count vs DB catalog) was right. Full-suite re-run deferred pending the DB-cleanup decision, since it would fail on the same pollution only.

## Work Unit Evidence

| Unit | Focused test command + result | Runtime harness command/scenario + result | Rollback boundary |
|------|-------------------------------|--------------------------------------------|-------------------|
| WU-1 | `dotnet test --filter StoreCreatePlanTests` (in #1 filter) → 16/16 | E2E birth-plan tests on real PostgreSQL → passed (in #2 set, 28/29) | Revert `CreateStoreService.cs:45` restores Superior birth |
| WU-2 | `dotnet test --filter ChangeStorePlanCommandHandlerTests` (in #1 filter) → 16/16 | E2E gate pins (owner→Superior/VIP 403) on real PG → passed (in #2 set) | Revert gate if-block `ChangeStorePlanCommand.cs:97-101` restores no-gate |
| WU-3 | `dotnet test` authorized E2E filter → 28/29 (1 environmental, see table) | Real PostgreSQL + WebAppFixture migrations → run; failing assertion is exact-universe collateral of module-17 pollution | Revert re-anchored E2E files (authorized set) |
| WU-4 | `pnpm test` (web-store-pos) → 3736/3736 | Playwright authorized pair → 6/6 passed | Revert filter lines `edit-plan-modal.tsx` + `store-plan.tsx` restores all-panels |
| WU-5 | `pnpm test` full unit → 3736/3736; `pnpm typecheck` clean | Playwright `owner-stores.spec.ts` + `plan-change-permission-refresh.spec.ts` → 6/6 (57.7s) | Revert re-anchored frontend test files |
| WU-6 | N/A (docs + verification only) | Canonical spec `git diff` empty; delta-spec alignment verified | Docs-only revert |

## Files Changed (cumulative, this change)

| File | Action | Work |
|------|--------|------|
| `backend/src/Application/Services/Stores/CreateStoreService.cs` | Modified (1 line) | Pago birth plan (WU-1) |
| `backend/src/Application/Features/StoreManagement/Stores/Commands/ChangeStorePlan/ChangeStorePlanCommand.cs` | Modified (+6) | SA-only gate for Superior/VIP (WU-2) |
| `backend/src/Application.Tests/.../ChangeStorePlanCommandHandlerTests.cs` | Modified | 2 new 403 tests + SA-caller switch (WU-2) |
| `backend/src/SMCA.WebApi.E2ETests/**` (8 files: StoreCreatePlan, ChangeStorePlan, ChangePlanPermissionFlip, OwnerCreateStore, MultiMonedas, MeAfterOwner, StorePlanCanonicalPrice, AuthRegisterPlan) | Modified | Pago birth + SA gate re-anchors (WU-3); comment fix (f4af62c3) |
| `frontend-react/apps/web-store-pos/app/management/stores/components/edit-plan-modal.tsx` | Modified | `visiblePlans` Gratis/Pago filter (WU-4) |
| `frontend-react/apps/web-store-pos/app/management/stores/routes/store-plan.tsx` | Modified | same filter (WU-4) |
| `frontend-react/apps/web-store-pos/app/management/stores/routes/__tests__/my-stores.test.tsx` | Modified | `/Gratis/` click target + Superior-absent pin (WU-4) |
| `frontend-react/apps/web-store-pos/app/admin/stores/routes/__tests__/store-list.test.tsx` | Modified | SuperAdmin auth-store mock, all-panels parity (WU-4) |
| `frontend-react/apps/web-store-pos/app/management/stores/routes/__tests__/store-creation-trial.test.tsx` | Modified | Pago birth re-anchor (WU-5) |
| `frontend-react/apps/web-store-pos/app/management/stores/routes/__tests__/store-plan.test.tsx` | Modified | PlanPanels filter behavior (WU-5) |
| `frontend-react/e2e/owner-stores.spec.ts` | Modified | E-03 `'Plan: Pago'` (WU-5) |
| `frontend-react/e2e/plan-change-permission-refresh.spec.ts` | Modified | Pago/Statistics(6)/feature-60 premise (WU-5) |
| `openspec/changes/store-default-plan-and-owner-plan-restriction/tasks.md` | Modified | 23/23 `[x]` + final-pass verification notes (WU-6) |
| `openspec/changes/store-default-plan-and-owner-plan-restriction/apply-progress.md` | Created/updated | this file (WU-6) |

## Deviations from Design

1. **Pin file-name typo (pre-existing, no code impact)**: spec.md/tasks.md reference `store-routes.test.tsx:435-450`; the actual PlanPanels filter test is `store-plan.test.tsx:436-454`. Correct file edited.
2. **Stale comment fix (in scope)**: `StoreCreatePlanTests.cs:68` still read "default plan is Superior (3)" after the Pago re-anchor — corrected to "default plan is Pago (2) since the 2026-09-18 birth-plan change" (f4af62c3). Same file/line as the authorized re-anchor; doc-only.
3. No other deviations — implementation matches `design.md` (AD-1 gate in handler; AD-2 VIP out of catalog; AD-3 Option A birth divergence pinned by tests).

## Issues Found

1. **SHARED-DB POLLUTION (blocking 29/29, not caused by this change)**: foreign migration `20260918153139_Add-Elaboration-Module` (module 17 `Elaboración`, `AvailableToStore=true`, `PriceIncluded=false`, plus `StorePlanModule` rows `(Superior,17)`/`(VIP,17)`) is applied to the shared `smca_test` DB and recorded in `__EFMigrationsHistory`. The file does not exist in this repo (`backend/src/Infrastructure/Migrations/` has no such migration; `Elaboración` absent from all `backend/src`). WebAppFixture (user-approved 2026-08-08) never drops the DB and `ResetDataAsync` preserves seed rows, so the pollution persists. It breaks every exact-universe E2E assertion: now `MeAfterOwnerPlanChangeTests:120` (authorized set) plus `StorePlanCatalogTests` (untouchable — named, not modified). The re-anchored expectations match THIS repo's catalog (`StorePlanModuleEntityTypeConfiguration` = 14 members; `ModuleType` max 15). Previous pass's full-suite report (532/533) already collided with this pollution; its note mis-attributed it to "MultiMonedas(16)". **Resolution options (user decision):** (a) reset `smca_test` (drop or recreate) and re-run the authorized set for a clean 29/29; (b) delete the 3 foreign rows (Module 17 + StorePlanModule (3,17)/(4,17)); (c) accept the environmental explanation. Nothing in this change's code or tests needs modification.
2. **Stale/aspirational prior-pass evidence**: the previous apply-progress.md claimed "committed on final pass" for WU-5/WU-6 and full verification, but the working tree showed WU-5 uncommitted and no WU-6 commit; its `29/29` belonged to the pre-pollution catalog. All numbers above are from commands actually run this pass.
3. Benign: NU1903/NU1902 package-vulnerability warnings on build (pre-existing, unrelated); `WebRootPath`/https-port redirect warnings from the E2E host (benign).

## Delivery Boundary

- **Mode**: single-PR mode (no chained PRs; actual diff ≈ 200 authored lines, well under the 400-line budget)
- **Branch**: local `main`, 7 commits ahead of `origin/main` (4 pre-existing from earlier passes + `d93cb5fb`, `f4af62c3`, docs commit); no push, no PR (per project workflow)
- **PR boundary**: N/A — orchestrator drives review lifecycle after verify

## Status

**23/23 tasks complete; implementation committed. Verification: 16/16 unit, 3736/3736 frontend unit, 6/6 frontend E2E, typecheck clean, canonical specs untouched, backend E2E 28/29 with the single failure proven environmental (module-17 pollution from a foreign migration on the shared `smca_test` DB). Pending: user decision on `smca_test` cleanup for a full 29/29 re-run.**