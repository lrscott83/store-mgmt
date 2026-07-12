# Auth Module — Product Requirements Document

**App:** Vende De Todo (POS PWA for small businesses)  
**Module:** Authentication & Authorization  
**Migration:** Angular → React  
**Date:** 2026-05-27

---

## 1. Overview

The Auth module handles all identity concerns for the Vende De Todo PWA: login, registration, session persistence, token management, and route-level authorization.

The app is designed for **offline-first operation**. Once authenticated, users can work without internet connectivity for up to **35 days**. Login and registration are the only features that require an active connection to the API.

On startup the app reads session state from `localStorage`. If a valid, non-expired token exists, the user is considered authenticated immediately — no network round trip needed. A background call to `GET /v1/auth/me` refreshes user data when the device is online, but never blocks rendering.

All outbound HTTP requests automatically carry a `Bearer` token injected by an Axios interceptor (or equivalent fetch wrapper) that reads from `localStorage`.

---

## 2. User Stories

### Authentication

| ID | As a… | I want to… | So that… |
|----|-------|------------|----------|
| AUTH-01 | Store user | Log in with email/phone and password | I can access the POS |
| AUTH-02 | Store user | Stay logged in for 35 days without internet | I can keep working offline |
| AUTH-03 | Store user | Be automatically logged out when my session expires | Unauthorized access is prevented |
| AUTH-04 | Store user | Register a new account | I can onboard my business |
| AUTH-05 | Store user | See a clear error when login fails | I know what went wrong |
| AUTH-06 | Store user | See a message when I'm offline and try to log in | I understand why login is unavailable |

### Authorization

| ID | As a… | I want to… | So that… |
|----|-------|------------|----------|
| AUTH-07 | Super admin | Access all modules and features | I can manage the entire platform |
| AUTH-08 | Owner admin | Access features assigned to my account | I can manage my stores |
| AUTH-09 | Reseller | Access features assigned to my reseller account | I can manage my client stores |
| AUTH-10 | Store user | Only see features my role permits for my store | I have a clean, role-scoped experience |
| AUTH-11 | Store user | Be warned before leaving a form with unsaved changes | I don't accidentally lose work |

---

## 3. Routes

| Path | Guard | Layout | Component |
|------|-------|--------|-----------|
| `/login` | `guestOnly` (redirect to `/` if already authenticated) | `AuthLayout` | `LoginPage` |
| `/register` | `guestOnly` | `AuthLayout` | `RegisterPage` |
| `/` | `authLoader` | `AppLayout` | Dashboard (redirect to default store module) |
| `/:storeId/*` | `authLoader` + `featureLoader` | `AppLayout` | Store module pages |
| `/admin/*` | `adminLoader` | `AppLayout` | Admin pages |
| `/reseller/*` | `resellerLoader` | `AppLayout` | Reseller pages |

### Loader behavior (React Router v6 loaders replace Angular guards)

- **`guestOnly`**: If `authService.isAuthenticated()` returns `true`, redirect to `/`.
- **`authLoader`**: If not authenticated, redirect to `/login`. Optionally check feature access.
- **`featureLoader`**: Extend `authLoader` — also verify the user holds the required `featureIds` for the target route.
- **`adminLoader`**: Require `isSuperAdmin || isOwnerAdmin`.
- **`resellerLoader`**: Require `isSuperAdmin || isReSeller`.

All loaders are synchronous against in-memory state (no network calls). They read from `authStore` (Zustand or Context).

---

## 4. Components

### `LoginPage`

Full-page login form. Handles online/offline detection before submission.

**Responsibilities:**
- Render email/phone + password fields
- Validate inputs (non-empty; basic email/phone format)
- Check connectivity before calling the login API; show an offline banner if unreachable
- Display API error messages (invalid credentials, account inactive, etc.)
- On success, redirect to the previous route or `/`

**Props:** none (reads auth context internally)

---

### `RegisterPage`

Full-page registration form.

**Responsibilities:**
- Collect full name, email, phone, and password (with confirmation)
- Validate inputs client-side before submission
- Check connectivity (registration requires online)
- Display success message or redirect to `/login` on completion
- Surface API validation errors per field

---

### `AuthLayout`

Wrapper layout for unauthenticated pages (`/login`, `/register`).

**Responsibilities:**
- Center the form card on screen
- Render the app logo and branding
- Provide no navigation chrome (no sidebar, no top bar)

---

### `OfflineBanner`

Inline informational component displayed when a feature requires connectivity but the device is offline.

**Props:**
```ts
interface OfflineBannerProps {
  message?: string; // defaults to a generic "requires internet connection" message
}
```

---

### `SessionExpiryDialog`

Modal shown when a token expiry is detected mid-session (app was left open past 35 days).

**Responsibilities:**
- Inform the user the session has expired
- Provide a "Log in again" CTA
- Prevent interaction with the rest of the app until dismissed

---

### `UnsavedChangesDialog`

Confirmation dialog triggered by the `dirtyFormGuard` when navigating away from a form with unsaved changes.

**Responsibilities:**
- Present three options: **Save**, **Discard**, **Cancel**
- Block navigation until the user resolves the dialog

**Props:**
```ts
interface UnsavedChangesDialogProps {
  onSave: () => Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
}
```

---

### `RequireFeature`

Wrapper component for conditional rendering based on feature access. Use inside pages to show/hide UI sections.

**Props:**
```ts
interface RequireFeatureProps {
  featureIds: number[];
  storeId?: string;       // if omitted, checks owner/reseller-level features
  children: ReactNode;
  fallback?: ReactNode;   // rendered when access is denied; defaults to null
}
```

---

## 5. Data Models

```ts
// Raw API response wrapper
interface BaseResponseModel<T> {
  data: T;
  success: boolean;
  message: string;
  errors?: string[];
}

// Returned by POST /v1/auth/login
interface AuthModel {
  login: string;
  authToken: string;
  refreshToken: string;
  expiresIn: number; // Unix timestamp — client overrides this to Date.now() + 35 days
}

// Full user profile returned by GET /v1/auth/me and stored locally
interface UserModel extends AuthModel {
  id: string;
  fullName: string;
  cellPhone: string;
  email: string;
  isActive: boolean;
  password: string; // not used client-side after login; included in model for API parity
  roles: StoreModuleFeatures[];
  featureIds: number[];        // reseller/owner-level flat feature list
  storeModuleIds: number[];    // modules available to this user
  isSuperAdmin: boolean;
  isOwnerAdmin: boolean;
  isReSeller: boolean;
  selectedStoreId: string;
}

// Role entry scoped to a specific store
interface StoreModuleFeatures {
  storeId: string;
  storeName: string;
  moduleId: number;
  featureIds: number[];
}

// Login form payload
interface LoginRequest {
  login: string;    // email or phone
  password: string;
}

// Registration form payload
interface RegisterRequest {
  fullName: string;
  login: string;
  email: string;
  cellPhone: string;
  password: string;
  storeName: string;
  code?: string;
}
```

---

## 6. Services

### `AuthService` (business logic layer)

Orchestrates authentication state. Does not talk to HTTP directly — delegates to `AuthHttpService` and `StorageService`.

```ts
interface AuthService {
  // Initialize on app startup: read localStorage, validate expiry, set state
  initialize(): void;

  // POST /v1/auth/login — requires online
  login(credentials: LoginRequest): Promise<UserModel>;

  // POST /v1/auth/register — requires online
  register(payload: RegisterRequest): Promise<boolean>;

  // Clear session data and redirect to /login
  logout(): void;

  // Non-blocking: GET /v1/auth/me, update stored user if online
  refreshUserInBackground(): void;

  // Returns true if localStorage has a non-expired token
  isAuthenticated(): boolean;

  // Returns the current user from in-memory state (null if not authenticated)
  getCurrentUser(): UserModel | null;

  // Checks role hierarchy to determine feature access
  isUserAuthorized(featureIds: number[], storeId?: string): boolean;
}
```

**Key behavior — token expiry override:**  
After a successful login the server's `expiresIn` is DISCARDED. The client always sets:
```ts
authModel.expiresIn = Date.now() + 35 * 24 * 60 * 60 * 1000;
```
This enables offline use for 35 days regardless of the server-issued token lifetime.

**Startup flow:**
1. Read `localStorage['{appVersion}-authf496fc5a9f17']` → parse as `UserModel`
2. If missing or `user.expiresIn < Date.now()` → call `logout()`
3. Otherwise → set user in state immediately (synchronous, no render block)
4. If online → call `refreshUserInBackground()` (fire-and-forget)

---

### `AuthHttpService` (HTTP layer)

Thin wrapper around API calls. Returns typed responses. No business logic.

```ts
interface AuthHttpService {
  login(credentials: LoginRequest): Promise<BaseResponseModel<AuthModel>>;
  register(payload: RegisterRequest): Promise<BaseResponseModel<boolean>>;
  getMe(): Promise<BaseResponseModel<UserModel>>;
}
```

All requests include the `Authorization: Bearer <token>` header via a global HTTP interceptor (see Section 8 — Security Considerations).

---

### `AuthorizationService` (role/feature checks)

Pure logic service. Stateless — receives user and evaluates access.

```ts
interface AuthorizationService {
  // Core check used by guards and RequireFeature component
  isUserAuthorized(user: UserModel, featureIds: number[], storeId?: string): boolean;

  // Convenience helpers
  isSuperAdmin(user: UserModel): boolean;
  isOwnerAdmin(user: UserModel): boolean;
  isReSeller(user: UserModel): boolean;
}
```

**Authorization hierarchy:**
1. **SuperAdmin** (`isSuperAdmin === true`) — always authorized, bypasses all feature checks
2. **ReSeller** (`isReSeller === true`) — check `user.featureIds` contains ALL required feature IDs
3. **OwnerAdmin** (`isOwnerAdmin === true`) — check `user.featureIds` contains ALL required feature IDs
4. **Store user** — find the matching entry in `user.roles` where `role.storeId === storeId`, then check `role.featureIds` contains ALL required feature IDs

---

### `StorageService` (localStorage abstraction)

Isolates direct `localStorage` access. Enables easy mocking in tests.

```ts
interface StorageService {
  getToken(): string | null;
  setToken(token: string): void;
  removeToken(): void;

  getUser(appVersion: string): UserModel | null;
  setUser(appVersion: string, user: UserModel): void;
  removeUser(appVersion: string): void;

  clear(): void; // removes all auth-related keys
}
```

---

### `ConnectivityService`

Determines whether the device can reach the API. Used before login and register calls.

```ts
interface ConnectivityService {
  // Sends a lightweight ping to the API base URL
  isOnline(): Promise<boolean>;

  // Returns the last known connectivity state (cached, synchronous)
  getCachedStatus(): boolean;
}
```

Implementation note: "online" means the API is reachable, NOT just `navigator.onLine`. Use a HEAD or GET request to a known lightweight endpoint (e.g., `GET /v1/health`) with a short timeout (2–3 seconds).

---

## 7. Guards

React Router v6 uses **loaders** for route protection. Guards are implemented as loader functions that return a `redirect()` or `null`.

### `authLoader`

```ts
// loader for any authenticated route
export async function authLoader(): Promise<Response | null> {
  const user = authService.getCurrentUser();
  if (!user || !authService.isAuthenticated()) {
    return redirect('/login');
  }
  return null;
}
```

### `featureLoader(requiredFeatureIds, storeIdParam?)`

```ts
// higher-order loader factory
export function featureLoader(
  requiredFeatureIds: number[],
  storeIdParam?: string
) {
  return async ({ params }: LoaderFunctionArgs): Promise<Response | null> => {
    const user = authService.getCurrentUser();
    if (!user || !authService.isAuthenticated()) return redirect('/login');
    const storeId = storeIdParam ?? params.storeId;
    if (!authorizationService.isUserAuthorized(user, requiredFeatureIds, storeId)) {
      return redirect('/unauthorized');
    }
    return null;
  };
}
```

### `adminLoader`

```ts
export async function adminLoader(): Promise<Response | null> {
  const user = authService.getCurrentUser();
  if (!user || !authService.isAuthenticated()) return redirect('/login');
  if (!user.isSuperAdmin && !user.isOwnerAdmin) return redirect('/unauthorized');
  return null;
}
```

### `resellerLoader`

```ts
export async function resellerLoader(): Promise<Response | null> {
  const user = authService.getCurrentUser();
  if (!user || !authService.isAuthenticated()) return redirect('/login');
  if (!user.isSuperAdmin && !user.isReSeller) return redirect('/unauthorized');
  return null;
}
```

### `guestOnlyLoader`

```ts
export async function guestOnlyLoader(): Promise<Response | null> {
  if (authService.isAuthenticated()) return redirect('/');
  return null;
}
```

### Dirty Form Guard (`useUnsavedChangesPrompt`)

Because React Router v6 deprecated `useBlocker` in some versions and re-added it later, implement this as a hook that uses `useBlocker` (v6.4+):

```ts
// Hook usage in a form component
useUnsavedChangesPrompt(isDirty);
// Shows UnsavedChangesDialog when isDirty === true and user attempts navigation
```

---

## 8. Offline Behavior

### Features that work offline (no connectivity required)

| Feature | Condition |
|---------|-----------|
| Access any route | Valid, non-expired token in localStorage |
| View all POS data | Data previously cached in localStorage / IndexedDB |
| Create/edit transactions | Queued locally; synced when online |
| Role-based UI rendering | Evaluated against locally stored UserModel |
| Session expiry check | Evaluated against locally stored `expiresIn` |

### Features that require online connectivity

| Feature | Reason |
|---------|--------|
| Login | Credential verification happens server-side |
| Register | Account creation is server-side |
| Background user refresh (`GET /v1/auth/me`) | Network call; silently skipped when offline |

### Offline UX rules

- Login page: check `ConnectivityService.isOnline()` on submit. If offline, show `OfflineBanner` and do not attempt the API call.
- Register page: same as login.
- All other pages: do not gate on connectivity — the app must work offline.
- The background `GET /v1/auth/me` call on startup must be wrapped in a try/catch and silently discarded on network failure. It MUST NOT block app initialization or display any error.

### Session expiry while offline

If the user opens the app after 35 days without connectivity, the token is expired. The app:
1. Detects expiry on startup (`expiresIn < Date.now()`)
2. Calls `authService.logout()` (clears localStorage)
3. Redirects to `/login`
4. Shows `SessionExpiryDialog` or an inline message explaining the session expired

---

## 9. localStorage Schema

| Key | Type | Description |
|-----|------|-------------|
| `token` | `string` | Raw JWT token. Read by the HTTP interceptor for every API call. |
| `{appVersion}-authf496fc5a9f17` | `UserModel` (JSON) | Full user model including overridden `expiresIn`. The `{appVersion}` prefix is the running app version string (e.g., `1.0.0-authf496fc5a9f17`). |

### `UserModel` stored shape (example)

```json
{
  "login": "user@example.com",
  "authToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 1780000000000,
  "id": "abc123",
  "fullName": "Jane Doe",
  "cellPhone": "+5491112345678",
  "email": "user@example.com",
  "isActive": true,
  "roles": [
    {
      "storeId": "store-001",
      "storeName": "Sucursal Centro",
      "moduleId": 3,
      "featureIds": [101, 102, 105]
    }
  ],
  "featureIds": [],
  "storeModuleIds": [3],
  "isSuperAdmin": false,
  "isOwnerAdmin": false,
  "isReSeller": false,
  "selectedStoreId": "store-001"
}
```

### Notes

- `expiresIn` is always stored as a Unix timestamp in milliseconds (client-overridden).
- Never store the plain `password` field in localStorage even though it exists on `UserModel`. The password field in `UserModel` is for API parity only — populate it as empty string `""` before persisting.
- The `appVersion` prefix on the user storage key forces a fresh login when the app updates, preventing stale model shape mismatches.

---

## 10. API Endpoints

### POST `/v1/auth/login`

Authenticate a user with email/phone and password.

**Request:**
```json
{
  "login": "user@example.com",
  "password": "s3cr3t"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "login": "user@example.com",
    "authToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 1748400000
  }
}
```

**Client post-processing:** Override `data.expiresIn` with `Date.now() + 35 * 24 * 60 * 60 * 1000` before storing.

**Error responses:**

| HTTP Status | Scenario |
|-------------|----------|
| 400 | Missing or malformed fields |
| 401 | Invalid credentials |
| 403 | Account inactive |
| 503 | Server unavailable (offline scenario) |

---

### POST `/v1/auth/register`

Create a new user account.

**Request:**
```json
{
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "cellPhone": "+5491112345678",
  "password": "s3cr3t",
  "passwordConfirmation": "s3cr3t"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": null
}
```

**Error responses:**

| HTTP Status | Scenario |
|-------------|----------|
| 400 | Validation error (duplicate email, weak password, mismatched confirmation) |
| 503 | Server unavailable |

---

### GET `/v1/auth/me`

Fetch the full user profile for the authenticated user. Called in the background after startup.

**Request headers:**
```
Authorization: Bearer <authToken>
```

**Response (200):**
```json
{
  "success": true,
  "message": "",
  "data": { /* UserModel */ }
}
```

**Error responses:**

| HTTP Status | Scenario |
|-------------|----------|
| 401 | Token expired or invalid — trigger logout |
| 503 | Server unavailable — silently ignore |

---

## 11. Error Handling

### Login errors

| Error condition | UX behavior |
|----------------|-------------|
| Device offline | Show `OfflineBanner` inline; block form submission |
| 401 Invalid credentials | Show field-level or form-level error: "Invalid email or password" |
| 403 Account inactive | Show: "Your account is inactive. Contact support." |
| Network timeout | Show: "Connection error. Please try again." |
| Unexpected server error (5xx) | Show: "Something went wrong. Please try again." |

### Registration errors

| Error condition | UX behavior |
|----------------|-------------|
| Device offline | Show `OfflineBanner`; block form submission |
| 400 Duplicate email | Show field error on email: "This email is already registered" |
| 400 Password mismatch | Show field error on confirmation field |
| 400 Weak password | Show field error with password requirements |
| Other 400 | Show API-provided `message` in form-level error area |
| 5xx | Show: "Something went wrong. Please try again." |

### Session / startup errors

| Error condition | UX behavior |
|----------------|-------------|
| No token in localStorage | Redirect to `/login` silently |
| Token expired (`expiresIn < Date.now()`) | Show session-expired message, redirect to `/login` |
| Corrupted user JSON in localStorage | Clear storage, redirect to `/login` |
| `GET /v1/auth/me` fails (offline/5xx) | Silently ignore; use cached user data |
| `GET /v1/auth/me` returns 401 | Token invalid; call `logout()` and redirect to `/login` |

### Authorization errors

| Error condition | UX behavior |
|----------------|-------------|
| Route access denied | Redirect to `/unauthorized` page |
| Feature-gated UI hidden | Component does not render (no error shown) |

---

## 12. Security Considerations

### Token storage

- `authToken` is stored in `localStorage` for offline access. This is an intentional tradeoff: the app must work offline for 35 days, making `httpOnly` cookies impractical.
- Mitigation: the token is never logged, never sent to third-party services, and cleared on logout.
- XSS risk must be mitigated via strict Content Security Policy headers and avoiding `dangerouslySetInnerHTML`.

### HTTP interceptor

All outbound API requests must include the token automatically. Implement a single Axios interceptor (or equivalent fetch wrapper) that:

1. Reads `localStorage['token']` on every request
2. Attaches `Authorization: Bearer <token>` header if the token exists
3. On 401 responses from the API, calls `authService.logout()` and redirects to `/login`

```ts
// Axios interceptor example
axiosInstance.interceptors.request.use((config) => {
  const token = storageService.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authService.logout();
    }
    return Promise.reject(error);
  }
);
```

### Session expiry enforcement

- Expiry is checked on startup and by the `authLoader` on every route transition.
- Client-side expiry (35-day override) is the primary mechanism. Do not rely solely on server-issued JWT expiry.
- If the server returns 401 at any point (even mid-session), treat it as an expired session: clear localStorage and redirect to `/login`.

### Password handling

- Passwords are never stored in localStorage.
- Clear form state (reset form) after a successful login or failed login attempt.
- Use `type="password"` inputs; do not log form values.

### No Google OAuth

This migration does not include Google OAuth or any third-party identity provider. Email/password only.

### Route protection

- All non-auth routes are protected by loaders that run server-side (or at the React Router layer before rendering).
- Loaders are synchronous against in-memory state — they do not make network calls, preventing flash-of-content on protected routes.
- SuperAdmin and OwnerAdmin users bypass per-feature checks but still must pass `authLoader` (i.e., must have a valid, non-expired session).

### localStorage key namespacing

- The user model key includes the `appVersion` as a prefix. This ensures that when the app version changes, the old key is ignored (treated as unauthenticated), forcing a fresh login. Prevents model shape mismatches after upgrades.
- Old keys with the previous `appVersion` prefix should be pruned from `localStorage` on startup to avoid unbounded storage growth.
