# Proposal: phase4-mgmt-users

Sub-domain 2 of 3 of the Management slice (phase4-management). This change covers **Users only**.
Configurations is a separate, independent SDD change and is explicitly OUT of scope here.

Shared exploration: engram `sdd/phase4-mgmt-users/explore` (#214) / `openspec/changes/phase4-mgmt-users/explore.md`.
Resolved decisions: engram `phase4-mgmt-users: 3 critical endpoint/scope decisions` (#215).
Precedent: archived `phase4-mgmt-stores` proposal/spec/design (mirror its architecture exactly).

---

## Intent

### Problem
The React migration (`frontend-react/`) declares a `MENU.USERS` entry, but `/management/users` is a ghost link:
no route, no slice, no HTTP service, no UI exists. Store-user administration (the ability for super-admins and
owner-admins to list store users, create them against a store, edit their details, manage active state, and reset
passwords) is still only available in the legacy Angular app under `frontend/`.

### Why now
Users is the second sub-domain of the Management slice (order locked in #204: stores → users → configurations).
The Stores slice shipped first (archived, 515/515 tests, `adminFeatureLoader` live). A store user is created
against a store, so Users depends conceptually on Stores existing. Delivering Users continues the Management
migration and removes a dead menu entry.

### Success looks like
- `/management/users`, `/management/users/create`, `/management/users/:id/edit` render in React and are reachable
  only by an authenticated user who is super-admin or owner-admin AND has `EFeatures.Users = 72`.
- The list shows `StoreUser[]` (with `login`, `storeId`, `storeName`); create persists a store user via the same
  backend contracts Angular uses; edit allows updating details and resetting the password (old password required).
- Offline: the list reads from a localStorage cache (degraded read); all writes are blocked with a clear error.
- Implementation mirrors the Stores slice exactly (container/presentational split, Axios `apiClient`,
  `useOnlineStatus`, route loaders, `BaseRepository` cache).

---

## Scope

### In scope
- Routes: `/management/users` (list), `/management/users/create` (create form),
  `/management/users/:id/edit` (edit: details + credentials).
- New `app/management/users/` slice: route containers (side effects), presentational components
  (`UserList`, `UserCreateForm`, `UserDetailsForm`, `UserCredentialsForm`), `userHttpService` over `apiClient`.
- List: full `StoreUser[]` from `GET /v1/storeusers/list/true` (login/storeId/storeName); activate + deactivate
  lifecycle actions with refetch (same pattern as Stores).
- Create: `POST /v1/storeusers` with `roleIds: [ERoles.StoreUser = 3]`; requires `:storeId` (guard missing →
  redirect to `/management/stores`); password policy regex + frontend-only confirm match; email optional, cellPhone required.
- Edit: container fetches via `GET /v1/storeusers/:id`; two stacked presentational sub-forms each with own submit —
  details (`PUT /v1/users/:id`) and credentials (password reset `POST /v1/users/change-password/:id`,
  `{ oldPassword, newPassword }`, oldPassword REQUIRED, no admin-bypass).
- Offline: list reads `BaseRepository<StoreUser>` cache; writes blocked via `useOnlineStatus`.
- i18n keys under `USERS.*` (and shared `MANAGEMENT.*` where reused) in `es.ts`.
- Register the 3 user routes in `app/routes.ts`.

### Out of scope (explicit)
- **Configurations sub-slice** (`/management/configurations`) — separate change `phase4-mgmt-configurations`.
- **Change-login** — OMITTED entirely (no backend endpoint exists; decision #215 OQ-U3). No "New login" field.
- **Admin password bypass** — NOT supported (no endpoint; decision #215 OQ-U2). oldPassword is always required.
- Offline write queue / sync of pending edits (block, do not queue — same as Stores).
- New `adminFeatureLoader` factory — `adminFeatureLoader([EFeatures.Users])` already exists; reuse, no new factory.
- Backend changes. All contracts already exist and are reused as-is.

---

## Approach (locked — mirrors Stores slice exactly)

**Three-layer slice, container/presentational split:**

1. **Route containers** (`app/management/users/routes/`) own side effects: loaders, data fetching,
   online/offline gating, navigation, submit handling. One module per route (list, create, edit).
2. **Presentational components** (`app/management/users/components/`): `UserList` (table + activate/deactivate
   callbacks), `UserCreateForm` (login + password + confirm), `UserDetailsForm` (fullName/cellPhone/email/isActive),
   `UserCredentialsForm` (oldPassword + newPassword + confirm). No HTTP, no router.
3. **HTTP service** (`app/management/users/lib/services/user-http-service.ts`): thin functions over the shared
   Axios `apiClient`. One function per backend contract.

**Access control:** each route's loader = `adminFeatureLoader([EFeatures.Users])` — already live from the Stores
change. No loader changes.

**Online/offline:** `useOnlineStatus` in containers. List attempts network; on failure/offline falls back to
`BaseRepository<StoreUser>('storeusers', [])` cache (no date fields) keyed by
`StorageKeys.entityKey('storeusers', selectedStoreId)` and renders degraded. Successful reads write through.
Create/edit/lifecycle actions are disabled and surface an error when offline (no queue).

**Edit page shape (differs from Stores — TWO sub-forms):** one `user-edit.tsx` container renders two stacked
presentational forms — `UserDetailsForm` and `UserCredentialsForm` — each with its own submit handler. The
`isActive` toggle in details is shown only for super-admin/owner-admin (ported from Angular `showActiveControl`).

**Create vs edit-details do NOT share a form shape:** create has login + password + confirm; edit-details has no
login/password. Two distinct presentational components (not a shared form like Stores).

---

## Confirmed Endpoint Contracts (Angular evidence + decisions #215)

All paths are relative to `${apiUrl}/${apiVersion}` (e.g. `/v1`). Responses use the `BaseResponseModel<T>`
envelope: `{ data, succeeded, message, actionCode, errors }`.

| Operation | Method + Path | Request body | Response | Notes |
|-----------|---------------|--------------|----------|-------|
| List store users | `GET /storeusers/list/true` | — | `BaseResponseModel<StoreUser[]>` | full fields incl. login/storeId/storeName (decision OQ-U1) |
| Get by id (edit) | `GET /storeusers/:id` | — | `BaseResponseModel<StoreUser>` | consistency w/ list (decision OQ-U1) |
| Create store user | `POST /storeusers` | `{ storeId, fullName, login, password, cellPhone, email, roleIds: [3] }` | `BaseResponseModel<boolean>` | requires `:storeId` route param |
| Edit details | `PUT /users/:id` | `{ fullName, cellPhone, email, isActive }` | `BaseResponseModel<boolean>` | |
| Deactivate | `DELETE /users/:id` | — | `BaseResponseModel<boolean>` | sets isActive=false |
| Activate | `POST /users/activate` | `{ id, isActive: true }` | `BaseResponseModel<boolean>` | |
| Change password | `POST /users/change-password/:id` | `{ oldPassword, newPassword }` | `BaseResponseModel<boolean>` | oldPassword REQUIRED (decision OQ-U2) |

**Model shapes (confirmed in `@store-mgmt/domain`, no changes):**
- `StoreUser` — `frontend-react/packages/domain/src/models/store.ts:68-77`
  (`id, storeId, storeName, login, fullName, cellPhone, email, isActive`).
- `ERoles.StoreUser = 3`, `EFeatures.Users = 72` — `enums/index.ts`.

Password policy regex (ported): `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}`.

---

## Capabilities

> Contract with sdd-spec. Existing capability: `management` (`openspec/specs/management/spec.md`).

### New Capabilities
None.

### Modified Capabilities
- `management`: add Users sub-domain requirements — three user routes, `userHttpService` contracts, the four
  presentational components, create-against-store flow with `roleIds: [3]`, edit details + credentials (password
  reset with oldPassword), offline read-cache + write-block, `adminFeatureLoader([Users])` gating, `USERS.*` i18n.

---

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/management/users/routes/` | New | `user-list.tsx`, `user-create.tsx`, `user-edit.tsx` containers + tests |
| `app/management/users/components/` | New | `UserList`, `UserCreateForm`, `UserDetailsForm`, `UserCredentialsForm` + tests |
| `app/management/users/lib/services/user-http-service.ts` | New | thin functions over `apiClient` + tests |
| `app/routes.ts` | Modified | register 3 user routes |
| `app/shared/lib/i18n/es.ts` | Modified | add `USERS.*` namespace (~20-25 keys) |
| `app/auth/routes/loaders.ts` | No change | `adminFeatureLoader` reused as-is |

### Reused directly (no change)
`apiClient`, `useAuthStore` (role flags + `selectedStoreId`), `useOnlineStatus`, `adminFeatureLoader`,
`BaseRepository<T>` + `StorageKeys.entityKey`, `StoreUser` domain model, `ERoles.StoreUser`, `EFeatures.Users`.

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| List endpoint returns unexpected shape (legacy used `/users/all/true`) | Low | Decision OQ-U1 locks `GET /storeusers/list/true`; verify response in apply via service test |
| Backend rejects `change-password` without admin context | Low | oldPassword required is the known-supported contract (OQ-U2); surface backend error clearly |
| Create blocked when no `:storeId` available | Med | Guard: redirect to `/management/stores` when param missing (ported from Angular) |
| PR size borderline (~350-450 lines: 3 routes + 4 components + service + tests) | Med | Monitor at tasks; credentials form kept lean; chain/split decision deferred to tasks guard |

---

## Rollback Plan

The slice is additive and isolated under `app/management/users/`. To revert: remove the 3 route entries from
`app/routes.ts`, delete `app/management/users/`, and remove the `USERS.*` i18n keys from `es.ts`. No shared
loaders, domain models, or existing slices are modified, so removal cannot regress Stores or other features.

---

## Dependencies

- Stores slice shipped (archived) — provides the live `adminFeatureLoader` and the `:storeId` source for create.
- Backend `/v1/storeusers/*` and `/v1/users/*` contracts (all existing, no changes).

---

## Success Criteria

- [ ] 3 user routes render and are gated by `adminFeatureLoader([EFeatures.Users])`.
- [ ] List renders `StoreUser[]` from `/storeusers/list/true` with activate/deactivate working.
- [ ] Create posts to `/storeusers` with `roleIds: [3]`, requires `:storeId`, enforces password policy + confirm.
- [ ] Edit updates details (`PUT /users/:id`) and resets password (`POST /users/change-password/:id`, oldPassword required).
- [ ] No "New login" field anywhere (change-login out of scope).
- [ ] Offline: list reads cache (degraded), all writes blocked with clear error.
- [ ] Full test suite passes; build clean; architecture mirrors the Stores slice.
