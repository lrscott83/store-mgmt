# Proposal: phase4-mgmt-stores

Sub-domain 1 of 3 of the Management slice (phase4-management). This change covers **Stores only**.
Users and Configurations are separate, independent SDD changes and are explicitly OUT of scope here.

Shared exploration: engram `sdd/phase4-management/explore` (#202) / `openspec/changes/phase4-management/explore.md`.
Structuring decision: engram `sdd/phase4-management/decisions` (#204).

---

## Intent

### Problem
The React migration (`frontend-react/`) already declares a `MENU.MANAGEMENT` group with a
`/management/stores` entry (feature-gated on `EFeatures.Stores = 73`), but it is a ghost link:
no route, no slice, no HTTP service, no UI exists. Store administration (the ability for super-admins
and owner-admins to list, create, and edit stores, including assigning the modules a store has access to)
is still only available in the legacy Angular app under `frontend/`.

### Why now
Stores is the first sub-domain of the Management slice (order locked in #204: stores → users → configurations).
Users and Configurations sub-slices both depend conceptually on store administration existing first
(a store user is created against a store; configurations are store-scoped). Delivering Stores unblocks the
rest of the Management migration and removes a dead menu entry.

### Success looks like
- `/management/stores`, `/management/stores/create`, `/management/stores/edit/:id` render in React and are
  reachable only by an authenticated user who is super-admin or owner-admin AND has `EFeatures.Stores`.
- The list shows the stores returned by the backend for the current user; create/edit forms persist via the
  same backend contracts the Angular app uses today, including module assignment.
- Offline: the list reads from a localStorage cache (degraded read); all writes are blocked with a clear
  error while offline.
- Implementation mirrors the established profile/sync precedent (container/presentational split,
  Axios `apiClient`, `useOnlineStatus`, route loaders).

---

## Scope

### In scope
- Routes: `/management/stores` (list), `/management/stores/create` (create form),
  `/management/stores/edit/:id` (edit form).
- New `adminFeatureLoader([EFeatures.Stores])` factory in `app/auth/routes/loaders.ts`, composed from the
  existing `adminLoader` (role) + `featureLoader` (feature). Reused by later management sub-slices.
- New `app/management/stores/` slice: route containers (side effects), presentational list + form components,
  `storeHttpService` over `apiClient`.
- Store create/edit form **includes module selection** (module picker that fetches the available module
  catalog, mirrors legacy auto-select/lock of price-included modules, sends selected module ids on submit).
- Offline behavior: list reads from localStorage cache via `BaseRepository<Store>`; writes blocked via
  `useOnlineStatus`.
- i18n keys under `STORES.*` (and any `MANAGEMENT.*` shared keys) in `es.ts`.
- Register the 3 store routes in `app/routes.ts`.

### Out of scope (explicit)
- **Users sub-slice** (`/management/users/*`) — separate change `phase4-mgmt-users`.
- **Configurations sub-slice** (`/management/configurations`) — separate change `phase4-mgmt-configurations`.
- Owner CRUD. The form consumes an owner list for the owner picker (owner-admin/super-admin only); building
  owner management is not in this change. If no React owner-list source exists yet, the owner picker is
  speccable as a thin read (see Residual notes), but owner administration UI is OUT.
- Offline write queue / sync of pending store edits (decision #204: block, do not queue).
- Backend changes. All contracts already exist and are reused as-is.

---

## Approach (locked — mirrors profile precedent)

**Three-layer slice, container/presentational split:**

1. **Route containers** (`app/management/stores/routes/`) own side effects: loaders, data fetching,
   online/offline gating, navigation, submit handling. One module per route (list, create, edit).
2. **Presentational components** (`app/management/stores/components/`): `StoreList` (pure render +
   action callbacks) and a shared `StoreForm` (create/edit) including the module picker. No HTTP, no router.
3. **HTTP service** (`app/management/stores/lib/services/store-http-service.ts`): thin functions over the
   shared Axios `apiClient` (Bearer token + 401 interceptor already wired). One function per backend contract.

**Access control:** each route's loader = `adminFeatureLoader([EFeatures.Stores])`. The factory short-circuits
to redirect on unauthenticated (`/login`) or unauthorized (`/unauthorized`), composing the existing tested
`adminLoader` + `featureLoader` semantics. No change to existing loaders.

**Online/offline:** `useOnlineStatus` in containers. Reads attempt the network; on failure (or when offline) the
list container falls back to `BaseRepository<Store>` localStorage cache and renders a degraded state. Successful
list reads write through to the cache. Create/edit/lifecycle actions are disabled and surface an error toast when
offline (no queue).

**Module selection logic (ported from Angular `EditStoreComponent`):**
- On form mount, fetch the module catalog (`GET /v1/modules/ToStore`).
- Modules where `priceIncluded === true` are auto-selected and locked (cannot be unselected).
- In edit mode, after the store loads, merge the store's existing `modules` into the catalog: mark them
  `selected` and override `price` / `currentPrice` / `discountText` from the store's record.
- Submit sends `moduleIds = ids of selected modules`.
- Total price helpers (`sum of currentPrice / price over selected modules`) are presentation concerns.

**Role-conditional form shape (ported):**
- owner-admin/super-admin: form adds `ownerId` (required, owner picker), `approved`, `description`.
- super-admin + editing existing store: adds `paymentStartDate` (required).
- super-admin: adds `isActive`.
- Non-owner-admin create: `ownerId` defaults to current user id, `approved` forced `false`.

---

## Confirmed Endpoint Contracts (Angular evidence)

All paths are relative to `${apiUrl}/${apiVersion}` (e.g. `/v1`). Responses use the
`BaseResponseModel<T>` envelope: `{ data, succeeded, message, actionCode, errors }`.

| Operation | Method + Path | Request body | Response | Evidence |
|-----------|---------------|--------------|----------|----------|
| List (current user) | `GET /stores/by-current-user` | — | `BaseResponseModel<Store[]>` | `store.service.ts:22-26` |
| Get by id | `GET /stores/:id` | — | `BaseResponseModel<Store>` | `store.service.ts:89-92` |
| Create | `POST /stores` | `{ ownerId, name, address, description, approved, moduleIds: number[] }` | `BaseResponseModel<Store>` | `store.service.ts:37-47` |
| Update | `PUT /stores/:id` | `{ id, name, address, description, approved, paymentStartDate, moduleIds: number[], isActive }` | `BaseResponseModel<boolean>` | `store.service.ts:49-63` |
| Activate | `POST /stores/activate` | `{ id }` | `BaseResponseModel<boolean>` | `store.service.ts:65-71` |
| Approve | `POST /stores/approve` | `{ id }` | `BaseResponseModel<boolean>` | `store.service.ts:73-79` |
| Disapprove | `POST /stores/disapprove` | `{ id }` | `BaseResponseModel<boolean>` | `store.service.ts:81-87` |
| Deactivate | `DELETE /stores/:id` | — | `BaseResponseModel<...>` | base `delete()` used in `store-list.component.ts:73` |

**Module catalog fetch (the form's module picker source):**

| Operation | Method + Path | Response | Evidence |
|-----------|---------------|----------|----------|
| Available modules for a store | `GET /modules/ToStore` | `BaseResponseModel<Module[]>` | `module.service.ts:20-21` |

> The list deliberately uses the dedicated `/stores/by-current-user` endpoint, NOT the generic
> `BaseService.getAllItems()` (`{API_URL}all/false`). Backend scoping is server-side.

**Model shapes (confirmed in `@store-mgmt/domain`):**
- `Store` — `frontend-react/packages/domain/src/models/store.ts:23-35`
  (`id, name, displayName, ownerId, ownerName, address, description, approved, paymentStartDate, modules: Module[], isActive`).
- `Module` — same file, `:3-11` (`id, name, price, currentPrice, priceIncluded, discountText, selected`).

No domain model changes required.

---

## OQ-3 — OwnerAdmin scoping (resolved)
Backend enforces store scope server-side. The list endpoint is `by-current-user`; the frontend passes no
owner/store filter for the list. The edit container resolves the target store id from the `:id` route param,
falling back to `currentUser.selectedStoreId` when absent (Angular `edit-store.component.ts:53`). Role flags
(`isSuperAdmin`, `isOwnerAdmin`) come from `useAuthStore` and only change which form fields render — not which
records are visible. No client-side filtering of responses.

---

## Data Flow

**List (`/management/stores`):**
loader `adminFeatureLoader([Stores])` → container calls `storeHttpService.listByCurrentUser()` →
on success: render `StoreList` + write-through to `BaseRepository<Store>` cache; on network failure/offline:
read cache and render degraded. Row actions (activate/approve/disapprove/deactivate) call the matching service
function then refetch; disabled when offline.

**Create (`/management/stores/create`):**
loader guard → container mounts `StoreForm` (create mode) → form fetches `modules/ToStore` for the picker →
on submit (online only): `storeHttpService.create(payload)` → on success navigate (legacy goes to
`/management/users/create/`; React target reconsidered in spec since users slice ships separately — see Residual).

**Edit (`/management/stores/edit/:id`):**
loader guard → container fetches store via `getById(id)` and module catalog → form pre-fills, merges store
modules into catalog → on submit (online only): `storeHttpService.update(id, payload)` → on success refresh
auth/user state and navigate back to the list.

---

## Reused vs Net-New Assets

### Reused directly (no change)
- `apiClient` — `app/shared/lib/http/api-client.ts`
- `useAuthStore` — role flags + `selectedStoreId`
- `useOnlineStatus` — `app/shared/lib/hooks/use-online-status.ts`
- `adminLoader`, `featureLoader` — `app/auth/routes/loaders.ts` (composed, not modified)
- `BaseRepository<T>` + `StorageKeys.entityKey` — localStorage read-cache
- `Store`, `Module` from `@store-mgmt/domain`
- `EFeatures.Stores` (73) from domain enum

### Net-new
- `adminFeatureLoader(featureIds)` in `app/auth/routes/loaders.ts`
- `app/management/stores/routes/` — list, create, edit route modules (containers)
- `app/management/stores/components/` — `StoreList`, `StoreForm` (+ module picker subcomponent)
- `app/management/stores/lib/services/store-http-service.ts`
- 3 route entries in `app/routes.ts`
- `STORES.*` (+ shared `MANAGEMENT.*`) i18n keys in `es.ts`

---

## Residual Open Questions (non-blocking)

None block spec or design. Two minor items for the spec author to settle (both have a clear default):

1. **Post-create navigation target.** Angular navigates to `/management/users/create/` after creating a store
   (`edit-store.component.ts:195`), but the users slice ships in a later change. Default for this change:
   navigate to `/management/stores` (the list) after create, and revisit cross-slice handoff when
   `phase4-mgmt-users` lands. Spec to confirm.
2. **Owner picker data source.** The owner-admin/super-admin form needs an owner list. Angular uses
   `OwnerService.fetch()`; there is no React owner-list source yet. Default: spec a thin read
   (`GET /owners`-style, or whatever the legacy `OwnerService` resolves to) scoped to feeding the picker only —
   owner administration UI stays OUT. Design to confirm the exact owner endpoint when speccing the form.

Neither prevents writing the spec or the design; both have safe defaults recorded above.
