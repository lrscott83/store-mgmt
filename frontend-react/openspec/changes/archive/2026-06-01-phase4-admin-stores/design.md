# Design: admin-stores (super-admin store list)

## Technical Approach

Thin reuse slice mirroring the `admin/features` pattern. Add a new container
`AdminStoreListPage` at `app/admin/stores/routes/store-list.tsx` that loads stores
via the existing `storeHttpService.listStores()` and renders the existing
presentational `<StoreList>` from `management/stores`. Loader is `superAdminLoader`
(no `EFeatures` check). One backward-compatible relaxation: `onActivate`/`onDeactivate`
become optional in `StoreListProps`, with the presentational guarding those buttons on
handler presence. No offline cache (Angular `StoreListComponent` has none).

## Architecture Decisions

| Decision | Choice | Alternative rejected | Rationale |
|----------|--------|----------------------|-----------|
| Container template | Copy `admin/features` slice (`export const loader = superAdminLoader`, local state, `useEffect`) | Copy `management/stores` container | management container carries `BaseRepository` cache + `adminFeatureLoader` + online gating — out of scope for super-admin parity |
| Data fetch | `storeHttpService.listStores()` in `useEffect`, map `res.data` → state | New admin service | Backend `GET /v1/stores/by-current-user` already scopes by role; no new service per proposal |
| isOnline/isDegraded | Pass static `isOnline={true}` / `isDegraded={false}` | Use `useOnlineStatus` | No cache → no degraded mode; edit/approve buttons stay enabled |
| Activate/Deactivate | Omit handlers; relax props to optional; guard render | Keep required, pass no-ops | Angular commented these out; rendering disabled/no-op buttons breaks parity |
| Props relaxation | `onActivate?` / `onDeactivate?` + `{handler && <button…>}` | Separate AdminStoreList component | Optional widening is backward-compatible; management container still passes both, compiles + tests unchanged |

## Data Flow

```
superAdminLoader ──guard──▶ AdminStoreListPage
                                │ useEffect
                                ▼
                     storeHttpService.listStores()  ── GET /v1/stores/by-current-user
                                │ res.data → setStores / catch → setError(STORES.ERROR)
                                ▼
                     <StoreList stores isOnline=true isDegraded=false error
                        onCreate onEdit onApprove onDisapprove />
                                │ (onActivate/onDeactivate omitted → buttons not rendered)
                                ▼
            navigate /management/stores/create | /management/stores/edit/:id
            approveStore / disapproveStore (re-fetch list on success)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/admin/stores/routes/store-list.tsx` | Create | `AdminStoreListPage` container + `export const loader = superAdminLoader`; fetch via `listStores()`, render `<StoreList>`, wire create/edit/approve/disapprove only |
| `app/admin/stores/routes/__tests__/store-list.test.tsx` | Create | Exports test (loader/named/default), parity render (title, no activate/deactivate buttons), approve/disapprove call service, error path |
| `app/management/stores/components/store-list.tsx` | Modify | Make `onActivate?`/`onDeactivate?` optional; wrap Activate button in `{onActivate && …}` and Deactivate in `{onDeactivate && …}` |
| `app/routes.ts` | Modify | Add `route('admin/stores', 'admin/stores/routes/store-list.tsx')` after line 61 (`admin/features`) |

No change to `storeHttpService`, `Store` model, `es.ts`, or the management container.

## Interfaces / Contracts

`StoreListProps` relaxation (only the two lines change):

```ts
onActivate?: (id: string) => void;   // was required
onDeactivate?: (id: string) => void; // was required
```

Conditional render in `<StoreList>`:

```tsx
{onActivate && (<button … onClick={() => onActivate(store.id)}>…ACTIVATE…</button>)}
{onDeactivate && (<button … onClick={() => onDeactivate(store.id)}>…DEACTIVATE…</button>)}
```

Container wiring (admin) mirrors management minus cache/online/activate/deactivate:

```tsx
export const loader = superAdminLoader;
// useEffect: storeHttpService.listStores().then(r => setStores(r.data)).catch(() => setError(STORES.ERROR))
// approve/disapprove: await action(id) then re-fetch listStores()
<StoreList stores isOnline isDegraded={false} error
  onCreate onEdit onApprove onDisapprove />
```

## Testing Strategy (Strict TDD)

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (presentational) | management `store-list.test.tsx` still passes; new test: Activate/Deactivate buttons NOT in DOM when handlers omitted | RED first on guard, render with/without handlers |
| Unit (container) | exports (loader fn, named, default); renders title via `STORES.LIST_TITLE`; lists stores from mocked `listStores`; approve/disapprove call service; error path sets `STORES.ERROR` | Mock `~/auth/routes/loaders` (superAdminLoader), `~/management/stores/lib/services/store-http-service`, wrap in `IntlProvider` (template = features.test.tsx) |
| Integration | route `admin/stores` resolves | Existing routes test pattern |

## Build Sequence (strict TDD, single commit)

1. RED: add presentational guard test (Activate/Deactivate absent when handlers omitted) → fails.
2. GREEN: relax `StoreListProps` (optional) + wrap both buttons in handler guards. Run management `store-list.test.tsx` — must still pass (it passes both handlers).
3. RED: write `app/admin/stores/routes/__tests__/store-list.test.tsx` (exports, render, list, approve/disapprove, error) → fails (no container).
4. GREEN: create `app/admin/stores/routes/store-list.tsx`.
5. Register `admin/stores` route in `app/routes.ts`.
6. Full suite + typecheck green.

## Migration / Rollout

No migration. Rollback = revert single commit: delete `app/admin/stores/`, remove the
route line, restore `onActivate`/`onDeactivate` as required.

## Open Questions

None.
