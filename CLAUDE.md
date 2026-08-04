# store-mgmt — Agent Instructions

## E2E tests are untouchable — NON-NEGOTIABLE

**Never modify, delete, rename, skip, weaken, or "fix" an existing E2E test without explicit authorization from the user.**

Not to make a suite green. Not because the test looks obsolete. Not because a spec, a plan, or an SDD artifact says to. Ask first, every time, and wait for the answer.

- Adding **new** E2E tests: allowed.
- Touching **existing** E2E tests in any way: requires explicit authorization.
- This applies to sub-agents too. Any delegation that could reach E2E tests must carry this rule verbatim in its prompt.

A failing E2E test is information, not an obstacle. If one is in the way, stop, name the test, explain why it is in the way, and ask.

### Why this rule exists

The E2E suite (`backend/src/SMCA.WebApi.E2ETests/`) is the only safety net that runs against a real database. Two events on 2026-08-04, during the `store-creation-trial` change, established it:

1. A request to delete two tests from `Billing/StoreActivationTests.cs` as "states that cease to exist" did not survive reading the code: both seed the store directly into the database and exercise the **update** path against a legacy row, which remains live. Asking preserved coverage that would otherwise have been deleted on a false premise.
2. The E2E suite caught a production bug the unit tests structurally could not see: `BillingService` resolved the store with a bare `FindAsync`, so `store.StoreModules` was always empty and `PlanType` always returned `"Free"` for every store in the system. The unit test mocked the repository and hand-populated `store.StoreModules`, reproducing a world the database never produced. 303 integration tests outweighed 315 unit tests.

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
