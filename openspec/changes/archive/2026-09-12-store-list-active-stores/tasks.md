# Tasks: store-list-active-stores

**Change**: store-list-active-stores · **Phase**: Tasks · **Date**: 2026-09-11
**Mode**: strict TDD (RED → GREEN → TRIANGULATE → REFACTOR). Every task lists
its files, its test, and its evidence.

> Rule reminders: existing E2E (backend xUnit + Playwright + e2e/support) is
> UNTOUCHABLE — new coverage only in NEW files. FE vitest files ARE editable.
> Backend production code changes for THIS feature are authorized by the user's
> request (DTO + roster + refresh semantics).

---

## 1. Backend — StoreSummaryDto.isActive + /me fill

- [x] 1.1 RED: create `backend/src/Application.Tests/Authentication/Queries/GetMe/GetMeStoreListIsActiveTests.cs` — owner with one active + one inactive store: expects `StoreList` entries with `IsActive` true/false respectively; non-owner expects empty list (mock `IStoreRepository.GetAllStoresByOwnerUserIdAsync`). Run → compile error (no IsActive on DTO) or failing assert = RED.
- [x] 1.2 GREEN: `backend/src/Application/Dtos/Authentication/StoreSummaryDto.cs` — positional record gains `bool IsActive`; update fill at `GetMeQuery.cs:~117` → `new StoreSummaryDto(s.Id, s.Name, s.IsActive)`. Run task 1.1 tests → pass.
- [x] 1.3 TRIANGULATE: add case — ALL stores inactive (owner still gets the list, flags false); case — owner with single store (flag matches). All pass.

  Evidence: 4/4 passed (`dotnet test --filter GetMeStoreListIsActive`, EF InMemory + real repos per established pattern). Solution build 0 errors.

## 2. Backend — Roster storeList

- [x] 2.1 RED: create `backend/src/Application.Tests/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterStoreListTests.cs` (match folder/style of existing roster tests; find them at apply time) — roster export for a store whose owner also owns an active second store + an inactive third: owner row `StoreList` = 3 entries with correct flags; store-user row `StoreList` = empty; expects ONE call to `GetAllStoresByOwnerUserIdAsync` per export (no N+1).
- [x] 2.2 GREEN: `OfflineRosterUserDto` gains `List<StoreSummaryDto> StoreList { get; set; } = new();` (file where the DTO lives — `Application/Dtos/...`; locate at apply). `ExportOfflineRosterQuery`: compute owner store list once (`ownerUserId` → map to StoreSummaryDto with IsActive), assign to each roster user DTO with `isOwnerAdmin`, others empty.
- [x] 2.3 TRIANGULATE: roster where the owner ALSO exists as a real StoreUser row (no synthetic duplication) — still exactly one owner-list fill; a StoreUser-who-is-OwnerAdmin gets the list (parity with /me).

  Evidence: actual file landed at `Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterStoreListTests.cs` (suite's real folder). 1/1 new test + 10/10 existing roster tests pass. Fill: one `GetOwnerIncludingUserByIdAsync` + one `GetAllStoresByOwnerUserIdAsync(ownerUser.Id)` per export; Verify Times.Once. Solution build 0 errors.

## 3. Backend — E2E (NEW files only)

- [x] 3.1 Add `IsActive` to `StoreSummaryData` in `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` (additive; existing tests unaffected). Also `RosterUserData.StoreList` for the roster assertions.
- [x] 3.2 NEW `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeStoreListIsActiveTests.cs`: seed owner + active store A + inactive store B; login; `GET /v1/auth/me` → `storeList` contains A (isActive true) + B (isActive false). Sibling style of `AuthMeStoreListTests.cs` (untouchable — read only).
- [x] 3.3 NEW roster E2E (same NEW file, `Auth/AuthMeStoreListIsActiveTests.cs`): export roster for the seeded store → owner row `storeList` has both stores with flags; clerk store-user row empty. Seed needed: Management module on the store (UsersAdmin gate) + clerk StoreUser row.
- [x] 3.4 Run FULL backend circuit: `dotnet build backend/src/SMCA.sln` → 0 errors; `dotnet test` Application.Tests → all pass; E2E project → all pass (incl. existing 492 + new).

  Partial evidence (3.2/3.3): 3/3 new tests pass; regression filter `AuthMeStoreList|ExportOfflineRoster` 37/37 pass. Full circuit deferred to Section 7 as planned.

## 4. Frontend — domain + roster plumbing

- [x] 4.1 RED: `frontend-react/packages/domain/src/models/auth.ts` `StoreSummary` gains `isActive: boolean`. Vitest: update `offline-auth-service.test.ts` — roster user WITH `storeList: [{id,name,isActive}]` → `toUserModel().storeList` maps it; roster user WITHOUT field → `storeList` undefined. Run → fail (field not mapped).
  Actual: typed `isActive?: boolean` (optional — absent on cached sessions from pre-field backends; undefined = "do not select, fall back to current store"; same shape /me and roster consume). NEW test file `__tests__/offline-auth-service.store-list.test.ts` (3 tests) instead of editing the existing suite's fixtures.
- [x] 4.2 GREEN: `app/shared/lib/offline/roster-types.ts` `OfflineRosterUser` gains optional `storeList?: Array<{ id: string; name: string; isActive: boolean }>`; `offline-auth-service.ts` `toUserModel` maps `storeList: user.storeList`. Tests pass.
  Actual: `roster-types.ts` gained `storeList?: RosterStoreSummary[]` + local `RosterStoreSummary` type (type-only module, no runtime import); `toUserModel` maps explicitly `id/name/isActive`. 3/3 pass.
- [x] 4.3 Check roster-serializer bundle-shape validation tolerates the new optional field (whitelist/unknown-field behavior — add a passing case in its test file if the validator enumerates fields).
  Actual: serializer is JSON.parse + cast (no field enumeration) — no whitelist to extend. Offline suite full run: 13 files / 124 tests GREEN (incl. serializer round-trips and roster-types validity).

## 5. Frontend — selects swap data source

- [x] 5.1 RED: rewrite `store-switcher.test.tsx` — user fixture `storeList: [active A, inactive B, active C]` → popup renders A+C only (not B); NO `listStores` mock call expected (assert not called); current-store name still from roles. Run → fail (component still fetches).
  Evidence: 11/14 failed after rewrite (the 3 passing were the gates); fixture carries A/B active + C inactive (spec: only active offered).
- [x] 5.2 GREEN: `store-switcher.tsx` — remove fetch branch + `isLoading`/`loadError` states; derive `activeStores` from `user.storeList` filter `isActive`; keep disabled-current + switchStore + gates. Tests pass. 14/14.
- [x] 5.3 EDGE (from design D3): current store with `isActive === false` still offered as an option (select never strands the user). Test: storeList [current inactive, other active] → both render, current marked/selected. Included: `storeList: undefined` → current-only fallback (offline legacy bundle); legacy entries without `isActive` → non-selectable (current-only); `[]` + current → current offered, never the empty message.
- [x] 5.4 RED: rewrite `configurations.test.tsx` — same assertions as 5.1 for the select; plus offline fallback: `storeList: undefined` → select shows exactly the current store. Run → fail.
  Evidence: 11/14 failed (fetch-based component, mock no longer resolved).
- [x] 5.5 GREEN: `configurations.tsx` — remove useEffect fetch + stores/isLoading/loadError; derive actives; keep fallback + handleStoreChange + gates. Tests pass. 14/14.
- [x] 5.6 TRIANGULATE: `storeList` present but ALL inactive + current store not in list → select renders current store alone (fallback semantics on "no selectable other"); empty `storeList: []` same.
  Covered by: always-offer-current filter (`store.id === selectedStoreId || isActive === true`) — empty/`[]`/all-inactive lists fall back to exactly the current store (both components' tests pin it). One test adjusted during GREEN: `[]` + existing current store now asserts the current store is offered (design D3 never-strand), NOT the empty message — the empty message remains only for a session without a resolvable current store.

## 6. Frontend — session refresh moments (my-stores)

- [x] 6.1 RED: `my-stores` test (find existing vitest file or create `__tests__/my-stores.test.tsx` if none): after `createStore` success → `getUserByToken` called once; after `setStoreActivation` success → called once. Run → fail.
  Evidence: added a NEW describe block (`session refresh after store mutations`) to the EXISTING `my-stores.test.tsx` (existing tests untouched): 3/4 new tests failed pre-GREEN (create→refresh, deactivate→refresh, rejection→logout) — the 4th (network-failure non-blocking) passed vacuously; RED was confirmed by the 3.
- [x] 6.2 GREEN: `my-stores.tsx` `handleCreateStore` + `handleEditSave` (activation branch): `try { await getUserByToken(); } catch { /* non-critical */ }` after API success, before `load()` — copy the `handlePlanActivate` pattern. IMPORTANT (design D4): a `SessionRejectedError` from refresh must still logout — verify the rejection path (thrown vs null-return) at implementation and assert the logout is NOT swallowed; if `getUserByToken` returns null on rejection (logout already ran), nothing extra is needed.
  Verified at implementation: `auth-store.getUserByToken`'s catch runs `logout()` ITSELF on `isSessionRejection(err)` and returns null — the rejection never reaches the page's `catch` as a throw, so the verdict is structurally un-swallowable. The refresh sits after `setStoreActivation`/`createStore` success, before `load()`, in its own best-effort try/catch (network failure never surfaces as a save error — pinned by test 4). 23/23.
- [x] 6.3 Test: deactivating the CURRENT store → refresh rejects → `auth-store` logout happened (mock `getUserByToken` to reject with `SessionRejectedError` or drive the real path per 6.2's finding) + confirm-dialog still shown BEFORE the deactivation call fires.
  Per 6.2's finding, the real path is the null-return contract: `mockGetUserByToken.mockResolvedValue(null)` (logout already ran inside auth-store) + assert the refresh still fired. The refresh-after-deactivation test keeps the confirm-first ordering (existing `R-1` tests already pin confirm-before-call; the new deactivation test relies on `mockConfirmDialog.mockResolvedValue(true)` and asserts `setStoreActivation('s1', false)` then refresh then `load()`).

## 7. Verification circuit

- [x] 7.1 Backend full: build 0 errors; Application.Tests 100%; E2E (real PostgreSQL) 100% incl. NEW files.
  Evidence: build 0 errors; Application.Tests 438/438; E2E 499/499 (baseline 492 + 3 new + 4 roster-adjacent pre-existing).
- [x] 7.2 Frontend full: `pnpm typecheck` 5/5, `pnpm lint` 0 errors, `pnpm test` (vitest) 100%.
  Evidence: typecheck 5/5 tasks; lint 4/4 tasks (0 warnings allowed); vitest domain 13 files + web-common 11 tests + web-store-pos 240 files / 3440 tests (baseline 3430 → +10).
- [x] 7.3 Playwright `e2e/configurations.spec.ts` untouched and STILL PASSING is a bonus check if runtime available (http-e2e profile + backend running) — NOT a gate (user-approved residual: FE Playwright runtime deferred).
  Confirmed untouched: `git status --porcelain frontend-react/e2e/` empty. Runtime check deferred per user decision.
- [x] 7.4 Update this file: check every box, add evidence notes (commands + counts) per task where the task says so. Done.

## 8. Completion gates

- [x] 8.1 All boxes checked with evidence.
- [x] 8.2 `verify-report.md` written (engine envelope: requirements/scenarios counts from spec.md — 6 ADDED requirements, 8 scenarios + 2 MODIFIED requirements, 5 scenarios — count exactly at verify time).
  Actual count at verify time: 8 ADDED requirements / 16 scenarios (capability `auth`, canonical `active-store-selection`) + 2 MODIFIED requirements / 4 scenarios (capability `offline-auth`) = 10 requirements / 20 scenarios. verify-report.md reflects the actual counts.
- [x] 8.3 No existing E2E file modified (git diff check on `backend/src/SMCA.WebApi.E2ETests/` — only NEW files + TestDtos additive field; `frontend-react/e2e/` untouched).
  Evidence: `git diff --stat` on the E2E project shows only `TestDtos.cs | 2 ++` (two additive properties); FE e2e dir untouched.
- [x] 8.4 No changes to: `switchToStore`, `by-current-user` handler, auth-store hydration, unlock gate.
  Evidence: `git status --porcelain` on `switch-store.ts` / `auth-store.ts` empty; backend diff touches only the 5 listed files (none is the by-current-user handler).
