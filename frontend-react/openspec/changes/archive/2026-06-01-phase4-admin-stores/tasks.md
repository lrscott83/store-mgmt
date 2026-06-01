# Tasks: admin-stores (super-admin store list)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 80–120 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single work unit |
| Delivery strategy | local-branch-only |
| Chain strategy | N/A |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Presentational guard + admin container + route | local branch | TDD sequence; tests + code together |

---

## Phase 1: Presentational Guard — RED (TDD)

- [x] 1.1 In `app/management/stores/components/__tests__/store-list.test.tsx`, add failing tests: Activate button NOT in DOM when `onActivate` absent; Deactivate button NOT in DOM when `onDeactivate` absent (S-PRES-OPTIONAL-1, S-PRES-OPTIONAL-2).
- [x] 1.2 Confirm `pnpm test` baseline = 596 passing; new guard tests now fail (RED).

## Phase 2: Presentational Guard — GREEN

- [x] 2.1 In `app/management/stores/components/store-list.tsx`, make `onActivate` and `onDeactivate` optional (`onActivate?: (id: string) => void; onDeactivate?: (id: string) => void`).
- [x] 2.2 Wrap each activate/deactivate button render with `{onActivate && ...}` / `{onDeactivate && ...}`.
- [x] 2.3 Run `pnpm test` — all 11 tests (7 original + 4 new) green; existing management/stores tests unchanged.

## Phase 3: Admin Container — RED (TDD)

- [x] 3.1 Create directory `app/admin/stores/routes/__tests__/`.
- [x] 3.2 Write `app/admin/stores/routes/__tests__/store-list.test.tsx` with failing tests:
  - Exports: `loader` is a function (superAdminLoader), component is default export.
  - Render: STORES.LIST_TITLE present; `listStores` called on mount; store items from mock appear.
  - Approve: calls `storeHttpService.approve(id)`, then re-fetches.
  - Disapprove: calls `storeHttpService.disapprove(id)`, then re-fetches.
  - Error: on rejected `listStores`, renders STORES.ERROR message.
  - Activate/Deactivate buttons absent (no handlers wired).
  - Wrap with `IntlProvider` (mirror `admin/features/routes/__tests__/features.test.tsx`).
  - Mock `~/auth/routes/loaders` → `{ superAdminLoader: vi.fn() }`.
  - Mock `~/management/stores/lib/services/store-http-service`.
- [x] 3.3 Run `pnpm test` — new container tests fail (RED). File module not found (production file not yet created).

## Phase 4: Admin Container — GREEN

- [x] 4.1 Create `app/admin/stores/routes/store-list.tsx`:
  - `export const loader = superAdminLoader` (from `~/auth/routes/loaders`).
  - Local state: `stores`, `error` via `useState`.
  - `useEffect` → `storeHttpService.listStores()` → `res.data → setStores` / catch → `setError(STORES.ERROR)`.
  - Render `<StoreList stores={stores} isOnline={true} isDegraded={false} error={error} onCreate onEdit onApprove onDisapprove>` (no `onActivate`/`onDeactivate`).
  - `onCreate` → `navigate('/management/stores/create')`; `onEdit(id)` → `navigate(\`/management/stores/edit/${id}\`)`.
  - `onApprove(id)` / `onDisapprove(id)` → call service method, then re-fetch.
  - `export default AdminStoreListPage`.
- [x] 4.2 Run `pnpm test` — all 8 admin/stores tests green.

## Phase 5: Route Registration

- [x] 5.1 In `app/routes.ts` (after admin/features route), add: `route('admin/stores', 'admin/stores/routes/store-list.tsx')`.
- [x] 5.2 Run `pnpm test` — 608 tests green. Run `pnpm typecheck` — no errors.

## Phase 6: Verification

- [x] 6.1 Confirm test count = 608 (596 + 12 new); no regressions in management/stores or admin/features suites.
- [x] 6.2 Confirm `StoreListProps.onActivate?` / `onDeactivate?` compile correctly across all usages. Typecheck clean.
- [ ] 6.3 Confirm `AdminStoreListPage` renders in browser with superAdmin session (manual smoke test optional).
