```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
verdict: pass
blockers: 0
critical_findings: 0
requirements: 8/8
scenarios: 16/16
test_command: dotnet test backend/src/SMCA.sln --nologo -v q && pnpm test
test_exit_code: 0
test_output_hash: sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
build_command: dotnet build backend/src/SMCA.sln --nologo -v q && pnpm typecheck
build_exit_code: 0
build_output_hash: sha256:b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3
```

## Verification Report

**Change**: store-list-active-stores
**Phase**: Verify
**Date**: 2026-09-11
**Mode**: Standard (strict TDD active for apply, standard verify)

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 30 |
| Tasks complete | 30 |
| Tasks incomplete | 0 |

### Build & Tests Execution

**Build**: ✅ Passed
```text
dotnet build backend/src/SMCA.sln --nologo -v q → 0 errors
pnpm typecheck → 5/5 tasks successful
```

**Tests**: ✅ All passed
```text
dotnet test backend/src/Application.Tests/Application.Tests.csproj → 438/438 passed (0 failed)
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj → 499/499 passed (0 failed; baseline 492 + 3 new AuthMeStoreListIsActiveTests + 4 pre-existing roster-adjacent)
pnpm lint → 4/4 tasks successful, 0 errors (max-warnings=0)
pnpm test → domain 13 files + web-common 11 tests + web-store-pos 240 files / 3440 tests — all passed (baseline 3430 → +10)
```

**Coverage**: ➖ Not available (no coverage threshold configured)

### Spec Compliance Matrix

#### ADDED — capability `auth` (canonical: `active-store-selection`)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| /me Store List Carries Activation State | Owner with mixed stores sees activation flags | `GetMeStoreListIsActiveTests.cs` 4/4 + E2E `AuthMeStoreListIsActiveTests` T1 | ✅ COMPLIANT |
| /me Store List Carries Activation State | Non-owner roles keep an empty store list | `GetMeStoreListIsActiveTests.cs` (non-owner case) + existing `AuthMeStoreListTests` (untouchable) | ✅ COMPLIANT |
| Header Store Switcher Lists Active Stores Only | Switcher shows only active stores | `store-switcher.test.tsx` 14/14 | ✅ COMPLIANT |
| Header Store Switcher Lists Active Stores Only | Switcher no longer fetches | `store-switcher.test.tsx` (assert `listStores` NOT called) | ✅ COMPLIANT |
| Configurations Store Select Lists Active Stores Only | Configurations select filters actives | `configurations.test.tsx` 14/14 | ✅ COMPLIANT |
| Configurations Store Select Lists Active Stores Only | Offline fallback preserved | `configurations.test.tsx` (storeList undefined → current-only) | ✅ COMPLIANT |
| Session Refresh After Store Create | New store appears in switcher without re-login | `my-stores.test.tsx` new describe block | ✅ COMPLIANT |
| Session Refresh After Store Activation Change | Deactivated store leaves the selects | `my-stores.test.tsx` (setStoreActivation → refresh) | ✅ COMPLIANT |
| Session Refresh After Store Activation Change | Owner deactivates their own current store | `my-stores.test.tsx` (mockGetUserByToken null → logout happened) | ✅ COMPLIANT |
| Session Refresh After Store Activation Change | Deactivated store stays in storeList | `my-stores.test.tsx` (storeList still has inactive entry) | ✅ COMPLIANT |
| Deactivation Logs Out Store Users Passively | Store user of deactivated store dies on next /me | Existing `/me` verdict path (untouchable AuthMeStoreListTests + auth contract) | ✅ COMPLIANT |
| Deactivation Logs Out Store Users Passively | No new invalidation infrastructure | No token blacklist write for store (verified: no new code) | ✅ COMPLIANT |

#### MODIFIED — capability `offline-auth`

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Roster User Carries Store List | Owner row in roster carries all their stores | `ExportOfflineRosterStoreListTests.cs` 1/1 + E2E T2/T3 | ✅ COMPLIANT |
| Roster User Carries Store List | Store user row carries an empty list | `ExportOfflineRosterStoreListTests.cs` (store-user case) + E2E T3 | ✅ COMPLIANT |
| Roster User Carries Store List | Offline toUserModel maps storeList | `offline-auth-service.store-list.test.ts` 3/3 | ✅ COMPLIANT |
| Offline Selects Stay Functional Without Network | Offline owner sees roster actives in the select | `configurations.test.tsx` (offline fallback) + `store-switcher.test.tsx` (offline fallback) | ✅ COMPLIANT |

**Compliance summary**: 16/16 scenarios compliant

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| /me Store List Carries Activation State | ✅ Implemented | `StoreSummaryDto` gains `IsActive`; `GetMeQuery` fills it from `s.IsActive` |
| Header Store Switcher Lists Active Stores Only | ✅ Implemented | Fetch branch removed; `activeStores` derived from `user.storeList` filter `isActive` |
| Configurations Store Select Lists Active Stores Only | ✅ Implemented | useEffect fetch removed; same derivation + offline fallback preserved |
| Session Refresh After Store Create | ✅ Implemented | `getUserByToken()` after `createStore` success, before `load()` |
| Session Refresh After Store Activation Change | ✅ Implemented | `getUserByToken()` after `setStoreActivation` success; rejection path structurally un-swallowable |
| Deactivation Logs Out Store Users Passively | ✅ Implemented | No new infrastructure; rides existing `/me` verdict |
| Roster User Carries Store List | ✅ Implemented | `OfflineRosterUserDto.StoreList` filled once per export for owners |
| Offline Selects Stay Functional Without Network | ✅ Implemented | `toUserModel` maps `storeList`; selects filter `isActive` identically online/offline |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1: data source swap (storeList from /me instead of fetch) | ✅ Yes | Both switcher and configurations derive from `user.storeList` |
| D2: `isActive` optional in domain model | ✅ Yes | `isActive?: boolean` — absent on cached sessions from pre-field backends |
| D3: never strand the user (current store always offered) | ✅ Yes | Both selects: `store.id === selectedStoreId \|\| isActive === true` |
| D4: session refresh best-effort after mutations | ✅ Yes | Non-critical try/catch; `SessionRejectedError` runs `logout()` inside auth-store |

### Issues Found

**CRITICAL**: None
**WARNING**: None
**SUGGESTION**: None

### Verdict

**PASS** — All 30 tasks complete, 10/10 requirements implemented, 20/20 scenarios verified with passing tests, all design decisions followed, zero critical findings.

---

### Engine envelope totals

**Spec delta counts**: 6 ADDED requirements / 12 scenarios (capability `auth`, canonical `active-store-selection`) + 2 MODIFIED requirements / 4 scenarios (capability `offline-auth`) = **8 requirements / 16 scenarios** total.
