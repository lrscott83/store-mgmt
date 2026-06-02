# Proposal: Admin Owners (Reseller/SuperAdmin Owner CRUD) — 1:1 React Migration

## Intent
Migrate Angular `presentation/owners/` (list, create, edit) to React 19 at `apps/web-store-pos/app/admin/owners/`, gated for SuperAdmin OR Reseller with `EFeatures.Owners`. Slice 5/5 (LAST) of the admin group. Purely additive — `Owner`/`OwnerStoreModule` models, `EFeatures.Owners`, `MENU.OWNERS` already exist.

## Scope

### In Scope
- `ownerHttpService` singleton on `apiClient`: getOwners (GET `/v1/owners/all/true`), getOwnerById (GET `/v1/owners/:id`), createOwner (POST `/v1/owners/`), editOwner (PUT `/v1/owners/:id`), deleteOwner (DELETE `/v1/owners/:id`).
- `owner-list.tsx`: card grid (fullName, computed store price + count text, reSellerName w/ 'ADMIN' fallback, cellPhone, email-if-present, description); background class via isActive/guest; **Delete action (no confirm dialog)**; navigate to edit; `loader = resellerFeatureLoader([EFeatures.Owners])`.
- `owner-create.tsx`: fields fullName, login, password (PASSWORD_REGEX), confirmPassword (match), cellPhone (PHONE_REGEX), email, description, reSellerId (SuperAdmin-only `<select>` from `resellerHttpService.listResellers()`); submit disabled when not dirty; POST → navigate `/management/stores/create`; inline error from `errors[0].description`.
- `owner-edit.tsx`: **TAB-SHELL** (Details | Stores | Users) for SuperAdmin, Details-only for Reseller. Details tab = form (login read-only, fullName, isActive toggle SuperAdmin-only, cellPhone, email, description, reSellerId SuperAdmin-only); guest submitted from loaded value (read-only); PUT payload `{fullName, cellPhone, email, guest, isActive, description, reSellerId}`; PUT → stay on page (`response.data` id).
- Unsaved-changes guard on both forms via `useUnsavedChangesPrompt(isDirty)` ONLY.
- NEW `resellerFeatureLoader(featureIds)` in `auth/routes/loaders.ts` (role + feature, mirrors `adminFeatureLoader`). `OWNER.*` i18n keys in `es.ts`. 3 route regs. Co-located vitest tests.

### Out of Scope (explicit non-goals)
- **Create button on list**: OMITTED (commented out in Angular). The `/admin/owners/create` route IS still registered (URL-accessible).
- **Approve / Activate / Deactivate** list actions: empty no-op stubs in Angular → OMITTED.
- `getOwnerDetailsById` (GET `/v1/owners/details/:id`): backs a dead `<p>owner-details works!</p>` component → OMITTED.
- Phone-mask library — plain input + `PHONE_REGEX` only.
- No change to `Owner`/`OwnerStoreModule` models, `EFeatures`, `menu-config.ts`, `MENU.OWNERS`.

## Capabilities
- New: None.
- Modified `admin`: add admin-owners requirement (Reseller/SuperAdmin owner list+create+tab-shell-edit; delete-no-confirm; create button omitted; approve/activate/deactivate omitted as Angular no-ops) to `openspec/specs/admin/spec.md` at archive.

## Approach
Established admin slice pattern: flat container per route, `useState`+`useEffect`+`useIntl`, no Context/Redux, inline error state, no toast. Edit departs from the resellers' flat-edit: it is a **tab-shell** to match Angular (Details/Stores/Users). NEW `resellerFeatureLoader` composes `resellerLoader` (role) + `featureLoader([EFeatures.Owners])` (feature) — the same composition `adminFeatureLoader` already uses. reSellerId/isActive are SuperAdmin-conditional and functional (not dead controls). `BaseResponseModel<T>` fields non-nullable — mocks use `''`/`0`/`[]`, never null.

## Affected Areas
| Area | Impact |
|------|--------|
| `app/admin/owners/lib/services/owner-http-service.ts` | New |
| `app/admin/owners/routes/owner-list.tsx` | New |
| `app/admin/owners/routes/owner-create.tsx` | New |
| `app/admin/owners/routes/owner-edit.tsx` (tab shell) | New |
| `app/admin/owners/**/__tests__/*` | New |
| `app/auth/routes/loaders.ts` (+resellerFeatureLoader) | Modified |
| `app/routes.ts` (+3 routes) | Modified |
| `app/shared/lib/i18n/es.ts` (OWNER.* keys) | Modified |
| `openspec/specs/admin/spec.md` | Modified at archive |
| `Owner`/`OwnerStoreModule`, `EFeatures`, `menu-config.ts` | Reuse, no change |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **Stores/Users tabs reuse** — React `StoreList`/`UserList` are PURE presentational (take resolved `Store[]`/`StoreUser[]` + full callback props: onCreate/onEdit/onActivate/onApprove/onDeactivate). Angular `app-store-list`/`app-user-list` were self-loading (0 params). They are NOT drop-in reusable here. | High | **Design MUST resolve**: define owner-scoped data source for each tab and decide callback behavior (or stub). Flagged as the lead open question. |
| reSellerId fetch couples owner pages to `resellerHttpService.listResellers()` | Med | Same coupling exists in Angular; service already exists and is functional. |
| `getOwnerStorePrice`/count over `storeModules` | Low | Cover empty-array edge case in tests. |
| Create route unreachable from UI (button omitted) | Low | Intentional 1:1; document for reviewers. |
| Post-create redirect to `/management/stores/create` (differs from every other slice) | Low | Preserve Angular behavior; target route is feature-gated, user is SuperAdmin/Reseller. |
| Slice >400 lines (~1190 w/ tabs) | High | Chained PRs; final boundary at tasks under ask-on-risk. |

## Rollback Plan
Revert slice commit(s) on local branch. Additive new files + 3 small edits (loaders.ts, routes.ts, es.ts); no shared infra behavior changed. Local stacked branch only, no push/PR.

## Dependencies
Existing `resellerLoader` + `featureLoader`, `apiClient`, `useUnsavedChangesPrompt`, `resellerHttpService.listResellers()`, `Owner`/`OwnerStoreModule` models, `EFeatures.Owners`, `MENU.OWNERS`, `PASSWORD_REGEX`/`PHONE_REGEX` (from `management/users`). No new external dependency.

## Delivery
Chained PRs expected (~1190 lines w/ tabs, >400 budget). Proposed boundary: PR-1 = service + list + `resellerFeatureLoader` + i18n baseline + 3 route regs + tests (read-only autonomous); PR-2 = create + post-create redirect + tests; PR-3 = tab-shell edit + Stores/Users tab wiring + tests. Final split deferred to tasks under ask-on-risk.

## Success Criteria
- [ ] 3 routes gated by `resellerFeatureLoader([EFeatures.Owners])`; list cards, create form, tab-shell edit 1:1 with Angular.
- [ ] Service wired to all 5 endpoints; create → `/management/stores/create`, edit → stay; delete refreshes list (no confirm).
- [ ] reSellerId/isActive SuperAdmin-conditional and functional; unsaved guard on both forms.
- [ ] Create button omitted; approve/activate/deactivate omitted; no mask library; no dead code.
- [ ] Tests pass; chained PRs within review budget.
