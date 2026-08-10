# Delta for dek-lifecycle-and-unlock-gate

## MODIFIED Requirements

### Requirement: DEK acquisition happens on login, on startup via the device wrap, and DEK release on logout
(Previously: "DEK acquisition happens on both login paths, DEK release on
logout" — described only two login-time unwraps, and a login with no roster
entry for this user left the DEK `null`.)

The DEK MUST be acquired at three points, all owned at the `auth-store`
level — `offline-auth-service.ts` is NOT an acquisition point and is
untouched by this change: (1) `auth-store.login` (online) and
`auth-store.loginOffline` (offline) MUST each end with the DEK resolved from
an existing device DEK if this device has one, else from the user's roster
wrap if the roster has one, else by minting and wrapping a fresh local DEK
(`device-dek-wrap`); (2) app startup/reload with a valid session, which MUST
recover the DEK from a working device-key wrap alone, with no password; (3)
`auth-store.logout()` MUST call `clearDek()`. A login with no roster entry
for this user MUST NO LONGER leave the DEK `null` — it MUST end non-null once
this device's bootstrap completes.

#### Scenario: Online login on a provisioned device sets the DEK
- GIVEN a v2 roster is stored with a wrap entry for the logging-in user
- WHEN online `login(login, password)` succeeds
- THEN `getDek()` is non-null afterward

#### Scenario: Offline login sets the DEK after the verifier check
- GIVEN a valid v2 roster and correct offline credentials
- WHEN `loginOffline(login, password)` succeeds
- THEN `getDek()` is non-null afterward

#### Scenario: Reload with a valid session and a working device-key wrap sets the DEK, no password
- GIVEN a device already holding a working device-key wrap
- WHEN the app reloads with a valid token
- THEN `getDek()` is non-null with no password prompt

#### Scenario: Login with no roster entry for this user still ends with a non-null DEK
- GIVEN no roster entry for this user's login (previously left the DEK null)
- WHEN `login(login, password)` or `loginOffline(login, password)` succeeds
- THEN `getDek()` is non-null afterward (recovered from the device DEK, or freshly minted)

#### Scenario: Logout clears the DEK
- GIVEN a DEK is set from a prior unlock
- WHEN `logout()` is invoked
- THEN `getDek()` becomes `null`

### Requirement: needsUnlock — per-user, all four combinations, plus the device-wrap fast path
(Previously: "needsUnlock — per-user, all four combinations" — had no
concept of a device-level wrap table; `true` required a per-user roster wrap.)

`needsUnlock(user)` MUST return `true` if `getDek()` is `null` AND EITHER:
(a) this device's local wrap table holds any entry (`hasDeviceDekWrap()`) —
meaning the device holds ciphertext this page load could not auto-recover —
regardless of roster state; OR (b) the raw (expiry-ignoring) roster contains
a non-empty wrap entry for this user's login. In every other combination it
MUST return `false`. The four original per-user/roster combinations are
UNCHANGED when no local wrap table exists.

#### Scenario: Not provisioned for this user, no DEK, no device wrap table — false (majority case)
- GIVEN no roster (or no entry for this user) and no local wrap table
- AND `getDek()` is `null`
- WHEN `needsUnlock(user)` is called
- THEN it returns `false`

#### Scenario: Not provisioned for this user, DEK present — false
- GIVEN no roster entry for this user and no local wrap table
- AND `getDek()` is non-null
- WHEN `needsUnlock(user)` is called
- THEN it returns `false`

#### Scenario: Provisioned for this user via roster, no DEK, no device wrap table — true
- GIVEN a v2 roster entry with wrap fields for this user's login, and no local wrap table
- AND `getDek()` is `null`
- WHEN `needsUnlock(user)` is called
- THEN it returns `true`

#### Scenario: Provisioned for this user, DEK present — false
- GIVEN a v2 roster entry with wrap fields for this user's login
- AND `getDek()` is non-null
- WHEN `needsUnlock(user)` is called
- THEN it returns `false`

#### Scenario: Local wrap table present, no DEK — true, independent of roster state
- GIVEN this device's local wrap table holds an entry (device-key wrap and/or a user password wrap)
- AND `getDek()` is `null`
- WHEN `needsUnlock(user)` is called
- THEN it returns `true`, even when the roster has no entry for this user

### Requirement: authLoader redirects to unlock without logging out
(Previously: identical redirect contract, silent on device-wrap recovery
timing.)

When an authenticated user's `needsUnlock` is true, `authLoader` MUST
redirect to `/login?unlock=1` WITHOUT calling `logout()`. `authLoader` MUST
attempt device-key DEK recovery BEFORE evaluating `needsUnlock`, so a
working device-key wrap prevents this redirect. The session and roster MUST
remain intact so re-login can complete offline on a provisioned device. When
`needsUnlock` is false, pass-through is unchanged.

#### Scenario: Reload on a device with a working device-key wrap never reaches the unlock redirect
- GIVEN an authenticated user on a device holding a working device-key wrap
- WHEN `authLoader` runs after a reload
- THEN the recovery attempt sets the DEK first, `needsUnlock` evaluates false, and no redirect occurs

#### Scenario: Reload with the device-key wrap missing/corrupt falls back to today's unlock redirect
- GIVEN an authenticated user whose device-key wrap is absent or fails to recover
- AND a per-user roster wrap or local wrap-table entry exists with no DEK in memory
- WHEN `authLoader` runs
- THEN it redirects to `/login?unlock=1` and `logout()` is not called

#### Scenario: Reload on an unprovisioned device is unaffected
- GIVEN an authenticated user whose `needsUnlock` is false
- WHEN `authLoader` runs
- THEN no unlock redirect occurs — behavior identical to before this change

### Requirement: guestOnlyLoader renders the unlock form instead of bouncing
(Previously: identical rendering contract, silent on device-wrap recovery
timing.)

`guestOnlyLoader` MUST attempt device-key DEK recovery BEFORE evaluating
`needsUnlock`. It MUST render the login form (return `null`, not a redirect)
when the visitor is authenticated and `needsUnlock` is true after that
attempt. It MUST redirect to the user's home path in the other three
combinations, exactly as before for online-auth-only users and for a device
whose working device-key wrap already resolved the DEK.

#### Scenario: Online-auth-only authenticated visitor at /login is redirected home
- GIVEN an authenticated user with no roster and no local wrap table on this device
- WHEN `guestOnlyLoader` runs
- THEN it redirects to the user's home path (unchanged, majority case)

#### Scenario: Locked visitor with no working device-key wrap sees the unlock form
- GIVEN an authenticated user whose device-key wrap is absent/failed and whose roster wrap or local wrap-table entry exists, DEK null
- WHEN `guestOnlyLoader` runs
- THEN it returns `null` and the login form renders

#### Scenario: Visitor with a working device-key wrap is redirected home, no unlock form
- GIVEN an authenticated user on a device whose device-key wrap successfully recovers the DEK
- WHEN `guestOnlyLoader` runs
- THEN it redirects to the user's home path — the unlock form never renders
