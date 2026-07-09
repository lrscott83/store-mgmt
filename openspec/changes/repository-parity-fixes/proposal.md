# Proposal: repository-parity-fixes

Governs exploration `sdd/repository-parity-fixes/explore` (engram #840) and locked decision
`sdd/repository-parity-fixes/decisions` (engram #842). Artifact store: hybrid. Delivery:
commits-only on `feat/frontend-parity-audit` (no PRs, no chained/size:exception ceremony — per
binding convention `delivery-commits-only-on-feature-branch`, engram). Angular `frontend/` is the
sole source of truth (playbook rule #1); nothing here is validated against a live backend.

## Intent

Close the 3-finding audit gap between the Angular repository sources
(`product.repository.ts`, `product-category.repository.ts`) and their React ports
(`product-repository.ts`, `product-category-repository.ts`) opened by `product-service-parity`.
Two findings get a real code change (return-contract corrections); one is a verified no-op record
closing the audit trail.

## Scope

### Finding #1 — `addProductCategoryByName` return contract → REPLICATE Angular's bug (Option A, LOCKED)

- **Angular** (`frontend/src/app/application/categories/product-category.repository.ts:94-98`):
  ```ts
  addProductCategoryByName(name: string): string {
      const id: string = Guid.create().toString();
      const order: number = this.getNextOrder();
      return this.addProductCategoryData(id, name, order, true) ? id : null;
  }
  ```
  `addProductCategoryData` returns a `Result` **object** (`Result.Success()` / `Result.Failure([...])`),
  always truthy in JS — the `? id : null` ternary's else-branch is dead code. Angular **always
  returns `id`**, even when the internal add silently fails on a name collision (the CSV row's
  category is never created, but the caller still gets back an id as if it had been). Return type:
  `string`, never `null` at runtime.
- **React (today)** (`frontend-react/apps/web-store-pos/app/sales/lib/repositories/product-category-repository.ts:102-107`):
  ```ts
  addProductCategoryByName(name: string): string | null {
    const id = generateId();
    const order = this.getNextOrder();
    const result = this.addProductCategoryData(id, name, order, true);
    return result.succeeded ? id : null;
  }
  ```
  Reads `.succeeded` on the `Result` object and correctly returns `null` on collision — a silent
  behavioral IMPROVEMENT over Angular, introduced without the consult-first step playbook rule #8
  requires, and never ratified (the 5-item flag ledger in
  `tasks-phase1-repo-di.md:42-80` does not cover this method; the archive-report's bug-suspect
  list omits it; the canonical spec is silent).
- **Decision (LOCKED, engram #842)**: **Option A — replicate Angular's literal behavior.** React
  `addProductCategoryByName` MUST always return `id` (return type `string`, NOT `string | null`),
  even on name collision. Remove the `result.succeeded ? id : null` null path — call
  `addProductCategoryData(id, name, order, true)` and unconditionally `return id;`.
- **angular-bugs-policy note (why this doesn't get "fixed")**: the binding convention (engram #648,
  "Angular bugs are FIXED in React with TDD, never replicated") is the DEFAULT — but it is not
  absolute. The user was presented this exact tension ("Option A contradicts angular-bugs-policy
  but is strict 1:1 parity") and explicitly chose literal parity, with eyes open, BECAUSE no
  call-site in either codebase (Angular `product-offline.service.ts:78` /
  React `product-offline-service.ts:207`, both inside `createCsvProducts`) branches on the
  `null` result — replicating costs nothing behaviorally and the alternative (Option B, silently
  keeping the fix) is itself the rule-#8 violation this change exists to close. Distinguishing
  factor vs. Finding #2 (which WAS fixed): a pure dead PARAMETER with zero observable effect gets
  fixed on sight; a dead RETURN-VALUE branch with a real (if latent) behavioral difference is a
  genuine bug-replication decision that requires — and got — explicit user sign-off. Do not
  generalize this as "replicate all Angular bugs found in this audit."
- **Cleanup implied by the type change**: the `as string` cast at
  `frontend-react/apps/web-store-pos/app/sales/lib/services/product-offline-service.ts:207`
  (`this.categoryRepository.addProductCategoryByName(csvProduct.category) as string`) becomes
  unnecessary once the return type is `string` and MUST be removed — this is a direct consequence
  of the signature fix, not scope creep.
- **Test update**: `product-category-repository.test.ts:182-185` ("returns null when the name
  already exists") locks the OLD (unratified) behavior and MUST be replaced with a test asserting
  the category id is still returned even when `addProductCategoryData` fails (collision).
- **Call-site check (done in exploration, re-verify at apply time)**: no other call-site of
  `addProductCategoryByName` exists in either `frontend/` or `frontend-react/` (grep-confirmed).
  Re-confirm before finalizing WU2 in tasks.md — if a new call-site was added since the explore
  pass and it branches on `null`, STOP and re-open the decision instead of proceeding silently.

### Finding #2 — `activate`/`deactivateProductCategory` dropped dead 2nd param → NO ACTION (verified, ratified)

- **Angular** (`product-category.repository.ts:150-156`): `activateProductCategory(id, isActive)` /
  `deactivateProductCategory(id, isActive)` — body always hardcodes `true`/`false` via
  `updateProductCategoryActive(id, true|false)`; the `isActive` parameter is never read (dead
  param).
- **React** (`product-category-repository.ts:169-176`): 1-param `activateProductCategory(id)` /
  `deactivateProductCategory(id)`, same hardcoded delegation — the dead param was already dropped.
- **Ratification (CONFIRMED, closing this audit item)**: `tasks-phase1-repo-di.md:44-50`
  "Flagged mismatches / decisions" item 1, explicit `angular-bugs-policy` invocation ("FIX, don't
  mirror"), checked off `tasks-phase1-repo-di.md:103-105` (WU1.9, `[x]`). Archived into the
  canonical spec (`archive-report.md:48-49`). Engram refs #761 ("Slice 5 Flag #1 ratification"),
  #771 ("Slice 6 5-flag ratification"). Zero call-sites depend on the 2nd arg in either codebase
  (grep-confirmed in both `frontend/` and `frontend-react/`).
- **Resolution**: no code change. Recorded here purely so the 3-finding audit closes with a
  complete paper trail — this item was already correctly fixed and already ratified before this
  change existed.

### Finding #3 — `getAvailableProductById` null-vs-undefined → fix to `null` (Option A, LOCKED)

- **Angular** (`frontend/src/app/application/products/product.repository.ts:50-53`):
  ```ts
  getAvailableProductById(id: string): Product {
      const product: Product = this.getStorageProductsMap().get(id);
      return product && product.isActive ? product : null;
  }
  ```
  Explicit `null`. Angular's OTHER "not found" repository methods on the same class —
  `getProductByName` (`:59-61`, `... || null`) and `getProductByBarcode` (`:63-66`, `null` for
  empty barcode, `... || null` for lookup) — are also uniformly `null`.
- **React (today)** (`frontend-react/apps/web-store-pos/app/sales/lib/repositories/product-repository.ts:66-69`):
  ```ts
  getAvailableProductById(id: string): Product | undefined {
    const product = this.repo.getById(this.storeId, id);
    return product && product.isActive ? product : undefined;
  }
  ```
  Returns `undefined` — diverging from Angular AND from its own React siblings
  `getProductByName`/`getProductByBarcode` (both already `Product | null` for parity). React is
  internally inconsistent: 2 of 3 "not found" methods return `null`, this one alone returns
  `undefined`.
- **Decision (LOCKED, engram #842)**: **Option A — change React to return `null`**, type
  `Product | null`. Restores Angular parity AND React's own internal consistency in one move.
- **Call-sites (zero risk, verified)**: Angular `inventory-offline.service.ts:107` and `:398`,
  React `inventory-offline-service.ts:737` — all 3 are truthiness/boolean-guard usages; none
  distinguishes `null` from `undefined`. No call-site behavior changes.
- **Test update**: `product-repository.test.ts:108-116` — both "returns undefined when inactive"
  and "returns undefined when the product does not exist" assertions (`toBeUndefined()`) become
  `toBeNull()`.

## Affected Files

| File | Change |
|------|--------|
| `frontend-react/apps/web-store-pos/app/sales/lib/repositories/product-category-repository.ts` | `addProductCategoryByName` return type `string | null` → `string`; drop null branch (Finding #1) |
| `frontend-react/apps/web-store-pos/app/sales/lib/services/product-offline-service.ts` | remove `as string` cast at `createCsvProducts` call-site (~line 207, verify exact at apply) |
| `frontend-react/apps/web-store-pos/app/sales/lib/repositories/__tests__/product-category-repository.test.ts` | replace `toBeNull()`-on-collision test with an id-still-returned-on-collision test (lines 182-185) |
| `frontend-react/apps/web-store-pos/app/sales/lib/repositories/product-repository.ts` | `getAvailableProductById` return type `Product | undefined` → `Product | null` (Finding #3) |
| `frontend-react/apps/web-store-pos/app/sales/lib/repositories/__tests__/product-repository.test.ts` | `toBeUndefined()` → `toBeNull()`, both assertions (lines 108-116) |
| `openspec/specs/product-service/spec.md` | MODIFIED via this change's delta (return-contract requirements) |

No production files outside the 2 repositories + 1 offline-service call-site are touched. No new
files. No DI/constructor signature changes.

## Out of Scope

- **`inventory-repository.ts` regla-10 item** (a separate parity-audit finding tracked in engram
  #837) — explicitly DEFERRED, not part of this change. Different repository, different finding,
  no coupling to the 2 repositories addressed here.
- Any other audit findings on services/repositories outside `product.repository.ts` /
  `product-category.repository.ts` — out of this change's scope entirely (covered by other SDD
  changes, e.g. `service-return-shape-parity`, or not yet audited).
- No return-shape (async/envelope) changes — both repositories stay synchronous, matching Angular's
  repository layer (repositories are never Observable/async in Angular; only services are). This
  change is contract-level (return TYPE / null-vs-undefined / null-vs-always-returns), not
  shape-level.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A call-site added since the exploration pass now branches on `addProductCategoryByName`'s `null` | Low | Re-grep both codebases at WU2 apply time before removing the null path; if found, stop and re-open the decision instead of proceeding |
| Finding #1's literal-bug replication surprises a future reader expecting angular-bugs-policy by default | Low | Class-doc + spec delta both cite engram #842 and the policy-nuance rationale explicitly, so the deviation is documented, not silent |
| Test rework misses a 3rd call-site of `getAvailableProductById` | Low | Exploration already grep-confirmed exactly 1 React call-site (`inventory-offline-service.ts:737`); re-verify at apply time per the exploration's own open risk note |

## Rollback Plan

Both changes are single-method return-contract edits behind existing tests; revert is a single
`git revert` of the work-unit commit(s). No migration/data-shape change, no cross-file ripple
beyond the 1 offline-service cast removal.

## Dependencies

- Exploration `sdd/repository-parity-fixes/explore` (engram #840, read).
- Locked decision `sdd/repository-parity-fixes/decisions` (engram #842, read — do not re-open).
- Playbook `docs/migration/playbook-migracion-servicios-angular-react.md` (rules #1, #3, #8, #11).
- Canonical spec `openspec/specs/product-service/spec.md` (this change delivers a MODIFIED-requirements delta against it).
- Strict TDD active (`pnpm test`, vitest via turbo); type-check separately via
  `pnpm -C apps/web-store-pos exec tsc --noEmit`.

## Fixed Decisions (do not re-open)

1. Finding #1: `addProductCategoryByName` → always returns `id`, type `string` (Option A, literal
   Angular-bug replication, engram #842).
2. Finding #2: no action — already ratified, zero diff.
3. Finding #3: `getAvailableProductById` → returns `null`, type `Product | null` (Option A, engram #842).

## Success Criteria

- [ ] `addProductCategoryByName` always returns `id` (type `string`); the collision path no longer
      returns `null`; the `as string` cast at the CSV call-site is removed.
- [ ] `getAvailableProductById` returns `null` (type `Product | null`) for both the
      inactive-product and not-found cases.
- [ ] `activate`/`deactivateProductCategory` unchanged (confirmed no-op).
- [ ] All affected tests RED→GREEN; `pnpm test` and `tsc --noEmit` both green.
- [ ] Canonical spec delta merged; audit trail closes with all 3 findings recorded.
