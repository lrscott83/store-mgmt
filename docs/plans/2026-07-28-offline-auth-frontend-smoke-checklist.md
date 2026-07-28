# Offline Auth Frontend — Manual Smoke Checklist (Task 13)

**Change**: `offline-auth-frontend` · **Status**: code-complete, automated-tests-green, manual smoke **PARTIALLY BLOCKED**
**Date**: 2026-07-28

This task cannot be closed as "done" by an agent — it requires a human with a
real device/browser. All automated coverage (unit + integration, TDD
red→green) is in place and green (`pnpm test`, `tsc --noEmit`, `build` — see
apply-progress). This document records the manual walkthrough steps and
their current blocked/pending status; nothing below has been executed.

## Acceptance reality

Steps 13.1–13.2 are **structurally blocked** on backend §7a
(`GET /v1/storeusers/{storeId}/offline-roster`) shipping — 0% implemented,
not a testing gap, an absent endpoint. Step 13.3 additionally depends on
`pwa-offline-shell`'s own pending manual walkthrough (that change is merged
but not archived, and its true-offline `/login` smoke has not been recorded
as walked). Do not report this SDD change as fully manually verified until
both dependencies clear.

## Checklist (all pending — none executed)

- [ ] **13.1** As OwnerAdmin, online → click "Export offline roster" →
  downloads `roster-*.smcabundle`.
  **BLOCKED**: `GET /v1/storeusers/{storeId}/offline-roster` does not exist
  server-side (§7a, 0% implemented). Cannot be honestly executed until the
  backend ships.

- [ ] **13.2** On a second device, `/auth/provision` → import with the
  master password → success message, link to `/login`.
  **BLOCKED on 13.1** (needs a real exported file — a manually-crafted
  bundle, e.g. via `serializeRoster` in a scratch script, can substitute for
  a partial check, but that is not the real end-to-end flow).

- [ ] **13.3** Go offline (devtools) → `/login` with a roster user → lands
  on their home; permissions/menu match online.
  **FLAGGED DEPENDENCY**: `pwa-offline-shell` is merged but NOT archived,
  and its own manual offline walkthrough is still pending. True offline
  `/login` (the app shell itself loading with no network) may not be
  honestly executable yet — verify `pwa-offline-shell`'s own smoke first, or
  note this step as blocked-pending-that-change.

- [ ] **13.4** Wrong password offline → same error surface as an online
  invalid login (`AUTH.INVALID_CREDENTIALS`).
  Not blocked by the above; pending a human pass once a provisioned test
  device is available.

- [ ] **13.5** Re-import the SAME file → `ReplayBundleError` message, no
  change to stored roster.
  Not blocked; pending a human pass.

- [ ] **13.6** Leave idle 1h (or temporarily lower `timeoutMs` for the
  walkthrough) → redirected to `/login`; roster still present
  (`isRosterProvisioned()` true); re-login with password only.
  Not blocked; pending a human pass.

- [ ] **13.7** **Unprovisioned-device regression pass** — the default state
  of every device, no roster ever imported: online login works exactly as
  before; offline shows the existing `AUTH.OFFLINE_LOGIN` banner and
  nothing else changes; no idle lock arms; no new screen or gate appears
  anywhere. The automated tests (Task 7 Suite B, Task 11's online-session
  case) already assert the code-level version of this; this manual pass is
  the human-eyes confirmation on a real build. Not blocked; pending a human
  pass.

- [ ] **13.8** **Mode-switch pass** — provisioned device WITH internet:
  import the bundle, stay online, log in → login goes through the roster
  (offline path), NOT through `POST /login`. Confirm in the Network tab
  that no login request leaves the device. Not blocked (a manually-crafted
  bundle suffices, no backend dependency); pending a human pass.

- [ ] **13.9** **Expiry pass** — let the bundle pass `expiresAt` (or edit
  it) → device falls back to online auth; user logs in normally with
  internet; not locked out. Not blocked; pending a human pass.

## What IS proven (automated, TDD red→green)

- Web Crypto KAT vectors (PBKDF2-HMAC-SHA256, 210000 iterations, 16-byte
  salt, 32-byte key) — `offline-crypto.test.ts`.
- `roster-store` purity (structural source-scan + behavioral zero-storage-
  access-at-import) — `roster-store.purity.test.ts`.
- Bundle round-trip, wrong-master, corrupt-file — `roster-serializer.test.ts`.
- Anti-replay, expiry, D3 shape guard (`InvalidBundleError`) —
  `roster-store.test.ts`.
- `authenticateOffline` 4 error paths + billing defaults —
  `offline-auth-service.test.ts`.
- `loginOffline` hydration through `setUser` —
  `auth-store.offline.test.ts`.
- `login.tsx` mode fork: provisioned (offline always, even with internet)
  vs. unprovisioned (byte-for-byte unchanged) — `login.offline.test.tsx`,
  plus the pre-existing `login.test.tsx` unmodified and green.
- Device provisioning route, all 4 failure modes, real serializer —
  `provision.test.tsx`.
- Admin export wiring — unit-level only, explicitly **BLOCKED-for-
  verification** — `roster-http-service.test.ts`, `roster-export-panel.test.tsx`.
- Idle lock scoped strictly to offline sessions, all 10 pre-existing
  `app-layout.test.tsx` assertions unmodified and green —
  `idle-timeout.test.ts`, `app-layout.test.tsx`.

## Next steps to unblock

1. Ship backend §7a (`GET /v1/storeusers/{storeId}/offline-roster`) — unblocks
   13.1, 13.2, and the real end-to-end verification of Task 10's export
   wiring (response envelope, DTO casing, date encoding, `users[].verifier`
   existence — all currently unproven).
2. Walk `pwa-offline-shell`'s own pending manual offline smoke — unblocks
   13.3's true-offline `/login` scenario.
3. Once both clear, a human executes 13.1–13.9 in order and checks the boxes
   above; only then does this change count as fully manually verified.
