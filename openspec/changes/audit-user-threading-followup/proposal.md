# Proposal: audit-user-threading-followup

**Change:** `audit-user-threading-followup`
**Status:** proposed
**Artifact store:** hybrid (openspec file + engram `sdd/audit-user-threading-followup/proposal`)
**Parity anchor:** legacy `frontend/` (Angular) is the ONLY source of truth.
**Sibling (completed):** `audit-user-threading` threaded `getCurrentUserLogin()` into the 4 offline services (Inventory, Order, SaleCredit, Expense). This follow-up closes the remaining Product gap it explicitly deferred (~Stage 4).

---

## 1. Intent

**Problem.** The completed `audit-user-threading` change threaded the authenticated user's `login` into `createdByName`/`updatedByName` for 4 React offline services, but deferred **Product**, which still diverges from Angular:

- `ProductOfflineService.create()` upserts whatever the route passes; both call sites hardcode `createdByName: ''` instead of the current user's login.
- `update()` / `updateMany()` are pass-through upserts — they never stamp `updatedByName` (stays undefined/stale), while Angular's `updateProduct()` defaults `updatedByName = currentUserValue.login`.
- `delete()` is a **hard delete** (`repo.remove()`), whereas Angular's `deleteProduct()` is a **soft delete** (`isActive=false` + `updatedDate` + `updatedByName`). Hard delete cannot stamp an audit field (record is destroyed) and cannot propagate a deletion through the upsert-based sync pipeline.

**Why now.** This is the last open item in the audit-threading parity thread. The pattern, helper, and tests already exist from the sibling slice — closing Product now finishes the parity story while context is fresh and before further Product work builds on the stale/empty audit fields.

**Success looks like.**
- Every Product mutation stamps `login` (username) into the correct audit field, matching Angular `product.repository.ts` symbol-for-symbol.
- `ProductOfflineService.delete()` becomes an Angular-parity soft-delete that also stamps `updatedByName`.
- The two hardcoded `createdByName: ''` literals in `products.tsx` are removed.
- `pnpm test` green (strict TDD) and `pnpm -C apps/web-store-pos exec tsc --noEmit` clean.
- Commits land on `feat/frontend-parity-audit`; NO PR (same as the sibling change).

---

## 2. Scope

### IN scope — Product only
- `ProductOfflineService` (`app/sales/lib/services/product-offline-service.ts`): `create`, `update`, `updateMany`, `delete`.
- Its call sites in `app/sales/routes/products.tsx`: `handleCreateProduct`, `handleEditProduct`, `handleBulkSave`, `handleDeleteProduct`, and the CSV import path `handleCsvImport`.
- Convert `delete()` from hard-delete to Angular-parity soft-delete (see Decision 3).
- Tests: extend `product-offline-service.test.ts` (real auth-store seeding pattern) and `products.test.tsx` (call-arg assertions + `login` in the auth-store mock).

### OUT of scope — Owner and ReSeller (parity-gate outcome)
Owner and ReSeller are **verified already at parity** and are deliberately NOT touched. This is the outcome of the exploration's parity gate:

| Entity | Angular stamps audit fields client-side? | React offline service exists? | Verdict |
|---|---|---|---|
| **Product** | YES — `product.repository.ts` stamps `createdByName`/`updatedByName` in `addProductData`, `updateProduct`, `deleteProduct` | YES — `ProductOfflineService` (localStorage offline) | **Real gap → IN scope** |
| **Owner** | NO — `owner.service.ts` `createOwner`/`editOwner` payloads omit audit fields (backend-populated) | NO — only `ownerHttpService` (REST wrapper, no offline layer) | **Already at parity → OUT** |
| **ReSeller** | NO — `reseller.service.ts` `createReSeller`/`editReSeller` payloads omit audit fields (backend-populated) | NO — only `resellerHttpService` (REST wrapper, no offline layer) | **Already at parity → OUT** |

**Rationale (must not be misread as an omission).** Angular never stamps Owner/ReSeller audit fields on the client — those fields are server-populated and appear in React only as read-only test fixtures simulating GET responses. There is no `owner-offline`/`reseller-offline` service anywhere under `app/**`. React parity is therefore **already satisfied by omission**; adding client-side stamping to Owner/ReSeller would INTRODUCE a divergence and BREAK parity. Both models extend `AuditableBaseModel`, so the fields exist on the type — they are simply not client-stamped, by design, in both frontends.

### Explicitly deferred (flagged as risk, NOT fixed here)
- `EditProductsModal` behavioral divergence: React does a bulk **price edit** (`updateMany`) while Angular's `EditProductsModalComponent` does a bulk **create** (`createProducts`). Pre-existing, orthogonal to audit threading. We stamp whichever path React actually has (`updateMany`); we do NOT re-architect it.

---

## 3. Approach

Surgical, non-structural — same philosophy as the sibling slice. No new layer, DI, or base class. Reuse the existing helper; centralize stamping inside `ProductOfflineService` methods; remove the hardcoded literals at the call sites.

### Reused helper (do NOT recreate)
`app/shared/lib/auth/current-user.ts` → `getCurrentUserLogin(): string` (reads `useAuthStore.getState().user?.login ?? ''`, lazy per-call read). Already used by the 4 sibling services. `ProductOfflineService` adds one import:
`import { getCurrentUserLogin } from '~/shared/lib/auth/current-user';`

### Stamping location — DECISION: centralize inside the service methods
The exploration offered (a) inject at call sites vs (b) restructure signatures. We choose a **third, cleaner variant consistent with `ExpenseOfflineService`: stamp inside the service methods.** The service overrides audit fields regardless of what the caller passes, so the route layer stops owning audit semantics entirely (and the two `createdByName: ''` literals are removed rather than replaced). This keeps signatures wide (no route-layer signature churn) while making stamping centralized, single-sourced, and unit-testable at the service boundary — exactly how the sibling services now work.

### Per-method audit semantics (React ProductOfflineService)

| Method | createdByName | updatedByName | updatedDate | isActive | Notes |
|---|---|---|---|---|---|
| `create()` | `getCurrentUserLogin()` (override) | `undefined` | `undefined` | as supplied | Stamp inside method; ignore/clear any caller-supplied audit fields. Keep `createdDate` as-is. |
| `update()` | untouched | `getCurrentUserLogin()` | `new Date()` | untouched | Spread existing + patch, then stamp. |
| `updateMany()` | untouched | `getCurrentUserLogin()` (each) | `new Date()` (each) | untouched | Stamp every product in the batch. |
| `delete()` | untouched | `getCurrentUserLogin()` | `new Date()` | `false` | **Soft-delete** via `repo.upsert(...isActive:false...)`, NOT `repo.remove()`. |

### Angular → React parity mapping

| Angular (`frontend/src/app/application/products/product.repository.ts`) | React (`app/sales/lib/services/product-offline-service.ts`) |
|---|---|
| `addProductData()` L133 `createdByName: this.authService.currentUserValue.login`; L134-135 `updatedDate/updatedByName = undefined` | `create()` → `createdByName: getCurrentUserLogin()`, `updatedByName`/`updatedDate` undefined |
| `updateProduct()` L204-205 `updatedDate = new Date()`, `updatedByName = currentUserValue.login` | `update()` → `updatedDate: new Date()`, `updatedByName: getCurrentUserLogin()` |
| (bulk edit path) `updateProduct()` semantics applied per item | `updateMany()` → stamp `updatedDate`/`updatedByName` per product |
| `deleteProduct()` L92-94 `isActive=false`, `updatedDate=new Date()`, `updatedByName=currentUserValue.login` | `delete()` → soft-delete `isActive:false`, `updatedDate: new Date()`, `updatedByName: getCurrentUserLogin()` |

Call-site edits in `app/sales/routes/products.tsx`: remove `createdByName: ''` from `handleCreateProduct` (L70-78) and `handleCsvImport` (L123-150). `handleEditProduct`, `handleBulkSave`, `handleDeleteProduct` need no audit args — stamping now lives in the service.

---

## 4. Settled decisions (user-approved)

1. **Product ONLY is in scope.** Owner and ReSeller are OUT — Angular never client-stamps their audit fields (backend-populated, no offline service exists). React parity already holds by omission; touching them would BREAK parity. This is the parity-gate outcome, not an oversight.
2. **Reuse the existing helper** `getCurrentUserLogin()` at `app/shared/lib/auth/current-user.ts`. Do NOT create a new one.
3. **Convert Product `delete()` to Angular-parity soft-delete** (`isActive:false` + `updatedByName=login` + `updatedDate=now`), matching Angular `deleteProduct()` and the Expense precedent from the sibling slice. Rationale: in the upsert-based sync pipeline (import applies `upsertGeneric` by id, never deletes), a hard delete cannot propagate a deletion and cannot carry an audit stamp; soft-delete is MORE correct and aligns Product with the 4 services that already soft-delete. UI safety confirmed: `products.tsx` render and `ProductOfflineService.search()` already filter `isActive`.

**Policy (non-negotiable):** 100% Angular parity. Store `login` (username), NOT `fullName`. Legacy `frontend/` is the only source of truth.

---

## 5. Test strategy (strict TDD — `pnpm test`)

Red → green per behavior, mirroring `expense-offline-service.test.ts`.

**`product-offline-service.test.ts`** (seed the REAL `useAuthStore.setState({ user: { login: '<seed>' } })` in `beforeEach`, not the existing `createdByName: 'test'` fixture literal):
- `create` stamps `createdByName === seed`.
- `create` leaves `updatedByName` / `updatedDate` `undefined`.
- `update` stamps `updatedByName === seed` and `updatedDate` is a `Date`.
- `updateMany` stamps `updatedByName === seed` on every product.
- `delete` stamps `updatedByName === seed` (soft-delete).
- `delete` no longer removes the record — `getAll()` still contains it with `isActive === false` (explicit behavior-change assertion).

**`products.test.tsx`** (add `login: 'jdoe'` to the auth-store mock):
- assert `vi.mocked(create).mock.calls` no longer carry `createdByName: ''`.
- (optional) assert edit/bulk paths no longer pass stale/empty audit args.

**tsc gate (separate, last):** `pnpm -C apps/web-store-pos exec tsc --noEmit` — confirms `updatedByName: undefined` satisfies the optional field type and the helper import resolves.

---

## 6. Risks

- **Soft-delete is a behavior change beyond pure audit-threading.** Mitigated: UI paths (`products.tsx` render, `search()`) already filter `isActive`. Residual: `sync/routes/{export,import}.tsx` were not deeply audited for how a growing set of soft-deleted product records is handled on export — call out in design/verify. Note: soft-delete is the sync-correct behavior (upsert pipeline can't propagate a hard delete), so this reduces risk overall.
- **`EditProductsModal` bulk-edit vs Angular bulk-create divergence** — pre-existing and unrelated; do NOT conflate. We stamp the existing `updateMany` path only.
- **Route-level tests mock `ProductOfflineService` fully** — they won't catch the `''` literal unless the new call-arg assertions are added (accounted for in the test strategy).

---

## 7. Delivery

- `delivery_strategy = single-pr` with `size:exception` — but **commits only** on branch `feat/frontend-parity-audit`, **NO PR** (identical handling to the completed sibling change).
- `strict_tdd = true` — `pnpm test`.
- tsc gate — `pnpm -C apps/web-store-pos exec tsc --noEmit`.

**Next phases:** `sdd-spec` and `sdd-design` (can run in parallel).
