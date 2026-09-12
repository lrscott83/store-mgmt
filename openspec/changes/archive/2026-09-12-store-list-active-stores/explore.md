# Explore: store-list-active-stores

**Change**: store-list-active-stores · **Phase**: Explore · **Date**: 2026-09-11
**Baseline**: main @ 72254e8f (includes qa 7cd02d5e storeList sale_out + 37b79718 /me owner store list)

## User intent (verbatim, translated)

MultiStores-gated store switching in the header button and the owner's Configurations must list **all ACTIVE stores** from the storeList already returned by `/me` (no extra request). To filter actives, `StoreSummaryDto` gains an `isActive` field. The switch flow (`switchToStore`) stays as-is after selection. The roster must carry the same list. New-store creation and store deactivation must keep the list and the select consistent (select shows only actives). Analyze the last-active-store deactivation case and log out all that store's users.

## 1. Baseline inventory (exact paths)

### Backend

| What | Path | Fact |
|---|---|---|
| StoreSummaryDto | `backend/src/Application/Dtos/Authentication/StoreSummaryDto.cs` | `record StoreSummaryDto(Guid Id, string Name)` — positional; NO isActive |
| /me fill | `backend/src/Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs:110-119` | OwnerAdmin only; `GetAllStoresByOwnerUserIdAsync` (ALL stores, active+inactive); comment says FE resolves store names from any storeId |
| CurrentUserDto | `backend/src/Application/Dtos/Authentication/CurrentUserDto.cs:29` | `StoreList { get; set; }` |
| Repository | `IStoreRepository.GetAllStoresByOwnerUserIdAsync` | unfiltered (verify impl during spec) |
| by-current-user | `Application/Features/StoreManagement/Stores/Queries/GetStoresByCurrentUser/GetStoresByCurrentUserQuery.cs:61-66` | Owner branch: `GetActiveStoresByUserIdAsync` (ACTIVE only) but returns FULL `StoreDto` (modules, billing per store, N+1 payments) |
| Store activation | `Application/Features/StoreManagement/Stores/Commands/SetStoreActivation/SetStoreActivationCommand.cs` | Flips IsActive; SuperAdminOrOwnerAdmin; blocks DefaultStore; **no session invalidation at all** |
| Token blacklist | `SMCA.WebApi/Services/TokenBlacklistService.cs` | **IMemoryCache keyed by jti** — in-memory, per-node, no store→sessions index. Only used by GetMeQuery (self-blacklist on AccountInactive) + JwtBearerOptionsSetup check |
| /me store-inactive check | `GetMeQuery.cs:81-83` | SelectedStore inactive → 404 `StoreErrors.Inactive` — does NOT blacklist the token (only user-inactive path does at :70-73) |
| Login store check | `Application/Services/Authentication/AuthenticationService.cs:100-135` (HasActiveStore) | SuperAdmin pass; OwnerAdmin: Owner.IsActive + ANY active store (not the selected one specifically); StoreUser: their StoreUser row + store active |
| Roster export | `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` | Line 99-100: store inactive → BadRequest (roster refuses to export for inactive store); user list filtered to active users; `OfflineRosterUserDto` has NO storeList |
| Store creation | POST /v1/stores (`CreateStoreCommand`) | Owner+MultiStores creates for own OwnerId (memory #1004); approved=true; check IsActive default in `Store.Create` |

### Frontend (React — the only UI; Angular has NO switcher/select parity)

| What | Path | Fact |
|---|---|---|
| StoreSwitcher | `app/shared/components/store-switcher.tsx` (166 L) | navbar popup; gates isOwnerAdmin + `EModules.MultiStores` ∈ user.storeModuleIds; **lazy `listStores()` fetch on open** (GET /v1/stores/by-current-user); current name from `user.roles` |
| Configurations select | `app/management/configurations/routes/configurations.tsx` | gates MultiStores; **fetches `listStores()` on mount**; `<select id="active-store-select">`; offline fallback shows current store as sole option |
| switchToStore | `app/shared/lib/stores/switch-store.ts` | setMyStore → fresh /me → retargetDeviceWrapStore → reload; /me fail → logout. **NOT in scope to change** |
| storeList consumer | `app/inventory/routes/warehouse-movements.tsx:109` | sale_out store-name resolution: `user?.storeList?.find(...)` — today receives ALL stores (incl. inactive) which is CORRECT for name resolution |
| UserModel.storeList | `frontend-react/packages/domain/src/models/auth.ts:98` | `storeList?: StoreSummary[]` optional; `StoreSummary {id, name}` at :70 |
| roster type | `app/shared/lib/offline/roster-types.ts` | `OfflineRosterUser` — NO storeList field |
| offline→UserModel | `app/shared/lib/offline/offline-auth-service.ts` (toUserModel :63-87) | No storeList mapping → undefined offline |
| auth-store hydration | `app/shared/lib/stores/auth-store.ts:159-178` | **OFFLINE-FIRST**: cached profile + matching token → hydrate WITHOUT /me call (deliberate; Angular's revalidation removed). :186-232: when no cache, /me runs; `isSessionRejection(err)` → logout (the 404 Store.Inactive verdict path) |
| api-client | `app/shared/lib/http/api-client.ts:94-131` | 401 is NOT special online either — offline-first divergence; only explicit logout or local expiry kills the session |
| FE store create | `app/management/stores/routes/my-stores.tsx:134-160` (handleCreateStore) | After create: toast + `load()` — **NO session refresh** → storeList (from /me) stays stale until next /me |
| FE deactivate | `my-stores.tsx:92-129` (handleEditSave) | Confirm dialog → updateStore(name) + `setStoreActivation`; after: toast + `load()` — no session refresh either |
| i18n | `es.ts` STORE_SELECTOR.* / CONFIGURATIONS.STORE_LABEL | switcher + configurations keys exist |

### Tests pinning current behavior (ALL untouchable)

| Test | Pins |
|---|---|
| `SMCA.WebApi.E2ETests/Auth/AuthMeStoreListTests.cs` (qa, 4 tests) | /me StoreList: owner gets ALL stores incl. inactive `{Id, Name}`; store user/superadmin get empty. **Adding isActive does NOT break these (they assert Id/Name/Count only) — but any behavior change to "all stores" semantics needs NEW tests** |
| `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs:48` | `MeData.StoreList` as `List<StoreSummaryData>` — needs isActive if new tests assert it |
| `Application.Tests/Authentication/Queries/GetMe/*` | GetMe matrix; NO StoreList coverage today |
| `SMCA.WebApi.E2ETests/Stores/StoreActivationTests.cs` + `Billing/StoreActivationTests.cs` | set-activation endpoint behavior |
| `Application.Tests/.../SetStoreActivation/SetStoreActivationCommandHandlerTests.cs` | handler unit tests |
| FE `store-switcher.test.tsx`, `configurations.test.tsx` | lazy fetch + listStores usage + gates (will need updates if fetch removed — these are unit tests, NOT E2E: editable, but see spec) |
| FE `offline-auth-service.test.ts` | toUserModel mapping |
| FE `warehouse-movements.test.tsx` (qa) | storeList name resolution for sale_out |
| Playwright `e2e/configurations.spec.ts` | select rendering (UNTOUCHABLE; new coverage in NEW specs) |

## 2. Key findings & gaps (the feature's actual work)

1. **isActive gap**: `StoreSummaryDto` lacks isActive → /me's storeList cannot filter actives client-side. FE today sidesteps by fetching `by-current-user` (a DIFFERENT, heavier endpoint).
2. **Extra request**: Switcher + Configurations hit `/v1/stores/by-current-user` (full StoreDto per store, N+1 payment reads) just to list names. The user wants /me's storeList to be THE source → removes the request AND the latency of the heavy query.
3. **Roster**: no storeList offline → switcher/configurations offline show only the current store (the offline fallback). Needs: `OfflineRosterUserDto` + export fill + `roster-types.ts` + `toUserModel` mapping. Roster already refuses inactive-store exports (:99) and filters inactive users.
4. **Deactivation → logout of users**: today NO active kickout. A deactivated store's users keep working until their NEXT /me (404 → logout) — and the offline-first FE never calls /me on startup with cached session. Server-side there's NO per-store session registry — only per-jti MemoryCache blacklist set by GetMeQuery itself. **True "log out all users" requires either (a) accepting the passive /me verdict as the logout mechanism, or (b) building a store-level token invalidation (e.g., blacklist by store claim — requires infrastructure that does not exist today; MemoryCache is per-node so even that is imperfect behind a load balancer).**
5. **Last-active-store deactivation**: `HasActiveStore` (AuthenticationService) already blocks LOGIN when an owner has NO active store (any-store check) — but a logged-in owner deactivating their LAST active store via /me-validated session: their own /me next call 404s (StoreErrors.Inactive) → logout. Other users of that store: same passive path. The edge case "deactivate the last one" therefore behaves the same as any deactivation under mechanism (a); under (b) it needs explicit handling.
6. **New-store freshness**: creating a store does NOT refresh the session → /me's storeList (and the FE cached user) stale until re-login or any /me. Options: refresh session after create (my-stores already has the pattern in handlePlanActivate via `getUserByToken()`), or accept staleness. Note: GetMeQuery recomputes storeList on EVERY /me call, so any session refresh picks it up.
7. **warehouse-movements name resolution** relies on storeList containing INACTIVE stores too (a sale_out movement history referencing a deactivated store still needs its name). **Decision needed**: storeList keeps returning ALL stores (with isActive) and the SWITCHER filters, vs. /me returning actives only. The QA E2E (AuthMeStoreListTests) pins ALL-stores semantics for {Id, Name} — adding isActive is additive; changing to actives-only would need those tests changed (UNTOUCHABLE) → **storeList must keep returning ALL stores + isActive field; consumers filter**.
8. **Auth redirect invariant** (docs/contracts/authenticated-session-redirect.md): a validly-authenticated user must never land on /login except by verdict (expiry, 401/404 from /me, logout). The deactivation-logout work must flow through the /me verdict path — no new bounce paths. Offline-first hydration is deliberate; do not add startup /me calls.
9. **MultiStores gate is per-selected-store** (`user.storeModuleIds`): after switching INTO a store without MultiStores, the switcher disappears (user loses the ability to switch away from FE UI until re-login into a store that has it — accepted existing behavior; note for spec).
10. **Roster switcher offline**: switching offline is impossible today (setMyStore needs network). Offline the select shows current store only (existing fallback). Roster storeList serves name resolution + display, not offline switching.

## 3. Risks

- **MemoryCache blacklist is per-node** — any store-level "logout all users" built on it fails behind a load balancer; single-node deployment today but the design must note it.
- **Refresh-session-after-create/deactivate** touches auth-store hydration paths (delicate; keep it as `getUserByToken()` which is already used post-plan-change).
- `StoreSummaryDto` is a positional record — ALL construction sites must add the field (GetMeQuery + any test fixtures).
- FE switcher/configurations unit tests mock `listStores` — moving to user.storeList requires rewriting those mocks (allowed: vitest, not E2E).
- The `e2e/configurations.spec.ts` pins the select exists — moving its DATA source to /me should keep the DOM the same (list content depends on seeded stores).

## 4. Open questions for the proposal phase

1. **Deactivation logout mechanism**: passive /me-verdict (zero new infra, matches offline-first contract) vs. active store-level token blacklisting (new infra, per-node caveat). Proposal must pick one and justify.
2. **Does the deactivating owner get special handling?** Deactivating the store you are ON: confirm-dialog copy already warns; after deactivation the owner's own /me 404s → logout on next session refresh. Acceptable? Or should the FE proactively logout/switch?
3. **Roster storeList shape**: same `StoreSummary[]` (id, name, isActive) per roster user — for OWNERAdmin users only? (Roster users are store-scoped; owner row in roster: check ExportOfflineRosterQuery builds roles for the owner user — it does include the owner if they have a StoreUser row? VERIFY during spec: how owners appear in rosters.)
4. **Session refresh after create**: adopt `getUserByToken()` after createStore (my-stores) so the switcher sees the new store immediately? (Pattern exists post-plan-change.)
5. **by-current-user endpoint**: keep as-is (other consumers: Angular store-list, admin store cards) — only the switcher/configurations stop using it. Confirm no other FE React consumer relies on switcher's fetch.

## 5. Constraint reminders for later phases

- E2E (backend xUnit + Playwright) UNTOUCHABLE — new coverage only in NEW files.
- Backend test work: only ADD new tests; production-code changes to this feature's endpoints are authorized by the user's feature request (DTO field + roster + logout semantics), but any edit to EXISTING E2E needs explicit approval.
- Auth redirect invariant (docs/contracts/authenticated-session-redirect.md) governs every session-touching change.
- STRICT TDD mode active (openspec/config.yaml).
- Angular parity: none exists for this feature (React-only seamless-store-switch lineage).
