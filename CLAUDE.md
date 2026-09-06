# store-mgmt — Agent Instructions

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

## Planning workflow — SDD pipeline, artifacts in `openspec/` (user-mandated 2026-09-05)

**The SDD pipeline is the planning workflow in this project.** Use the `sdd-*` skills and subagents for planning new changes (explore → propose → spec → design → tasks → apply → verify → archive). The session artifact store is `both`: artifacts live in engram AND as files under `openspec/changes/<change-name>/`.

Existing `openspec/changes/archive/**` folders were produced by earlier pipelines — the original SDD pipeline and the Superpowers era (2026-08-12 → 2026-09-05, whose design/plan files are named `superpowers-design.md` / `superpowers-plan.md`). They are history — read them, never regenerate them.

### Where SDD writes

One folder per change, named in kebab-case with no date prefix: `openspec/changes/<change-name>/`. SDD pipeline file names (`proposal.md`, `spec.md`, `design.md`, `tasks.md`) do not collide with the archived `superpowers-*.md` files, so nothing reads one format expecting the other.

Never create new files under `docs/superpowers/`. If that directory still exists, it is legacy. The `.superpowers/sdd/` scratch workspace is Superpowers-era state, git-ignored, and can be removed at any time.

### Archiving a finished change

When the work is complete and merged, move the whole folder:

```bash
git mv openspec/changes/<change-name> openspec/changes/archive/$(date +%F)-<change-name>
```

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

## Running the tests

Requires PostgreSQL on `localhost:5432`, database `smca_test`. `WebAppFixture` applies the migrations itself.

```bash
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj
dotnet test backend/src/Application.Tests/Application.Tests.csproj
dotnet test backend/src/SMCA.sln
```
