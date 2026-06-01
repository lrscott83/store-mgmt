# Tasks — phase4-mgmt-stores (Stores sub-domain)

Change: **phase4-mgmt-stores**
Phase: Tasks
Status: Done
Date: 2026-05-31
Mode: Hybrid (engram + openspec file)
Reads: spec #207, design #206

---

## Baseline test count

**Declared baseline: 454** (inherited from phase4-profile final state).
`sdd-apply` MUST re-count actual passing tests at apply start before writing any new code. Use this
re-counted number as the red-line floor — all pre-existing tests must remain green throughout.

Final result: 515/515 tests passing (+61 net new).

---

## Execution order

Sequential work units, each following the TDD build sequence from the design (§10). Each unit =
write failing tests → implement minimum code to go green → verify baseline still passes.

Units 1–2 have no intra-unit dependencies and can begin immediately. Units 3–5 depend on Unit 1
(adminFeatureLoader) and Unit 2 (storeHttpService) for their mock shapes. Units 3–5 are
presentational-only and can run in parallel with each other once Units 1–2 are green. Unit 6
depends on Units 2–5. Unit 7 (wiring) depends on Unit 6.

```
Unit 1 (loader factory) ──┐
                           ├── Units 3, 4, 5 (pres, parallel) ──┐
Unit 2 (http service)  ──┘                                       ├── Unit 6 (containers) ── Unit 7 (wire)
```

---

## Work unit 1 — adminFeatureLoader factory

**Spec refs:** ACCESS-1, ACCESS-2, ACCESS-3, ACCESS-4, ACCESS-5, ACCESS-6, ROUTE-4
**Files:**
- `app/auth/routes/__tests__/loaders.test.ts` (extend existing suite)
- `app/auth/routes/loaders.ts` (add export; no modification to existing functions)

### Tasks

- [x] **1.1 — TEST** Add `describe('adminFeatureLoader')` block to the existing
  `loaders.test.ts` with 4 cases:
  - unauthenticated user → redirects to `/login` (ACCESS-3)
  - authenticated non-admin (regular StoreUser) → redirects to `/unauthorized` (ACCESS-6)
  - authenticated admin but missing `EFeatures.Stores` (73) → featureLoader redirect (ACCESS-4)
  - authenticated admin with feature 73 → returns `null` (ACCESS-5)
  All cases use the existing `makeUser` / `setAuthState` helpers already in the file.
  Confirm suite goes RED.

- [x] **1.2 — IMPL** Add `adminFeatureLoader(requiredFeatureIds: number[], storeIdParam?: string)`
  factory to `app/auth/routes/loaders.ts`. Implementation: await `adminLoader()`; if truthy return
  it; else return `featureLoader(requiredFeatureIds, storeIdParam)(args)`. Export named. Do NOT
  touch any existing function. Confirm suite goes GREEN.

- [x] **1.3 — VERIFY** Run full test suite; confirm total >= baseline. adminFeatureLoader 4 new
  tests added.

---

## Work unit 2 — storeHttpService

**Spec refs:** HTTP-1 through HTTP-11, OWNER-1, OWNER-3
**Files:**
- `app/management/stores/lib/services/__tests__/store-http-service.test.ts` (new file)
- `app/management/stores/lib/services/store-http-service.ts` (new file)

### Tasks

- [x] **2.1 — TEST** Create `store-http-service.test.ts`. Mock `apiClient` (vi.mock of
  `~/shared/lib/http/api-client`). Write test cases for 10+ functions covering list/get/create/update
  lifecycle + module + owner reads. Confirm suite goes RED (import missing).

- [x] **2.2 — IMPL** Create `store-http-service.ts`. Plain object `storeHttpService` with all
  functions over `apiClient`. All paths prefixed `/v1`. Each returns `response.data.data` to match
  `BaseResponseModel<T>` envelope. No Axios instance. `listOwners()` included (not a separate service).
  Confirm suite goes GREEN.

- [x] **2.3 — VERIFY** Run full suite; confirm total >= baseline + new tests.

---

## Work unit 3 — ModulePicker presentational component

**Spec refs:** PRES-4 (partial), PRES-5, PRES-9, MODULE-1 through MODULE-5, D3, D8
**Files:**
- `app/management/stores/components/__tests__/module-picker.test.tsx` (new file)
- `app/management/stores/components/module-picker.tsx` (new file)

### Tasks

- [x] **3.1 — TEST** Create `module-picker.test.tsx` wrapped in `IntlProvider` with real `es`
  messages. 7 test cases covering: renders checkboxes, priceIncluded locked, onChange calls, select-all,
  running total. Confirm RED.

- [x] **3.2 — IMPL** Create `module-picker.tsx`. Props: `modules: Module[]`, `onChange(modules)`.
  Renders checkbox list; `priceIncluded` rows checked+disabled; select-all toggles non-locked only;
  running total = currentPrice sum. No HTTP, no router, no auth-store. Confirm GREEN.

- [x] **3.3 — VERIFY** Full suite >= prior total. New module-picker tests added.

---

## Work unit 4 — StoreForm presentational component

**Spec refs:** PRES-4 through PRES-10, MODULE-4, OFFLINE-5, ERR-2, I18N-1 through I18N-4
**Files:**
- `app/management/stores/components/__tests__/store-form.test.tsx` (new file)
- `app/management/stores/components/store-form.tsx` (new file)

### Tasks

- [x] **4.1 — TEST** Create `store-form.test.tsx` wrapped in `IntlProvider`. Mock `ModulePicker`.
  10 test cases: role-conditional fields, required validation, offline gate, error display. Confirm RED.

- [x] **4.2 — IMPL** Create `store-form.tsx`. Props: `mode`, `initialValues`, `roleFlags`, `owners`,
  `modules`, `isOnline`, `isLoading`, `onSubmit`, `error?`. Local useState for fields. Embeds
  ModulePicker. Role-conditional rendering per PRES-6. Submit disabled when `!isOnline || isLoading || !name`.
  No HTTP, no router, no auth-store. Confirm GREEN.

- [x] **4.3 — VERIFY** Full suite >= prior total.

---

## Work unit 5 — StoreList presentational component

**Spec refs:** PRES-1 through PRES-3, LIST-4, LIST-5, LIST-6, ERR-3, I18N-1
**Files:**
- `app/management/stores/components/__tests__/store-list.test.tsx` (new file)
- `app/management/stores/components/store-list.tsx` (new file)

### Tasks

- [x] **5.1 — TEST** Create `store-list.test.tsx` wrapped in `IntlProvider`. 7 test cases: render rows,
  empty state, offline banner, action callbacks, buttons disabled offline. Confirm RED.

- [x] **5.2 — IMPL** Create `store-list.tsx`. Props: `stores`, `isOnline`, `isLoading`, `error?`,
  `onCreate`, `onEdit`. Renders table/list rows; offline banner; empty state; action buttons disabled
  offline; inline error. No HTTP, no router, no auth-store. Confirm GREEN.

- [x] **5.3 — VERIFY** Full suite >= prior total.

---

## Work unit 6 — Route containers + integration tests

**Spec refs:** LIST-1 through LIST-6, CREATE-1 through CREATE-6, EDIT-1 through EDIT-8,
OFFLINE-1 through OFFLINE-5, ERR-1, ERR-4, ERR-5, ERR-6, ROUTE-1 through ROUTE-4,
TEST-1 through TEST-7
**Files:**
- `app/management/stores/routes/__tests__/store-routes.test.tsx` (new file)
- `app/management/stores/routes/store-list.tsx` (new file)
- `app/management/stores/routes/store-create.tsx` (new file)
- `app/management/stores/routes/store-edit.tsx` (new file)

### Tasks

- [x] **6.1 — TEST (StoreListPage)** Add `describe('StoreListPage')` to `store-routes.test.tsx`.
  Mocks: vi.mock storeHttpService, useAuthStore, useOnlineStatus, react-router, loaders, BaseRepository.
  5+ test cases: online fetch+cache, offline read, empty, lifecycle actions, disabled when offline. Confirm RED.

- [x] **6.2 — IMPL (StoreListPage)** Create `store-list.tsx` container. Export named `loader =
  adminFeatureLoader([EFeatures.Stores])` and default `StoreListPage`. Check isOnline; online → fetch +
  write-through; offline → read cache + degraded flag. Navigate to create/edit. Lifecycle handlers. Confirm GREEN.

- [x] **6.3 — TEST (StoreCreatePage)** Add `describe('StoreCreatePage')`. 5+ cases: fetch catalog+owners,
  priceIncluded pre-selected, success→navigate, error→inline, offline→disabled. Confirm RED.

- [x] **6.4 — IMPL (StoreCreatePage)** Create `store-create.tsx` container. Loader + Promise.all fetch.
  handleSubmit: blocked offline; build payload; call createStore; navigate on success; inline error on fail.
  Renders StoreForm mode="create". Confirm GREEN.

- [x] **6.5 — TEST (StoreEditPage)** Add `describe('StoreEditPage')`. 6+ cases: fetch getStore + catalog,
  merge modules, id fallback, success→cache upsert+navigate, error→inline, offline→disabled. Confirm RED.

- [x] **6.6 — IMPL (StoreEditPage)** Create `store-edit.tsx` container. Loader + Promise.all fetch. Merge
  store.modules. handleSubmit: blocked offline; build payload; call updateStore; upsert cache; navigate on
  success. Renders StoreForm mode="edit". Confirm GREEN.

- [x] **6.7 — VERIFY** Full suite >= prior total + 20 container test cases. No unhandled rejections.

---

## Work unit 7 — Wiring (routes + i18n)

**Spec refs:** ROUTE-1 through ROUTE-4, I18N-1 through I18N-4, I18N-2 (27 STORES.* keys floor)
**Files:**
- `app/routes.ts` (add 3 route entries)
- `shared/lib/i18n/es.ts` (add STORES.* namespace)

This unit adds no new logic — it connects the already-green modules to the app shell.

### Tasks

- [x] **7.1 — I18N** Add all `STORES.*` keys to `shared/lib/i18n/es.ts`. Minimum 27 keys per spec I18N-2.
  Check MANAGEMENT.* keys exist; add if absent. Rioplatense Spanish.

- [x] **7.2 — ROUTES** Add 3 entries to `app/routes.ts` inside authenticated `app-layout` group, after Profile:
  `route('management/stores', 'management/stores/routes/store-list.tsx')`,
  `route('management/stores/create', 'management/stores/routes/store-create.tsx')`,
  `route('management/stores/edit/:id', 'management/stores/routes/store-edit.tsx')`.

- [x] **7.3 — VERIFY** Run full suite. All pre-existing tests green. Copy resolved via IntlProvider. Final count >= baseline + all new tests.

---

## Result: All 7 units COMPLETE

- Unit 1: adminFeatureLoader factory — [x] DONE
- Unit 2: storeHttpService — [x] DONE
- Unit 3: ModulePicker presentational — [x] DONE
- Unit 4: StoreForm presentational — [x] DONE
- Unit 5: StoreList presentational — [x] DONE
- Unit 6: Route containers + integration tests — [x] DONE
- Unit 7: Wiring (routes + i18n) — [x] DONE

**Final test count: 515/515 passing. Net new: +61 tests. TDD fully compliant.**
