# Proposal: store-plan-redesign

**Replace the tabbed PlanPicker with 3 collapsible plan panels (Gratis/Pago/Superior) in edit contexts, fed by a real backend catalog and the store's `planType`; retire the `priceIncluded` heuristic.**

## Intent

Active-plan inference from `priceIncluded` contradicts seeded membership (Gratis includes Reports, a paid-flagged module): real Gratis stores render "paid". Plans exist only as DB seed; the store's plan is never serialized. Expose plan→modules/prices + `planType`; rebuild the picker as panels where "Activar ese plan" saves immediately.

## Scope

### In Scope
- Backend read-only: `GET /v1/plans` (3 active plans + modules; price = Σ currentPrice via CurrentPriceServiceUtils); `planType` on `StorePlanDto`/`OwnerStoreWithPlan`.
- Frontend: `getPlans()` + `getFeaturesToStore()` (real Feature descriptions for "?" tooltips).
- Panels replace PlanPicker ONLY in owner modal + plan page; active panel default-expanded from `planType`; "Activar ese plan" → `updateStore(moduleIds)` + `getUserByToken()` + close/reflect; picker Guardar removed; DG-7 lock kept.
- Creation: NO plan picker — new stores get Superior (backend default).
- Remove `MENU.STORES_PLAN` + stale help (menu-config.ts L325-333); gear entry stays; i18n keys (Superior name, "Activar ese plan", INCLUDES).
- E2E authorized: E-08/E-09, S2-01, S2-02, store-update.spec.ts:58.

### Out of Scope
- VIP UI, price refactor, new permissions; backend behavior beyond catalog exposure; store-form Guardar stays; admin module editing stays on plan page/modal.
- Parity: Angular has no plan picker; 3-panel UX is a mandated divergence; module-price/Σ-total semantics are the parity anchor.

## Capabilities

- **New — `store-plan-panels`**: collapsible plan panels from catalog data; active via `planType`; immediate-save activation; Feature tooltips; DG-7 lock.
- **Modified — `management`**: StoreForm plan selection removed (creation = Superior default); picker Guardar removed; menu item removed.

## Approach

Approach 1 (explore): additive read-only backend surface; panels from real membership; active plan from `planType`; tooltips from existing `GET /v1/Features/available`.

## Affected Areas

- **New**: backend Plans/GetPlans, PlanDto, PlanProfile, PlanProfile mapping.
- **Modified**: StorePlanDto/OwnerStoreWithPlan (+planType); domain models; store-http-service.ts; store-plan.tsx; edit-plan-modal.tsx.
- **Removed**: plan-picker.tsx; picker Guardar (page + modal); `MENU.STORES_PLAN`.
- **Modified**: store-form.tsx; menu-config.ts; es.ts; unit tests; E2E (authorized 4).

## Risks

- Baseline 13 typecheck / 24 test failures grow — mitigate: strict TDD; count before/after.
- E2E not locally runnable (Playwright) — mitigate: analysis-based; store-create-security green.
- planType missing on card DTO — mitigate: spec pins DTOs; E2E E-08/E-09.

## Rollback Plan

Direct commits on dev, no PR; each atomic + revertible. Revert in reverse order: backend catalog (additive), UI panels, i18n/menu — `git revert` restores current behavior.

## Dependencies

Backend ships first; seeded plans are membership source of truth.

## Success Criteria

- [ ] 3 catalog-driven panels; active expanded from `planType`.
- [ ] "Activar ese plan" saves immediately; no picker Guardar; store-form Guardar intact.
- [ ] No picker at creation; new store lands on Superior; baseline 13/24 unchanged.

## Open Questions

None. **Decision Resolution (user, 2026-09-09)**: the admin edit-store form (store-form.tsx) has NO plan UI — neither create nor edit. Plan editing lives ONLY on the plan page (/management/stores) and the owner modal; store-form's `includePlan` plan-picker behavior is removed/disabled entirely (both views).