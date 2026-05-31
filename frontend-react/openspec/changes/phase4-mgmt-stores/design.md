# Technical Design — phase4-mgmt-stores

Change: **phase4-mgmt-stores** (Stores sub-domain, 1 of 3 of the Management slice)
Project: **store-mgmt** — React 19 migration, `frontend-react/apps/web-store-pos/`
Reads: proposal #205, shared exploration #202, decisions #204.

This document is the HOW at architectural level. Task-level steps are produced by `sdd-tasks`.

---

## 1. Architecture approach

**Pattern: container/presentational slice, mirroring `app/profile/` exactly.** This is not a new
pattern — it is the project's established convention for a route-bearing feature with side effects.
Reusing it keeps the Management slice consistent with profile/sync and lets the existing test
harness (vi mocks for auth-store, http-service, useOnlineStatus, react-router, loaders) carry over
with minimal change.

Layering per slice:

- **Route module (container)** — owns the React Router `loader`, data fetching, the online gate,
  navigation, submit orchestration, and error/loading state. No presentation markup beyond a thin
  wrapper `<div>`. Default-exports the page plus a named `loader`.
- **Presentational component** — pure, props-in/callbacks-out, uses `useIntl` for copy and local
  `useState` for form fields. No HTTP, no router, no store access. This is what tests render
  directly.
- **HTTP service** — a plain object of async functions over `apiClient`, returning
  `BaseResponseModel<T>`. No React, no state. Identical shape to `profileHttpService`.
- **Loader** — composed from existing `adminLoader` + `featureLoader` via a NEW
  `adminFeatureLoader` factory in `app/auth/routes/loaders.ts`.

**Boundaries:** the Stores sub-slice is self-contained under `app/management/stores/`. The only
files it touches OUTSIDE its own directory are the three shared integration points
(`auth/routes/loaders.ts`, `app/routes.ts`, `shared/lib/i18n/es.ts`). Domain models, apiClient,
auth-store, useOnlineStatus, BaseRepository, StorageKeys are imported unchanged. This keeps the
later `phase4-mgmt-users` / `-configurations` slices independent.

---

## 2. Directory layout

```
app/management/stores/
├── routes/
│   ├── store-list.tsx                 # StoreListPage container + loader
│   ├── store-create.tsx               # StoreCreatePage container + loader
│   ├── store-edit.tsx                 # StoreEditPage container + loader
│   └── __tests__/
│       └── store-routes.test.tsx      # integration tests (render containers w/ mocks)
├── components/
│   ├── store-list.tsx                 # StoreList presentational (table/cards + actions)
│   ├── store-form.tsx                 # StoreForm presentational (shared create/edit)
│   ├── module-picker.tsx             # ModulePicker presentational (checkboxes + total)
│   └── __tests__/
│       ├── store-form.test.tsx
│       └── module-picker.test.tsx
└── lib/
    └── services/
        ├── store-http-service.ts      # storeHttpService over apiClient
        └── __tests__/
            └── store-http-service.test.ts
```

Rationale: this is the same `routes/ + components/ + lib/services/` triad profile uses, with one
extra presentational component (`module-picker`) factored out of `store-form` because the picker
has its own non-trivial logic (priceIncluded lock, total computation, select-all) that deserves
isolated tests. The `management/` parent directory is created here and reused by the two later
sub-slices.

---

## 3. Component & service breakdown

### 3.1 storeHttpService (`lib/services/store-http-service.ts`)

Thin async functions over `apiClient`, all paths relative to `/v1`, all returning
`BaseResponseModel<T>` (the `.data` envelope, matching `profileHttpService`).

| Function | Method + path | Payload | Returns |
|----------|---------------|---------|---------|
| `listStores()` | `GET /v1/stores/by-current-user` | — | `BaseResponseModel<Store[]>` |
| `getStore(id)` | `GET /v1/stores/${id}` | — | `BaseResponseModel<Store>` |
| `createStore(payload)` | `POST /v1/stores` | `{ ownerId, name, address, description, approved, moduleIds[] }` | `BaseResponseModel<Store>` |
| `updateStore(id, payload)` | `PUT /v1/stores/${id}` | `{ id, name, address, description, approved, paymentStartDate, moduleIds[], isActive }` | `BaseResponseModel<boolean>` |
| `listModulesToStore()` | `GET /v1/modules/ToStore` | — | `BaseResponseModel<Module[]>` |
| `listOwners()` | `GET /v1/owners/all/true` | — | `BaseResponseModel<Owner[]>` |

Activate / approve / disapprove / deactivate (delete) endpoints exist in legacy but are **list-row
actions**. Decision: scope the first cut to **deactivate** only if the list needs it; approve/activate
toggles are deferred unless the spec's acceptance criteria require them. The service may declare the
functions but the list UI wires only what the spec asks for. (Flagged as a risk for `sdd-spec` to
pin down.)

### 3.2 Route containers

**StoreListPage (`routes/store-list.tsx`)**
- `loader = adminFeatureLoader([EFeatures.Stores])`.
- On mount: read `isOnline` from `useOnlineStatus`, `selectedStoreId` from auth-store.
- Online → `await storeHttpService.listStores()`, then write-through to the read-cache
  (`storesRepository.save(...)`), set local `stores` state.
- Offline → read `storesRepository.getAll(selectedStoreId)` and render from cache with an offline banner.
- Navigation: "create" button → `navigate('/management/stores/create')`; row "edit" →
  `navigate('/management/stores/edit/' + id)`.
- Renders `<StoreList stores isOnline isLoading error onCreate onEdit />`.

**StoreCreatePage (`routes/store-create.tsx`)**
- `loader = adminFeatureLoader([EFeatures.Stores])`.
- On mount fetches in parallel: `listModulesToStore()` and, if owner-admin/super-admin,
  `listOwners()`. Computes role flags from auth-store (`isSuperAdmin`, `isOwnerAdmin`).
- `initialValues`: empty store; modules with `priceIncluded` pre-selected and locked.
- Submit (`handleSubmit`): blocked when offline. Builds payload:
  `ownerId` = picked value for owner-admin/super-admin, else `currentUser.id`;
  `approved` = form value for owner-admin/super-admin, else `false`;
  `moduleIds` = selected module ids. `await createStore(payload)`; on success →
  `navigate('/management/stores')` (resolves OQ-1; see §8). On error → inline error.
- Renders `<StoreForm mode="create" ... />`.

**StoreEditPage (`routes/store-edit.tsx`)**
- `loader = adminFeatureLoader([EFeatures.Stores])`.
- `id` from `useParams()`; fallback to `currentUser.selectedStoreId` (mirrors legacy line 53).
- On mount fetches `getStore(id)`, `listModulesToStore()`, and owners (role-gated) in parallel.
  Merges store's modules into the catalog: matched modules become `selected:true` and inherit the
  store's price/currentPrice/discountText (mirrors legacy lines 156-164).
- Submit: blocked offline. Builds update payload incl. `paymentStartDate` (super-admin only),
  `isActive` (super-admin only), `approved` (owner-admin/super-admin), `moduleIds`.
  `await updateStore(id, payload)`; on success → write-through cache upsert + `navigate('/management/stores')`.
  On error → inline error.
- Renders `<StoreForm mode="edit" ... />`.

### 3.3 Presentational components

**StoreList (`components/store-list.tsx`)** — props: `stores: Store[]`, `isOnline`, `isLoading`,
`error?`, `onCreate()`, `onEdit(id)`. Renders an offline banner when `!isOnline`, a "create" button,
and a list/table of stores (name, address, active/approved badges) with an edit action per row.
Pure; no fetching.

**StoreForm (`components/store-form.tsx`)** — props: `mode: 'create' | 'edit'`, `initialValues`,
`roleFlags: { isSuperAdmin, isOwnerAdmin }`, `owners: Owner[]`, `modules: Module[]`, `isOnline`,
`isLoading`, `onSubmit(values)`, `error?`. Owns local field state (`name`, `address`, `description`,
`ownerId`, `approved`, `paymentStartDate`, `isActive`) and the working module list. Renders fields
**conditionally by role** (ported from legacy `loadForm`):
- always: `name` (required), `address`.
- owner-admin OR super-admin: `ownerId` (required, from `owners` picker), `approved`, `description`.
- super-admin AND edit: `paymentStartDate` (required).
- super-admin: `isActive`.
Validation mirrors `EditProfileForm`: `name` required; submit disabled when `!isOnline || isLoading`;
inline `role="alert"` error. Embeds `<ModulePicker>`.

**ModulePicker (`components/module-picker.tsx`)** — props: `modules: Module[]`,
`onChange(modules)`. Renders a **checkbox list** (one per module) plus a select-all toggle and a
running total of `currentPrice` for selected modules. `priceIncluded` modules render checked and
**disabled** (cannot be deselected). Pure; parent owns the source-of-truth array.

> **Decision — checkboxes over a multi-select dropdown.** The legacy form renders modules as an
> inline list with a per-row price and a live total, and `priceIncluded` rows must be visibly locked.
> A native/combobox multi-select hides the per-item price and the locked state, and makes the
> running total awkward. Checkboxes match the legacy UX, keep each row's price/locked affordance
> visible, and are trivially testable by label. Rejected: multi-select dropdown (worse affordance
> for locked items + total), and a separate "modules" step/route (over-engineered; legacy keeps it
> inline and the proposal locks selection IN the form).

---

## 4. Data flow

### 4.1 List (`/management/stores`)
```
adminFeatureLoader([Stores]) → gate (role + feature) → render container
container mount:
  online?  yes → storeHttpService.listStores() → BaseResponseModel<Store[]>
                 → setStores(data) → storesRepository.save(selectedStoreId, map)   [write-through]
           no  → storesRepository.getAll(selectedStoreId) → setStores(cache) + offline banner
StoreList renders rows; onCreate/onEdit → navigate
```

### 4.2 Create (`/management/stores/create`)
```
loader gate → container mount:
  Promise.all([ listModulesToStore(), roleNeedsOwners ? listOwners() : [] ])
  → modules: priceIncluded pre-selected+locked
StoreForm (role-conditional fields + ModulePicker)
submit (online only):
  build payload {ownerId, name, address, description, approved, moduleIds}
  → createStore(payload) → await → success → navigate('/management/stores')
                                  → error   → inline alert
```

### 4.3 Edit (`/management/stores/edit/:id`)
```
loader gate → container mount (id ?? selectedStoreId):
  Promise.all([ getStore(id), listModulesToStore(), roleNeedsOwners ? listOwners() : [] ])
  → patch form from store; merge store.modules into catalog (selected + price/currentPrice/discountText)
StoreForm
submit (online only):
  build payload {id, name, address, description, approved, paymentStartDate, moduleIds, isActive}
  → updateStore(id, payload) → await → success → storesRepository.upsert + navigate('/management/stores')
                                      → error   → inline alert
```

**Await-then-update + navigation in container** (decision #204): containers `await` the service,
then update state / cache / navigate. No optimistic UI, no queue.

---

## 5. Offline & error handling

- **Online gate via `useOnlineStatus`** (same hook profile uses). Writes (create/update) are
  **blocked** when offline: submit button disabled + offline notice (decision #204, no queue).
- **List reads from cache when offline**: container falls back to `BaseRepository<Store>` instead of
  hitting the network. Create/Edit forms still render offline (catalog/owners may come from cache or
  be empty) but submit stays disabled.
- **Error handling** mirrors profile: `try/await/catch`, on catch set a localized error string and
  render it via `role="alert"`. No success navigation on error. Service functions do not swallow
  errors — they throw; the container decides UX. (Legacy logged + rethrew; React drops the
  `console.error` noise.)

---

## 6. Route registration & gating

### 6.1 `adminFeatureLoader` (NEW in `app/auth/routes/loaders.ts`)
```ts
export function adminFeatureLoader(requiredFeatureIds: number[], storeIdParam?: string) {
  return async (args: LoaderFunctionArgs): Promise<Response | null> => {
    const adminResult = await adminLoader();      // role: super-admin || owner-admin
    if (adminResult) return adminResult;           // redirect short-circuits
    return featureLoader(requiredFeatureIds, storeIdParam)(args); // feature gate
  };
}
```
> **Decision — factory composition over inline or extending featureLoader.** A reusable factory is
> DRY (the two later mgmt slices reuse it), keeps the existing tested `adminLoader`/`featureLoader`
> untouched (no regression risk), and reads as a single intent ("admin AND feature"). Rejected:
> inline composition in each route (duplicated, 3×), and extending `featureLoader` with a role param
> (mutates tested code, risks the existing profile/sync/sales loaders). Order: role check first
> (cheaper, no params), then feature.

### 6.2 `app/routes.ts` — add 3 entries inside the authenticated `app-layout` group
```ts
// Management — Stores
route('management/stores', 'management/stores/routes/store-list.tsx'),
route('management/stores/create', 'management/stores/routes/store-create.tsx'),
route('management/stores/edit/:id', 'management/stores/routes/store-edit.tsx'),
```
Placed after the Profile block, before utility routes. Feature gating (EFeatures.Stores=73) is
enforced by each route module's `loader`, consistent with how profile uses `featureLoader`.

---

## 7. i18n key plan (`shared/lib/i18n/es.ts`)

`MENU.STORES` and `MENU.MANAGEMENT` already exist. Add a `STORES.*` namespace (Rioplatense, matching
the `PROFILE.*` tone):

| Key | Value (es) |
|-----|-----------|
| `STORES.LIST_TITLE` | Tiendas |
| `STORES.CREATE_TITLE` | Crear tienda |
| `STORES.EDIT_TITLE` | Editar tienda |
| `STORES.NAME` | Nombre |
| `STORES.ADDRESS` | Dirección |
| `STORES.DESCRIPTION` | Descripción |
| `STORES.OWNER` | Propietario |
| `STORES.APPROVED` | Aprobada |
| `STORES.PAYMENT_START_DATE` | Fecha de inicio de pago |
| `STORES.IS_ACTIVE` | Activa |
| `STORES.MODULES` | Módulos |
| `STORES.MODULES_TOTAL` | Total |
| `STORES.SELECT_ALL` | Seleccionar todos |
| `STORES.CREATE_ACTION` | Crear tienda |
| `STORES.EDIT_ACTION` | Editar |
| `STORES.SAVE` | Guardar cambios |
| `STORES.SAVING` | Guardando... |
| `STORES.CREATE_SUCCESS` | Tienda creada correctamente. |
| `STORES.UPDATE_SUCCESS` | Tienda actualizada correctamente. |
| `STORES.SAVE_ERROR` | No se pudo guardar la tienda. Intentá de nuevo. |
| `STORES.LOAD_ERROR` | No se pudieron cargar las tiendas. |
| `STORES.OFFLINE_NOTICE` | Sin conexión. Conectate a internet para guardar cambios. |
| `STORES.REQUIRED` | Este campo es obligatorio. |
| `STORES.EMPTY` | No hay tiendas para mostrar. |

(Final key set is refined by `sdd-spec`; this is the design-level plan.)

---

## 8. localStorage cache strategy

- **One repository instance**: `const storesRepository = new BaseRepository<Store>('stores', ['paymentStartDate'])`.
  `Store.id` is a string → satisfies `BaseRepository<T extends { id: string }>`. `paymentStartDate`
  is registered as a date field so cache reads revive it to `Date`.
- **Key**: `StorageKeys.entityKey('stores', selectedStoreId)` → `lizoft.store-stores-{storeId}`.
- **Read**: list container reads cache only when **offline**; online path always hits network.
- **Write-through after reads**: online list success saves the fetched map to cache so the next
  offline visit has data.
- **Cache invalidation after writes**: on successful **edit**, `upsert(selectedStoreId, updatedStore)`
  keeps the cache coherent. On **create**, the new store's authoritative record comes back from the
  server; since we navigate to the list (which re-fetches online), an explicit create-time upsert is
  optional. Decision below.

> **Decision — write-through on read + upsert on edit; no eager create-time cache write.** After a
> create we navigate to the list which re-fetches and rewrites the whole cache online, so an extra
> upsert is redundant. After an edit we already hold the full updated entity, so an `upsert` is cheap
> and avoids a stale row if the user goes offline immediately after. Rejected: caching nothing
> (offline list would be empty after first online visit), and a full re-fetch-and-replace after every
> write (extra round-trip; the list re-fetch already does this). Note: `updateStore` returns
> `BaseResponseModel<boolean>`, so the upsert uses the form's merged store object, not the response
> body.

---

## 9. Resolving the proposal's residual open questions

- **OQ-1 (post-create navigation):** Legacy navigates to `/management/users/create/`, but the users
  slice ships later. **Resolved: navigate to `/management/stores` (list) after a successful create.**
  This is a valid, reachable destination today; revisit when `phase4-mgmt-users` lands (it can change
  this single `navigate` call).
- **OQ-2 (owner-picker data source):** **Resolved: `GET /v1/owners/all/true` →
  `BaseResponseModel<Owner[]>`** (confirmed in legacy `owner.service.ts:20-22`). The thin read lives
  **inside `storeHttpService.listOwners()`** — NOT a new owner slice/service. Rationale: it is a
  single read consumed only by the store form's picker; creating an `owner-http-service` or owner
  slice would imply owner CRUD which the proposal explicitly puts out of scope. Keeping it as one
  function on `storeHttpService` is the smallest correct surface. The picker only renders
  `owner.id` + `owner.fullName`. If a future owners slice appears, this function moves out then.

---

## 10. TDD build sequence (strict TDD: red → green → refactor)

Each step writes failing tests first, then the minimum implementation. Mirrors profile's test
harness (vi mocks for auth-store, http-service, useOnlineStatus, react-router, loaders;
`IntlProvider` wrapper with real `es` messages).

1. **adminFeatureLoader** — unit tests in `auth/routes/__tests__/loaders.test.ts`: redirects when not
   admin; redirects when admin but feature missing; returns `null` when admin + feature present.
   Then implement the factory.
2. **storeHttpService** — tests with mocked `apiClient` asserting method + path + payload + that the
   `.data` envelope is returned, per function in §3.1. Then implement.
3. **ModulePicker** — tests: renders a checkbox per module; `priceIncluded` checked + disabled;
   toggling fires `onChange`; select-all toggles only non-locked; total reflects selected
   `currentPrice`. Then implement.
4. **StoreForm** — tests: role-conditional fields render correctly for non-owner-admin / owner-admin /
   super-admin(create) / super-admin(edit); `name` required blocks submit; offline disables submit +
   shows notice; submit emits the correct values incl. selected moduleIds. Then implement.
5. **StoreList** — tests: renders rows from `stores`; empty state; offline banner; `onCreate`/`onEdit`
   fire with correct args. Then implement.
6. **Route containers** (`store-routes.test.tsx`, like `profile-routes.test.tsx`):
   - List: online → calls `listStores` + writes cache; offline → reads cache + banner.
   - Create: success → calls `createStore` with role-correct payload → navigates `/management/stores`;
     error → alert, no navigate; offline → submit disabled.
   - Edit: prefills from `getStore`; merges modules; success → `updateStore` + cache upsert + navigate;
     error → alert.
   Then implement the three containers.
7. **Wiring (no new logic, covered indirectly):** add the 3 route entries to `app/routes.ts` and the
   `STORES.*` keys to `es.ts`. Verified by the route tests resolving copy via `IntlProvider`.

Refactor pass after green: dedupe payload-building / role-flag logic between create and edit
containers into a small local helper if the duplication is real (only after both are green).

---

## 11. Architecture decisions (ADR summary)

| # | Decision | Rationale | Rejected alternative |
|---|----------|-----------|----------------------|
| D1 | Container/presentational slice mirroring `app/profile/` | Established project convention; test harness reuse; consistency | New ad-hoc structure |
| D2 | `adminFeatureLoader(featureIds)` factory composing `adminLoader` + `featureLoader` | DRY, reused by later mgmt slices, zero regression on tested loaders | Inline per-route; extend featureLoader with role param |
| D3 | Module picker as **checkbox list** with locked `priceIncluded` rows + running total | Matches legacy UX, keeps price/locked affordance visible, easy to test | Multi-select dropdown; separate module step/route |
| D4 | Owner thin-read as `storeHttpService.listOwners()` (`GET /v1/owners/all/true`) | Single read for the picker only; owner CRUD is out of scope | New owner-http-service / owner slice (implies CRUD) |
| D5 | Post-create → navigate to `/management/stores` list | Reachable today; users slice ships later | Navigate to users/create (route doesn't exist yet) |
| D6 | Write-through cache on online read; `upsert` on edit; no eager create-time write | Coherent offline list; avoids redundant round-trips | No cache; full re-fetch-replace after every write |
| D7 | Await-then-update, navigation in container, offline blocks writes | Decision #204; mirrors profile/sync | Optimistic UI; offline write queue |
| D8 | One extra presentational `ModulePicker` split out of `StoreForm` | Non-trivial picker logic deserves isolated tests | Inline picker inside StoreForm |
