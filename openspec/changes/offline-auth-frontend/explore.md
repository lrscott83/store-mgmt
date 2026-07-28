# Exploration: offline-auth-frontend

**Change**: `offline-auth-frontend`
**Phase**: explore
**Date**: 2026-07-28
**Artifact store**: hybrid (this file + engram `sdd/offline-auth-frontend/explore`, obs 1615)
**Scope**: FRONTEND ONLY. Backend work is tracked in `docs/plans/2026-07-28-backend-pending-work.md`.

## Governing rule (from the approved plan)

```
isRosterProvisioned()  →  OFFLINE authentication against the roster file,
                          regardless of connectivity
otherwise              →  ONLINE authentication, EXACTLY as today
```

Non-negotiable consequences:

1. It is a **mode switch, not a fallback**. A provisioned device with perfect internet still authenticates offline. Nothing may branch on `ConnectivityService.isOnline()` to choose the mode.
2. A device that never imported the roster is **byte-for-byte unchanged**. Purely additive.
3. An **expired** bundle is NOT provisioned — the device falls back to online auth instead of locking the user out.
4. A user absent from the roster **cannot log in** on a provisioned device — rejected exactly like a wrong password (`AUTH.INVALID_CREDENTIALS`).

## 1. Current state of frontend auth (verified symbol-by-symbol)

| Seam | File:line | Verified state |
|---|---|---|
| Offline early-return | `app/auth/routes/login.tsx:65-68` | `if (!ConnectivityService.isOnline()) { setIsOffline(true); return; }` — exact match to the plan. This is the line the mode-fork replaces. |
| Login component state | `login.tsx:30` | `const { login, isLoading } = useAuthStore();` — plan's destructuring assumption accurate. |
| Error surface | `login.tsx:92-108` | `setErrors({ form: intl.formatMessage(...) })`; no `setError`. Status branches: 401→`AUTH.INVALID_CREDENTIALS`, 403→`AUTH.ACCOUNT_INACTIVE`, else→`AUTH.SERVER_ERROR`. The plan's `offlineErrorMessageId` mapping reuses these exact ids — correct. |
| Success path | `login.tsx:70-81` | `setIsSubmitting(true)` → `login()` → `armTracking()` → `preloadHeavyChunks()` → `navigate(await resolveUserHomePath(user))`. The plan's Task 6 replay of this sequence is accurate. |
| Auth store hydration seam | `app/shared/lib/stores/auth-store.ts:114-121` (`setUser`) | Stamps `expiresIn = Date.now()+35d`, writes TOKEN/CURRENT_USER/AUTH_MODEL, sets `{user, isAuthenticated:true}`. The exact seam Task 5's `loginOffline` must call — still the single hydration point loaders and guards rely on. |
| Cold-boot invariant | `auth-store.ts:220-222` | `if (typeof window !== 'undefined') useAuthStore.getState().initialize();` — synchronous, unchanged. Task 5 adding an action only (no new module-load hydration) is safe. |
| Route guards | `app/auth/routes/loaders.ts` | `authLoader`, `featureLoader` (SuperAdmin/OwnerAdmin bypass at line 69), `adminLoader`, `resellerLoader` all gate on `user && isAuthenticated` from the store — mode-agnostic; they work unchanged once `loginOffline` hydrates through `setUser`. |
| Connectivity | `app/shared/lib/auth/connectivity-service.ts` | Trivial `navigator.onLine` wrapper, exactly as the plan assumes. |
| `AUTH.OFFLINE_LOGIN` banner | `login.tsx:124-128` | Renders when `isOffline` is true — must remain reachable ONLY for unprovisioned devices. |
| Sync patterns to mirror | `app/sync/lib/services/data-serializer-service.ts`, `app/sync/routes/export.tsx:61-67` | Both exist as described (zip.js AES with `password+storeId` concatenation; Blob→createObjectURL→anchor→revoke). Safe models for Tasks 2/7/8. |

## 2. Gap analysis — where the plan has drifted since 2026-07-25

### Drift #1 — CRITICAL, will fail to typecheck

`UserModel` in `frontend-react/packages/domain/src/models/auth.ts:23-40` gained three new **required** fields from the billing feature (commit `b57fc3e`, 2026-07-27 — one day after this plan was written):

```ts
paymentDueDate: string | null;
isInTrial: boolean;
paymentStatus: PaymentStatus;
```

The plan's Task 4 `toUserModel()` (offline-auth-service.ts) sets none of them — it will fail TypeScript compilation as written. The backend roster DTO (`OfflineRosterUserDto`) carries none of them either, and no plan schedules adding them (backend offline-auth is 0% built).

An established default already exists in the codebase for exactly this "no billing data available" case: the `auth-store.test.ts` fixture and `PaymentBanner`'s own DG-2 comment (`app/shared/components/payment-banner.tsx:22-23`) both use `paymentStatus: 'NoAplica'`, `isInTrial: false`, `paymentDueDate: null` — and the banner renders nothing for `NoAplica`.

### Drift #2 — stale line references

Task 9 describes `app/shared/components/app-layout.tsx` as "71 lines... useEffect hooks at lines 22-31, 39-45". The file is now 65 lines with exactly **one** `useEffect` (lines 23-32, sidebar auto-collapse) plus a new `<PaymentBanner />` at line 48. Task 9's idle-timer wiring targets line numbers that no longer exist and must be rewritten against the current structure during propose/design.

### No other drift

Tasks 1-8's file:line claims all still hold — `login.tsx`, `auth-store.ts`, `user-list.tsx` (73 lines, header at 54-58, still lacks the `useAuthStore` import as the plan expects), the `routes.ts` guest layout group, and the `app/sync/*` model files match the plan precisely.

## 3. Risk of violating consequence #2 (unprovisioned device unchanged)

Two seams sit on BOTH the provisioned and unprovisioned paths:

- **`login.tsx` handleSubmit (Task 6)** — the mode-fork does `await import('~/shared/lib/offline/roster-store')` on **every** submit, including online users who never provisioned. Safe only while `roster-store.ts` stays free of top-level side effects. The planned implementation is pure functions and constants, so it holds today; any future change adding module-load work there would silently affect every online login.
- **`app-layout.tsx` idle timer (Task 9)** — correctly gated on the `authToken === 'offline-session'` sentinel, so online sessions never arm the 1h lock. Sound design, low risk, contingent on the implementation matching that guard exactly (see Drift #2).

The admin "Export offline roster" button (Task 8) is visible on `user-list.tsx` to every admin regardless of provisioning state. Intentional additive UI following the existing sync-export pattern — not an auth-mode regression, but it is a new always-visible surface on a route every admin hits.

## 4. Open questions (genuine forks)

1. **Billing signal for offline sessions.** Should offline-hydrated users default to `paymentStatus: 'NoAplica'` (banner silent) even on a store that is actually `Vencido` server-side? A stale or absent billing signal for offline sessions may need product sign-off. Consequence of Drift #1.
2. **Predecessor dependency.** Must `pwa-offline-shell` (28/30, merged to main, pending its manual walkthrough and archive) be fully closed before this change's manual smoke checklist can be honestly executed? Its proposal states offline-auth is blocked on it for true offline `/login` loads.

## 5. Files in scope

- `app/auth/routes/login.tsx`, `app/auth/routes/loaders.ts`, `app/auth/routes/provision.tsx` (new)
- `app/shared/lib/stores/auth-store.ts`
- `app/shared/lib/offline/*` (all new — crypto, roster-types, roster-serializer, roster-store, offline-auth-service, idle-timeout)
- `app/shared/lib/http/roster-http-service.ts` (new)
- `app/shared/components/app-layout.tsx`
- `app/management/users/routes/user-list.tsx`
- `app/routes.ts`
- `frontend-react/packages/domain/src/models/auth.ts` (read-only reference — the `UserModel` shape Task 4 must fully satisfy)
- Reference-only: `app/sync/lib/services/data-serializer-service.ts`, `app/sync/routes/export.tsx`, `app/sync/components/*`

## 6. Backend dependency (out of scope, but blocking for one task)

`docs/plans/2026-07-25-offline-auth-backend-plan.md` is **0% implemented**. No `GET /v1/storeusers/{storeId}/offline-roster` endpoint exists. Task 4 (offline-auth-service) and Task 7 (provision route) can be built and unit-tested standalone against self-serialized bundles; Task 8 (admin export button + `roster-http-service`) cannot be verified end-to-end until the backend ships. Dependency to track, not work for this change. See `docs/plans/2026-07-28-backend-pending-work.md` item 7.
