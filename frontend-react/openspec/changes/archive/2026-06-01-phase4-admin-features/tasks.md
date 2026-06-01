# Tasks: admin-features (Angular admin/features → React 1:1 parity)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150–200 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single work unit |
| Delivery strategy | local-branch-only |
| Chain strategy | N/A |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: N/A
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full admin/features slice (service + route + loader + i18n) | Single local commit | All tests must RED→GREEN before wiring |

---

## Phase 1: Foundation — i18n keys

- [x] 1.1 Add `FEATURES.TITLE`, `FEATURES.ACTIVATE_FEATURES`, `FEATURES.FEATURES_ACTIVATED`, `FEATURES.UNEXPECTED_ERROR` to `apps/web-store-pos/app/shared/lib/i18n/es.ts` (flat `'KEY':'value'` format, no en.ts changes needed).

---

## Phase 2: HTTP Service (RED → GREEN)

- [x] 2.1 Create `apps/web-store-pos/app/admin/features/lib/services/__tests__/feature-http-service.test.ts` — mock `~/shared/lib/http/api-client`; assert `activateFeatures()` calls `apiClient.post('/v1/features/activate', {})` and returns `response.data`. Run `pnpm test` — expect RED.
- [x] 2.2 Create `apps/web-store-pos/app/admin/features/lib/services/feature-http-service.ts` — `featureHttpService` singleton; `activateFeatures()` calls `apiClient.post<BaseResponseModel<boolean>>('/v1/features/activate', {})` and returns `response.data`. Run `pnpm test` — expect GREEN for 2.1.

---

## Phase 3: Auth Guard (RED → GREEN)

- [x] 3.1 Add unit tests for `superAdminLoader` to `apps/web-store-pos/app/auth/routes/__tests__/loaders.test.ts` (or create the file if it does not exist) — three cases: (a) unauthenticated → redirect `/login`, (b) OwnerAdmin who is NOT SuperAdmin → redirect `/unauthorized`, (c) SuperAdmin → no redirect. Run `pnpm test` — expect RED for new cases.
- [x] 3.2 Add `superAdminLoader` to `apps/web-store-pos/app/auth/routes/loaders.ts` — use `getAuthState()`; no user → redirect `/login`; `!isSuperAdmin` → redirect `/unauthorized`; otherwise return null/undefined. Must NOT reuse or broaden `adminLoader`. Export named. Run `pnpm test` — expect GREEN for 3.1.

---

## Phase 4: Route Container (RED → GREEN)

- [x] 4.1 Create `apps/web-store-pos/app/admin/features/routes/__tests__/features.test.tsx` — mock `~/auth/routes/loaders` and `~/admin/features/lib/services/feature-http-service`; wrap in `IntlProvider` with `esMessages`; assert: (a) named export `FeaturesPage` exists + default export, (b) title renders (`FEATURES.TITLE`), (c) activate button renders (`FEATURES.ACTIVATE_FEATURES`), (d) click button → `activateFeatures` called, (e) resolve `{succeeded:true}` → inline `FEATURES.FEATURES_ACTIVATED` visible, (f) resolve `{succeeded:false}` → inline `FEATURES.UNEXPECTED_ERROR` visible, (g) rejects (HTTP error) → inline `FEATURES.UNEXPECTED_ERROR` visible. Run `pnpm test` — expect RED.
- [x] 4.2 Create `apps/web-store-pos/app/admin/features/routes/features.tsx` — `export loader = superAdminLoader`; `FeaturesPage` uses `useIntl`/`formatMessage`; `useState` for success/error; button calls `featureHttpService.activateFeatures()` and sets inline message on resolve/reject; named + default exports. Run `pnpm test` — expect GREEN for 4.1.

---

## Phase 5: Route Registration

- [x] 5.1 Register `route('admin/features', 'admin/features/routes/features.tsx')` inside the `app-layout` layout block in `apps/web-store-pos/app/routes.ts`. Run `pnpm test` — all 580+ tests still GREEN (no regressions).

---

## Phase 6: Verification

- [x] 6.1 Run `pnpm test` — confirm total passing tests ≥ 580 + new tests (target ~588–592). Zero failures. ACTUAL: 596 passing (16 new tests).
- [x] 6.2 Confirm `superAdminLoader` is NOT reusing `adminLoader` (code review: distinct export, `isSuperAdmin` only). VERIFIED.
- [x] 6.3 Confirm no hardcoded string literals in `features.tsx` — all copy via `FEATURES.*` keys. VERIFIED.
