# Exploration: store-plan-redesign

Scope decisions locked (user answers, 2026-09-09): plans **Gratis, Pago, Superior** (no VIP); backend change authorized ONLY to expose plan→modules + prices and real Feature descriptions; "Activar ese plan" saves immediately and closes the popup; the plan picker's "Guardar" button is REMOVED; DG-7 lock stays (`!isSuperAdmin && isOnPaidPlan`); E2E `owner-stores.spec.ts` E-08/E-09 update AUTHORIZED; PlanPicker replaced in ALL views (plan page, plan modal, store form); gear access stays; `MENU.STORES_PLAN` removed from the general menu; default-expand the ACTIVE plan's panel.

## Current State

### Backend — what is exposed today

| Surface | Endpoint | Shape | Notes |
|---|---|---|---|
| Module catalog | `GET /api/v1/Modules/ToStore` | `List<ModuleDto>` (Id, Name, Order, PriceIncluded, Price, CurrentPrice, DiscountPrice, PercentDiscountPrice, AvailableToStore, **FeatureDescriptions**, DiscountText) | Permission `StoresAdmin`; handler rejects non-SuperAdmin/OwnerAdmin. `CurrentPrice` computed via `CurrentPriceServiceUtils.GetCurrentPrice(Price, PercentDiscountPrice, DiscountPrice)`. **FeatureDescriptions ARE exposed.** |
| Feature catalog | `GET /api/v1/Features/available` | `List<FeatureDto>` (Id, ModuleId, Name, DisplayName, **Description**, Order, AvailableToStore) | Permissions SuperAdmin + StoresAdmin. **Real benefit text available; the React app never calls it.** |
| Store plan view | `GET /v1/stores/{id}/plan` | `StorePlanDto` (StoreId, StoreName, Address, Description, Approved, IsActive, PaymentStartDate, NextDueDate, `modules: List<ModuleDto>`) | Module snapshots frozen at activation (prices overridden from `StoreModule`). |
| My stores | `GET /v1/stores/my-stores` | `OwnerStoreWithPlan[]` (modules snapshot + nextDueDate) | Backs the owner cards view. |
| Plan save | `PUT /v1/stores/{id}` | `UpdateStorePayload { moduleIds? }` | Backend applies modules only when the field is present (plan/data split). |

### Backend — what is NOT exposed (single most important finding)

1. **Plan→module membership exists only as DB seed** (`StorePlan`/`StorePlanModule` + `StorePlanEntityTypeConfiguration`/`StorePlanModuleEntityTypeConfiguration`). No endpoint, query, or DTO returns plans with their modules. Seed: Gratis=5 modules (Sales, Inventory, Synchronization, **Reports**, Management), Pago=11, Superior=13, VIP=13; all `IsActive=true`.
2. **The store's current plan is not serialized.** `Store.StorePlanId` exists (int, default `StorePlanType.Pago`), but no DTO (`StoreDto`, `StorePlanDto`, `OwnerStoreWithPlan`) exposes `planType`/`planId`.
3. **`StorePlan` has no price column.** A plan price must be computed as Σ member modules' `currentPrice` (same `CurrentPriceServiceUtils` as the catalog).

Consequences: the frontend's active-plan detection is a *heuristic* (`any selected module with priceIncluded=false`). That heuristic **contradicts seeded membership** — seeded Gratis includes Reports, which is `priceIncluded=false` with price 2000 — so a real Gratis store would be classified "paid". The redesign cannot be built honestly without backend membership + current-plan exposure.

### Frontend — current architecture

- `PlanPicker` (`management/stores/components/plan-picker.tsx`): two tabs Gratis/Pago driven by the `priceIncluded` heuristic; free panel = `priceIncluded` modules; paid panel = the rest with Σ `currentPrice` (strike-through original when discounted); "Activar este plan" only when the browsed tab differs from the active plan and not `readOnly`; "Se activará al guardar" hint; `onChange` fires ONLY from the activate button (not tab clicks).
- Consumers (all hydrated via `mergeStoreModules(catalog, storeSnapshot)`):
  - `routes/store-plan.tsx` — `/management/stores` page: `getStorePlan` + `getModulesToStore`, page-level **Guardar** (`STORES.SAVE`) → `updateStore` with full `moduleIds` + `getUserByToken()` session refresh. DG-7 `readOnly={!isSuperAdmin && isOnPaidPlan}`.
  - `components/edit-plan-modal.tsx` — my-stores cards gear ("Editar el plan", `owner-store-edit-plan-{id}`); modal `owner-store-plan-modal-{id}`, Guardar with testid `owner-plan-save-{id}`, next-billing-date header `owner-plan-next-billing-date-{id}`.
  - `components/store-form.tsx` — create/edit form via `includePlan` (default true; the `/update` data view passes `includePlan=false`). Holds `moduleIds` locally; **form-level Guardar submits everything** (this Guardar is the store form's, unrelated to the plan picker's removal).
- Menú: `MENU.STORES_PLAN` (`/management/stores`, `featureIds:[Stores]`, `exact:true`) at `menu-config.ts:325-333`, helpContent references stale "Gratis, Básico, Profesional". Gear-based "Editar el plan" (`owner-store-edit-plan-{id}`) is the owner entry point from the cards.
- i18n (`es.ts`): has `STORES.PLAN.FREE_TAB` 'Gratis', `.PAID_TAB` 'Pago', `.ACTIVE_BADGE`, `.INCLUDES`, `.INCLUDES_FREE_PLUS`, `.SELECTED`, `.NEXT_BILLING_DATE`, `.ACTIVATE` 'Activar este plan', `.WILL_ACTIVATE_ON_SAVE`, `.BILLING_NOTICE`, `.CURRENCY_NOTICE`, `STORES.PAID_PLAN`/`FREE_PLAN`, `STORES.EDIT_PLAN`. **MISSING**: a Superior plan-name key and the new 'Activar ese plan' copy.
- Angular parity (`../frontend/`): the legacy edit-store has **no plan picker** — a module checkbox table (`STORE.SELECT_MODULES`) with `priceIncluded` modules locked-checked, offer-price (current + original) cells and a total-price footer. The tabbed PlanPicker and the toggle-plan gear confirm dialog are React-side inventions from earlier plan-split changes. The 3-panel redesign is user-mandated new UX with **no Angular counterpart to mirror**; the module price/Σ-total semantics are the parity anchor.

## Affected Areas

- `backend/src/SMCA.WebApi/Controllers/v1/PlansController.cs` (NEW, or extend StoresController) — plan catalog endpoint.
- `backend/src/Application/Features/Plans/Queries/GetPlans/...` (NEW) — handler/DTO for plans with module membership + computed prices.
- `backend/src/Application/Dtos/Plans/PlanDto.cs` (NEW) — Id, Name, Order, IsActive, modules, computed price.
- `backend/src/Application/Dtos/StoreManagement/StorePlanDto.cs` — add current `planType`; `bcakend/.../OwnerStoreDto.cs` if the cards need it.
- `backend/src/Application/Mappings/PlanProfile.cs` (NEW) — StorePlan→PlanDto, module CurrentPrice reuses `CurrentPriceServiceUtils`.
- `backend/src/Application/Features/.../GetAvailableModulesToStore` — reference pattern for permissions/availability filtering (only modules with `AvailableToStore`).
- `frontend-react/packages/domain/src/models/store.ts` — extend StorePlan/OwnerStoreWithPlan with `planType`; add `StorePlanCatalog`/`Plan` model.
- `frontend-react/apps/web-store-pos/app/management/stores/components/plan-picker.tsx` — replaced by collapsible 3-panel component (or in-place rewrite).
- `. . .routes/store-plan.tsx` — remove page-level Guardar; "Activar ese plan" immediate save + close/refresh; active panel default-expanded.
- `. . .components/edit-plan-modal.tsx` — same panel component; remove modal Guardar (save happens on activate); keep `owner-store-plan-modal-{id}` testid; next-billing-date header stays for paid plans.
- `. . .components/store-form.tsx` — PlanPicker replaced inside `includePlan`; **creation mode needs defined semantics** ("Activar ese plan" cannot save before the store exists → it must set form state, saved with the form).
- `. . .lib/services/store-http-service.ts` — add `getPlans()` (and `getFeaturesToStore()` for the "?" tooltips).
- `. . .app/shared/lib/config/menu-config.ts:325-333` — remove `MENU.STORES_PLAN`; gear entry point stays.
- `. . .app/shared/lib/i18n/es.ts` — new keys: Superior plan name, "Activar ese plan", per-plan INCLUDES list copy.
- Unit tests: `components/__tests__/plan-picker.test.tsx` (PLAN-1..9/2b/2c/DG-7, tab roles), `components/__tests__/store-form.test.tsx` (DG-7 section 372-451), `routes/__tests__/store-plan.test.tsx`, `routes/__tests__/my-stores.test.tsx` (testids stay, no Guardar).
- E2E: `e2e/owner-stores.spec.ts` **E-08/E-09 (AUTHORIZED)**, `e2e/store-plan-activation.spec.ts` **S2-01 (NOT authorized, breaks)**, `e2e/store-plan-lock-regression.spec.ts` **S2-02 (NOT authorized, breaks)**, `e2e/store-update.spec.ts` **L58 (menu link, NOT authorized, breaks if menu item removed)**, `e2e/store-create-security.spec.ts` (expected green — no plan-UI interaction; verify in apply).

## Approaches

| # | Approach | Pros | Cons | Effort |
|---|---|---|---|---|
| 1 | **Backend plan catalog + current planType** — new `GET /v1/plans` (Gratis/Pago/Superior, each with member modules + computed price) and `planType` added to `StorePlanDto`/`OwnerStoreWithPlan`; frontend builds panels from real membership, Features "?" content from `GET /v1/Features/available` | Real plan data; active plan from backend not heuristic; matches the user's authorized backend scope; Features already exposed (no backend work for tooltips) | New backend endpoint + DTO + profile; must keep permission model (StoresAdmin-equivalent); plan prices derived (Σ currentPrice) — needs locking to the same `CurrentPriceServiceUtils` | Medium |
| 2 | **Frontend-only hardcoded plan membership** (constants Gratis=5/Pago=11/Superior=13 module ids) | Zero backend risk | Cannot know the store's current plan (StorePlanId not exposed) → "active panel" stays heuristic → fails the core requirement; duplicates seed data (drift); violates the intent of the authorized backend scope | Low (but fails) |
| 3 | **Extend `GET /v1/stores/{id}/plan`** to embed the plan catalog + current planType | Single round-trip on the plan page | Couples a store-scoped endpoint to a global catalog; my-stores cards need a second source for the modal; awkward reuse across three consumers | Medium-High |

### Recommendation

**Approach 1.** New, small, read-only backend surface: `GET /v1/plans` returning the three active plans (Gratis/Pago/Superior — exclude VIP per scope) with member modules (`ModuleDto`-shaped: name, priceIncluded, price, currentPrice, discountText, order + FeatureDescriptions) and the computed plan price (Σ member `currentPrice`, same util as the catalog). Add `planType` to `StorePlanDto` (plan page + modal) and, if the cards should badge the real plan, to `OwnerStoreWithPlan`. Frontend then:
- replaces tabs with collapsible panels (default-expand the plan whose `planType` matches), "Activar ese plan" per panel → immediate `updateStore(moduleIds)` + `getUserByToken()` refresh + close (modal) / UI reflect (page), no Guardar;
- renders "?" tooltips from real Feature descriptions (new `getFeaturesToStore()` service call — backend already exposes it);
- keeps DG-7 `readOnly` and the gear entry point; removes `MENU.STORES_PLAN`.

## Risks

- **CRITICAL — E2E authorization gap**: `store-plan-activation.spec.ts` (S2-01) and `store-plan-lock-regression.spec.ts` (S2-02) pin the tab UI end-to-end and will break; they are NOT in the authorized set (only E-08/E-09 are). Same for `store-update.spec.ts:58` (menu link 'Plan de la tienda'). **The user must explicitly authorize updating these three specs** (or accept the suite failing those tests). Flag in the proposal.
- **Heuristic vs membership mismatch**: any design that keeps deriving "active plan" from `priceIncluded` contradicts seeded membership (Gratis includes Reports, a paid-flagged module). Backend `planType` is required for correctness.
- **Creation-mode semantics**: "Activar ese plan" cannot save immediately inside the store creation form (store doesn't exist yet) — the create-mode interaction (plan selection → form state → saved with the form) must be explicitly specced.
- **Pre-existing baseline**: 13 typecheck errors and 24 pre-existing test failures must not grow; Playwright cannot run locally — E2E greenness is analysis-based only.
- **Parity**: the 3-panel UX has no Angular counterpart (user-mandated divergence); the module-price/Σ-total semantics from the Angular table are the parity anchor.

## Ready for Proposal

**Yes** — with one user decision carried forward: authorize updating `store-plan-activation.spec.ts`, `store-plan-lock-regression.spec.ts`, and `store-update.spec.ts` (menu-link assertion) as part of the change, or explicitly accept them failing until a later authorized change.

## Decision Resolution (user answers, 2026-09-09)

- **E2E additional specs AUTHORIZED**: S2-01, S2-02, and `store-update.spec.ts:58` will be updated as part of this change, together with E-08/E-09.
- **Creation-mode scope change**: the store creation form does NOT use any plan picker — new stores are created with the Superior plan (backend default, CreateStoreService L45). The collapsible plan panels apply ONLY to edit contexts (owner modal + plan page). `store-form.tsx` creation mode includes NO plan selection.