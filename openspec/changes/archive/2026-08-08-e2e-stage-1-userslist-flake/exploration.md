# Exploration: e2e-stage-1-userslist-flake

- **Date**: 2026-08-08
- **Branch**: feat/e2e-stage-1-s1-01-backend
- **Mode**: interactive (diagnosis only — NO fixes applied)
- **Status**: ROOT CAUSE IDENTIFIED with live-DB evidence

## Problem

`UsersListTests.List_includeInactive_true_includes_inactive_user`
(`backend/src/SMCA.WebApi.E2ETests/Users/UsersListTests.cs:80-98`) fails ONLY in
the full E2E suite run (319/320), but passes when run in isolation. Proven
pre-existing via stash A/B — NOT caused by the B-1 clock-pin change.

## Current State (mechanism)

The test (UsersListTests.cs:80-98):
1. Seeds a super admin `sa-{guid}@test.com` (`SeedSuperAdminAsync`).
2. Seeds an **inactive** user `inactive-{guid}@test.com` (`SeedInactiveUserAsync` — sets `IsActive = false`, DbTestHelpers.cs:61-75).
3. Calls `GET /api/v1/users/all/true` as super admin.
4. Asserts `b.Data.Should().Contain(x => x.Login == targetLogin)` — **the seeded
   inactive user MUST appear in the returned list**.

The request path (super admin):
- `UsersController.GetAllUsersAsync` → `GetAllUsersQuery`
  (SMCA.WebApi/Controllers/v1/UsersController.cs:28-38)
- Handler: super admin branch →
  `GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync`
  (Application/Features/UserManagement/Users/Queries/GetAllUsers/GetAllUsersQuery.cs:39-40)
- Repository (Infrastructure/Persistence/Repositories/UserRepository.cs:36-43):

```csharp
var query = _users.Where(u => (includeInactive || u.IsActive));
query = IncludeStoreAndRoles(query);
return await query.IgnoreQueryFilters().Take(1000).ToListAsync(cancellationToken);
```

**THE QUERY HAS `.Take(1000)` WITH NO `OrderBy`.**

## Evidence (live DB + run logs)

### 1. Shared DB, never reset — `smca_test` has 1088 users (> 1000 cap)

- `WebAppFixture.InitializeAsync` (Infrastructure/WebAppFixture.cs:14-29) only
  sets the connection string and calls `db.Database.MigrateAsync()`. There is
  **no data reset, no truncate, no cleanup between runs**. The database
  persists across runs on the same machine.
- All 76 test classes share ONE xUnit collection `[Collection("e2e")]`
  (WebAppFixture.cs:38-39) → all tests run **sequentially**, no parallel
  classes. A `xunit.runner.json` does not exist. Parallelism (mechanism c) is
  ruled out.
- Live query: `SELECT count(*) FROM "User"` on `smca_test` → **1088 rows**,
  which is **> 1000** — the exact number the super-admin query caps at.
- Login-prefix histogram of the 1088 rows (live):

  | prefix    | count |
  |-----------|-------|
  | reseller  | 374   |
  | owner     | 290   |
  | su        | 146   |
  | me        | 102   |
  | other     | 77    |
  | dup       | 74    |
  | admin     | 10    |
  | billing   | 8     |
  | sa        | 5     |
  | free      | 2     |

  These are accumulated leftovers from hundreds of prior test runs (see
  "Pollution sources" below). `inactive-` = 0, proving the failing test itself
  cleans up properly; the pollution is OTHER tests' leftovers.

### 2. EF Core itself warns about the unordered Take

Running the isolated `UsersListTests` produced this EF Core warning during the
actual query execution:

```
[11:54:41 WRN] The query uses a row limiting operator ('Skip'/'Take') without an
'OrderBy' operator. This may lead to unpredictable results.
```

This is EF Core's own runtime warning on `UserRepository.cs:42`. With no
`OrderBy`, PostgreSQL returns an arbitrary 1000-row window (typically heap
scan order). Whether the freshly-seeded `inactive-{guid}` row lands inside the
1000-row window is **heap-order luck** — which changes with table size, VACUUM,
page layout, and the number of rows in the table at query time.

### 3. Isolation run passes right now (1088 rows) — proving non-determinism

Ran the isolated class:

```
Passed! - Failed: 0, Passed: 14, Skipped: 0, Total: 14
```

It passed with 1088 rows in the table. That is the flake: same DB, same test,
passes in isolation, fails in the full-suite context — because the full suite
adds hundreds of transient user rows before this test runs, changing the heap
and pushing the seeded row out of the unordered 1000-row window. The isolated
run had a quieter table and the seed landed inside the window.

### 4. Why ONLY this test flakes in the whole suite

- `List_includeInactive_true_includes_inactive_user` asserts **Contain** of a
  freshly seeded user — the only assertion in the class (and among the
  `/users/all` callers) that requires a brand-new row to appear in a global,
  truncated list.
- Sibling `List_includeInactive_false_excludes_inactive_user` asserts
  **NotContain** — it can only FAIL if the seed appears, and if the seed is cut
  off the window the assertion trivially passes.
- The other `/users/all/true` tests (`List_as_super_admin_returns_200`,
  `List_as_owner_admin_..._200`, `List_as_store_user_returns_403`,
  `List_as_reseller_returns_403`, `List_without_token_returns_401`,
  `List_nonbool_includeInactive_returns_400_or_404`,
  `List_malformed_token_returns_401`) only assert **status codes**, never the
  presence of a specific row. So the unordered `Take(1000)` truncation is
  invisible to them.

## Pollution sources (why the DB grows past 1000)

The DB accumulates users across runs because several tests/helpers seed users
without cleanup, or clean only part of the graph:

1. **`AuthMeTests`** (Auth/AuthMeTests.cs:28-58) — `Me_with_valid_minted_token_returns_current_user`
   seeds `me-{guid}@test.com` (`SeedActiveUserAsync`) and NEVER cleans up (no
   `finally`, no cleanup call). 102 `me-` rows in the DB.
2. **`RegisterStorePaymentTests.ReSeller_pays_store_not_owned_returns_400`**
   (Billing/RegisterStorePaymentTests.cs:82-103, 196-200) — seeds
   `other-{guid}@test.com` + Owner + Store via `SeedOtherStoreAsync`, but its
   `finally` only deletes the Store row, NOT the user/owner. 77 `other-` rows.
3. **`AuthRegisterDuplicateTests`** (Auth/AuthRegisterDuplicateTests.cs:22-65) —
   seeds `dup-{guid}@test.com` via the register API; cleanup is best-effort
   (`CleanupTenantCascadeAsync` only when `tenantId != Guid.Empty`). 74 `dup-`
   rows.
4. Many Billing/Stores tests seed `reseller-*`, `owner-*`, `su*`, `admin-*`
   users through `BillingSeed`, `StoreSeed`, `AuthzSeed`; cleanup exists in most
   `finally` blocks but a single crashed/failed run (process kill, timeout,
   exception before the seed completes) leaves rows behind permanently. 374
   `reseller-`, 290 `owner-`, 146 `su`, 10 `admin` rows accumulated this way.

Because `smca_test` is never reset, all of these accumulate monotonically until
they cross the `Take(1000)` cap. The DB is now AT/ABOVE the cliff (1088).

## Root cause (mechanism classification)

- **(a) data leak / shared DB state — YES (root cause)**: users accumulate in
  the never-reset `smca_test` DB across runs. Once the `Users` table exceeds
  1000 rows, the super-admin list query's `.Take(1000)` with **no `OrderBy`**
  returns an arbitrary 1000-row window, and the test's freshly-seeded
  `inactive-{guid}` row may fall outside it → `Contain` fails.
- **(b) ordering dependency — part of the mechanism**: no ORDER BY means heap
  scan order decides the window; full-suite heap state differs from isolated.
- **(c) xUnit parallelization — RULED OUT**: single `"e2e"` collection, all 76
  classes sequential, no runner config, no parallelization attributes.
- **(d) clock-dependence — RULED OUT**: this test does not read the clock; the
  B-1 clock-pin change is unrelated (confirmed by stash A/B).
- **(e) other — the unordered LIMIT is the defect enabler**: even with a clean
  DB the query is non-deterministic once the table exceeds 1000 rows; the cap +
  missing ordering is the production-code fragility the test trips over.

## Reproduction steps

1. `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`
   — full suite. `List_includeInactive_true_includes_inactive_user` fails
   intermittently (observed 319/320).
2. Confirm the DB is over the cliff:
   `SELECT count(*) FROM "User"` → currently 1088 (> 1000).
3. Run the single test in isolation:
   `dotnet test ... --filter "FullyQualifiedName~List_includeInactive_true_includes_inactive_user"`
   → passes (as observed: 14/14) because the quieter table lets the seed land in
   the window.
4. Deterministic repro: insert ~200 throwaway users into `smca_test` (e.g., a
   quick SQL loop of `INSERT INTO "User" ...`) then re-run step 3 a few times —
   the test will fail whenever the seeded row lands outside the unordered
   1000-row window.

## Recommended fixes — ALL REQUIRE USER APPROVAL

> Per the non-negotiable rules: backend production source code and existing E2E
> tests are untouchable without explicit user authorization. Options below are
> DIAGNOSES only; none was applied.

### Fix option 1 (production code — REQUIRES APPROVAL): add `OrderBy` + rethink the cap
- `UserRepository.cs:36-43` (and the other two methods with `Take(1000)`).
- Add a deterministic `OrderBy` (e.g., `u.Id` or `u.Login`) BEFORE `.Take(1000)`.
- **Caveat**: ordering alone does NOT fix the flake — with >1000 rows the seeded
  row can still be cut off. It only makes the window deterministic.
- Effort: Low. Risk: Medium (still truncates; ordering changes API output order).

### Fix option 2 (production code — REQUIRES APPROVAL): remove/paginate the cap
- Replace `.Take(1000)` with proper pagination, or remove it for the admin list.
- Fixes the root: every seeded row is guaranteed present.
- Effort: Medium. Risk: Medium (large tenants; response size).

### Fix option 3 (E2E fixture — REQUIRES APPROVAL): reset the DB per run
- In `WebAppFixture.InitializeAsync` (WebAppFixture.cs:14-29), truncate/clean
  the `Users` (+ dependent) tables after `MigrateAsync`, or move to a
  per-run disposable database.
- Stops the monotonic accumulation that crosses the cap.
- Effort: Low-Medium. Risk: Low-Medium (slower runs; careful FK order).

### Fix option 4 (existing E2E tests — REQUIRES APPROVAL): fix the leaking seeds
- Add cleanup to `AuthMeTests` (AuthMeTests.cs:28-58),
  `RegisterStorePaymentTests` (RegisterStorePaymentTests.cs:82-103, 196-200),
  `AuthRegisterDuplicateTests` (AuthRegisterDuplicateTests.cs:22-65), and audit
  the other seeders for `finally` gaps.
- Stops FUTURE growth but does NOT reduce the current 1088 — must be paired with
  a one-time DB purge (or Fix option 3).
- Effort: Medium. Risk: Low (behavior-neutral).

### Recommended combo (user decision required)
1. **One-time purge** of `smca_test` `Users`/`UserRole`/dependent rows to get
   under the 1000 cap (immediate unblock; manual DB op or approved script).
2. **Fix option 3** (per-run DB reset) as the durable anti-accumulation fix.
3. **Fix option 1 or 2** in `UserRepository` to make the query deterministic /
   remove the hidden truncation (the actual production fragility).

## Risks
- Any of the above that touches production code or existing E2E tests violates
  the standing rule without explicit user approval — approval gate required.
- If nothing is done, the flake frequency will INCREASE as the DB keeps growing
  (already 1088 > 1000; every further run adds more `me-`/`other-`/`dup-` rows).
- A one-time purge is safe for the suite (tests seed everything they need) but
  would also remove any manually-created dev data in `smca_test`.

## Ready for Proposal
Yes — the mechanism is fully evidenced (live DB count, EF Core warning, isolation
pass + suite fail, leak sources identified). The orchestrator should present the
fix options to the user for approval before any code/test touch.
