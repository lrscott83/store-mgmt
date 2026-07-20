# Tasks: route-guard-parity

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~120-160 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Owner/super-admin bypass in `featureLoader` (Part 1) | single PR | Self-contained in `loaders.ts` + its test file |
| 2 | Public `help/tutorial` route (Part 2) | single PR | Independent of Unit 1; can commit as one PR with Unit 1 (small total diff) |

## Phase 1: Part 1 — RED (failing tests for owner/super-admin bypass)

- [x] 1.1 In `frontend-react/apps/web-store-pos/app/auth/routes/__tests__/loaders.test.ts`, add failing test: `featureLoader` allows OwnerAdmin without matching featureId (new bypass) — expect `null`.
- [x] 1.2 Add failing test: `featureLoader` allows SuperAdmin without matching featureId when unauthenticated-adjacent edge (expired-but-bypassed) is exercised — assert bypass precedes `isUserAuthorized`'s expiry gate (use `expiresIn` in the past).
- [x] 1.3 Confirm (no new test needed) existing `featureLoader` reseller/store-user tests (lines ~151-173) still encode "requires featureId" — read only, do not change assertions.
- [x] 1.4 Confirm (no new test needed) existing `adminFeatureLoader` test "redirects admin without required feature to /login" (line ~225) remains the LEAK-REGRESSION guard once retargeted to `featureGate`.
- [x] 1.5 Confirm (no new test needed) existing `shared/lib/auth/__tests__/authorization-service.test.ts` test "OwnerAdmin missing required featureId returns false" (line ~90) still guards sidebar non-regression — read only.
- [x] 1.6 Run `pnpm -C apps/web-store-pos exec vitest run auth/routes/__tests__/loaders.test.ts` — confirm 1.1/1.2 FAIL (RED) before implementing.

## Phase 2: Part 1 — GREEN (implement bypass without leak)

- [x] 2.1 In `loaders.ts`, extract current `featureLoader` body (auth check + `isUserAuthorized`) into a new private function `featureGate(requiredFeatureIds: number[], storeIdParam?: string)` with identical logic/signature.
- [x] 2.2 Redefine `featureLoader` to: check auth (deny if none) → `if (user.isSuperAdmin || user.isOwnerAdmin) return null;` → else delegate to `featureGate(requiredFeatureIds, storeIdParam)`.
- [x] 2.3 Retarget `adminFeatureLoader`'s internal call from `featureLoader(featureIds)(...)` to `featureGate(featureIds)(...)`.
- [x] 2.4 Retarget `resellerFeatureLoader`'s internal call from `featureLoader(featureIds)(...)` to `featureGate(featureIds)(...)`.
- [x] 2.5 Run `pnpm -C apps/web-store-pos exec vitest run auth/routes/__tests__/loaders.test.ts` — confirm ALL pass (GREEN), including 1.1, 1.2, and the untouched 1.3/1.4 regression tests.
- [x] 2.6 Run `pnpm -C apps/web-store-pos exec vitest run shared/lib/auth/__tests__/authorization-service.test.ts` — confirm unchanged, still passing (sidebar non-regression).

## Phase 3: Part 2 — RED (failing tests for public help/tutorial)

- [x] 3.1 In `frontend-react/apps/web-store-pos/app/help/routes/__tests__/tutorial.test.tsx`, REPLACE the `S-HELP-TEST-2` describe block (lines ~139-154, which asserts `authLoader` redirects unauthenticated users) with a new test proving `help/tutorial` is public: render `TutorialPage` with no auth mock/null user and assert it renders content (no redirect, no thrown error).
- [x] 3.2 Add a new test file `frontend-react/apps/web-store-pos/app/shared/components/__tests__/public-app-layout.test.ts` asserting the module's exported `clientLoader` is `undefined` (proves no auth gate), while `default` export exists (chrome renders).
- [x] 3.3 Run both new/updated test files — confirm FAIL (RED): `public-app-layout.tsx` doesn't exist yet; `routes.ts` hasn't moved `help/tutorial` yet.

## Phase 4: Part 2 — GREEN (implement public layout + route move)

- [x] 4.1 Create `frontend-react/apps/web-store-pos/app/shared/components/public-app-layout.tsx`: `export { default } from './app-layout';` (chrome only, no `clientLoader` re-export).
- [x] 4.2 In `routes.ts`, remove `route('help/tutorial', 'help/routes/tutorial.tsx')` from the `app-layout` (authLoader-gated) children array (line ~105).
- [x] 4.3 In `routes.ts`, add a sibling top-level `layout('shared/components/public-app-layout.tsx', { id: 'public-app-layout' }, [route('help/tutorial', 'help/routes/tutorial.tsx')])` outside the gated `app-layout` block.
- [x] 4.4 Run the Phase 3 tests — confirm GREEN.

## Phase 5: Final Gates

- [x] 5.1 Run `pnpm -C apps/web-store-pos exec tsc --noEmit` — confirm no type errors.
- [x] 5.2 Run full `pnpm test` — confirm entire suite green, no regressions elsewhere (sidebar, admin, reseller, superAdmin loaders).
- [x] 5.3 Run `pnpm -C apps/web-store-pos build` — confirm build succeeds (route tree compiles with new layout).
