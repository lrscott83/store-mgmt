# Exploration: get-user-by-id-endpoint-fixes

**Change**: `get-user-by-id-endpoint-fixes`
**Endpoint**: `GET /api/v1/users/{id}` — `UsersController.GetUserByIdAsync` (`backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs:45-51`)
**Date**: 2026-07-31
**Mode**: hybrid (engram + openspec)
**Method**: Every finding verified against real source; E2E test class executed locally (4/4 pass, real Postgres `smca_test`).

---

## Executive Summary

All 7 review findings are VERIFIED against source, with two important corrections:

1. **Finding 3 (400 vs 404) is MODIFIED**: the project's most recent precedent — `store-getbyid-fixes` (archived 2026-07-30) — **documents 400 via validator as the CORRECT contract** for nonexistent ids (`openspec/specs/get-store-by-id/spec.md` Error Responses table), and reserves 404 for the race window only. The older `users-e2e` spec (line 46) says "Non-existent id → 404" — a spec contradiction that must be resolved by decision. The middleware `KeyNotFoundException → 404` path is **dead code** (nothing in the backend throws it).
2. **Finding 1 (OwnerName null) empirically confirmed**: I ran `UsersGetByIdTests` (4/4 pass). AutoMapper null-safes the `src.StoreUser.Store.Owner.User.FullName` chain (no NRE/500) — OwnerName serializes `null`. The fix is the missing `.ThenInclude(o => o.User)`.

Two decisions gate the proposal: **which 404 contract** (envelope vs HTTP) and **whether to keep a validator existence check** (drives the double round-trip fix).

---

## Verified Findings (evidence from source)

| # | Severity | Verdict | Evidence |
|---|----------|---------|----------|
| 1 | HIGH | **VERIFIED** | `UserRepository.cs:68-75` — `GetUserByIdIncludingStoreAndRoles` inline chain line 72 ends at `.ThenInclude(s => s.Owner)` — **missing `.ThenInclude(o => o.User)`**. DRY helper `IncludeStoreAndRoles` (lines 56-61) line 59 HAS the full chain (extracted by `get-users-all-endpoint-fixes`). `UserProfile.cs:21` maps `OwnerName` from `src.StoreUser.Store.Owner.User.FullName`. `Infrastructure/DependencyInjection.cs:18-20` — NO `UseLazyLoadingProxies()`. Empirical: `Get_existing_user_returns_200` passes → AutoMapper null-safes → `ownerName: null`. Nuance: EF fixup may populate OwnerName in the self-lookup case (owner viewing own user) — not deterministic; fix is required. |
| 2 | MEDIUM | **VERIFIED** | `GetUserByIdQueryValidator.cs:20` `.MustAsync(UserExists)` → lines 24-27 call `_userRepository.GetByIdAsync(...)` → `GenericRepository.cs:82-85` = `FindAsync(id)` (full materialization, tracked). Handler `GetUserByIdQuery.cs:25` runs the second query. **Gotcha**: `IGenericRepository.ExistsAsync` (`GenericRepository.cs:87-91`) internally calls `GetByIdAsync` → same FindAsync — it is NOT lightweight. A real fix needs a dedicated `AnyAsync`-based check (mirror `IStoreRepository.ExistsAsync` from `store-getbyid-fixes`). |
| 3 | MEDIUM | **MODIFIED** | Validator failure → `ValidationBehaviour.cs:25` throws `ValidationException` → `ErrorHandlerMiddleware.cs:42-47` → `e.StatusCode` = `ApiException.cs:18` default `BadRequest` (400). Middleware `KeyNotFoundException → 404` (lines 54-58) is **dead code** (grep: zero `throw new KeyNotFoundException` in backend). E2E `UsersGetByIdTests.cs:29-39` asserts 400 and **passes**. **Contradiction**: `openspec/specs/users-e2e/spec.md` R2 line 46 documents "Non-existent id → 404" — test contradicts the spec. Precedent: `openspec/specs/get-store-by-id/spec.md` (updated 07-30, post-fix) documents nonexistent → **400** + 404 only for race (R8). See Decision D1. |
| 4 | MEDIUM | **VERIFIED** | `GetUserByIdQuery.cs:25-27` — `User user` non-nullable declaration, no null guard; `_mapper.Map<UserDto>(null)` → `ResponseResult.Success(null)` → HTTP 200 `data: null`. Reachable only via race (validator blocks nonexistent first) — narrow but real. Store precedent fix: `GetStoreByIdQuery.cs:30-31` `if (store is null) return ResponseResult.Failure<StoreDto>(StoreErrors.NotFound, 404)`. |
| 5 | MEDIUM | **VERIFIED** | `UsersController.cs:45-51` — only `[ProducesResponseType(200)]` (line 46). Sibling `GetAllUsersAsync` (lines 28-38) has 200/400/401/403 (lines 29-32) — the canonical pattern to mirror. Also `StoreUsersController.cs:27-28` same gap (sibling). |
| 6 | MEDIUM | **VERIFIED** | `IUserRepository.cs:15` — `Task<User> GetUserByIdIncludingStoreAndRoles(Guid userId)` no token. `UserRepository.cs:68,74` — no token param, `FirstOrDefaultAsync()` bare. `GetUserByIdQuery.cs:23` receives token, line 25 doesn't forward it. Fix pattern: `CancellationToken cancellationToken = default` (matches get-users-all fix). |
| 7 | LOW | **VERIFIED** | `UserDto.cs:13` — `RoleNames` no initializer. `UserListDto.cs:10` — `= []` present. Trivial. |

## New Issues Found (not in review)

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| N1 | MED | `GetByLoginWithRelatedAsync` include chain (lines 90-92) ALSO missing `.ThenInclude(o => o.User)` — same OwnerName-null family in login/auth flows | `UserRepository.cs:84-97` |
| N2 | LOW | `GetUserByIdIncludingStoreAndRoles` inlines the include chain instead of reusing the DRY `IncludeStoreAndRoles` helper — reuse would fix #1 AND DRY in one change | `UserRepository.cs:68-75` vs `:56-61` |
| N3 | LOW | `UserDto.OwnerName`/`StoreName` declared non-nullable `string` (lines 11-12) but serialize null — NRT contract violation (also `UserListDto.cs:8-9`) | `UserDto.cs:11-12` |
| N4 | LOW | `ErrorHandlerMiddleware.cs:32` logs EXPECTED validation failures (400) at ERROR level with full stack — noisy logs | `ErrorHandlerMiddleware.cs:32` + observed test output |
| N5 | INFO | `StoreUsersController.GetById` (line 27-28) has the same missing-ProducesResponseType family; `users-e2e` spec R10 also documents 404 for it — out of scope unless batched | `StoreUsersController.cs:27-28` |
| N6 | INFO | `users-e2e` spec R2 "Get existing (OwnerAdmin+UsersAdmin) → 200" and "Get as ReSeller → 403" have NO E2E tests — coverage gap | `UsersGetByIdTests.cs` (4 tests only) |

## Check A — Frontend dependency (400 vs 404)

**Answer: NO frontend code depends on 400 vs 404.** Both frontends treat them identically:

- **React** (`frontend-react/apps/web-store-pos/app/management/users/lib/services/user-http-service.ts:29-34` `getUserById` → GET `/v1/users/${id}`): consumer `user-edit.tsx:32-43` — `.catch()` → generic `USERS.ERROR` message. Axios (`api-client.ts:54-99`) rejects on ANY non-2xx (only 500 gets a special blocking dialog). 400 and 404 → identical catch path.
- **Angular** (`frontend/src/app/_services/user/user.service.ts:49` `getUserById`; consumer `edit-user.component.ts:41-58`): `catchError(error => { throw error; })` → same global-error path for 400 or 404.
- React frontend tests (`user-http-service.test.ts:46-59`) mock `apiClient.get` and assert URL only — no status-code coupling.
- **Caveat (UX, not contract)**: if the fix returns envelope-404 (HTTP 200 + `succeeded:false`), axios RESOLVES → React `user-edit.tsx:36-39` sets `storeUser = res.data` (null) → page renders infinite "Loading" (no error). Angular `edit-user.component.ts:53-57` checks `succeeded && data` → same infinite loading. This is the project-wide envelope-failure UX gap (pre-existing at `/auth/me`, stores race path), triggered only by navigating to a stale/nonexistent edit URL.

## Check B — E2E tests

File: `backend/src/SMCA.WebApi.E2ETests/Users/UsersGetByIdTests.cs` — **4 tests**:

| Test | Asserts | Line |
|------|---------|------|
| `Get_existing_user_returns_200` | Status 200 ONLY (no body assertion) | :16-26 |
| `Get_nonexistent_id_returns_400` | **BadRequest** (must change if contract changes) | :29-39 |
| `Get_without_token_returns_401` | Unauthorized | :42-46 |
| `Get_as_store_user_returns_403` | Forbidden | :49-59 |

**Seed**: `DbTestHelpers.SeedSuperAdminAsync` (`DbTestHelpers.cs:24-35`) = bare `User.Create` + `UserRole(SuperAdmin)`. **NO Owner/Store/StoreUser graph.** Consequences:
- A body-asserting test (e.g., `ownerName` non-null) CANNOT use this seed. It needs the graph — `UserSeed.SeedOwnerAdminWithStoreAsync` (used by `UsersListTests.cs:40`) or a new `DbTestHelpers` method.
- The current 200 test passes with `ownerName: null` in the body — the existing test cannot catch finding 1.
- `appsettings.Tests.json` → real Postgres `smca_test` (localhost:5432, running). I executed the class: **4/4 pass**.
- Missing per spec R2: OwnerAdmin+UsersAdmin 200, ReSeller 403 scenarios.

## Check C — SDD conventions (project)

```
openspec/
├── config.yaml              # ABSENT (no file at root of openspec/)
├── specs/{domain}/spec.md   # Main specs (source of truth) — e.g. users-e2e, management-users,
│                            #   user-repository, get-store-by-id, validation, api-controller, dto
├── changes/
│   ├── {change-name}/       # ACTIVE changes — NO date prefix (e.g. pwa-offline-shell/)
│   │   ├── explore.md       # <-- project uses explore.md (NOT exploration.md)
│   │   ├── proposal.md, design.md, tasks.md, apply-progress.md, verify-report.md
│   │   └── specs/{domain}/spec.md   # Delta specs per domain (api-controller, validation,
│   │                               #   repository, dto, command-handler — see get-users-all archive)
│   ├── pending/             # EXISTS but EMPTY — unused; project convention is direct placement
│   └── archive/YYYY-MM-DD-{change-name}/   # Archived with date prefix
```

- **The orchestrator's instruction said `openspec/changes/pending/...` — that does NOT match project convention.** I wrote the artifact to `openspec/changes/get-user-by-id-endpoint-fixes/explore.md` (matches `pwa-offline-shell` + openspec-convention.md). If the orchestrator wants `pending/` anyway, the file can be moved.
- Relevant main specs: `users-e2e` (R2: GetById contract — says 404, contradicts implementation), `management-users` (frontend UI), `user-repository` (repo contract), `get-store-by-id` (the precedent pattern).
- Delta-spec domains to plan for: `api-controller`, `command-handler`, `validation`, `repository`, `dto`, `users-e2e`.

## Check D — Canonical fixed pattern (from GetAllUsersAsync + store-getbyid-fixes)

Mirror these exactly in apply:

| Aspect | Canonical | Source |
|--------|-----------|--------|
| Controller metadata | `[ProducesResponseType(200/400/401/403)]` on action | `UsersController.cs:29-32` |
| Repo include chain | DRY helper `IncludeStoreAndRoles` with `.ThenInclude(o => o.User)` | `UserRepository.cs:56-61` |
| CancellationToken | `CancellationToken cancellationToken = default` on interface + impl, forwarded to `ToListAsync/FirstOrDefaultAsync` | `IUserRepository.cs:12-14`, `GetAllUsersQuery.cs:32,40-44` |
| DTO init | `RoleNames { get; set; } = []` | `UserListDto.cs:10` |
| Null guard (race) | `if (store is null) return ResponseResult.Failure<StoreDto>(StoreErrors.NotFound, 404);` | `GetStoreByIdQuery.cs:30-31` |
| Validator existence check | lightweight `AnyAsync`-based `ExistsAsync` on the specific repository interface | `IStoreRepository` (store-getbyid-fixes design.md:30) |

## Check E — Application.Tests

`backend/src/Application.Tests/` EXISTS. Structure: `Authentication/` (Commands: Login/Refresh/Register/Revoke; Queries: GetMe), `Features/` (Administration/Features, StoreManagement/Stores+StorePayments), `Management/Users/Queries/ExportOfflineRoster`, `Services/`. **NO GetUserByIdQuery handler/validator tests exist** (glob `*GetUserById*` = 0). UserManagement query coverage is minimal (only ExportOfflineRoster). Adding a handler/validator unit test is greenfield.

---

## Approaches (for the key decision D1 — 400 → 404 contract)

| Option | Behavior for nonexistent id | Pros | Cons | Effort |
|--------|----------------------------|------|------|--------|
| **A. Mirror stores precedent** | Validator keeps 400 (with lightweight `AnyAsync` check); handler adds envelope-404 race guard | Matches most recent documented contract (get-store-by-id spec); zero frontend change; smallest diff | Keeps REST-wrong 400; users-e2e spec stays contradicted | Low |
| **B. Envelope 404 everywhere** | Remove validator `MustAsync`; handler returns `ResponseResult.Failure<UserDto>(UserErrors.NotFound, 404)` → HTTP 200 + `actionCode:404` + `User.NotFound` error | Matches `/auth/me` (`AuthMeFailureTests.cs:25-37`) + users-e2e spec "404" interpretation; kills double round-trip (finding 2) in one move | Frontend UX: React/Angular edit page shows infinite loading on stale URL (axios resolves 200); contradicts newer stores spec | Low |
| **C. Real HTTP 404** | Remove validator `MustAsync`; handler throws `KeyNotFoundException` → middleware 404 (HTTP) | Correct REST; uses existing (currently dead) middleware path; React keeps error-message UX (axios rejects on 404) | New project pattern (no GET endpoint throws it today); throwing for control flow; spec interpretation ambiguity | Low |

Recommended for proposal: **B or C** — both eliminate the double round-trip by removing the validator DB query. B is the most project-consistent (matches `/auth/me` + AuthMeFailureTests); C is the most correct and frontend-friendly but introduces a new pattern. If the user prefers minimal risk and strict store-parity, A.

## Decisions needed from user

- **D1**: Which 404 contract — A (keep 400 + race guard), B (envelope 404), or C (HTTP 404)?
- **D2**: If A: add `AnyAsync`-based `ExistsAsync` to `IUserRepository` (mirror stores). If B/C: validator `MustAsync` is removed entirely (double round-trip solved).
- **D3**: Fix N2 (reuse `IncludeStoreAndRoles` helper) vs inline `.ThenInclude(o => o.User)` — recommended: reuse helper.
- **D4**: E2E updates — update `Get_nonexistent_id_returns_400` per chosen contract; add body-asserting test (needs graph seed — reuse `UserSeed.SeedOwnerAdminWithStoreAsync` or new helper); optionally add missing R2 scenarios (OwnerAdmin 200, ReSeller 403).
- **D5**: Include N1 (`GetByLoginWithRelatedAsync`) fix in this change or leave for an auth-scoped change?
- **D6**: NRT cleanup — `string?` for `OwnerName`/`StoreName` (N3), `RoleNames = []` (finding 7) — include?
- **D7**: Archive-time spec update — `users-e2e` R2 line 46 must be aligned to the chosen contract (currently says 404; implementation returns 400; test asserts 400).

## Risks

- **Spec contradiction unresolved** (users-e2e 404 vs get-store-by-id 400): whichever option is chosen, one spec changes at archive. Medium.
- **Envelope-404 UX gap** (option B): stale edit URL → infinite loading in both frontends; pre-existing pattern at `/auth/me`, so consistent but imperfect. Low-Medium.
- **`GetByIdAsync` in validator is shared API**: if option A changes `IGenericRepository.ExistsAsync` semantics, it affects all generic consumers — prefer a NEW method on `IUserRepository` only. Low.
- **EF fixup nuance** (finding 1): in self-lookup scenarios OwnerName may already work — the fix is still required for determinism; verify with a body-asserting test. Low.
- **Race path envelope-404 is HTTP 200** in stores/me today — if the users fix mirrors it (option A/B), the "404" is envelope-only; no E2E test exercises it anywhere in the project. Low.

## Ready for Proposal
Yes — all findings verified with file:line evidence, one E2E run executed (4/4 pass), precedent pattern identified. The proposal phase must resolve D1 (404 contract) with the user before spec-writing.
