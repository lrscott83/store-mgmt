# Delta for auth-session

## ADDED Requirements

### Requirement: loginOffline hydrates through the existing setUser seam
`useAuthStore` MUST expose `loginOffline(login, password)`, which on
success calls the same `setUser` hydration path already used by online
`login` — writing `TOKEN`/`CURRENT_USER`/`AUTH_MODEL` and setting
`{ user, isAuthenticated: true }` — so `authLoader`/`featureLoader`/
`adminLoader` pass unchanged with no loader modification. The cold-boot
invariant (state is set synchronously before any `await` on module load)
MUST be preserved; `loginOffline` adds an action only, no new module-load
hydration.

#### Scenario: Offline login hydrates identically to online login
- GIVEN a provisioned device with valid roster credentials
- WHEN `loginOffline(login, password)` resolves
- THEN `useAuthStore.getState().isAuthenticated` is true
- AND the same storage keys (`TOKEN`, `CURRENT_USER`, `AUTH_MODEL`) are written as an online login would write
- AND existing route loaders/guards pass without modification

### Requirement: Idle lock scoped strictly to offline sessions
A 1-hour inactivity lock MUST arm only when the current session's
`authToken` equals the `offline-session` sentinel. It MUST NOT arm for any
session whose `authToken` is not that sentinel (i.e., every online
session). On idle timeout, the lock MUST invoke the existing `logout()`
action, requiring only the password to resume (the roster is not cleared).

#### Scenario: Offline session locks after 1 hour of inactivity
- GIVEN an authenticated session with `authToken === 'offline-session'`
- WHEN 1 hour elapses with no recorded activity
- THEN `logout()` is invoked and the user is redirected to `/login`

#### Scenario: Online session never arms the idle timer
- GIVEN an authenticated session with `authToken !== 'offline-session'`
- WHEN the authenticated layout mounts and time passes
- THEN no idle timer is started for this session

## MODIFIED Requirements

### Requirement: Logout Storage-Clear Scope
`logout()` MUST remove ONLY the `AUTH_MODEL` key (`${appVersion}-USERDATA_KEY`) from storage. It MUST NOT remove the `token` or `currentUser` keys. It MUST NOT clear the offline roster (`lizoft.offline-roster`) or its anti-replay marker under any circumstance, including when triggered by the offline idle lock.
(Previously: scope was AUTH_MODEL-only with no statement about the roster, which did not exist as a concept yet.)

#### Scenario: Logout removes AUTH_MODEL only
- GIVEN an authenticated session with `token`, `currentUser`, and `AUTH_MODEL` present in storage
- WHEN `logout()` is invoked
- THEN the `AUTH_MODEL` key is removed from storage
- AND the `token` key remains present (stale)
- AND the `currentUser` key remains present (stale)

#### Scenario: Offline idle-lock logout preserves the roster
- GIVEN an offline session (`authToken === 'offline-session'`) with a provisioned roster in storage
- WHEN the idle timer invokes `logout()`
- THEN the roster remains present in storage
- AND `isRosterProvisioned()` still returns true after logout
