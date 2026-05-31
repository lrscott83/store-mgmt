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
  `~/shared/lib/http/api-client`). Write test cases:
  - `listStores()` → calls `GET /v1/stores/by-current-user`, returns `.data` (HTTP-2)
  - `getStore(id)` → calls `GET /v1/stores/{id}`, returns `.data` (HTTP-3)
  - `createStore(payload)` → calls `POST /v1/stores` with payload incl. `moduleIds[]`, returns
    `.data` (HTTP-4)
  - `updateStore(id, payload)` → calls `PUT /v1/stores/{id}` with payload incl. `moduleIds[]`,
    returns `.data` (HTTP-5)
  - `activateStore(id)` → calls `POST /v1/stores/activate` with `{ id }` (HTTP-6)
  - `approveStore(id)` → calls `POST /v1/stores/approve` with `{ id }` (HTTP-7)
  - `disapproveStore(id)` → calls `POST /v1/stores/disapprove` with `{ id }` (HTTP-8)
  - `deactivateStore(id)` → calls `DELETE /v1/stores/{id}` (HTTP-9)
  - `listModulesToStore()` → calls `GET /v1/modules/ToStore`, returns `.data` (HTTP-11)
  - `listOwners()` → calls `GET /v1/owners/all/true`, returns `.data` (OWNER-1, HTTP-3 variant)
  Confirm suite goes RED (import missing).

- [x] **2.2 — IMPL** Create `store-http-service.ts`. Plain object `storeHttpService` with all
  functions above over `apiClient`. All paths prefixed `/v1`. Each returns `response.data.data`
  to match `BaseResponseModel<T>` envelope (same as `profileHttpService`). No Axios instance.
  `listOwners()` included here (not a separate service). HTTP-10 compliance: only `apiClient`.
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
  messages. Test cases:
  - renders a checkbox for each module in the catalog (5 modules)
  - `priceIncluded=true` module renders checked AND disabled
  - toggling a non-locked checkbox calls `onChange` with updated module array (selected flipped)
  - "select all" checkbox toggles all non-locked modules only
  - running total shows sum of `currentPrice` for selected modules (PRES-9, MODULE-5)
  - total updates when a checkbox is toggled
  - no HTTP/router imports in the component (PRES-10 — structural test via imports)
  Confirm RED.

- [x] **3.2 — IMPL** Create `module-picker.tsx`. Props: `modules: Module[]`, `onChange(modules:
  Module[])`. Renders checkbox list; `priceIncluded` rows = checked + `disabled`; select-all
  toggle acts only on non-locked; running total = `currentPrice` sum of `selected` modules. No
  HTTP, no router, no auth-store. Confirm GREEN.

- [x] **3.3 — VERIFY** Full suite >= prior total. New module-picker tests added.

---

## Work unit 4 — StoreForm presentational component

**Spec refs:** PRES-4 through PRES-10, MODULE-4, OFFLINE-5, ERR-2, I18N-1 through I18N-4
**Files:**
- `app/management/stores/components/__tests__/store-form.test.tsx` (new file)
- `app/management/stores/components/store-form.tsx` (new file)

### Tasks

- [x] **4.1 — TEST** Create `store-form.test.tsx` wrapped in `IntlProvider`. Mock `ModulePicker`
  (`vi.mock`) to isolate. Test cases (role-conditional fields per PRES-6):
  - non-owner-admin, create mode: renders `name` + `address` only; NO `ownerId`/`approved`/
    `description` (PRES-6)
  - owner-admin, create mode: renders `ownerId` + `approved` + `description` (PRES-6)
  - super-admin, create mode: renders same as owner-admin + `isActive` (PRES-6)
  - super-admin, edit mode: additionally renders `paymentStartDate` (PRES-6)
  - `name` empty → submit button stays disabled / shows required error (PRES-7)
  - `isOnline=false` → submit disabled + offline notice rendered (PRES-8, OFFLINE-5)
  - `isOnline=true`, valid → `onSubmit` called with `{ name, address, moduleIds, ... }` (MODULE-4)
  - `error` prop renders `role="alert"` (PRES-7, ERR-2)
  - `isLoading=true` → submit button disabled (PRES-8)
  Confirm RED.

- [x] **4.2 — IMPL** Create `store-form.tsx`. Props: `mode`, `initialValues`, `roleFlags`,
  `owners`, `modules`, `isOnline`, `isLoading`, `onSubmit`, `error?`. Local `useState` for fields.
  Embeds `<ModulePicker>`. Role-conditional field rendering per PRES-6. Submit disabled when
  `!isOnline || isLoading || !name`. Inline `role="alert"` for `error`. No HTTP, no router, no
  auth-store (PRES-10). Confirm GREEN.

- [x] **4.3 — VERIFY** Full suite >= prior total.

---

## Work unit 5 — StoreList presentational component

**Spec refs:** PRES-1 through PRES-3, LIST-4, LIST-5, LIST-6, ERR-3, I18N-1
**Files:**
- `app/management/stores/components/__tests__/store-list.test.tsx` (new file)
- `app/management/stores/components/store-list.tsx` (new file)

### Tasks

- [x] **5.1 — TEST** Create `store-list.test.tsx` wrapped in `IntlProvider`. Test cases:
  - renders a row per store in `stores[]` showing name + address (PRES-1)
  - empty state message when `stores` is empty (PRES-3)
  - offline/degraded banner rendered when `isOnline=false` (PRES-2)
  - "create" button calls `onCreate` (LIST-4)
  - "edit" button per row calls `onEdit(id)` with correct store id (LIST-4)
  - lifecycle action buttons disabled when `isOnline=false` (LIST-5)
  - error prop renders inline/toast (ERR-3)
  - no HTTP/router imports (PRES-10 structural)
  Confirm RED.

- [x] **5.2 — IMPL** Create `store-list.tsx`. Props: `stores`, `isOnline`, `isLoading`, `error?`,
  `onCreate`, `onEdit`. Renders table/list rows; offline banner; empty state; action buttons
  disabled when offline; inline error. No HTTP, no router, no auth-store. Confirm GREEN.

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

- [x] **6.1 — TEST (StoreListPage)** Add `describe('StoreListPage')` block to
  `store-routes.test.tsx`. Mocks: `vi.mock` for `storeHttpService`, `useAuthStore`, `useOnlineStatus`,
  `react-router` (useNavigate), `auth/routes/loaders` (adminFeatureLoader → null), `BaseRepository`.
  Wrap with `IntlProvider`. Test cases (spec TEST-2):
  - online: calls `listStores()`, writes result to `storesRepository.save()`, renders list (LIST-2,
    OFFLINE-1)
  - offline: does NOT call `listStores()`, calls `storesRepository.getAll()`, renders with
    degraded indicator (LIST-3, OFFLINE-2)
  - online + empty result: empty-state message (LIST-3)
  - offline + empty cache: empty-state message (OFFLINE-2)
  - lifecycle action (activate) online → calls corresponding service fn → refetches (LIST-4)
  Confirm RED.

- [x] **6.2 — IMPL (StoreListPage)** Create `store-list.tsx` container. Exports named `loader =
  adminFeatureLoader([EFeatures.Stores])` and default `StoreListPage`. On mount: check `isOnline`.
  Online → `storeHttpService.listStores()`, write-through cache. Offline → read cache + degraded
  flag. Navigate to create/edit. Lifecycle handlers call activate/approve/disapprove/deactivate
  service functions; on success refetch (online) or show error (LIST-4, LIST-5). Renders
  `<StoreList>` only; no markup beyond wrapper div (LIST-6). Confirm GREEN.

- [x] **6.3 — TEST (StoreCreatePage)** Add `describe('StoreCreatePage')`. Test cases (spec
  TEST-3):
  - on mount: calls `listModulesToStore()` + `listOwners()` (owner-admin/super-admin) (CREATE-2)
  - priceIncluded module pre-selected and locked on render (MODULE-1, PRES-5, MODULE-3)
  - online + valid submit: calls `createStore` with correct payload incl. `moduleIds` + navigates
    to `/management/stores` (CREATE-3, CREATE-4)
  - HTTP error: inline error shown, no navigation (CREATE-6, ERR-2)
  - offline: submit disabled + offline notice (CREATE-5, OFFLINE-3, OFFLINE-5)
  Confirm RED.

- [x] **6.4 — IMPL (StoreCreatePage)** Create `store-create.tsx` container. `loader =
  adminFeatureLoader([EFeatures.Stores])`. On mount: `Promise.all([listModulesToStore(),
  listOwners()])`. Pre-select priceIncluded. handleSubmit: blocked offline; build payload; call
  `createStore`; navigate('/management/stores') on success; set inline error on fail. Renders
  `<StoreForm mode="create">`. Confirm GREEN.

- [x] **6.5 — TEST (StoreEditPage)** Add `describe('StoreEditPage')`. Test cases (spec TEST-4):
  - on mount: calls `getStore(id)`, `listModulesToStore()`, `listOwners()` (EDIT-3)
  - store modules merged into catalog with price overrides (EDIT-4, MODULE-2)
  - id fallback: when no `:id` param, uses `selectedStoreId` from auth-store (EDIT-2)
  - online + valid submit: calls `updateStore` with correct payload incl. `moduleIds`; upserts
    cache; navigates `/management/stores` (EDIT-5, EDIT-6)
  - HTTP error: inline error, no navigation (EDIT-8, ERR-4)
  - offline: submit disabled (EDIT-7, OFFLINE-3)
  Confirm RED.

- [x] **6.6 — IMPL (StoreEditPage)** Create `store-edit.tsx` container. `loader =
  adminFeatureLoader([EFeatures.Stores])`. Id from `useParams().id ?? selectedStoreId`.
  `Promise.all([getStore(id), listModulesToStore(), listOwners()])`. Merge store.modules into
  catalog (selected=true + price/currentPrice/discountText override). handleSubmit: blocked offline;
  build payload with role-gated fields; `updateStore`; upsert cache; navigate on success; inline
  error on fail. Renders `<StoreForm mode="edit">`. Confirm GREEN.

- [x] **6.7 — VERIFY** Full suite >= prior total. Spec requires 5+5+6+4 = 20 container/loader test
  cases minimum. Confirm no unhandled promise rejections (ERR-6).

---

## Work unit 7 — Wiring (routes + i18n)

**Spec refs:** ROUTE-1 through ROUTE-4, I18N-1 through I18N-4, I18N-2 (27 STORES.* keys floor)
**Files:**
- `app/routes.ts` (add 3 route entries)
- `shared/lib/i18n/es.ts` (add STORES.* namespace)

This unit adds no new logic — it connects the already-green modules to the app shell.

### Tasks

- [x] **7.1 — I18N** Add all `STORES.*` keys to `shared/lib/i18n/es.ts`. Minimum 27 keys per spec
  I18N-2. Use the key table from design §7 as the floor. Check that `MANAGEMENT.*` shared keys
  exist; add if absent. All values in Rioplatense Spanish.
  Keys required (27 minimum):
  `STORES.LIST_TITLE`, `STORES.CREATE_TITLE`, `STORES.EDIT_TITLE`, `STORES.NAME`,
  `STORES.ADDRESS`, `STORES.DESCRIPTION`, `STORES.OWNER`, `STORES.APPROVED`,
  `STORES.PAYMENT_START_DATE`, `STORES.IS_ACTIVE`, `STORES.MODULES`, `STORES.MODULES_TOTAL`,
  `STORES.SELECT_ALL`, `STORES.CREATE_ACTION`, `STORES.EDIT_ACTION`, `STORES.SAVE`,
  `STORES.SAVING`, `STORES.CREATE_SUCCESS`, `STORES.UPDATE_SUCCESS`, `STORES.SAVE_ERROR`,
  `STORES.LOAD_ERROR`, `STORES.OFFLINE_NOTICE`, `STORES.REQUIRED`, `STORES.EMPTY`,
  `STORES.ACTIVATE`, `STORES.DEACTIVATE`, `STORES.APPROVE`, `STORES.DISAPPROVE`.

- [x] **7.2 — ROUTES** Add 3 entries to `app/routes.ts` inside the authenticated `app-layout`
  group, after the Profile block:
  ```ts
  route('management/stores', 'management/stores/routes/store-list.tsx'),
  route('management/stores/create', 'management/stores/routes/store-create.tsx'),
  route('management/stores/edit/:id', 'management/stores/routes/store-edit.tsx'),
  ```
  All three route modules already export a named `loader` (ROUTE-4). No logic added here.

- [x] **7.3 — VERIFY** Run full suite. All pre-existing tests green. Copy is resolved via
  `IntlProvider` in existing container tests (route tests already wrap with IntlProvider + es
  messages, so they implicitly confirm i18n keys). Final count >= baseline + all new tests.

---

## Work unit dependency summary

| Unit | Depends on | Can parallelise with |
|------|-----------|---------------------|
| 1 (adminFeatureLoader) | — | Unit 2 |
| 2 (storeHttpService) | — | Unit 1 |
| 3 (ModulePicker) | Units 1+2 green (mock shapes) | Units 4, 5 |
| 4 (StoreForm) | Units 1+2 green | Units 3, 5 |
| 5 (StoreList) | Units 1+2 green | Units 3, 4 |
| 6 (Containers) | Units 3+4+5 green | — |
| 7 (Wiring) | Unit 6 green | — |

---

## New files checklist

| File | Unit | New/Modify |
|------|------|-----------|
| `app/auth/routes/__tests__/loaders.test.ts` | 1 | Modify (extend suite) |
| `app/auth/routes/loaders.ts` | 1 | Modify (add export) |
| `app/management/stores/lib/services/__tests__/store-http-service.test.ts` | 2 | New |
| `app/management/stores/lib/services/store-http-service.ts` | 2 | New |
| `app/management/stores/components/__tests__/module-picker.test.tsx` | 3 | New |
| `app/management/stores/components/module-picker.tsx` | 3 | New |
| `app/management/stores/components/__tests__/store-form.test.tsx` | 4 | New |
| `app/management/stores/components/store-form.tsx` | 4 | New |
| `app/management/stores/components/__tests__/store-list.test.tsx` | 5 | New |
| `app/management/stores/components/store-list.tsx` | 5 | New |
| `app/management/stores/routes/__tests__/store-routes.test.tsx` | 6 | New |
| `app/management/stores/routes/store-list.tsx` | 6 | New |
| `app/management/stores/routes/store-create.tsx` | 6 | New |
| `app/management/stores/routes/store-edit.tsx` | 6 | New |
| `app/routes.ts` | 7 | Modify (add 3 routes) |
| `shared/lib/i18n/es.ts` | 7 | Modify (add STORES.* namespace) |

All paths relative to `frontend-react/apps/web-store-pos/app/` unless noted otherwise.

---

## Spec requirements traceability

| Spec group | Requirements | Covered by unit(s) |
|-----------|-------------|-------------------|
| ACCESS | ACCESS-1 to ACCESS-6 | 1 (tests + impl) |
| ROUTE | ROUTE-1 to ROUTE-4 | 6 (containers), 7 (routes.ts) |
| HTTP | HTTP-1 to HTTP-11 | 2 |
| LIST | LIST-1 to LIST-6 | 5 (presentational), 6 (container) |
| CREATE | CREATE-1 to CREATE-6 | 4 (form), 6 (container) |
| EDIT | EDIT-1 to EDIT-8 | 4 (form), 6 (container) |
| PRES | PRES-1 to PRES-10 | 3 (ModulePicker), 4 (StoreForm), 5 (StoreList) |
| OWNER | OWNER-1 to OWNER-3 | 2 (listOwners in service), 4 (owner picker in form) |
| MODULE | MODULE-1 to MODULE-5 | 3 (ModulePicker), 6 (container merge logic) |
| OFFLINE | OFFLINE-1 to OFFLINE-5 | 6 (containers), 4+5 (pres gate) |
| I18N | I18N-1 to I18N-4 | 7 (es.ts), 3+4+5+6 (useIntl in components) |
| ERR | ERR-1 to ERR-6 | 6 (containers), 4+5 (pres display) |
| TEST | TEST-1 to TEST-7 | 1 through 6 (all test files) |

---

## Review Workload Forecast

| Metric | Estimate |
|--------|---------|
| New test files | 6 |
| Modified test files | 1 (loaders.test.ts) |
| New source files | 12 |
| Modified source files | 3 (loaders.ts, routes.ts, es.ts) |
| Total files touched | 22 |
| Estimated new test lines | ~500 (20–30 cases × ~20 lines avg) |
| Estimated new impl lines | ~600–750 (3 containers ~100 ea, 3 pres ~80 ea, service ~80, i18n ~60) |
| **Estimated total changed lines** | **~1 100–1 250** |
| 400-line budget risk | **High** |
| Chained PRs recommended | **Yes** |
| Decision needed before apply | **Yes** |

### Recommended split into 2 PRs

**PR 1 — Foundation** (Units 1–5, ~500 lines):
- adminFeatureLoader factory (loaders.ts)
- storeHttpService (new file)
- ModulePicker, StoreForm, StoreList presentational components + all their tests

**PR 2 — Containers + Wiring** (Units 6–7, ~650 lines):
- StoreListPage, StoreCreatePage, StoreEditPage containers
- store-routes.test.tsx
- Route registration (routes.ts) + i18n keys (es.ts)

Chain: PR 2 branches off PR 1 and targets `main` after PR 1 merges (stacked-to-main pattern).
