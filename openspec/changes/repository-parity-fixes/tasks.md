# Tasks: repository-parity-fixes

Governs proposal `sdd/repository-parity-fixes/proposal`, spec delta
`openspec/changes/repository-parity-fixes/specs/product-service/spec.md`, decision engram #842.
Strict TDD active: every behavior change = RED (failing test) → GREEN (code) → full suite green.
Test runner: `pnpm test` (vitest via turbo). Type-check is SEPARATE and MUST also be run green:
`pnpm -C apps/web-store-pos exec tsc --noEmit`. Delivery: commits-only directly on
`feat/frontend-parity-audit` — no PRs, no branches, no chained/size:exception ceremony (per
binding convention `delivery-commits-only-on-feature-branch`). One commit per work unit.

Angular source of truth:
- `frontend/src/app/application/products/product.repository.ts` (Finding #3)
- `frontend/src/app/application/categories/product-category.repository.ts` (Finding #1)

React targets:
- `frontend-react/apps/web-store-pos/app/sales/lib/repositories/product-repository.ts`
- `frontend-react/apps/web-store-pos/app/sales/lib/repositories/product-category-repository.ts`
- `frontend-react/apps/web-store-pos/app/sales/lib/services/product-offline-service.ts` (cast removal only)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~40-60 total (WU1 ~15; WU2 ~25; doc/spec files not counted as code churn) |
| Files touched | 3 production files + 2 test files = 5 |
| 400-line budget risk | Low — well under 400 lines |
| Chained PRs recommended | No |
| Decision needed before apply | No |
| Chain strategy | N/A — commits-only, single slice, no PR chain |
| Suggested split | WU1 (Finding #3) → WU2 (Finding #1) → Final regression, one commit per unit |

## Finding #2 — no work unit (verified, no-op record)

`activateProductCategory`/`deactivateProductCategory`'s dropped dead 2nd param is already
ratified (Phase 1 WU1.9, engram #761/#771) and requires zero code change. No task touches it;
listed here only so the 3-finding audit is traceable end-to-end from explore → proposal → tasks.

## WU1: `getAvailableProductById` returns `null` (Finding #3) — Req: Repository-vs-Service Ownership Boundary

Angular: `product.repository.ts:50-53`. React target:
`product-repository.ts:66-69`. Zero call-site risk (all 3 usages — Angular
`inventory-offline.service.ts:107,398`, React `inventory-offline-service.ts:737` — are truthiness
checks only, re-verified at 1.3).

- [x] 1.1 RED: update `product-repository.test.ts` describe block `getAvailableProductById`
      (currently lines 102-117):
      - "returns undefined when the product is inactive" → rename to "...null..." and change
        `expect(repo.getAvailableProductById('p1')).toBeUndefined()` to `.toBeNull()`
      - "returns undefined when the product does not exist" → rename to "...null..." and change
        `expect(repo.getAvailableProductById('nope')).toBeUndefined()` to `.toBeNull()`
      - run `pnpm test` scoped to this file — confirm both assertions now FAIL (RED) against the
        current `undefined`-returning implementation.
- [x] 1.2 GREEN: in `product-repository.ts`, change `getAvailableProductById`'s signature from
      `Product | undefined` to `Product | null` and its ternary's else-branch from `undefined` to
      `null`. Update the JSDoc comment (currently documents the `undefined`-vs-Angular-`null`
      divergence as intentional) to instead state it now mirrors Angular
      (`product.repository.ts:50-53`) exactly, matching sibling methods `getProductByName`/
      `getProductByBarcode`.
      Run `pnpm test` scoped to this file — confirm GREEN.
- [x] 1.3 Call-site re-verification: grep `getAvailableProductById` across `frontend-react/` to
      confirm the only consumer remains `inventory-offline-service.ts:737` (truthiness check,
      unaffected by null-vs-undefined) and no new consumer was added since the exploration pass
      that would need updating. If a new consumer is found and it distinguishes `null` from
      `undefined` explicitly, STOP and re-open the decision instead of proceeding.
- [x] 1.4 Full regression: `pnpm test` (whole suite) green, then
      `pnpm -C apps/web-store-pos exec tsc --noEmit` green.
- [x] 1.5 Commit (work-unit boundary): `fix(web-store-pos): return null from getAvailableProductById
      (Angular parity, product.repository.ts:50-53)`.

## WU2: `addProductCategoryByName` always returns `id` (Finding #1) — Req: ProductCategoryRepository Mirrors Angular Repo Surface

Angular: `product-category.repository.ts:94-98`. React targets:
`product-category-repository.ts:102-107` (repo method) and `product-offline-service.ts:207`
(the one call-site, cast removal). LOCKED decision: replicate Angular's literal behavior (engram
#842) — this is an intentional, ratified exception to angular-bugs-policy; do not silently keep
the current React fix.

- [x] 2.1 Call-site re-verification (do FIRST, before touching tests/code): grep
      `addProductCategoryByName` across both `frontend/` and `frontend-react/` to reconfirm the
      ONLY call-site in each codebase is inside `createCsvProducts`
      (Angular `product-offline.service.ts:78`, React `product-offline-service.ts:207`) and that
      neither branches on a `null`/falsy return. If a new call-site now depends on the `null`
      path, STOP and re-open the decision instead of proceeding with this work unit.
- [x] 2.2 RED: update `product-category-repository.test.ts` describe block
      `addProductCategoryByName` (currently lines 164-186):
      - Replace the "returns null when the name already exists" test (currently 182-185,
        `expect(repo.addProductCategoryByName('Bebidas')).toBeNull()`) with a test asserting the
        id is STILL returned as a string even when `addProductCategoryData` fails on collision —
        e.g. `const id = repo.addProductCategoryByName('Bebidas'); expect(id).toEqual(expect.any(String));`
        plus an assertion that no NEW category was actually created (category count / lookup by
        that id returns nothing), documenting the silent-failure-but-returns-id quirk explicitly
        in the test name/comment (cite `product-category.repository.ts:94-98`).
      - Run `pnpm test` scoped to this file — confirm the new test FAILS (RED) against the
        current `string | null` implementation (it currently returns `null` on collision, not a
        string).
- [x] 2.3 GREEN (repo method): in `product-category-repository.ts`, change
      `addProductCategoryByName`'s signature from `string | null` to `string`; replace
      `const result = this.addProductCategoryData(...); return result.succeeded ? id : null;`
      with `this.addProductCategoryData(id, name, order, true); return id;` (call it, ignore the
      `Result`, unconditionally return `id` — matching Angular's dead-branch ternary literally).
      Update the JSDoc comment (currently states "Returns the new id or `null`") to document the
      ratified literal-parity exception, citing engram #842 and this change's spec delta.
      Run `pnpm test` scoped to this file — confirm GREEN.
- [x] 2.4 GREEN (cast cleanup): in `product-offline-service.ts` (~line 207), remove the now-
      unnecessary `as string` cast:
      `this.categoryRepository.addProductCategoryByName(csvProduct.category) as string` →
      `this.categoryRepository.addProductCategoryByName(csvProduct.category)`.
      Run `pnpm test` scoped to `product-offline-service.test.ts` (or equivalent) — confirm GREEN,
      no assertion depended on the cast.
- [x] 2.5 Full regression: `pnpm test` (whole suite) green, then
      `pnpm -C apps/web-store-pos exec tsc --noEmit` green (confirms the cast removal doesn't
      reintroduce a type error and the new `string` return type flows cleanly through all
      consumers).
- [x] 2.6 Commit (work-unit boundary): `fix(web-store-pos): replicate Angular's
      addProductCategoryByName always-returns-id behavior (ratified literal parity, engram #842,
      product-category.repository.ts:94-98)`.

## Final Gate

- [x] F.1 `pnpm test` full suite green.
- [x] F.2 `pnpm -C apps/web-store-pos exec tsc --noEmit` green.
- [x] F.3 Both call-site re-verifications (1.3, 2.1) confirmed no new dependent call-site appeared.
- [x] F.4 Spec delta (`openspec/changes/repository-parity-fixes/specs/product-service/spec.md`)
      accurately reflects the shipped code (return types + scenarios match the final
      implementation).
- [x] F.5 Ready for `sdd-verify` against spec requirements "ProductCategoryRepository Mirrors
      Angular Repo Surface" and "Repository-vs-Service Ownership Boundary".
