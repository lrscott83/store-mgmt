# Proposal: Offline Authentication — Frontend (React PWA)

**Change**: `offline-auth-frontend` · **Phase**: propose · **Date**: 2026-07-28
**Artifact store**: hybrid (this file + engram `sdd/offline-auth-frontend/proposal`)
**Scope**: FRONTEND ONLY (`frontend-react/apps/web-store-pos`). Backend tracked in `docs/plans/2026-07-28-backend-pending-work.md` §7.
**Sources**: approved plan `docs/plans/2026-07-25-offline-auth-frontend-plan.md`; exploration `openspec/changes/offline-auth-frontend/explore.md` (engram #1615).

## Intent

**Problem.** The POS is used in stores with unreliable connectivity, but `login.tsx:65-68` hard-stops when `navigator.onLine` is false: it shows the `AUTH.OFFLINE_LOGIN` banner and returns. No credential can be evaluated without the API, so an offline device is an unusable device.

**Why now.** The PWA offline shell (`pwa-offline-shell`, 28/30, merged) already precaches `/login`; its own proposal names offline auth as the blocked successor. The shell is worthless while the first screen it serves cannot authenticate anyone.

**Success shape.** An admin exports an encrypted roster bundle, a device imports it once with the master password, and from that moment the device authenticates its store users locally — with or without internet — hydrating the *same* `UserModel` an online login produces, so every existing loader and guard works untouched.

## Governing rule (formalized, not open for debate)

```
isRosterProvisioned()  →  OFFLINE authentication against the roster file,
                          regardless of connectivity
otherwise              →  ONLINE authentication, EXACTLY as today
```

| # | Invariant | Consequence |
|---|---|---|
| 1 | **Mode switch, not a fallback** | Nothing may branch on `ConnectivityService.isOnline()` to *choose* the mode. A provisioned device on perfect fibre still authenticates offline. Connectivity keeps mattering only *inside* the online branch, where it already does. |
| 2 | **Unprovisioned device is byte-for-byte unchanged** | The single most important invariant of this change. A user who never provisions must be unable to tell this change shipped. Purely additive. Promoted to a first-class success criterion below. |
| 3 | **Expired bundle ≠ provisioned** | `isRosterProvisioned()` is false past `expiresAt`, so the device falls back to online auth instead of locking the user out. |
| 4 | **Absent user cannot log in on a provisioned device** | Rejected exactly like a wrong password (`AUTH.INVALID_CREDENTIALS`). Remedy is operational: re-export, re-import. |

## Scope

### In Scope

1. **Crypto primitives** — `sha256Base64`, `pbkdf2Base64`, `verifyOfflinePassword`. PBKDF2-HMAC-SHA256, 210000 iterations, 16-byte Base64 salt, 32-byte derived key, PBKDF2 input = the UTF-8 bytes of the `Base64(SHA256(password))` string. Byte-for-byte identical to the backend plan — the single most important cross-plan invariant.
2. **Bundle format + serializer** — `OfflineVerifier` / `OfflineRosterUser` / `OfflineRosterBundle`; zip.js AES, single `roster.json` entry, zip password = `` `${master}${storeId}` ``, `WrongPasswordError` / `CorruptFileError`. Mirrors `app/sync/lib/services/data-serializer-service.ts`.
3. **Roster storage** — persist, expiry read-guard, anti-replay (`ReplayBundleError`: same `bundleId` or `issuedAt <= last`), `getRoster(now?)`, `findRosterUser`, `clearRoster`, and the mode predicate `isRosterProvisioned()`.
4. **Offline auth service** — verify → map roster user to a complete `UserModel` (`authToken: 'offline-session'` sentinel); `NoRosterError`, `OfflineUserNotFoundError`, `OfflineInvalidPasswordError`, `OfflineUserInactiveError`.
5. **`loginOffline` store action** — hydrates through the existing `setUser` seam (`auth-store.ts:114-121`), preserving the synchronous cold-boot invariant (`auth-store.ts:220-222`).
6. **Login mode fork** — replaces the `login.tsx:65-68` early return; the roster question is asked FIRST; the connectivity check survives verbatim inside the unprovisioned branch. Offline errors map onto the message ids the online path already uses.
7. **`auth/provision` guest route** — file + storeId + master password → import; per-error messaging.
8. **Admin "Export offline roster"** — `roster-http-service` + a button on `user-list.tsx`, downloading via the `app/sync/routes/export.tsx:61-67` blob pattern. **Buildable and unit-testable; NOT end-to-end verifiable** (see Dependencies).
9. **1h idle lock** — `createIdleTimer` wired in `app-layout.tsx`, armed **only** when `authToken === 'offline-session'`. Locks (logout) without clearing the roster; re-entry needs the password only.
10. **Full suite green + a documented manual smoke checklist**, including the unprovisioned regression pass and the "provisioned + online" mode-switch pass.

### Out of Scope

- **All backend work**, including `GET /v1/storeusers/{storeId}/offline-roster`. `docs/plans/2026-07-28-backend-pending-work.md` §7/§7a.
- **Billing snapshot inside the roster** — a backend DTO decision, recorded as §7b. Not relitigated here.
- **At-rest encryption** — a separate plan with a deliberately *different*, expiry-independent predicate.
- **Idle lock for online sessions** — dropping the sentinel guard would be a behavior change for every existing user. Explicitly refused.
- **Password change / self-service enrollment offline**, roster auto-refresh, multi-store bundles, replacing the online path.

## Capabilities

### New Capabilities

- `offline-roster-bundle`: bundle schema and verifier parameters, encrypted container round-trip, device-local persistence, expiry read-guard, anti-replay, and the `isRosterProvisioned()` mode predicate.
- `offline-auth-mode`: the mode-selection rule at login, offline credential verification, roster-user → `UserModel` mapping (billing defaults included), error-id mapping, and the unprovisioned-device-unchanged invariant.
- `offline-device-provisioning`: the guest `auth/provision` import flow and the admin roster export action + HTTP service.

### Modified Capabilities

- `auth-session`: gains the `loginOffline` action hydrating through the existing `setUser` seam (cold-boot invariant preserved), and an idle-lock requirement scoped strictly to sessions whose `authToken` is the `offline-session` sentinel. `logout()`'s AUTH_MODEL-only clear is unchanged and MUST NOT clear the roster.

`auth-http` (registration contract) and `management-users` are **not** modified at spec level: the export button adds a surface, not a requirement change to existing user management behavior. `sdd-spec` should confirm this call.

## Approach

Additive modules under `app/shared/lib/offline/` (crypto → types → serializer → store → auth service → idle timer), each independently unit-tested, composed at exactly five existing seams: `auth-store.ts` (one new action), `login.tsx` (one fork block), `app-layout.tsx` (one guarded effect), `user-list.tsx` (one button), `routes.ts` (one route).

Every new module is a pure function set over `localStorage` and Web Crypto — no DI container, no new dependency, matching the codebase's plain-object service convention. The fork in `login.tsx` reaches `roster-store` through a dynamic `import()`, which keeps the module out of the initial bundle; that module must therefore remain free of top-level side effects (see Risks).

### Decisions already made — encoded, not reopened

| Decision | Resolution |
|---|---|
| **Billing fields on offline-hydrated users** (CRITICAL — `UserModel` gained three *required* fields in `b57fc3e`, one day after the plan was written; the plan's Task 4 `toUserModel()` sets none and **fails to typecheck as written**) | Use the codebase's established "no billing data" defaults: `paymentStatus: 'NoAplica'`, `isInTrial: false`, `paymentDueDate: null` — matching `payment-banner.tsx:22-23` and the `auth-store.test.ts` fixture. The banner renders nothing for `NoAplica`. **Accepted consequence: a store whose plan is actually expired shows no payment warning while offline.** The alternative (billing snapshot in the roster) is BACKEND work, already recorded as §7b. |
| **Task 9's `app-layout.tsx` wiring is stale** (plan says "71 lines, useEffect at 22-31 and 39-45"; the file is now 65 lines with ONE `useEffect` plus `<PaymentBanner />`) | Flagged, not solved here. `sdd-design` rewrites that wiring against the current file. |
| **Task 8 is blocked on a non-existent endpoint** | In scope to *build and unit-test* against a mocked `apiClient`; explicitly **not verifiable end-to-end** until the backend ships. Scoped honestly, not silently deferred. |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `app/shared/lib/offline/*` | New | crypto, roster-types, roster-serializer, roster-store, offline-auth-service, idle-timeout |
| `app/shared/lib/http/roster-http-service.ts` | New | Export endpoint call |
| `app/auth/routes/provision.tsx` | New | Guest import route |
| `app/auth/routes/login.tsx` | Modified | Mode fork replaces the offline early return |
| `app/shared/lib/stores/auth-store.ts` | Modified | `loginOffline` action only |
| `app/shared/components/app-layout.tsx` | Modified | Sentinel-guarded idle effect (rewrite vs current file) |
| `app/management/users/routes/user-list.tsx` | Modified | Export button + `useAuthStore` import |
| `app/routes.ts` | Modified | One `route('auth/provision', ...)` line |
| `packages/domain/src/models/auth.ts` | Read-only | The `UserModel` shape the mapping must fully satisfy |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Verifier parameters drift from the backend | Med | **Fatal** — every offline login fails | Pin PBKDF2 params in the spec with known-answer vectors; the backend plan carries the identical constants |
| A future top-level side effect in `roster-store.ts` silently affects every online login (the dynamic import runs on **every** submit) | Med | High — violates invariant #2 | Dedicated test asserting zero storage access at module import time; spec-level requirement that the module stay side-effect-free |
| Silent payment banner for an expired plan offline | High (by design) | Med — business signal lost | Accepted, documented, escalated to backend §7b |
| Idle lock leaking to online sessions if the sentinel guard is mis-implemented | Low | High — behavior change for every user | Explicit test: unprovisioned/online session arms no timer |
| Task 8 unverifiable end-to-end | Certain | Med | Mocked-transport unit tests; manual step 1 deferred until the endpoint ships |
| `pwa-offline-shell` not archived (its manual offline walkthrough is still pending) | Med | Med — the true-offline `/login` smoke steps may be unexecutable | Track as a predecessor; run the automated suite regardless and record any smoke step that cannot be honestly executed |
| Roster in `localStorage` in plaintext (verifiers only, no passwords) | Low | Med | Verifier-only content by design; at-rest encryption is a separate, planned change |

## Rollback Plan

Every deliverable lands as its own work-unit commit on a new branch cut from `main`. Rollback is `git revert` of the fork commit alone (`login.tsx`) — that single revert restores today's behavior for **all** devices, provisioned or not, because the fork is the only thing that can select the offline mode. Full rollback reverts the branch: the six new modules and two new routes/services become dead code, and the modified files return to their current state. No data migration and no server state involved; a provisioned device retains two inert `localStorage` keys (`lizoft.offline-roster`, `lizoft.offline-roster-last`) which nothing reads once the fork is gone.

## Dependencies

- **Backend** `GET /v1/storeusers/{storeId}/offline-roster` — does not exist, 0% implemented. Blocks end-to-end verification of Task 8 only. Tracked as §7a of the backend backlog; **not** work for this change.
- **`pwa-offline-shell`** — merged to main, manual walkthrough and archive pending. Precaches `/login` for true offline loads.
- No new npm dependencies: Web Crypto (`crypto.subtle`, real under jsdom) and `@zip.js/zip.js` (already present) cover everything.

## Success Criteria

**The headline invariant (#2) — testable, and honest about what proves it:**

- [ ] **An unprovisioned device is byte-for-byte unchanged.** Proven by FOUR distinct pieces of evidence, because no single one is sufficient:
  1. The existing suite (`pnpm test`, incl. `login.test.tsx`, `auth-store`, `loaders.cold-boot`) passes with zero modifications to existing test files. **This proves only that the online path's already-asserted behavior did not regress.** It does NOT prove the absence of new module-load work, new network calls, new render surfaces, or timing changes on the unprovisioned path — no existing test asserts any of those.
  2. A new **Suite B** pins the gap directly: with `localStorage` cleared, online submit calls the online `login` action and **never** `loginOffline`; offline submit renders the `AUTH.OFFLINE_LOGIN` banner and calls **neither**.
  3. A module-purity test imports `roster-store` with a `localStorage` spy installed and asserts **zero** reads/writes at import time — the guard on the dynamic import that runs on every login submit.
  4. An `app-layout` test asserts **no idle timer is armed** when `authToken !== 'offline-session'`.
  - [ ] **Any test that must be edited to make the suite pass is treated as a regression, not as maintenance** — it means observable behavior changed on a path this change promised not to touch.

**The rest:**

- [ ] Mode switch, not fallback: a provisioned device **with internet** authenticates through the roster; `POST /login` is never called (asserted by spy, and confirmed in the Network tab during the manual pass).
- [ ] An expired bundle makes `isRosterProvisioned()` false and the device logs in online normally — the user is never locked out.
- [ ] A user absent from the roster is rejected on a provisioned device with `AUTH.INVALID_CREDENTIALS`, indistinguishable from a wrong password.
- [ ] Known-answer crypto vectors pass; `verifyOfflinePassword` is true only for the matching password.
- [ ] Round-trip through the serializer is lossless; a wrong master raises `WrongPasswordError`.
- [ ] Re-importing the same `bundleId`, or any bundle with `issuedAt <= last`, raises `ReplayBundleError`.
- [ ] An offline login hydrates a **complete** `UserModel` (billing defaults included) through `setUser`, and every existing loader/guard passes unchanged with no loader modification.
- [ ] `pnpm test` green, `tsc --noEmit` clean, `pnpm build` succeeds.
- [ ] The manual smoke checklist is executed and recorded, with any step blocked by the missing endpoint or by `pwa-offline-shell` marked as blocked rather than silently skipped.
