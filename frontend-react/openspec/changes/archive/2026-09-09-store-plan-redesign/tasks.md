# Tasks: Store Plan Redesign — 3-panel catalog

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1000–1200 (FE ~700, BE ~350) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Work Units

| Unit | Goal | Focus test | Harness | Rollback |
|------|------|-----------|---------|----------|
| 1 | Backend catalog + planType | `dotnet test backend/src/Application.Tests` | Local API GET /v1/plans | Revert backend Plans/ + DTO/Profile |
| 2 | Domain models + service | `pnpm test -- store-http-service.test.ts` | N/A — unit-covered | Revert 2 files |
| 3 | PlanPanels component + tests | `pnpm test -- plan-panels.test.tsx` | N/A — wired U4 | Revert component + test |
| 4 | Page + modal wiring | `pnpm test -- store-plan my-stores` | `pnpm dev` → /management/stores modal | Revert 3 route files |
| 5 | Form/menu/i18n removal | `pnpm test -- store-form store-creation-trial` | `pnpm dev` → create → Superior | Revert form/menu/i18n |
| 6 | E2E authorized updates | `pnpm test:e2e` (analysis-only) | N/A — no local Playwright | Revert 4 specs |

## Phase 1: Backend catalog

- [x] T1.1 RED: `GetPlansQueryHandlerTests` — gate, VIP excluded, price = Σ currentPrice
- [x] T1.2 IMPL: `IPlanRepository` + `PlanRepository` — active, non-VIP, ordered
- [x] T1.3 IMPL: `PlanDto`/`PlanModuleDto`, `GetPlansQuery`+handler, `PlanProfile` (Σ currentPrice)
- [x] T1.4 IMPL: `PlansController` — GET /v1/plans, StoresAdmin, read-only
- [x] T1.5 RED: StoreProfile test — planType "Pago"
- [x] T1.6 IMPL: `planType` on `StorePlanDto`/`OwnerStoreDto` (GetDescription, fallback "Gratis")
- [x] T1.7 VERIFY: `dotnet test backend/src/SMCA.sln`

## Phase 2: Frontend models + service

- [x] T2.1 RED: `store-http-service.test.ts` — getPlans/getFeaturesToStore resolve + reject
- [x] T2.2 IMPL: `packages/domain/src/models/store.ts` — `Plan`, `PlanModule`, `planType` on store models
- [x] T2.3 IMPL: `store-http-service.ts` — `getPlans()`, `getFeaturesToStore()`

## Phase 3: PlanPanels

- [x] T3.1 RED: `plan-panels.test.tsx` — 3 panels, active expanded, Σ total, strikethrough, tooltip, Activar visibility, failure no-close, no Guardar
- [x] T3.2 IMPL: `plan-panels.tsx` — accordion, active default-expand, features groupBy ModuleId

## Phase 4: Consumers

- [x] T4.1 RED: `store-plan.test.tsx` — activation flow, no Guardar; copy
- [x] T4.2 IMPL: `store-plan.tsx` — getPlans+getFeaturesToStore, PlanPanels, DG-7 from planType, drop merge/save
- [x] T4.3 RED: `my-stores.test.tsx` — modal panels, activation closes, testids stay, lock
- [x] T4.4 IMPL: `my-stores.tsx` + `edit-plan-modal.tsx` — no merge, PlanPanels, activation → updateStore+getUserByToken+close

## Phase 5: Form / menu / i18n

- [x] T5.1 RED: store-form + store-creation-trial — no moduleIds in payloads, no plan UI, form Guardar intact
- [x] T5.2 IMPL: `store-form.tsx` + `edit-store.tsx` + `update-store.tsx` — drop includePlan/catalog/moduleIds
- [x] T5.3 DEL: `plan-picker.tsx`+test, `store-modules.ts`
- [x] T5.4 IMPL: `menu-config.ts` remove STORES_PLAN (S-MENU-1); `es.ts` — Superior key, ACTIVATE_PLAN, INCLUDES; drop WILL_ACTIVATE usage

## Phase 6: E2E + verify

- [x] T6.1 E2E: E-08/E-09, S2-01, S2-02 → panels; store-update:58 menu assertion
- [x] T6.2 VERIFY: typecheck 0 errors; stores scope green (4 sidebar failures = pre-existing baseline, confirmed against HEAD); backend untouched; store-create-security untouched