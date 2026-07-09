# Exploration — repository-parity-fixes

Migration parity audit (Angular → React) of the 2 repositories, against
`docs/migration/playbook-migracion-servicios-angular-react.md` (11 rules).
Artifact store: hybrid. Engram: `sdd/repository-parity-fixes/explore` (obs #840).

## Scope
- Angular source of truth (2 repos):
  - `frontend/src/app/application/products/product.repository.ts`
  - `frontend/src/app/application/categories/product-category.repository.ts`
- React mirrors:
  - `frontend-react/apps/web-store-pos/app/sales/lib/repositories/product-repository.ts`
  - `frontend-react/apps/web-store-pos/app/sales/lib/repositories/product-category-repository.ts`

## Finding #1 — `addProductCategoryByName` (UNRATIFIED divergence — user decision required)
- **Angular** (`product-category.repository.ts:94-98`): `return this.addProductCategoryData(...) ? id : null;`.
  `addProductCategoryData` returns a `Result` **object** (always truthy, even on `Result.Failure`).
  ⇒ Angular **always returns `id`**, even on name-collision failure. Return type `string`. Null branch is dead code.
- **React** (`product-category-repository.ts:102-107`): `return result.succeeded ? id : null;` ⇒ returns `null`
  on collision. Return type `string | null`. Locked by test `product-category-repository.test.ts:182-185`.
- **Ratification**: NOT found. `tasks-phase1-repo-di.md` flag ledger lists 5 items — none is this method.
  Archive report's mirrored-bug-suspect list omits it. Canonical spec silent. ⇒ silent fix, violates rule #8.
- **Call-sites**: Angular `product-offline.service.ts:78` (createCsvProducts); React `product-offline-service.ts:207`
  casts `as string`. Neither branches on the `null` path.
- **Options**:
  - **A — replicate Angular's bug**: return type `string`, always return `id`, drop null path + `as string` cast, update test. No call-site breaks.
  - **B — keep React fix, ratify + document**: keep `string | null`, add angular-bugs-policy doc note (dead-param precedent) + ledger entry.

## Finding #2 — activate/deactivateProductCategory dead 2nd param (RATIFIED — no action)
- Angular `:150-156` 2-param, `isActive` never read (dead param). React `:169-176` 1-param.
- **CONFIRMED ratified**: `tasks-phase1-repo-di.md:44-50` (Flag #1), WU1.9 `[x]`, archive-report:48-49, engram #761/#771.
- Zero external call-sites in either codebase. ⇒ Record "verified fine", no diff.

## Finding #3 — `getAvailableProductById` null vs undefined (safe TDD fix)
- Angular `product.repository.ts:50-53` returns `null`; siblings `getProductByName`/`getProductByBarcode` also `null`.
- React `product-repository.ts:66-69` returns `undefined` while its own siblings return `null` ⇒ internally inconsistent.
- Call-sites (Angular `inventory-offline.service.ts:107,398`; React `inventory-offline-service.ts:737`) all truthiness checks — none distinguish null/undefined.
- **Options**: **A** — return `null`, type `Product | null`, update test `product-repository.test.ts:108-116`. **B** — leave undefined.
- **Recommendation**: A (restores Angular parity + internal consistency, zero risk).

## Recommendation
Single change. Ask Finding #1 (A vs B) up front; #3 is a clean TDD fix; #2 is a no-op record.
