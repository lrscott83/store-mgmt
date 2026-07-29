# Design: Offline Authentication — Frontend (React PWA)

**Change**: `offline-auth-frontend` · **Phase**: design · **Date**: 2026-07-28
**Artifact store**: hybrid (this file + engram `sdd/offline-auth-frontend/design`)
**Inputs**: proposal (`proposal.md`, engram #1616), exploration (`explore.md`, #1615), spec (#1617), approved plan `docs/plans/2026-07-25-offline-auth-frontend-plan.md` (Tasks 1-10).
**Scope**: FRONTEND ONLY. This document locks HOW; the spec owns WHAT.

## Technical Approach

Seven leaf modules under `app/shared/lib/offline/` plus one HTTP service, composed at **six** existing seams (`auth-store.ts`, `login.tsx`, `app-layout.tsx`, `user-list.tsx`, `routes.ts`, `i18n/es.ts`). No DI container, no new dependency, no class hierarchy — plain functions over `localStorage` + Web Crypto, matching the codebase's plain-object service convention.

The headline invariant (**an unprovisioned device is byte-for-byte unchanged**) is enforced *by the module dependency graph*, not by discipline. Every decision below is checked against it.

## Architecture Decisions

### D1 — Dependency graph enforces purity (the load-bearing decision)

```
roster-types.ts        types only            → erased at compile time
offline-session.ts     1 const (sentinel)    → ZERO imports
offline-crypto.ts      Web Crypto            → ZERO imports
idle-timeout.ts        setTimeout            → ZERO imports
roster-store.ts        localStorage          → `import type` ONLY  ← purity contract
roster-serializer.ts   zip.js                → top-level configure() [side effect, QUARANTINED]
offline-auth-service.ts→ roster-store, offline-crypto, offline-session
roster-http-service.ts → api-client
```

| Consumer | Reaches | Why this exact edge |
|---|---|---|
| `login.tsx` fork | `roster-store` via **dynamic** `import()` | Runs on **every** submit incl. unprovisioned users. `roster-store` has zero runtime imports, so importing it can only evaluate 2 string consts + 3 class/function declarations. |
| `login.tsx` error map | **nothing** — dispatches on `err.name` | A static import of `offline-auth-service` would drag `offline-crypto` + `roster-store` into the login chunk and evaluate them for every unprovisioned user. |
| `app-layout.tsx` | `offline-session` (const) + `idle-timeout` — **never** `offline-auth-service` | Importing the sentinel from `offline-auth-service` would evaluate crypto + localStorage modules on every authenticated online page load. |
| `auth-store.ts` | `offline-auth-service` via **dynamic** `import()` inside `loginOffline` | `auth-store.ts` is evaluated at module load by everything (`auth-store.ts:220-222`). It MUST keep zero static `offline/` imports. |
| `provision.tsx` | static `roster-serializer` + `roster-store` | Dedicated lazily-loaded route chunk; the `configure()` side effect only ever runs when a human visits `/auth/provision`. |

**Alternatives rejected**: ESLint `no-restricted-imports` on `roster-store` (real enforcement, but does not run in `pnpm test` and adds lint config surface); documenting the rule in a comment only (invisible to CI). **Chosen**: two tests — a behavioral one (localStorage spy, zero calls at import) and a **structural** one that reads `roster-store.ts` source and asserts every `import` line begins with `import type`. That is what makes the constraint hard to violate rather than merely documented.
**Failure mode guarded**: a future top-level side effect in `roster-store.ts` silently changing every online login.

### D2 — Verifier parameters: what can drift, and what cannot

| Parameter | Source of truth | Drift behavior |
|---|---|---|
| `iterations`, `salt` | **the bundle** (`OfflineVerifier`, per user) | Self-healing — the backend can rotate them without a frontend release. |
| Algorithm (PBKDF2-HMAC-SHA256), derived length (32 B), pre-hash convention (`Base64(SHA256(utf8(pw)))` string → UTF-8 bytes → PBKDF2 input) | frozen consts in `offline-crypto.ts` | **Fatal and silent.** Pinned by known-answer vectors: `sha256Base64('test') === 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg='` and `atob(pbkdf2Base64(...)).length === 32`. A KAT break is the drift detector; a locked-out user must never be. |

The constants block carries a comment naming its backend counterpart (`docs/plans/2026-07-25-offline-auth-backend-plan.md`). They cannot literally be shared across runtimes — the KAT is the contract.
**Failure mode guarded**: every offline login failing with `AUTH.INVALID_CREDENTIALS`, indistinguishable from a wrong password.

### D3 — Bundle shape guard in `roster-store` (closes the unprovable part of Task 8)

`importRoster`/`getRoster` compare `expiresAt <= now` numerically. If the (unbuilt) backend emits ISO **strings**, both comparisons are `NaN`-false: an expired or garbage bundle would be treated as valid **forever**. Both entry points therefore validate `typeof bundleId === 'string' && typeof issuedAt === 'number' && typeof expiresAt === 'number' && Array.isArray(users)` first — `importRoster` throws `InvalidBundleError`, `getRoster` returns `null`.
`InvalidBundleError` is declared **inside** `roster-store.ts`, not reused from `roster-serializer.ts` — importing it would break D1's purity contract.

### D4 — Error dispatch by `err.name`, not `instanceof`

All offline error classes follow the existing `data-serializer-service.ts:36-50` pattern (`readonly name = 'X'` + `Object.setPrototypeOf`). `login.tsx` and `provision.tsx` map by `name`, so neither statically imports the service (D1). `instanceof` stays available for tests and for `provision.tsx`'s static graph. Pinned two-sided: a service test asserts each instance's `.name` literal; the login/provision tests drive the mapping.

### D5 — `app-layout.tsx` idle wiring, rewritten against the current 65-line file

Drift #2 resolved. Current file: one `useEffect` (23-32) inside `useAutoCollapseSidebar`, `<PaymentBanner />` at 48. **Insertion: a second custom hook `useOfflineIdleLock()` declared after `useAutoCollapseSidebar` (~line 36), called as the first statement of `AppLayout()` (current line 38). JSX at 40-58 is untouched.**

```tsx
function useOfflineIdleLock(): void {
  const authToken = useAuthStore((s) => s.user?.authToken);   // selector — matches payment-banner.tsx:21
  useEffect(() => {
    if (authToken !== OFFLINE_SESSION_TOKEN) return;          // online sessions: no timer, no listeners
    const timer = createIdleTimer(() => useAuthStore.getState().logout());
    timer.start();
    const notify = () => timer.notifyActivity();
    const events = ['mousedown', 'keydown', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, notify));
    document.addEventListener('visibilitychange', notify);
    return () => {
      events.forEach((e) => window.removeEventListener(e, notify));
      document.removeEventListener('visibilitychange', notify);
      timer.stop();
    };
  }, [authToken]);
}
```

`createIdleTimer` is a **static** import. *Alternative rejected*: dynamic `import()` inside the effect — it introduces a race where cleanup can run before the import resolves, i.e. a timer that arms after unmount. For a guard that must *never* fire on an online session, a static import of a side-effect-free 15-line module is the safer trade.
`logout()` is read via `getState()` in the callback (loaders.ts:9 convention), so no stale closure and no extra dep.
The existing `app-layout.test.tsx` mock already exposes both a selector-callable `useAuthStore` and `getState`, with `authToken: 'tok'` — evidence #4 lands in that file and the existing 10 tests keep passing unmodified.

### D6 — `loginOffline` returns the *hydrated* user

```ts
loginOffline: async (login, password) => {
  set({ isLoading: true, error: null });
  try {
    const { authenticateOffline } = await import('../../offline/offline-auth-service');
    const user = await authenticateOffline(login, password);
    get().setUser(user, user.authToken);         // the ONE hydration seam (auth-store.ts:114-121)
    set({ isLoading: false });
    return get().user as UserModel;              // stamped expiresIn, password:'' — same shape online login returns
  } catch (err) { set({ isLoading: false }); throw err; }
}
```
Online `login()` returns `getUserByToken()`'s hydrated user, not a raw DTO; returning `get().user` keeps that parity. Consequently `toUserModel` drops the plan's dead `bundleExpiresAt` parameter (`setUser` overwrites `expiresIn` at `auth-store.ts:115` unconditionally) and sets `expiresIn: 0`.

### D7 — Reuse, not re-invention

| Need | Reused from | Rejected |
|---|---|---|
| AES container | zip.js pattern of `data-serializer-service.ts` (single entry `roster.json`, password `` `${master}${storeId}` ``) | a second crypto container |
| Download | `export.tsx:61-67` Blob→createObjectURL→anchor→revoke, **inlined verbatim** in the roster panel | extracting a shared `downloadBlob()` helper — it would modify the already-verified sync export path for DRY alone, buying nothing here and risking a parity regression. Same pattern, not a second one. |
| Password/file form | `Card`/`Button`/`InfoBox`/`FileInput`/`EyeIcon` primitives, structured like `export-form.tsx` / `import-form.tsx` | reusing `~/sync/components/export-form` verbatim (wrong `SYNC.*` copy, cross-domain coupling) |
| Module name | keeping `roster-store.ts` (named by proposal, spec and rollback plan) with a header noting it is **not** a zustand store | renaming to `roster-storage.ts` — artifact drift for marginal gain |

## Control Flow — the mode fork (`login.tsx`, replacing lines 65-68)

```
handleSubmit
  ├ validate()                                        [unchanged, lines 59-63]
  ├ await import('~/shared/lib/offline/roster-store')  ← every submit; pure module (D1)
  ├ isRosterProvisioned() ── true ──► OFFLINE
  │     setIsSubmitting(true) → loginOffline(email, password)
  │       ok  → armTracking(); preloadHeavyChunks(); navigate(await resolveUserHomePath(user))
  │       err → setIsSubmitting(false); setErrors({ form: intl.formatMessage({ id: offlineErrorMessageId(err) }) })
  │     return                                        ← isOffline banner unreachable here, by design
  └ false ──► UNPROVISIONED — VERBATIM TODAY
        if (!ConnectivityService.isOnline()) { setIsOffline(true); return; }
        try { setIsSubmitting(true); const user = await login(...) ... }   [lines 70-109 untouched]
```

`offlineErrorMessageId` is a module-level helper switching on `err.name`: `OfflineInvalidPasswordError`/`OfflineUserNotFoundError` → `AUTH.INVALID_CREDENTIALS`; `OfflineUserInactiveError` → `AUTH.ACCOUNT_INACTIVE`; default (incl. `NoRosterError`, `OfflineVerifierError`) → `AUTH.SERVER_ERROR`. No new message ids on this path.

**`loginOffline` is destructured from the hook** — `const { login, loginOffline, isLoading } = useAuthStore();` (line 30) — **not** `useAuthStore.getState()`. See drift #3: the existing `login.test.tsx:7-9` mocks `useAuthStore` as a bare `vi.fn()` with **no `getState`**, so any `getState()` call reachable on the unprovisioned path crashes the existing suite. Destructuring is inert when the mock omits the key.

## Module Contracts

```ts
// offline-session.ts
export const OFFLINE_SESSION_TOKEN = 'offline-session';

// offline-crypto.ts
export const PBKDF2_HASH = 'SHA-256'; export const PBKDF2_KEY_BYTES = 32;
export const PBKDF2_SALT_BYTES = 16;  export const PBKDF2_ITERATIONS = 210_000; // generation only
export function sha256Base64(text: string): Promise<string>;
export function pbkdf2Base64(input: string, saltBase64: string, iterations: number): Promise<string>;
export function verifyOfflinePassword(password: string, v: OfflineVerifier): Promise<boolean>;

// roster-types.ts  (type-only module)
export interface OfflineVerifier { hash: string; salt: string; iterations: number }
export interface OfflineRosterUser {
  id: string; login: string; fullName: string; isActive: boolean;
  roles: StoreModuleFeatures[]; featureIds: number[]; storeModuleIds: number[];
  isSuperAdmin: boolean; isOwnerAdmin: boolean; isReSeller: boolean;
  selectedStoreId: string; verifier: OfflineVerifier;
}
export interface OfflineRosterBundle {
  bundleId: string; issuedAt: number; expiresAt: number;
  formatVersion: number; storeId: string; users: OfflineRosterUser[];
}

// roster-serializer.ts
export function serializeRoster(b: OfflineRosterBundle, master: string, storeId: string): Promise<Uint8Array>;
export function deserializeRoster(p: Uint8Array, master: string, storeId: string): Promise<OfflineRosterBundle>;
export class WrongPasswordError extends Error {}   export class CorruptFileError extends Error {}

// roster-store.ts   — ZERO runtime imports
export function importRoster(b: OfflineRosterBundle, now?: number): void;
export function getRoster(now?: number): OfflineRosterBundle | null;
export function findRosterUser(login: string, now?: number): OfflineRosterUser | null;
export function isRosterProvisioned(now?: number): boolean;   // = getRoster(now) !== null, never throws
export function clearRoster(): void;                          // REPLAY_KEY intentionally survives
export class ExpiredBundleError extends Error {} export class ReplayBundleError extends Error {}
export class InvalidBundleError extends Error {}
// keys: 'lizoft.offline-roster', 'lizoft.offline-roster-last'  (raw, not StorageKeys.entityKey —
// the roster is device-scoped, not store-scoped, and exists before any storeId is known)

// offline-auth-service.ts
export function authenticateOffline(login: string, password: string): Promise<UserModel>;
export class NoRosterError / OfflineUserNotFoundError / OfflineInvalidPasswordError
           / OfflineUserInactiveError / OfflineVerifierError extends Error {}

// idle-timeout.ts
export function createIdleTimer(onIdle: () => void, timeoutMs?: number /* = 3_600_000 */):
  { start(): void; stop(): void; notifyActivity(): void };

// roster-http-service.ts   — prefix VERIFIED /v1 (auth-http-service.ts:12, user-http-service.ts:39)
export const rosterHttpService = {
  getOfflineRoster(storeId: string): Promise<OfflineRosterBundle>;  // GET /v1/storeusers/{storeId}/offline-roster
};
```

`authenticateOffline` performs **exactly one** `getRoster()` read and searches `bundle.users` locally (no second read via `findRosterUser`) — removes a TOCTOU window where the bundle could expire between the two reads. `toUserModel` sets `cellPhone: ''`, `email: ''`, `password: ''`, `refreshToken: ''`, `authToken: OFFLINE_SESSION_TOKEN`, `expiresIn: 0`, and — **Drift #1** — `paymentDueDate: null`, `isInTrial: false`, `paymentStatus: 'NoAplica'` (matches `payment-banner.tsx:23`; the banner renders nothing for `NoAplica`).

## File Changes

| File | Action | Notes |
|---|---|---|
| `app/shared/lib/offline/{roster-types,offline-session,offline-crypto,roster-serializer,roster-store,offline-auth-service,idle-timeout}.ts` | Create | 7 leaf modules, graph per D1 |
| `app/shared/lib/http/roster-http-service.ts` | Create | mocked-transport tests only (see Honesty) |
| `app/auth/routes/provision.tsx` | Create | **no `clientLoader`** — `guestOnlyLoader` would redirect an authenticated admin away, and provisioning must work in any auth state. `auth-layout.tsx` has no loader of its own (verified). |
| `app/management/users/components/roster-export-panel.tsx` | Create | keeps `UserListPage` thin (plan: "do not restructure") |
| `app/auth/routes/login.tsx` | Modify | line 30 destructure + fork replacing 65-68 + module-level `offlineErrorMessageId` |
| `app/shared/lib/stores/auth-store.ts` | Modify | `AuthState.loginOffline` + action (D6). **No static `offline/` import.** |
| `app/shared/components/app-layout.tsx` | Modify | `useOfflineIdleLock()` per D5 |
| `app/management/users/routes/user-list.tsx` | Modify | `const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '')` (selector — `export.tsx:16` convention, **not** the plan's `getState()`); panel toggle disabled when `!isOnline` (existing `useOnlineStatus`, line 16) or `!storeId` |
| `app/routes.ts` | Modify | `route('auth/provision', 'auth/routes/provision.tsx')` inside the guest layout (after line 25) |
| `app/shared/lib/i18n/es.ts` | Modify | **NEW — no plan task covers this.** 4 distinct `PROVISION.ERROR_*` ids (spec requires one per failure mode) + `PROVISION.*` labels/success + `USERS.EXPORT_ROSTER*`. Single catalog; a missing id renders the raw id. |

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | crypto KAT (D2), serializer round-trip + wrong master, roster expiry/replay/**shape guard** (D3), `authenticateOffline` 4 error paths + billing defaults, `createIdleTimer` | Vitest + real `crypto.subtle` under jsdom (no mock — if the KAT fails, stop and report) + `vi.useFakeTimers()` |
| Purity (D1) | `roster-store` import-time behavior **and** source shape | localStorage spy → 0 calls; source scan → every `import` line starts with `import type` |
| Integration | `login.offline.test.tsx` Suite A (provisioned: offline→ok, **online→still offline, `login` never called**, wrong pw→`AUTH.INVALID_CREDENTIALS`) / Suite B (unprovisioned: online→`login` only; offline→banner, neither action) | mirrors `login.test.tsx` render setup, with `getState` added to the local mock |
| Integration | `auth-store.offline.test.ts` hydration through `setUser`; `app-layout` no-timer-when-`authToken !== 'offline-session'`; `provision.test.tsx` real-serializer file + per-error messaging | jsdom |
| Regression | zero edits to existing test files | **any required edit is a regression, not maintenance** |
| Manual | plan Task 10 steps 1-9 | steps 1-2 blocked on §7a; true-offline `/login` steps depend on `pwa-offline-shell` |

Gates: `pnpm test`, `pnpm -C apps/web-store-pos exec tsc --noEmit`, `pnpm -C apps/web-store-pos build`. Strict TDD: test first, watch it fail, implement.

## Migration / Rollout

No migration. Reverting the `login.tsx` fork commit alone restores today's behavior for **all** devices — the fork is the only thing that can select offline mode. Provisioned devices retain two inert `localStorage` keys. At-rest encryption is not blocked: it will use its own expiry-**independent** predicate, and `getRoster`/`isRosterProvisioned` are the only readers of the stored bundle, so a future decrypt step has exactly one insertion point.

## Honesty — what Task 8 cannot prove

`GET /v1/storeusers/{storeId}/offline-roster` does not exist (0% backend, §7a). Unit tests prove only that the frontend calls that exact URL and unwraps `response.data.data`. **Unproven until the backend ships**: the real response envelope; DTO field names/casing; whether `issuedAt`/`expiresAt` are epoch ms or ISO strings (D3 turns this from a silent forever-valid bundle into a loud `InvalidBundleError`); whether `users[].verifier` exists and uses the D2 parameters. The full export → provision → offline-login loop is **not end-to-end verifiable in this change** and must be recorded as blocked, not skipped.

## New drift found beyond the two known

| # | Finding | Resolution |
|---|---|---|
| 3 | `login.test.tsx:7-9` mocks `useAuthStore` as a bare `vi.fn()` with **no `getState`** — the plan's `useAuthStore.getState().loginOffline(...)` is a landmine | destructure from the hook (fork section) |
| 4 | Plan Task 8 uses `useAuthStore.getState()` in `user-list.tsx`; codebase convention is the selector hook (`export.tsx:16`, `payment-banner.tsx:21`) | selector hook |
| 5 | **No plan task adds i18n ids**, yet the spec requires 4 distinct provisioning failure messages + an export label; `es.ts` is the single catalog | `es.ts` added to File Changes |
| 6 | `app-layout.test.tsx` exists (10 tests, plan never mentions it); its mock exposes selector + `getState` with `authToken: 'tok'` | evidence #4 lands there; D5 keeps all 10 green |
| 7 | `expiresAt` compared numerically with no type guard → an ISO-string bundle is valid **forever** | D3 shape guard + `InvalidBundleError` |
| 8 | `toUserModel(u, bundleExpiresAt)` — the param is dead (`setUser` overwrites `expiresIn`, `auth-store.ts:115`) | dropped; D6 |
| 9 | Plan Task 8 leaves the `/v1` vs `/api/v1` prefix open | **resolved: `/v1`** (`auth-http-service.ts:12`, `user-http-service.ts:39`) |
| 10 | Plan Task 3's step-1 test carries a broken placeholder (`getRoster.call(null)`); the plan flags it inline but the checkbox body still contains it | write the test as `expect(getRoster(20_000)).toBeNull()` |

## Open Questions

- [ ] None blocking. Product-level acceptance of a silent payment banner offline is already encoded in the proposal/spec (backend §7b).
