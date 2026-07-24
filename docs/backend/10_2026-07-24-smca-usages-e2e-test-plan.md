# 10 — SMCA.WebApi Usages E2E — Test Plan

**Date:** 2026-07-24
**Scope:** the 3 endpoints of `UsagesController` (`api/v1/usages`), **exhaustive** — every reachable
behavior, edge, error and auth path is **implemented as a test**:
- `POST store-daily-usage` → full behavior (per-`(user, store)` day dedup incl. the intra-request dedup
  gap, the client-sync `Saved` flag, the `400` store guard, the `500` date/`ActiveDays` paths, inactive-store
  acceptance, the `405` verb surface) + the `ProfileAdmin` grant paths (StoreUser and OwnerAdmin branches)
  + auth (401/403, malformed + inactive token).
- `GET stores-last-week` / `GET stores-last-month` → success shape + the `7`/`30` padding contract, the
  window/boundary/inactive-store count filters, `ActiveStoreCount`, `405` verb, and the full per-window
  auth matrix (401/403).
**Depends on / reuses:** the `04`/`05`/`09` harness (`AppTestFactory`, `WebAppFixture`,
`[Collection("e2e")]`, `ApiResponse<T>`, `DbTestHelpers`, `AuthzSeed`, `StoreSeed`) against real Postgres
`smca_test`. Unlike `08`/`09`, **the harness already exists as code** on disk
(`SMCA.WebApi.E2ETests/Infrastructure/`); these tests slot into it directly.

---

## 1. Self-contained by directive

This plan carries its own auth matrix inline for all 3 endpoints. If a seed/auth helper is not on disk,
duplicate it here — do not cross-reference another plan for coverage. These are e2e tests; duplication is
acceptable.

**Migration note:** the current partial coverage lives in `Auth/UsagesSmokeTests.cs` (two tests: POST
`no-token→401` and POST `super-admin→200`). This plan **retires that file** and migrates both tests into
the new `Usages/` folder (`StoreDailyUsageTests` / `StoreDailyUsageAuthTests`), so Usages has a single home
matching the `08`/`09` per-controller-folder layout.

## 2. Verified contract facts (code-cited — bake into assertions)

- **Class filter** `[HasPermission(StoreRoleFeatures.ProfileAdmin)]` on the controller
  (`UsagesController.cs:14`). `ProfileAdmin = [HasRoles(OwnerAdmin, StoreUser, ReSeller)]
  [HasFeature(Profile=70)] [HasModule(Management=7)]` (`StoreRoleFeatures.cs:178-181`). SuperAdmin bypasses
  the filter.
- **`POST store-daily-usage`** (`UsagesController.cs:17-22`) → `UpdateStoreDailyUsageCommand`
  (`ActiveDays: IEnumerable<DailyUsageRequest{ Day: string, Saved: bool }>`). Handler
  (`UpdateStoreDailyUsageCommand.cs:44-65`):
  - `userId = httpContext.UserExternalId`; if `userRepository.GetByIdAsync(userId) == null` →
    `ApiException("UserNotFound", BadRequest)` → **400** (`:47-48`).
  - `storeId = httpContext.StoreId` (the `SelectedStoreId` claim); if
    `storeRepository.GetByIdAsync(storeId) == null` → `ApiException("StoreNotFound", BadRequest)` → **400**
    (`:50-52`).
  - **Dedup:** fetches existing `StoreUsage` days for `(userId, storeId)`, parses `ActiveDays` to UTC via
    `DateTime.Parse`, filters out days already present, inserts one `StoreUsage.Create(...)` per remaining
    day (`:54-63`).
  - Returns `ResponseResult<bool>` where `bool = SaveChangesAsync() > 0` (`:64`) — **`true` only when at
    least one new row was inserted**; `false` when every requested day already existed or `ActiveDays` is
    empty.
- **`GET stores-last-week`** (`UsagesController.cs:24-30`) → `GetStoreLastUsagesQuery(7)`; method-level
  `[HasPermission(StoreRoleFeatures.SuperAdmin)]` (widens the class `ProfileAdmin` to require SuperAdmin).
- **`GET stores-last-month`** (`UsagesController.cs:32-38`) → `GetStoreLastUsagesQuery(30)`; same
  method-level `SuperAdmin`.
- **Query handler** (`GetStoreLastUsagesQuery.cs:35-52`): redundant `if (!IsSuperAdmin) throw
  ApiException(400)` (`:37-38`) — **unreachable** (filter already requires SuperAdmin; see §5). Groups
  `StoreUsage` rows after `UtcNow.Date - LastDays` by `Day`, ordered ascending, into a per-day count list;
  **left-pads with `0` until `Count == LastDays`** (`:46-49`). Returns
  `StoreUsagesDto(StoreUsagesCountDays: IList<int>, ActiveStoreCount: int)` where `ActiveStoreCount =
  storeRepository.GetActiveStoreCountAsync()` (`:50`).
- **Failures are thrown → real HTTP status** via `ErrorHandlerMiddleware`
  (`ErrorHandlerMiddleware.cs:40-64`): `ApiException` → its `StatusCode` (400); `KeyNotFoundException` →
  404; **any other unhandled exception → 500** (`App.Unexpected`). No token → **401** (auth middleware).
  Authenticated but filter-rejected → **403** (`HasPermissionAttribute`).

## 3. Behavior to PIN as-is (like activate-500 in `06`, activate-not-idempotent in `09`)

- **POST return is not idempotent (dedup).** 1st POST of a new day → `SaveChanges>0` → `200 { Data:true }`
  + one inserted `StoreUsage`. 2nd POST of the same day → all days already exist → `SaveChanges==0` →
  `200 { Data:false }`, no new row. Pin both; update if the contract is later made idempotent.
- **Empty `ActiveDays` → `200 { Data:false }`.** No days to insert → `SaveChanges==0`. Pin.
- **Malformed `Day` string → `500` (`App.Unexpected`).** `DateTime.Parse` throws `FormatException`, which
  is unhandled → falls through `ErrorHandlerMiddleware` `default` → **500**. This is arguably a missing
  input validation (should be a `400`); **pin as-is** and flag as a production-review finding (§5). Do not
  change production code in this task.
- **`GET` count array is left-padded to the window length.** `stores-last-week` →
  `StoreUsagesCountDays.Count == 7`; `stores-last-month` → `== 30`, regardless of how many days actually
  have usage. Pin the length contract.

## 4. Endpoints → test classes

New folder `SMCA.WebApi.E2ETests/Usages/`. `Auth/UsagesSmokeTests.cs` is retired (its 2 tests migrate below).

| # | Endpoint | Classes |
|---|----------|---------|
| 1 | `POST store-daily-usage` | `StoreDailyUsageTests` + `StoreDailyUsageAuthTests` |
| 2 | `GET stores-last-week` + `GET stores-last-month` | `StoreLastUsagesTests` + `StoreLastUsagesAuthTests` |

### `StoreDailyUsageTests`
- `Post_new_day_as_super_admin_returns_200_true_and_inserts_row` — **(migrated from
  `UsagesSmokeTests.Usages_super_admin_with_store_returns_200`, extended)**: seed SuperAdmin, seed+select
  an approved store (`PUT /stores`), POST a fresh day; assert `200` + `Succeeded` + `Data==true`; assert
  exactly one `StoreUsage` row exists for `(userId, storeId, day)`. Cleanup: `RemoveRange` StoreUsage by
  `StoreId`, then store + user in `finally`.
- `Post_duplicate_day_returns_200_false_no_insert` **(PIN)** — POST the same day twice in one test; assert
  1st `Data==true`, 2nd `Data==false`; assert still exactly **one** `StoreUsage` row (dedup). Same cleanup.
- `Post_empty_activeDays_returns_200_false` **(PIN)** — POST `{ ActiveDays: [] }`; assert `200` +
  `Data==false`; assert no `StoreUsage` rows created.
- `Post_mixed_new_and_existing_days_inserts_only_new` — pre-insert day D1 directly; POST `[D1, D2]`; assert
  `200` + `Data==true`; assert `StoreUsage` rows for `(D1, D2)` are exactly 2 (D1 not duplicated).
- `Post_as_profile_admin_actor_returns_200` — `AuthzSeed.SeedStoreUserAsync(factory, FeatureType.Profile
  = 70)` (StoreUser + Profile feature grant + active Management module, `SelectedStoreId` set); POST a fresh
  day; assert `200` + `Data==true`. Proves the non-SuperAdmin grant path through the `ProfileAdmin` filter.
  Cleanup via `AuthzSeed.CleanupStoreGraphAsync` (+ StoreUsage `RemoveRange`).
- `Post_without_selected_store_returns_400` — seed SuperAdmin, **do not** select a store (empty
  `StoreId` claim → `GetByIdAsync(empty)` null); POST; assert `400` (`StoreNotFound` guard). Reachable
  **only** because SuperAdmin bypasses the filter (`HasPermissionAttribute.cs:47`) and still reaches the
  handler's store check.
- `Post_malformed_date_returns_500` **(PIN)** — POST `{ ActiveDays: [{ Day: "not-a-date", Saved: true }] }`
  as SuperAdmin with a selected store; assert `500` (`App.Unexpected`). Pins the missing date validation.
- `Post_multiple_new_days_inserts_all` **(from 10c A1)** — POST 3 new days → `Data==true`, 3 rows.
- `Post_same_day_two_users_inserts_both` **(from 10c A2)** — dedup key is `(userId, storeId)`; two admins,
  same store+day → 2 rows.
- `Post_same_day_two_stores_inserts_both` **(from 10c A3)** — same user+day across two selected stores → 2 rows.
- `Post_as_owner_admin_profile_returns_200` **(from 10c A4)** — `AuthzSeed.SeedOwnerAdminAsync(withManagementModule:
  true)`; exercises the `IsOwnerAdmin` filter branch (Profile allowed via the active Management module).
- `Post_duplicate_days_within_request_inserts_all` **(from 10c A5 · BUG-REVEAL)** — `[D1,D1,D2]` → **3 rows**
  (dedup is only vs the DB, not within the request).
- `Post_saved_false_still_inserts` **(from 10c A6)** — `Saved:false` still inserts. **Correct behavior:**
  `Saved` is a client-side sync flag (the client sends only `saved:false` days and flips them to `true`
  after a 200 — `store-usage-tracker.service.ts:73,89-90`); the backend rightly ignores it. Not a bug.
- `Post_day_with_time_component_is_distinct_from_midnight` **(from 10c A7)** — `"…T15:30:00"` and `"…"` are 2 rows.
- `Post_future_day_is_accepted` **(from 10c A8)** — far-future day → `200 Data==true` (no range validation).
- `Post_empty_day_string_returns_500` **(from 10c A9 · BUG-REVEAL)** — `Day:""` → `DateTime.Parse` throws → `500`.
- `Post_missing_activeDays_returns_500` **(from 10c A10 · BUG-REVEAL)** — `{}` body → null `ActiveDays` → NRE → `500`.
- `Post_against_inactive_store_returns_200` **(from 10c A11 · FINDING)** — deactivate the selected store; POST
  still `200` (no `IsActive` filter on the store lookup).
- `Get_verb_on_store_daily_usage_returns_405` **(from 10c A12)** · `Put_verb_on_store_daily_usage_returns_405`
  **(from 10c A13)** — POST-only route.
- `Post_malformed_json_returns_400` **(from 10c A14 · VERIFY&PIN)** — malformed JSON body → model-binding `400`.
- `Post_persists_non_null_context_fields` **(from 10c A16)** — asserts the inserted row's `IpAddress`/`GfDevice`/
  `GfDeviceId`/`GfSessionId` are non-null (handler wires them from httpContext, `""` when absent).

### `StoreDailyUsageAuthTests`
- `Post_no_token_returns_401` — **(migrated from
  `UsagesSmokeTests.Usages_without_token_returns_401`)**.
- `Post_as_actor_without_profile_grant_returns_403` — `AuthzSeed.SeedStoreUserAsync(factory,
  grantedFeatureId: null)` (StoreUser, Management module active, **no** Profile feature) → fails the
  `HasFeature(Profile)` leg → `403`. Never reaches the handler. Cleanup the store graph in `finally`.
- `Post_malformed_token_returns_401` — a garbage/expired bearer is rejected by auth middleware before the
  class filter (distinct from the no-token case).
- `Post_as_inactive_user_is_rejected` **(from 10c A15 · VERIFY&PIN)** — `SeedInactiveUserAsync`; pin the
  status the pipeline returns (`401`/`404`, or the handler's `400` if the inactive-SuperAdmin bypass reaches it).

### `StoreLastUsagesTests`
- `LastWeek_as_super_admin_returns_200_array_length_7` **(PIN)** — SuperAdmin; `GET stores-last-week`;
  assert `200` + `Succeeded` + `StoreUsagesCountDays.Count == 7`.
- `LastMonth_as_super_admin_returns_200_array_length_30` **(PIN)** — same for `stores-last-month`, length
  `== 30`.
- `LastWeek_counts_reflect_seeded_usage_days` — seed a throwaway store + `StoreUsage` rows on 3 distinct
  days inside the 7-day window; assert the buckets sum `>= 3` and `ActiveStoreCount >= 1`.
- `LastMonth_counts_reflect_seeded_usage_days` **(from 10c B1)** — same for the 30-day window.
- `LastWeek_counts_are_non_negative` **(from 10c B2 · VERIFY&PIN)** — every bucket `>= 0` (shared DB blocks an
  exact all-zero assertion).
- `LastWeek_excludes_out_of_window_and_inactive_store_usage` **(from 10c B3)** — delta assertion (serial
  `[Collection("e2e")]`): out-of-window usage and inactive-store usage do **not** change the sum; an in-window
  active usage adds exactly `+1`.
- `LastWeek_includes_boundary_day` **(from 10c B4)** — usage on `today-7` adds `+1` (`>=` boundary).
- `LastWeek_activeStoreCount_counts_active_only` **(from 10c B5)** — seed 2 active stores → `+2`; deactivate 1
  → `+1`.
- `Post_verb_on_stores_last_week_returns_405` **(from 10c B6)** · `Post_verb_on_stores_last_month_returns_405`
  **(from 10c B7)** — GET-only routes.

### `StoreLastUsagesAuthTests`
Full 403 matrix on **both** windows.
- `LastWeek_no_token_returns_401` · `LastMonth_no_token_returns_401`
- `LastWeek_malformed_token_returns_401` · `LastMonth_malformed_token_returns_401` **(from 10c B11)**
- `LastWeek_as_owner_admin_returns_403` · `LastWeek_as_store_user_returns_403` · `LastWeek_as_reseller_returns_403`
- `LastMonth_as_owner_admin_returns_403` · `LastMonth_as_store_user_returns_403` · `LastMonth_as_reseller_returns_403`
  **(from 10c B8/B9/B10)**
- `LastWeek_as_inactive_super_admin_is_rejected_or_pinned` **(from 10c B12 · VERIFY&PIN)** — pin `401`/`404`/`200`.

## 5. Coverage notes

- **Unreachable handler guards (documented, not asserted).** Two guards no e2e request can reach (the
  `HasPermission` filters reject first): GET `IsSuperAdmin` re-check (`GetStoreLastUsagesQuery.cs:37-38`) and
  POST `UserNotFound` re-check (`UpdateStoreDailyUsageCommand.cs:47-48` — a missing user gets no `SuperAdmin`
  claim in `ClaimsTransformerService.cs:32-46`, so the `ProfileAdmin` filter forbids → `403` first). The
  reachable inactive-user path is pinned by `Post_as_inactive_user_is_rejected`; the `StoreNotFound` guard is
  reachable via the SuperAdmin bypass (`Post_without_selected_store_returns_400`). Handler unit tests for the
  two truly-unreachable gates are out of scope here.
- **Latent robustness paths — asserted as pins (behavior the real client never triggers).** The Angular/React
  clients guard duplicates (`wasUsedToday`) and always send valid `YYYY-MM-DD` dates, so these are direct-call
  robustness surfaces, not user-facing bugs:
  - Intra-request dedup gap → `Post_duplicate_days_within_request_inserts_all` (A5).
  - Missing date/`ActiveDays` validation → `500` → `Post_malformed_date_returns_500`,
    `Post_empty_day_string_returns_500`, `Post_missing_activeDays_returns_500` (A9/A10).
  - Usage accepted against an inactive store → `Post_against_inactive_store_returns_200` (A11).
- **`Saved` is correct, not a bug** — see `Post_saved_false_still_inserts` (client-side sync flag).
- **Double `[HasPermission]` on the GETs** (class `ProfileAdmin` + method `SuperAdmin`) → asserted by the
  full `403` matrix in `StoreLastUsagesAuthTests` (every non-SuperAdmin actor, both windows).

## 6. Seeding needs (reuse `04`/`05`/`09`; duplicate locally if absent)

- **SuperAdmin:** `DbTestHelpers.SeedSuperAdminAsync` + `DbTestHelpers.AuthedClient`.
- **Selected store:** `StoreSeed.SeedStoreAsync(approved: true)` then `PUT /stores { StoreId }` to set
  `SelectedStoreId` (the pattern already in `UsagesSmokeTests`).
- **ProfileAdmin actor (POST 200 non-SA path):** `AuthzSeed.SeedStoreUserAsync(factory, 70)` — StoreUser +
  `StoreRoleFeature(Profile=70)` + active Management module + `SelectedStoreId`. Cleanup
  `AuthzSeed.CleanupStoreGraphAsync`.
- **No-grant actor (POST 403):** `AuthzSeed.SeedStoreUserAsync(factory, grantedFeatureId: null)`.
- **Role actors (GET 403):** `DbTestHelpers.SeedUserWithRoleAsync((int)RoleType.{OwnerAdmin|StoreUser|
  ReSeller})`.
- **`StoreUsage` rows:** insert directly via `Factory.Services.CreateScope()` + `ApplicationDbContext`
  using `StoreUsage.Create(storeId, userId, day, ip, device, deviceId, sessionId)` (same entity the handler
  writes). Always clean up with `db.Set<StoreUsage>().IgnoreQueryFilters().Where(u => u.StoreId ==
  storeId)` `RemoveRange` in `finally` **before** deleting the store (FK), exactly as `UsagesSmokeTests`
  already does.

## 7. Out of scope

- `ReSellers` controller → the final plan (deliberately **last**).
- The generic role×feature×scope matrix over Stores (the `05` cross-cutting engine). This plan asserts only
  the per-endpoint auth of the 3 Usages endpoints.
- Sales / Inventory / Expenses / Credits / Reports / Statistics — all localStorage
  (`USE_ONLINE_SERVICE=false`), zero backend calls (master index §9.5).
