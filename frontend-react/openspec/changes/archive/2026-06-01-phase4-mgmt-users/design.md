# Design: phase4-mgmt-users (Users sub-domain, 2 of 3 Management slice)

## Technical Approach

Mirror the shipped Stores slice EXACTLY: container/presentational split, three layers
(route container → pure presentational → thin Axios http-service over `apiClient` returning
`BaseResponseModel<T>` and unwrapping `.data`). New self-contained slice under
`app/management/users/`. The ONLY files touched outside the slice are `app/routes.ts`
(3 route entries) and `shared/lib/i18n/es.ts` (USERS.* namespace). The `management/` parent
dir already exists from Stores.

Key divergence from Stores: the **edit page stacks two independent sub-forms** — `UserDetailsForm`
and `UserCredentialsForm` — each with its own submit handler and error state. Create uses a
distinct `UserCreateForm` (login + password + confirm) that shares NO form shape with edit-details.
`adminFeatureLoader([EFeatures.Users])` is REUSED — no new factory (ADR D2 from Stores already shipped it).

## Directory layout

```
app/management/users/
  routes/
    user-list.tsx            container: list, online-gate, write-through cache, lifecycle, nav
    user-create.tsx          container: storeId guard, fetch nothing, UserCreateForm submit
    user-edit.tsx            container: getById hydrate, STACKS UserDetailsForm + UserCredentialsForm
    __tests__/user-routes.test.tsx
  components/
    user-list.tsx            presentational: table + activate/deactivate + edit/create nav
    user-create-form.tsx     presentational: storeId,fullName,login,password,confirm,cellPhone,email
    user-details-form.tsx    presentational: fullName,cellPhone,email,isActive(role-gated)
    user-credentials-form.tsx presentational: oldPassword(req),newPassword,confirm
    __tests__/{user-list,user-create-form,user-details-form,user-credentials-form}.test.tsx
  lib/services/
    user-http-service.ts
    __tests__/user-http-service.test.ts
```

## Component breakdown & props contracts

**UserListPage** (container): online → `listUsers()` + write-through `BaseRepository<StoreUser>('storeusers',[])`
keyed `StorageKeys.entityKey('storeusers', selectedStoreId)`; offline → read cache + `isDegraded`.
`handleLifecycleAction(action, id)` refetches after activate/deactivate (mirror Stores). Renders `UserList`.

**UserCreatePage** (container): guard — `storeId = user?.selectedStoreId`; if missing → `navigate('/management/stores')`.
No catalog fetch. `handleSubmit` → `createUser({storeId,fullName,login,password,cellPhone,email,roleIds:[3]})` → nav to `/management/users`.

**UserEditPage** (container): hydration — `useEffect` `getUser(id)` into `user` state; **form does not mount until `user` is set** (render LOADING then forms), same lesson as `StoreEditPage` lines 120-127. `id = paramId ?? selectedStoreId`. Two handlers: `handleDetailsSubmit` → `updateUserDetails(id,{fullName,cellPhone,email,isActive})`; `handlePasswordSubmit` → `changePassword(id,{oldPassword,newPassword})`. Each form owns its own `error`/`isLoading`.

| Component | Props |
|-----------|-------|
| `UserList` | `users: StoreUser[]; isOnline; isDegraded; error?; onCreate(); onEdit(id); onActivate(id); onDeactivate(id)` |
| `UserCreateForm` | `isOnline; isLoading; onSubmit(values); error?` — values: `{fullName,login,password,cellPhone,email}` (storeId injected by container) |
| `UserDetailsForm` | `initialValues?: Partial<StoreUser>; isOnline; isLoading; canToggleActive: boolean; onSubmit(values); error?` — values: `{fullName,cellPhone,email,isActive}` |
| `UserCredentialsForm` | `isOnline; isLoading; onSubmit(values); error?` — values: `{oldPassword,newPassword}` |

Validation in presentationals (mirror StoreForm): required-field guards via `setValidationError`;
password regex `(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}` + frontend confirm match in create + credentials forms. cellPhone required, email optional. `isActive` toggle only rendered when `canToggleActive` (super-admin/owner-admin).

## userHttpService (paths rel /v1, envelope, `.data` returned)

| Method | Verb / Path | Payload | Returns |
|--------|-------------|---------|---------|
| `listUsers` | GET `/storeusers/list/true` | — | `StoreUser[]` |
| `getUser` | GET `/storeusers/:id` | — | `StoreUser` |
| `createUser` | POST `/storeusers` | `{storeId,fullName,login,password,cellPhone,email,roleIds:[3]}` | `boolean` |
| `updateUserDetails` | PUT `/users/:id` | `{id,fullName,cellPhone,email,isActive}` | `boolean` |
| `activateUser` | POST `/users/activate` | `{id,isActive:true}` | `boolean` |
| `deactivateUser` | DELETE `/users/:id` | — | `boolean` |
| `changePassword` | POST `/users/change-password/:id` | `{oldPassword,newPassword}` | `boolean` |

No `change-login` (OQ-U3, no backend endpoint).

## Data flow

```
UserListPage ──online──> userHttpService.listUsers ──> setUsers + repo.save (write-through)
     │  offline──> repo.getAll(storeId) ──> setUsers + isDegraded banner
     └─ activate/deactivate ──> action() ──> refetch listUsers ──> setUsers + repo.save

UserCreatePage ─guard storeId─> UserCreateForm.onSubmit ──> createUser(roleIds:[3]) ──> nav /management/users

UserEditPage ─getUser(id)─> [LOADING until user set] ──> mount two forms
     ├─ UserDetailsForm.onSubmit ──> updateUserDetails(id,...)   (own error/loading)
     └─ UserCredentialsForm.onSubmit ──> changePassword(id,...)  (own error/loading)
```

## Architecture Decisions (ADR)

| ID | Decision | Alternatives rejected | Rationale |
|----|----------|-----------------------|-----------|
| DU1 | Mirror Stores container/presentational + 3 layers | reinvent structure | Consistency, proven, archived precedent |
| DU2 | Reuse `adminFeatureLoader([EFeatures.Users])` | new factory / inline | Factory already shipped by Stores (D2); zero new auth surface |
| DU3 | Edit = TWO stacked independent sub-forms, each own submit/error/loading | single merged form | Different concerns (PII vs credentials), independent failures, mirrors legacy split |
| DU4 | Create form distinct from edit-details (no shared shape) | shared StoreForm-style component w/ flags | create has login+pwd+confirm; edit-details has none — flags would bloat |
| DU5 | Password: oldPassword REQUIRED, no admin bypass | admin reset endpoint | No backend endpoint (OQ-U2); avoid inventing contract |
| DU6 | List offline = cache-read degraded; writes blocked via `useOnlineStatus` | offline write queue | Out of scope (#204); mirror Stores D7 |
| DU7 | Write-through cache on online list + refetch after lifecycle | full upsert merge | List returns full `StoreUser[]`; simpler than Stores D6 (no boolean-merge needed) |
| DU8 | Create guard: missing `selectedStoreId` → redirect `/management/stores` | render error inline | User must belong to a store; redirect matches proposal |
| DU9 | UserEditPage gates form mount on async `user` (LOADING state) | mount form w/ empty initialValues | Hydration lesson from StoreEditPage 120-127 — useState init runs once, empty initialValues never re-hydrate |

## Cache

`BaseRepository<StoreUser>('storeusers', [])` — no Date fields to revive (StoreUser has none).
Key `StorageKeys.entityKey('storeusers', selectedStoreId)`. Read cache only offline; write-through after online list/refetch.

## Route registration (app/routes.ts, after Management — Stores block)

```ts
route('management/users', 'management/users/routes/user-list.tsx'),
route('management/users/create', 'management/users/routes/user-create.tsx'),
route('management/users/:id/edit', 'management/users/routes/user-edit.tsx'),
```

`EFeatures.Users=72` gating via each route's `adminFeatureLoader`.

## i18n

New `USERS.*` namespace in `es.ts` (MENU.USERS/MENU.MANAGEMENT exist). ~24 keys: titles
(LIST/CREATE/EDIT), field labels (FULL_NAME, LOGIN, PASSWORD, CONFIRM, OLD_PASSWORD, NEW_PASSWORD,
CELL_PHONE, EMAIL, IS_ACTIVE, STORE), actions (CREATE/EDIT/SAVE/SAVING/ACTIVATE/DEACTIVATE/CHANGE_PASSWORD),
success/error, offline notice, degraded notice, empty state, validation (REQUIRED/PASSWORD_POLICY/PASSWORD_MISMATCH).
Rioplatense tone matching STORES.*.

## TDD build sequence (RED → GREEN)

1. `user-http-service.test.ts` (verb/path/payload/`.data`, esp. `/storeusers/list/true` not `/users/all/true`) → impl service
2. `user-create-form.test.tsx` (required fields, pwd regex, confirm match, offline notice, payload) → impl
3. `user-details-form.test.tsx` (fullName req, isActive gated by canToggleActive, payload) → impl
4. `user-credentials-form.test.tsx` (oldPassword req, newPassword regex, confirm match) → impl
5. `user-list.test.tsx` (rows, degraded banner, empty, activate/deactivate disabled offline) → impl
6. `user-routes.test.tsx` (list online/offline; create success+nav / missing-storeId redirect / error / offline; edit hydrate-then-mount, details submit, password submit, two independent errors) → impl containers
7. Wire `app/routes.ts` + `es.ts`

Test harness = Stores' `vi` mocks (auth-store, user-http-service, useOnlineStatus, react-router, loaders) + real `IntlProvider` with `es`. Reuse `makeUser`/factory pattern; add `makeStoreUser`.

## Spec traceability

| Spec requirement | Design element |
|------------------|----------------|
| 3 routes render, admin+feature gated | routes.ts entries + `adminFeatureLoader([Users])` (DU2) |
| List StoreUser[] + activate/deactivate | UserListPage + UserList + listUsers/activate/deactivate (DU7) |
| Create against store roleIds:[3] | UserCreatePage guard (DU8) + UserCreateForm + createUser (DU4) |
| Edit details + password reset | UserEditPage two sub-forms (DU3) + updateUserDetails + changePassword (DU5) |
| Offline read-cache + block writes | DU6 + BaseRepository + useOnlineStatus |
| Hydration correctness | DU9 LOADING gate |

## Migration / Rollout

No migration. Additive/isolated. Rollback: remove 3 routes from `app/routes.ts`, delete `app/management/users/`, remove `USERS.*` keys.

## Open Questions

None blocking. (OQ-U1 list path, OQ-U2 oldPassword, OQ-U3 no change-login all resolved in proposal/decisions #215.)
