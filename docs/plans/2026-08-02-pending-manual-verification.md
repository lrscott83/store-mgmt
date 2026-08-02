# Pending Manual Verification — Steps No Agent Can Run

Date: 2026-08-02
Scope: a register of acceptance steps that are blocked on a human or on a runtime this environment does not have. Nothing here is a code defect. Each item names what it proves, why it cannot be automated today, and what would make it automatable.

This exists because these steps were being rediscovered and re-litigated every session. Written down, they stop being a surprise and become a queue.

---

## 1. PWA offline shell — real-browser acceptance

**Change:** `openspec/changes/pwa-offline-shell` (open, verify verdict PASS WITH WARNINGS)
**Blocked on:** a human with a browser. No Playwright or any browser automation exists in this repo, so no test here can prove offline rendering.
**Stakes:** this is the literal, spec-defined acceptance gate of the feature, and the code is already on `main`. Its own verify-report says so plainly: *"the one thing the spec calls the actual test of the feature has not happened."*

Task 8.2 is **done and automated** — precache composition is now a build gate (`verify-sw-precache.mjs` + `REQUIRED_PRECACHE_FAMILIES`), and the single cache name is verifiable from the built artifact. What follows is what genuinely needs eyes.

- [ ] **8.1 — Serve and activate.** `pnpm build`, then serve `build/client` on a port that is NOT the dev server's 3333 (e.g. `npx serve build/client -l 4173`, matching `preview.port`). Serving the production build on the dev origin makes both share one service-worker scope — the collision `vite.config.ts` avoids. Unregister any existing SW, clear site data, reload, wait for `activated`.
- [ ] **8.3 — Offline rendering, public and app routes.** DevTools → Network → Offline. Type-load directly: `/login`, `/`, `/help/tutorial` (all 6 images must render), `/sales/new`, `/inventory/available`. Each must render the app shell, never a browser error page.
- [ ] **8.4 — Offline rendering, admin routes.** Type-load directly: `/admin/dashboard`, `/management/users`, `/profile/edit`. The view must render; in-app API calls MAY fail — that is expected and out of scope.
- [ ] **8.5 — Update prompt.** Back online, rebuild with a trivial change, reload twice, confirm the update prompt appears and that accepting it serves the new version.
- [ ] **8.6 — Gate.** Any failed step blocks shipping. Return to Phase 4 for diagnosis; do not patch the checklist to make it pass.

**What would automate this:** Playwright with an offline context (`context.setOffline(true)`) plus a service-worker readiness wait. That is a real piece of infrastructure work, not a flag — it needs a browser in CI. Worth scoping if offline behaviour is going to keep changing; not worth it for a one-time check.

### 1b. Debug logging cleanup — needs sign-off, not a browser

- [ ] **9.1 — BLOCKED pending explicit user sign-off.** Remove the `[SW]` / `[PWA]` TEMP debug `console.log` calls from `service-worker.ts` and `service-worker-registration.ts`. The task marks itself as requiring a decision before anyone touches this file set, because the logs are the only visibility into SW lifecycle during the Phase 8 walkthrough. **Do this AFTER Phase 8, not before** — removing them first throws away the diagnostics the walkthrough depends on.

---

## 2. At-rest encryption — .NET interop vector

**Change:** `at-rest-encryption-frontend` (archived 2026-08-02, over a deliberate verify override)
**Blocked on:** a .NET runtime. `dotnet` is not installed here and the Docker daemon rejects this user, so no genuine .NET-produced value can be obtained by any route — a program, the unit tests, or the API, which needs the whole app plus a database.
**Owned by:** `docs/plans/2026-08-02-offline-roster-dek-interop-backend-plan.md` (commit `414a78e`), Tasks 1-3, with the two-line frontend follow-up as its Task 4.

Not repeated here. That plan is the queue. One correction worth carrying: the gap is **not** frontend-specific — the backend's own E2E asserts only that `wrappedDek` is non-empty and never unwraps it, so nothing on either side proves the key is recoverable.

**Residual risk is bounded by code, not by hope.** `ExportOfflineRosterQuery.cs:101-102` hands the same stored hash to both `CreateVerifier` and `WrapDek`; `OfflineVerifierService.cs:16-21` and `StoreKeyWrapService.cs:20-25` perform the identical derivation, differing only in salt; and `dek-unwrap.ts:48-49` calls the same `sha256Base64` / `pbkdf2Base64` the shipped offline verifier already uses. The KEK derivation *is* the verifier derivation, and the verifier is in production. The AES-GCM composition was cross-checked against Node/OpenSSL during implementation.

---

## 3. Offline auth — smoke checklist never run, and its blocker is gone

**Change:** `offline-auth-frontend` (archived 2026-07-29)
**Document:** `docs/plans/2026-07-28-offline-auth-frontend-smoke-checklist.md` — **0 of 9 steps executed**
**Blocked on:** a human with a real device/browser.

The change was archived with this checklist untouched. Its own header says steps 13.1-13.2 were *"structurally blocked on backend §7a"* — the roster export endpoint.

**That blocker no longer exists.** `GET /v1/storeusers/{storeId}/offline-roster` is implemented and live (`StoreUsersController.cs:41-45`), and the stale comments in `roster-http-service.ts` / `roster-export-panel.tsx` claiming otherwise were corrected during the at-rest work. Nobody went back to the checklist after the endpoint shipped.

- [ ] Re-read the 9 steps against today's reality, drop or rewrite whatever the endpoint's arrival made obsolete, and run what remains.

This one is worth doing **before** the PWA walkthrough if a device is available: it exercises roster import and offline login, which is the substrate the PWA offline shell renders on top of. A failure here would explain a failure there.

---

## 4. Stale SDD change folders — an audit, not implementation

Two change folders sit open in the **legacy** `frontend-react/openspec/` tree (not the canonical repo-root `openspec/`):

- `frontend-parity-audit` — 15 done, **41 pending**
- `help-tutorial` — 0 done, **12 pending**

Do not treat these as 53 items of backlog before checking. Strong evidence they are stale artifacts rather than undone work: the Angular→React migration and all presentation-parity buckets were closed and landed, and `/help/tutorial` demonstrably ships today — its 6 screenshots are in the precache manifest and Phase 8 tests the route.

- [ ] Audit both against the code and either tick them closed or extract whatever genuinely remains. Ticking a checkbox is not the deliverable; deciding whether the folder still describes reality is.

---

## Not on this list

Anything blocked only on an agent's time. This register is for work that a human, a browser, or a missing runtime has to unblock — nothing else belongs here.
