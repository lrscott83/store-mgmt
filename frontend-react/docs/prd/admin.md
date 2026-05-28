# PRD: Admin Module — Platform Administration

**Product:** Vende De Todo POS  
**Migration:** Angular → React (offline-first PWA)  
**Module:** Platform Administration  
**Status:** Draft  
**Date:** 2026-05-27

---

## Overview

The Admin module provides platform-level administration capabilities for two distinct operator roles: **SuperAdmins** who govern the entire platform, and **Resellers** who manage their assigned store owners. These features operate exclusively online — they interact with server-side data and have no offline equivalent.

This module is distinct from the store-level POS modules. Users who reach these routes are not cashiers or inventory managers; they are platform operators. The UX should reflect that: dense, data-rich, optimized for management workflows.

---

## User Stories

### SuperAdmin

- As a SuperAdmin, I can see a dashboard overview of the entire platform (stores, owners, resellers, feature flags) so I understand platform health at a glance.
- As a SuperAdmin, I can list, search, and inspect all stores on the platform so I can assist owners and audit activity.
- As a SuperAdmin, I can list, create, and edit reseller accounts so I can grow the distribution network.
- As a SuperAdmin, I can manage feature flags and licenses so I can control which features are available to stores.
- As a SuperAdmin, I can list all store owners and manage their roles so I can handle escalations and permissions.

### Reseller

- As a Reseller, I can list, create, and edit the store owners assigned to me so I can onboard and support my clients.
- As a Reseller, I cannot access SuperAdmin routes (stores, resellers, features, roles dashboard) — those are outside my scope.

---

## Routes

### SuperAdmin Routes

Protected by `SuperAdminAuthGuard` (`isSuperAdmin === true` required).

| Path | Component | Feature Flag |
|------|-----------|--------------|
| `/admin/dashboard` | `AdminDashboardComponent` | `AdminDashboard` (16) |
| `/admin/stores` | `StoresComponent` | `AdminStores` (15) |
| `/admin/resellers` | `ResellersComponent` | `ReSellers` (13) |
| `/admin/resellers/create` | `CreateResellerComponent` | `ReSellers` (13) |
| `/admin/resellers/edit/:id` | `EditResellerComponent` | `ReSellers` (13) |
| `/admin/features` | `FeaturesComponent` | `Features` (14) |
| `/admin/roles` | `OwnersComponent` | `Roles` (12) |

### Reseller Routes

Protected by `ReSellerAuthGuard` (`isSuperAdmin === true` OR `isReSeller === true` + feature check).

| Path | Component | Feature Flag |
|------|-----------|--------------|
| `/admin/owners` | `OwnersComponent` | `Owners` (11) |
| `/admin/owners/create` | `CreateOwnerComponent` | `Owners` (11) |
| `/admin/owners/edit/:id` | `EditOwnerComponent` | `Owners` (11) |

---

## Components

### `AdminDashboardComponent`

Platform overview dashboard visible only to SuperAdmins. Displays aggregate metrics: total stores, active owners, reseller count, recent activity. Read-only summary — no mutation actions.

### `StoresComponent`

Paginated list of all stores across the platform. Supports search and filtering. SuperAdmin-only. Each row links to store details.

### `OwnersComponent`

Reused by two routes with different guards and contexts:

- Under `/admin/roles` (SuperAdmin): shows all owners platform-wide for role management.
- Under `/admin/owners` (Reseller): shows only owners belonging to that reseller.

The component must derive its data scope from the active guard context, not hard-coded logic.

### `CreateOwnerComponent`

Form to create a new store owner account. Used by Resellers (and optionally SuperAdmins). Collects owner identity, contact info, and initial module assignments. On success, redirects to `/admin/owners`.

### `EditOwnerComponent`

Container component for the owner edit flow. Hosts `EditOwnerDetailsComponent`. Fetches owner by `:id` param and passes data down. Handles save/cancel routing.

### `EditOwnerDetailsComponent`

The actual editing form for owner fields. Receives owner data as props. Emits save events upward to `EditOwnerComponent`.

### `OwnerDetailsComponent`

Read-only display of owner details. Used in view contexts where mutation is not permitted. Presentational only — no local state beyond display formatting.

### `ResellersComponent`

Paginated list of all resellers on the platform. SuperAdmin-only. Each row links to reseller edit.

### `CreateResellerComponent`

Form to create a new reseller account. Collects identity, contact info, and discount configuration. On success, redirects to `/admin/resellers`.

### `EditResellerComponent`

Container for the reseller edit flow. Hosts `EditResellerDetailsComponent`. Fetches reseller by `:id` param.

### `EditResellerDetailsComponent`

The editing form for reseller fields. Handles discount percentage and flat discount configuration alongside identity fields.

### `FeaturesComponent`

Lists all platform feature flags. Allows SuperAdmins to toggle `availableToStore` per feature. Changes affect store-level feature availability across the platform. High-impact — requires confirmation before mutations.

---

## Data Models

```typescript
interface OwnerStoreModule {
  storeName: string;
  storeModuleTotalCurrentPrice: number;
}

interface Owner extends AuditableBaseModel {
  id: string;
  userId: string;
  fullName: string;
  cellPhone: string;
  email: string;
  description: string;
  guest: boolean;
  storeModules: OwnerStoreModule[];
  reSellerId: string;
  reSellerName: string;
  approved: boolean;
}

interface ReSeller extends AuditableBaseModel {
  id: string;
  userId: string;
  fullName: string;
  percentDiscountPrice: number;
  discountPrice: number;
  cellPhone: string;
  email: string;
  description: string;
  guest: boolean;
}

interface Feature {
  id: number;
  name: string;
  moduleId: number;
  displayName: string;
  description: string;
  order: number;
  availableToStore: boolean;
}
```

`AuditableBaseModel` is assumed to include `createdAt`, `updatedAt`, and `createdBy` fields consistent with the rest of the platform models.

---

## Services

### `AdminService`

Handles all HTTP interactions for this module. Methods:

- `getDashboardStats(): Observable<DashboardStats>`
- `getStores(params: PaginationParams): Observable<PagedResult<Store>>`
- `getOwners(params: PaginationParams & { resellerId?: string }): Observable<PagedResult<Owner>>`
- `getOwnerById(id: string): Observable<Owner>`
- `createOwner(payload: CreateOwnerPayload): Observable<Owner>`
- `updateOwner(id: string, payload: UpdateOwnerPayload): Observable<Owner>`
- `getResellers(params: PaginationParams): Observable<PagedResult<ReSeller>>`
- `getResellerById(id: string): Observable<ReSeller>`
- `createReseller(payload: CreateResellerPayload): Observable<ReSeller>`
- `updateReseller(id: string, payload: UpdateResellerPayload): Observable<ReSeller>`
- `getFeatures(): Observable<Feature[]>`
- `updateFeature(id: number, payload: Partial<Feature>): Observable<Feature>`

All methods require a valid auth token. No caching layer — admin data must always be fresh.

---

## Guards

### `SuperAdminAuthGuard`

Implemented as a React route guard (HOC or loader pattern, consistent with the app's auth approach).

- Reads `isSuperAdmin` from the auth store.
- If `false` or unauthenticated: redirects to `/login`.
- No feature flag check — SuperAdmin access is role-only.

### `ReSellerAuthGuard`

- Allows access if `isSuperAdmin === true` OR (`isReSeller === true` AND the `Owners` feature flag (11) is enabled for this session).
- If neither condition is met: redirects to `/login` or an unauthorized page.

Both guards must be composable and testable in isolation. Do not embed auth logic inside page components.

---

## Online-Only Behavior

**All routes in this module require active network connectivity.** There is no offline fallback.

Implementation requirements:

- On mount, each admin page checks network status via the app's connectivity service.
- If offline: render a full-page "This section requires an internet connection" message. Do not show stale data.
- Do not cache any admin API responses in the service worker or IndexedDB.
- The service worker must explicitly exclude `/admin/*` API calls from any caching strategy.

This is a deliberate constraint, not a gap. Admin actions (creating owners, toggling features) have platform-wide consequences and must never operate on stale state.

---

## Permissions Matrix

| Action | SuperAdmin | Reseller | Owner | Unauthenticated |
|--------|-----------|----------|-------|-----------------|
| View dashboard | ✓ | ✗ | ✗ | ✗ |
| Manage stores | ✓ | ✗ | ✗ | ✗ |
| Manage resellers | ✓ | ✗ | ✗ | ✗ |
| Manage features | ✓ | ✗ | ✗ | ✗ |
| View all owners (roles) | ✓ | ✗ | ✗ | ✗ |
| Manage assigned owners | ✓ | ✓ | ✗ | ✗ |
| Create owner | ✓ | ✓ | ✗ | ✗ |
| Edit owner | ✓ | ✓ | ✗ | ✗ |

---

## Migration Notes from Angular

- `SuperAdminAuthGuard` and `ReSellerAuthGuard` were Angular route guards implementing `CanActivate`. In React, these become either route-level loader functions (React Router v6 loaders) or wrapper components. The auth logic itself is unchanged.
- `OwnersComponent` is reused across two route contexts in Angular. In React, prefer a single `OwnersPage` component that accepts a `scope` prop (`'platform' | 'reseller'`) to drive data fetching, rather than relying on route context magic.
- `EditOwnerComponent` / `EditResellerComponent` container pattern maps cleanly to React: container fetches data, passes to a controlled form child. No change in architecture.
- Feature flag IDs (11–16) are numeric constants from the Angular `EFeatures` enum. These should be typed as a union or enum in the React codebase for type safety.
