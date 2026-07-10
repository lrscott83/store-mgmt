# Proposal: Eliminate BaseRepository (React invention, no Angular correlate)

## Intent

`BaseRepository<T>` (`app/shared/lib/storage/base-repository.ts`) is a React-invented shared storage base class. Angular has **NO** shared repository base — every repository and offline-service persists **inline** with its own private `get*FromLocalStorage`/`set*LocalStorage`. This violates playbook rule 12 (migration invents nothing new). Worse, it **homogenized** persistence in three ways Angular never did — the systemic root cause behind the product/category CONCERNs (plan lines 188-201). Implements plan **Fase 0.1**.

## Scope

### In Scope
- Inline storage into each consumer, mirroring **that consumer's** Angular source (not the generic).
- Restore Angular's **in-memory cache** and **auto-init-on-read** (`|| "[]"`) — present in all 5 Angular sources.
- Restore Angular's **per-entity wire-format**: Map-entries (`Array.from(map.entries())`) for product/category; **plain array** (`JSON.stringify(items)`) for order/credit/expense. `BaseRepository` forced Map-entries on all five.
- Drop `BaseRepository` methods with neither Angular correlate nor React call-site: `remove`, `clear` (rule 10).
- Re-home the **sync path**: `sync/routes/import.tsx` builds 4 raw `new BaseRepository<...>` instances passed to `DataSynchronizerService` (structural `NameUniqueRepo`/`GenericUpsertRepo` interfaces). Re-home storage WITHOUT changing sync orchestration.
- Delete `base-repository.ts` + its test **LAST**, once no import remains.

### Out of Scope
- `inventory-repository.ts` — does NOT consume `BaseRepository`; separate rule-12 removal (plan Fase 4).
- Product sync/import **orchestration bypass** FIX (rule-10 finding) — re-home storage only; preserve current sync behavior.
- `activate/deactivateProductCategory` `isActive` param (separate finding).

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `product-service`: product/category repos restore cache + auto-init; inline storage (behavior parity restored, not changed).
- `sync`: serializer/synchronizer no longer typed via `BaseRepository`; orders/credits/expenses wire-format returns to plain array. (Order/credit/expense offline services have no owning root spec — code-level refactor.)

## Approach

Source of truth for each inline = the **matching Angular file**. The anti-pattern to reject: copying the generic's behavior into each consumer — that merely relocates the invention. Each consumer reproduces its Angular persistence exactly.

## Affected Areas

| Consumer | Angular correlate | Angular persistence | Impact |
|------|------|------|------|
| `sales/.../product-repository.ts` | `products/product.repository.ts` | Map-entries; cache (`private products`); auto-init writes `[]` on empty read | Modified — inline + restore cache/auto-init |
| `sales/.../product-category-repository.ts` | `categories/product-category.repository.ts` | Map-entries; cache; auto-init | Modified — same |
| `sales/.../order-offline-service.ts` | `orders/order-offline.service.ts` | **plain array**; cache; `|| "[]"` | Modified — inline plain-array store |
| `sales/.../sale-credit-offline-service.ts` | `credits/sale-credit-offline.service.ts` | **plain array**; cache; `|| "[]"` | Modified — same |
| `expenses/.../expense-offline-service.ts` | `expenses/expense-offline.service.ts` | **plain array**; cache; `|| "[]"` | Modified — same |
| `sync/routes/import.tsx` (+ synchronizer/serializer types) | — | raw bulk `save` overwrite | Modified — re-home raw storage |
| `shared/lib/storage/base-repository.ts` + test | — | — | Removed (last) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Wire-format change (Map-entries → plain array for order/credit/expense) breaks existing localStorage data + sync serializer read/write | High | design phase decides compat/migration; verify serializer round-trip against each shape |
| Homogenization trap — copying generic into each consumer re-invents it | Med | per-slice review against the Angular file, not the generic |
| Sync path's raw bulk-`save` need (met today by `BaseRepository`) must be re-homed without adopting the out-of-scope bypass fix | Med-High | preserve exact sync behavior; expose bulk save on real repos/services if needed |
| Order/credit/expense use a **module-level** `repo` singleton; Angular cache is per-instance | Med | mirror Angular cache lifetime; watch cross-store key invalidation |

## Rollback Plan

Per-slice commits on `feat/frontend-parity-audit`. `base-repository.ts` deletion is the last commit, so every earlier inline slice is independently revertible via `git revert`.

## Dependencies

- None external. Unblocks categories/products/inventory parity (plan Fases 2-4).

## Success Criteria

- [ ] No file imports `base-repository`; file + test deleted.
- [ ] Each consumer mirrors its Angular source (cache, auto-init, wire-format).
- [ ] Speculative `remove`/`clear` dropped (no correlate, no call-site).
- [ ] Sync import round-trips unchanged (behavior preserved).
- [ ] `pnpm test` + `pnpm -C apps/web-store-pos exec tsc --noEmit` green; `pnpm -C packages/domain build` if `@store-mgmt/domain` exports change.

## Delivery

Commits-only on `feat/frontend-parity-audit`. No PRs, no chained PRs, no size:exception (established convention). Strict TDD for apply.

## Suggested Slicing

1. `product-repository` — inline + cache + auto-init (Map-entries).
2. `product-category-repository` — same.
3. `order-offline-service` — inline plain-array + cache + auto-init.
4. `sale-credit-offline-service` — same.
5. `expense-offline-service` — same.
6. Sync path re-home (`import.tsx` + synchronizer/serializer) → then **delete** `base-repository.ts` + test.
