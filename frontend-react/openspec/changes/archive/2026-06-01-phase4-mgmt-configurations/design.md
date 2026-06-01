# Design: phase4-mgmt-configurations (Configurations sub-domain)

## Technical Approach

GREENFIELD, contract-first, **frontend-react ONLY** (backend out of scope). Mirrors shipped Stores/Users EXACTLY: container/presentational split over a thin Axios http-service returning `BaseResponseModel<T>` (`.data` unwrapped). One self-contained slice `app/management/configurations/`. Only outside touches: `app/routes.ts` (1 route), `shared/lib/i18n/es.ts` (`CONFIGURATIONS.*`), and `packages/domain/src/models/store.ts` (new model; barrel already re-exports via `export * from './models/store'`). Built/tested against a **MOCKED** http service.

KEY DIVERGENCE vs Users/Stores: SINGLE route (`/management/configurations`) with GENERIC name/value form (N editable rows for N entries, label from `name`, input bound to `value`), single submit saves all. No create/edit sub-routes, no typed per-field struct, no `selectedStoreId` (platform-global).

## Architecture Decisions

| ID | Decision | Choice | Rationale |
|----|----------|--------|-----------|
| DC1 | Slice shape | Mirror Stores/Users 3-layer slice | Consistency, reviewer familiarity, archived precedent |
| DC2 | Loader | REUSE `adminFeatureLoader([EFeatures.Configurations])` (=74) | Already live; no new gating code |
| DC3 | **PUT payload shape** | **Full `SystemConfiguration[]` array** | Simplest, least-transform path; symmetry with GET; future-proof contract |
| DC4 | Form model | Generic: iterate `SystemConfiguration[]` → editable rows | New backend keys appear automatically; no UI redeploy |
| DC5 | Hydration gate | Form does NOT mount until list resolved (LOADING state) | `useState` initializers run once; empty initial never re-hydrates |
| DC6 | Offline | List cache-read degraded; writes blocked via `useOnlineStatus`; no queue | Mirrors users; v1 scope |
| DC7 | Domain model location | `SystemConfiguration` in `models/store.ts` | Barrel already exports; zero index.ts change |
| DC8 | Cache key | `entityKey('configurations', '')` | Platform-global, no selectedStoreId |

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/management/configurations/lib/services/configuration-http-service.ts` | Create | `listConfigurations` GET, `updateConfigurations` PUT |
| `app/management/configurations/lib/services/__tests__/configuration-http-service.test.ts` | Create | verb/path/payload/.data vs mocked apiClient |
| `app/management/configurations/components/ConfigurationsForm.tsx` | Create | generic N-row name/value editable form |
| `app/management/configurations/components/__tests__/ConfigurationsForm.test.tsx` | Create | renders N rows, edits value, emits full list, offline disables |
| `app/management/configurations/routes/configurations.tsx` | Create | container: loader + fetch + online-gate + LOADING + submit |
| `app/management/configurations/routes/__tests__/configurations.test.tsx` | Create | online/offline/degraded, hydrate-then-mount, submit success/error |
| `packages/domain/src/models/store.ts` | Modify | add `SystemConfiguration` interface |
| `app/routes.ts` | Modify | add 1 route after users block |
| `shared/lib/i18n/es.ts` | Modify | `CONFIGURATIONS.*` (~10-15 keys) |

## Spec Traceability

- Gated route → `routes.ts` + `adminFeatureLoader([Configurations])` (DC2)
- List + offline cache/degraded → ConfigurationsPage (DC6) + `BaseRepository` (DC8)
- Editable name/value rows + single save → ConfigurationsForm (DC4) + `updateConfigurations` (DC3)
- New domain model → `SystemConfiguration` in store.ts (DC7)
- Hydration correctness → LOADING gate (DC5)
- Contract-first vs mock → Testing Strategy seam
