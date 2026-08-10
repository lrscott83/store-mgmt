# Tasks: device-wrapped-dek

> Strict TDD. Every code task is preceded by its own RED task. Delivery is
> `commits-only` (no PRs, no push) — each Work Unit below = one commit on the
> change branch. Frontend gate: `npx turbo run test --force` from
> `frontend-react/` (turbo caches runs; `--force` is mandatory for any output
> cited as evidence). E2E gate: `pnpm test:e2e` (Playwright) — NOT covered by
> `turbo run test`.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~950–1350 (revised UP from the proposal's ~710-770 — this repo's comment density runs 2.5-3x code, e.g. `entity-crypto.ts` is 99 lines for ~40 of logic, `dek-unwrap.ts` 65 for ~20; every new module here follows the same documentation discipline. NOT VERIFIED — measure real diffs during apply.) |
| 400-line budget risk | High |
| Chained PRs recommended | No — delivery is `commits-only`, no PRs exist |
| Chain strategy | N/A (commits-only); mitigation is the 10 Work-Unit commits below, each independently reviewable via `git show` |
| Delivery strategy | commits-only |
| Decision needed before apply | No — strategy is fixed; `sdd-apply` proceeds Work-Unit by Work-Unit in the order below |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units (= commits, in order)

| # | Unit | Slice | Est. lines | Depends on |
|---|---|---|---|---|
| 1 | IndexedDB feasibility gate + `device-key-store.ts` | A | 280-340 | — |
| 2 | `device-dek-table.ts` (wrap table + purity test) | A | 170-210 | — |
| 3 | `dek-unwrap.ts` mint direction (D3) | A | 45-60 | — |
| 4 | `dek-bootstrap.ts` (device-key-first recovery) | A | 200-250 | 1, 2 |
| 5 | `dek-provisioning.ts` (`resolveDekForLogin` + rewrap) | B | 340-440 | 2, 3, 4 |
| 6 | `entity-crypto.ts` + `entity-migration.ts` guard flip (authorized #2) | B | 45-60 | 2 |
| 7 | `auth-store.ts` wiring, both login paths (authorized #3) | B | 130-170 | 5, 6 |
| 8 | `unlock-gate.ts` + `loaders.ts` device-wrap-first | B | 110-150 | 4, 7 |
| 9 | E2E: T10 rewrite (authorized #1) + NEW F4 test | C | 60-90 | 7, 8 — **not gated by `turbo run test`** |
| 10 | `change-password.tsx` re-wrap seam (Q2 mandatory, not conditional) | C | 35-50 | 5 |

Slice A (1-4) is behaviorally inert — clean-delete rollback. Slice B (5-8) is
the flip and, per design §8, is **data-affecting to revert once any real
device has logged in under it** — land 5→6→7→8 in that order, do not reorder.
Slice C (9-10) needs Slice B live to be meaningful.

---

## Phase A — Foundations (zero behavior change, clean-delete rollback)

### WU1 — IndexedDB feasibility gate + `storage/device-key-store.ts`
Files: `apps/web-store-pos/package.json` (+`fake-indexeddb` devDep), NEW `storage/device-key-store.ts`, NEW `storage/__tests__/device-key-store.test.ts`.
- [x] 1.0 **Blocking gate, not app behavior**: in the new test file, `import 'fake-indexeddb/auto'` first line, assert `typeof globalThis.structuredClone === 'function'`. If it fails, add the documented polyfill fallback at the top of every `fake-indexeddb`-importing test file (same per-file discipline as the import itself — do NOT add to `vitest.setup.ts`, that changes every test file's blast radius). **RESULT: verified TRUE — no polyfill needed.**
- [x] 1.1 RED — `getOrCreateDeviceKey()` called twice returns the same key; `key.extractable === false`; `crypto.subtle.exportKey('raw', key)` rejects.
- [x] 1.2 GREEN — implement mint (`AES-GCM`, 256, `extractable:false`) + IDB persist/read.
- [x] 1.3 RED — `globalThis.indexedDB` deleted → `getOrCreateDeviceKey()` resolves `null`, never throws (F1).
- [x] 1.4 GREEN — wrap every IDB call so failure resolves `null`, never throws.
- [x] 1.5 RED — a never-settling `open()` stub resolves `null` within `DEVICE_KEY_OPEN_TIMEOUT_MS` (3000ms fake timers) — the white-screen guard (F2).
- [x] 1.6 GREEN — bound `open()` with a race against the timeout.
- [x] 1.7 RED — `deleteDeviceKey()` clears the record; a subsequent `getOrCreateDeviceKey()` mints fresh.
- [x] 1.8 GREEN — implement `deleteDeviceKey`.
- [x] 1.9 RED — `getDeviceKey()` (read-only) never creates: called on an empty DB, resolves `null`, DB stays empty.
- [x] 1.10 GREEN — implement `getDeviceKey` as a strict read.
Verify: `npx turbo run test --force --filter=@store-mgmt/web-store-pos`
Finish/rollback: module complete, imported by nothing else yet → `git revert` is a clean delete.

### WU2 — `storage/device-dek-table.ts`
Files: NEW `device-dek-table.ts`, NEW `__tests__/device-dek-table.test.ts`.
- [x] 2.1 RED — `readDeviceDekTable()` → `null` for absent/non-JSON/wrong-shape; `hasDeviceDekWrap()` false in each case (mirrors `roster-store.test.ts:186-196`).
- [x] 2.2 GREEN — implement `hasValidShape`-guarded reader + `hasDeviceDekWrap`.
- [x] 2.3 RED — `writeDeviceDekTable`/`clearDeviceDekTable` round-trip.
- [x] 2.4 GREEN — implement writer/clearer (localStorage key `lizoft.device-dek`).
- [x] 2.5 RED — structural purity: every `import` line in the file is `import type` (copy `roster-store.purity.test.ts:48-60`).
- [x] 2.6 GREEN — only `import type { WrappedDekEntry } from '../offline/dek-unwrap'` remains.
Verify: `npx turbo run test --force --filter=@store-mgmt/web-store-pos`
Finish/rollback: zero import edges from production code yet → clean delete.

### WU3 — `offline/dek-unwrap.ts` mint direction (D3)
Files: MODIFIED `dek-unwrap.ts` (+`wrapDekWithPassword`, same `DEK_WRAP_ITERATIONS`), MODIFIED `dek-unwrap.kat.test.ts` (ADD tests only — this file is not in the authorized-3 list, existing 6 assertions stay untouched).
- [x] 3.1 RED — round trip: `unwrapDek(pwd, await wrapDekWithPassword(pwd, dek))` returns `dek` byte-for-byte.
- [x] 3.2 GREEN — implement `wrapDekWithPassword` (preHash → PBKDF2 KEK → AES-GCM encrypt).
- [x] 3.3 RED (new KAT test, appended) — mint against the frozen KAT `wrapSalt`/`wrapIv` reproduces the KAT's `wrappedDek` exactly.
- [x] 3.4 GREEN — confirm/adjust to accept injectable salt/iv for the KAT pin.
Verify: `npx turbo run test --force --filter=@store-mgmt/web-store-pos`
Finish/rollback: pure function addition, unused elsewhere → clean delete.

### WU4 — `storage/dek-bootstrap.ts`
Files: NEW `dek-bootstrap.ts`, NEW `__tests__/dek-bootstrap.test.ts`. Depends on WU1, WU2.
- [x] 4.1 RED — device wrap present + device key present → `getDek()` non-null, exact original bytes (real WebCrypto + `fake-indexeddb`, no crypto mocks).
- [x] 4.2 GREEN — implement `bootstrapDeviceDek` (read table → `getDeviceKey` → unwrap → `setDek`).
- [x] 4.3 RED — device key missing → `getDek()` stays `null`, no throw (F4 half 1).
- [x] 4.4 GREEN — swallow unwrap/getDeviceKey failure.
- [x] 4.5 RED — called twice concurrently → the key-open path is observed once (single-flight memo). Reset via `vi.resetModules()` + dynamic `import()`, no test-only export.
- [x] 4.6 GREEN — module-level `inFlight: Promise<void> | null` memo.
Verify: `npx turbo run test --force --filter=@store-mgmt/web-store-pos`
Finish/rollback: complete, still unwired from loaders/auth-store → clean delete. **Slice A checkpoint: full suite green, zero behavior change vs. baseline. VERIFIED 2026-08-10: 183 test files, 2416 tests, 0 failures.**

---

## Phase B — The behavior flip (irreducible; land 5→6→7→8 in order)

### WU5 — `offline/dek-provisioning.ts`
Files: NEW `dek-provisioning.ts`, NEW `__tests__/dek-provisioning.test.ts`. Depends on WU2, WU3, WU4. Mock `storage/device-key-store` via `vi.mock(...)` for branch coverage — do NOT pull `fake-indexeddb` into this layer (design §7).
- [x] 5.1 RED — no roster, no table → `getDek()` non-null, `dekSource:'local'`, `users[login]` present, `unwrapDek(password, users[login])` returns the same bytes (Q2's whole contract).
- [x] 5.2 GREEN — implement steps 1-3c (mint branch) + step 5 persist.
- [x] 5.3 RED — roster wrap present, no table → adopts the roster's bytes, `dekSource:'roster'`.
- [x] 5.4 GREEN — implement step 3b.
- [x] 5.5 RED — device DEK X + roster yielding Y≠X → `getDek()` still X, `conflictDetectedAt`/`conflictStoreId` set, no throw (D6).
- [x] 5.6 GREEN — implement step 4 reconciliation + conflict record.
- [x] 5.7 RED — device DEK X + a roster wrap that fails to unwrap → resolves, `users[login]` refreshed (F9; the explicit boundary against 11.4, which has no device table by construction).
- [x] 5.8 GREEN — implement step 4's `catch` branch.
- [x] 5.9 RED — table with wraps but none for this login, device key unusable → rejects `DekUnwrapError` (F5, step 3a dead end).
- [x] 5.10 GREEN — implement step 3a's throw.
- [x] 5.11 RED — `rewrapDeviceDekForPassword` REPLACES (not adds) `users[login]`.
- [x] 5.12 GREEN — implement rewrap fn.
Verify: `npx turbo run test --force --filter=@store-mgmt/web-store-pos`
Finish/rollback: complete, still unwired → safe to revert alone (nothing calls it yet).
**DONE 2026-08-10, commit `77aef56c`.** Also handled: `getDek()` already non-null on entry with no table yet (the offline path, `authenticateOffline`'s own unchanged roster unwrap running before this call) — treated as roster-sourced, `tableStoreId = getDekStoreId()`. Step 5's `table.users[login]` write is UNCONDITIONAL (not `if (!table.users[login])` as the compressed pseudocode shows) — follows the device-dek-wrap spec's explicit "Out-of-band password change recovers via the device DEK" scenario (regenerate on every login), which is more precise than §5's sketch. Both deviations disclosed in the apply-progress artifact.

### WU6 — `entity-crypto.ts` + `entity-migration.ts` guard flip
Files: MODIFIED `entity-crypto.ts` (1 line), MODIFIED `__tests__/entity-crypto.test.ts:70-87` (**AUTHORIZED #2** — red-first rewrite, the ONLY edit allowed in that file), MODIFIED `entity-migration.ts` (guard+scope), `entity-migration.test.ts` (ADD 1 new test only — its 4 existing suites stay untouched). Depends on WU2 only.
- [x] 6.1 RED (authorized rewrite) — rewrite `entity-crypto.test.ts:70-87` to: with a device DEK/table set (via `setDek`+`writeDeviceDekTable`), `encryptEntity` returns `enc:v1:` regardless of roster state; passthrough re-scoped to no-DEK-and-no-device-table-and-no-roster only. Confirm it FAILS against current code first.
- [x] 6.2 GREEN — `if (!isEncryptionProvisioned() && !hasDeviceDekWrap()) return plaintext;`
- [x] 6.3 RED (new test) — local-DEK device (`setDek(dek,'s1')`, no roster) → `products` key becomes `enc:v1:` after `runEntityMigration()` (today a no-op — this is the RED).
- [x] 6.4 GREEN — `entity-migration.ts` guard/scope → `getDekStoreId()`, drop the `roster-store` import.
- [x] 6.5 Regression check (no new test) — confirm unedited: `entity-crypto.test.ts:108-121`, the six `*.crypto.test.ts` plaintext-mode suites, all 4 `entity-migration.test.ts` suites.
Verify: `npx turbo run test --force --filter=@store-mgmt/web-store-pos`
Finish/rollback: behaviorally inert alone in production (`hasDeviceDekWrap()`/`getDekStoreId()` are false/null until WU7 wires provisioning) — but MUST precede WU7, not follow it.
**DONE 2026-08-10, commit `55ebe55a`.** The authorized rewrite touched 3 assertions in the 70-87 block plus one import line (needed to reference `writeDeviceDekTable`/`hasDeviceDekWrap`); no other test in the file was touched.

### WU7 — `auth-store.ts` wiring, both login paths
Files: MODIFIED `stores/auth-store.ts` (`login` block `:296-317`, `loginOffline` block `:332-350`), MODIFIED `stores/__tests__/auth-store.dek.test.ts:140-149` (**AUTHORIZED #3**, 11.3 only — 11.1 and 11.4 stay untouched), NEW `stores/__tests__/auth-store.offline.test.ts` (D4 — the offline DEK test lives HERE, never in `offline-auth-service.test.ts`). Depends on WU5, WU6.
- [x] 7.1 RED (authorized rewrite) — 11.3: no roster entry for this login → login still resolves AND `getDek()` is **non-null** (was: stays null). No `fake-indexeddb` needed here — IndexedDB is absent under plain jsdom, which correctly exercises the F1 local-mint path. Confirm it FAILS against current code first.
- [x] 7.2 GREEN — replace the `login` roster-unwrap block with `await resolveDekForLogin({ login, password, sessionStoreId })` via dynamic import (D6: zero static `offline/` imports in `auth-store.ts`); drop the now-redundant direct `runEntityMigration` call (step 6 lives inside `resolveDekForLogin`).
- [x] 7.3 RED (new file) — `loginOffline()` on a v1 roster → `getDek()` non-null (the offline twin of 11.3).
- [x] 7.4 GREEN — after `authenticateOffline` resolves and before `setUser`, `await resolveDekForLogin(...)`.
- [x] 7.5 Regression check — confirm unedited: `auth-store.dek.test.ts` 11.1 and 11.4, `auth-store.test.ts:253-259`, `offline-auth-service.test.ts:98` and `:216-222`.
Verify: `npx turbo run test --force --filter=@store-mgmt/web-store-pos`
Finish/rollback: online AND offline login now provision a device DEK. **Data-affecting rollback from here on** (design §8) — once a real device logs in under this code, reverting is not clean; the wrap table + IDB entry must be cleared on that device before/after any revert.
**DONE 2026-08-10, commit `4ce199e8`.** `NOTE: "NEW stores/__tests__/auth-store.offline.test.ts"` — this file already existed (pre-dates this change, from an unrelated auth-session change); the offline DEK test (7.3) was appended to it, not created fresh. `sessionStoreId` for both call sites resolved to `user.selectedStoreId` (the repo's existing "current store" convention, e.g. `user-home.ts:24`) — not specified explicitly by design/tasks.

### WU8 — `unlock-gate.ts` + `auth/routes/loaders.ts` device-wrap-first
Files: MODIFIED `unlock-gate.ts` (+1 branch), MODIFIED `loaders.ts` (`authLoader`, `guestOnlyLoader`), `unlock-gate.test.ts` (ADD 1 row only — existing 9 rows untouched), NEW loader-ordering tests. Depends on WU4, WU7.
- [x] 8.1 RED (new row, append only) — device table with a device wrap + no DEK → `needsUnlock` **true** even with no roster entry.
- [x] 8.2 GREEN — `if (hasDeviceDekWrap()) return true;` above the existing roster check.
- [x] 8.3 RED — `authLoader` does not resolve before `getDek()` is non-null (mock `device-key-store.getDeviceKey` deferred/delayed; assert DEK set at the moment the loader promise settles).
- [x] 8.4 GREEN — `await bootstrapDeviceDek()` before `unlockGate(user)` in `authLoader`.
- [x] 8.5 RED — `guestOnlyLoader` bootstraps before calling `resolveUserHomePath` (spy on the product service; assert DEK non-null when first invoked).
- [x] 8.6 GREEN — `await bootstrapDeviceDek()` before both `needsUnlock` and `resolveUserHomePath` in `guestOnlyLoader`.
- [x] 8.7 RED (optional structural guard) — the set of route module paths outside the `app-layout` block equals the frozen 7-item list (`routes.ts`). No production change if it already holds — this test only guards regressions to §3's proof.
- [x] 8.8 Regression check — confirm all 9 existing `unlock-gate.test.ts` rows still pass.
Verify: `npx turbo run test --force --filter=@store-mgmt/web-store-pos`
Finish/rollback: THIS is where the flip becomes end-to-end observable — reload with a working device wrap no longer bounces to `/login?unlock=1`. **Slice B checkpoint.** Same data-affecting caveat as WU7.
**DONE 2026-08-10, commit `0ef45392`.** SLICE B COMPLETE. Full suite: 185 test files, 2429 tests, 0 failures (`npx turbo run test --force --filter=@store-mgmt/web-store-pos`). Batch boundary — Slice C (WU9-WU10) is out of scope for this batch by explicit instruction; not started.

---

## Phase C — E2E + password-change seam

### WU9 — E2E: T10 rewrite + NEW F4 test — **NOT verifiable via `npx turbo run test`**
Files: MODIFIED `e2e/login-offline.spec.ts:306-331` (**AUTHORIZED #1**, T10 only), same file — ADD 1 new test.
- [ ] 9.1 RED (authorized rewrite) — invert T10: after `page.reload()`, stay on `/sales/products`, no `AUTH.UNLOCK_REQUIRED`; an entity write after reload still yields `enc:v1:` (same-DEK proof, not just "no prompt"); keep `expectOnlyKnownTelemetry` + `expectNoLoginAttempt` (reload stays HTTP-quiet).
- [ ] 9.2 (ADD, new test) — `indexedDB.deleteDatabase('lizoft-device-key')` (localStorage intact) → reload → `/login?unlock=1` → password → back in, data readable (F4 — the unlock path proven NOT to vanish with T10).
- [ ] 9.3 Regression check — T9 and T11 (adjacent tests in the same file) still pass unedited.
**FLAG — hand off to the user**: requires a real Chromium via Playwright AND the .NET backend running (T10's reload is deliberately ONLINE — `getUserByToken()`'s cached-profile branch). Per project convention this repo's agent does not run `dotnet`; verify: `pnpm test:e2e` (or `pnpm --filter web-store-pos exec playwright test login-offline.spec.ts --grep-invert @rate-limit` to scope it) — run by the user, with the backend already up.
Finish/rollback: revertible only together with Slice B (T10's original assertion fails against WU5-8).

### WU10 — `profile/routes/change-password.tsx` re-wrap seam
Files: MODIFIED `change-password.tsx` (between line 25 POST and line 28 `logout()`), `profile/routes/__tests__/profile-routes.test.tsx` (ADD 1 new test only — existing `ChangePasswordPage` suites untouched). Depends on WU5. Mandatory per Q2 (#2117) — not conditional.
- [ ] 10.1 RED — on successful `changePassword`, `rewrapDeviceDekForPassword(user.login, payload.newPassword)` is called (dynamic import) BEFORE `logout()`; a rejected rewrap does not prevent `logout()` from being called (swallowed, matching `entity-migration.ts:15-18`'s doctrine).
- [ ] 10.2 GREEN — wire the dynamic import + `try { await rewrapDeviceDekForPassword(...) } catch {}` before `logout()`.
Verify: `npx turbo run test --force --filter=@store-mgmt/web-store-pos`
Finish/rollback: revertible alone (unused-but-harmless if reverted without Slice B) or together with WU5.

---

## Full-suite gate (run after every Work Unit)
`npx turbo run test --force` from `frontend-react/` — full regression, not scoped. Cite this output, never a cached run, as evidence a Work Unit is done.
