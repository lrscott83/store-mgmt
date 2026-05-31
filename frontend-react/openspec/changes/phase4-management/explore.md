## Exploration: phase4-management

### Current State

**Scaffolded (exists, zero implementation):**
- `menu-config.ts` already declares the `MENU.MANAGEMENT` group with three entries:
  - `{ path: '/management/stores', featureIds: [EFeatures.Stores] }` — EFeatures.Stores = 73
  - `{ path: '/management/users', featureIds: [EFeatures.Users] }` — EFeatures.Users = 72
  - `{ path: '/management/configurations', featureIds: [EFeatures.Configurations] }` — EFeatures.Configurations = 74
- `es.ts` already has `MENU.STORES`, `MENU.USERS`, `MENU.CONFIGURATIONS`, and `MENU.MANAGEMENT` strings.
- `EModules.Management = 7` and EFeatures 72/73/74 are declared in the domain enum.
- `@store-mgmt/domain` already exports `Store`, `StoreUser`, `Module`, and `Feature` interfaces — all domain models required by the PRD are in place.
- `authorization-service.ts` has `adminLoader` (checks `isSuperAdmin || isOwnerAdmin`) and `isUserAuthorized` for feature-based access.

**Zero implementation:**
- No `/management/` routes registered in `app/routes.ts` — the menu items are ghost links.
- No `management/` slice directory exists anywhere under `app/`.
- No HTTP services for stores, users (management CRUD), or configurations.
- No localStorage cache layer for management entities.
- No i18n keys under `MANAGEMENT.*`, `STORES.*`, `USERS.*`, or `CONFIGURATIONS.*` namespaces.

**Existing infra reusable directly:**
- `apiClient` (Axios, Bearer token, 401 interceptor)
- `useAuthStore` → `user.isSuperAdmin`, `user.isOwnerAdmin`, `user.selectedStoreId`
- `useOnlineStatus` hook
- `featureLoader` + `adminLoader` — can be composed into `adminFeatureLoader`
- `BaseRepository<T>` + `StorageKeys.entityKey()` — localStorage read-cache pattern

---

### Affected Areas

- `frontend-react/apps/web-store-pos/app/routes.ts` — add 7 new management routes
- `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` — add management i18n keys
- `frontend-react/apps/web-store-pos/app/auth/routes/loaders.ts` — add `adminFeatureLoader`
- NEW: `app/management/` slice with three sub-slices (stores, users, configurations)

---

### PRD Scope (precise)

Seven routes, three sub-slices:

**1. Stores sub-slice** (EFeatures.Stores = 73, AdminAuthGuard)
- `/management/stores` — list
- `/management/stores/create` — create form
- `/management/stores/edit/:id` — edit form
- Domain: `Store` interface (already in `@store-mgmt/domain`)
- Online writes; offline read from localStorage cache

**2. Users sub-slice** (EFeatures.Users = 72, AdminAuthGuard)
- `/management/users` — list
- `/management/users/create/:storeId` — create form
- `/management/users/edit/:id` — edit container (details + credentials sub-components)
- Domain: `StoreUser` interface (already in `@store-mgmt/domain`)
- Online writes; offline read from localStorage cache

**3. Configurations sub-slice** (EFeatures.Configurations = 74, AdminAuthGuard)
- `/management/configurations` — dynamic settings page
- Domain: configuration model is backend-driven — no typed interface in domain yet (OQ-1)
- Online writes; offline read from localStorage cache

**AdminAuthGuard** = ALL of: authenticated + (isSuperAdmin OR isOwnerAdmin) + required feature present.
Existing `adminLoader` covers the role check; `featureLoader` covers feature check.
Recommendation: compose both into a new `adminFeatureLoader(featureIds)` factory.

---

### Approaches

| Approach | Description | Pros | Cons | Effort |
|----------|-------------|------|------|--------|
| A — Monolith slice | Single `management/` slice, one HTTP service, all 7 routes | Simple to start | God-service, hard to test per sub-domain, hard to deliver incrementally | Medium |
| B — Three sub-slices (recommended) | `management/stores/`, `management/users/`, `management/configurations/` each with own HTTP service, components, routes | Mirrors PRD sub-domain split, independent deliverability, focused PRs, matches profile/sync precedent | Slightly more folder structure | Medium-High (per sub-slice: Low) |
| C — Flat routes, shared service | All routes flat under `management/routes/`, one `managementHttpService` | Less folders | Mixes domain concerns, harder to maintain | Low-Medium |

**Recommendation: Approach B** — three independent sub-slices, each deliverable as a focused PR. Matches profile/sync precedent exactly.

---

### AdminAuthGuard Options

| Option | Description | Tradeoff |
|--------|-------------|----------|
| Compose two loaders inline | `loader = async (args) => (await adminLoader()) ?? (await featureLoader([F])(args))` | Simple, no new helper |
| `adminFeatureLoader(featureIds)` factory | New function in loaders.ts | DRY, reusable — preferred |
| Extend existing `featureLoader` | Add role check param | Risks regression on existing tested code |

Recommendation: `adminFeatureLoader(featureIds)` in `app/auth/routes/loaders.ts`.

---

### Open Questions (must resolve before/at proposal)

**OQ-1 — Configuration model**: PRD says configurations are backend-driven dynamic keys. Is there a TypeScript interface, or `Record<string, unknown>`? What are the actual config keys? Blocks `ConfigurationService` spec.

**OQ-2 — API endpoints**: Expected pattern:
- `GET/POST/PUT /v1/stores`, `GET /v1/stores/:id`
- `GET/POST/PUT /v1/users` (store-scoped), `GET /v1/users/:id`
- `GET/PUT /v1/configurations` (store-scoped)
Are these the actual backend routes? Need confirmation before speccing HTTP services.

**OQ-3 — OwnerAdmin scoping**: Does backend enforce store-scope server-side (frontend just passes `storeId`), or must frontend filter responses?

**OQ-4 — Offline write behavior**: Block with error (recommended, consistent with profile/sync) or queue? TBD in PRD — needs decision.

**OQ-5 — Module selection in store form**: `Store.modules: Module[]` is in domain. Should create/edit store form allow selecting modules, or is that super-admin-only and out of scope for this phase?

**OQ-6 — Delivery split**: 3 sub-slices likely exceed 400-line PR budget combined. Split into 3 PRs recommended. Confirmed?

---

### Reusable Assets

| Asset | Location | Reuse |
|-------|----------|-------|
| `apiClient` | `app/shared/lib/http/api-client.ts` | Import directly in new HTTP services |
| `useAuthStore` | `app/shared/lib/stores/auth-store.ts` | `selectedStoreId`, role flags |
| `useOnlineStatus` | `app/shared/lib/hooks/use-online-status.ts` | Write-blocking in all containers |
| `featureLoader` + `adminLoader` | `app/auth/routes/loaders.ts` | Compose into `adminFeatureLoader` |
| `BaseRepository<T>` | `app/shared/lib/storage/base-repository.ts` | Read-cache for stores, users, configs |
| `StorageKeys.entityKey` | `app/shared/lib/storage/storage-keys.ts` | Cache key generation |
| `Store`, `StoreUser`, `Module` models | `@store-mgmt/domain` | Direct use, no changes needed |
| `EFeatures.Stores/Users/Configurations` | `@store-mgmt/domain` | Direct use |
| `EModules.Management` | `@store-mgmt/domain` | Already in menu-config |

### Net-New

- `app/management/stores/routes/` (3 route modules with loaders)
- `app/management/stores/components/` (StoreListComponent, store form)
- `app/management/stores/lib/services/store-http-service.ts`
- `app/management/users/routes/` (3 route modules with loaders)
- `app/management/users/components/` (UserListComponent, CreateStoreUserComponent, EditUserDetailsComponent, EditUserCredentialsComponent)
- `app/management/users/lib/services/user-management-http-service.ts`
- `app/management/configurations/routes/` (1 route module)
- `app/management/configurations/components/`
- `app/management/configurations/lib/services/configuration-http-service.ts`
- `adminFeatureLoader` in `app/auth/routes/loaders.ts`
- i18n keys under MANAGEMENT / STORES / USERS / CONFIGURATIONS namespaces in es.ts
- 7 new route entries in `app/routes.ts`

### Ready for Proposal

Conditional Yes — OQ-1 (config model) and OQ-2 (API endpoints) must be resolved; OQ-4 (offline write) should be confirmed. OQ-3, OQ-5, OQ-6 can be decided at proposal time.
