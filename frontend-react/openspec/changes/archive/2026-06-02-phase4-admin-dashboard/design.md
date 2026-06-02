# Design: Admin Dashboard (SuperAdmin Store Stats)

## Technical Approach

Approach A (table-only thin slice) from the proposal. Mirror the established admin slice
pattern (admin/features + admin/stores): one HTTP service singleton on the shared
`apiClient`, one client container with `export const loader = superAdminLoader`, inline
`useState` + `useEffect` fetch, `useIntl` for i18n, no toast. Day-label logic ported as
PURE helpers so `Date` can be injected and tested deterministically. No chart, no
`activeStoreCount` render, no dead helpers, no new dependency.

## Architecture Decisions

### Decision: Where the day-label logic lives

**Choice**: Two pure module-level functions co-located in the route file, each accepting an
injected reference date: `getDiasSemana(today: Date = new Date()): string[]` and
`getDias30(): string[]`. Exported as named exports so tests import them directly.
**Alternatives considered**: (a) methods inside the component (Angular shape) — not unit
testable without rendering; (b) a separate `lib/date-labels.ts` util module.
**Rationale**: Pure functions with an injectable `today` make the Sunday-edge math
deterministic under Vitest (`getDiasSemana(new Date('2026-06-07'))`). Co-location keeps the
slice tiny and matches the small-surface admin pattern; a util file is over-engineering for
two functions used in one place.

### Decision: Where the `StoreUsages` type lives

**Choice**: Define `StoreUsages` inline in `usage-http-service.ts` (not the domain package).
**Alternatives considered**: Add to `packages/domain/src/models`.
**Rationale**: It is consumed only by this single service. admin/features keeps its narrow
contract local too. Avoids touching the shared domain barrel for a one-use type. Reuse the
shared `BaseResponseModel<T>` from `@store-mgmt/domain` (already exists).

### Decision: Fetch lifecycle / view toggle

**Choice**: `viewType` state (`'7days' | '30days'`, default `'7days'`). A `loadData(view)`
async fn sets `categories` synchronously from the helper, resets `data` to `[]`, then awaits
the matching service call and sets `data` on success. `useEffect(() => { loadData(viewType) }, [])`
on mount; toggle buttons call `loadData(nextView)` and update `viewType`.
**Alternatives considered**: server `loader` data fetch (Approach C).
**Rationale**: 1:1 with Angular `ngOnInit → loadData` + `changeView`. Every other admin
slice uses the useEffect pattern; a loader fetch would diverge.

### Decision: Table zip + missing-value fallback

**Choice**: Render one row per `categories[i]`; value cell = `data[i] || 0` (parity with
Angular `data[i] || 0`). Table shows categories with `0` until/while data is empty.
**Rationale**: Exact Angular behavior; tolerant of length mismatch.

## Data Flow

    mount/toggle
        │
        ▼
    AdminDashboardPage  ──(viewType)──►  loadData(view)
        │  setCategories(getDiasSemana()|getDias30())   setData([])
        │
        ├─► usageHttpService.getStoresLastWeek()  ─► apiClient.get('/v1/usages/stores-last-week')
        └─► usageHttpService.getStoresLastMonth() ─► apiClient.get('/v1/usages/stores-last-month')
                          │
                          ▼  BaseResponseModel<StoreUsages>
        on succeeded → setData(res.data.storeUsagesCountDays)   (activeStoreCount IGNORED)
        on throw     → setError(ADMIN_DASHBOARD.ERROR)
        render: header, title, 7/30 toggle, table[categories × (data[i]||0)]

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web-store-pos/app/admin/dashboard/lib/services/usage-http-service.ts` | Create | `usageHttpService` singleton: `getStoresLastWeek()`, `getStoresLastMonth()`; inline `StoreUsages` type |
| `apps/web-store-pos/app/admin/dashboard/lib/services/__tests__/usage-http-service.test.ts` | Create | RED-first service tests |
| `apps/web-store-pos/app/admin/dashboard/routes/dashboard.tsx` | Create | `AdminDashboardPage` (default + named), `loader = superAdminLoader`, pure `getDiasSemana`/`getDias30` |
| `apps/web-store-pos/app/admin/dashboard/routes/__tests__/dashboard.test.tsx` | Create | RED-first container + helper tests |
| `apps/web-store-pos/app/routes.ts` | Modify | Add `route('admin/dashboard', 'admin/dashboard/routes/dashboard.tsx')` under app-layout |
| `apps/web-store-pos/app/shared/lib/i18n/es.ts` | Modify | Add 7 `ADMIN_DASHBOARD.*` keys (es only) |
| `openspec/specs/admin/spec.md` | Modify (at archive) | Append admin-dashboard requirement |

## Interfaces / Contracts

```ts
// usage-http-service.ts
export interface StoreUsages {
  storeUsagesCountDays: number[];
  activeStoreCount: number; // captured, never rendered
}
export const usageHttpService = {
  getStoresLastWeek(): Promise<BaseResponseModel<StoreUsages>>,   // GET /v1/usages/stores-last-week
  getStoresLastMonth(): Promise<BaseResponseModel<StoreUsages>>,  // GET /v1/usages/stores-last-month
};

// dashboard.tsx (pure, exported for tests)
export function getDiasSemana(today?: Date): string[]; // Mon-first rolling 7; Sunday(getDay()===0)→idx6
export function getDias30(): string[];                  // ['1'..'30']
```

State shape: `viewType: '7days'|'30days'`, `categories: string[]`, `data: number[]`,
`error: string | undefined`.

i18n keys (es.ts): `ADMIN_DASHBOARD.HEADER`="Panel de Control", `.TITLE`="Estadísticas de
Tiendas Activos", `.LAST_7_DAYS`="Últimos 7 días", `.LAST_30_DAYS`="Últimos 30 días",
`.COL_CATEGORY`="Categoría", `.COL_VALUE`="Valor", `.ERROR`=reuse generic error copy.

## Testing Strategy (STRICT TDD — RED first)

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit (helper) | `getDiasSemana` Mon-first order; Sunday edge (`new Date('2026-06-07')` Sun → ends 'Dom'); Monday (`'2026-06-01'` → ['Lun'..'Dom']); `getDias30` returns '1'..'30' | Inject fixed `Date`; assert array equality. Deterministic — no real clock |
| Unit (service) | singleton exists; `getStoresLastWeek`/`getStoresLastMonth` call correct GET URL; return `response.data`; propagate throw | `vi.mock('~/shared/lib/http/api-client')`; mocks use `message:''`, `actionCode:0`, `errors:[]` (NON-nullable) |
| Component | exports (named loader, named + default page); renders header/title/two toggle buttons; default 7-day labels render; succeeded→rows show counts; toggle 30-day re-fetches + relabels ('1'..'30'); throw→`ADMIN_DASHBOARD.ERROR`; `activeStoreCount` NOT in DOM | mock `superAdminLoader` + `usageHttpService`; `IntlProvider` wrapper with `esMessages`; `fireEvent`+`waitFor`, mirroring features.test.tsx |

Mock mismatch gotcha: `BaseResponseModel<T>` fields `message/actionCode/errors` are
NON-nullable — all mocks use `''`/`0`/`[]`, never `null`.

## Migration / Rollout

No migration. Additive new files + 2 small edits (routes.ts, es.ts). Local branch only, no
push/PR. Rollback = revert the slice commit.

## Open Questions

- [ ] `ADMIN_DASHBOARD.ERROR` copy: Angular has no error UI (it rethrows). Adding inline
  error is a minor, consistent enhancement matching other admin slices — confirm copy text
  at apply (suggest reuse "Ocurrió un error. Intentá de nuevo."). Parity-ambiguous but
  additive and non-breaking.
