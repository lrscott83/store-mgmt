# PRD: Management Module

## Overview

The Management module provides store owners and super admins with tools to manage stores, users, and configurations. It is an administrative area — not accessible to regular cashiers or viewers.

This module is part of the React migration from the Angular version of the "Vende De Todo" POS app. Most actions in this module require online connectivity because they involve API calls (creating users, editing stores, changing configurations). However, previously loaded data can be cached in localStorage for offline display.

---

## User Stories

- As a super admin, I want to create and approve stores so new merchants can onboard.
- As a super admin, I want to edit store details and manage their assigned modules.
- As a store owner, I want to manage users in my own store so I can add, edit, or deactivate cashiers.
- As a store owner, I want to create user accounts for new employees with a specific store assignment.
- As a store owner, I want to edit a user's credentials so I can help them recover access.
- As a store owner, I want to configure store-level settings so the POS behaves correctly for my business.
- As any admin, I want to view lists and detail pages offline when data was previously loaded.

---

## Routes

| Path                                | Component                  | EFeatures            | Guard          |
|-------------------------------------|----------------------------|----------------------|----------------|
| `/management/stores`                | EditStoreComponent         | Stores (73)          | AdminAuthGuard |
| `/management/stores/create`         | EditStoreComponent         | Stores (73)          | AdminAuthGuard |
| `/management/stores/edit/:id`       | EditStoreComponent         | Stores (73)          | AdminAuthGuard |
| `/management/users`                 | UsersComponent             | Users (72)           | AdminAuthGuard |
| `/management/users/create/:storeId` | CreateStoreUserComponent   | Users (72)           | AdminAuthGuard |
| `/management/users/edit/:id`        | EditUserComponent          | Users (72)           | AdminAuthGuard |
| `/management/configurations`        | ConfigurationsComponent    | Configurations (74)  | AdminAuthGuard |

### AdminAuthGuard

`AdminAuthGuard` is a compound guard. Access is granted only when ALL of the following conditions are true:

1. User is authenticated (valid token in localStorage).
2. User role is `isSuperAdmin` OR `isOwnerAdmin`.
3. The required feature (72, 73, or 74) is present in the user's feature list.

Regular cashiers and viewers cannot access any `/management/*` route regardless of feature assignment.

---

## Components

### EditStoreComponent

**Path:** `src/features/management/pages/stores/EditStoreComponent`

**Role:** Multi-purpose container. Renders store list, create form, and edit form based on the current route.

**Behavior by route:**
- `/management/stores` → renders `StoreListComponent` inside
- `/management/stores/create` → renders an empty store form
- `/management/stores/edit/:id` → loads the store by ID and renders a pre-filled form

**Responsibilities:**
- Load store data from API (or localStorage cache if offline).
- Handle form submission (create/update) with API calls.
- Show loading, success, and error states.

---

### StoreListComponent

**Path:** `src/features/management/components/stores/StoreListComponent`

**Role:** Presentational list component used inside `EditStoreComponent`.

**Displays:** Store name, display name, owner, active status, approval status.

**Actions:** Edit button per row (navigates to `/management/stores/edit/:id`), create new store button.

---

### UsersComponent

**Path:** `src/features/management/pages/users/UsersComponent`

**Role:** Container page for user management. Loads user list for the current store context.

**Responsibilities:**
- Fetch users from API (or localStorage cache if offline).
- Render `UserListComponent`.
- Provide navigation to create and edit user routes.

---

### UserListComponent

**Path:** `src/features/management/components/users/UserListComponent`

**Role:** Reusable presentational list component.

**Displays:** Full name, login, email, phone, store, active status.

**Actions:** Edit button per row, create new user button.

**Reusability:** Can be composed inside `UsersComponent` or other admin views that need a user table.

---

### CreateStoreUserComponent

**Path:** `src/features/management/pages/users/CreateStoreUserComponent`

**Role:** Form page to create a new user assigned to a specific store.

**Route param:** `:storeId` — pre-fills the store association.

**Fields:** Full name, login, email, phone, initial password, role/permissions.

**Behavior:** Requires online connectivity. On success, redirect to `/management/users`.

---

### EditUserComponent

**Path:** `src/features/management/pages/users/EditUserComponent`

**Role:** Container for editing an existing user. Composes two sub-components.

**Sub-components:**
- `EditUserDetailsComponent` — edits name, phone, email, active status.
- `EditUserCredentialsComponent` — changes login and/or password.

Both sub-components can be shown as tabs or stacked sections within this page.

---

### EditUserDetailsComponent

**Path:** `src/features/management/components/users/EditUserDetailsComponent`

**Role:** Form for updating user profile details (non-credential fields).

**Fields:** Full name, cell phone, email, active status toggle.

**Behavior:** Requires online connectivity. Submits a PATCH/PUT to the users API.

---

### EditUserCredentialsComponent

**Path:** `src/features/management/components/users/EditUserCredentialsComponent`

**Role:** Form for updating a user's login or resetting their password.

**Fields:** New login (optional), new password, confirm new password.

**Behavior:** Requires online connectivity. Admin credential reset — does NOT require knowing the old password (admin privilege).

---

### ConfigurationsComponent

**Path:** `src/features/management/pages/configurations/ConfigurationsComponent`

**Role:** Page for store-level configuration settings.

**Behavior:** Loads current configuration from API or cache. Saves changes via API. Requires online connectivity to persist changes.

**Scope:** Configuration details are store-specific and determined by the backend. This component renders settings dynamically based on available configuration keys.

---

## Data Models

```typescript
interface Store {
  id: string;
  name: string;
  displayName: string;
  ownerId: string;
  ownerName: string;
  address: string;
  description: string;
  approved: boolean;
  paymentStartDate: Date;
  modules: Module[];
  isActive: boolean;
}

interface StoreUser {
  id: string;
  storeId: string;
  storeName: string;
  login: string;
  fullName: string;
  cellPhone: string;
  email: string;
  isActive: boolean;
}

interface Module {
  id: number;
  name: string;
  price: number;
  currentPrice: number;
  priceIncluded: boolean;
  discountText: string;
  selected: boolean;
}
```

---

## Services

| Service                  | Responsibility                                               |
|--------------------------|--------------------------------------------------------------|
| `StoreService`           | CRUD operations for stores via API; cache to localStorage    |
| `UserManagementService`  | CRUD operations for store users via API; cache to localStorage |
| `ConfigurationService`   | Read and write store configurations via API; cache to localStorage |

All services should:
1. Attempt the API call first when online.
2. Fall back to localStorage cache for read operations when offline.
3. Write operations when offline: queue the change and notify the user that it will sync when online (or block and show an error — TBD per implementation).

---

## Online vs Offline Behavior

| Action                          | Online | Offline                                              |
|---------------------------------|--------|------------------------------------------------------|
| View store list                 | API    | localStorage cache (read-only)                       |
| Create store                    | API    | Blocked — show "requires internet connection" notice |
| Edit store details              | API    | Blocked — show "requires internet connection" notice |
| View user list                  | API    | localStorage cache (read-only)                       |
| Create user                     | API    | Blocked — show "requires internet connection" notice |
| Edit user details               | API    | Blocked — show "requires internet connection" notice |
| Change user credentials         | API    | Blocked — show "requires internet connection" notice |
| View configurations             | API    | localStorage cache (read-only)                       |
| Save configurations             | API    | Blocked — show "requires internet connection" notice |

The app should detect online/offline status via the browser's `navigator.onLine` and the `online`/`offline` events, and surface a global or inline banner when the user tries to perform a write action while offline.

---

## Permissions

| Role            | Features Available                     | Access                                          |
|-----------------|----------------------------------------|-------------------------------------------------|
| SuperAdmin      | Stores (73), Users (72), Config (74)  | Full access to all management routes            |
| OwnerAdmin      | Stores (73), Users (72), Config (74)  | Access scoped to their own store                |
| Cashier/Viewer  | None                                   | No access — AdminAuthGuard redirects            |
| Unauthenticated | None                                   | No access — redirected to login                 |

OwnerAdmin users should only see and manage users and configuration for their own store. API-level enforcement is assumed; the frontend should also filter and scope requests to `storeId` from `currentUser`.
