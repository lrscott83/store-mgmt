## Verification Report

**Change**: offline-auth-frontend
**Version**: spec engram #1617 / openspec/changes/offline-auth-frontend/specs/*
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 13 (0-13) |
| Tasks complete | 12 (Tasks 0-12) |
| Tasks incomplete | 1 (Task 13 — manual smoke, cannot be closed by an agent; sub-item 13.10 done) |

tasks.md checkbox state verified directly (not taken on faith): `[x]` on every line for Tasks 0-12, `[ ]` on 13.1-13.9, `[x]` on 13.10. Matches apply-progress's own "12/13" framing exactly.

### Build & Tests Execution
**Build**: PASSED (re-run by verify, not trusted from report)
```
$ pnpm -C apps/web-store-pos build
...
✓ built in 4.51s (client) / 296ms (SSR)
PWA v1.3.0 — mode injectManifest
verify-sw-precache: OK — 136 precached entries; shell and route manifest each present exactly once.
```

**Typecheck**: PASSED — `pnpm -C apps/web-store-pos exec tsc --noEmit` exits 0, zero output.

**Tests**: 154 files passed (154) / 2158 tests passed (2158), 0 failed
```
$ pnpm test  (from frontend-react/)
 Test Files  154 passed (154)
      Tests  2158 passed (2158)
    Duration  9.70s
```
All three numbers (154 files, 2158 tests, 136 precache entries) independently reproduced — not copy-pasted from apply-progress.

**Coverage**: not available — no coverage tool detected in this project (informational only, not a failure).

---

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | apply-progress + tasks.md carry per-task RED/GREEN/commit sequencing for every task |
| All tasks have tests | Yes | 13/13 logic tasks have dedicated test files (crypto, purity guard, serializer, roster-store, auth-service, auth-store, login fork, i18n shape, provision route, roster-http-service, roster-export-panel, idle-timeout, app-layout extension) |
| RED confirmed (tests exist) | Yes | All listed test files exist in the tree and were executed above |
| GREEN confirmed (tests pass) | Yes | 2158/2158 pass on this run, including every offline-* test file |
| Triangulation adequate | Yes | Each behavior (crypto KAT, round-trip, anti-replay, expiry, shape guard, 5 auth-service error paths, Suite A/B login fork, idle-lock arm/no-arm) has 2+ distinct-outcome test cases |
| Safety Net for modified files | Yes | `login.test.tsx` (existing, unmodified) still green; `app-layout.test.tsx`'s pre-existing 10 tests untouched and still passing alongside the 2 new idle-lock tests |

**TDD Compliance**: 6/6 checks passed

---

### Test Layer Distribution (offline-auth-frontend files only)
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | ~55 | 9 (offline-crypto, roster-serializer, roster-store, roster-store.purity, offline-auth-service, auth-store.offline, roster-http-service, idle-timeout, es-provisioning-ids) | vitest |
| Integration | ~14 | 4 (login.offline.test.tsx, provision.test.tsx, roster-export-panel.test.tsx, app-layout.test.tsx extension) | @testing-library/react |
| E2E | 0 | 0 | not installed |
| **Total** | **~69** | **13** | |

---

### Assertion Quality
Scanned all 13 offline-related test files for tautologies, ghost loops, empty-collection-only checks, mock-heavy ratios, and smoke-test-only patterns. **None found.** Every test calls real production code (real Web Crypto, real zip.js serializer, real localStorage-backed roster-store, real rendered React components) and asserts specific, non-trivial values (KAT digests, error class identity via `toBeInstanceOf`, storage key presence, UI text matching catalog strings).

**Assertion quality**: ✅ All assertions verify real behavior

---

### Quality Metrics
**Linter**: not run as part of this verify pass (no linter invocation reported in gates; typecheck is the enforced gate)
**Type Checker**: ✅ No errors (tsc --noEmit clean, re-verified)

---

### Spec Compliance Matrix

**offline-roster-bundle**
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Verifier parameters pinned by KAT | SHA-256 KAT | `offline-crypto.test.ts > hashes "test" to the pinned digest` | ✅ COMPLIANT |
| Verifier parameters pinned by KAT | verifier true only for matching password | `offline-crypto.test.ts > verifyOfflinePassword` | ✅ COMPLIANT |
| Bundle round-trips losslessly | round-trip preserves bundle | `roster-serializer.test.ts > deserializes to exact original` | ✅ COMPLIANT |
| Bundle round-trips losslessly | wrong master rejected | `roster-serializer.test.ts > WrongPasswordError` | ✅ COMPLIANT |
| isRosterProvisioned() predicate | valid bundle → true | `roster-store.test.ts > isRosterProvisioned is true right after import` | ✅ COMPLIANT |
| isRosterProvisioned() predicate | expired/malformed → false, never throws | `roster-store.test.ts > D3 shape guard` block | ✅ COMPLIANT |
| Anti-replay on import | re-import same bundle rejected | `roster-store.test.ts > rejects re-importing identical bundle` | ✅ COMPLIANT |
| Anti-replay on import | older-issued rejected | `roster-store.test.ts > rejects older issuedAt` | ✅ COMPLIANT |
| Anti-replay on import | already-expired rejected at import | `roster-store.test.ts > rejects already-expired bundle` | ✅ COMPLIANT |
| Roster storage has no top-level side effects | zero localStorage reads/writes on import | `roster-store.purity.test.ts` (behavioral spy) | ✅ COMPLIANT |
| Roster storage has no top-level side effects | structural: import-type-only | `roster-store.purity.test.ts` (source-scan) + independently re-verified by reading `roster-store.ts:14` directly — the only non-type import line | ✅ COMPLIANT |

**offline-auth-mode**
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Mode switch, not a fallback | provisioned + online still goes offline, `login` never called | `login.offline.test.tsx > A2` | ✅ COMPLIANT |
| Unprovisioned device byte-for-byte unchanged | unprovisioned + online → online login only | `login.offline.test.tsx > B1` | ✅ COMPLIANT |
| Unprovisioned device byte-for-byte unchanged | unprovisioned + offline → banner only, neither action called | `login.offline.test.tsx > B2` | ✅ COMPLIANT |
| Expired bundle falls back to online | expired roster + internet → online path | (implicit) `isRosterProvisioned` returns false for expired bundles (roster-store.test.ts), and `login.tsx:94` falls through to the unmodified online branch when false — no dedicated login.tsx-level test with an actually-expired bundle | ⚠️ PARTIAL — covered by composition of two separately-tested units, not by one integration test exercising an expired bundle through the login form |
| User absent from roster rejected like wrong password | unknown login → `AUTH.INVALID_CREDENTIALS` | `offline-auth-service.test.ts > OfflineUserNotFoundError` + `login.tsx`'s error-id mapping (same bucket as `OfflineInvalidPasswordError`) | ✅ COMPLIANT |
| Offline error mapping | wrong password → `AUTH.INVALID_CREDENTIALS` | `login.offline.test.tsx > A3` | ✅ COMPLIANT |
| Offline error mapping | inactive → `AUTH.ACCOUNT_INACTIVE` | `offline-auth-service.test.ts > OfflineUserInactiveError` (message-id mapping itself only unit-tested at the `offlineErrorMessageId` function level, not round-tripped through a rendered inactive-user login) | ⚠️ PARTIAL |
| Offline-hydrated UserModel no-billing defaults | complete UserModel, payment banner renders nothing | `offline-auth-service.test.ts > maps billing fields to no-billing-data defaults` | ✅ COMPLIANT (banner-renders-nothing half verified structurally via `payment-banner.tsx`'s pre-existing `NoAplica` handling, not a new rendered assertion in this change) |

**offline-device-provisioning**
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Guest route imports bundle | successful provisioning → roster imported, isRosterProvisioned() true | `provision.test.tsx > successfully imports a bundle` | ✅ COMPLIANT |
| Distinct message per failure mode | wrong master | `provision.test.tsx` | ✅ COMPLIANT |
| Distinct message per failure mode | corrupt file | `provision.test.tsx` | ✅ COMPLIANT |
| Distinct message per failure mode | expired bundle | `provision.test.tsx` | ✅ COMPLIANT |
| Distinct message per failure mode | replayed bundle | `provision.test.tsx` | ✅ COMPLIANT |
| Admin export — disabled while offline | export disabled | `roster-export-panel.test.tsx > disables the export action while offline` | ✅ COMPLIANT |
| Admin export — mock-only end-to-end scenario | calls getOfflineRoster + serializes | `roster-http-service.test.ts` + `roster-export-panel.test.tsx > fetches and serializes` | ⚠️ UNTESTED-AGAINST-REAL-BACKEND — explicitly flagged BLOCKED-for-verification in both source comments and tests; `GET /v1/storeusers/{storeId}/offline-roster` (0%, backend §7a) does not exist. Response envelope shape, DTO casing, epoch-vs-ISO dates, and `users[].verifier` existence are unproven. This is a spec-acknowledged, not a hidden, gap — the spec itself says "not verifiable end-to-end until the backend ships." |

**auth-session (delta)**
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| loginOffline hydrates via setUser seam | same storage keys as online login | `auth-store.offline.test.ts > hydrates through setUser exactly like an online login` | ✅ COMPLIANT |
| Idle lock scoped to offline sessions | offline session locks after 1h, logout() invoked | `app-layout.test.tsx > arms the idle timer for an offline session...` | ✅ COMPLIANT |
| Idle lock scoped to offline sessions | online session never arms | `app-layout.test.tsx > never arms a timer for an online session` | ✅ COMPLIANT |
| Logout storage-clear scope (modified) | AUTH_MODEL only, token/currentUser stale | pre-existing auth-store logout tests (unmodified, still green) | ✅ COMPLIANT |
| Logout storage-clear scope (modified) — NEW: offline idle-lock logout preserves the roster | isRosterProvisioned() still true after idle-triggered logout | No dedicated test. Verified structurally by source inspection instead: `clearRoster()` (`roster-store.ts:153`) has exactly one call site — its own definition, referenced only from `roster-store.test.ts`. `auth-store.ts`'s `logout()` (lines 214-227) touches only `StorageKeys.AUTH_MODEL`, never `lizoft.offline-roster` or `lizoft.offline-roster-last`. The app-layout idle-lock test only asserts a **mocked** `logout` was called, not that the real `logout()` + a real roster survive together. | ⚠️ UNTESTED — true by static code inspection, not proven by a passing test that combines a real provisioned roster with a real idle-triggered `logout()` call |

**Compliance summary**: 21/25 scenario-rows COMPLIANT, 3 PARTIAL (composition-verified, not integration-tested), 1 UNTESTED (structural-only), plus the explicitly spec-acknowledged mock-only export scenario. No FAILING scenarios found.

---

### Correctness (Static Evidence) — Headline Invariant

| Check | Status | Notes |
|---|---|---|
| `auth-store.ts` has zero static `offline/` imports | ✅ Verified | Only 4 static imports total (zustand, UserModel type, StorageKeys, StorageService); `authenticateOffline` is reached via `await import('../offline/offline-auth-service')` inside `loginOffline` only (auth-store.ts:197) |
| `login.tsx` forks by roster presence, no static `offline-auth-service` import | ✅ Verified | Imports list (lines 1-12) contains no `offline/` path; roster check is `await import('~/shared/lib/offline/roster-store')` inside `handleSubmit` (line 93); error dispatch is by `err.name` string comparison (lines 33-43), never `instanceof` |
| `roster-store.ts` purity guard holds | ✅ Verified (both by test and by direct source read) | Line 14 is the only `import` line and it is `import type { ... } from './roster-types'`; no other import statements in the file |
| `app-layout.tsx`'s idle-lock static import doesn't drag crypto into default bundle | ✅ Verified | `createIdleTimer` (from `idle-timeout.ts`) and `OFFLINE_SESSION_TOKEN` (from `offline-session.ts`) are both explicitly zero-import leaf modules (confirmed by reading both files in full — no imports at all in either); build output shows `offline-auth-service` code-split into its own chunk (`assets/offline-auth-service-By3F9wKu.js`, 5.12 kB SSR asset), separate from the app-layout/login chunks |

**Headline invariant verdict**: HOLDS. Independently re-verified, not taken on the apply-progress report's word.

---

### Coherence (Design)
| Decision | Followed? | Notes |
|---|---|---|
| D1 — module dependency graph / zero static offline imports from auth-store, login | ✅ Yes | Confirmed above |
| D2 — PBKDF2 params pinned by KAT | ✅ Yes | Constants + KAT vector match spec exactly |
| D3 — shape guard before numeric comparison | ✅ Yes | `hasValidShape()` guards both `importRoster` and `getRoster` before any `<=` comparison |
| D4 — error classes with `readonly name` + `Object.setPrototypeOf`, dispatch by name | ✅ Yes | All 8 offline error classes (roster-store: 3, offline-auth-service: 5) follow the pattern; `login.tsx`/`provision.tsx` dispatch by `.name` |
| D5 — idle lock static import, first statement in AppLayout, JSX untouched | ✅ Yes | `useOfflineIdleLock()` is literally the first line of `AppLayout()` (app-layout.tsx:75); JSX block (79-96) unchanged from the pre-existing 10-test baseline |
| D6 — loginOffline hydrates via `get().setUser()`, returns `get().user` not raw `user` | ✅ Yes | auth-store.ts:202-207 matches exactly |
| D7 — no shared `downloadBlob()` extraction; export pattern inlined verbatim | ✅ Yes | `roster-export-panel.tsx:53-59` inlines the Blob/anchor/revoke pattern rather than importing a helper from `export.tsx` |
| Design correction #4 — selector hook not `getState()` in user-list/export panel | ✅ Yes | `roster-export-panel.tsx:26` uses `useAuthStore((s) => s.user?.selectedStoreId ?? '')` |
| Task-vs-design naming: export lives in a dedicated `roster-export-panel.tsx`, not inline in `user-list.tsx` | ✅ Yes, and correctly flagged as a non-blocking discrepancy in the tasks artifact | `user-list.tsx` imports and renders `<RosterExportPanel />` |

---

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. Spec scenario "Offline idle-lock logout preserves the roster" (`auth-session` delta, MODIFIED requirement) has no automated test combining a real provisioned roster with a real (non-mocked) `logout()` call and a post-logout `isRosterProvisioned()` assertion. It is true by static code inspection (`clearRoster()` has no call sites outside its own test), but the spec explicitly calls out this scenario and it deserves a direct regression test — a future refactor of `logout()` could silently break it with nothing catching the regression.
2. Two `offline-auth-mode` scenarios ("An expired bundle falls back to online auth" and "Inactive roster user is rejected distinctly") are only proven by composing two separately-tested units (`roster-store`'s expiry logic + `login.tsx`'s branch-on-`isRosterProvisioned`; `offline-auth-service`'s error class + `login.tsx`'s error-id map) rather than by one test that drives an actually-expired/actually-inactive case end-to-end through the rendered login form. Lower risk than #1 since both halves are independently well-tested, but it is a gap relative to the spec's own Given/When/Then phrasing (which describes an end-to-end flow).
3. **Task 10 (admin roster export) must not be read as fully verified.** `GET /v1/storeusers/{storeId}/offline-roster` does not exist server-side (0% implemented, tracked in `docs/plans/2026-07-28-backend-pending-work.md` §7a — a BACKEND gap, out of this change's scope to fix). Unit tests prove only URL construction and `response.data.data` unwrapping against a hand-built mock object. Response envelope shape, DTO field casing, whether `issuedAt`/`expiresAt` arrive as epoch-ms or ISO strings, and whether `users[].verifier` exists at all on the real payload are all unproven. Both the source (`roster-http-service.ts`) and its test carry explicit "BLOCKED-for-verification" comments — this is honestly labeled, not hidden, but it must stay visible through archive.
4. **Task 13 (manual smoke) is unexecuted.** Documented in `docs/plans/2026-07-28-offline-auth-frontend-smoke-checklist.md`. Steps 13.1-13.2 are structurally blocked on the same missing backend endpoint (§7a). Step 13.3 (true offline `/login` walkthrough) additionally depends on `pwa-offline-shell`'s own pending manual DevTools walkthrough (that change is merged but not archived). Steps 13.4-13.9 are executable today but have not been run by a human. tasks.md correctly leaves 13.1-13.9 unchecked.

**SUGGESTION**:
1. No linter pass was reported/re-run as part of this verify (typecheck was the enforced gate). If the project has an eslint config for `frontend-react`, running it against the ~15 new/modified offline-auth files would close a small blind spot — informational only, not blocking.
2. Consider adding the one missing integration test noted in WARNING #1 (idle-lock-triggered `logout()` + real `isRosterProvisioned()` check) as a low-cost follow-up before or shortly after archive, since it directly protects a MODIFIED requirement's newly-added scenario.

---

### Verdict
**PASS WITH WARNINGS**

All 154 test files / 2158 tests pass, `tsc --noEmit` is clean, and the production build succeeds with 136 precache entries — all independently re-executed by this verify pass, not copied from the apply-progress report. The headline invariant (unprovisioned device byte-for-byte unchanged, zero static `offline/` imports reachable from an unprovisioned device's code path) holds under direct source inspection. Assertion quality across all 13 new offline-auth test files is clean — no tautologies, ghost loops, or trivial checks found. The two honesty flags carried forward from apply-progress (Task 10 backend-blocked, Task 13 unexecuted manual smoke) are both still accurate and are NOT resolved by this verify — they remain open findings, correctly out of this change's power to close since they depend on backend work tracked separately in `docs/plans/2026-07-28-backend-pending-work.md`. Three WARNING-level gaps (one untested spec scenario proven only by inspection, two scenarios proven only by unit composition rather than end-to-end integration test) do not block correctness today but should be tracked. No CRITICAL issues found. This change is code-complete and automated-tests-green; it is NOT yet fully manually verified, exactly as tasks.md's own "Acceptance reality" note states.

---

## Addendum — 2026-07-29 (post-verify fix-up, added at archive)

This report is a point-in-time artifact and was NOT rewritten. Two of its findings were
closed after it was written:

- **WARNING #1** (idle-lock logout preserves the roster) — closed by commit `6d2404a`,
  which adds a regression test combining a real provisioned roster with a real, non-mocked
  `logout()`.
- **WARNING #2** (two `offline-auth-mode` scenarios proven only by unit composition) —
  closed by commit `27403cf`, which drives an actually-expired bundle and an
  actually-inactive user end-to-end through the rendered login form.
- **SUGGESTION #1** (linter never run) — investigated: `pnpm lint` cannot run because
  `apps/web-store-pos` has never had an `eslint.config.js`. A pre-existing project gap,
  not a gap in this change. No config was invented.

Each new test was proven to have teeth by mutation: the production code was deliberately
broken, the test was confirmed to fail, and the mutation was reverted. Details in
`apply-progress.md` (Batch 2).

Gate numbers above (154 files / 2158 tests) are therefore superseded: the final state is
**155 files / 2161 tests**, `tsc --noEmit` clean, build with 136 SW precache entries.

**WARNING #3 (Task 10) and WARNING #4 (Task 13) remain open** — see `archive-report.md`.
