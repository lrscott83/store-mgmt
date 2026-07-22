# Backend endpoints by role — Owner & StoreUser

Scope: which backend HTTP endpoints the **Owner (`OwnerAdmin`)** and **StoreUser** roles actually consume from the views and code of both frontends (Angular `frontend/` and React `frontend-react/`).

> **Key premise (still true today):** `USE_ONLINE_SERVICE = false`. Product / ProductCategory (and by extension Orders, Inventory, Expenses, Credits) are bound to the **offline** (localStorage) services. Therefore all Sales, Inventory, Expenses, Credits, Reports and Statistics views hit **NO backend endpoint** — they run entirely against local storage. The real backend surface for these roles is small and lives in auth, store/user management, and usage tracking.

---

## 1. Role model

`ERoles` (Angular `src/app/_shared/const/enums.ts`, React `packages/domain/src/enums/index.ts`):

| Role | Id |
|---|---|
| SuperAdmin | 1 |
| **OwnerAdmin ("Owner")** | 2 |
| **StoreUser** | 3 |
| ReSeller | 4 |

The session user (`UserModel`) exposes pre-resolved booleans `isSuperAdmin` / `isOwnerAdmin` / `isReSeller`, plus feature scoping data: `featureIds`, `roles: StoreModuleFeatures[]` (each with `storeId` + `featureIds`), `storeModuleIds`, and `selectedStoreId`.

## 2. Guard / authorization semantics

Authorization is **feature-based** and, for StoreUser, **scoped to the currently selected store**.

- `isUserAuthorize(features)` returns true if:
  - SuperAdmin → always;
  - ReSeller / OwnerAdmin → any of `features` is in `user.featureIds`;
  - StoreUser → any of `features` is in a `roles[]` entry whose `storeId === selectedStoreId`.

| Guard | Admits | Notes |
|---|---|---|
| `AuthGuard` | SuperAdmin, OwnerAdmin **unconditionally**; StoreUser/ReSeller only with the route feature (store-scoped) | Owner bypasses the feature check entirely |
| `AdminAuthGuard` | SuperAdmin, OwnerAdmin only (feature still checked) | **StoreUser → logout** |
| `SuperAdminAuthGuard` | SuperAdmin only | — |
| `ReSellerAuthGuard` | SuperAdmin or ReSeller | Owner/StoreUser rejected |

Denial always calls `logout()` and redirects to `/login` (there is no `/unauthorized` route).

> **Inconsistency:** `admin/owners*` is protected by `ReSellerAuthGuard`, so **Owner cannot reach the Owners admin screen** despite the naming. This is intentional (SuperAdmin/ReSeller manage owners).

## 3. Offline-first split (critical)

`GlobalConfig.USE_ONLINE_SERVICE = false` → factories bind:

- `PRODUCT_SERVICE` → `ProductOfflineService`
- `PRODUCT_CATEGORY_SERVICE` → `ProductCategoryOfflineService`

Orders, Inventory, Expenses and SaleCredits are consumed directly through their `*OfflineService` classes (localStorage). Consequence for **both roles**:

| View group | Backend endpoint? |
|---|---|
| Sales (products, sale, orders, credits, stats) | **No** (localStorage) |
| Inventory (available, entries, quantities, profit, egress) | **No** (localStorage) |
| Expenses | **No** (localStorage) |
| Credits | **No** (localStorage) |
| Reports (today) | **No** (computed locally) |
| Statistics (dashboard) | **No** (computed locally) |
| Synchronization (export/import) | **No** (encrypted-zip file transfer, not the API) |

`ProductOnlineService` / `ProductCategoryOnlineService` exist but are **dead code** while the flag is `false`.

---

## 4. Endpoints actually used, per role

Base path: `{apiUrl}/v1`. Auth token attached by an HTTP interceptor (`Authorization: Bearer <token>`).

### 4.1 Common to Owner and StoreUser

| Endpoint | Origin (view / code) |
|---|---|
| `POST /auth/login` | login |
| `GET /auth/me` | session bootstrap (`getUserByToken`) |
| `GET /auth/logout` | logout *(Angular only — see §6)* |
| `GET /auth/google-auth-url`, `POST /auth/get-social-token` | social login *(Angular only — see §6)* |
| `GET /stores/by-current-user` | store selector in the layout (`store-list`) |
| `POST /usages/store-daily-usage` | background usage tracking (`registerActivity`, login + app bootstrap) |
| `PUT /users/{id}` | `profile/edit` → edit own details |
| `POST /users/change-password/{id}` | `profile/change-password` |

> **StoreUser has no endpoint beyond this list.** Its entire day-to-day (sales, inventory, expenses) is local.

### 4.2 Owner-only (`management/*`, AdminAuthGuard)

| Endpoint | View |
|---|---|
| `GET /modules/ToStore` | Edit store |
| `GET /owners/all/...` | Edit store — owner picker, **only when `isOwnerAdmin`** |
| `GET /stores/{id}` · `POST /stores` · `PUT /stores/{id}` | View / create / edit store |
| `GET /users/all/true` | Users list |
| `DELETE /users/{id}` | Delete user |
| `POST /users/activate` | Activate / deactivate user |
| `GET /users/{id}` | Edit user |
| `POST /storeusers` | Create StoreUser |

`ConfigurationsComponent` is empty (0 endpoints). Owner registration (`POST /auth/register`) is the public sign-up prior to login.

---

## 5. Angular bugs / inconsistencies found

1. **`StoreUserService.deleteStoreUser`** builds `.../v1/storeusers{id}` **without a slash** (`API_URL + \`${id}\``). It hits a malformed URL.
2. **Double-slash URLs** in `ProductOnlineService` / `ProductCategoryOnlineService` (e.g. `/v1/Products//toEntry`, `/v1/ProductCategories//maxOrder`) — from `API_URL + '/' + suffix` over an already trailing-slash base. Currently harmless because these are dead code while the offline flag is on.
3. **`admin/owners`** guarded by `ReSellerAuthGuard` — Owner cannot reach "its" owners from there.
4. **`AdminAuthGuard` still checks the feature for admins**: an Owner missing the `Stores` / `Users` / `Configurations` feature is logged out (not a silent block — it forces `/login`).

---

## 6. React parity (`frontend-react/`, app `apps/web-store-pos`)

The React app is a near 1:1 port. Guards are implemented as React Router **loaders** instead of Angular guards.

| Aspect | React status | Detail |
|---|---|---|
| `ERoles` / `EFeatures` / `EModules` | **Matches** | `packages/domain/src/enums/index.ts`, same numbering |
| Feature authorization (`isUserAuthorized`, storeId scoping) | **Matches** | `app/shared/lib/auth/authorization-service.ts` |
| Guard chain | **Matches** | `app/auth/routes/loaders.ts`: `authLoader`, `featureLoader` (Owner/SuperAdmin bypass), `adminLoader`/`adminFeatureLoader`, `superAdminLoader`, `resellerLoader`/`resellerFeatureLoader`; denial → `logout()` + `/login` |
| **Offline split** `USE_ONLINE_SERVICE=false` | **Matches (preserved)** | `app/shared/lib/config/global-config.ts`; same online/offline factory; Sales/Inventory/Expenses/Credits/Reports/Statistics are 100% localStorage, zero backend calls |
| Per-role reachability | **Matches** | `management/*` = admin-only; StoreUser excluded from admin/management routes **and** from the sidebar (`menu-config.ts` filtered by `isUserAuthorized`) |
| `admin/owners` = SuperAdmin **or** ReSeller | **Matches (by design)** | `resellerFeatureLoader([EFeatures.Owners])`; documented in openspec phase-4 |

### React backend surface (complete, given offline-first)

API base URL: `import.meta.env['API_URL']` (axios, `app/shared/lib/http/api-client.ts`), configured at deploy time.

- **Auth:** `POST /v1/auth/login`, `POST /v1/auth/register`, `GET /v1/auth/me`
- **Stores:** `GET /v1/stores/by-current-user`, `GET /v1/stores/:id`, `POST /v1/stores`, `PUT /v1/stores/:id`, `POST /v1/stores/activate|approve|disapprove`, `GET /v1/modules/ToStore`, `GET /v1/owners/all/true` (owner-select)
- **Users / StoreUsers:** `GET /v1/users/all/true`, `GET /v1/users/:id`, `POST /v1/storeusers`, `PUT /v1/users/:id`, `POST /v1/users/activate`, `DELETE /v1/users/:id`
- **Profile:** `PUT /v1/users/:id`, `POST /v1/users/change-password/:id`
- **Owners (admin):** `GET /v1/owners/all/true`, `GET /v1/owners/:id`, `POST /v1/owners/`, `PUT /v1/owners/:id`, `DELETE /v1/owners/:id`
- **ReSellers (admin):** `GET /v1/reSellers/all/true`, `GET /v1/reSellers/:id`, `POST /v1/reSellers/`, `PUT /v1/reSellers/:id`
- **Features (admin):** `POST /v1/features/activate`
- **Usages:** `GET /v1/usages/stores-last-week`, `GET /v1/usages/stores-last-month`, `POST /v1/usages/store-daily-usage`

### Deliberate divergences vs Angular

- **No `/v1/auth/logout` and no social-login endpoint** in React — logout is client-side only. Note: Angular is *also* client-side for logout — it defines `AuthHttpService.logout()` (`GET /auth/logout`) but `AuthService.logout()` never calls it (dead code). Both frontends log out by clearing the token from `localStorage` + redirect to `/login`. See follow-up §8.
- **401 does not force logout** in React (offline-session authoritative); Angular logs out on 401.
- **Usage telemetry POST** uses `skipLoading` (no global overlay); Angular's interceptor always shows it.
- The Angular bugs from §5 are **not reproduced**: React uses `DELETE /v1/users/:id` (correctly slashed) and there is no `storeusers/:id` delete; the online double-slash URLs are normalized in the (still dead) online services.

### React gaps vs Angular

- No live/validated online path for Products/ProductCategory (reference-only code, never exercised due to the offline flag).
- No standalone `GET`/`DELETE /v1/storeusers/:id` at runtime — user list/edit/delete goes through `/v1/users/*` (the openspec draft had planned `/storeusers/:id`, but the shipped code uses `/users/*`).

---

## 8. Follow-ups to analyze in React (active work is here)

### 8.1 Logout is client-side only — no server-side session invalidation

**What happens today (React, `app/shared/lib/stores/auth-store.ts` `n()`, wired from `navbar.tsx` `handleLogout`):** logout just removes the auth token from `localStorage`, sets `user = null`, and redirects to `/login`. There is no backend call. This is consistent with the stateless / offline-first design (the session is a client-held token with `expiresIn`; the server keeps no session state).

**Why it matters / what to analyze:**
- The token is **not revoked server-side**. A leaked/intercepted token stays valid until `expiresIn`. Acceptable for an offline POS, but should be a conscious decision.
- Decide whether React needs a real server-side logout at all. If yes, it requires backend support (token blacklist / revocation) — not just re-adding a `GET /auth/logout` call. Angular's endpoint is a no-op stub, so there is nothing to "port".
- Confirm token lifetime (`expiresIn`) and whether any refresh mechanism exists; the shorter the TTL, the less the revocation gap matters.

**Verdict for now:** functionally correct (users can log out); flagged as a security/design item to revisit while React is the active codebase.
