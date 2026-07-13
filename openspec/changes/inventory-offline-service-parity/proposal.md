# Proposal: inventory-offline-service-parity

## Intent

Close Fase 4 (inventory). The React `InventoryOfflineService` financial/query API port, InventoryRepository elimination, and 2 ratified bug fixes are shipped and correct, but 4 unratified rule-3 name/signature divergences remain vs Angular `inventory-offline.service.ts`. User ratified (decision #1047) FIXING all 4 to Angular parity, then running a real bottom-up verify to formally close Fase 4.

## Scope

### In Scope
- **#1** `create(productId, quantity, costPrice, categoryId='', date=new Date())` → `createInventoryEntry(productId, quantity, costPrice)`. Drop `categoryId` (derive internally via `productRepository.getStorageProductsMap().get(productId).categoryId`, mirror Angular). Reconcile `date` per GATE-A.
- **#2** `deactivate(entryId, productId)` → `deleteInventoryEntry(productId, entryId)` — rename + restore Angular param order. Caller: `today-entries.tsx:88`.
- **#3** `getByDate(date)` → `getInventoryEntriesInDay(date)` — rename. Body behavior per GATE-C. Callers: inventory-today-sale-service.ts, today-quantities.tsx, today-sales-profit.tsx, today-entries.tsx + Observable sibling.
- **#4** `getAvailableByCategory(products=[])` → `getInventoryCategoriesView()` — rename + drop `products`, source internally per GATE-B. Callers: available.tsx, today-quantities.tsx + Observable sibling.
- Update the 2 Observable siblings' internal delegations (and #4 sibling signature) + all test mocks (strict TDD).
- Bottom-up verify against the 23-method Angular public surface to close Fase 4.

### Out of Scope (Non-Goals)
- Ratified/settled items — untouched: `eligibility` param, []-forcing `getProductInventoriesByProductId` (Stage-7 ADR-2), FIFO double-decrement + bucket-mixup bug fixes, `hasAvailableStock` helper.
- Narrowed DI (`storeId` + `productRepository`) stays as the convention unless GATE-B resolves to re-adding a dep.
- Resuming `offline-online-service-parity` mega-change; any online layer (no Angular inventory-online exists).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `inventory-service`: method names/signatures for create, delete, get-entries-in-day, and get-categories-view realigned to Angular; internal categoryId/product/category sourcing contract updated.

## Approach

- **#1/#4** — mirror Angular's internal derivation: categoryId from `productRepository` product record; #4 sources entries + product/category data internally (GATE-B picks the category-name source).
- **#2/#3** — pure rename (+ param swap for #2); ripple to production callers and test mocks.
- Verify EXACTLY against Angular before removing each param; do not invent sourcing paths (rule 12).

## DECISION GATES (orchestrator must ratify before spec/design)

- **GATE-A (#1 `date`)**: Angular `createInventoryEntry` has NO `date` param (always `new Date()`), but React's only caller passes a user-picked `new Date(data.date)` from the edit form. Options: (a) drop `date` → strict Angular parity, create-form date ignored (entry stamped "now"); (b) retain `date` → React enhancement (user picks entry date). Dropping also reconciles the current `date`-vs-`createdDate` split.
- **GATE-B (#4 category-name sourcing / DI)**: Angular sources category NAMES from `categoryRepository.getStorageCategoriesMap()` (a dep React dropped). Options: (a) source from injected `productRepository` (products denormalize `categoryName`) → zero new deps, but different sourcing path than Angular (rule-12 concern); (b) inject `ProductCategoryRepository` → mirrors Angular's exact sourcing, widens DI.
- **GATE-C (#3 body behavior)**: Angular `getInventoryEntriesInDay(date)` ACCEPTS but IGNORES `date` (always today); React `getByDate` HONORS it. Options: (a) keep React's honor-the-date body (treats Angular's ignored param as a bug fix, angular-bugs-policy); (b) mirror Angular's "always today". Behaviorally moot (all callers pass today) but a latent contract divergence. Low priority.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `inventory/lib/services/inventory-offline-service.ts` | Modified | 4 method renames/signatures + 2 Observable siblings |
| `inventory/routes/today-entries.tsx` | Modified | #1 create + #2 delete call-sites |
| `inventory/routes/{today-quantities,today-sales-profit,available}.tsx` | Modified | #3/#4 call-sites |
| `reports/lib/services/inventory-today-sale-service.ts` | Modified | #3 caller |
| `**/__tests__/*` (inventory-routes, inventory-today-sale-service) | Modified | mock renames (strict TDD) |
| `openspec/specs/inventory-service/spec.md` | Modified (delta) | method contracts |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Stage 7 report caller ripple (4+ callers, enriched arrays) | Med | Rename in lockstep; TDD guards each caller |
| GATE-B sourcing divergence violates rule 12 | Med | Surface gate; ratify before design |
| Heavy test-mock ripple (inventory-routes.test.tsx) | Med | Strict TDD; update mocks with renames |
| GATE-A drops a used form feature | Low-Med | Ratify with user before apply |

## Rollback Plan

All work is commits-only on `feat/frontend-parity-audit`. Revert the method-rename commit(s); call-sites and tests revert with them. No schema/storage change (storage keys and `InventoryEntry` shape untouched).

## Dependencies

- GATE-A, GATE-B, GATE-C ratified by orchestrator/user before sdd-spec / sdd-design.

## Success Criteria

- [ ] All 4 methods carry Angular names + signatures; extra params removed per gates.
- [ ] categoryId derived internally on create (no more stored `''`).
- [ ] All production callers + test mocks updated; suite green (strict TDD).
- [ ] Bottom-up verify PASS against 23-method Angular surface; Fase 4 closed.
