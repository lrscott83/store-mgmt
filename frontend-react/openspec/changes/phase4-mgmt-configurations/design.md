# Design: phase4-mgmt-configurations (Configurations sub-domain, 3 of 3 — LAST)

## Technical Approach

GREENFIELD, contract-first, **frontend-react ONLY** (backend out of scope, #237). Mirrors shipped Stores/Users EXACTLY: container/presentational split over a thin Axios http-service returning `BaseResponseModel<T>` (`.data` unwrapped). One self-contained slice `app/management/configurations/`. Only outside touches: `app/routes.ts` (1 route), `shared/lib/i18n/es.ts` (`CONFIGURATIONS.*`), and `packages/domain/src/models/store.ts` (new model; barrel already re-exports via `export * from './models/store'`). Built/tested against a **MOCKED** http service — no real backend exists; this is the accepted test seam.

KEY DIVERGENCE vs Users/Stores: a SINGLE route (`/management/configurations`) with a GENERIC name/value form (N editable rows for N entries, label from `name`, input bound to `value`), single submit saves all. No create/edit sub-routes, no typed per-field struct, no `selectedStoreId` (platform-global).

## Architecture Decisions

| ID | Decision | Choice | Alternatives rejected | Rationale |
|----|----------|--------|-----------------------|-----------|
| DC1 | Slice shape | Mirror Stores/Users 3-layer slice | New ad-hoc layout | Consistency, reviewer familiarity, archived precedent |
| DC2 | Loader | REUSE `adminFeatureLoader([EFeatures.Configurations])` (=74) | New loader factory | Already live; no new gating code (mirrors DU2) |
| DC3 | **PUT payload shape** | **Full `SystemConfiguration[]` array** (`{ id, name, value }[]`) | `{ id, value }[]` pairs | See below — LOCKED |
| DC4 | Form model | Generic: iterate `SystemConfiguration[]` → editable rows | Typed per-key form (TestingPeriod/ReSeller fields) | New backend keys appear automatically; no UI redeploy (#237 core decision) |
| DC5 | Hydration gate | Form does NOT mount until list resolved (LOADING state) | Mount with empty `[]`, hydrate later | `useState` initializers run once; empty initial state never re-hydrates (StoreEditPage 98-104 / DU9 lesson) |
| DC6 | Offline | List cache-read degraded; writes blocked via `useOnlineStatus`; no queue | Offline write queue | Mirrors users (DU6); v1 scope |
| DC7 | Domain model location | `SystemConfiguration` in `models/store.ts` | New `models/configuration.ts` | Barrel already does `export * from './models/store'`; zero index.ts change, matches StoreUser placement (store.ts:68) |
| DC8 | Cache key | `BaseRepository<SystemConfiguration>('configurations', [])`, key `entityKey('configurations', '')` | store-scoped key | Platform-global, no selectedStoreId; no Date fields to revive |

### DC3 — LOCKED: PUT sends full `SystemConfiguration[]`

**Choice**: `PUT /v1/configurations` body = the full `SystemConfiguration[]` the form holds (`{ id, name, value }[]`).

**Rejected**: `{ id, value }[]` diff/pairs.

**Rationale**: (1) The generic form (DC4) already owns the full list in state; emitting it verbatim is the simplest, least-transform path — no diffing, no field stripping, fewest moving parts to test against the mock. (2) Symmetry with GET — request and response share one shape (`SystemConfiguration[]`), so the service, the form props, and the cache all use ONE type. (3) Contract-first against a non-existent backend (#237): a self-describing full-object payload is the safest contract to hand the future backend author — `name` disambiguates each row even if `id` semantics shift. The marginal payload size (2 rows today) is irrelevant. Trade-off accepted: no partial-update optimization, but there is no backend to optimize for yet.

## Data Flow

```
GET  /management/configurations
  loader: adminFeatureLoader([Configurations]) ── admin+feature gate
  ConfigurationsPage (container)
    online  → configurationHttpService.listConfigurations() → res.data
              → setConfigs(list); repo.save('', map)   (write-through)
    offline → repo.getAll('')  → setConfigs; setDegraded(true)
    !configs (not yet resolved) → LOADING  (DC5 gate)
       │
       ▼  initialValues = configs (full list)
    ConfigurationsForm (presentational, pure)
       rows: configs.map(c → label=c.name, input value=c.value)
       onSubmit(updatedList) ──▶ container.handleSubmit
                                   online → updateConfigurations(list) → success
                                   offline → blocked (button disabled)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/management/configurations/lib/services/configuration-http-service.ts` | Create | `listConfigurations` GET, `updateConfigurations` PUT |
| `app/management/configurations/lib/services/__tests__/configuration-http-service.test.ts` | Create | verb/path/payload/.data vs mocked apiClient |
| `app/management/configurations/components/ConfigurationsForm.tsx` | Create | generic N-row name/value editable form |
| `app/management/configurations/components/__tests__/ConfigurationsForm.test.tsx` | Create | renders N rows, edits value, emits full list, offline disables |
| `app/management/configurations/routes/configurations.tsx` | Create | container: loader + fetch + online-gate + LOADING + submit |
| `app/management/configurations/routes/__tests__/configurations-routes.test.tsx` | Create | online/offline/degraded, hydrate-then-mount, submit success/error |
| `packages/domain/src/models/store.ts` | Modify | add `SystemConfiguration` interface (barrel re-exports automatically) |
| `app/routes.ts` | Modify | add 1 route after users block |
| `shared/lib/i18n/es.ts` | Modify | `CONFIGURATIONS.*` (~10-15 keys), Rioplatense, matching USERS.* |

## Interfaces / Contracts

```ts
// packages/domain/src/models/store.ts
export interface SystemConfiguration {
  id: number;
  name: string;
  value: string;
}

// configuration-http-service.ts (rel /v1, .data returned)
listConfigurations(): Promise<BaseResponseModel<SystemConfiguration[]>>   // GET  /v1/configurations
updateConfigurations(                                                      // PUT  /v1/configurations
  configurations: SystemConfiguration[]                                    // DC3: full array
): Promise<BaseResponseModel<boolean>>

// ConfigurationsForm props
interface ConfigurationsFormProps {
  initialValues: SystemConfiguration[];   // required — container gates mount (DC5)
  isOnline: boolean;
  isLoading: boolean;
  onSubmit: (values: SystemConfiguration[]) => void;
  error?: string;
}
```

Cache: `new BaseRepository<SystemConfiguration>('configurations', [])`; key `entityKey('configurations', '')`. Read offline; write-through after online list. Route: `route('management/configurations', 'management/configurations/routes/configurations.tsx')` after the users block.

## Testing Strategy

| Layer | What to test | Approach |
|-------|--------------|----------|
| Service | GET `/v1/configurations`; PUT `/v1/configurations` sends full `SystemConfiguration[]`; `.data` unwrap | `vi.mock` api-client (Stores/Users harness) |
| Form | renders 1 row per entry (label=name, value bound); edit value updates state; submit emits full updated list; offline disables submit | real `IntlProvider` (es) + RTL |
| Container | online list+write-through; offline cache+degraded; LOADING before resolve (DC5); submit success; submit error; offline write blocked | `vi.mock` auth-store, configuration-http-service, useOnlineStatus, react-router, loaders + real IntlProvider; add `makeSystemConfiguration` factory |

Test seam: ALL behaviour validated against the mocked http service — no real backend (accepted caveat #237).

## TDD Build Sequence (RED → GREEN)

1. **Domain**: add `SystemConfiguration` to `models/store.ts` (compile gate, no test).
2. `configuration-http-service.test` (GET path; PUT path + full-array payload DC3; `.data`) → implement service.
3. `ConfigurationsForm.test` (N rows, edit, emit full list, offline disable) → implement form.
4. `configurations-routes.test` (online/offline/degraded; LOADING gate DC5; submit success/error/offline-blocked) → implement container.
5. Wire `routes.ts` (1 route) + `es.ts` (`CONFIGURATIONS.*`).

Harness = Users' `vi` mocks (auth-store, http-service, useOnlineStatus, react-router, loaders) + real `IntlProvider` es; add `makeSystemConfiguration` factory.

## Spec Traceability

- Gated route → `routes.ts` + `adminFeatureLoader([Configurations])` (DC2)
- List + offline cache/degraded → ConfigurationsPage (DC6) + `BaseRepository` (DC8)
- Editable name/value rows + single save → ConfigurationsForm (DC4) + `updateConfigurations` (DC3)
- New domain model → `SystemConfiguration` in store.ts (DC7)
- Hydration correctness → LOADING gate (DC5)
- Contract-first vs mock → Testing Strategy seam

## Migration / Rollout

No migration. Additive/isolated under `app/management/configurations/`. Revert: remove 1 route from `app/routes.ts`, delete slice dir, remove `CONFIGURATIONS.*` keys, remove `SystemConfiguration` from store.ts. No shared loaders/slices modified.

## Open Questions

- [ ] Real backend contract (#237) may differ from mock — isolated in service, minimal `id/name/value` keeps blast radius small (accepted).
