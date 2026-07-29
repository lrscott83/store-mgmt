# Apply Progress: Offline Authentication — Frontend (React PWA)

**Change**: `offline-auth-frontend` · **Phase**: apply · **Date**: 2026-07-28
**Artifact store**: hybrid (this file + engram `sdd/offline-auth-frontend/apply-progress`)
**Batch**: 1 (single run, all code tasks completed)
**Branch**: `feat/offline-auth-frontend` (existing before this run; SDD artifacts already committed at `54ce05c`)
**Strict TDD**: every code task followed RED (confirmed failing) → GREEN (confirmed passing), one commit per work unit.

## Status: 12/13 tasks done. Task 13 (manual smoke) is pending a human — cannot be closed by an agent.

## Tasks 0-12 — DONE

| Task | Status | Commit | TDD evidence |
|---|---|---|---|
| 0 — Branch setup | DONE (already on `feat/offline-auth-frontend` at run start) | n/a | n/a |
| 1 — Web Crypto utilities | DONE | `b22d397` | RED: `pnpm test -- offline-crypto` failed (module not found) → GREEN: KAT vectors pass (`sha256Base64('test')`, PBKDF2 32-byte output, verify true/false) |
| 2 — roster-store purity guard | DONE | `caf6d64` | RED: module not found → GREEN: behavioral (0 localStorage calls at import) + structural (every `import` line is `import type`) both pass |
| 3 — Roster bundle serializer | DONE | `fa810cb` | RED: module not found → GREEN: round-trip, wrong-master (`WrongPasswordError`), corrupt-file (`CorruptFileError`) pass |
| 4 — Roster storage (anti-replay/expiry/D3 guard) | DONE | `f2a9910` | RED: stub throws → GREEN: fresh import+read, expired-at-import, replay (same bundleId / equal / older issuedAt), strictly-newer accepted, D3 shape guard (`InvalidBundleError` on import, `null` on read) all pass; purity guard re-run and still green |
| 5 — Offline auth service | DONE | `804cb5d` | RED: module not found → GREEN: 4 error paths (right/wrong password, unknown login, inactive user) + billing-defaults assertion pass |
| 6 — `loginOffline` action | DONE | `0c5df40` | RED: `loginOffline is not a function` → GREEN: hydrates via `setUser`, same storage keys (`token`/`currentUser`/AUTH_MODEL) as online login; wrong-password path resets `isLoading` without hydrating |
| 7 — `login.tsx` mode fork | DONE | `dbc68d1` | RED: 3 Suite-A tests failed (fork not wired) → GREEN: Suite A (provisioned: offline→ok, online→STILL offline+`login` never called, wrong pw→`AUTH.INVALID_CREDENTIALS`) + Suite B (unprovisioned: online→`login` only, offline→banner only) all pass; pre-existing `login.test.tsx` untouched and green |
| 8 — i18n ids | DONE | `9f5faa2` | RED: 11 missing-key assertions failed → GREEN: all `PROVISION.*` + `USERS.EXPORT_ROSTER` ids added and asserted non-empty |
| 9 — Provisioning route | DONE | `3ca7616` | RED: module not found → GREEN: success path (real `serializeRoster` → real `deserializeRoster` → `importRoster`) + 4 distinct failure messages (wrong master, corrupt file, expired, replay) all pass |
| 10 — Admin export (BLOCKED-for-verification) | DONE, unit-level only | `3beb1be` | RED: module/component not found → GREEN: `rosterHttpService.getOfflineRoster` URL + unwrap (mocked transport only); `RosterExportPanel` disabled-when-offline/no-storeId + confirm-flow (mocked `getOfflineRoster`+`serializeRoster`) all pass. **See Honesty section below — never mark this end-to-end proven.** |
| 11 — Idle lock | DONE | `8322c3a` | RED: `createIdleTimer` module not found (4 tests) + 1 new app-layout offline-lock test failed → GREEN: timer fires/resets/stops correctly; offline session (`authToken==='offline-session'`) arms timer + calls `logout()` after 1h; online session never arms; **all 10 pre-existing `app-layout.test.tsx` assertions unmodified and green** |
| 12 — Full-suite gates | DONE | `6530082` (typecheck fixes only; no behavior change) | See Gate Results below |

## Task 13 — Manual smoke checklist: PENDING (cannot be closed by an agent)

Documented in `docs/plans/2026-07-28-offline-auth-frontend-smoke-checklist.md` (committed `8b8385a`).
Steps 13.1-13.9 are unchecked and unexecuted. Steps 13.1-13.2 are **structurally blocked** on backend §7a (`GET /v1/storeusers/{storeId}/offline-roster`, 0% implemented). Step 13.3 additionally depends on `pwa-offline-shell`'s own pending manual offline walkthrough (merged but not archived).

**Do not report this change as fully manually verified.** Report as: **code-complete, automated-tests-green, manual smoke partially blocked.**

## Gate Results (actual output, run from `frontend-react/`)

```
pnpm test  (turbo run test -> vitest run, from frontend-react/)
  Test Files  154 passed (154)
  Tests       2158 passed (2158)

pnpm -C apps/web-store-pos exec tsc --noEmit
  (no output — zero type errors)

pnpm -C apps/web-store-pos build
  ✓ built in 4.37s (client)
  ✓ built in 12ms (service worker)
  ✓ built in 287ms (SSR/manifest)
  verify-sw-precache: OK — 136 precached entries; shell and route manifest each present exactly once.
```

Two typecheck-only fixes were required after Task 11 (no behavioral change), committed as `6530082`:
1. `loaders.test.ts`'s hand-built `AuthState` mock was missing the new `loginOffline` field.
2. `app-layout.test.tsx`'s new `mockImplementation` override needed an explicit cast (zip.js `Entry` union narrowing in `roster-serializer.ts` needed the same `for` + `continue` idiom as `data-serializer-service.ts:219` instead of `.find()`, whose predicate narrowing doesn't propagate to the returned value).

## Headline invariant — verified structurally, per commit

- `roster-store.ts`: `import type` only, zero runtime imports (Task 2's structural source-scan test, re-verified after Task 4).
- `login.tsx`: dispatches offline errors by `err.name` (`offlineErrorMessageId`), never imports `offline-auth-service` statically.
- `auth-store.ts`: zero static `offline/` imports — `loginOffline` uses a dynamic `import('../offline/offline-auth-service')` inside the action body only.
- Suite B of `login.offline.test.tsx` passes against the **unmodified** bare `vi.fn()` mock shape from the pre-existing `login.test.tsx` (no `getState`), proving an unprovisioned device's code path never needs it.

## Commits (this run, in order)

```
b22d397 feat(offline): add web crypto SHA-256 + PBKDF2 verify utilities
caf6d64 test(offline): guard roster-store purity with a structural source scan
fa810cb feat(offline): add encrypted roster bundle serializer
f2a9910 feat(offline): persist roster with anti-replay, expiry, and shape guard
804cb5d feat(offline): verify password against roster and map to UserModel
0c5df40 feat(offline): add loginOffline action hydrating via setUser
dbc68d1 feat(offline): authenticate against roster when the file decides offline mode
9f5faa2 feat(offline): add i18n ids for device provisioning and roster export
3ca7616 feat(offline): add device provisioning route for importing a roster bundle
3beb1be feat(offline): add admin export of encrypted roster bundle (unit-verified only, blocked on backend §7a)
8322c3a feat(offline): lock offline sessions after one hour of inactivity
6530082 fix(offline): satisfy tsc --noEmit gate for loginOffline and zip.js entry typing
8b8385a docs(offline): record offline-auth frontend smoke checklist results
450a9ac chore(sdd): mark offline-auth-frontend tasks 0-12 done, 13 pending manual QA
```

## Files created/modified (this run)

New:
- `frontend-react/apps/web-store-pos/app/shared/lib/offline/{offline-crypto,roster-types,roster-store,roster-serializer,offline-auth-service,offline-session,idle-timeout}.ts`
- `frontend-react/apps/web-store-pos/app/shared/lib/offline/__tests__/{offline-crypto,roster-store.purity,roster-store,roster-serializer,offline-auth-service,idle-timeout}.test.ts`
- `frontend-react/apps/web-store-pos/app/shared/lib/stores/__tests__/auth-store.offline.test.ts`
- `frontend-react/apps/web-store-pos/app/auth/routes/provision.tsx`
- `frontend-react/apps/web-store-pos/app/auth/routes/__tests__/{login.offline,provision}.test.tsx`
- `frontend-react/apps/web-store-pos/app/shared/lib/http/roster-http-service.ts` + `__tests__/roster-http-service.test.ts`
- `frontend-react/apps/web-store-pos/app/management/users/components/roster-export-panel.tsx` + `__tests__/roster-export-panel.test.tsx`
- `frontend-react/apps/web-store-pos/app/shared/lib/i18n/__tests__/es-provisioning-ids.test.ts`
- `docs/plans/2026-07-28-offline-auth-frontend-smoke-checklist.md`

Modified:
- `frontend-react/apps/web-store-pos/app/shared/lib/stores/auth-store.ts` (`loginOffline` action)
- `frontend-react/apps/web-store-pos/app/auth/routes/login.tsx` (mode fork + `offlineErrorMessageId`)
- `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` (`PROVISION.*`, `USERS.EXPORT_ROSTER`)
- `frontend-react/apps/web-store-pos/app/routes.ts` (`auth/provision` route)
- `frontend-react/apps/web-store-pos/app/shared/components/app-layout.tsx` (`useOfflineIdleLock`)
- `frontend-react/apps/web-store-pos/app/shared/components/__tests__/app-layout.test.tsx` (new describe block, 10 pre-existing tests untouched)
- `frontend-react/apps/web-store-pos/app/management/users/routes/user-list.tsx` (`RosterExportPanel` wired into header)
- `frontend-react/apps/web-store-pos/app/auth/routes/__tests__/loaders.test.ts` (added `loginOffline: vi.fn()` to mock shape, typecheck-only)

## Honesty carried forward (do NOT paper over)

1. **Task 10 (admin export) is unit-verified only.** `GET /v1/storeusers/{storeId}/offline-roster` does not exist server-side (§7a, 0%). `roster-http-service.test.ts` and `roster-export-panel.test.tsx` prove only the URL called and `response.data.data` unwrapping against a mocked transport. The real response envelope, DTO field casing, whether `issuedAt`/`expiresAt` are epoch-ms or ISO strings, and whether `users[].verifier` exists at all remain **unproven** until the backend ships.
2. **Task 13's manual smoke checklist requires a human** and has not been executed. `docs/plans/2026-07-28-offline-auth-frontend-smoke-checklist.md` records the exact pending steps. `pwa-offline-shell` is merged but not archived, and its own manual offline walkthrough is still pending — the true-offline `/login` steps (13.3) may not be honestly executable yet.

## Next recommended phase (Batch 1)

`sdd-verify` — validate the implementation against the 4 specs (`offline-roster-bundle`, `offline-auth-mode`, `offline-device-provisioning`, `auth-session`) and carry forward the Task 10 / Task 13 honesty flags into the verify-report rather than letting them read as fully "done".

---

# Batch 2 — verify-report fix-up (2026-07-29)

**Trigger**: `openspec/changes/offline-auth-frontend/verify-report.md` (PASS WITH WARNINGS) — closes WARNING #1/#2 and SUGGESTION #1/#2. WARNING #3 (Task 10 backend gap) and WARNING #4 (Task 13 manual smoke) are explicitly OUT OF SCOPE — backend-blocked / human-only, left exactly as-is (tasks.md item 13 stays unchecked; `roster-http-service.ts`'s BLOCKED-for-verification comments untouched).
**Branch**: `feat/offline-auth-frontend` (same branch, no new branch, no PR).
**Strict TDD**: each new test proven with a real mutation → confirmed FAIL → reverted → confirmed PASS, before being counted as done.

## WU1 — WARNING #1 / SUGGESTION #2: idle-lock logout must preserve the roster — DONE

Commit `6d2404a` — `test(offline): prove idle-lock logout preserves the roster`.

- File: `frontend-react/apps/web-store-pos/app/shared/lib/stores/__tests__/auth-store.offline.test.ts` — new `describe('useAuthStore.logout() — preserves the offline roster (auth-session MODIFIED)')` block.
- The test combines a REAL provisioned roster (`importRoster`, real), a REAL `loginOffline('ana','secret')` call (real, not mocked — this test file never mocks `auth-store`), and a REAL `logout()` call (real store action, not `vi.fn()`), then asserts `isRosterProvisioned()` (real) is still `true`.
- **Mutation proof**: temporarily added `import { clearRoster } from '../offline/roster-store';` to `auth-store.ts` and called `clearRoster();` as the first line of `logout()`. Re-ran the test: `AssertionError: expected false to be true` at the post-logout `isRosterProvisioned()` assertion (1 failed / 2 passed in the file). Reverted both the import and the call; re-ran — 3/3 passed again. `git status` confirmed `auth-store.ts` was back to its committed state before moving on (no accidental diff left behind).

## WU2 — WARNING #2: end-to-end coverage for two offline-auth-mode scenarios — DONE

Commit `27403cf` — `test(offline): add end-to-end coverage for expired-bundle and inactive-user login`.

- New file: `frontend-react/apps/web-store-pos/app/auth/routes/__tests__/login.offline.e2e.test.tsx` (2 tests). Does **not** mock `~/shared/lib/offline/roster-store` or `~/shared/lib/offline/offline-auth-service` — both run as real production code against real jsdom `localStorage` + real Web Crypto, driven through the rendered `LoginPage` form exactly like the spec's Given/When/Then.
- `login.offline.test.tsx` (existing file, Suite A/B, the bare `vi.fn()` headline-invariant mock) was **not touched** — kept passing unmodified (verified below).

**Test 1 — "An expired bundle falls back to online auth"**:
- Writes an already-expired `OfflineRosterBundle` directly into `localStorage['lizoft.offline-roster']` (bypassing `importRoster`'s own at-import expiry guard, exactly like `roster-store.test.ts`'s D3 shape-guard test does — this simulates a bundle that expired *after* being imported, matching the spec's GIVEN clause).
- Submits the rendered login form; asserts the real (unmocked) `isRosterProvisioned()` returns `false`, routing to the online `login` mock (`toHaveBeenCalledWith('ana','secret')`), and that `loginOffline` is never called.
- **Mutation proof**: in `roster-store.ts`'s `getRoster()`, replaced `if (parsed.expiresAt <= now) return null;` with `if (false) return null;` (expiry check always false). Re-ran: `AssertionError: expected "spy" to be called with arguments: [ 'ana', 'secret' ] — Number of calls: 0` (1 failed / 1 passed). Reverted the line exactly; re-ran — 2/2 passed.

**Test 2 — "Inactive roster user is rejected distinctly"**:
- Real `importRoster()` seeds a non-expired bundle whose one user has `isActive: false` and a real PBKDF2 verifier (via real `sha256Base64`/`pbkdf2Base64`, matching `offline-auth-service.test.ts`'s fixture convention).
- The store's `loginOffline` mock delegates to the REAL `authenticateOffline()` (imported directly, not mocked), so `login.tsx`'s `offlineErrorMessageId` dispatch receives a genuine `OfflineUserInactiveError` instance thrown by production code against a real inactive user — not a hand-built `Object.assign` stand-in as in `login.offline.test.tsx`'s A3 test.
- Asserts the rendered form shows the catalog string for `AUTH.ACCOUNT_INACTIVE` (`'Tu cuenta está inactiva. Contactá soporte.'`), and that the online `login` mock is never called.
- **Mutation proof**: in `login.tsx`'s `offlineErrorMessageId()`, folded the `name === 'OfflineUserInactiveError'` branch into the generic `AUTH.INVALID_CREDENTIALS` bucket (collapsing the distinct error name). Re-ran: `waitFor` timed out — `screen.getByText('Tu cuenta está inactiva...')` never appeared (1 failed / 1 passed). Reverted `login.tsx` to the original two-branch dispatch; re-ran — 2/2 passed.
- After both mutations were reverted, `git status --short` showed only the new test file as untracked — `login.tsx` and `roster-store.ts` were confirmed byte-identical to their committed state.

Full regression check after WU1+WU2 (`login.offline.e2e.test.tsx` + `login.offline.test.tsx` + `login.test.tsx` + `auth-store.offline.test.ts` together): **24/24 passed**, including the pre-existing `login.test.tsx` (14 tests, unmodified) and `login.offline.test.tsx`'s Suite B against its bare `vi.fn()` mock (unmodified).

## WU3 — SUGGESTION #1: run the linter — INVESTIGATED, NOT FIXABLE IN SCOPE

`pnpm -C apps/web-store-pos lint` (`eslint . --ext .ts,.tsx`) fails immediately with:
```
ESLint: 9.39.4
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
```
Root cause: `apps/web-store-pos/package.json` already depends on `@store-mgmt/eslint-config` (`workspace:*`, exporting `./base` and `./react-router` flat configs from `packages/eslint-config/`), but **no `eslint.config.js` file has ever existed in `apps/web-store-pos`** (confirmed via `git log --oneline --all -- "apps/web-store-pos/eslint.config.*"` → no results). This is a **pre-existing, project-wide gap** — not specific to the ~15 offline-auth files in this change, and not something introduced by this fix-up batch or by the original `offline-auth-frontend` apply run.
Per instructions: did **not** invent an `eslint.config.js` (that is a project-wide wiring decision, out of scope for a spec-driven fix-up batch touching only offline-auth files). No code changes for WU3; no commit. Flagging as an open, separately-trackable gap (distinct from the Task 10/13 backend-blocked items — this one is purely a frontend tooling gap and could be picked up as its own small change).

## Gate Results — Batch 2 (actual output, run from `frontend-react/`)

```
$ pnpm test
 Test Files  155 passed (155)
      Tests  2161 passed (2161)

$ pnpm -C apps/web-store-pos exec tsc --noEmit
  (no output — zero type errors)

$ pnpm -C apps/web-store-pos build
  ✓ built in 273ms (SSR/manifest)
  verify-sw-precache: OK — 136 precached entries; shell and route manifest each present exactly once.

$ pnpm -C apps/web-store-pos lint
  ESLint couldn't find an eslint.config.(js|mjs|cjs) file. (pre-existing gap — see WU3, not fixed here)
```

Delta from the Batch 1 / verify-report baseline (154 files / 2158 tests): **+1 test file, +3 tests** (both new tests in WU2's file, plus WU1's addition inside an already-counted file — net: `login.offline.e2e.test.tsx` is the only new file, contributing 2 tests; WU1 added 1 test to an existing file). 136 precache entries unchanged (no production bundle impact — these are test-only additions).

## Commits (Batch 2, in order)

```
6d2404a test(offline): prove idle-lock logout preserves the roster
27403cf test(offline): add end-to-end coverage for expired-bundle and inactive-user login
```

## Files changed (Batch 2)

Modified:
- `frontend-react/apps/web-store-pos/app/shared/lib/stores/__tests__/auth-store.offline.test.ts` (+1 test, new describe block)

New:
- `frontend-react/apps/web-store-pos/app/auth/routes/__tests__/login.offline.e2e.test.tsx` (2 tests)

Untouched (mutated temporarily for TDD proof, reverted, confirmed clean via `git status`):
- `frontend-react/apps/web-store-pos/app/shared/lib/stores/auth-store.ts`
- `frontend-react/apps/web-store-pos/app/shared/lib/offline/roster-store.ts`
- `frontend-react/apps/web-store-pos/app/auth/routes/login.tsx`

## Honesty carried forward (unchanged from Batch 1 — still open, still out of this batch's scope)

1. **Task 10 (admin export) is unit-verified only** — backend endpoint `GET /v1/storeusers/{storeId}/offline-roster` still does not exist (§7a). `roster-http-service.ts`'s BLOCKED-for-verification comments left exactly where they are.
2. **Task 13's manual smoke checklist still requires a human** — tasks.md items 13.1-13.9 left unchecked, wording unchanged.
3. **NEW (Batch 2, WU3): `apps/web-store-pos` has no `eslint.config.js`** despite already depending on `@store-mgmt/eslint-config` — pre-existing project-wide gap, not fixed here, not offline-auth-specific.

## Next recommended phase (Batch 2)

`sdd-verify` — re-run verify to confirm WARNING #1 and WARNING #2 are now closed by real, mutation-proven tests; WARNING #3/#4 remain open (backend/human-blocked, unchanged); SUGGESTION #1 is now investigated and documented as a separate pre-existing tooling gap rather than an unknown blind spot.
