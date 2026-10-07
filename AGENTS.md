# store-mgmt — Agent Instructions

## Angular frontend is LEGACY — NON-NEGOTIABLE (user-mandated 2026-09-17; reinforced 2026-09-24)

**The Angular frontend (`frontend/`) is legacy and is NEVER touched — and NEVER read or inspected.** All changes belong in the React frontend (`frontend-react/`). Do not read, edit, search, or derive ANY decision, context, or parity conclusion from the Angular app — it is frozen. "Angular parity" is NOT an authorized reason to open it.

This applies to tool results too: codegraph and other search tools may index both trees; when Angular `frontend/` source appears in a result set, IGNORE it — do not read it, do not quote it, do not cite it as evidence, and do not compare React behavior against it. If React behavior seems to diverge from Angular, reason from React code + tests + specs, never from the legacy app.

Any work that would modify `frontend/` must stop and ask; the answer will be "work in React".

## Backend scope rule — NON-NEGOTIABLE (user-mandated 2026-08-08)

**In this backend test-coverage work, the agent may only ADD new E2E tests.** If the work would require modifying **production source code** or **existing E2E tests** (backend), the agent MUST stop and notify the user for review and approval before touching anything. This is not optional, not bypassable, and applies to sub-agents and delegated phases too — any delegation that could reach backend production code or existing E2E tests must carry this rule verbatim in its prompt.

- Adding **new** E2E tests: allowed.
- Modifying backend production source code: requires explicit notification + approval.
- Touching **existing** backend E2E tests: requires explicit notification + approval.
- A failing existing E2E test is information, not an obstacle: stop, name it, explain, ask.

## E2E tests are untouchable — NON-NEGOTIABLE (user-mandated 2026-08-10, applies to frontend AND backend)

**Never modify, delete, rename, skip, weaken, or "fix" an existing E2E test without explicit authorization from the user.**

Not to make a suite green. Not because the test looks obsolete. Not because a spec, a plan, or an SDD artifact says to. Ask first, every time, and wait for the answer.

This covers BOTH E2E suites:
- **Backend**: `backend/src/SMCA.WebApi.E2ETests/` (xUnit + WebAppFixture, real PostgreSQL).
- **Frontend**: `frontend-react/e2e/` (Playwright, `*.spec.ts`).
- The frontend E2E **support files** (`frontend-react/e2e/support/*.ts`: fixtures, seeders, page objects, observers) are part of the E2E harness too — touching any existing one in a way that changes its behavior requires explicit authorization. Adding new support files for new tests is allowed.

- Adding **new** E2E tests (either suite): allowed.
- Touching **existing** E2E tests or existing E2E support files in any way: requires explicit authorization.
- This applies to sub-agents too. Any delegation that could reach E2E tests must carry this rule verbatim in its prompt.

A failing E2E test is information, not an obstacle. If one is in the way, stop, name the test, explain why it is in the way, and ask.

### Why this rule exists

The E2E suites are the only safety nets against a real system: the backend suite (`backend/src/SMCA.WebApi.E2ETests/`) runs against a real PostgreSQL database, and the frontend suite (`frontend-react/e2e/`, Playwright) drives the real app against the real backend. Two events on 2026-08-04, during the `store-creation-trial` change, established it:

1. A request to delete two tests from `Billing/StoreActivationTests.cs` as "states that cease to exist" did not survive reading the code: both seed the store directly into the database and exercise the **update** path against a legacy row, which remains live. Asking preserved coverage that would otherwise have been deleted on a false premise.
2. The E2E suite caught a production bug the unit tests structurally could not see: `BillingService` resolved the store with a bare `FindAsync`, so `store.StoreModules` was always empty and `PlanType` always returned `"Free"` for every store in the system. The unit test mocked the repository and hand-populated `store.StoreModules`, reproducing a world the database never produced. 303 integration tests outweighed 315 unit tests.

## Planning workflow — ODD by default; SDD only on explicit request (user-mandated 2026-09-18; supersedes the 2026-09-05 SDD mandate)

**ODD (Organic Driven Development) is the default workflow in this project, for every request.** Explore proportionately before changing code; keep small, understood work small (direct inline or delegated direct); for substantial authorized work, create ONE feature document at `odd/tasks/<feature-name>.md` with its Engram mirror (`odd/<feature-name>/tasks`) before the first write; close each task with a work-unit commit plus observed proof. Size, ambiguity, or risk alone never selects SDD.

**SDD is a branch inside ODD, entered only on an explicit request or an accepted proposal — no silent SDD enrollment.** Direct and delegated work never creates `openspec/` state or runs `sdd-*` phases. When SDD is selected, use the `sdd-*` skills and subagents (explore → propose → spec → design → tasks → apply → verify → archive) and the session artifact store is `both`: artifacts live in engram AND as files under `openspec/changes/<change-name>/`.

Existing `openspec/changes/archive/**` folders were produced by earlier pipelines — the original SDD pipeline and the Superpowers era (2026-08-12 → 2026-09-05, whose design/plan files are named `superpowers-design.md` / `superpowers-plan.md`). They are history — read them, never regenerate them.

### Where SDD writes

One folder per change, named in kebab-case with no date prefix: `openspec/changes/<change-name>/`. SDD pipeline file names (`proposal.md`, `spec.md`, `design.md`, `tasks.md`) do not collide with the archived `superpowers-*.md` files, so nothing reads one format expecting the other.

Never create new files under `docs/superpowers/`. If that directory still exists, it is legacy. The `.superpowers/sdd/` scratch workspace is Superpowers-era state, git-ignored, and can be removed at any time.

### Archiving a finished change

**Archiving runs through the SDD flow (`sdd-archive`), never a bare `git mv`.** Check readiness with `gentle-ai sdd-status <change-name>` first — the native engine gates archive on: tasks complete, verify persisted and non-stale (envelope totals MUST match the engine's requirement count — the engine counts only `### Requirement:` NEW-format headers in the delta, not MODIFIED sections), and no blocked reasons. If the engine reports `blocked`, fix the named cause (e.g. rerun verify and persist a matching report) before archiving.

The proper archive sequence:

1. `gentle-ai sdd-status <change-name>` → `archive: ready` (no blocked reasons).
2. Canonical spec sync: apply the delta `specs/<domain>/spec.md` to `openspec/specs/<domain>/spec.md` — `## ADDED Requirements` appended, `## MODIFIED Requirements` replacing matching canonical blocks by exact requirement name, `## REMOVED Requirements` deleted. Normally done by `sdd-sync`; archive-time fallback needs explicit parent approval. Never drop scenarios from a MODIFIED block silently.
3. Write `archive-report.md` inside the change folder (verdict, synced requirement names, final-state facts, move evidence).
4. Move the whole folder with `git mv openspec/changes/<change-name> openspec/changes/archive/$(date +%F)-<change-name>` — byte-preserving. If the folder is untracked (e.g. after a revert), `git add` it first, then `git mv`.
5. Verify the move: hash every file before and after (`find <folder> -type f -exec sha256sum {} \;`) and diff — byte-identical. Commit the archive + canonical spec changes together.

**Move it, never rewrite it.** Re-authoring artifacts during archive has silently corrupted them before (a table `\|` became `||` at an identical line count, so the diff looked clean). `git mv` preserves bytes and history; a read-then-write does not. If a move is impossible and files must be recreated, diff every file against its original before deleting the source.

Archiving does not delete the plan's scratch workspace under `.superpowers/sdd/` — that is git-ignored and can be removed at any time.

## Gotchas

### `ApplicationDbContext` is `NoTracking` by default

`Infrastructure/Persistence/Contexts/ApplicationDbContext.cs:45` sets `ChangeTracker.QueryTrackingBehavior = QueryTrackingBehavior.NoTracking` globally.

Loading an entity with a query, mutating it, and calling `SaveChangesAsync()` **writes nothing** — no exception, no warning. Attach it first with `db.Set<T>().Update(entity)` or `db.Entry(entity).State = EntityState.Modified`.

Seed helpers that **create** entities (`.Add(...)`) are unaffected: those are tracked as `Added`. Copying an existing helper's shape is not enough — the difference that matters is Add versus query-then-mutate.

Prior art with the same trap already documented in production code: `Application/Features/UserManagement/Users/Commands/UpdateUser/UpdateUserCommand.cs:59-62`.

### Diagnosing an empty result in an E2E test

When an E2E test returns an empty collection or a "not applicable" state, assert the **precondition** first — is the data you seeded actually there? — before blaming the behavior under test. A test that asserts a filtered effect without pinning the state that triggers the filter cannot distinguish "filtered correctly" from "found nothing".

### A stray `testhost` makes the build fail SILENTLY (learned 2026-10-07)

An orphaned `testhost` process keeps `backend/src/SMCA.WebApi.E2ETests/bin/Debug/net8.0/Infrastructure.dll`
locked. The build then fails with `error MSB3027` / `MSB3021` — *"The file is locked by: testhost (PID)"* — and
**`dotnet test` runs the tests against the PREVIOUS binaries anyway**. You get results that mean nothing.

The trap: **`error MSB3027` is not an `error CS`.** Grepping build output for `error CS` alone reports a failed
build as clean. This cost a real debugging detour — a perfectly good E2E class looked flaky (3/3 green, then
3/3 red in 39 ms, then `< 1 ms` durations) when the actual cause was a stale DLL.

Rules when iterating on backend E2E on Windows:

1. **Always grep for `Build succeeded|Build FAILED` and `error MSB`**, never `error CS` alone.
2. **Before rebuilding, kill leftovers:** `Get-Process -Name "testhost*" -ErrorAction SilentlyContinue | Stop-Process -Force`.
3. **`< 1 ms` duration in a backend E2E is the tell.** These tests apply EF migrations, seed PostgreSQL and make
   real HTTP calls. Tens-of-milliseconds failures mean the binary is stale or the collection fixture never
   initialized — not that the behaviour under test is broken.
4. **`dotnet test --list-tests --filter X` lies.** It reports *"No test matches the given testcase filter"* for
   classes that DO exist in the assembly (verified against 688 tests). To confirm a test exists, run
   `--list-tests` WITHOUT `--filter` and grep.
5. **A wrong `--filter` suffix fails silently** — empty output, no error. `Inactive_store_keeps_hiding_...` does
   not match a filter for `Inactive_store_hides_...`. Copy the exact name from `--list-tests`.

Never diagnose a test as flaky before ruling out a stale binary. Confirm with: revert the change, kill
`testhost`, rebuild, re-run. If the failure survives that, it is real.

### Every store module must have a `StoreRoleFeatures` mapping

Every store module that carries store-level features MUST have a `StoreRoleFeatures` enum entry
(`[HasFeature(...)]` + `[HasModule(...)]`). `AllowedFeaturesService` resolves `FeatureIds` only
through that enum, and `StoreRoleFeatureGenerator` silently drops unmapped feature ids — so a module
without an entry is invisible in `/me` `FeatureIds` and in the offline roster even when the module is
active for the store. WholesaleSales (module 12 → feature 39) and MultiStores (module 14 → feature 38)
were missing until 2026-09-20; fixed by adding the two entries plus the data backfill migration
`20260920120000_Backfill-WholesaleSales-MultiStores-RoleFeatures` (script
`backend/scripts/20-20260920-Backfill-WholesaleSales-MultiStores-RoleFeatures.sql`).

Related: `/me` `Roles` excludes a store user whose `StoreUser.IsActive` is false —
`GetStoreRoleFeaturesByUserIdAsync` gates the StoreUser role on an active `StoreUser` row for
`(store, userId)` (OwnerAdmin has no `StoreUser` row and is unaffected).

## Database migrations — the migration is the source, the script is generated (user-mandated 2026-09-30)

**The EF migration is the single source of truth. The `.sql` script is GENERATED from it with
`dotnet ef migrations script`. Never hand-write the script.** Writing the script first and the
migration second inverts the guarantee: the two texts drift, and the one that never ran is the
one nobody tested. That exact mistake shipped here — a hand-written script was verified against
PostgreSQL while the C# migration it was supposed to mirror contained invalid SQL and had never
been executed.

### The steps, in order

```bash
cd backend

# 1. Create the migration.
dotnet ef migrations add <Nombre> --project src/Infrastructure --startup-project src/SMCA.WebApi

# 2. For pure-data migrations the Up() is generated empty. Put the real SQL there. Prefer a
#    shared static class of SQL constants (see PlanModuleConvergenceSql, ElaborationModuleBackfill,
#    WarehousesPlanCleanup) so the migration, the script, and the tests all read the same text.

# 3. Apply it for real against the test database.
dotnet ef database update --project src/Infrastructure --startup-project src/SMCA.WebApi \
  --connection "Host=localhost;Database=smca_test;Username=postgres;Password=postgres"

# 4. Generate the script FROM the migration. See the -From rule below.
dotnet ef migrations script <PreviousMigration> <LastMigration> \
  --project src/Infrastructure --startup-project src/SMCA.WebApi -o scripts/<NN>-<name>.sql
```

### The `-From` rule (user-stated 2026-09-30)

- **Several migrations in one script:** `-From <PreviousMigration> -To <LastMigration>`.
- **A single migration:** `-From` the **PREVIOUS** migration — not the new one — and **omit `-To`**.
  Omitting `-To` makes EF run through the latest migration, which is the new one.

```bash
# Single new migration 20260930090000_PlanModuleConvergence:
dotnet ef migrations script 20260928191227_Add-WebCatalog-Module-Vip ... -o scripts/27-....sql
```

### Three things EF's generated script does NOT do for you

1. **`ON CONFLICT` on the `__EFMigrationsHistory` insert.** EF emits a bare `INSERT`, so running
   the script twice fails on the primary key. Every script since #08 adds
   `ON CONFLICT ("MigrationId") DO NOTHING;`. Patch that one line after generating.
2. **Header + verification queries.** Add the header block (name, EF migration, date, parity note,
   prerequisites) and the post-`COMMIT` verification `SELECT`s by hand. Keep the commented
   `ROLLBACK` block too.
3. **Naming.** EF writes to whatever path `-o` gets. Rename it to the repo convention
   `NN-nombre-descriptivo.sql` with the next sequential number.

Do NOT reorder or rewrite the generated SQL body. If it looks wrong (a `)DELETE` on one line), read
it before "fixing" it — the statement before it may end with a CTE, and `)` closes it.

### Verifying a data migration really runs

Running the script against an already-migrated database proves nothing: the six statements return
`DELETE 0 / INSERT 0 0 / UPDATE 0` and the history row already exists. To prove the C# executes:

```sql
DELETE FROM "__EFMigrationsHistory" WHERE "MigrationId" = '<id>';
```

then `dotnet ef database update`. EF now sees it as pending and runs the real `Up`. Verify with
`SELECT "MigrationId" FROM "__EFMigrationsHistory" WHERE "MigrationId" LIKE '<prefix>%';`.
Run the script twice afterwards to prove idempotency.

### C# raw string literals do NOT emit the trailing newline — gotcha

This produced invalid SQL that compiled cleanly and ran nowhere:

```csharp
// BROKEN: yields WITHspec(...)  — a PostgreSQL syntax error.
public const string X = """
    WITH
    """ + Cte + """
    DELETE FROM ...
```

A raw string literal omits the newline before its closing delimiter. Put the join in a named
constant instead:

```csharp
private const string HeadSql = "WITH\n" + Cte;   // correct
```

See `PlanModuleConvergenceSql.HeadSql`.

### Adding a module to a plan — the established order

Verified against `scripts/19-20260918-Add-Elaboration-Module.sql` (module 17 → Superior/VIP):

1. `INSERT INTO "Module"` — full column list: `Id, AvailableToStore, DiscountPrice, IsActive, Name,
   Order, PercentDiscountPrice, Price, PriceIncluded`.
2. `INSERT INTO "Feature"` — `Id, AvailableToStore, Description, IsActive, ModuleId, Name, Order`.
   `ModuleId` is the join key that makes role features computable in SQL.
3. **`setval` fix-ups.** Explicit-PK inserts do NOT advance the serials, so the next generated id
   collides. Always reset `"Feature"` and `"Module"`.
4. `INSERT INTO "StorePlanModule"` — **only the destination plans**, e.g. `VALUES (3,17),(4,17)`.
   Not cumulative: adding a module to Superior/VIP does not add it to Gratis/Pago.
5. `INSERT INTO "StoreModule"` — predicate `s."IsActive" = TRUE AND s."StorePlanId" IN (...)`,
   `CreatedBy` = `'38b96d85-bf75-41ca-bfd7-796e7fe0ebc8'::uuid` (NOT NULL audit column).
6. `INSERT INTO "StoreRoleFeature"` — hardcode the role ids (OwnerAdmin 2, StoreUser 3, ReSeller 4)
   and join the feature ids via `JOIN (VALUES (120),(121)) AS f("Id") ON TRUE`.

Every insert carries `ON CONFLICT ... DO NOTHING`. FK order matters: catalog → plan → per-store.

Convergence migrations (like `PlanModuleConvergence`) are the opposite shape: they do **not** insert
new catalog rows, they derive the universe in a CTE and use `DO UPDATE` to reactivate soft-deleted
rows without touching negotiated price columns.

## Running the tests

Requires PostgreSQL on `localhost:5432`, database `smca_test`. `WebAppFixture` applies the migrations itself.

```bash
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj
dotnet test backend/src/Application.Tests/Application.Tests.csproj
dotnet test backend/src/SMCA.sln
```

## Auth redirect invariant — NON-NEGOTIABLE (user-mandated 2026-09-06)

**A user with a valid, unexpired session — authenticated ONLINE or OFFLINE (roster) — must NEVER land on `/login`.** On page reload and on visits to `/login`, the app must redirect them to their role-appropriate home (`resolveUserHomePath`: SuperAdmin/ReSeller → `/admin/owners`; everyone else → `/sales/new` or `/sales/products`). Only a verdict kills the session and sends them to login: expiry, a session rejection (401/404 from `/v1/auth/me`), or an explicit logout. Full contract: `docs/contracts/authenticated-session-redirect.md`.

Before touching `authLoader`, `guestOnlyLoader`, `needsUnlock`, `auth-store` hydration, or any DEK/unlock gate, re-read that contract. Any change that can bounce a validly-authenticated user to `/login` (including via `?unlock=1`) violates this invariant and needs explicit user approval first. Existing E2E that pin this behavior (`login.spec.ts` REQ-1/REQ-7/REQ-14, `superadmin-login.spec.ts`, `login-offline.spec.ts` T10) are untouchable per the rule above — new coverage goes in NEW tests.
