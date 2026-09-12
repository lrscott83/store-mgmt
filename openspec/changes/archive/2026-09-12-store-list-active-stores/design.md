# Design: store-list-active-stores

**Change**: store-list-active-stores · **Phase**: Design · **Date**: 2026-09-11
**Spec**: spec.md in this folder (ADDED `active-store-selection` capability + MODIFIED `offline-auth`)

## Context

Baseline facts that drive this design (verified in explore.md):

- `/me` fills `StoreList` for OwnerAdmin only, from
  `GetAllStoresByOwnerUserIdAsync` (ALL stores) — `GetMeQuery.cs:110-119`.
- The two React selects (StoreSwitcher popup, Configurations) each fetch
  `/v1/stores/by-current-user` (heavy `StoreDto` + N+1 payments) to list names.
- Roster users carry no storeList → offline selects degrade to the
  current-store-only fallback.
- Deactivation has NO active session invalidation; the `/me` 404
  `Store.Inactive` verdict is the only logout mechanism (user decision:
  keep it that way).
- StoreSwitcher renders its options from fetched `Store[]`; Configurations
  same; both already handle offline fallback via empty-list → current store.

## Goals / Non-Goals

**Goals**:
1. `StoreSummaryDto` gains `isActive`; `/me` carries it (all stores, with flag).
2. Both selects render from `user.storeList` (actives only) — zero extra requests.
3. Roster carries storeList (owner row filled like `/me`; others empty).
4. Session refresh after create/deactivate keeps the list fresh; owner
   self-deactivation logs out through the same refresh's `/me` verdict.
5. New tests everywhere (backend unit + E2E in NEW files; FE vitest; no
   existing E2E touched).

**Non-Goals**:
- No changes to `switchToStore`, `by-current-user` endpoint, offline-first
  hydration, unlock gate, or token-blacklist infrastructure.
- No offline store SWITCHING (network required; display only).
- No Angular work (no parity exists for this feature).

## Decisions

### D1 — Backend: positional record grows, one construction site

```csharp
// StoreSummaryDto.cs — positional record gains the flag
public record StoreSummaryDto(Guid Id, string Name, bool IsActive);

// GetMeQuery.cs:110-119 — the single production fill becomes
storeList = ownedStores
    .Select(s => new StoreSummaryDto(s.Id, s.Name, s.IsActive))
    .ToList();
```

`StoreSummaryDto` construction sites are exactly two (GetMeQuery production +
E2E `TestDtos` has its own `StoreSummaryData` mirror — NOT the same type).
JSON is camelCase-serialized (`isActive`), so existing E2E asserting
`{id, name}` per entry keeps passing (additive field). Swagger contract widens
additively; no consumer breaks.

### D2 — Backend: roster fills storeList for the owner row (and OwnerAdmin users)

In `ExportOfflineRosterQuery`, after the roster user loop builds
`OfflineRosterUserDto`, fill `StoreList`:

- Compute the owner's full store list ONCE per export (the roster is
  store-scoped; all users share the same owner): a single
  `GetAllStoresByOwnerUserIdAsync(ownerUserId)` call, mapped to
  `StoreSummaryDto(s.Id, s.Name, s.IsActive)`.
- Assign it to every roster user DTO where `isOwnerAdmin == true` (the
  synthetic owner row is OwnerAdmin by construction; a hypothetical
  StoreUser who is also OwnerAdmin of the same owner gets the same list —
  parity with `/me`'s `IsOwnerAdmin` fill).
- Others get an empty list (parity with `/me`).
- `OfflineRosterUserDto` gains `List<StoreSummaryDto> StoreList { get; set; } = new();`.

Batch semantics: the fill is one repository call per export (not per user) —
no N+1 added to the roster's existing per-user queries.

### D3 — Frontend: `StoreSummary` grows `isActive`; selects read `user.storeList`

```ts
// domain/models/auth.ts
export interface StoreSummary { id: string; name: string; isActive: boolean; }
```

`UserModel.storeList?: StoreSummary[]` (unchanged optionality — offline
legacy bundles without the field still yield `undefined` → selects fall back).

**StoreSwitcher** (`store-switcher.tsx`): delete the `openPopup` fetch branch;
derive options synchronously:

```ts
const activeStores = useMemo(
  () => (user?.storeList ?? []).filter((s) => s.isActive),
  [user?.storeList],
);
```

- `isLoading`/`loadError` states disappear (no request → no error states).
  The popup renders `activeStores` — with the same "no other active store"
  empty message when it holds only the current store (or nothing).
- The switcher keeps its `disabled`-when-current selection logic and
  `switchStore` flow (untouched).

**Configurations** (`configurations.tsx`): delete the `useEffect` fetch; same
`activeStores` derivation. `stores` state, `isLoading`, `loadError` go away.
The offline/empty-list fallback (current store as sole option) stays:
when `activeStores` is empty, render the current store option (existing
fallback semantics preserved for roster-less offline sessions).

**Edge — store without MultiStores**: both UIs already gate on
`user.storeModuleIds.includes(EModules.MultiStores)`; unchanged.

**Edge — current store inactive in the list** (post-deactivation refresh
happened elsewhere, or roster exported while active then deactivated
server-side): the current store is ALWAYS offered (the user is ON it) even
if `isActive === false` — otherwise the select would strand the user without
their current selection visible. Selects show: `[current store] + [other
actives]`. This matches the existing fallback contract and the
auth-redirect invariant (no new bounce).

### D4 — Frontend: session refresh after create/deactivate (my-stores.tsx)

Both `handleCreateStore` and `handleEditSave` (activation branch) gain, after
their successful API call and before `load()`:

```ts
try { await getUserByToken(); } catch { /* non-critical, same as plan-change */ }
```

— the exact pattern of `handlePlanActivate` (:168-176). Notes:

- `getUserByToken` on a now-inactive own store throws
  `SessionRejectedError` → `auth-store` logs out (the designed passive
  verdict; do NOT catch-and-stay — the catch here only guards the UX from
  a NETWORK failure during refresh, and `isSessionRejection` is already
  handled inside `getUserByToken`'s own flow: it returns null after
  logout rather than throwing out... VERIFY at implementation: whether the
  rejection surfaces as a thrown error (→ caught here, fine, logout already
  happened) or a null return (→ nothing to do). Either way the logout must
  not be blocked by this catch).
- After a successful refresh the new `user.storeList` is already in the store
  (auth-store `set()`), so the select re-renders with the new state — no
  prop drilling.

### D5 — Frontend: roster types + toUserModel carry storeList

```ts
// roster-types.ts — optional, mirror of backend DTO
storeList?: Array<{ id: string; name: string; isActive: boolean }>;

// offline-auth-service.ts toUserModel:
storeList: user.storeList,
```

Optional field: legacy bundles (formatVersion < 4 without the field) hydrate
`storeList: undefined` → selects fall back to current-store-only. Bundle
shape validation (roster-serializer) accepts absent/empty `storeList` — same
tolerance pattern as `wrappedDek`/`paymentDueDate` (optional forward-compat
fields). No `formatVersion` bump is REQUIRED for an additive optional field
(deserializer is an unchecked cast; the validator must merely not reject the
new field — verify it whitelists unknown fields).

### D6 — Tests (strict TDD)

**Backend unit (NEW files, Application.Tests)**:
- `Authentication/Queries/GetMe/GetMeStoreListIsActiveTests.cs` — owner
  mixed actives/inactives → flags per store; non-owner → empty (matches
  existing handler-test style, mocking `IStoreRepository`).
- `Features/Management/Users/Queries/ExportOfflineRoster/` — new test class
  for the owner-row storeList fill (owner row gets all stores with flags;
  store user gets empty).

**Backend E2E (NEW file, real PostgreSQL)**:
- `Auth/AuthMeStoreListIsActiveTests.cs` (name TBD at apply; sibling of the
  untouchable `AuthMeStoreListTests.cs`): seeds owner with active+inactive
  stores, asserts `/me` `storeList[].isActive` values; roster export E2E
  asserting the owner row's `storeList` (id/name/isActive) and a store-user
  row's empty list.
- `TestDtos.cs` `StoreSummaryData` gains `IsActive` (additive; existing
  tests' deserialization unaffected — System.Text.Json ignores missing).

**Frontend vitest (edits allowed — not E2E)**:
- `store-switcher.test.tsx`: rewrite mocks — user fixture with
  `storeList` (mixed actives); assert only actives render; assert NO
  `listStores` call; keep gate tests.
- `configurations.test.tsx`: same source swap; offline fallback test stays
  (storeList undefined → current store option).
- `offline-auth-service.test.ts`: roster user with `storeList` →
  `toUserModel` maps it; roster user without → `storeList` undefined.
- `roster-serializer.test.ts` (or wherever bundle shape validation lives):
  bundle WITH `storeList` passes validation; without → passes (optional).

**Playwright**: NEW spec only if the apply phase finds a gap the above does
not cover; default is none (data-source swap keeps DOM identical for
`e2e/configurations.spec.ts`'s existing assertions — verify at apply by
running that spec untouched... NOTE: existing Playwright specs are
untouchable; running them is allowed and expected).

### D7 — i18n / UX details

- No new keys required: switcher already has empty-list copy
  (`STORE_SELECTOR.*`); configurations has its label + fallback.
- The switcher's current-store label keeps resolving from `user.roles`
  (offline-safe), NOT from `storeList`.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Owner deactivates own store; refresh logs them out "suddenly" | By design (user decision): confirm-dialog warns first; logout is the /me verdict — contract-compliant, same as expiry |
| Stale roster storeList offline (store deactivated after export) | Accepted: offline select may offer a store that is now inactive server-side; the switch attempt (`switchToStore`) fails on `/me` → error surface, no session damage (catch path exists) |
| `StoreSummaryData` (TestDtos) changes | Additive property; existing E2E deserialize unaffected (verified pattern: `WrapIterations` was added the same way) |
| Serializer whitelist rejects unknown `storeList` field in bundle | Verify at apply (roster-serializer tolerance for optional fields is established by wrappedDek/paymentDueDate precedent) |
| switcher/configurations unit tests rewrite is bigger than the component change | Expected; tests follow the component's real contract change |

## Migration / Compatibility

- Roster `formatVersion`: no bump (additive optional field, unchecked-cast
  deserialization, validation must tolerate the field — verified at apply).
- API contract: `/me` and roster responses widen additively; no consumer
  narrows.
- Old cached sessions (pre-change `/me` cached in localStorage) may lack
  `isActive` on entries → `filter(s => s.isActive)` yields... **trap**:
  cached OLD storeList entries have NO `isActive` (undefined) → filter drops
  ALL → select falls back to current-store-only until next /me. Accepted
  one-shot degradation? **Decision**: treat undefined-flag entries as NOT
  selectable (do not offer a store whose activation is unknown) — safe
  default, self-heals on the next session refresh (any switchToStore,
  create, deactivate, plan change, or fresh login).

## Implementation Phases (feeds tasks.md)

1. **BE-DTO**: StoreSummaryDto + GetMeQuery fill + unit tests (RED→GREEN).
2. **BE-Roster**: OfflineRosterUserDto + export fill + unit tests.
3. **BE-E2E**: new E2E files + TestDtos field.
4. **FE-Domain**: StoreSummary.isActive + roster types + toUserModel + tests.
5. **FE-Selects**: switcher + configurations source swap + tests rewrite.
6. **FE-Refresh**: my-stores refresh moments + tests.
7. **Verify**: full circuit (backend build+unit+E2E; FE typecheck+lint+vitest).
