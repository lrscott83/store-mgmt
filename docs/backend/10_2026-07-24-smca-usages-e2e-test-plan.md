# 10 — SMCA.WebApi Usages E2E — Test Plan

**Date:** 2026-07-24
**Scope:** the 3 endpoints of `UsagesController` (`api/v1/usages`) with a **hybrid** depth (per master
index §9.5.3, Usages is "high-frequency, low-logic — at least a smoke/contract test"):
- `POST store-daily-usage` → **full** treatment (it carries real logic: per-`(user, store)` day dedup,
  two `400` guards, a `500` date-parse pin, and the `ProfileAdmin` grant path).
- `GET stores-last-week` / `GET stores-last-month` → **contract-level** (near-identical, `SuperAdmin`-only,
  low logic): success shape + the `7`/`30` padding contract + the per-endpoint auth (401/403).
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
  as SuperAdmin with a selected store; assert `500` (`App.Unexpected`). Documents the missing date
  validation (§5).

### `StoreDailyUsageAuthTests`
- `Post_no_token_returns_401` — **(migrated from
  `UsagesSmokeTests.Usages_without_token_returns_401`)**.
- `Post_as_actor_without_profile_grant_returns_403` — `AuthzSeed.SeedStoreUserAsync(factory,
  grantedFeatureId: null)` (StoreUser, Management module active, **no** Profile feature) → fails the
  `HasFeature(Profile)` leg → `403`. Never reaches the handler. Cleanup the store graph in `finally`.
- `Post_malformed_token_returns_401` — a garbage/expired bearer is rejected by auth middleware before the
  class filter (distinct from the no-token case).

### `StoreLastUsagesTests`
- `LastWeek_as_super_admin_returns_200_array_length_7` **(PIN)** — SuperAdmin; `GET stores-last-week`;
  assert `200` + `Succeeded` + `StoreUsagesCountDays.Count == 7`.
- `LastMonth_as_super_admin_returns_200_array_length_30` **(PIN)** — same for `stores-last-month`, length
  `== 30`.
- `LastWeek_counts_reflect_seeded_usage_days` — seed a throwaway store + `StoreUsage` rows on N distinct
  days inside the 7-day window; `GET stores-last-week`; assert the buckets for those days are non-zero and
  the returned `ActiveStoreCount` is `>=` the number of active stores seeded. Contract-level (one data test
  is enough given the low-logic classification). Cleanup seeded StoreUsage + store in `finally`.

### `StoreLastUsagesAuthTests`
Full matrix on `stores-last-week`; `stores-last-month` gets only a `401` smoke (auth is identical, no need
to duplicate the full matrix twice).
- `LastWeek_no_token_returns_401`
- `LastMonth_no_token_returns_401`
- `LastWeek_as_owner_admin_returns_403` — `DbTestHelpers.SeedUserWithRoleAsync((int)RoleType.OwnerAdmin)`.
- `LastWeek_as_store_user_returns_403` — `SeedUserWithRoleAsync((int)RoleType.StoreUser)`.
- `LastWeek_as_reseller_returns_403` — `SeedUserWithRoleAsync((int)RoleType.ReSeller)`.
- `LastWeek_malformed_token_returns_401` — garbage bearer rejected before the filter.

## 5. Findings — documented, NOT asserted (like `08` §6 / `09` §6)

- **Unreachable handler gate (dead code) — 2 spots.** No e2e test can trigger either (same situation as
  Features `09` §6):
  - **GET `IsSuperAdmin` re-check** — `GetStoreLastUsagesQuery` re-checks `if (!IsSuperAdmin) throw
    ApiException(400)` (`GetStoreLastUsagesQuery.cs:37-38`), but both GET endpoints are already
    `[HasPermission(SuperAdmin)]` at the method — no actor passes the filter yet fails the handler check.
  - **POST `UserNotFound` re-check** — `UpdateStoreDailyUsageCommand` throws `400` if
    `userRepository.GetByIdAsync(userId) == null` (`:47-48`), but this is **unreachable**: a missing user
    gets **no `SuperAdmin` claim** in `ClaimsTransformerService` (`ClaimsTransformerService.cs:32-46`, the
    `if (currentUser != null)` guard), so `IsSuperAdmin` is false and the class `ProfileAdmin` filter takes
    the non-SuperAdmin branch and returns `ForbidResult` → **403** before the handler runs
    (`HasPermissionAttribute.cs:47-68`). Any request that *does* reach the handler had a non-null user in
    the same DB the handler reads. Originally planned as a `Post_with_deleted_user_returns_400` test;
    **dropped** after verifying it yields `403`, not `400`.
  Pin observable behavior only. A `10b`-style handler unit test (mock `IHttpContextService` with
  `IsSuperAdmin=false` / a null user, assert `ApiException(BadRequest)`) is **available if parity is later
  wanted** but intentionally **not created here** — the hybrid/low-logic scope for Usages does not warrant
  it.
- **Missing date validation → 500.** `UpdateStoreDailyUsageCommand` parses `Day` with unguarded
  `DateTime.Parse`; a malformed string yields a `500` instead of a `400`. Pinned as-is by
  `Post_malformed_date_returns_500`; flagged for a separate production-code review (add a validator /
  `DateTime.TryParse` guard).
- **POST action method is misnamed `ApproveStoreAsync`** (`UsagesController.cs:19`) — a copy-paste leftover
  from `StoresController`; cosmetic, no behavior impact.
- **Double `[HasPermission]` on the GETs** (class `ProfileAdmin` + method `SuperAdmin`): the tests assert
  the observable `403` for every non-SuperAdmin actor, so the endpoints are covered regardless of how the
  two attributes compose internally.

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
