# Feature: store-birth-pago-only

**Objective:** Enforce the strict birth invariant — a store created through ANY backend path lands with EXACTLY the active Pago plan catalog modules and never with Superior/VIP-only modules (12, 13, 14, 15, 16, 17).

**Status:** DONE — closed 2026-09-25. Commits: `84d68ddc` (slice A), `7897a38f` (slice B) on `qa`, local == origin/qa (push remains user decision).

## Problem

- `POST /api/v1/stores` (SuperAdmin, explicit `ModuleIds`) accepts Superior/VIP-only modules at birth on a Pago store (only WholesaleSales 12 was rejected). Pinned divergence `Create_store_defaults_to_pago_but_modules_are_request_driven` (Option A).
- OwnerAdmin branch inherits the selected store's module set filtering only 12, so a Superior owner's child store inherits 13/14/15/17.
- `POST /auth/register` already grants exactly the Pago catalog (`RegisterCommand` → `GetActivePlanWithModulesByIdAsync(Pago)`) — coherent today.

## Why

User decision 2026-09-25 (strict invariant): "tienda recién creada = solo módulos del plan Pago, no puede tener otros módulos que están en planes Superior o VIP". Applies to BOTH creation routes (admin explicit + owner inheritance). E2E backend must cover it, including `/auth/me`.

## Authorized scope (user-approved inventory, 2026-09-25)

**Production (2):**
- `CreateStoreCommandValidator.cs` — replace WholesaleSales-only rule with active-Pago-catalog rule (reject 12–17, fail-closed 400 `ModuleNotAvailableForPagoPlan`); inject `IPlanRepository`.
- `CreateStoreCommand.cs` (handler, owner branch) — filter inherited module set to the active Pago catalog (replaces the `id != 12` filter); inject `IPlanRepository`.

**Existing E2E updates, 7 methods / 6 files:**
- `Stores/StoreCreatePlanTests.cs` — `Create_store_gets_pago_plan_modules_and_features` (replace 13 with Pago member); `Create_store_defaults_to_pago_but_modules_are_request_driven` (divergence pin → full-Pago-catalog positive pin).
- `Warehouses/WarehousesCreateStoreTests.cs` — `Admin_create_store_with_warehouses_module_assigns_owner_features` (reshape: create Pago {7} then flip Superior, assert 13 + features 36/37).
- `Stores/MultiMonedasModuleTests.cs` — `MM1_created_store_inherits_multimonnedas_from_selected_store` (flip: child inherits only Pago members; 15/43 absent).
- `Stores/ElaborationModuleTests.cs` — `EM1_created_store_inherits_elaboration_from_selected_store` (flip: child inherits only Pago members; 17/120/121 absent).
- `Stores/OwnerCreateStoreTests.cs` — `OC04_owner_with_multistores_creates_own_store_201_and_inherits_modules` (inheritance pin (7,14) → (7)).
- `Stores/ChangePlanPermissionFlipTests.cs` (line 97–104) — `inherited.Should().Contain(14)` → `NotContain`.

**Unit tests (2):** `CreateStoreCommandValidatorOwnerTests`, `CreateStoreCommandHandlerTests` — add `IPlanRepository` mock + Pago-catalog setup.

**New E2E (1 file):** `Stores/StoreBirthPagoOnlyTests.cs`
- Theory: each Superior/VIP-only module (12–17) in admin creation → 400 ModuleIds + no store persisted.
- Happy path: full Pago catalog → 201 + exact DB equivalence + exact `/auth/me` universe (PlanType "Paid", IsInTrial true).
- Owner branch: Superior selected store {7,14,15} → child born Pago-only ({7}) at DB level.

## Constraints / gotchas

- `ApplicationDbContext` is NoTracking — attach (`db.Set<T>().Update`) before mutation when needed; creation via `.Add` is tracked.
- `/me` `StoreModuleIds` derives from available modules gated on active features; for a Pago-born store every catalog member has mapped features → exact equivalence deterministic. If the runtime shape diverges, pin `NotContain(12..17)` + exact DB equivalence (validate against actual /me shape at implementation).
- `GetActivePlanWithModulesByIdAsync` is the exact call `RegisterCommand` already uses; no new repository surface.
- A child store never inherits MultiStores (14) → a child cannot birth grandchildren (gate requires 14 active on the selected store). MultiStores works one generation deep. Documented consequence of the strict invariant.
- Backend rule: production/E2E changes were explicitly approved; do NOT modify other existing E2E tests, `frontend/` (Angular legacy), or backend production beyond the two files.

## Tasks

- [x] T0 — Authorize + inventory blast radius (user-approved 2026-09-25; all 11 files).
- [x] T1 — Validator: active-Pago-catalog rule (admin path) + `CreateStoreCommandValidatorOwnerTests` update.
- [x] T2 — Handler: owner-branch inheritance clamp to Pago catalog + `CreateStoreCommandHandlerTests` update.
- [x] T3 — E2E updates (admin path): `StoreCreatePlanTests` ×2, `WarehousesCreateStoreTests`.
- [x] T4 — E2E updates (owner path): `MultiMonedasModuleTests.MM1`, `ElaborationModuleTests.EM1`, `OwnerCreateStoreTests.OC04`, `ChangePlanPermissionFlipTests`.
- [x] T5 — New `StoreBirthPagoOnlyTests.cs` (admin 400 sweep, admin happy path + /me, owner clamp).
- [x] T6 — Build + filtered runs (unit + E2E) + commit slices + close.

## Route plan (per task; delivery budget advisory)

- Forecast: ~450 authored lines total (two paths + 7 pinned tests + new suite). Two reviewable commit slices, each < ~300 lines:
  - **Slice A (commit 1, T1+T3+T5-admin)**: validator + unit validator + StoreCreatePlanTests + WarehousesCreateStoreTests + new-file admin tests. Fully green (owner path untouched).
  - **Slice B (commit 2, T2+T4+T5-owner)**: handler + unit handler + 4 owner E2E updates + new-file owner test. Fully green.
- Direct-to-`qa` commits, Conventional Commits, work-unit evidence in this doc. Push remains user decision.

## Checks

- Build: `dotnet build backend/src/SMCA.sln` (or WebApi project).
- Unit: `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~CreateStore"`.
- E2E slice A: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~StoreCreatePlanTests|FullyQualifiedName~WarehousesCreateStoreTests|FullyQualifiedName~StoreBirthPagoOnlyTests"`.
- E2E slice B: `--filter "FullyQualifiedName~MultiMonedasModuleTests|FullyQualifiedName~ElaborationModuleTests|FullyQualifiedName~OwnerCreateStoreTests|FullyQualifiedName~ChangePlanPermissionFlipTests"`.

## Progress

- T0 done. Commits: `84d68ddc` slice A (validator + unit validator + StoreCreatePlanTests + WarehousesCreateStoreTests + BP1/BP2, + feature doc), `7897a38f` slice B (handler + unit handler + MM1/EM1/OC04/CPF flips + BP3). Both fully green before commit.

## Verification evidence

- Build `SMCA.sln`: 0 errors (20 pre-existing nullable warnings, none from feature files).
- Unit `--filter "FullyQualifiedName~CreateStore"`: **58/58 PASS** (post-slice-B tree; includes plan-mock catalog handler/validator updates).
- E2E slice A filter (`StoreCreatePlanTests|WarehousesCreateStoreTests|StoreBirthPagoOnlyTests`): **14/14 PASS** (post-slice-A commit; BP1 ×6, BP2, Warehouses reshape, StoreCreatePlan ×6).
- E2E slice B filter (`MultiMonedasModuleTests|ElaborationModuleTests|OwnerCreateStoreTests|ChangePlanPermissionFlipTests|StoreBirthPagoOnlyTests`): **28/28 PASS** (post-slice-B; includes MM1/EM1/OC04/CPF flips + BP3).
- Note: `Create_store_module_ids_duplicates_return_500_pk_collision` intentionally triggers a PK collision and logs an ERR-level stack trace (expected by-design logging, test passes).

## RDD

- Assess per work-unit commit (`--agent opencode --base-ref c5e95406 --committed-only --json`): returned `gentle-ai.review-assessment/v1` `risk: high`, `review_due: true`, reason `unassessable` — "active runtime is not eligible for immutable receipt review; supported runtimes: claude-code, codex".
- Preflight STATUS per RDD (not-lowered tier): `gentle-ai.review-integration.failure/v2` `code: immutable_review_transport_unsupported`, `next_action: stop`, `mutation_outcome: not_started`, `retry_safe: false`.
- Honest outcome: OpenCode runtime cannot run native RDD review → reviewed boundary does NOT advance for `84d68ddc` nor `7897a38f`; both commits remain due/high-risk until reviewable in a supported runtime or the user disables the switch. No GitHub mutation, no authority created. This is a runtime limitation, not a Gentle AI defect.