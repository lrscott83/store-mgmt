# PRD: Profile Module

## Overview

The Profile module allows any authenticated user to view and update their own account information and change their password. It is a personal settings area — not an administrative feature — and is accessible to all roles (cashiers, owners, admins).

This module is part of the React migration from the Angular version of the "Vende De Todo" POS app. Profile editing and password changes require online connectivity because they involve API calls. The profile view (read-only display of current user info) works offline using data from localStorage.

**Navigation note:** The profile section is accessed from the top-right navbar user dropdown menu. It does NOT appear in the sidebar navigation.

---

## User Stories

- As any authenticated user, I want to edit my name, phone number, and email so my profile stays up to date.
- As any authenticated user, I want to change my password so I can maintain account security.
- As any authenticated user, I want to see my current profile details even when offline.
- As a user on mobile, I want the profile forms to be simple and easy to fill out quickly.

---

## Routes

| Path                       | Component                  | EFeatures      | Guard     |
|----------------------------|----------------------------|----------------|-----------|
| `/profile/edit`            | EditProfileComponent       | Profile (70)   | AuthGuard |
| `/profile/change-password` | ChangePasswordComponent    | Profile (70)   | AuthGuard |

### Route Notes

- `AuthGuard` verifies the user is authenticated (valid token in localStorage).
- Feature 70 (Profile) is checked against the authenticated user's feature list.
- Both routes are reachable from the navbar user dropdown, not from the sidebar.
- If the user lacks Feature 70, redirect to an unauthorized page or the default landing route.

---

## Components

### EditProfileComponent

**Path:** `src/features/profile/pages/EditProfileComponent`

**Role:** Form page for editing the current user's profile details.

**Data source (read):** `currentUser` from localStorage — pre-fills form fields on mount.

**Fields:**
- Full name (required)
- Cell phone (optional)
- Email (optional, validated format)

**Behavior:**
- On mount: read `currentUser` from localStorage and populate form.
- On submit: call API to update user details. Requires online connectivity.
- On success: update `currentUser` in localStorage to reflect changes, show success feedback, optionally navigate back.
- On offline: disable the submit button and show an inline notice ("Editing your profile requires an internet connection").

---

### ChangePasswordComponent

**Path:** `src/features/profile/pages/ChangePasswordComponent`

**Role:** Form page for changing the current user's password.

**Fields:**
- Old password (required, masked)
- New password (required, masked, minimum length enforced)
- Confirm new password (required, must match new password)

**Behavior:**
- Validates that new password and confirm password match before submitting.
- On submit: call API to change password using the `Credentials` model. Requires online connectivity.
- On success: show success message. Consider logging the user out and redirecting to login (password change invalidates session — confirm with backend behavior).
- On error (wrong old password, API failure): show inline error without clearing the form.
- On offline: disable the submit button and show an inline notice ("Changing your password requires an internet connection").

---

## Data Models

```typescript
interface UserProfile {
  id: string;
  fullName: string;
  cellPhone: string;
  email: string;
  login: string;      // read-only in this context — displayed but not editable
  storeId: string;
  storeName: string;
  isActive: boolean;
}

interface Credentials {
  userId: string;
  oldPassword: string;
  newPassword: string;
}
```

`UserProfile` is read from `currentUser` in localStorage. The `Credentials` model is used only for the change-password API call and is never persisted locally.

---

## Online vs Offline Behavior

| Action                              | Online | Offline                                                        |
|-------------------------------------|--------|----------------------------------------------------------------|
| View current profile (read-only)    | API    | localStorage `currentUser` (full offline support)             |
| Edit profile (name, phone, email)   | API    | Blocked — disable form submit, show inline notice             |
| Change password                     | API    | Blocked — disable form submit, show inline notice             |

For offline detection, use `navigator.onLine` and listen to browser `online`/`offline` events. The UI should react in real-time: if a user goes offline while on the edit form, the submit button becomes disabled and the notice appears without requiring a page reload.

---

## Permissions

| Role            | Feature Required | Can Access Profile Routes |
|-----------------|------------------|---------------------------|
| SuperAdmin      | Profile (70)     | Yes                       |
| OwnerAdmin      | Profile (70)     | Yes                       |
| Cashier         | Profile (70)     | Yes, if feature assigned  |
| Unauthenticated | —                | No — redirected to login  |

All roles are expected to have Feature 70 by default, but the guard check is still enforced for consistency with the rest of the application's feature-gating pattern.

Each user can only edit their own profile. There is no admin override on these routes — use the Management module (`/management/users/edit/:id`) to edit other users' details.
