## Verification Report: route-guard-parity

**Verdict: PASS**

### Completeness
22/22 tasks marked complete in tasks.md and apply-progress; matches code state exactly (verified by reading loaders.ts, routes.ts, public-app-layout.tsx, and diffs).

### Command Evidence (re-run by verifier, not trusted from apply-progress)
- `pnpm -C apps/web-store-pos exec tsc --noEmit` → clean, no output, exit 0.
- `pnpm -C apps/web-store-pos exec vitest run` (full suite) → 126 test files, 1836 tests, ALL PASSED. Includes `auth/routes/__tests__/loaders.test.ts` (34 tests) and `shared/lib/auth/__tests__/authorization-service.test.ts` (32 tests).
- `pnpm -C apps/web-store-pos build` → SPA build succeeded; confirmed distinct `public-app-layout-C6SEeZw8.js` chunk generated in build/client/assets (separate from app-layout chunk), proving the new layout module is wired into the route tree.

### Spec Compliance Matrix

| Requirement | Scenario | Evidence | Status |
|---|---|---|---|
| Owner-Admin/Super-Admin bypass on plain featureLoader | Super-admin bypasses | `loaders.test.ts` existing test + code: `featureLoader` checks `user.isSuperAdmin \|\| user.isOwnerAdmin` before delegating to `featureGate` | PASS |
| " | Owner-admin bypasses (changed behavior) | New test "allows OwnerAdmin without matching featureId" passing | PASS |
| " | Reseller still requires featureId | Existing tests unchanged, still passing (delegates to featureGate) | PASS |
| " | Store-user still requires scoped role/featureId | Existing tests unchanged, still passing | PASS |
| " | Unauthenticated denied | `denyAccess()` check precedes bypass in `featureLoader`; existing tests still pass | PASS |
| Sidebar authorization unaffected | isUserAuthorized/sidebar unchanged | `git diff` on both files returns EMPTY (byte-for-byte unchanged) | PASS |
| " | Owner-admin sidebar gating unchanged | `authorization-service.test.ts` "OwnerAdmin missing required featureId returns false" (line 90) still present and passing | PASS |
| Other guard loaders unchanged (non-regression) | adminFeatureLoader still denies owner-admin w/o featureId | Code confirms `adminFeatureLoader` delegates to `featureGate` (non-bypass core), NOT `featureLoader`; test "redirects admin without required feature to /login" (line 246) present and passing — this is the critical leak-regression guard | PASS |
| " | resellerFeatureLoader/superAdminLoader untouched | Code confirms `resellerFeatureLoader` delegates to `featureGate`; `superAdminLoader` body unchanged (still checks only `isSuperAdmin`) | PASS |
| help/tutorial is a public route | Unauthenticated visitor reaches help/tutorial | `routes.ts` diff moves `help/tutorial` out of authLoader-gated `app-layout` into new `layout('shared/components/public-app-layout.tsx', {id:'public-app-layout'}, ...)` sibling block; `public-app-layout.tsx` re-exports AppLayout default WITHOUT `clientLoader`; old `S-HELP-TEST-2` (asserted authLoader redirect) REPLACED with new test rendering `TutorialPage` with null user — passes | PASS |
| " | Other routes remain auth-gated | `routes.ts` diff shows only `help/tutorial` moved; all other children remain in the authLoader-gated `app-layout` array | PASS |

### Design Coherence
- Decision 1 (extract `featureGate` as non-bypass core; `featureLoader` wraps with bypass; retarget admin/reseller to `featureGate`) — implemented exactly as designed. Confirmed via direct source read of `loaders.ts`.
- Decision 2 (public-app-layout re-export module, no clientLoader) — implemented exactly as designed. Confirmed via direct source read of `public-app-layout.tsx` and `routes.ts` diff.
- No deviations from design found.

### Non-Requirements Respected
- storeId-param sourcing (ADR-2), offline/no-cache authLoader asymmetry, stale-closure selectedStoreId bug, dead Angular auth.guard.ts — all untouched, none referenced in diff.

### Issues
- CRITICAL: none
- WARNING: none
- SUGGESTION: none

### Files Changed (confirmed via git diff/status)
- `frontend-react/apps/web-store-pos/app/auth/routes/loaders.ts` (modified)
- `frontend-react/apps/web-store-pos/app/auth/routes/__tests__/loaders.test.ts` (modified, +2 tests)
- `frontend-react/apps/web-store-pos/app/help/routes/__tests__/tutorial.test.tsx` (modified, S-HELP-TEST-2 replaced)
- `frontend-react/apps/web-store-pos/app/routes.ts` (modified)
- `frontend-react/apps/web-store-pos/app/shared/components/public-app-layout.tsx` (new)
- `frontend-react/apps/web-store-pos/app/shared/components/__tests__/public-app-layout.test.ts` (new)
- `openspec/changes/route-guard-parity/*` (spec/design/tasks/proposal — untracked, part of openspec artifact trail)

### Not Committed (at time of verify)
No git commit existed yet at verify time (working tree showed modified + untracked files). Recommended committing after this verify report, then archiving. Since verified: implementation was committed as `6db963a`.

**Final Verdict: PASS** — ready for sdd-archive.

---
Note: this file did not exist on disk at verify time (verify report was saved to Engram only, topic_key `sdd/route-guard-parity/verify-report`, observation #1307). This copy was reconstructed verbatim from that Engram observation during archive, for audit-trail completeness alongside proposal/design/spec/tasks.
