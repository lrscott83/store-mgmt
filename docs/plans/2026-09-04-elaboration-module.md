# Elaboration Module (Módulo de Elaboración) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production/elaboration module to web-store-pos so a merchant can register recipes (recetas), run elaborations (orders that consume ingredient stock and produce the finished product), and get REAL cost per produced unit recorded automatically — following the Odoo 17 / ERPNext modeling triad (BoM → Production Order → stock movements + real cost), adapted to the app's offline-first architecture. The module ships END-TO-END: new backend module + features/permissions (EF migration + generated SQL script), frontend domain models, offline services, routes/menu gated by the NEW feature ids, and full sync export/import wiring (eighth/ninth entity files).

**Architecture:** Three new per-store offline entities (same persistence shape as expenses/exchange-rates/warehouses): `Recipe` (the BoM: finished product + components with qty-per-output + scrap % + labor cost + overhead %), `Elaboration` (the production order: recipe × batches, snapshot of component consumption at REAL weighted-average cost), and two new `WarehouseStockMovement` types (`consumption_out` for ingredients, `elaboration_in` for the finished good) so every elaboration is an auditable append-only movement pair. The finished product's inventory value is updated by appending an `InventoryEntry` (existing primitive) with the computed real unit cost, so every subsequent sale discounts the REAL cost from day one. Backend gets a NEW module (`ModuleType.Elaboration = 12`) with two features (`FeatureType.Recipes = 120`, `FeatureType.Elaborations = 121`) seeded via `HasData`, shipped through an EF migration whose exact operations are replicated in a manual SQL script (VPS deployment path, pattern of `backend/scripts/03/04`). Sync export/import treats recipes and elaborations as new entity files (`recipes.json`, `elaborations.json`) — the complete circuit: serializer, synchronizer validation, `StorageKeys`, `entity-migration`, and `store-data-reset`.

**Tech Stack:** Backend: .NET 8, EF Core (PostgreSQL), xUnit. Frontend: React 19, TypeScript, packages/domain, Vitest + jsdom, Playwright E2E (new spec only — never touch existing specs).

## Research summary — how Odoo & ERPNext model this (2026-09-04 investigation)

Both references share the same core triad, and this plan adopts it:

| Concept | Odoo 17 | ERPNext | This plan (store-mgmt) |
|---|---|---|---|
| Recipe | **BoM**: product + components + qty, optional operations (work center cost/hour) | **BOM**: items + qty + scrap % per item, operations (workstation rate × time), multi-level, percentage-based qty with balance item (v16) | **Recipe**: finished product, outputQty per batch, components[] (productId, qty per output, scrapPct?), laborCost? (fixed per batch), overheadPct? |
| Production order | **MO**: consumes components → produces finished; **MO cost** (estimated) vs **real cost** (actual quantities) | **Work Order**: material transfer to WIP → manufacture (BOM-based backflush OR transfer-based) → finished goods in | **Elaboration**: pick recipe + warehouse holding ingredients + batch count → on confirm: append movements, snapshot real cost from `WarehouseStockLevel.costPrice` (weighted avg), append InventoryEntry for finished product |
| Real cost divergence | actual component qty ≠ BoM | scrap %, actual consumption | `actualQty` per component (defaults to theoretical, editable at confirm), scrapPct inflates theoretical |
| Mermas | Scrap during manufacturing (recorded with cost) | Scrap % per BOM item | scrapPct per component (planned) + edited actualQty (real) |
| Physical count | Inventory Adjustment / Cycle counts | Stock Reconciliation | **Out of scope** — see Roadmap |
| Cost of produced unit | component avg cost + operation cost | valuation rate + operation cost | `Σ(actualQty × costPrice) + laborCost + overhead` ÷ producedQty → appended as InventoryEntry costPrice |

Key invariants adopted (already documented in `warehouse.ts`): stock `onHand` only mutates via append-only movements; movement quantity is always positive magnitude with direction given by type; weighted-average `costPrice` on `WarehouseStockLevel` — production consumption uses that cost, exactly like a sale does.

## Scope interpretation (explicit — confirm if wrong)

The module's **business data (recipes, elaborations) stays offline-first per store** (localStorage), traveling only inside encrypted sync zips — same as expenses, exchange-rates and warehouses already do. The backend gets the module + features + permissions as **seed data** (Module/Feature rows), NOT business tables for recipes. If server-side Recipe/Elaboration tables are wanted, that is a different, much larger change — flag it before starting.

## Global Constraints

- **SUPERPOWERS ONLY.** Do NOT use any `sdd-*` skill or subagent here (user-mandated rule).
- **E2E tests are untouchable** (user-mandated): never modify/delete/weaken an existing E2E spec (`frontend-react/e2e/`) or backend E2E test. This plan ONLY ADDS new specs. Same for existing backend unit tests — extend additively or add new test files; if a seed-count assertion (e.g. Domain.UnitTests "Distinct (FeatureType, RoleType) combinations") legitimately changes because of the new features, update the expected number with a comment naming the cause.
- **Backend production code IS in scope for this plan**, but ONLY for: enums (`ModuleType`, `FeatureType`), seed configurations (`ModuleEntityTypeConfiguration`, `FeatureEntityTypeConfiguration`), the EF migration, and the derived SQL script. Any other backend change (controllers, endpoints, handlers) is out of scope — STOP and ask.
- **Migration-then-script order (user-mandated):** generate the EF migration FIRST (`dotnet ef migrations add ...`), THEN write the SQL script replicating the migration's exact operations (pattern: `backend/scripts/03-...sql`, `04-...sql`: `START TRANSACTION` → INSERT/UPDATE seed rows → `setval` fix-ups for `"Feature"`/`"Module"` sequences → INSERT INTO `"__EFMigrationsHistory"` → `COMMIT`). Never the other way around.
- **Angular is LEGACY.** Comments citing Angular parity are history; React frontend owns behavior.
- **Offline-first shape (follow existing services exactly):** encrypted plain-array wire format per store (see `ExpenseOfflineService`/`ExchangeRateOfflineService`/`WarehouseOfflineService`), per-instance cache reloaded when empty or store key changes, auto-init on empty read, date revival on load, `readEntityOrThrow` + `encryptEntity` seams, `StorageKeys.entityKey('recipes'|'elaborations', storeId)`.
- **Domain model direction:** all new TS types live in `frontend-react/packages/domain`; rebuild `pnpm --filter @store-mgmt/domain build` after touching it (known stale-dist gotcha). The TS enums `EFeatures`/`EModules` MUST be extended in lockstep with the backend enums (single source: the C# enum; the TS enum mirrors ids).
- **Costing rules (pinned):**
  1. Ingredient cost = the holding warehouse's `WarehouseStockLevel.costPrice` (weighted average) at elaboration time — NOT `productCosts`, NOT last entry.
  2. Theoretical consumption per component = `qty × batches × (1 + scrapPct/100)`; the user may edit the REAL consumed qty at confirm (defaults to theoretical). Real cost diverges from estimate exactly like Odoo's MO cost vs real cost.
  3. Produced unit cost = `(Σ realQty × costPrice + laborCost + overhead) / (outputQty × batches)`, `round2`.
  4. That unit cost is appended as a new `InventoryEntry` (`InventoryOfflineService.createInventoryEntry`, existing primitive) — the sale path (`calculateOrderProfit` → `productCosts`) picks it up with zero changes: **the first sale of a produced unit already discounts its real cost**.
- **Warehouse requirement:** an elaboration needs a warehouse holding the ingredients (stock check + consumption) via the shipped `WarehouseOfflineService.recordMovement` primitive. No warehouses configured → the module shows an empty state explaining a warehouse is required (no silent fallback to legacy store stock).
- **No create/delete of movements:** append-only audit log. **Elaborations are immutable once confirmed** (no Unbuild in this slice).
- **Menu convention:** NO icon on the menu item (repo convention, 2026-09-04). Lists follow the collapsed-panel patterns of the history views.
- **i18n:** all UI strings via new `RECIPE.*` / `ELABORATION.*` / `MENU.*` keys in `es.ts` (Spanish, neutral Latin American).
- **Sync export/import:** additive, never breaking existing zips (import of an old zip simply carries no recipes/elaborations). The complete entity circuit must be wired: `DataSerializerService`, `DataSynchronizerService`, `StorageKeys`, `entity-migration.ts`, `store-data-reset.ts` (wipe list grows — update the entity-count comments that other files carry, e.g. "seven business entities" phrasing found in `products.tsx` comments).

## Data model (packages/domain)

```ts
// models/recipe.ts
export interface RecipeComponent {
  productId: string;
  /** Quantity of the ingredient consumed per ONE output unit of the finished product. */
  qty: number;            // round2, > 0
  /** Planned mermas: consumed = qty × (1 + scrapPct/100). 0–100. */
  scrapPct: number;       // 0 default
}

export interface Recipe extends AuditableBaseModel {
  id: string;
  /** Finished product id (must exist, any category). */
  productId: string;
  /** Units of the finished product ONE batch produces (rende). > 0. */
  outputQty: number;      // round2, > 0
  components: RecipeComponent[];  // ≥ 1
  /** Fixed labor cost per batch (optional, 0 default). */
  laborCost: number;
  /** Overhead (energy/fuel) as % of ingredients cost (optional, 0 default). */
  overheadPct: number;   // 0–100
  isActive: boolean;
}

// models/elaboration.ts
export interface ElaborationComponentActual {
  productId: string;
  /** Theoretical qty (scrap-inflated) — snapshot, audit of the estimate. */
  theoreticalQty: number;
  /** Real consumed qty as confirmed by the user (≥ 0). */
  actualQty: number;
  /** Weighted-avg cost per unit at elaboration time — snapshot. */
  costPrice: number;
}

export interface Elaboration extends AuditableBaseModel {
  id: string;
  recipeId: string;
  recipeName: string;         // denormalized snapshot (recipes are editable later)
  productId: string;          // finished product snapshot
  /** Warehouse the ingredients were consumed from. */
  warehouseId: string;
  batches: number;            // ≥ 1
  /** Total units produced = recipe.outputQty × batches. */
  producedQty: number;
  components: ElaborationComponentActual[];
  laborCost: number;          // snapshot = recipe.laborCost × batches
  overheadPct: number;        // snapshot
  /** Real total cost = Σ(actualQty × costPrice) + laborCost + overheadCost. */
  totalCost: number;
  /** Real cost per produced unit = totalCost / producedQty. */
  unitCost: number;
  createdDate: Date;
  createdByName: string;
}

// models/warehouse.ts — additive union members
export type WarehouseMovementType =
  | 'purchase_in' | 'sale_out' | 'transfer_in' | 'transfer_out'
  | 'consumption_out'   // NEW — ingredient consumed by an elaboration
  | 'elaboration_in';   // NEW — finished good produced
```

**TS enums (lockstep with backend):** `EModules.Elaboration = 12`, `EFeatures.Recipes = 120`, `EFeatures.Elaborations = 121`.

**Errors** (`errors/recipe-errors.ts`, `errors/elaboration-errors.ts`, DataResult codes like `ExchangeRateErrors`): `RecipeProductNotExists`, `RecipeDuplicateForProduct` (one ACTIVE recipe per product in v1), `RecipeEmptyComponents`, `RecipeInvalidQty`, `ElaborationInsufficientStock` (message names product + available + needed), `ElaborationWarehouseNotExists`.

## Roadmap positioning (explicitly out of scope here)

- **Slice 1 (THIS PLAN):** Backend module+features+migration+script → Recipes CRUD + Elaboration confirm flow + real cost + stock movements + InventoryEntry feeding + menu + full sync circuit + E2E.
- **Slice 2 (future):** Ficha de costo general (taxes/utilidad/precio final breakdown per recipe), labor per-operation, multi-level recipes (sub-assemblies).
- **Slice 3 (future):** Conteo físico per warehouse (`adjustment_in/out` movements), conversion (fraccionar) as one-input elaboration shortcut, Unbuild (Odoo pattern).
- Mermas in slice 1 are planned-scrap% + editable actuals only; a mermas-with-reason registry already exists as **Egress** — no duplication.

## Task 1 — Frontend domain models + enums (packages/domain)

- [ ] 1.1. Create `frontend-react/packages/domain/src/models/recipe.ts` and `elaboration.ts` exactly per "Data model" above (doc comments in English; validation lives in the service, not domain).
- [ ] 1.2. Extend `WarehouseMovementType` in `models/warehouse.ts` with the two new members (additive; extend the doc comment).
- [ ] 1.3. Extend the TS enums mirroring the backend: `EModules.Elaboration = 12` ("Elaboración"), `EFeatures.Recipes = 120` ("Recetas"), `EFeatures.Elaborations = 121` ("Elaboraciones").
- [ ] 1.4. Create `errors/recipe-errors.ts` and `errors/elaboration-errors.ts` (pattern: `exchange-rate-errors.ts`) + unit tests in `errors/__tests__/` (pattern: `warehouse-errors.test.ts`).
- [ ] 1.5. Export everything from `domain/src/index.ts`; rebuild domain (`pnpm --filter @store-mgmt/domain build`).
- [ ] 1.6. **Verify:** domain tests + build green.

## Task 2 — Backend: new module, features, migration, SQL script

- [ ] 2.1. `backend/src/Domain/Common/Enums/ModuleType.cs`: add `Elaboration = 12` with `[Description("Elaboración")]` (next free id after Credits = 11).
- [ ] 2.2. `backend/src/Domain/Common/Enums/FeatureType.cs`: add under a `// Elaboración` section: `Recipes = 120` ("Recetas"), `Elaborations = 121` ("Elaboraciones") (next free range after Credits = 110).
- [ ] 2.3. `ModuleEntityTypeConfiguration.cs` `HasData`: add `Module.Create((int)ModuleType.Elaboration, "Elaboración", order: 55, priceIncluded: true, price: 0, availableToStore: true, isActive: true)`. **Pricing decision (DEFAULT — confirm with owner):** included in the base plan like Sales/Inventory (`PriceIncluded=true, Price=0`). To charge for it instead, use `priceIncluded: false, price: 1` (the 1 USD tier of scripts 09/10) — one line either way, decided BEFORE the migration is generated.
- [ ] 2.4. `FeatureEntityTypeConfiguration.cs` `HasData`: add the two features pointing at Module 12 with Spanish descriptions (pattern of existing rows): Id 120 "Funcionalidad para gestionar las recetas de elaboración de productos", Id 121 "Funcionalidad para registrar elaboraciones con consumo de insumos y costo real".
- [ ] 2.5. Check seed-dependent unit tests: Domain.UnitTests `Distinct (FeatureType, RoleType) combinations` expected count (48 today) grows with the new features — update the expected number with a comment naming `Add-Elaboration-Module` as the cause. Grep Application.Tests for any module/feature seed-count assertions and extend additively.
- [ ] 2.6. **Generate the EF migration** (order matters — user-mandated): from `backend/src/SMCA.WebApi`: `dotnet ef migrations add Add-Elaboration-Module --project ../Infrastructure --startup-project .`. Inspect the generated migration: it must contain ONLY `InsertData` for `"Module"` (1 row) and `"Feature"` (2 rows) — anything else means a model snapshot divergence; STOP and investigate, do not hand-edit.
- [ ] 2.7. **Generate the SQL script FROM the migration** (pattern of `backend/scripts/03/04/09/10`): `backend/scripts/12-<YYYYMMDD>-Add-Elaboration-Module.sql` containing `START TRANSACTION` → the migration's exact INSERTs (`"Module"`, `"Feature"`) → `setval` fix-ups for both sequences (`SELECT setval(pg_get_serial_sequence('"Feature"','Id'), GREATEST((SELECT MAX("Id") FROM "Feature")+1, nextval(...)), false)` and the same for `"Module"`) → `INSERT INTO "__EFMigrationsHistory" ("MigrationId","ProductVersion") VALUES ('<migration-id>', '<ef-version>')` → `COMMIT`. Update `backend/scripts/README.md` index.
- [ ] 2.8. **Verify backend:** `dotnet build backend/src/SMCA.sln` 0 errors; `dotnet test backend/src/Domain.UnitTests` + `Application.Tests` green (with updated counts); run the migration against `smca_test` (WebAppFixture applies migrations on backend E2E — `dotnet test backend/src/SMCA.WebApi.E2ETests` green proves the migration applies cleanly); confirm `"Module"` Id 12 and `"Feature"` Ids 120/121 exist post-migration and that an EXISTING store's auth payload exposes the new features (PriceIncluded=true means active stores get them; if a StoreModule row is also required for existing stores, follow the `99-Active-Report-Module` precedent and add that UPDATE/INSERT to the script — investigate `StoreModuleEntityTypeConfiguration` before finalizing).

## Task 3 — RecipeOfflineService (recipes repository)

- [ ] 3.1. Create `app/inventory/lib/services/recipe-offline-service.ts` (production is inventory-flavored; sits with warehouses). Same offline shape as `ExchangeRateOfflineService`.
- [ ] 3.2. CRUD: `getStorageRecipes()`, `getRecipeById`, `getActiveRecipeForProduct(productId)`, `addRecipe` (validates: product exists via `ProductRepository`, components ≥ 1, qty > 0, scrapPct 0–100; fails `RecipeDuplicateForProduct` if an active recipe exists), `updateRecipe` (same validations, self-exclusion), `deactivateRecipe` (soft — elaborations keep their snapshot).
- [ ] 3.3. Import seams: `addImportedRecipe` / `updateImportedRecipe` (pattern: exchange-rates).
- [ ] 3.4. Unit tests (pattern: `exchange-rate-offline-service.test.ts`): create+persist, duplicate rejection, update self-exclusion, deactivate frees the product, product-not-exists, empty components, invalid qty/scrapPct, date revival, cache reload on store change.
- [ ] 3.5. **Verify:** targeted vitest + lint green.

## Task 4 — ElaborationOfflineService (the production engine)

- [ ] 4.1. Pure math in `app/inventory/lib/elaboration-math.ts` (mirrors the `wholesale.ts` pure-helper pattern): `planElaboration(recipe, batches, stockLevels)` → per-component `{ theoreticalQty, costPrice, available, sufficient }` + totals `{ laborCostTotal, overheadCost, estimatedTotal, estimatedUnit, producedQty }`. Exhaustive unit tests.
- [ ] 4.2. `app/inventory/lib/services/elaboration-offline-service.ts` — `confirmElaboration({ recipeId, warehouseId, batches, actualComponents })`, the transaction (mirrors warehouse movement discipline):
  1. Re-read recipe + warehouse stock levels; validate stock per component (`actualQty ≤ available` else `ElaborationInsufficientStock`).
  2. Append `consumption_out` movement per ingredient (qty = actualQty).
  3. Append `elaboration_in` movement for the finished product (qty = producedQty).
  4. Compute real cost (Costing rules 3) and append the `Elaboration` record with snapshots.
  5. Append `InventoryEntry` via `InventoryOfflineService.createInventoryEntry(productId, producedQty, unitCost)`.
  6. Return the elaboration in a `DataResult` (never throws).
- [ ] 4.3. `getElaborations()`, `getStorageElaborationsJson()` (sync seam), import seams.
- [ ] 4.4. Unit tests: confirm produces movements + entry + record; insufficient stock blocks ALL writes (atomicity); cost snapshot uses warehouse costPrice; scrap inflates theoretical; edited actualQty diverges cost; elaboration immutable after confirm; import roundtrip.
- [ ] 4.5. **Verify:** targeted vitest + lint green.

## Task 5 — Routes + menu (gated by the NEW features)

- [ ] 5.1. `app/inventory/routes/recipes.tsx` — list (collapsed panels per product category, history-view pattern), create/edit modal (product picker, components add/remove rows pattern from `wholesale-config-section`, laborCost + overheadPct fields), deactivate via confirm dialog. NO menu icon.
- [ ] 5.2. `app/inventory/routes/elaborations.tsx` — "Nueva elaboración": recipe picker → batches → warehouse picker → components review table (theoretical vs editable actual + cost each + totals) → confirm; success toast + day-grouped history below (pattern `entries.tsx`) showing product, producedQty, totalCost, unitCost.
- [ ] 5.3. `routes.ts`: `route('inventory/recipes', ...)`, `route('inventory/elaborations', ...)`; guards `featureLoader([EFeatures.Recipes])` / `featureLoader([EFeatures.Elaborations])` — the NEW feature ids from Task 1/2, NOT a borrowed feature.
- [ ] 5.4. `menu-config.ts`: NEW group `MENU.ELABORATION` ("Elaboración", `EModules.Elaboration`) with "Recetas" and "Elaboraciones" items, NO icons, Spanish helpContent.
- [ ] 5.5. i18n keys in `es.ts`: `MENU.ELABORATION`, `MENU.RECIPES`, `MENU.ELABORATIONS`, `RECIPE.*`, `ELABORATION.*`.
- [ ] 5.6. Route unit tests (pattern: `exchange-rates.test.tsx`): recipes page renders/validates/deactivates; elaborations plan-preview renders, insufficient stock blocks confirm with the named message, confirm succeeds and history shows totalCost/unitCost; menu shows the new group for a user with the features (and hides it without).
- [ ] 5.7. **Verify:** typecheck + lint + targeted vitest green.

## Task 6 — Sync export/import (complete entity circuit)

- [ ] 6.1. `StorageKeys`: add the two entity keys (`recipes`, `elaborations`) following the exchange-rates precedent.
- [ ] 6.2. `entity-migration.ts`: register the new keys for the encrypted-plaintext migration pass (pattern: exchange-rates seventh-entry wiring).
- [ ] 6.3. `DataSerializerService`: add `recipes.json` + `elaborations.json` via the services' `getStorage*Json` seams (exact exchange-rates pattern).
- [ ] 6.4. `DataSynchronizerService`: import/validation rules — recipe product exists in the merged product set (order-independent, like category resolution); one active recipe per product across the merge (duplicate-analog of barcode-uniqueness); elaboration warehouse exists when warehouses are imported together; import seams wired.
- [ ] 6.5. `store-data-reset.ts`: add both entities to the wipe list; update the entity-count comments wherever they live (e.g. `products.tsx` "seven business entities" phrasing — re-grep after Task 2/3 land).
- [ ] 6.6. Tests: extend sync suites additively + new `data-synchronizer-elaborations.test.ts` (mirror: `data-synchronizer-warehouses.test.ts`); roundtrip old-zip (no recipes) imports with zero recipes — no breaking.
- [ ] 6.7. **Verify:** sync suites green; manual smoke of export→import with a recipe+elaboration via the UI.

## Task 7 — E2E (new spec only)

- [ ] 7.1. NEW `e2e/elaboration.spec.ts` (never touch existing specs): persona `owner-admin-with-products` — seed warehouse stock for two ingredients (via the warehouses UI), create a recipe for a new finished product, run an elaboration of 2 batches, assert history shows real cost; sell ONE unit of the finished product; assert today's profit view shows `salePrice − recorded unitCost` (the whole point: real cost from the first sale).
- [ ] 7.2. Run the FULL E2E suite (backend via `http-e2e` with Start-Process — NEVER a PS job; `pnpm test:e2e`) — zero regressions; known-flaky list allowed.
- [ ] 7.3. **Verify:** new spec green; full suite green.

## Task 8 — Full verification + docs

- [ ] 8.1. Full README verification: `dotnet build` 0 errors; Domain.UnitTests + Application.Tests (grown counts) green; backend E2E green (proves the migration applies); `pnpm turbo run typecheck lint test` all workspaces; `pnpm test:e2e`.
- [ ] 8.2. Update this plan's checkboxes during implementation; commit per work-unit (`feat(elaboration): ...` / backend commit `feat(elaboration): add module, features and migration`).
- [ ] 8.3. Deployment note for the VPS (append to README's migration section): apply via EF (`dotnet ef database update`) OR the script `backend/scripts/12-...sql` — backup first per README §4 warning; `graphify update .` after merge (hook does it on commit anyway).

## Costing example (pinned as the acceptance math)

Recipe "Pan de 500g": outputQty 20 pieces; components: harina 3 kg (scrap 2%), levadura 0.05 kg, sal 0.04 kg, agua 2 L (scrap 5%); laborCost 50, overheadPct 10%. Warehouse costs: harina 20/u, levadura 80/u, sal 15/u, agua 0.5/u. One batch (batches=1):
- Theoretical: harina 3.06, levadura 0.05, sal 0.04, agua 2.10 → ingredients 61.2+4+0.6+1.05 = 66.85 → overhead 6.685 → labor 50 → **total 123.535 → unit = 123.535/20 = 6.18** (round2).
- With actualQty edited (real harina 3.2): recompute — real cost diverges from estimate, unit cost reflects it, first sale discounts it.

## Reference material

- Odoo 17 docs — Manufacturing: BoM, MO costs (MO cost vs real cost), by-products, unbuild: `https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/manufacturing/`
- ERPNext docs — Manufacturing: BOM (scrap %, operations, multi-level, percentage qty), Work Order (BOM-based vs transfer-based consumption), Production Plan: `https://docs.frappe.io/erpnext/user/manual/en/manufacturing/`
- Backend seed/migration/script precedents: `backend/scripts/03-Add-Expenses-Billing-Histories-Credits-Modules.sql`, `04-Add-Inventory-Today-Quantities-And-Today-SalesProfit-Features.sql`, migrations `20250804193255_*`, `20260309182537_*`; entity configs `ModuleEntityTypeConfiguration.cs` / `FeatureEntityTypeConfiguration.cs`.
- Sync seventh-entity precedent: exchange-rates wiring (commit `a508e5de`), warehouses wiring (commit `43d15006`).
- Full research notes in Engram: topic `elaboracion/research-odoo-erpnext` (project store-mgmt).
