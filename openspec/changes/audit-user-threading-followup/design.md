# Technical Design — audit-user-threading-followup

Artifact store: hybrid (this file + engram `sdd/audit-user-threading-followup/design`).
Parity anchor: legacy `frontend/` (Angular) is the ONLY source of truth. Store `login` (username), NOT `fullName`.
Scope decided in proposal (#554): **Product ONLY**. Owner/ReSeller OUT (parity already holds by omission).

This design REUSES the pattern established by the completed sibling slice `audit-user-threading`
(design #541): shared leaf helper `getCurrentUserLogin()`, lazy read at call time, `login` not
`fullName`, create leaves `updatedByName`/`updatedDate` undefined, mutations stamp `updatedDate = new Date()`.

---

## 1. Architecture approach

Surgical, non-structural. No new helper, no new layer, no DI, no base class. Two files change in
`src` (`product-offline-service.ts`, `products.tsx`) plus two test files. `ProductOfflineService`
stays a per-call-constructed plain class. The change centralizes audit-field stamping **inside**
the service — exactly mirroring `ExpenseOfflineService` (`app/expenses/lib/services/expense-offline-service.ts`,
the reference implementation from the sibling slice).

Key behavioral consequence: the route layer (`products.tsx`) STOPS supplying audit fields. The
service becomes the single source of truth for `createdByName` / `updatedByName` / `updatedDate` /
(on create) `createdDate`.

---

## 2. Reused helper (do NOT recreate)

`app/shared/lib/auth/current-user.ts` → `getCurrentUserLogin(): string`
(`return useAuthStore.getState().user?.login ?? ''`). Already imported by the 4 services fixed in
the sibling slice. `product-offline-service.ts` adds:

```ts
import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';
```

Lazy read at call time (per mutation), matching Angular's synchronous `currentUserValue.login`
getter. `''` fallback keeps `createdByName: string` (required) non-optional.

---

## 3. Type-level decision (drives the tsc gate) — ADR-2

`Product extends AuditableBaseModel` (`packages/domain/src/models/base.ts` L5-10):
`createdDate: Date` and `createdByName: string` are **required**; `updatedDate?`/`updatedByName?`
are optional.

`create()` today is `create(data: Omit<Product, 'id'> & { id?: string })` — the caller must supply
`createdByName` and `createdDate` or tsc fails. If we simply delete `createdByName: ''` from the
route object while keeping this wide input type, `tsc --noEmit` BREAKS (missing required property).

**Decision: narrow the `create` input type** so the audit fields are no longer caller-supplied:

```ts
type CreateProductInput =
  Omit<Product, 'id' | 'createdDate' | 'createdByName' | 'updatedDate' | 'updatedByName'>
  & { id?: string };
```

This is the cleanest tsc-safe realization of the proposal's "remove the hardcoded `createdByName: ''`
literals". The service stamps all audit fields internally; the route legitimately stops passing
them. No route HANDLER signature changes (`handleCreateProduct`/`handleCsvImport` keep their params);
only the object literals passed INTO `create()` shrink.

Note on the existing service test fixture: `makeProduct()` in
`product-offline-service.test.ts` returns a value still carrying `createdDate`/`createdByName` — this
remains assignable to the narrower input (structural subtyping allows extra properties on a typed
value that is not a fresh object literal), so no test-fixture type churn. The extra fixture fields
are simply ignored/overridden by the service.

---

## 4. Per-method change plan (exact, verified against current code)

File: `app/sales/lib/services/product-offline-service.ts`

### `create` (currently L26-33) — CREATE semantics
Build the entity internally, stamp `createdByName`, force `updatedByName`/`updatedDate` undefined,
stamp `createdDate = now` internally (removes reliance on caller `createdDate`):

```ts
create(data: CreateProductInput): Product {
  const now = new Date();
  const product: Product = {
    ...data,
    id: data.id ?? generateId(),
    createdDate: now,
    createdByName: getCurrentUserLogin(),
    updatedDate: undefined,
    updatedByName: undefined,
  };
  repo.upsert(this.storeId, product);
  return product;
}
```

Angular parity: `product.repository.ts addProductData()` L133 `createdByName = currentUserValue.login`,
L134-135 `updated* undefined`.

### `update` (currently L35-38) — MUTATION semantics
Keep the wide `update(product: Product)` signature (route passes a full `Product` from
`EditProductModal`); override the two audit fields so the modal's stale/absent `updatedByName` and
its self-set `updatedDate` are replaced by the single source:

```ts
update(product: Product): Product {
  const updated: Product = {
    ...product,
    updatedDate: new Date(),
    updatedByName: getCurrentUserLogin(),
  };
  repo.upsert(this.storeId, updated);
  return updated;
}
```

Angular parity: `updateProduct()` L204-205 `updatedDate = new Date()`, `updatedByName = currentUserValue.login`.

### `updateMany` (currently L40-46) — MUTATION semantics (bulk)
Stamp each product. One `now`/`login` for the whole batch (a single logical bulk mutation):

```ts
updateMany(products: Product[]): void {
  const all = repo.getAll(this.storeId);
  const now = new Date();
  const login = getCurrentUserLogin();
  for (const product of products) {
    all.set(product.id, { ...product, updatedDate: now, updatedByName: login });
  }
  repo.save(this.storeId, all);
}
```

Same Angular `updateProduct` stamp rule applied per record.

### `delete` (currently L48-50) — HARD delete → SOFT delete conversion — ADR-3
Replace `repo.remove()` with an `upsert` that flips `isActive` and stamps the mutation, mirroring
`ExpenseOfflineService.delete()` (L87-99). No-op on missing id (matches the prior `repo.remove`
no-op):

```ts
delete(id: string): void {
  const existing = repo.getById(this.storeId, id);
  if (!existing) return;
  repo.upsert(this.storeId, {
    ...existing,
    isActive: false,
    updatedDate: new Date(),
    updatedByName: getCurrentUserLogin(),
  });
}
```

Angular parity: `deleteProduct()` L92-94 `isActive = false` + `updatedDate` + `updatedByName`.

### Route call sites — `app/sales/routes/products.tsx`
- `handleCreateProduct` (L61-81): drop `createdDate: new Date()` (L76) and `createdByName: ''`
  (L77) from the `create({...})` object. Handler param signature unchanged.
- `handleEditProduct` (L84-88): unchanged — passes the full `Product`; service now stamps.
- `handleBulkSave` (L98-102): unchanged — passes `updatedProducts`; service now stamps.
- `handleDeleteProduct` (L91-95): unchanged call; behavior is now soft-delete inside the service.
- `handleCsvImport` (L123-150): drop `createdDate: new Date()` (L144) and `createdByName: ''`
  (L145) from the `create({...})` object.

`EditProductModal`/`EditProductsModal` may keep setting `updatedDate` — it is harmlessly overridden
by the service. Not touched (out of the minimal diff).

---

## 5. Soft-delete safety verification (blast radius) — ADR-3 support

`delete()` moving from hard-remove to `isActive:false` is a behavior change beyond audit-threading.
Verified safe for the UI because every consumer that must hide deleted products already filters
`isActive`:

- `products.tsx` render L191: `products.filter((p) => p.categoryId === category.id && p.isActive)` ✅
- `products.tsx` bulk-modal source L255: `products.filter((p) => p.isActive && ...)` ✅
- `ProductOfflineService.search()` L52-53: `getAll().filter((p) => p.isActive)` ✅

Sync correctness (per #553): the import pipeline (`app/sync/routes/import.tsx`) is **upsert-only,
never deletes**. A hard delete cannot propagate a deletion nor carry an audit stamp; soft-delete
propagates correctly and aligns Product with the 4 services that already soft-delete
(Expense/Order/SaleCredit/Inventory). So this conversion is MORE correct for sync, not riskier.

**Residual risk to flag for verify (not fixed here):**
1. `getByBarcode()` (L21-24) uses `getAll().find(...)` WITHOUT an `isActive` filter — a soft-deleted
   product remains findable by barcode scan. Confirm Angular's barcode lookup filters `isActive`;
   if it does, this may be a follow-up gap. Out of scope for this audit-threading change but must be
   surfaced.
2. `getAll()` is intentionally unfiltered (mirrors Angular `getStorageProducts()` and the Expense
   precedent). Export (`sync/routes/export.tsx`) serializes all records including soft-deleted ones
   — a growing soft-deleted set is expected and correct for the sync contract, but was not
   deeply audited for volume/perf. Flag for verify only.

---

## 6. Test design (strict TDD — `pnpm test`; tsc gate SEPARATE and LAST)

Test runner: `pnpm test`. Type gate (run separately, last): `pnpm -C apps/web-store-pos exec tsc --noEmit`.

### 6a. Service test — `app/sales/lib/services/__tests__/product-offline-service.test.ts`
Reuse the REAL-store pattern from `expense-offline-service.test.ts` L1-50: import `useAuthStore` and
`UserModel`, add a `makeUser({ login: 'jdoe' })` helper, and in `beforeEach` seed
`useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null })`
(NOT a `vi.mock`; NOT the `createdByName: 'test'` fixture literal). Keep `localStorage.clear()`.

New/changed cases (mirroring the Expense suite shapes):
- `create` stamps `createdByName === 'jdoe'` (from the seeded login).
- `create` leaves `updatedByName` and `updatedDate` `undefined`.
- `update` stamps `updatedByName === 'jdoe'` and `updatedDate` is a `Date`.
- `updateMany` stamps `updatedByName === 'jdoe'` and `updatedDate` is a `Date` on every product.
- **`delete` soft-deletes** — BEHAVIOR CHANGE. The existing **PROD-06** case
  (L122-128, `expect(service.getById(created.id)).toBeUndefined()`) MUST be rewritten to assert the
  record is RETAINED: `getById(id)?.isActive === false`, `getAll()` still contains it, and
  `updatedByName === 'jdoe'`, `updatedDate instanceof Date`.
- `delete` is a no-op for a missing id (no throw), matching Expense S-EXP-4b.

Untouched existing fixture literals (`createdByName: 'test'`) in other cases are irrelevant — the
service now overrides them; don't churn them.

### 6b. Route test — `app/sales/routes/__tests__/products.test.tsx`
Current auth mock (L11-18) supplies `{ user: { selectedStoreId: 's1' } }` with **no `login`**, and
`ProductOfflineService` is fully mocked with fresh `vi.fn()` spies per instance (L20-28) that are NOT
exposed for call-arg inspection.

Changes:
1. Add `login: 'jdoe'` to the mocked auth-store `state.user`.
2. Hoist the service method spies (via `vi.hoisted`) so `create` (and optionally `update`) call args
   are inspectable, e.g. `const spies = vi.hoisted(() => ({ create: vi.fn(), ... }))` and return them
   from the `mockImplementation`.
3. New assertion: after driving the create flow (open `CreateProductModal`, fill, save via
   `fireEvent`), inspect `spies.create.mock.calls[0][0]` and assert it does **not** carry
   `createdByName: ''` (post-narrowing, the property is absent). This is the regression guard the
   proposal requires — route tests otherwise can't catch the `''` literal because the service is
   mocked.

### 6c. Type gate
`pnpm -C apps/web-store-pos exec tsc --noEmit` — confirms the narrowed `CreateProductInput` removes
the required `createdByName`/`createdDate` from the route object without error, and that
`updatedDate: undefined` satisfies `updatedDate?: Date`.

---

## 7. TDD sequence

1. **Service — red→green, method by method** (finish one before the next):
   1. Seed auth store in `beforeEach`; add create-stamps + updated-undefined-on-create tests → run
      red → implement `create` narrowing + stamping → green.
   2. update-stamps test → red → implement `update` override → green.
   3. updateMany-stamps test → red → implement `updateMany` stamping → green.
   4. Rewrite PROD-06 to soft-delete-and-stamp (record retained, `isActive:false`, `updatedByName`)
      + no-op-on-missing → red → convert `delete` to soft-delete upsert → green.
2. **Route — red→green**: add `login:'jdoe'` to the mock, hoist spies, add the "create called
   without `createdByName: ''`" assertion → red → remove the two `createdDate`/`createdByName`
   literals from `products.tsx` (`handleCreateProduct`, `handleCsvImport`) → green.
3. **Type gate LAST**: `pnpm -C apps/web-store-pos exec tsc --noEmit` → green.

---

## 8. ADRs

- **ADR-1 — Centralize stamping inside `ProductOfflineService` (reject route-layer stamping).**
  The route currently hardcodes `createdByName: ''` at two call sites and relies on modals for
  `updatedDate`. Centralizing in the service gives a single source of truth, is unit-testable with
  the real auth store, removes the two `''` literals, and matches the `ExpenseOfflineService`
  precedent from the sibling slice. Rejected: injecting `getCurrentUserLogin()` at each route call
  site (scatters logic, un-testable at the service boundary, diverges from the established pattern).

- **ADR-2 — Narrow the `create` input type (`CreateProductInput`) instead of keeping the wide
  `Omit<Product,'id'>`.** `createdByName`/`createdDate` are required on `Product`; removing them from
  the route object under the wide type breaks `tsc`. Narrowing is the clean tsc-safe way to make the
  service own audit fields. Rejected: keeping the wide type and passing dummy audit values (defeats
  the purpose, leaves `''` literals) or casting (unsafe).

- **ADR-3 — Convert `delete()` from hard-remove to Angular-parity soft-delete
  (`isActive:false` + stamp).** Angular `deleteProduct()` soft-deletes; the upsert-based sync
  pipeline (#553) cannot propagate a hard delete; and soft-delete is a prerequisite for stamping
  `updatedByName` on delete. UI is already `isActive`-filtered at all render/search sites. Rejected:
  keeping the hard delete (breaks parity, breaks sync deletion propagation, no audit trail).

- **ADR-4 — Reuse `getCurrentUserLogin()`; `login` not `fullName`; lazy read at call time.**
  Inherited verbatim from the sibling slice (design #541 ADR-2/ADR-3). Deliberate Angular behavior —
  do not "fix" to `fullName`.

- **ADR-5 — `updatedDate`/`updatedByName` undefined on CREATE only; mutations set
  `updatedDate = new Date()`.** Matches Angular `addProductData` (updated* undefined) vs
  `updateProduct` (updated* set), inherited from sibling ADR-4.

---

## 9. Out of scope / deferred (do not conflate)

- **Owner + ReSeller** — parity already holds by omission (Angular never client-stamps; no offline
  service exists in React). Stamping them would BREAK parity. See proposal #554.
- **`EditProductsModal` bulk-edit-price (React `updateMany`) vs Angular bulk-create
  (`createProducts`)** — pre-existing orthogonal behavioral divergence. Stamp only the existing
  `updateMany` path; do NOT change the modal's behavior here.
- **`getByBarcode` `isActive` filter** — surfaced in §5 as a residual risk for verify, not fixed in
  this change.

## 10. Delivery

`delivery_strategy = single-pr` + `size:exception`, COMMITS ONLY on branch
`feat/frontend-parity-audit`, NO PR (same as sibling). `strict_tdd = true` (`pnpm test`);
type gate `pnpm -C apps/web-store-pos exec tsc --noEmit`.

Next: `sdd-tasks` (after spec is ready — spec already exists at
`openspec/changes/audit-user-threading-followup/specs/audit-fields/spec.md`).
