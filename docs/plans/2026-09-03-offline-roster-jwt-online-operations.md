# Offline Roster JWT for Online Operations — Final Plan (Option A: Session Token)

Date: 2026-09-03
Status: Final — approved direction, not yet implemented. No code touched yet.

## Problem

A device that authenticates OFFLINE via the roster bundle cannot use
API-backed functionality while ONLINE. The offline session stores the
sentinel `OFFLINE_SESSION_TOKEN` (`'offline-session'`) as its
`authToken` (`offline-auth-service.ts:80`), so every HTTP call sends
`Bearer offline-session` and receives 401. Offline authentication was
designed as if "born offline" meant "never talks to the API", but the
roster bundle already carries a full, backend-minted JWT per user
(`offlineAuthToken`) that the frontend discards.

Key product insight driving this change: authenticating offline does
NOT mean the device is offline. A roster-provisioned device that comes
back online must be able to use ALL online functionality with the JWT
the roster already carries.

## Why Option A (session token) over an interceptor swap

An earlier Option 2 (swap the bearer inside `api-client.ts` when the
stored token is the sentinel) was analyzed and superseded:

- Single source of truth: the session token IS the JWT. No
  per-request roster-to-HTTP coupling, no resolution logic in the
  interceptor.
- Fixes a latent cold-boot bug for free: `auth-store.ts:59-64`
  treats a 401/404 from the cold-boot `/me` as a session-rejection
  verdict and logs out. Today a sentinel-hydrated session without a
  cached-profile match does `/me` with `Bearer offline-session` ->
 401 -> forced logout. With the real JWT, that `/me` answers 200 and
  the session survives — plus it revalidates against the server
  (live roles, active account), which the sentinel never could.
- Fewer moving parts at runtime; the interceptor stays untouched.

## Verified backend facts (no backend changes needed)

- The roster export mints `offlineAuthToken` with the SAME
  `IJwtProvider.GenerateToken(userId, login, expiresAt)` used by login
  (`ExportOfflineRosterQuery.cs:191`, `LoginCommand.cs:68`); same
  claims (`NameIdentifier`, `Name`, `Jti` — `JwtProvider.cs:26-53`).
- The bearer pipeline validates it identically
  (`ServiceExtensions.cs:38-48`); blacklist enforcement is per-`jti`
  (`ServiceExtensions.cs:62-73`).
- Roles/permissions are NOT frozen in the token:
  `ClaimsTransformerService.cs:21-52` re-resolves TenantId, StoreId,
  SuperAdmin/Admin/ReSeller, and Features from the live DB on every
  request. A role change after roster export is effective immediately
  for roster-JWT requests.
- Backend E2E `OfflineRosterUsageAuthorizationTests.cs:88` already
  proves a roster JWT authorizes an authenticated endpoint.
- The JWT expires exactly at the bundle's `expiresAt` — the same
  instant `isRosterProvisioned()` turns false
  (`roster-store.ts:148`), so the recovery path (next login falls to
  the online branch) already exists.

## Implementation steps (frontend only)

### Step 1 — `toUserModel()`: use the JWT (core fix)

`offline-auth-service.ts:80`:

```ts
authToken: user.offlineAuthToken || OFFLINE_SESSION_TOKEN,
```

**Gap 1 fix (from review): `||`, not `??.** The backend produces
`string.Empty` on mint failure (`ExportOfflineRosterQuery.cs:193-196`)
and the DTO defaults to `string.Empty`
(`OfflineRosterUserDto.cs:32`). `??` only catches
`undefined`/absent; an empty string would leak through as the session
token and 401 everything. `||` treats `''` as absent.

### Step 2 — `isOfflineSession` flag on `UserModel`

Add `isOfflineSession: boolean` to `UserModel`
(`packages/domain/src/models/auth.ts`).

- `toUserModel()` sets it `true` ALWAYS — it marks "session born from
  the roster", not "session carries a JWT". A v1 bundle without a JWT
  is still an offline session (idle-lock must keep applying).
- Online flows (`getMe` hydration in `auth-store.ts`) leave it
  `false`.

**Gap 3 fix (from review): dual condition in the idle-lock.**
`app-layout.tsx:54` must read:

```ts
if (!(user.isOfflineSession || authToken === OFFLINE_SESSION_TOKEN)) return;
```

Reason: sessions cached BEFORE this deploy have
`authToken: 'offline-session'` in `CURRENT_USER` with no flag — a
flag-only condition would silently disarm the idle-lock for them
until the next re-login. The dual condition covers the transition and
costs nothing.

### Step 3 — Align session expiry with the bundle's `expiresAt`

`setUser` hardcodes `expiresIn = now + 35 days`
(`auth-store.ts:215`), ignoring any expiry the user object carries.
Meanwhile the roster JWT dies at the bundle's `expiresAt`, so a
session that outlives its own JWT gets 401s in the surplus window (no
logout — offline-first policy — but every API-backed screen fails).

Fix, two parts:

1. Expose the bundle expiry: `authenticateOffline` currently returns
   only the `UserModel` (`offline-auth-service.ts:147`). Either change
   its return shape, or (simpler, avoids touching the tested contract)
   have `loginOffline` in `auth-store.ts` read `getRoster().expiresAt`
   in its own dynamic import — it already imports offline modules
   there (D6 pattern).
2. Extend `setUser(user, token, expiresIn?)` — optional param, defaults
   to the current 35-day stamp. Online call sites unchanged.

**Note:** `toUserModel` stamps `expiresIn: 0` today
(`offline-auth-service.ts:82`) and `setUser` overwrites it — that `0`
is NOT the expiry source. Do not "fix" it to the bundle value; the
fix belongs in `setUser`'s parameter, or it will be silently clobbered
again.

### Step 4 — `store-usage-tracker` — leave as is (optional cleanup later)

Its explicit `Authorization` override
(`store-usage-tracker.ts:113-128`) becomes redundant once the session
token is the JWT, but it is tested, harmless, and sends the same JWT.
Do not churn it in this change.

### Step 5 — Tests

| Test file | Change |
|---|---|
| `offline-auth-service.test.ts` | Existing `expect(authToken).toBe(OFFLINE_SESSION_TOKEN)` keeps passing (fixture has no `offlineAuthToken`). ADD: bundle with JWT -> `authToken` = JWT; bundle with EMPTY-STRING `offlineAuthToken` -> falls back to sentinel (Gap 1 regression); `isOfflineSession === true` in both fallback and JWT cases. |
| `auth-store.offline.test.ts` | Existing `expect(TOKEN).toBe('offline-session')` keeps passing (fallback). ADD: JWT case -> `TOKEN` = JWT; `AUTH_MODEL.expiresIn` = bundle `expiresAt` (Step 3). |
| `app-layout.test.tsx` | Idle-lock cases at lines ~235/243 switch to the dual condition. Keep one sentinel-only case (transition coverage) + one flag-only case. |
| `loaders.test.ts` / `login.offline.test.tsx` | Mocks use `'tok'`/sentinel — no functional change; extend only if the new flag affects a branch (it does not — loaders never read `authToken` semantics beyond identity). |

### Step 6 — New frontend E2E (add-only; existing specs untouchable)

New spec file. Never touch `login-offline.spec.ts`,
`offline-access-panel.spec.ts`, `roster-any-filename.spec.ts`, or
`e2e/support/*` (CLAUDE.md hard rule; verified
`roster-fixture.ts:224-237` never plants `offlineAuthToken`, so no
existing E2E changes behavior).

**Gap 4 fix (from review): the spec must use a REAL backend-minted
JWT.** A synthetic JWT fails signature validation. And the roster
user's `id`/`login` must match a REAL backend user —
`ClaimsTransformerService` resolves claims by `nameid` against the
DB, so a synthetic id resolves no claims and every authorized call
would 403/401.

Flow:
1. Create a real user via API, `POST /api/v1/auth/login` -> take the
   JWT (this login is test SETUP, not the flow under test).
2. Build the bundle via `buildRosterBundle()` (pure, exported), then
   inject the real user's `id`, `login`, and `offlineAuthToken` into
   the user object, and plant via `page.evaluate` inside the spec —
   zero changes to the shared fixture.
3. Offline login (roster branch) -> assert an API-backed operation
   returns 200 with ZERO `POST /v1/auth/login` during the offline
   session.

## Explicit non-goals (v1)

- Idle-lock keeps applying to offline-born sessions even while online
  (the flag marks session ORIGIN, not connectivity).
- A 401 still never logs out (offline-first policy,
  `api-client.ts:53-57`); screens fail individually.
- When the bundle expires, `isRosterProvisioned()` turns false and
  the next login takes the online branch — existing recovery path.
- Backend: zero changes.

## Impact summary

| Area | Impact |
|---|---|
| Backend | ZERO changes (roster JWT already valid for every endpoint; E2E coverage exists) |
| `packages/domain` | `UserModel.isOfflineSession: boolean` (additive field) |
| `offline-auth-service.ts` | 1 line (Gap-1-corrected) + flag stamp |
| `auth-store.ts` | `setUser` optional `expiresIn` param + `loginOffline` reads bundle `expiresAt` |
| `app-layout.tsx` | idle-lock dual condition |
| `api-client.ts` | UNTOUCHED (whole point of Option A) |
| `store-usage-tracker.ts` | UNTOUCHED (redundant override stays) |
| Online sessions | Untouched (flag false, no behavior change) |
| Roster v1 / empty-JWT bundles | Untouched (fallback to sentinel + 35d) |
| Pre-deploy cached offline sessions | Covered by the dual idle-lock condition |
| Security | No new backend surface; revocation window unchanged (TTL = bundle expiry) |
| CLAUDE.md constraints | Compliant: no backend prod code, no existing E2E/support touched, add-only tests |

## Alternatives considered

- **Option 2 (interceptor swap in `api-client.ts`)**: superseded.
  Keeps the sentinel as session token and swaps the bearer per
  request when the stored token is the sentinel. Downsides:
  roster-to-HTTP coupling in the interceptor, per-request resolution,
  and it does NOT fix the cold-boot `/me` 401-logout edge (the
  sentinel still goes out on cold boot). Preserved analysis: this
  doc's earlier revision (git history).
- **Option 3 (transparent online re-login on reconnect)**: rejected.
  Requires stored credentials; storing the password is worse than the
  problem it solves.
