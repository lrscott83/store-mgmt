# Proposal: Admin Dashboard (SuperAdmin Store Stats) — 1:1 React Migration

## Intent

Migrate the Angular `admin/dashboard` route to React 19 at `apps/web-store-pos/` with 100% parity. Angular `AdminDashboardComponent` is the single source of truth. The live Angular UI is a SuperAdmin-gated stats table (chart code is fully commented out, never shipped). This closes the last admin slice (after admin/features, admin/stores).

## Scope

### In Scope
- `usageHttpService` singleton (2 GET methods) on shared `apiClient`.
- `AdminDashboardPage` container with `export const loader = superAdminLoader`.
- View toggle: `7days` (default, `/v1/usages/stores-last-week`) and `30days` (`/v1/usages/stores-last-month`).
- Category labels: port `getDiasSemana()` (rolling Mon-first window, Sunday→index 6) and `getDias30()` (`'1'..'30'`).
- Table cols Categoría/Valor zipping `categories[]` with `storeUsagesCountDays`, `value || 0` fallback.
- 7 `ADMIN_DASHBOARD.*` i18n keys in `es.ts` only.
- Route registration under existing app-layout.
- Co-located service + route smoke tests.

### Out of Scope (explicit non-goals)
- NO chart (Angular `ng-apexcharts` is 100% commented out — table only).
- NO `activeStoreCount` display (captured in Angular, never rendered).
- NO dead helpers (`getTotalTiendas/getAverageTiendas/getMaxTiendas/getPorcentajePromedio/getPorcentajeMaximo`).
- NO new loader (reuse tested `superAdminLoader`), NO new endpoint, NO new dependency, NO `en.ts`, NO toast.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `admin`: add admin-dashboard requirement (SuperAdmin-gated store-usage stats table with 7/30-day toggle) to canonical `openspec/specs/admin/spec.md` at archive.

## Approach

Approach A (table-only thin slice), per exploration. Mirror the established admin slice pattern: container fetches in `useEffect`, inline state via `useState` + `useIntl`. `changeView()` resets arrays and re-fetches. `BaseResponseModel<T>` fields (message/actionCode/errors) are non-nullable — test mocks use `''`/`0`/`[]`, never `null`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/admin/dashboard/lib/services/usage-http-service.ts` | New | 2 GET methods → `BaseResponseModel<StoreUsages>` |
| `app/admin/dashboard/routes/dashboard.tsx` | New | Container; default + named export; `loader = superAdminLoader` |
| `app/admin/dashboard/**/__tests__/*` | New | Service + route smoke tests |
| `app/routes.ts` | Modified | `route('admin/dashboard', 'admin/dashboard/routes/dashboard.tsx')` |
| `app/shared/lib/i18n/es.ts` | Modified | `ADMIN_DASHBOARD.HEADER/TITLE/LAST_7_DAYS/LAST_30_DAYS/COL_CATEGORY/COL_VALUE/ERROR` |
| `openspec/specs/admin/spec.md` | Modified (archive) | Append admin-dashboard requirement |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `getDiasSemana()` day math (Sunday edge) | Low | Port logic directly; unit-cover the Sunday→index 6 case |
| `storeUsagesCountDays` length mismatch with categories | Low | Zip + `value || 0` fallback (matches Angular) |
| Accidental scope creep (chart/activeStoreCount) | Low | Non-goals stated explicitly above |

## Rollback Plan

Revert the slice commit on the local branch. All changes are additive new files plus 2 small edits (`routes.ts`, `es.ts`); no shared infra touched. No push/PR — local branch only.

## Dependencies

- Existing `superAdminLoader`, `apiClient`, admin slice pattern. No new external dependency.

## Success Criteria

- [ ] Route gated by `superAdminLoader`; renders header, title, 7/30 toggle, table.
- [ ] Both endpoints wired; toggle re-fetches and re-labels categories.
- [ ] No chart, no `activeStoreCount`, no dead helpers present.
- [ ] Tests pass; PR diff well under 400 lines.
