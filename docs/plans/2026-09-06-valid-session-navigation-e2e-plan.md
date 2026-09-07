# Valid-session navigation — E2E coverage, reported defect, fix

Date: 2026-09-06
Status: FIXED (12/12 new E2E tests green as desired-behavior tests; F4/T10 preserved; full suite 243 passed)
Spec: `frontend-react/e2e/valid-session-navigation.spec.ts` (NEW, additive)

## 1. The contract

With a valid, non-expired authenticated session (OwnerAdmin here; any role by design):

- Navigating to `/login` or `/register` (both use `guestOnlyLoader`) must redirect to the user's role home (`resolveUserHomePath`, `user-home.ts:19-25`).
- Reloading the page on any non-login authenticated view must keep the session on that view.

## 2. The reported defect (user report, 2026-09-06)

> Owner authenticated (online and offline): going to /login stays on /login, and reloading the page on any non-login view redirects to /login.

Reproduced deterministically by destroying ONLY the device key (IndexedDB `lizoft-device-key`) while keeping localStorage — browser eviction state. All 6 failing halves confirmed the pair online and offline.

### Root cause (three layers compounding)

1. `needsUnlock()` (unlock-gate.ts) keyed on provisioning state alone — "this device once provisioned a key" — regardless of whether any data actually needs protection.
2. Repositories encrypted EMPTY collections: every store's auto-init wrote `'[]'`/`'{}'` through `encryptEntity` → ciphertext on disk for a brand-new store (entity-crypto.ts).
3. Every OwnerAdmin authentication writes the daily exchange-rate register ENCRYPTED with real content (`ensureExchangeRates` → `backfillDailyRecords`, exchange-rate-daily.ts) — so every real session carried ciphertext.

Net effect: any store (even freshly created) had `enc:v1:` values → once the device key was lost, `needsUnlock` was true → `authLoader` expelled the still-valid session to `/login?unlock=1` on every reload (loaders.ts:31) and `guestOnlyLoader` returned null on `/login`//`/register` (loaders.ts:71). The session stayed valid throughout (the gate's redirect deliberately preserves AUTH_MODEL; loaders.ts:26-28).

No existing test caught it because `session.ts:129-146` drops `lizoft.device-dek` from persona snapshots — persona-restored sessions can never enter this state; only real logins on a real device can.

## 3. The fix (production, 3 files + unit tests)

| File | Change |
|---|---|
| `unlock-gate.ts` | NEW `hasUnreadableCiphertext()`: the hijack is justified only when the device holds unreadable encrypted USER data. Excludes: the `exchangeRates` register (system-generated, regenerable — never a reason to lock a session) and legacy empty-collection ciphertext (`enc:v1:` of exactly 30 bytes → 40 base64 chars: AES-GCM is length-deterministic, and no 2-byte JSON document other than `'[]'`/`'{}'` exists) |
| `loaders.ts` | `unlockGate` and `guestOnlyLoader` now hijack only when `needsUnlock(user) && hasUnreadableCiphertext()` |
| `entity-crypto.ts` | `encryptEntity` stores the empty sentinels `'[]'`/`'{}'` as PLAINTEXT (short-circuit ahead of the DEK branch). Reading stays uniform: `decryptEntity`'s marker dispatch passes plaintext through unchanged |
| `loaders.test.ts` | Contract updated to the new gate + 3 new rows (locked without ciphertext → pass through / redirect home; locked with ciphertext → hijack; locked auto-init write → plaintext, no throw) |

Design line preserved: when the device HOLDS real unreadable user data and lost its key, the hijack remains — that is F4 (`login-offline.spec.ts:500`, untouchable, verified green): it seeds a real product before destroying the key, so the gate still protects it.

## 4. The 12 E2E tests (final state — all assert the DESIRED behavior)

Matrix {online real login, offline roster login} × {device intact, device key destroyed} × {reload on view, goto /login, goto /register}.

- 1–3 online/intacto: reload keeps session; /login and /register bounce to the role home.
- 4–6 online/sin clave: same three, with the device key destroyed — previously the failing pair; now green.
- 7–9 offline/intacto: same as 1–3 for a roster session.
- 10–12 offline/sin clave: same as 4–6.

Quota cost: 1 register + 1 real login (serial online block, shared page) + 1 roster login (zero HTTP); /register tests only navigate. LoginPolicy ceiling 5/min respected.

## 5. Verification

- Unit: `loaders.test.ts` + `unlock-gate.test.ts` — 56 passed.
- New spec: **12 passed**.
- Untouchable protection preserved: F4 + T10 (`login-offline.spec.ts`) — 2 passed.
- Full frontend E2E suite: **243 passed, 0 failed, 0 flaky** (231 pre-existing + 12 new).

## 6. Remaining open gaps (not addressed here)

- ReSeller → `/admin/owners` rebound still has zero E2E coverage (no ReSeller persona in the suite).
- SuperAdmin rebound destination not pinned to exactly `/admin/owners`.
- Reload while ON /login with a valid intact session (control half) still uncovered.
