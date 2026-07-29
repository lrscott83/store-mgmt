# Tasks: Offline Authentication — Frontend (React PWA)

**Change**: `offline-auth-frontend` · **Phase**: tasks · **Date**: 2026-07-28
**Artifact store**: hybrid (this file + engram `sdd/offline-auth-frontend/tasks`)
**Inputs**: spec (`specs/{offline-roster-bundle,offline-auth-mode,offline-device-provisioning,auth-session}/spec.md`, engram #1617), design (`design.md`, engram #1618), plan (`docs/plans/2026-07-25-offline-auth-frontend-plan.md`), proposal (#1616), explore (#1615).
**Scope**: FRONTEND ONLY. Target app: `frontend-react/apps/web-store-pos`.
**Delivery**: commits-only, one commit per work unit, on a **new branch created from the current branch** (`main` at time of writing). No PRs, no chained-PR machinery, no `size:exception` bookkeeping.
**Strict TDD**: every task producing logic is red → green. Test: `pnpm test`. Typecheck: `pnpm -C apps/web-store-pos exec tsc --noEmit`. Build: `pnpm -C apps/web-store-pos build`.

This task list encodes the DESIGN, not the plan. Ten corrections from the design supersede the plan's originals (see "Design corrections applied" below) — where they conflict, the design wins.

## Design corrections applied (do not carry over the plan's originals)

1. `toUserModel` sets `paymentDueDate: null`, `isInTrial: false`, `paymentStatus: 'NoAplica'` as required fields (not an optional `bundleExpiresAt` param — that param is DROPPED; `expiresIn: 0`, stamped over by `setUser` anyway).
2. Task 9 idle-timer wiring targets the REAL 65-line `app-layout.tsx`: `useOfflineIdleLock()` declared after `useAutoCollapseSidebar`, called as the first statement of `AppLayout()`, JSX untouched, `createIdleTimer` imported STATICALLY. All 10 existing `app-layout.test.tsx` tests stay green.
3. No `useAuthStore.getState()` on any path reachable from an unprovisioned device (`login.test.tsx:7-9` mocks the store as a bare `vi.fn()` with no `getState` — it would crash). `loginOffline` is destructured from the hook.
4. `user-list.tsx` uses the selector hook (`export.tsx:16`, `payment-banner.tsx:21` convention), never `getState()`.
5. i18n ids are a separate, real seam: 4 provisioning failure messages + an export label go in `es.ts` (single catalog). Own task.
6. Bundle expiry needs a shape guard before the numeric comparison (`InvalidBundleError` declared INSIDE `roster-store`, not reusing `CorruptFileError`) — otherwise an ISO-string `expiresAt` compares as `NaN`/false and an expired bundle stays valid forever.
7. HTTP base path is `/v1`, not `/api/v1` (verified: `auth-http-service.ts:12`, `user-http-service.ts:39`).
8. Plan Task 3 step-1's broken `getRoster.call(null)` placeholder is dropped; the real test is `expect(getRoster(20_000)).toBeNull()`.
9. `app-layout.test.tsx` exists (10 tests, mock exposes both selector-callable `useAuthStore` and `getState`, `authToken: 'tok'`) — accounted for in Task 9.
10. The headline invariant is enforced structurally by the module dependency graph — this is a TEST (structural source-scan), not a comment. Own task, ordered early.

---

## Task 0 — Branch setup

- [x] **0.1** Create a new branch from the current branch (do NOT branch from `main` unless already on it): `git checkout -b feat/offline-auth-frontend`. No commit in this task; it only establishes the workspace.

**Depends on**: nothing. **Parallel**: n/a (must run first). **Satisfies**: delivery constraint (commits-only on a new branch).

---

## Task 1 — Web Crypto utilities (SHA-256, PBKDF2, verify)

**Files**: create `app/shared/lib/offline/offline-crypto.ts`, `app/shared/lib/offline/__tests__/offline-crypto.test.ts`.

- [x] **1.1** RED: write the KAT tests — `sha256Base64('test') === 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg='`; `pbkdf2Base64` determinism + 32-byte output; `verifyOfflinePassword` true/false. Run `pnpm test -- offline-crypto` and confirm FAIL (module not found).
- [x] **1.2** GREEN: implement `sha256Base64`, `pbkdf2Base64`, `verifyOfflinePassword` per design D2 (PBKDF2-HMAC-SHA256, 210000 iterations generation-time default, real `crypto.subtle` — no mock). Run tests, confirm PASS.
- [x] **1.3** Commit: `feat(offline): add web crypto SHA-256 + PBKDF2 verify utilities`.

**Satisfies**: `offline-roster-bundle` — "Verifier parameters are pinned by known-answer vectors".
**Depends on**: Task 0. **Parallel with**: none (first leaf module). **Sequential before**: Task 4.

---

## Task 2 — Structural purity guard for `roster-store` (STRUCTURAL SOURCE-SCAN TEST — landed early per design)

**Files**: create `app/shared/lib/offline/roster-types.ts` (types only), a placeholder/skeleton for `app/shared/lib/offline/roster-store.ts` sufficient for the guard to target, `app/shared/lib/offline/__tests__/roster-store.purity.test.ts`.

This task exists to protect the seam BEFORE the rest of `roster-store` is built out (design D1, correction #10): the invariant is enforced by the module dependency graph, and the test must exist early enough to fail loudly if a later task violates it.

- [x] **2.1** RED: write two tests against `roster-store.ts` — (a) behavioral: install a `localStorage` spy, `import()` the module, assert zero reads/zero writes; (b) structural: read `roster-store.ts` as source text (e.g. `fs.readFileSync` in the test, or Vite's `?raw` import) and assert every line starting with `import` also contains `import type`. Confirm FAIL (module doesn't exist yet, or a stub with a runtime import fails the structural assertion).
- [x] **2.2** GREEN: create `roster-types.ts` (`OfflineVerifier`, `OfflineRosterUser`, `OfflineRosterBundle` — type-only, erased at compile time) and a minimal `roster-store.ts` that imports ONLY `import type { OfflineRosterBundle, OfflineRosterUser } from './roster-types'` and exports empty/throwing stubs for `importRoster`, `getRoster`, `findRosterUser`, `isRosterProvisioned`, `clearRoster` (real bodies land in Task 3). Confirm both tests PASS.
- [x] **2.3** Commit: `test(offline): guard roster-store purity with a structural source scan`.

**Satisfies**: `offline-roster-bundle` — "Roster storage module has no top-level side effects" (the load-bearing test for design D1).
**Depends on**: Task 0. **Parallel with**: Task 1 (independent leaf modules). **Sequential before**: Task 3 (Task 3 fills in the real bodies this guard already protects).

---

## Task 3 — Roster bundle serializer (encrypt/decrypt container)

**Files**: create `app/shared/lib/offline/roster-serializer.ts`, `app/shared/lib/offline/__tests__/roster-serializer.test.ts`.

- [x] **3.1** RED: round-trip test (serialize with master `'m'` + storeId `'s1'`, deserialize with same → deep-equal) and wrong-master test (→ `WrongPasswordError`). Confirm FAIL.
- [x] **3.2** GREEN: implement `serializeRoster`/`deserializeRoster` per design D7 — single-entry `roster.json`, zip.js AES, password = `` `${master}${storeId}` `` (master first), `configure({ useWebWorkers: false })` as a top-level QUARANTINED side effect (this module is NOT `roster-store`, so it may have one — only `roster-store` is purity-constrained). `WrongPasswordError`/`CorruptFileError` follow the `data-serializer-service.ts:36-50` pattern (`readonly name` + `Object.setPrototypeOf`). Confirm PASS.
- [x] **3.3** Commit: `feat(offline): add encrypted roster bundle serializer`.

**Satisfies**: `offline-roster-bundle` — "Bundle container round-trips losslessly".
**Depends on**: Task 2 (roster-types). **Parallel with**: Task 1. **Sequential before**: Task 7 (provisioning), Task 8 (export).

---

## Task 4 — Roster storage: anti-replay, expiry, and the D3 shape guard

**Files**: fill in `app/shared/lib/offline/roster-store.ts` (real bodies replacing Task 2's stubs), extend `app/shared/lib/offline/__tests__/roster-store.test.ts`.

- [x] **4.1** RED: write the full behavioral suite — fresh import + read (`getRoster`/`findRosterUser`), reject expired-at-import (`ExpiredBundleError`), reject replay (`ReplayBundleError` on same `bundleId`), reject older-or-equal `issuedAt`, accept a strictly newer bundle, **and the D3 shape-guard cases**: `importRoster` throws `InvalidBundleError` when `bundleId`/`issuedAt`/`expiresAt`/`users` don't match their expected types (e.g. an ISO-string `expiresAt`); `getRoster` returns `null` (not throw) on the same malformed shapes. Use the corrected test from design correction #8: `expect(getRoster(20_000)).toBeNull()` — do NOT carry over the plan's broken `getRoster.call(null)` placeholder. Confirm FAIL.
- [x] **4.2** GREEN: implement `importRoster`, `getRoster`, `findRosterUser`, `isRosterProvisioned` (`= getRoster(now) !== null`, never throws), `clearRoster` (REPLAY_KEY intentionally survives). Add the shape guard (`typeof bundleId === 'string' && typeof issuedAt === 'number' && typeof expiresAt === 'number' && Array.isArray(users)`) before any numeric comparison in both `importRoster` and `getRoster`. Declare `InvalidBundleError` INSIDE `roster-store.ts` (not reused from `roster-serializer.ts` — would break the purity contract from Task 2). Keys: `'lizoft.offline-roster'`, `'lizoft.offline-roster-last'` (raw strings, not `StorageKeys.entityKey` — device-scoped, pre-storeId). Re-run Task 2's purity tests to confirm they still pass (the file still imports only `import type`). Confirm all PASS.
- [x] **4.3** Commit: `feat(offline): persist roster with anti-replay, expiry, and shape guard`.

**Satisfies**: `offline-roster-bundle` — "isRosterProvisioned() mode predicate", "Anti-replay on roster import" (+ D3's unwritten-but-load-bearing shape guard, which the spec's expiry requirement depends on for correctness).
**Depends on**: Task 2, Task 3 (types). **Sequential before**: Task 5 (auth service), Task 6 (login fork), Task 7 (provisioning).

---

## Task 5 — Offline auth service (verify password, map to `UserModel`)

**Files**: create `app/shared/lib/offline/offline-auth-service.ts`, `app/shared/lib/offline/__tests__/offline-auth-service.test.ts`.

- [x] **5.1** RED: 4 error-path tests (right password → hydrated `UserModel`; wrong password → `OfflineInvalidPasswordError`; unknown login → `OfflineUserNotFoundError`; inactive user → `OfflineUserInactiveError`) plus a billing-defaults assertion. Confirm FAIL.
- [x] **5.2** GREEN: implement `authenticateOffline(login, password)` — **exactly one** `getRoster()` read (no second read via `findRosterUser`, closing the TOCTOU window per design), search `bundle.users` locally, `verifyOfflinePassword` from Task 1. `toUserModel` maps: `cellPhone: ''`, `email: ''`, `password: ''`, `refreshToken: ''`, `authToken: OFFLINE_SESSION_TOKEN` (from `offline-session.ts` — create this 1-const, zero-import module now if not already present), `expiresIn: 0`, and per **design correction #1**: `paymentDueDate: null`, `isInTrial: false`, `paymentStatus: 'NoAplica'` (matches `payment-banner.tsx:23` — the banner renders nothing for `NoAplica`). The plan's dead `bundleExpiresAt` parameter is DROPPED — do not add it. Error classes (`NoRosterError`, `OfflineUserNotFoundError`, `OfflineInvalidPasswordError`, `OfflineUserInactiveError`, `OfflineVerifierError`) follow the `readonly name` + `Object.setPrototypeOf` pattern (design D4) so `login.tsx` can dispatch by `err.name` without a static import. Confirm PASS.
- [x] **5.3** Commit: `feat(offline): verify password against roster and map to UserModel`.

**Satisfies**: `offline-auth-mode` — "A user absent from the roster is rejected like a wrong password", "Offline-hydrated UserModel carries no-billing-data defaults".
**Depends on**: Task 1, Task 4. **Sequential before**: Task 6, Task 7.

---

## Task 6 — `loginOffline` action on the auth store (D6 hydration)

**Files**: modify `app/shared/lib/stores/auth-store.ts`, create `app/shared/lib/stores/__tests__/auth-store.offline.test.ts`.

- [x] **6.1** RED: import a bundle via `importRoster`, call `useAuthStore.getState().loginOffline('ana', 'secret')`, assert `isAuthenticated === true`, `user.id` matches, and the same storage keys (`TOKEN`/`CURRENT_USER`/`AUTH_MODEL`) are written as an online login would write (per `auth-session` spec's "loginOffline hydrates through the existing setUser seam" requirement). Confirm FAIL (`loginOffline` not a function).
- [x] **6.2** GREEN: add `loginOffline: (login, password) => Promise<UserModel>` to `AuthState`. Implementation per design D6 — dynamic `import('../../offline/offline-auth-service')` inside the action (auth-store.ts is evaluated at module load by everything, per D1's edge table, so it MUST keep zero static `offline/` imports), call `authenticateOffline`, hydrate via `get().setUser(user, user.authToken)` (the ONE hydration seam), return `get().user as UserModel` — NOT the raw `user` — so the returned shape matches what online `login()` returns (stamped `expiresIn`, `password: ''`). Confirm the cold-boot invariant (synchronous `set()` before any `await`, `auth-store.ts:204-222`) is untouched — this action only adds a new method, no module-load change. Confirm PASS.
- [x] **6.3** Commit: `feat(offline): add loginOffline action hydrating via setUser`.

**Satisfies**: `auth-session` — "loginOffline hydrates through the existing setUser seam".
**Depends on**: Task 5. **Sequential before**: Task 7.

---

## Task 7 — Offline mode fork in `login.tsx`

**Files**: modify `app/auth/routes/login.tsx`, create `app/auth/routes/__tests__/login.offline.test.tsx`.

- [x] **7.1** RED: write Suite A (provisioned device) — A1 offline+submit → `loginOffline` called, navigates home; A2 **online**+submit → `loginOffline` called ANYWAY and the online `login` action is **never** called (pins "the file decides, not the network" per `offline-auth-mode`'s "Mode switch, not a fallback"); A3 wrong password → `setErrors({ form: 'AUTH.INVALID_CREDENTIALS' })`, no navigate. Write Suite B (unprovisioned device, localStorage cleared) — B1 online+submit → online `login` called, `loginOffline` never called; B2 offline+submit → `AUTH.OFFLINE_LOGIN` banner renders, neither action called. Mirror `login.test.tsx`'s render setup, adding `getState` to the local mock ONLY where Suite A needs it — Suite B must pass against the EXISTING bare `vi.fn()` mock shape (`login.test.tsx:7-9`) unmodified, proving design correction #3. Confirm FAIL.
- [x] **7.2** GREEN: replace lines 65-68 (`if (!ConnectivityService.isOnline()) { setIsOffline(true); return; }`) with the mode fork per design's Control Flow section: `await import('~/shared/lib/offline/roster-store')` on every submit (pure module per Task 2/4's purity guard) → `isRosterProvisioned()` check first; if true, offline branch (`setIsSubmitting(true)` → **destructure `loginOffline` from the hook at line 30**, i.e. `const { login, loginOffline, isLoading } = useAuthStore();` — NOT `useAuthStore.getState()` — per design correction #3 → success: `armTracking()`; `preloadHeavyChunks()`; `navigate(await resolveUserHomePath(user))` → failure: `setIsSubmitting(false)`; `setErrors({ form: intl.formatMessage({ id: offlineErrorMessageId(err) }) })`) and return; if false, fall through to the UNCHANGED original connectivity check + online login block (lines 65-109 stay verbatim). Add module-level `offlineErrorMessageId(err)` mapping by `err.name` (design D4, no `instanceof`, no static import of `offline-auth-service`): `OfflineInvalidPasswordError`/`OfflineUserNotFoundError` → `AUTH.INVALID_CREDENTIALS`; `OfflineUserInactiveError` → `AUTH.ACCOUNT_INACTIVE`; default (incl. `NoRosterError`, `OfflineVerifierError`) → `AUTH.SERVER_ERROR`. No new message ids on this path. Confirm PASS, then run the EXISTING `login.test.tsx` and confirm it is still 100% green with zero edits (regression check).
- [x] **7.3** Commit: `feat(offline): authenticate against roster when the file decides offline mode`.

**Satisfies**: `offline-auth-mode` — "Mode switch, not a fallback", "An unprovisioned device is byte-for-byte unchanged", "An expired bundle falls back to online auth", "Offline error mapping onto existing message ids".
**Depends on**: Task 4, Task 6. **Sequential before**: Task 11 (manual smoke references this fork).

---

## Task 8 — i18n ids for provisioning + export (own task per design correction #5)

**Files**: modify `app/shared/lib/i18n/es.ts`.

No plan task covers this; the spec requires 4 distinct provisioning failure messages plus an export label, and `es.ts` is the single catalog — a missing id renders the raw id on screen.

- [x] **8.1** RED: in Task 9's provisioning tests (written next), assert the rendered failure text is the catalog string, not the raw id (e.g. `expect(screen.queryByText(/PROVISION\./)).toBeNull()` after a wrong-master submit). This can be written as part of Task 9.1, but the id additions land here first so Task 9 can consume them; if sequencing red/green strictly, add a standalone `es.ts` shape test asserting all required keys exist: `PROVISION.ERROR_WRONG_PASSWORD`, `PROVISION.ERROR_CORRUPT_FILE`, `PROVISION.ERROR_EXPIRED`, `PROVISION.ERROR_REPLAY`, plus `PROVISION.TITLE`/`PROVISION.SUCCESS`/`PROVISION.STORE_ID_LABEL`/`PROVISION.MASTER_PASSWORD_LABEL`/`PROVISION.FILE_LABEL`/`PROVISION.SUBMIT` (whatever the provision form template needs) and `USERS.EXPORT_ROSTER` (export button label). Confirm FAIL for any missing key.
- [x] **8.2** GREEN: add the ids to `es.ts` (single catalog, no other locale file exists in this codebase per the grep of `AUTH.*`/`USERS.*`/`SYNC.*` — provisioning gets its own `PROVISION.*` namespace, not reusing `SYNC.*`, since its copy is domain-specific). Confirm PASS.
- [x] **8.3** Commit: `feat(offline): add i18n ids for device provisioning and roster export`.

**Satisfies**: `offline-device-provisioning` — "Provisioning surfaces a distinct message per failure mode" (the message-copy half of that requirement).
**Depends on**: Task 0. **Parallel with**: Tasks 1-7 (pure content addition, no code dependency — but sequenced before Task 9 so the provisioning route has ids to reference).
**Sequential before**: Task 9, Task 10.

---

## Task 9 — Device provisioning route (`auth/provision`)

**Files**: create `app/auth/routes/provision.tsx`, modify `app/routes.ts`, create `app/auth/routes/__tests__/provision.test.tsx`.

- [x] **9.1** RED: render `<Provision/>`, build a real `File` via `serializeRoster(bundle, 'master', 's1')` (real serializer, not mocked), fill storeId + master password, submit → assert `getRoster()?.bundleId === bundle.bundleId` and `isRosterProvisioned()` becomes true. Add 4 distinct failure-mode tests: wrong master → `WrongPasswordError` message shown, nothing imported; corrupt file → `CorruptFileError` message; already-expired bundle → `ExpiredBundleError` message; replayed bundle (import once, submit same file again) → `ReplayBundleError` message, previously stored roster unchanged. Mirror `app/sync/components/__tests__/import-form.test.tsx` interaction style. Confirm FAIL.
- [x] **9.2** GREEN: implement the route modeled on `app/sync/routes/import.tsx` + `import-form.tsx` — file input, storeId field, master password field (show/hide, `EyeIcon`/`EyeOffIcon` per existing convention). No `clientLoader` (a `guestOnlyLoader` would redirect an authenticated admin away, and provisioning must work in any auth state; `auth-layout.tsx` has no loader of its own per design verification). On submit: `deserializeRoster` → `importRoster` → success message (`PROVISION.SUCCESS` from Task 8) + link to `/login`; catch each of the 4 error classes by `name` and show the matching `PROVISION.ERROR_*` id. Register the route in `app/routes.ts` inside the guest `auth-layout` group (after line 25, alongside `login`/`register`), matching the existing `route(...)` call signature. Confirm PASS.
- [x] **9.3** Commit: `feat(offline): add device provisioning route for importing a roster bundle`.

**Satisfies**: `offline-device-provisioning` — "Guest provisioning route imports a roster bundle", "Provisioning surfaces a distinct message per failure mode".
**Depends on**: Task 4 (roster-store real bodies), Task 3 (serializer), Task 8 (i18n ids).
**Parallel with**: Task 10 (independent route/file). **Sequential before**: Task 11.

---

## Task 10 — Admin "Export offline roster" action

**Files**: create `app/shared/lib/http/roster-http-service.ts`, `app/shared/lib/http/__tests__/roster-http-service.test.ts`, modify `app/management/users/routes/user-list.tsx`.

**BLOCKED-for-verification**: `GET /v1/storeusers/{storeId}/offline-roster` does not exist yet (backend backlog §7a, 0% implemented). This task is buildable and unit-testable against a mocked transport, but it is **never to be marked done-and-proven end-to-end**. Unit tests prove only the URL called and the `response.data.data` unwrapping. The real response envelope, DTO field casing, whether `issuedAt`/`expiresAt` are epoch-ms or ISO strings, and whether `users[].verifier` exists at all remain unproven until the backend ships. Record this status explicitly in the apply-progress and verify-report artifacts — do not let it read as "done".

- [x] **10.1** RED: mock `apiClient.get` to resolve `{ data: { data: bundle, succeeded: true, ... } }`; assert `rosterHttpService.getOfflineRoster('s1')` calls `apiClient.get('/v1/storeusers/s1/offline-roster')` (prefix **verified `/v1`**, not `/api/v1`, against `auth-http-service.ts:12` and `user-http-service.ts:39` — design correction #7) and returns the unwrapped bundle. Confirm FAIL.
- [x] **10.2** GREEN: implement `rosterHttpService.getOfflineRoster` mirroring `auth-http-service.ts`'s shape. Confirm PASS (unit-level only, per the BLOCKED note above).
- [x] **10.3** RED: `user-list.tsx` test — assert the "Export offline roster" button is disabled when `!isOnline` (existing `useOnlineStatus`, line 16) or when `storeId` is empty. Confirm FAIL.
- [x] **10.4** GREEN: wire the button into the existing header (`flex items-center justify-between` block, lines 54-58) using **the selector hook, not `getState()`** (design correction #4, matching `export.tsx:16`/`payment-banner.tsx:21`): `const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '')`. On click: prompt for master password (reuse the show/hide password field pattern from `export-form.tsx` — do not roll a new design), call `rosterHttpService.getOfflineRoster(storeId)`, `serializeRoster(bundle, master, storeId)`, then download via the **exact** `export.tsx:61-67` pattern (`Blob` → `URL.createObjectURL` → `<a download>` → `URL.revokeObjectURL`) **inlined verbatim** here — design D7 explicitly rejects extracting a shared `downloadBlob()` helper, since that would touch the already-verified sync export path for DRY alone. Filename e.g. `roster-${storeId}.smcabundle`. Confirm PASS.
- [x] **10.5** Commit: `feat(offline): add admin export of encrypted roster bundle (unit-verified only, blocked on backend §7a)`.

**Satisfies**: `offline-device-provisioning` — "Admin export action produces a downloadable encrypted bundle" (buildable/unit-testable half only — explicitly NOT the end-to-end scenario, per that spec's own verification note).
**Depends on**: Task 3 (serializer), Task 8 (i18n export label). **Parallel with**: Task 9. **Sequential before**: Task 11.

---

## Task 11 — 1-hour inactivity lock (offline sessions only)

**Files**: create `app/shared/lib/offline/idle-timeout.ts`, `app/shared/lib/offline/__tests__/idle-timeout.test.ts`, create `app/shared/lib/offline/offline-session.ts` (if not already added in Task 5), modify `app/shared/components/app-layout.tsx`.

- [x] **11.1** RED: `createIdleTimer` tests with fake timers — fires `onIdle` after timeout with no activity; resets countdown on `notifyActivity()`; does not fire after `stop()`. Confirm FAIL.
- [x] **11.2** GREEN: implement `createIdleTimer(onIdle, timeoutMs = 3_600_000)` returning `{ start(), stop(), notifyActivity() }` — plain `setTimeout`/`clearTimeout`, zero imports (design D1's leaf-module table). Confirm PASS.
- [x] **11.3** RED: extend `app-layout.test.tsx` (10 existing tests must NOT be modified) with new cases for `useOfflineIdleLock` — offline session (`authToken === 'offline-session'`) arms the timer and 1h of fake-timer-advance + no activity invokes `logout()`; online session (`authToken !== 'offline-session'`) never arms a timer, verified by advancing timers and asserting `logout()` is never called. The existing mock (`vi.hoisted` shape at lines 7-42, exposing both selector-callable `useAuthStore` and `getState`, `authToken: 'tok'`) already supports this — reuse it, add a second mock user/state variant for the offline case rather than mutating the existing one. Confirm FAIL (new tests only; run the full file and confirm the 10 pre-existing tests are unaffected even while failing on the new ones).
- [x] **11.4** GREEN: implement per design D5 exactly — `useOfflineIdleLock()` declared as a second custom hook AFTER `useAutoCollapseSidebar` (~line 36), called as the **first statement** of `AppLayout()` (current line 38), JSX at lines 40-58 **untouched**. Selector: `useAuthStore((s) => s.user?.authToken)` (matches `payment-banner.tsx:21` convention). Guard: `if (authToken !== OFFLINE_SESSION_TOKEN) return;` inside the effect — no timer, no listeners for online sessions. `createIdleTimer` imported **statically** at the top of the file (a dynamic `import()` inside the effect would race cleanup — a timer could arm after unmount; design explicitly rejects this for a guard that must never fire on an online session). `logout()` read via `useAuthStore.getState().logout()` inside the timer callback only (loaders.ts:9 convention — no stale closure, no extra dep). Activity listeners: `mousedown`/`keydown`/`touchstart` on `window`, `visibilitychange` on `document`; cleanup removes all + `timer.stop()`. Confirm ALL 10 existing `app-layout.test.tsx` tests plus the new ones from 11.3 PASS — zero modifications to the pre-existing 10 assertions.
- [x] **11.5** Commit: `feat(offline): lock offline sessions after one hour of inactivity`.

**Satisfies**: `auth-session` — "Idle lock scoped strictly to offline sessions", and the "Logout Storage-Clear Scope" MODIFIED requirement's "Offline idle-lock logout preserves the roster" scenario (verify `isRosterProvisioned()` still true after the idle-triggered `logout()` — `clearRoster()` is never called from this path).
**Depends on**: Task 6 (`OFFLINE_SESSION_TOKEN` sentinel / `offline-session.ts`), Task 4 (`isRosterProvisioned` for the post-logout assertion). **Parallel with**: Tasks 9-10. **Sequential before**: Task 12.

---

## Task 12 — Full-suite green + gates

- [x] **12.1** Run `pnpm test` from the repo root (or `frontend-react/apps/web-store-pos` per the plan's original scope) — confirm 100% green including the pre-existing `auth-store`, `loaders.cold-boot`, `data-serializer-service`, and `login` suites (zero regressions; **any required edit to an existing test file is a regression, not maintenance**, per design's Testing Strategy table).
- [x] **12.2** Run `pnpm -C apps/web-store-pos exec tsc --noEmit` — confirm zero type errors.
- [x] **12.3** Run `pnpm -C apps/web-store-pos build` — confirm build succeeds.
- [x] **12.4** Commit only if any gate required a fix not yet committed; otherwise this task produces no diff (verification-only).

**Depends on**: Tasks 1-11 all complete. **Sequential before**: Task 13.

---

## Task 13 — Manual smoke checklist (documented, not automated) + acceptance-reality flag

**This task cannot be closed as "done" by an agent** — it requires a human with a real device/browser. Record results wherever the team tracks manual QA (PR description, or this file's checkbox state left unchecked with a note).

- [ ] **13.1** As OwnerAdmin, online → click "Export offline roster" → downloads `roster-*.smcabundle`. **NOTE: this step is currently BLOCKED — `GET /v1/storeusers/{storeId}/offline-roster` does not exist server-side (§7a, 0% implemented). This step cannot be honestly executed until the backend ships.**
- [ ] **13.2** On a second device, `/auth/provision` → import with the master password → success message, link to `/login`. **Also BLOCKED on 13.1** (needs a real exported file — a manually-crafted bundle can substitute for a partial check, but that is not the real flow).
- [ ] **13.3** Go offline (devtools) → `/login` with a roster user → lands on their home; permissions/menu match online. **FLAGGED DEPENDENCY: `pwa-offline-shell` is merged but NOT archived, and its own manual offline walkthrough is still pending** — true offline `/login` (i.e. the app shell itself loading with no network) may not be honestly executable yet. Do not assume this works; verify `pwa-offline-shell`'s own smoke first, or note this step as blocked-pending-that-change if it hasn't been walked.
- [ ] **13.4** Wrong password offline → same error surface as an online invalid login (`AUTH.INVALID_CREDENTIALS`).
- [ ] **13.5** Re-import the SAME file → `ReplayBundleError` message, no change to stored roster.
- [ ] **13.6** Leave idle 1h (or temporarily lower `timeoutMs` for the walkthrough) → redirected to `/login`; roster still present (`isRosterProvisioned()` true); re-login with password only.
- [ ] **13.7** **Unprovisioned-device regression pass** — the default state of every device, no roster ever imported: online login works exactly as before; offline shows the existing `AUTH.OFFLINE_LOGIN` banner and nothing else changes; no idle lock arms; no new screen or gate appears anywhere. This is the byte-for-byte invariant — the automated tests in Task 7 and Task 11 already assert the code-level version of this; this manual pass is the human-eyes confirmation on a real build.
- [ ] **13.8** **Mode-switch pass** — provisioned device WITH internet: import the bundle, stay online, log in → login goes through the roster (offline path), NOT through `POST /login`. Confirm in the Network tab that no login request leaves the device.
- [ ] **13.9** **Expiry pass** — let the bundle pass `expiresAt` (or edit it) → device falls back to online auth; user logs in normally with internet; not locked out.
- [x] **13.10** Commit any smoke-checklist notes/results doc: `docs(offline): record offline-auth frontend smoke checklist results`. **DONE**: see `docs/plans/2026-07-28-offline-auth-frontend-smoke-checklist.md` — records that 13.1-13.9 remain unexecuted/pending a human, with 13.1-13.2 structurally blocked on backend §7a and 13.3 flagged on `pwa-offline-shell`'s pending walkthrough.

**Acceptance reality**: Steps 13.1-13.2 are structurally blocked on backend §7a shipping (0% implemented — not a testing gap, an absent endpoint). Step 13.3 depends on `pwa-offline-shell`'s own pending manual walkthrough. Do not report this SDD change as fully manually verified until both dependencies clear — report it as **code-complete, automated-tests-green, manual smoke partially blocked**.

**Depends on**: Task 12 (all gates green). Terminal task.

---

## Task ordering summary (dependency graph)

```
0 (branch)
 ├─► 1 (crypto)                                   ─┐
 ├─► 2 (roster-types + purity guard, STRUCTURAL)  ─┤
 │     └─► 3 (serializer)                          ├─► 4 (roster-store real bodies)
 │                                                  │      ├─► 5 (auth service) ─► 6 (loginOffline) ─► 7 (login.tsx fork) ─┐
 └─► 8 (i18n ids, parallel with 1-7)               ─┘      │                                                              │
                                                             ├─► 9 (provisioning route)  ─┐                              │
                                                             ├─► 10 (admin export, BLOCKED-for-verification) ─┤          │
                                                             └─► 11 (idle lock)  ─────────┘                    │
                                                                                                                 ▼
                                                                                    12 (full-suite gates) ─► 13 (manual smoke)
```

**Parallelizable**: Task 8 (i18n) can run alongside Tasks 1-7 (no code dependency, only sequenced before the routes that consume its ids). Tasks 9, 10, 11 can run in parallel once Task 4 (and their individual deeper deps: 3/8 for 9, 3/8 for 10, 6 for 11) land — they touch disjoint files.
**Strictly sequential**: 0 → 1/2 → 3 → 4 → 5 → 6 → 7 (this is the non-negotiable ordering constraint: crypto/serializer/storage foundations before the auth service; the auth service before the store action; the store action before the `login.tsx` fork). The structural purity guard (Task 2) lands as early as the second task specifically to protect the seam as Tasks 3-11 are built on top of it.

---

## Review Workload Forecast

| Task | Files touched (new/modified) | Est. changed lines | Notes |
|---|---|---|---|
| 1 | 2 new | ~90 | Small, pure |
| 2 | 2-3 new | ~80 | Types + stub + structural test |
| 3 | 2 new | ~140 | Serializer + zip.js wiring |
| 4 | 1 modified (fills stub), 1 test extended | ~160 | Anti-replay + shape guard logic |
| 5 | 2 new | ~120 | Auth service + 4 error classes |
| 6 | 1 modified, 1 new test | ~60 | Small store action |
| 7 | 1 modified, 1 new test | ~150 | Fork + error mapping + Suite A/B tests |
| 8 | 1 modified | ~30 | i18n ids only |
| 9 | 2 modified/new, 1 test | ~180 | Route + form + 4 failure paths |
| 10 | 2 new, 1 modified, 1 test | ~150 | HTTP service + export wiring |
| 11 | 2 new, 1 modified, 1 test extended | ~140 | Timer + layout wiring + new layout tests |
| 12 | 0 (verification only) | 0 | Gate run |
| 13 | 0-1 (checklist doc) | ~40 | Manual, documentation |

**Estimated total changed lines**: ~1340 across 13 tasks / ~13 commits.
**Risk level**: Medium. No single commit is large (largest ≈180 lines); the change is naturally sharded by the module dependency graph itself (design D1), which is also why work-unit commits map so cleanly here — each task IS a reviewable unit already.
**Split recommendation**: Not applicable as a PR-splitting decision — delivery is already fixed to commits-only on a single feature branch, no PRs. If this repo's review process ever converts these commits into PRs later, the natural chain boundary is: {1,2,3,4} (foundations) → {5,6,7} (auth path) → {8,9,10} (surfaces) → {11} (idle lock) → {12,13} (closure). This is informational only; do not ask the user to choose a PR strategy.
**400-line budget risk**: Low per-commit (task granularity keeps every commit well under 400 lines). Cumulative total (~1340) is well above 400 but that is expected and accepted for a 13-task feature under commits-only delivery.
**Decision needed before apply**: No.

---

## Honesty carried forward from design

Task 10 (admin export) is buildable and unit-testable but **not** end-to-end verifiable — the backend endpoint does not exist (§7a, 0%). Task 13 steps 13.1-13.2 are blocked on that same gap, and step 13.3 additionally depends on `pwa-offline-shell`'s own pending manual offline walkthrough. `sdd-apply` and `sdd-verify` MUST carry these statuses forward explicitly rather than letting Tasks 10 and 13 read as fully "done".
