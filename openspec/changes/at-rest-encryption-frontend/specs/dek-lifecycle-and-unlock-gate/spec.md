# dek-lifecycle-and-unlock-gate Specification

## Purpose

The in-memory-only Data Encryption Key (DEK) lifecycle across login,
logout, and reload, and the route-guard gate (`needsUnlock`) that reconciles
"DEK is gone after reload" with "most devices never provision encryption at
all." Owns the four combinations of roster-provisioned × DEK-present.

## Requirements

### Requirement: The DEK is memory-only and never survives a reload
The DEK MUST be held only in module-level runtime state, never written to `localStorage`, `sessionStorage`, or any cookie. After a tab reload, close, or crash, the DEK MUST be absent (`getDek() === null`) regardless of its prior state.

#### Scenario: DEK is absent by default and after clearDek
- WHEN the app starts with no login performed
- THEN `getDek()` returns `null`
- WHEN a DEK is set and then `clearDek()` is called
- THEN `getDek()` returns `null` again

#### Scenario: No storage key ever carries the DEK
- GIVEN a DEK has been set via a successful unlock
- WHEN every key of `localStorage` and `sessionStorage` is inspected
- THEN none contains the Base64 form of the DEK bytes

### Requirement: DEK acquisition happens on both login paths, DEK release on logout
`auth-store.login` (online) and `authenticateOffline` (offline) MUST, on success against a user with a v2 roster entry, unwrap and set the DEK via the DEK's derivation from the user's password and roster wrap fields. `auth-store.logout()` MUST call `clearDek()`. A login for a user with no roster entry, or on a device not encryption-provisioned, MUST skip the unwrap entirely — no error, DEK stays `null`.

#### Scenario: Online login on a provisioned device sets the DEK
- GIVEN a v2 roster is stored with a wrap entry for the logging-in user
- WHEN online `login(login, password)` succeeds
- THEN `getDek()` is non-null afterward

#### Scenario: Offline login sets the DEK after the verifier check
- GIVEN a valid v2 roster and correct offline credentials
- WHEN `authenticateOffline` succeeds
- THEN `getDek()` is non-null afterward

#### Scenario: Login with no roster entry for this user leaves the DEK null, no throw
- GIVEN no roster is provisioned on this device (the majority case)
- WHEN online `login(login, password)` succeeds
- THEN it resolves successfully
- AND `getDek()` remains `null`

#### Scenario: Logout clears the DEK
- GIVEN a DEK is set from a prior unlock
- WHEN `logout()` is invoked
- THEN `getDek()` becomes `null`

### Requirement: needsUnlock — per-user, all four combinations
`needsUnlock(user)` MUST return `true` if and only if: `getDek()` is `null` AND the raw (expiry-ignoring) roster contains an entry for this user's `login` with non-empty `wrappedDek`, `wrapSalt`, and `wrapIv`. In every other combination it MUST return `false`, including when the roster exists but has no entry for this specific user.

#### Scenario: Not provisioned for this user, no DEK — false (majority case)
- GIVEN no roster, or a roster with no entry for this user's login
- AND `getDek()` is `null`
- WHEN `needsUnlock(user)` is called
- THEN it returns `false`

#### Scenario: Not provisioned for this user, DEK present — false
- GIVEN no roster entry for this user
- AND `getDek()` is non-null
- WHEN `needsUnlock(user)` is called
- THEN it returns `false`

#### Scenario: Provisioned for this user, no DEK — true
- GIVEN a v2 roster entry with wrap fields for this user's login
- AND `getDek()` is `null`
- WHEN `needsUnlock(user)` is called
- THEN it returns `true`

#### Scenario: Provisioned for this user, DEK present — false
- GIVEN a v2 roster entry with wrap fields for this user's login
- AND `getDek()` is non-null
- WHEN `needsUnlock(user)` is called
- THEN it returns `false`

### Requirement: authLoader redirects to unlock without logging out
When an authenticated user's `needsUnlock` is true, `authLoader` MUST redirect to `/login?unlock=1` WITHOUT calling `logout()`. The session and the roster MUST remain intact so re-login can complete offline on a provisioned device. When `needsUnlock` is false, `authLoader`'s existing pass-through behavior is unchanged.

#### Scenario: Reload on a provisioned device redirects to unlock, session preserved
- GIVEN an authenticated user whose `needsUnlock` is true (post-reload, DEK gone)
- WHEN `authLoader` runs
- THEN it redirects to `/login?unlock=1`
- AND `logout()` is not called
- AND the authenticated user remains present in session state

#### Scenario: Reload on an unprovisioned device is unaffected
- GIVEN an authenticated user whose `needsUnlock` is false
- WHEN `authLoader` runs
- THEN no unlock redirect occurs — behavior identical to before this change

### Requirement: guestOnlyLoader renders the unlock form instead of bouncing
`guestOnlyLoader` MUST render the login form (return `null`, not a redirect) when the visitor is authenticated and `needsUnlock` is true. It MUST redirect to the user's home path in the other three combinations of the §`needsUnlock` table, exactly as before this change for online-auth-only users.

#### Scenario: Online-auth-only authenticated visitor at /login is redirected home
- GIVEN an authenticated user with no roster on this device
- WHEN `guestOnlyLoader` runs
- THEN it redirects to the user's home path (unchanged, majority case)

#### Scenario: Locked provisioned visitor at /login sees the unlock form
- GIVEN an authenticated user whose `needsUnlock` is true
- WHEN `guestOnlyLoader` runs
- THEN it returns `null` and the login form renders
- AND no redirect occurs
