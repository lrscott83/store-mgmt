# storage-service Specification

**Capability:** storage-service
**Origin change:** storage-service-parity (Slice 1, Fase 1 — auth cluster)
**Status:** Archived (verify PASS)

---

## Purpose

Restore Angular's two-key persistence layout for StorageService and consolidate all currentUser/token localStorage I/O behind a single, de-orphaned StorageService. Re-home the orphaned StorageService from zero call-sites to the single source of truth. Eliminate duplicate inline persistence logic scattered across auth-store.ts and api-client.ts.

---

## Requirements

### Requirement: Single Persistence Source for currentUser and token

React MUST route all `currentUser` and `token` localStorage reads/writes/removals through `StorageService`. No other module (`auth-store.ts`, `api-client.ts`) MAY perform direct `localStorage` I/O against the `currentUser` or `token` keys.

#### Scenario: auth-store delegates instead of inlining
- GIVEN auth-store needs to persist or read the current user or token
- WHEN inspecting `auth-store.ts` source
- THEN it MUST call `StorageService` methods, not `localStorage.getItem/setItem/removeItem` directly, for the `currentUser` and `token` keys

#### Scenario: api-client 401 interceptor delegates instead of inlining
- GIVEN the API client's 401 interceptor clears session state
- WHEN inspecting `api-client.ts` source
- THEN it MUST call `StorageService` removal methods, not direct `localStorage.removeItem`, for the `currentUser` and `token` keys

---

### Requirement: Angular-Faithful Key Layout (Two-Key Separation)

`StorageService` MUST persist `currentUser` as a PURE `UserModel` under key `currentUser`, and the raw token string under key `token`. It MUST NOT write to, read from, or merge with the AUTH_MODEL key. AuthModel (authToken + expiresIn) persistence is owned exclusively by auth-store under its own key, out of `StorageService`'s scope.

#### Scenario: setCurrentUser writes only the currentUser key
- GIVEN a UserModel is persisted via `StorageService.setCurrentUser(user)`
- WHEN the localStorage state is inspected
- THEN only the `currentUser` key MUST be written with a JSON-serialized UserModel, and the AUTH_MODEL key MUST be untouched by this call

#### Scenario: setTokenToLocalStorage writes only the token key
- GIVEN a token string is persisted via `StorageService.setTokenToLocalStorage(token)`
- WHEN the localStorage state is inspected
- THEN only the `token` key MUST be written with the raw token string

#### Scenario: background /me refresh keeps AUTH_MODEL minimal
- GIVEN the startup background `/v1/auth/me` refresh returns an updated profile
- WHEN it persists the refreshed user
- THEN the profile MUST be written via `StorageService.setCurrentUser` and the AUTH_MODEL key MUST hold only `{authToken, expiresIn}` (no merged profile fields)

---

### Requirement: Angular-Faithful Method Signatures

`StorageService` MUST expose exactly: `getCurrentUser()`, `setCurrentUser(user: UserModel)`, `removeCurrentUser()`, `getTokenFromLocalStorage()`, `setTokenToLocalStorage(token: string)`, `removeTokenFromLocalStorage()` — same names, params, and synchronous (non-Promise) return shape as Angular's `StorageService` (rule 3; Angular's methods are plain sync calls, not Observables, so no Promise wrapping applies per rule 4). It MUST NOT expose `setSessionCookie`/`clearSessionCookie`/`clear` (rule 12 — no Angular correlate).

#### Scenario: Method names and arity match Angular
- GIVEN a reviewer inspects `StorageService`'s public surface
- WHEN comparing against `frontend/src/app/_services/storage/storage.service.ts`
- THEN the six method names above MUST exist with matching parameter lists, and no renamed/removed equivalents (`getUser`, `setUser`, `removeUser`, `getToken`, `setToken`, `removeToken`, `setSessionCookie`, `clearSessionCookie`, `clear`) MUST remain

---

### Requirement: auth-store and api-client Delegate to StorageService

Any code in `auth-store.ts` and `api-client.ts` that previously read, wrote, or removed `currentUser`/`token` inline MUST be replaced with calls into `StorageService`'s six methods.

#### Scenario: Logout clears currentUser and token via StorageService
- GIVEN a user logs out through auth-store
- WHEN the logout flow executes
- THEN `StorageService.removeCurrentUser()` and `StorageService.removeTokenFromLocalStorage()` MUST be invoked instead of direct `localStorage.removeItem` calls

---

### Requirement: Password Not Persisted (Security Fix Retained)

`StorageService.setCurrentUser` MUST NOT persist a plaintext `password` field on the stored UserModel, even where Angular's stored object would otherwise carry one. This is a ratified security exception to strict parity (bug policy, rule 8) — the field MUST be stripped or omitted before write.

#### Scenario: Stored user has no password field
- GIVEN a UserModel containing a `password` value is passed to `StorageService.setCurrentUser`
- WHEN the persisted `currentUser` value is inspected
- THEN it MUST NOT contain a non-empty `password` field

---

## Out of Scope (deferred to later slices)

- Angular register() payload parity (finding #3, slice 2 — auth-http.service)
- Authorization expiry check (finding #4, slice 4 — authorization-service)
- `cleanOldData` (finding #5, usage-tracker slice)
- Logout stale-key behavior (finding #6, slice 3 — auth.service)
- `getUserByToken` algorithm and AuthModel key ownership details (slice 3)
- `hasSession` cookie and `StorageService.clear()` disposition — resolved (rule 12: removed as invention)
