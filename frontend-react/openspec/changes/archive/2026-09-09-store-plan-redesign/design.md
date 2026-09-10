# Design: Store Plan Redesign — 3-panel catalog

## Technical Approach

Replace the tabbed plan picker with catalog-driven, collapsible plan panels rendered from a new read-only `GET /v1/plans` endpoint. Activation stops being a form action ("save picks modules") and becomes an immediate per-panel action (`updateStore(moduleIds)` + session refresh), so the store form loses its plan UI entirely (create silently defaults to Superior server-side — `CreateStoreService.cs:45`; edit is data-only — `update-store.tsx` already omits `moduleIds`). The backend adds `planType` to store DTOs so the frontend can derive the active plan and the DG-7 lock without the retired `priceIncluded` heuristic. Specs name containers `store-create.tsx`/`store-edit.tsx` — those do not exist; real routes are `edit-store.tsx` (create+edit unified, `includePlan` prop), `update-store.tsx` (wrapper, `includePlan={false}`), `store-plan.tsx` (plan page), `my-stores.tsx` (owner list + modal). This design uses the real paths.

## Architecture Decisions

| # | Decision | Tradeoffs | Choice |
|---|----------|-----------|--------|
| AD-1 | Plan catalog source | Simpler: reuse `StorePlanModule` seed (already complete, incl. prices). Alternative: hardcode frontend — breaks parity on any seed change. | New `IPlanRepository.GetActivePlansIncludingModulesForCatalogAsync()` → `PlanDto` list |
| AD-2 | VIP excluded | VIP is internal/superadmin | Filter `Id != (int)StorePlanType.VIP && IsActive`, order by `Order`. Matches plan UI scope (Gratis/Pago/Superior) |
| AD-3 | `planType` value | `Store.StorePlanId` FK == `(int)StorePlanType` (seed, `StoreEntityTypeConfiguration:23` default 2=Pago) | `((StorePlanType)src.StorePlanId).GetDescription()` mapped in `StoreProfile` onto `StorePlanDto`/`OwnerStoreDto` — no nav load needed. Additive, null-safe fallback `"Gratis"` |
| AD-4 | Replace PlanPicker | Keeps tabs+`selected`/`priceIncluded` heuristic in play | New shared `PlanPanels` (accordion, default-expanded = active panel, per-module currentPrice + strikethrough + Σ total, `?` tooltips from features, per-panel `Activar ese plan`) used by page + modal. `plan-picker.tsx` deleted |
| AD-5 | Activation flow | Immediate vs. deferred-on-Guardar. Proposal: remove picker Guardar from page+modal | Click → `confirmDialog` → `updateStore({moduleIds})` → `getUserByToken()` → reflect; error → `showAcknowledgeError`, no close, no local mutation (same shape as today's `store-plan.tsx:78-95`) |
| AD-6 | DG-7 lock | Old proxy `modules.some(m => !m.priceIncluded && m.selected)`; historical bug `store-form.tsx:72-82` | `readOnly = !isSuperAdmin && isPaidPlan(store.planType)` where paid = `Pago`/`Superior` |
| AD-7 | Feature tooltips | Separate fetch adds a round trip; `FeaturesController` is class-gated `SuperAdmin` (`FeaturesController.cs:14`) but `available` is method-`StoresAdmin` (`:34`) — works today | `getFeaturesToStore()` → `GET /v1/Features/available`, group `FeatureDto` by `ModuleId` per tooltip |
| AD-8 | Menu entry | Removing `MENU.STORES_PLAN` (`menu-config.ts:325-333`) leaves plan page reachable via my-stores gear + modal; route file stays | Remove menu item; keep `store-plan.tsx` mounted at `management/stores` |
| AD-9 | i18n | `STORES.PLAN.ACTIVATE` = `'Activar este plan'` is pinned by S2-01; `WILL_ACTIVATE_ON_SAVE` dies with Guardar | New key `ACTIVATE_PLAN` = `'Activar ese plan'`; retire `WILL_ACTIVATE_ON_SAVE`/`INCLUDES*` from picker usage |

## Data Flow

    store-plan page / owner modal
      ├─ getPlan(storeId) / getMyStores() → StorePlanDto.planType / OwnerStoreDto.planType
      ├─ getPlans()            → PlanDto[] (Gratis, Pago, Superior; no VIP)
      ├─ getFeaturesToStore()  → FeatureDto[] groupBy ModuleId → tooltips
      └─ default-expand panel whose planType === store.planType

    Activation: panel "Activar ese plan" (hidden if readOnly or active panel)
      → confirmDialog → updateStore(storeId, { moduleIds: plan.moduleIds })
      → getUserByToken() → (modal) close / (page) re-render with new planType
      → error: showAcknowledgeError, stay put

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/Domain/Interfaces/Repositories/IPlanRepository.cs` + `Infrastructure/Persistence/Repositories/PlanRepository.cs` | Create | Catalog query: active, non-VIP, `StorePlanModules`+`Module`, ordered |
| `backend/src/Application/Dtos/Administration/Plans/PlanDto.cs` (+`PlanModuleDto.cs`) | Create | Id, Name, Order, PlanType, Modules(row: ModuleId, Name, Order, Price, CurrentPrice, DiscountPrice, PercentDiscountPrice, DiscountText) |
| `backend/src/Application/Features/Administration/Plans/Queries/GetPlans/GetPlansQuery.cs` (+handler) | Create | Gate `IsSuperAdminOrOwnerAdmin` else `ApiException(UserNotFound, BadRequest)` — mirrors `GetAvailableModulesToStoreQuery.cs:36-37` |
| `backend/src/Application/Mappings/Administration/PlanProfile.cs` | Create | `StorePlan→PlanDto`, `StorePlanModule→PlanModuleDto`; prices via `CurrentPriceServiceUtils.GetCurrentPrice` (mirror `ModuleProfile.cs:13-20`) |
| `backend/src/SMCA.WebApi/Controllers/v1/PlansController.cs` | Create | `[ApiVersion("1.0")] [HasPermission(StoreRoleFeatures.StoresAdmin)]`, `GET /v1/plans` |
| `backend/.../Dtos/StoreManagement/{StorePlanDto,OwnerStoreDto}.cs` | Modify | Add `string PlanType` |
| `backend/.../Mappings/StoreManagement/StoreProfile.cs` | Modify | PlanType member (AD-3) |
| `frontend-react/packages/domain/src/models/store.ts` | Modify | Add `Plan`, `PlanModule`, `planType` on `StorePlan`/`OwnerStoreWithPlan` |
| `frontend-react/apps/web-store-pos/app/management/stores/lib/services/store-http-service.ts` | Modify | `getPlans()`, `getFeaturesToStore()` typed via `apiClient` |
| `frontend-react/.../components/plan-panels.tsx` (+ `__tests__/plan-panels.test.tsx`) | Create | Shared accordion panels; replaces `plan-picker.tsx` |
| `frontend-react/.../routes/store-plan.tsx` | Modify | Panels + `planType` lock; remove save flow/catalog merge |
| `frontend-react/.../routes/my-stores.tsx` + `components/edit-plan-modal.tsx` | Modify | Modal renders panels; activation handler; no Guardar |
| `frontend-react/.../components/store-form.tsx` | Modify | Drop `modules`/`moduleIds`/PlanPicker/`includePlan` |
| `frontend-react/.../routes/edit-store.tsx` | Modify | Drop catalog fetch + `moduleIds` from create payload (backend defaults Superior); keep data-update branch |
| `frontend-react/.../lib/store-modules.ts` | Delete | `mergeStoreModules` unused after panels; `my-stores.tsx:70` stops merging |
| `frontend-react/.../shared/lib/config/menu-config.ts` | Modify | Remove `MENU.STORES_PLAN` (AD-8) |
| `frontend-react/.../shared/lib/i18n/es.ts` | Modify | AD-9 keys |
| `frontend-react/.../components/plan-picker.tsx` (+test) | Delete | Replaced by panels |
| Unit tests: `store-form.test.tsx` (DG-7 block), `store-plan.test.tsx`, `my-stores.test.tsx`, `store-routes.test.tsx`, `store-creation-trial.test.tsx` (`moduleIds` in create payload, `:257`), `store-http-service.test.ts` | Modify/Delete | Follow component changes; DG-7 coverage moves to `plan-panels.test.tsx` |
| `frontend-react/e2e/store-plan-activation.spec.ts` (S2-01), `owner-stores.spec.ts` (E-08/E-09), `store-plan-lock-regression.spec.ts` (S2-02) | Modify (AUTHORIZED) | Panels replace tabs; `'Activar ese plan'`; drop WILL_ACTIVATE assertions; lock assert unchanged in spirit |
| `backend/src/Application.Tests/.../GetPlans/...` | Create | Handler gate + DTO shape + planType mapping |
| `backend/.../SMCA.WebApi.E2ETests/Plans/StorePlanCatalogTests.cs`, `store-update.spec.ts` | Untouched | Seed contract + data-only PUT stay valid |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (frontend) | Panels: default expansion, Σ totals, `?` tooltips, `Activar ese plan` visibility (readOnly/active), activation call + error no-close | `plan-panels.test.tsx` (pattern: `plan-picker.test.tsx` `makeModule`/IntlProvider) |
| Unit (frontend) | Service mocks `getPlans`/`getFeaturesToStore` | Extend `store-http-service.test.ts` |
| Unit (backend) | `GetPlansQueryHandlerTests` — gate, VIP exclusion, price computation | Mirror `ModuleProfile` tests in `Application.Tests` |
| E2E (authorized) | S2-01 flow 1:1 by panel; S2-02 lock discriminator; E-08/E-09 | `pnpm test:e2e` (authorized specs only) |
| Full | Typecheck + `pnpm test` + `dotnet test backend/src/SMCA.sln` | Pre/post failure counts (baseline 13/24) must not grow |

## Threat Matrix

`N/A` — no routing table, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. (Frontend route files are untouched; menu removal is sidebar navigation. Auth-session invariant untouched: `getUserByToken` refresh only, post-login — no `authLoader`/`guestOnlyLoader`/`needsUnlock` change.)

## Migration / Rollout

No DB/data migration (plan tables exist since `20260908194349_Add-StorePlans`). Additive backend first (`GET /v1/plans` + `planType`), then frontend service/models, panels, form removal, menu/i18n, tests. E2E edits only within the authorized spec list, same change. Commit slices per `work-unit-commits` (backend / service+models / panels / form removal / menu+i18n / tests) — each keeps the suite green; direct commits on `dev`.

## Open Questions

- Exact confirm-dialog copy (`confirmDialog`) — verify Angular text before tasks.
- `planType` display casing: use enum `GetDescription()` verbatim (`Gratis|Pago|Superior`); confirm no Angular divergence needed.
- Whether `store-modules.ts` deletion frees its (nonexistent) test file — verified at apply.