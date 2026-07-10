# Design: Eliminate BaseRepository

## Technical Approach

Delete the React-invented `BaseRepository<T>` and inline each of the 6 consumers' persistence, mirroring **that consumer's** Angular source file (not the generic). Source of truth per consumer = the matching Angular class's private `get*FromLocalStorage` / `set*LocalStorage`. Wire-format is FIXED by the ratified constraint (id 869): Map-entries for products/categories, plain array for orders/credits/expenses. No compat/migration layer (Angular has none — rule 12).

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Inline unit | Each consumer reproduces its OWN Angular file's storage | Copy the generic into each consumer | Copying the generic merely relocates the invention (homogenization trap) |
| Wire-format | Map-entries (prod/cat), plain array (order/credit/expense) | Keep Map-entries for all 5 | Ratified parity with Angular; BaseRepository wrongly forced Map-entries on all |
| Cache | Per-instance field + `lastKey`, replicating Angular's `getStorage*()` reload-on-empty/key-change | Keep no cache (BaseRepo read-every-call) | Faithful port; preserves Angular's within-method map-reference stability |
| Sync persistence | Sync-local storage shim satisfying the existing `NameUniqueRepo`/`GenericUpsertRepo` interfaces | Route synchronizer through repo/service `addImported*` | Routing through domain methods = the out-of-scope orchestration-bypass fix |
| Surface | Keep only Angular-correlated methods + real call-sites | Keep `upsert`/`remove`/`clear` | Rule 10 — no correlate + no call-site |

## Per-Consumer Persistence Mapping

Keys all resolve to `lizoft.store-<entity>-<storeId>` (matches Angular exactly).

1. **product-repository.ts** ↔ `products/product.repository.ts` — key `lizoft.store-products-`; Map-entries (`JSON.stringify(Array.from(map.entries()))`); per-instance cache `products`; auto-init writes empty map on empty/`{}` read; **date revival: NONE** (Angular does `new Map(JSON.parse())` only). Inline `getStorageProductsMap`(=getAll)/`setProductsLocalStorage`(=save) as privates; `getById` → `map.get`.
2. **product-category-repository.ts** ↔ `categories/product-category.repository.ts` — key `lizoft.store-product-categories-`; Map-entries; cache `categories`; auto-init; no date fields. Same inline shape.
3. **order-offline-service.ts** ↔ `orders/order-offline.service.ts` — key `lizoft.store-orders-`; **plain array** (`JSON.stringify(orders[])`); cache `orders`; auto-init writes `[]`; revival: `date` only, plus normalize `isCredit ??= false` and `paymentType ??= Efectivo`. Replace module-level `repo` + `repo.upsert` with array push (create) / find-and-mutate (update/activate/deactivate) then `setOrdersLocalStorage`.
4. **sale-credit-offline-service.ts** ↔ `credits/sale-credit-offline.service.ts` — key `lizoft.store-saleCredits-`; plain array; cache `saleCredits`; auto-init `[]`; Angular revives `date`, `paidDate`, and a **nonexistent** `paymentDate` (see Open Questions).
5. **expense-offline-service.ts** ↔ `expenses/expense-offline.service.ts` — key `lizoft.store-expenses-`; plain array; cache `expenses`; auto-init `[]`; revival: `date` only + normalize `paymentType ??= Efectivo`.

## Sync Re-home (import.tsx + DataSynchronizerService)

Angular's `synchronization/data-synchronizer.service.ts` routes every write through repo/service domain methods (`addImportedProduct`/`updateImportedProduct`, whole-type revert via `updateProducts(map)`/`updateCategories(map)`; orders/expenses/credits via `addImported*`/`updateImported*`, break-only). React instead injects raw repos and calls generic `getAll`/`upsert`/`save` with an inline name guard — a structural divergence. Re-homing here PRESERVES that current React orchestration (no bypass fix): replace the 4 `new BaseRepository<...>` in `import.tsx` with a **sync-local storage shim** (co-located in the sync module, not a shared base) implementing:

- `NameUniqueRepo` (categories, products): `getAll`→Map from Map-entries JSON; `upsert`; `save`→bulk Map-entries overwrite (the whole-type revert). Same key/format as consumers 1–2.
- `GenericUpsertRepo` (orders, saleCredits): backed by the **plain-array** on-disk format (consumers 3–4), converting array↔Map internally so the synchronizer keeps its Map-based loop while disk stays plain-array-consistent with the offline services sharing the same key.

`upsert` survives ONLY inside this shim (its sole call-site). Expenses already route through `expenseSvc` — unchanged.

## File Changes

| File | Action | Description |
|---|---|---|
| `sales/lib/repositories/product-repository.ts` | Modify | Inline Map-entries storage + cache; drop date revival |
| `sales/lib/repositories/product-category-repository.ts` | Modify | Inline Map-entries storage + cache |
| `sales/lib/services/order-offline-service.ts` | Modify | Inline plain-array storage + cache + revival |
| `sales/lib/services/sale-credit-offline-service.ts` | Modify | Same |
| `expenses/lib/services/expense-offline-service.ts` | Modify | Same |
| `sync/routes/import.tsx` (+ sync shim) | Modify/Create | Replace 4 `new BaseRepository` with sync-local shim |
| `shared/lib/storage/base-repository.ts` + `__tests__/base-repository.test.ts` | Delete | LAST, once no import remains |

## Testing Strategy

| Layer | What | Approach (strict TDD) |
|---|---|---|
| Unit | Each consumer's serialize/deserialize round-trip + auto-init + cache | Assert exact on-disk string (Map-entries vs array) per consumer |
| Integration | Sync import round-trip unchanged (revert-on-clash, break-only) | Feed parsed data; assert merges/errors identical to pre-change |

Gate: `pnpm test`; `pnpm -C apps/web-store-pos exec tsc --noEmit`; `pnpm -C packages/domain build` only if a `@store-mgmt/domain` export changes (none expected).

## Migration / Rollout

No data migration (rule 12). Per-slice commits on `feat/frontend-parity-audit`. Order: (1) product-repo, (2) category-repo, (3) order-svc, (4) credit-svc, (5) expense-svc, (6) sync re-home → then delete `base-repository.ts` + test. Each earlier slice is independently `git revert`-able.

## Open Questions (fix-vs-replicate — NOT covered by the id-869 wire-format ratification)

- [ ] **Order/expense date revival**: React currently revives `createdDate`/`updatedDate`; Angular revives neither. Mirroring Angular means these stay strings — verify no downstream consumer requires `Date`.
- [ ] **SaleCredit revival bugs**: Angular unconditionally does `new Date(paidDate)` (null→epoch 1970) and revives a nonexistent `paymentDate`. Replicate literally (parity) or fix (angular-bugs-policy)? Must ASK.
- [ ] **Missing normalizations**: React lacks Angular's `isCredit`/`paymentType` default normalization on order/expense read — mirror it in the inlined deserialize.
- [ ] **Sync orchestration divergence**: the synchronizer's generic `upsert`/`save` + inline name-guard diverges from Angular's `addImported*`/`updateImported*` routing. Preserved as-is here; resolution deferred to the separate orchestration-bypass change.

## Non-goals

`inventory-repository.ts` (no BaseRepository dependency; plan Fase 4). Product sync/import orchestration-bypass fix. `activate/deactivateProductCategory` `isActive` param.
