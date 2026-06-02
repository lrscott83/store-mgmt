# Design: Admin Owners (Reseller/SuperAdmin Owner CRUD + Tab-Shell Edit) — 1:1 React Migration

Slice 5/5 (LAST) of the admin group. Artifact store: hybrid. Strict TDD active (vitest, `pnpm test`).

## Technical Approach

Mirror the established admin slice pattern (features / stores / dashboard / resellers): one client
container per route, `export const loader`, inline `useState` + `useEffect` + `useIntl`, inline error
(no toast / Context / Redux), inline JSX forms. HTTP service singleton on the shared `apiClient`
returning `response.data` of type `BaseResponseModel<T>`.

This slice DEPARTS from the resellers flat-edit in exactly one place: the **edit page is a tab-shell**
(Details / Stores / Users) for SuperAdmin, Details-only for Reseller — because the user explicitly chose
full tab parity with the Angular `EditOwnerComponent`. The hard part (tab data sourcing + callbacks) is
fully resolved below against real Angular and React code.

Guard departs from prior slices: owners is reachable by SuperAdmin OR Reseller plus `EFeatures.Owners`,
so a NEW `resellerFeatureLoader([EFeatures.Owners])` composer is added to `loaders.ts`.

---

## CRITICAL RESOLUTION — Stores/Users tabs (the lead risk)

The proposal flagged HIGH risk: React `StoreList`/`UserList` are pure presentational (take resolved data
+ full callback sets), while the Angular `<app-store-list>`/`<app-user-list>` were self-loading 0-param
components. I read the real Angular tab components AND the React route pages to resolve this concretely.

### What the Angular tabs ACTUALLY did (ground truth)

**Shell** — `frontend/src/app/presentation/owners/edit-owner/edit-owner.component.ts:17-32` +
`.../edit-owner.component.html:12-26`:
- `EditOwnerComponent` takes the owner `:id` for nothing tab-related. It reads only `isSuperAdmin`.
- It renders `<app-store-list>` and `<app-user-list>` **with ZERO inputs** — the tabs are completely
  DECOUPLED from the owner being edited. The owner id is never forwarded to either tab.
- `openCreateOwnerModal()` in the shell is an EMPTY no-op (`.ts:29-31`).

**Stores tab** — `frontend/src/app/presentation/stores/store-list/store-list.component.ts:20-58`:
- Self-loads via `storeService.getStoresByCurrentUser()` → `GET /v1/stores/by-current-user`
  (`frontend/src/app/_services/store/store.service.ts:22-26`). This is scoped to the CURRENT logged-in
  user (the SuperAdmin viewing the page), NOT to the owner. So the tab shows the SuperAdmin's OWN stores.
- Has its own full CRUD with Swal confirms: `onActivate` (`activateStore`), `onDeactivate` (`delete`),
  `onApproved` (`approveStore`), `onDisapproved` (`disapproveStore`) — lines 60-203. Each reloads on success.

**Users tab** — `frontend/src/app/presentation/users/user-list/user-list.component.ts:9-11` +
`.../user-list.component.html:1`:
- The component class is EMPTY. The template is literally `<p>user-list works!</p>`. It loads NOTHING,
  takes NO owner param, has ZERO behavior. It is a placeholder stub that shipped to production.

### React parity wiring (resolved, cited)

| Tab | Angular source | React data source | React callbacks |
|-----|----------------|-------------------|-----------------|
| **Details** | `EditOwnerDetailsComponent.getOwnerById` (`edit-owner-details.component.ts:67-84`) → `GET /v1/owners/:id` | `ownerHttpService.getOwner(id)` on mount (useEffect) | Submit → `ownerHttpService.updateOwner(id, payload)`; SuperAdmin also `resellerHttpService.listResellers()` for the reSellerId select |
| **Stores** (SuperAdmin only) | `StoreListComponent` self-loads `getStoresByCurrentUser` → `/v1/stores/by-current-user` | REUSE `storeHttpService.listStores()` — already maps to the EXACT same endpoint `/v1/stores/by-current-user` (`store-http-service.ts:25-30`). Load lazily when the Stores tab mounts. | Reuse the EXACT callbacks the production `StoreListPage` route passes (`management/stores/routes/store-list.tsx:74-79`): `onCreate`→`navigate('/management/stores/create')`, `onEdit`→`navigate('/management/stores/edit/:id')`, `onActivate/onApprove/onDisapprove/onDeactivate`→`handleLifecycleAction(storeHttpService.*)` with reload. This is FULLER than Angular (Angular had no create/edit, only act/deact/appr/disappr) but is the canonical React `StoreList` contract; to stay parity-faithful we pass the SAME callback set the existing route uses, since `StoreList` requires `onCreate/onApprove/onDisapprove` (non-optional). |
| **Users** (SuperAdmin only) | `UserListComponent` is `<p>user-list works!</p>` — empty stub, no data, no behavior | NO data fetch. Render a placeholder matching the Angular stub: a single line of text. Do NOT mount the React `UserList` presentational component (it requires resolved `users` + 5 mandatory callbacks that Angular never wired). | None — placeholder only |

#### Decision: Stores tab — reuse the route component, not re-wire StoreList by hand

`StoreList` props (`management/stores/components/store-list.tsx:4-15`) require `stores, isOnline,
isDegraded, onCreate, onEdit, onApprove, onDisapprove` (non-optional) plus optional
`onActivate/onDeactivate/error`. The cleanest, lowest-risk parity is to **render the existing
`StoreListPage` route container** (`management/stores/routes/store-list.tsx` default export) directly
inside the Stores tab. It already: loads `/v1/stores/by-current-user` (same endpoint as Angular), wires
every callback, handles online/degraded/error. This gives byte-for-byte data parity with the Angular tab
with ZERO new store wiring. The owner-edit page just imports and mounts `<StoreListPage />` in the tab
panel. (`StoreListPage` has its own `export const loader = adminFeatureLoader([EFeatures.Stores])` but
the loader only runs at route level; mounting the component does not re-invoke the loader, so the owner
route's `resellerFeatureLoader` remains the sole gate — verified: loaders are route-config bound, not
component-bound.)

ASSUMPTION (documented): Angular's stores tab had no create/edit buttons; the React `StoreListPage`
shows them. Since `StoreList` makes `onCreate`/`onEdit` mandatory and the production stores route already
ships them, reusing the route component is the faithful, no-new-code choice. If strict button-hiding
parity is later required, that is a follow-up — flagged in Open Questions.

#### Decision: Users tab — placeholder stub (1:1 with Angular)

The Angular Users tab renders `<p>user-list works!</p>` — a non-functional placeholder. Faithful parity =
render an equivalent placeholder (`OWNER.USERS_TAB_PLACEHOLDER` i18n), NOT the real `UserList`. Mounting
`UserList` would invent behavior Angular never had (it needs `users[]` + onCreate/onEdit/onActivate/
onDeactivate, none of which existed). This is the parity-faithful low-risk choice.

#### Line-estimate impact of tabs

The tab-shell adds modest lines vs. a flat edit because the heavy lifting is reuse, not re-wiring:
- Tab state + tab buttons + 3 panels: ~40 lines
- Stores panel = `<StoreListPage />` import + mount: ~3 lines
- Users panel = placeholder `<p>{intl...}</p>`: ~3 lines
- Net tab cost over flat edit: **~45-50 lines** (NOT the ~150 the explore feared, because no StoreList
  hand-wiring and no UserList wiring). Edit page total ~270 lines.

---

## ADRs

- **ADR-1 — `resellerFeatureLoader` composer (new).** Add to `app/auth/routes/loaders.ts`, modeled
  EXACTLY on the existing `adminFeatureLoader` (`loaders.ts:51-57`): run the role loader first, return its
  redirect if any, else delegate to `featureLoader(featureIds)`. Role loader = existing `resellerLoader`
  (`loaders.ts:70-79`, allows `isSuperAdmin || isReSeller`). Signature:
  ```ts
  export function resellerFeatureLoader(featureIds: number[]) {
    return async ({ params }: LoaderFunctionArgs): Promise<Response | null> => {
      const resellerResult = await resellerLoader();
      if (resellerResult) return resellerResult;
      return featureLoader(featureIds)({ params } as LoaderFunctionArgs);
    };
  }
  ```
  All 3 owner routes use `export const loader = resellerFeatureLoader([EFeatures.Owners])`. Rejected:
  inline composition per route (duplication) and reusing bare `resellerLoader` (skips the feature check,
  breaks parity).

- **ADR-2 — `ownerHttpService` singleton on `apiClient`.** New file
  `app/admin/owners/lib/services/owner-http-service.ts`. Methods (payload interfaces inline, mirroring
  `reseller-http-service.ts`):
  | Method | HTTP | URL | Returns |
  |--------|------|-----|---------|
  | `listOwners()` | GET | `/v1/owners/all/true` | `BaseResponseModel<Owner[]>` |
  | `getOwner(id)` | GET | `/v1/owners/:id` | `BaseResponseModel<Owner>` |
  | `createOwner(payload)` | POST | `/v1/owners/` | `BaseResponseModel<string>` |
  | `updateOwner(id, payload)` | PUT | `/v1/owners/:id` | `BaseResponseModel<boolean>` |
  | `deleteOwner(id)` | DELETE | `/v1/owners/:id` | `BaseResponseModel<boolean>` |
  Each returns `response.data`. `CreateOwnerPayload = {fullName, login, password, cellPhone, email,
  description, reSellerId}`; `UpdateOwnerPayload = {fullName, cellPhone, email, guest, isActive,
  description, reSellerId}` (matches Angular `editOwner` arg order, `edit-owner-details.component.ts:100`).
  NOTE: do NOT reuse `storeHttpService.listOwners()` (`store-http-service.ts:93-98`) — it exists but
  belongs to the stores slice; owners owns its own service for cohesion. `getOwnerDetailsById` (dead) and
  approve/activate/deactivate (no-ops) OMITTED. Rejected: typing create as `<boolean>` — Angular returns
  `<string>` (the new id, consumed by the navigate-to-stores redirect uses `response.data` in edit but
  create just navigates to a static path, so the value is non-load-bearing; keep `<string>` for parity).

- **ADR-3 — Password primitive copied EXACTLY** from `management/users/components/UserCreateForm.tsx:4`:
  `const PASSWORD_REGEX = /(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/`. Two-step validation on
  create (regex first → `OWNER.PASSWORD_POLICY`; then `password === confirmPassword` →
  `OWNER.PASSWORDS_MUST_MATCH`), mirroring `UserCreateForm.tsx:42-50` and `reseller-create.tsx:43-51`.
  No password fields on edit (Angular edit form has none — `edit-owner-details.component.ts:125-133`).

- **ADR-4 — Phone = plain `<input type=text>` + regex**, NO mask library. Reuse the resellers regex
  `const PHONE_REGEX = /^\+53\s?[0-9]\s?[0-9]{3}-?[0-9]{4}$/` (`reseller-create.tsx:14`). Validation on
  create AND edit before submit → `OWNER.PHONE_FORMAT`. Rejected: ngx-mask port / react-imask (new dep).

- **ADR-5 — Unsaved guard = ONLY `useUnsavedChangesPrompt(isDirty)`** from
  `~/shared/lib/hooks/use-unsaved-changes-prompt` (verified self-contained via useBlocker+window.confirm;
  the `UnsavedChangesDialog` component is unused — do NOT wire it). Create dirty = any tracked field
  non-empty (mirror `reseller-create.tsx:32`). Edit dirty = any tracked field differs from a loaded
  snapshot; re-snapshot after a successful PUT since edit STAYS on page (mirror `reseller-edit.tsx:24-34,
  60-71, 127`). Snapshot tracks the Details-tab fields only (tabs don't affect dirty).

- **ADR-6 — Error handling inline.** `!res.succeeded` → `res.errors[0]?.description ?? OWNER.ERROR`
  (Angular parity, `edit-owner-details.component.ts:119`; `errors` is non-nullable `BaseError[]`, use `?.`
  for empty). `catch` → `OWNER.ERROR`. List fetch failure → `OWNER.ERROR` (mirror
  `reseller-list.tsx:21-23`).

- **ADR-7 — reSellerId + isActive are SuperAdmin-conditional and FUNCTIONAL** (unlike resellers' dead
  control). Read `const { user } = useAuthStore()`; `isSuperAdmin = user?.isSuperAdmin ?? false`
  (`isSuperAdmin` is on the auth user — `packages/domain/src/models/auth.ts:31`). When SuperAdmin: render
  the reSellerId `<select>` populated from `resellerHttpService.listResellers()` (loaded in a second
  useEffect on create, and alongside `getOwner` on edit), and on edit render the `isActive` toggle. When
  not SuperAdmin: omit both controls; on edit, submit `isActive` from the loaded owner value (read-only),
  matching Angular's `addControl` gating (`edit-owner-details.component.ts:134-135`).

- **ADR-8 — `guest` submitted from loaded value, never shown.** Angular patches the full owner via
  `patchValue(owner)` and submits `guest` from form state with no guest control
  (`edit-owner-details.component.ts:89, 100`). React: capture `guest` from the loaded `Owner` into state,
  include it in the PUT payload, never render an input for it.

- **ADR-9 — Tab-shell = local `useState<'details'|'stores'|'users'>` + button tabs**, no router nesting.
  SuperAdmin sees 3 tab buttons; Reseller sees Details only (no tab chrome). Stores panel mounts
  `<StoreListPage />`; Users panel renders the placeholder. Lazy: only the active panel renders, so the
  Stores tab fetches `/v1/stores/by-current-user` only when first opened (mirrors Angular's per-tab
  ngOnInit). Rejected: nested routes (`/admin/owners/edit/:id/stores`) — Angular used in-component
  mat-tabs with one URL; nested routes would diverge from parity and the URL contract.

- **ADR-10 — List page = card grid, computed price/count, delete-no-confirm, no create button.**
  `ownerHttpService.listOwners()` on mount. Per card: `fullName`; computed store price =
  `owner.storeModules.reduce((s, m) => s + m.storeModuleTotalCurrentPrice, 0)` formatted USD via
  `intl.formatNumber(total, { style: 'currency', currency: 'USD' })`; store count via
  `OWNER.STORE_PRICE_LABEL` with `{count: owner.storeModules.length}`; reSellerName (fallback `'ADMIN'`
  when empty); cellPhone; email (only if non-empty); description. Background class:
  `!owner.isActive → 'deactive-owner'`, else `owner.isActive && !owner.approved → 'guest-owner'`, else
  `''` (Angular `getOwnerBackgroundColor`). Delete button calls `ownerHttpService.deleteOwner(id)` then
  reloads — NO confirm dialog (Angular used Swal but React convention drops confirms; parity-faithful to
  the action, not the dialog). NO create button (commented out in Angular). Approve/activate/deactivate
  OMITTED (no-ops). Empty `storeModules` → price 0, count 0 (cover in tests).

---

## File Layout (under `app/admin/owners/`)

```
app/admin/owners/
  lib/services/
    owner-http-service.ts                         NEW (~60 lines)
    __tests__/owner-http-service.test.ts          NEW (~70)
  routes/
    owner-list.tsx                                NEW (~130)
    owner-create.tsx                              NEW (~210)
    owner-edit.tsx                                NEW (~270, incl. tab-shell)
    __tests__/owner-list.test.tsx                 NEW (~110)
    __tests__/owner-create.test.tsx               NEW (~150)
    __tests__/owner-edit.test.tsx                 NEW (~160)
```

Modified (shared):
- `app/auth/routes/loaders.ts` — add `resellerFeatureLoader` (~10 lines) [ADR-1]
- `app/routes.ts` — +3 routes after `admin/resellers/edit/:id` (line 72):
  ```ts
  route('admin/owners', 'admin/owners/routes/owner-list.tsx'),
  route('admin/owners/create', 'admin/owners/routes/owner-create.tsx'),
  route('admin/owners/edit/:id', 'admin/owners/routes/owner-edit.tsx'),
  ```
- `app/shared/lib/i18n/es.ts` — add `OWNER.*` + missing `GENERAL.*` keys (es only; en.ts doesn't exist)
- `openspec/specs/admin/spec.md` — modified at ARCHIVE, not now.

No domain change (`Owner`, `OwnerStoreModule`, `isActive` via `AuditableBaseModel` all exist:
`packages/domain/src/models/store.ts:37-54`). No menu-config change (`MENU.OWNERS` exists).

---

## Per-page data wiring

- **owner-list.tsx** — `useState<Owner[]>` + `useEffect(loadOwners, [])` calling `listOwners()`; inline
  USD/count compute in render; `deleteOwner(id).then(loadOwners)`; `navigate('/admin/owners/edit/:id')`
  on card edit; `loader = resellerFeatureLoader([EFeatures.Owners])`.
- **owner-create.tsx** — controlled fields fullName/login/password/confirmPassword/cellPhone/email/
  description; `isSuperAdmin` from auth store → conditional reSellerId `<select>`; useEffect loads
  `resellerHttpService.listResellers()` only when SuperAdmin; validate password→confirm→phone; submit
  `createOwner(payload)`; on success `navigate('/management/stores/create')` (preserve Angular redirect,
  `create-owner.component` parity); `useUnsavedChangesPrompt(isDirty)`; `loader = resellerFeatureLoader([...])`.
- **owner-edit.tsx** — `useParams<{id}>`; useEffect calls `getOwner(id)` → populate Details fields +
  capture `guest`/`approved` into state + build snapshot; if SuperAdmin also `listResellers()`. Tab-shell
  per ADR-9. Details submit: phone validate → `updateOwner(id, {fullName, cellPhone, email, guest,
  isActive, description, reSellerId})` → re-snapshot, STAY on page; `useUnsavedChangesPrompt(isDirty)`.
  Stores panel mounts `<StoreListPage />`; Users panel = placeholder.

---

## i18n keys (es.ts, add)

NEW `OWNER.*`: `LIST_TITLE`, `CREATE_TITLE`, `EDIT_TITLE`, `EDIT_OWNER`, `DELETE`, `STORE_PRICE_LABEL`
(`'en {count} tienda(s)'` — interpolated, from Angular `OWNER.STORE_SINGLE_PRICE`), `RESELLER_ADMIN_FALLBACK`
(`'ADMIN'`), `PASSWORD_POLICY`, `PASSWORDS_MUST_MATCH`, `PHONE_FORMAT`, `ERROR`, `RESELLER_LABEL`,
`USERS_TAB_PLACEHOLDER`.
NEW `GENERAL.*` (missing today): `GENERAL.DETAILS`, `GENERAL.STORES`, `GENERAL.USERS` (tab labels).
REUSE existing: `GENERAL.LOADING` (es.ts:5), `USERS.FULL_NAME/LOGIN/PASSWORD/CONFIRM_PASSWORD/CELL_PHONE/
EMAIL/SAVE/EDIT/IS_ACTIVE`, `STORES.DESCRIPTION` (as resellers reused them).

---

## Testing (STRICT TDD, RED-first, `pnpm test`)

Mock conventions follow `reseller-create.test.tsx`: mock `react-router` (useNavigate, useParams,
useBlocker→`{state:'unblocked'}`), mock `~/auth/routes/loaders` (`resellerFeatureLoader: vi.fn(() =>
vi.fn().mockResolvedValue(null))` — it's a factory), mock `useUnsavedChangesPrompt`, wrap in `IntlProvider`
with real `esMessages`. ALL `BaseResponseModel` mocks use `message:'' actionCode:0 errors:[]` NON-nullable.

**Two-service mocking (create + edit):** mock BOTH `~/admin/owners/lib/services/owner-http-service` AND
`~/admin/resellers/lib/services/reseller-http-service` (the latter `listResellers: vi.fn()`). To exercise
the SuperAdmin reSellerId branch, also mock `~/shared/lib/stores/auth-store` returning
`{ user: { isSuperAdmin: true } }`; for the non-SuperAdmin branch return `{ user: { isSuperAdmin: false } }`.

- **owner-http-service.test.ts** — mock `api-client` (get/post/put/delete = vi.fn, pattern from
  `feature-http-service.test.ts`). Assert each method's URL + payload + returns `response.data` +
  propagates throw. Cover createOwner POST `/v1/owners/`, getOwner GET `/v1/owners/:id`, updateOwner PUT
  `/v1/owners/:id`, deleteOwner DELETE `/v1/owners/:id`, listOwners GET `/v1/owners/all/true`.
- **owner-list.test.tsx** — named `loader` + default export; one card per owner (fullName, computed USD
  price, count label, reSellerName + ADMIN fallback when empty, cellPhone, email-only-if-present,
  description); `deactive-owner`/`guest-owner`/normal background per isActive/approved; delete → calls
  `deleteOwner` then reloads (NO confirm dialog asserted); edit → navigate `/admin/owners/edit/:id`; empty
  `storeModules` → price 0 + count 0; throw → `OWNER.ERROR`; NO create button; NO approve/activate/deactivate.
- **owner-create.test.tsx** — 7 base fields; SuperAdmin=true → reSellerId select rendered + populated from
  `listResellers`; SuperAdmin=false → no reSellerId; password regex fail → `OWNER.PASSWORD_POLICY`, no
  createOwner; mismatch → `OWNER.PASSWORDS_MUST_MATCH`, no call; bad phone → `OWNER.PHONE_FORMAT`, no call;
  valid → `createOwner(payload incl reSellerId)` then `navigate('/management/stores/create')`; `!succeeded`
  → `errors[0].description`; throw → `OWNER.ERROR`; guard called with truthy isDirty after typing.
- **owner-edit.test.tsx** — load by `:id` via `getOwner`; login disabled/read-only; SuperAdmin → 3 tab
  buttons (Details/Stores/Users) + isActive toggle + reSellerId select; non-SuperAdmin → Details only, no
  tab chrome, no isActive/reSellerId; clicking Stores tab mounts StoreListPage (mock
  `~/management/stores/routes/store-list` default → assert rendered; do NOT exercise its internals here);
  clicking Users tab shows `OWNER.USERS_TAB_PLACEHOLDER`; bad phone blocks PUT; valid → `updateOwner(id,
  {fullName,cellPhone,email,guest,isActive,description,reSellerId})` STAYS on page (no navigate); guest
  carried from loaded value into payload; `!succeeded` → `errors[0].description`; throw → `OWNER.ERROR`;
  guard active on snapshot diff.

---

## Risk resolutions

| Proposal risk | Resolution |
|---------------|------------|
| LEAD (High) Stores/Users tab reuse | RESOLVED. Stores tab = mount existing `StoreListPage` (same `/v1/stores/by-current-user` endpoint as Angular, all callbacks wired, ~3 lines). Users tab = placeholder stub matching Angular's `<p>user-list works!</p>` (NOT the real UserList). Tab cost ~45-50 lines, not ~150. |
| reSellerId coupling (Med) | Accepted — same coupling as Angular; `resellerHttpService.listResellers()` exists; loaded only when SuperAdmin. |
| storeModules price/count (Low) | Inline reduce + `intl.formatNumber` USD; empty-array → 0/0 covered in list test. |
| Create route unreachable from UI (Low) | Intentional — route registered, no list button (Angular commented out). Documented. |
| Post-create redirect to `/management/stores/create` (Low) | Preserved verbatim (Angular parity); differs from all other slices by design. |
| Slice ~1190 lines (High) | Chained PRs at tasks under ask-on-risk. Suggested: PR-1 service+list+resellerFeatureLoader+i18n+routes+tests (~380); PR-2 create+tests (~360); PR-3 tab-shell edit+tests (~430). |
| Guard composition new loader (Low) | `resellerFeatureLoader` mirrors `adminFeatureLoader` exactly; covered by a loader test (compose role then feature). |

---

## Open Questions (defer to apply)

1. Stores tab button parity: React `StoreListPage` shows Create/Edit buttons the Angular stores tab did
   not. Reusing the route component is the no-new-code parity choice; strict button-hiding is a possible
   follow-up if a reviewer insists.
2. PHONE_REGEX strictness (forgiving vs exact mask) — same open question as resellers; keep forgiving regex.
3. Whether to reuse `storeHttpService.listOwners()` instead of a dedicated `ownerHttpService.listOwners()`
   — design chooses dedicated service for slice cohesion (decided, noted for the record).

---

## Next: sdd-tasks (after spec is also ready).
