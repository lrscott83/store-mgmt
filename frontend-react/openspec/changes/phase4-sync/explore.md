# Exploration: phase4-sync (Synchronization — Export/Import)

**Change:** phase4-sync
**Phase:** Explore
**Status:** Done
**Date:** 2026-05-31
**Mode:** Hybrid (engram + openspec file)

---

## Scope

Phase 4 (Sync and Management) per `docs/prd/PRD.md`, scoped to **Synchronization only** (Export/Import). Management and Profile are separate future changes.

## Current State

The Synchronization module is scaffolded at the nav/enum level but has **zero implementation files**. No `sync/` directory exists under `apps/web-store-pos/app/`.

Existing scaffolding:
- `app/shared/lib/config/menu-config.ts` L59–65: `MENU.SYNCHRONIZATION` group → `/sync/export` (EFeatures.Send=40), `/sync/import` (EFeatures.Receive=42).
- `app/shared/lib/i18n/es.ts` L88–89: `MENU.EXPORT`, `MENU.IMPORT` already translated.
- `packages/domain/src/enums/index.ts` L25–27: `Send=40`, `Download=41`, `Receive=42`.
- `EFeatures.Download=41` is dormant (no route, no menu) — out of scope for Phase 4.
- Routes `/sync/export`, `/sync/import` are NOT registered in `routes.ts`.
- `@zip.js/zip.js` is NOT installed — blocking dependency.

## Storage Layer — Repository Map

| Entity | React class | entityKey | React localStorage key | Angular key | Match |
|---|---|---|---|---|---|
| ProductCategory | `ProductCategoryOfflineService` (BaseRepository) | `product-categories` | `lizoft.store-product-categories-{storeId}` | same | ✅ |
| Product | `ProductOfflineService` (BaseRepository) | `products` | `lizoft.store-products-{storeId}` | same | ✅ |
| InventoryEntry | `InventoryRepository` (custom) | `inventoryentries` | `lizoft.store-inventoryentries-{storeId}` | `lizoft.store-inventory-entries-{storeId}` | ⚠ KEY MISMATCH |
| Order | `OrderOfflineService` (BaseRepository) | `orders` | `lizoft.store-orders-{storeId}` | same | ✅ |
| Expense | `ExpenseOfflineService` (BaseRepository) | `expenses` | `lizoft.store-expenses-{storeId}` | same | ✅ |
| SaleCredit | `SaleCreditOfflineService` (BaseRepository) | `saleCredits` | `lizoft.store-saleCredits-{storeId}` | same | ✅ |

## CRITICAL: Serialization Format Divergence

React `BaseRepository.save()` (`base-repository.ts` L46) always serializes as `JSON.stringify(Array.from(map.entries()))` — `[[id, entity], ...]` Map-entries. Angular used **two formats** by entity type:

| Entity | Angular ZIP format | React internal format | Rule |
|---|---|---|---|
| Categories | `[[id, cat], ...]` | `[[id, cat], ...]` | same |
| Products | `[[id, prod], ...]` | `[[id, prod], ...]` | same |
| Inventory Entries | `[[productId, InventoryEntry[]], ...]` | same | same |
| Orders | `[order, ...]` flat array | `[[id, order], ...]` | **export must flatten** |
| Expenses | `[expense, ...]` flat array | `[[id, expense], ...]` | **export must flatten** |
| SaleCredits | `[credit, ...]` flat array | `[[id, credit], ...]` | **export must flatten** |

Confirmed: Angular `order-offline.service.ts` L422 `JSON.stringify(orders)` (Order[]); `expense-offline.service.ts` L201; `sale-credit-offline.service.ts` L277. React `base-repository.ts` L46 always Map-entries.

**A naive raw-localStorage dump produces a ZIP Angular cannot consume.**

## Affected Areas

New (greenfield):
- `app/sync/routes/export.tsx` — `/sync/export`, `featureLoader([EFeatures.Send])`
- `app/sync/routes/import.tsx` — `/sync/import`, `featureLoader([EFeatures.Receive])`
- `app/sync/lib/services/data-serializer-service.ts` — ZIP creation/parse, format translation
- `app/sync/lib/services/data-synchronizer-service.ts` — upsert merge into repositories
- `app/sync/components/export-form.tsx`
- `app/sync/components/import-form.tsx`

Modified:
- `app/routes.ts` — register two sync routes
- `app/shared/lib/i18n/es.ts` — add `SYNC.*` keys
- `apps/web-store-pos/package.json` — add `@zip.js/zip.js`

## Approaches

- **A — Raw localStorage strings:** trivial but BROKEN (Angular can't read orders/expenses/saleCredits). Rejected.
- **B — Service-layer read + format-aware serialization (RECOMMENDED):** read via offline services, convert per-entity (Map-entries for categories/products/inventory; flat array via `Array.from(map.values())` for orders/expenses/saleCredits). Import reverses + upserts. Categories before products (referential integrity). Mirrors existing route-container + offline-service pattern.
- **C — Versioned wrapper (metadata.json + schema version):** future-proof but adds scope now. Defer.

## Risks

1. **Serialization format mismatch (HIGH)** — orders/expenses/saleCredits must export as flat arrays; import must parse flat arrays for these three.
2. **`@zip.js/zip.js` missing (HIGH, blocking)** — add before apply.
3. **InventoryRepository key divergence (MEDIUM)** — `inventoryentries` (React) vs `inventory-entries` (Angular). Does not affect ZIP exchange; affects in-browser Angular→React device migration. Document, out of sync scope.
4. **`EFeatures.Download=41` dormant (LOW)** — leave dormant.
5. **Web Share API (LOW)** — `navigator.share` needs HTTPS; fallback to WhatsApp deep link (matches Angular).
6. **Category import uniqueness vs upsert (LOW)** — use plain `repo.upsert()` on import to avoid false failures on re-import.

## Next Recommended

`sdd-propose`
