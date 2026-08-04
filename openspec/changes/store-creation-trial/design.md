# Design: Every Created Store Starts Its Trial Clock (Backend)

## Execution Constraint (read first)

**No agent in this pipeline compiles, builds, restores or runs anything.** No `dotnet` invocation
occurs in the design, tasks or apply phases. Every claim below was reached by reading source, not by
executing it. The tests ship unexecuted; the RED→GREEN cycle is the **user's to run locally**
(commands in `proposal.md` §Verification). Any agent that "verifies" by running a build has violated
the constraint of this change.

## Technical Approach

The production delta is four small edits (one behavioural line, one ctor param, one DTO field, one
comment). Everything else is test architecture, and that is where this design earns its keep: the
new E2E suite asserts **derived dates**, so it is only meaningful if three inputs are nailed down —
the clock, the three `SystemConfiguration` rows, and the `IMemoryCache` layer sitting in front of
those rows. The existing infra pins the first; this design adds a disposable helper for the second
and third, mirroring `MutableDateTimeProvider.Pin`'s shape so the two pins read alike at the call
site.

Creation flows through exactly one write path (`CreateStoreService.CreateStoreAsync`, reached by
`CreateStoreCommand.cs:54` and `RegisterCommand.cs:82`), so the behaviour change is one line and
cannot drift between the admin and self-registration entry points.

---

## ⚠ Correction to the proposal's "Verified facts" table

The instruction was to treat that table as authoritative and to contradict a row only by opening the
cited file and quoting contradicting code. One row is wrong. Evidence below.

### The row

> | ⇒ its billable amount is `2000 − 75% = 500`, not 2000 | `CurrentPriceServiceUtils.cs:13` |

### Why it is wrong

The row's premise is that module 6 is the **only** paid module a self-registered store receives.
`RegisterCommand.cs:73,82-83` assigns **all** modules from `GetAvailableModulesToStore()`, and that
filter is (`ModuleRepository.cs:19-23`):

```csharp
return await _modules
    .Where(m => m.IsActive && m.AvailableToStore
        && m.Features.Any(f => f.IsActive && f.AvailableToStore))
```

`ApplicationDbContextModelSnapshot.cs` — the same file the row cites for module 6 — seeds **six**
modules that are `IsActive=true`, `AvailableToStore=true`, `PriceIncluded=false`,
`Price=2000f`, `PercentDiscountPrice=75f`, `DiscountPrice=0f`:

| Module | Snapshot lines | Qualifying feature (active + availableToStore) |
|---|---|---|
| 5 "Reportes" | `:588-599` | 50 "Reportes del día" (`:262-269`) |
| 6 "Estadísticas" | `:600-611` | 60 "Dashboard" (`:272-279`) |
| 8 "Gastos" | `:624-635` | 80 "Gastos del día" (`:322-329`) |
| 9 "Facturación" | `:636-647` | 90 "Facturación" (`:332-339`) |
| 10 "Historiales" | `:648-659` | 100 "Historial de ventas" (`:352-359`) |
| 11 "Créditos" | `:660-671` | 110 "Venta a crédito" (`:392-399`) |

(Module 1 "Administración" is also `PriceIncluded=false` at `:540-551` but is `AvailableToStore=false`,
so the filter drops it. Modules 2/3/4/7 are `PriceIncluded=true`.)

`RegisterStorePaymentCommand.cs:72-74` sums `GetCurrentPrice` over **all** active non-free
`StoreModule` rows. With `GetCurrentPrice(2000, 75, 0) = 2000 − 1500 − 0 = 500`
(`CurrentPriceServiceUtils.cs:13`):

**Expected billable amount for a brand-new self-registered store = 6 × 500 = `3000f`, not `500f`.**

### Consequences

- **Test 17** asserts `3000f`, not `500f` (see D8).
- The facts-table rows "module 6 is paid at 2000/75%" and "⇒ `PlanType = "Paid"`" remain **correct** —
  more strongly so, since six paid modules qualify, not one.
- Any test that wants a *single* paid module must create the store through the **admin** endpoint
  with an explicit `moduleIds` list, not through self-registration. This drives D7 and D9.

### Second refinement to the "clock-config trap"

The proposal says the 1/5/5 values are "fallbacks when the row is absent". Reading the seed layer
sharpens this — the three rows are **not symmetrical**:

| Config | Enum Id (`SystemConfigurationType.cs`) | `HasData` in entity config | In `ApplicationDbContextModelSnapshot` `HasData` | Present in a migrated DB? | Effective value |
|---|---|---|---|---|---|
| `TestingPeriodInMonths` | 1 | `:26-27` value `"1"` | yes (`:1454-1460`) | **yes**, row `"1"` | 1 |
| `PaymentGraceDays` | 3 | `:32-33` value `"5"` | yes (`:1467-1472`) | **yes**, row `"5"` (migration `20260727164714`, `:16`) | 5 |
| `DueSoonDays` | **4** | `:34-36` value `"5"` | **NO** — snapshot has Ids 1, 2, 3, 5 only | **no row** | 5, via the repo fallback (`SystemConfigurationRepository.cs:43`) |

`rg DueSoonDays backend/src/Infrastructure/Migrations` → **no matches**. No migration ever inserts
Id 4, and the current model snapshot does not carry it, so the `HasData` line at
`SystemConfigurationEntityTypeConfiguration.cs:34-36` is an **un-migrated pending model change**.

Two things follow, and both shape D2:

1. Today the effective values in `smca_test` really are 1/5/5 — but two of them come from **rows**
   (mutable, and `smca_test` is never dropped: `WebAppFixture.InitializeAsync` only calls
   `MigrateAsync`) and one from a **code fallback**.
2. A helper that *permanently* inserts an Id-4 row would collide the day someone runs
   `dotnet ef migrations add` and EF finally emits the pending `InsertData` for Id 4 — the next
   `MigrateAsync` would fail on a duplicate key. **The helper must restore the prior state, including
   restoring "row absent".**

---

## Architecture Decisions

### D1: `CreateStoreService` — provider injection and date derivation

| Question | Decision | Rationale |
|---|---|---|
| Ctor position | **Append `IDateTimeProvider dateTimeProvider` as the 8th and last parameter** of `CreateStoreService(...)` (`CreateStoreService.cs:19-22`) | Both call sites resolve by DI, so position is irrelevant to production; appending keeps the diff in `CreateStoreServiceTests.CreateService()` (`:51-58`) to one added line instead of re-ordering seven arguments |
| Field | `private readonly IDateTimeProvider _dateTimeProvider;` assigned last in the ctor body, matching the file's existing style | — |
| Derivation | `DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime)` | **Character-for-character identical** to `UpdateStoreCommandHandler.cs:97` and to `BillingService.cs:69` / `GetStoresToCollectQuery.cs:60`. Identical expression ⇒ the creation path and the legacy-activation path cannot drift |
| Line 36 | `Store.Create(name, ownerId, approved, tenantId, DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime), address, description)` — 5th positional arg (`Store.cs:62`) | — |
| DI registration | **None needed. Nothing to add.** | `IDateTimeProvider` is registered `AddSingleton<IDateTimeProvider, DateTimeProvider>()` at **`SMCA.WebApi/Program.cs:49`** (and in the second host, `WebApiTest/Program.cs:26`). `CreateStoreService` is `AddScoped` at `Application/DependencyInjection.cs:52`. Singleton-into-scoped is legal. `rg IDateTimeProvider` finds registrations in exactly those two composition roots — no other host resolves `ICreateStoreService` |
| E2E wiring | **Automatic.** `AppTestFactory.cs:29-30` does `RemoveAll<IDateTimeProvider>()` + `AddSingleton<IDateTimeProvider>(Clock)`, so `CreateStoreService` receives `MutableDateTimeProvider` with no test-infra change | — |

**Rejected:** inserting the provider next to the other repositories (mid-list) — pure churn in the
unit-test factory for zero production benefit. **Rejected:** passing `DateOnly today` down from the
two command handlers — two call sites, exactly the drift the single write path exists to prevent
(already rejected in `proposal.md` §Approach).

### D2: Config pinning — the load-bearing decision

**Chosen: a per-test disposable scope in a new `Infrastructure/BillingConfigSeed.cs`, mirroring
`MutableDateTimeProvider.Pin`.**

```csharp
// SMCA.WebApi.E2ETests/Infrastructure/BillingConfigSeed.cs
public static class BillingConfigSeed
{
    public const int TrialMonths  = 1;   // SystemConfigurationType.TestingPeriodInMonths = 1
    public const int GraceDays    = 5;   // SystemConfigurationType.PaymentGraceDays      = 3
    public const int DueSoonDays  = 5;   // SystemConfigurationType.DueSoonDays           = 4

    /// Upserts the three billing config rows, evicts BillingService's cached copies,
    /// and restores the exact prior state (including row-absent) on dispose.
    public static Task<IAsyncDisposable> PinAsync(
        AppTestFactory factory,
        int trialMonths = TrialMonths,
        int graceDays   = GraceDays,
        int dueSoonDays = DueSoonDays);
}
```

Call site, deliberately adjacent to the clock pin:

```csharp
await using var cfg = await BillingConfigSeed.PinAsync(_f);
using var clock = _fixture.Clock.Pin(Anchor);
```

**Enter:** open a scope, read rows 1/3/4 by Id, snapshot each as `(int Id, string? Value)` where
`null` means *row absent*; upsert to the requested values; evict the cache (below).
**Dispose:** restore each snapshot — update if it had a value, **delete if it was absent** — then
evict again.

Why this shape and not the alternatives:

| Option | Assessment |
|---|---|
| **Per-test disposable scope** (chosen) | Explicit at the call site, symmetric with `Clock.Pin`, leaves `smca_test` byte-identical to how it was found — critical because of the un-migrated Id-4 row (see the table above). ~2 extra round-trips per test; negligible against an E2E HTTP round-trip |
| Fixture-level seed in `WebAppFixture.InitializeAsync` | Cheapest, and harmless *today* because 1/5/5 already equals the effective values — but it **permanently** inserts Id 4 into a database that is never dropped, arming the migration collision described above. It also hides the dependency from the test that relies on it |
| Per-test raw seeding without restore | Same collision risk, plus leaks state into whichever test class runs next |

**Isolation is not a concern here, and that is a verified fact, not an assumption.** All 69 E2E test
classes carry `[Collection("e2e")]` (`rg '\[Collection\(' backend/src/SMCA.WebApi.E2ETests` → 69
matches, all `"e2e"`), there is no `xunit.runner.json` and no `[assembly: CollectionBehavior]`
anywhere in the solution. xUnit parallelises *across* collections, never *within* one ⇒ the whole
E2E assembly runs strictly sequentially. A mutate-and-restore scope is therefore safe.

### D3: The `IMemoryCache` layer in front of the config

`BillingService.GetCachedConfigAsync` (`:36-44`) caches for 5 minutes under the **literal** keys
`"PaymentGraceDays"`, `"DueSoonDays"`, `"TestingPeriodInMonths"` (`:60-62`). `IMemoryCache` comes
from `AddMemoryCache()` (`SMCA.WebApi/Program.cs:45`) ⇒ **singleton in the root container**, shared
by every request and by every test in the run. Rewriting a `SystemConfiguration` row without
touching the cache can therefore read a stale value for up to 5 minutes.

**Decision: evict by key from the test side.**

```csharp
var cache = factory.Services.GetRequiredService<IMemoryCache>();  // same singleton the app resolves
cache.Remove("TestingPeriodInMonths");
cache.Remove("PaymentGraceDays");
cache.Remove("DueSoonDays");
```

Called on both enter and dispose of `BillingConfigSeed.PinAsync`.

| Option | Assessment |
|---|---|
| **Evict the three keys** (chosen) | 3 lines, no production change, no effect on any other test. `factory.Services` is the test host's root provider, so it hands back the identical singleton |
| Replace `IMemoryCache` with a no-op in `AppTestFactory.ConfigureTestServices` | **Rejected — it would break unrelated tests.** `TokenBlacklistService` (`SMCA.WebApi/Services/TokenBlacklistService.cs:8-9`) is the *only other* `IMemoryCache` consumer and it stores JWT revocations there; a no-op cache silently breaks logout/blacklist behaviour (`Auth/AuthLogoutTests.cs`). It would also change the caching semantics every existing billing E2E test currently runs under |
| Rely on the 5-minute TTL | **Rejected.** A full E2E run is well under 5 minutes; the first `/auth/me` in the assembly would poison the whole suite |

**Note the asymmetry, because it matters for which tests need the eviction:**
`GetStoresToCollectQuery.cs:61-63` reads `ISystemConfigurationRepository` **directly, uncached**;
`RegisterStorePaymentCommand.cs:86` likewise. Only the `BillingService` path (`/auth/me`, and the
`HasPermission` filter) is cached. The helper evicts unconditionally so no test has to reason about
which path it is on.

**Known divergence, pinned but not fixed here:** `BillingService.cs:62` clamps with
`Math.Max(1, trialMonths)`; `RegisterStorePaymentCommand.cs:86` does not. They disagree when the row
holds `0`. Out of scope — the suite always pins `1`, and the design records the trap.

**Fragility acknowledged:** the three cache keys are string literals duplicated between
`BillingService.cs:60-62` and the test helper. Extracting them to a shared constant is *not* done in
this change (it would touch production for test convenience); it is logged as a risk instead.

### D4: `PlanType` on the wire

| Question | Decision | Evidence |
|---|---|---|
| DTO field | `public string PlanType { get; set; } = "Free";` on `CurrentUserDto` (`Application/Dtos/Authentication/CurrentUserDto.cs`), placed after `PaymentStatus` (`:22`) | Mirrors `PaymentStatus`'s non-nullable-string-with-default shape; source type is `string` (`StoreBillingSummary.cs:9`) |
| Mapping | `PlanType = billing.PlanType,` in the object initializer at `GetMeQuery.cs:86-104`, next to `:101-103` | — |
| AutoMapper / profiles | **None. Nothing to touch.** | `GetMeQueryHandler` builds `CurrentUserDto` with a plain object initializer (`:86`); `rg CurrentUserDto` across `backend/src` returns only the DTO, the handler, one `ProducesResponseType`, and test deserialisations — **no mapping profile mentions it.** (`CreateStoreCommandHandler` does use `IMapper`, but only for `StoreDto`, which this change does not touch) |
| Wire casing | `planType` (default camelCase; no JSON options configured — see D6) | — |

**Scope addition — flagged, not smuggled.** `BillingService.cs:49-50` early-returns
`new StoreBillingSummary { StoreId = storeId, Status = NoAplica }` when the store is not found,
leaving `PlanType` at its `string.Empty` default. Mapping verbatim would put `"planType": ""` on the
wire for a user with no selected store. **Decision: add `PlanType = "Free"` to that early return**
(one property in an existing initializer) so the contract is total, and keep the handler mapping
verbatim and symmetric with `PaymentStatus`. Blast radius is nil: `rg PlanType` shows no test
asserts the null-store path (`BillingServiceTests.cs:124` asserts the free-modules path;
`GetMeOverdueDowngradeTests` only *constructs* summaries). Alternative if the user wants
`BillingService` untouched: coerce in the handler with
`string.IsNullOrEmpty(billing.PlanType) ? "Free" : billing.PlanType` — rejected as defensive
plumbing that hides an incomplete value object.

### D5: `RegisterStorePaymentCommand` — comment only, confirmed by reading

`RegisterStorePaymentCommand.cs:67-69` reads:

```csharp
// Store must have been activated (PaymentStartDate != null)
if (store.PaymentStartDate is null)
    throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);
```

**Confirmed functionally unchanged.** The guard still fires for legacy `null` rows (which is exactly
what requirement "legacy rows stay null" preserves) and is now simply unreachable for
post-change stores. Only the word "activated" is stale — after this change a store's clock starts at
creation, not at activation. Refresh to something like *"Legacy rows can still carry a null start
date (no migration/backfill); new stores always carry one."* **No behavioural edit. No test targets
this line** — it is a comment.

### D6: Test 4's partner, and why test 4 is still worth keeping

Verified first-hand:
`rg 'AddJsonOptions|UnmappedMemberHandling|ConfigureHttpJsonOptions|JsonSerializerOptions'
backend/src/SMCA.WebApi` → **no matches**. System.Text.Json's default
`JsonUnmappedMemberHandling.Skip` applies, and `CreateStoreCommand` (`:17`) has no
`PaymentStartDate` member ⇒ an unknown `paymentStartDate` in the POST body is silently dropped at
model binding.

So **test 4 pins the absence of a field**, not a guard. It goes red the day someone adds
`PaymentStartDate` to `CreateStoreCommand` — worth keeping, but it exercises nothing live today, and
the design says so rather than letting a later reader mistake it for coverage.

**Test 5 is the live gate.** `UpdateStoreCommand` (`:26`) *does* carry `DateOnly? PaymentStartDate`,
and `UpdateStoreCommandHandler.cs:100-101` honours it only when `_httpContextService.IsSuperAdmin`.
Design of test 5:

| Concern | Resolution (read from source) |
|---|---|
| Can an OwnerAdmin reach `PUT /api/v1/stores/{id}` at all? | **Yes.** The action carries no method-level `[HasPermission]` (`StoresController.cs:93-103`); the class-level `[HasPermission(SuperAdmin, StoresAdmin)]` (`:27`) applies. `StoresAdmin` requires `[HasRoles(OwnerAdmin)] [HasFeature(Stores)] [HasModule(Management)]` (`StoreRoleFeatures.cs:192-195`). Empirically proven by two existing tests: `StoresByCurrentUserTests.cs:77-107` (OwnerAdmin fixture → **200** on a StoresController action) and `StoreUpdateTests.cs:140-150` (same class of fixture reaches the `payment-date` action and is rejected by its *method-level* `[HasPermission(SuperAdmin)]`, i.e. it cleared the class-level gate) |
| Then it reaches the handler | `UpdateStoreCommandHandler.cs:71-72` throws Forbidden unless `IsSuperAdminOrOwnerAdmin`; `HttpContextService.cs:50` = `IsSuperAdmin \|\| IsOwnerAdmin` ⇒ OwnerAdmin passes |
| Does the handler check ownership? | **No.** Any OwnerAdmin can `PUT` any store id. So the actor and the target store need not be related — use the API-created store as the target |
| Actor fixture | `AuthzSeed.SeedOwnerAdminAsync(_f, withManagementModule: true)` — the exact fixture proven at `StoresByCurrentUserTests.cs:79` |
| **Trap to design around** | The class-level filter (`HasPermissionAttribute.cs:86-92`) resolves `BillingService.GetStoreBillingSummaryAsync` for the **actor's own** store (`_httpContextService.StoreId`) and runs `FilterForBilling`. `AuthzSeed` seeds that store with `DateOnly.FromDateTime(DateTime.UtcNow)` — **the wall clock, not `Clock.Pin`**. A far-future pin would push the actor's own store toward `Vencido`. It survives (`Management` is `PriceIncluded=true`, so `FilterForBilling` keeps it and `Stores`/feature 73 stays allowed), but the margin is thin. **Rule: test 5 pins its clock near real "now" (see D7 — `AnchorClose`), not into the far future.** |
| Does the auto-activation branch interfere? | No. The target store already carries a start date from creation, so `UpdateStoreCommandHandler.cs:96` (`store.PaymentStartDate is null && hasPaidModuleRequested`) is skipped. Send the same module list used at creation |
| Fails for the right reason | Body carries `paymentStartDate: "2020-01-01"`. Today the `IsSuperAdmin` gate ignores it ⇒ green. Delete the gate at `:100` ⇒ red. That is a real branch |
| Not-a-403 assertion | Assert `200 OK` **before** asserting the date, so a fixture/authorisation regression is distinguishable from a guard regression |

### D7: Clock strategy for group C — one shared anchor, two pins per test

**Decision: a shared `const` anchor date for the whole suite, and each test pins twice — once at the
creation instant, once at the assertion instant.**

```csharp
// Chosen so no AddMonths lands on a short month: day-of-month = 10 everywhere.
private static readonly DateTimeOffset AnchorInstant = new(2026, 3, 10, 0, 0, 0, TimeSpan.Zero);
private static readonly DateOnly Start = new(2026, 3, 10);
```

With `trialMonths=1 / graceDays=5 / dueSoonDays=5` pinned by D2, and the boundaries read from
`StoreBillingUtils.cs:24-45`:

| Landmark | Formula | Date | Expected |
|---|---|---|---|
| creation / day one | `Start` | 2026-03-10 | `IsInTrial=true`, `AlDia` (test 8) |
| last trial day | `Start.AddMonths(1)` (inclusive, `:45`) | 2026-04-10 | `IsInTrial=true` |
| trial over | +1d | 2026-04-11 | `IsInTrial=false`, still `AlDia` (test 9) |
| first due | `Start.AddMonths(trialMonths + 1)` (`:28`) | 2026-05-10 | (test 10) |
| `PorVencer` opens | `due.AddDays(-5)` (`:37`, `>=`) | 2026-05-05 | (test 11) |
| `EnGracia` window | `due+1 … due+5` (`:36`, `>`) | 2026-05-11 … 2026-05-15 | (test 12, both ends) |
| `Vencido` | `> due.AddDays(5)` (`:35`) | 2026-05-16 | (tests 13, 14) |

Every date has day-of-month ≤ 16, and every intermediate `AddMonths` starts on the 10th, so
`AddMonths`' end-of-month clamping is never exercised — deliberately, since clamping is not what
these tests are about.

**Shared anchor, not per-test dates:** one table of landmarks that a reader can check against
`StoreBillingUtils` in one pass; a per-test date scheme forces re-deriving the arithmetic seven
times.

**The two-pin idiom is a real trap — spell it out in the file's header comment.**
`MutableDateTimeProvider.Pin` returns a scope whose `Dispose` calls `Reset()` (`:17,25`), which sets
`_pinned = null` — it does **not** restore an outer pin. So:

```csharp
// CORRECT — re-pin by calling Pin again; both scopes dispose at method exit.
using var atCreation = _fixture.Clock.Pin(AnchorInstant);
var store = await CreateStoreViaRegisterAsync();
using var atAssertion = _fixture.Clock.Pin(AnchorInstant.AddMonths(2).AddDays(6));
var me = await client.GetAsync("/api/v1/auth/me");

// WRONG — the inner block's Dispose unpins to WALL CLOCK, not back to AnchorInstant.
using (var atAssertion = _fixture.Clock.Pin(...)) { ... }
```

**Test 5 exception:** per D6 it uses a second anchor near real time,
`AnchorCloseInstant = DateTimeOffset.UtcNow.Date` (or a fixed date within a few days of it), so the
`AuthzSeed` actor's wall-clock-seeded store stays comfortably `AlDia`.

### D8: Store-creation strategy per test group

The rule that falls out of the ⚠ correction: **self-registration gives all six paid modules; use the
admin endpoint whenever a test needs a *known, small* module set.**

| Group | Path | Why |
|---|---|---|
| A (1-5) | `POST /api/v1/stores` as SuperAdmin | Explicit `moduleIds` per test: `[7]` free-only (test 3), `[7,6]` with a paid module (test 2) |
| B (6-7) | `POST /api/v1/auth/register` (anonymous) | The real self-registration path; `RegisterCommand.cs:91` sets `SelectedStoreId`, so the returned token is immediately usable against `/auth/me` |
| C (8-13) | register | Needs `SelectedStoreId` set for `/auth/me`, and needs `PlanType=Paid` to exercise the paid lifecycle |
| C (14) | `POST /api/v1/stores` with `moduleIds = [7, 6]`, then set that owner's `SelectedStoreId` in the DB | Test 14 asserts *which* module ids survive `FilterForBilling`; a crisp `contains 7 / does-not-contain 6` beats asserting against a ten-module set |
| D (15) | register | "absent from to-collect during trial" — status is `AlDia`, filtered at `GetStoresToCollectQuery.cs:88` |
| D (16) | `POST /api/v1/stores` with `moduleIds = [7]` | Free-only store must still appear in to-collect with `Amount = 0`; a registered store has paid modules and cannot show this |
| E (17) | register | The self-registered amount is the point of the test |
| F (18) | direct DB seed (`BillingSeed.SeedFreeStoreAsync`, which inserts `paymentStartDate: null` at `BillingSeed.cs:50`) | Legacy rows by definition never went through `CreateStoreService`. Pattern per `Billing/BackfillMigrationTests.cs` |

Why an admin-created store still reaches `/auth/me`: `CreateStoreCommandHandler.cs:57-61` sets
`SelectedStoreId` **only when the caller `IsOwnerAdmin`**. Calling as a SuperAdmin (the simple,
permission-filter-free path — `HasPermissionAttribute.cs:84` short-circuits for SuperAdmin) leaves it
unset, so tests 14 and 16 set the owner user's `SelectedStoreId` directly in the DB after creation.
Deliberate: creation still goes through the **real API**; only the "which store am I looking at"
pointer is seeded, exactly as `GetMeBillingStatesTests.cs:153` already does.

### D9: `RegisterStorePayment` for a brand-new store (test 17)

Reading `RegisterStorePaymentCommand.cs:86-92` with `trialMonths = 1` pinned:

- no prior payment ⇒ `lastPaidBeforeDate = null`
- `currentDue = GetNextDueDate(start, 1, null) = start.AddMonths(2)` (`StoreBillingUtils.cs:28`)
- `newDue = currentDue.AddMonths(1)` = **`start.AddMonths(3)`**

So the payment "advances from `start + 2 months`" **to `start + 3 months`**, and the persisted row
carries `PaymentBeforeDate = new DateTimeOffset(newDue.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero)`
with `Year`/`Month` from `newDue` (`:100-102`).

Assertions:

| Target | Expected | Source |
|---|---|---|
| HTTP | `200 OK`, `Succeeded=true`, `Data=true` | pattern of `RegisterStorePaymentTests.cs:151-154` |
| `StorePayment.Price` | **`3000f`** — six qualifying paid modules × `GetCurrentPrice(2000, 75, 0) = 500` | see ⚠ correction. Add an inline comment deriving it, so the next reader re-derives instead of guessing when the module seed changes |
| `PaymentBeforeDate` | `Start.AddMonths(3)` = 2026-06-10 (with `AnchorInstant`) | `:91-92` |
| `Year` / `Month` | `2026` / `6` | `:101-102` |
| `StorePaymentStatusId` | `(int)StorePaymentStatusType.Paid` | `:98` |
| `ByReSeller` | `false` (SuperAdmin caller) | `:108` |

Actor: a SuperAdmin client (`POST /api/v1/stores/{storeId}/payments` is
`[HasPermission(SuperAdmin, StorePaymentAdmin)]`, `StoresController.cs:165-166`).

**Deliberately not asserted:** `StoreBillingSummary.CurrentMonthAmount`. `BillingService.cs:81` sums
raw `m.Price` (⇒ 12000 for six modules) while `RegisterStorePayment` sums `GetCurrentPrice` (⇒ 3000).
That inconsistency is real, pre-existing, and **out of scope** for this change — recorded here so it
is a known gap rather than an accident.

### D10: Shape of `Billing/StoreCreationTrialTests.cs`

Follows the house pattern exactly (`StoreActivationTests.cs` is the closest template):

```csharp
[Collection("e2e")]
public sealed class StoreCreationTrialTests
{
    private readonly WebAppFixture _fixture;
    private readonly AppTestFactory _f;
    public StoreCreationTrialTests(WebAppFixture fixture) { _fixture = fixture; _f = fixture.Factory; }
```

- **Cleanup discipline: `try/finally` in every test, without exception.** Every existing E2E test
  does this (`StoreActivationTests.cs:45-67`, `StoreUpdateTests.cs:41-51`, …) because `smca_test` is
  shared and never dropped. Reuse the existing cleaners rather than writing new ones:
  `BillingSeed.CleanupAsync` (handles StorePayment → StoreModule → StoreRoleFeature → Store →
  ReSellerOwner → Owner → ReSeller → UserRole → User, `BillingSeed.cs:180-234`),
  `StoreSeed.CleanupStoreAsync` / `CleanupOwnerAsync`, `DbTestHelpers.CleanupUserAsync`,
  `AuthzSeed.CleanupStoreGraphAsync`, and — for every self-registered store, which creates its own
  tenant — `DbTestHelpers.CleanupTenantCascadeAsync(factory, tenantId)` (the pattern at
  `AuthRegisterSuccessTests.cs:63-72`).
- **Private helpers, local to the file** (no new shared seed class beyond `BillingConfigSeed`):
  - `CreateStoreViaApiAsync(IEnumerable<int> moduleIds)` → seeds SuperAdmin + owner, `POST /api/v1/stores`,
    asserts `201 Created`, returns `(Guid AdminId, string AdminLogin, StoreSeed.OwnerFixture Owner, Guid StoreId)`
  - `RegisterStoreAsync()` → `POST /api/v1/auth/register` with a unique login, asserts `201`, returns
    `(string Login, string Token, Guid UserId, Guid TenantId, Guid StoreId)`
  - `ReadPaymentStartDateAsync(Guid storeId)` → `db.Set<Store>().IgnoreQueryFilters().AsNoTracking()
    .FirstAsync(...)` then `.PaymentStartDate`. **`AsNoTracking` is required** — `BackfillMigrationTests.cs:58`
    documents the stale-tracked-entity bite
  - `MeAsync(HttpClient c)` → `GET /api/v1/auth/me` → `ApiResponse<CurrentUserDto>` via `ApiResponse.Json`
- **Reading the persisted row: go to the DB, not the response body.** The subject of this change is
  what is *persisted*; `StoreDto` is a separate contract. Use the
  `_f.Services.CreateScope()` → `GetRequiredService<ApplicationDbContext>()` idiom already used
  everywhere.
- **`StoreSeed.StoreRow` is deliberately NOT extended** with `PaymentStartDate`. It is consumed by
  other test classes; a local helper keeps the blast radius at zero.
- **Unique names everywhere** (`$"...-{Guid.NewGuid():N}"`) — `UpdateStoreCommandHandler.cs:78-79`
  and the create validator both reject duplicate store names, and `smca_test` accumulates rows.
- Rate limiting is a non-issue: `AddRateLimiter` is skipped when the environment is `"Testing"`
  (`SMCA.WebApi/Program.cs:110`) and `AppTestFactory.cs:17` sets exactly that.

### D11: `CreateStoreServiceTests` collateral

`CreateService()` (`:49-59`) constructs `new CreateStoreService(...)` with 7 arguments; the new 8th
parameter (D1) breaks it, and therefore **every one of the ~25 tests in the file**.

| Question | Decision |
|---|---|
| Mock | `private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;` initialised in the ctor alongside the other mocks (`:36-47`) — `Moq` and `Mock<IDateTimeProvider>` are already the established pattern (`BillingServiceTests.cs:22`, `GetStoresToCollectQueryTests.cs:29,48`) |
| Default setup | In `SetupDefaultSuccessfulScenarios()` (`:61-94`): `_mockDateTimeProvider.Setup(x => x.UtcNow).Returns(FixedNow);` with `private static readonly DateTimeOffset FixedNow = new(2026, 3, 10, 0, 0, 0, TimeSpan.Zero);`. **A default is mandatory** — an unconfigured `Mock<IDateTimeProvider>.UtcNow` returns `default(DateTimeOffset)` (0001-01-01), which would silently write a nonsense date in the ~24 tests that do not care about the clock |
| Factory | Append `_mockDateTimeProvider.Object` as the 8th argument in `CreateService()` — **one added line**, no re-ordering (this is precisely why D1 appends) |
| Rewrite of `:143-160` | `CreateStoreAsync_ShouldSetPaymentStartDate_NullInitially` → renamed **`CreateStoreAsync_ShouldSetPaymentStartDate_ToProviderToday`**; body unchanged except the assertion `result.PaymentStartDate.Should().BeNull()` (`:159`) → `result.PaymentStartDate.Should().Be(DateOnly.FromDateTime(FixedNow.UtcDateTime));`. This is **the only guaranteed RED outside E2E** |
| Extra triangulation | Optionally add `CreateStoreAsync_ShouldUseProviderClock_NotWallClock` — re-`Setup` the mock to a different instant and assert the store follows it. Cheap, and it pins the *injection* rather than a constant |
| Everything else | Untouched — the ctor change is otherwise mechanical |

### D12: What this design explicitly does NOT do

Ratifying the user decisions, so no later phase "improves" them away:

- **No test deletions.** All three tests in `Billing/StoreActivationTests.cs` stay (`:37`, `:71`,
  `:105`). They seed legacy rows directly via `BillingSeed.SeedFreeStoreAsync` (`:50`,
  `paymentStartDate: null`) and exercise the **update** path, which this change does not touch.
- **The `UpdateStore` activation conditional survives** (`UpdateStoreCommandHandler.cs:96-97`). It is
  the only way a legacy `null` row can ever start its clock.
- **No `hasPaidModule` gate** on `GetStoresToCollectQuery` / `StoreRepository.GetPaidStoresAsync`
  (`:129-137`, which filters on `PaymentStartDate != null` alone). Free-plan stores appearing with
  `Amount = 0` is accepted behaviour, pinned by test 16.
- **No EF migration, no backfill.** `Store.PaymentStartDate` is already `DateOnly?` (`Store.cs:33`).
- **No fix** for the `Math.Max(1, …)` divergence (D3) or the `CurrentMonthAmount` vs. payment-amount
  divergence (D9). Both recorded, neither touched.
- **No extraction** of the `BillingService` cache-key literals into shared constants (D3).

---

## Data Flow

```
POST /api/v1/stores            POST /api/v1/auth/register
   │ (SuperAdmin|OwnerAdmin)      │ (anonymous)
   ▼                              ▼
CreateStoreCommandHandler:54   RegisterCommandHandler:82
   └──────────────┬───────────────┘   (+ GetAvailableModulesToStore → 4 free + 6 paid)
                  ▼
       CreateStoreService.CreateStoreAsync
                  │
                  ├─ IDateTimeProvider.UtcNow  ← MutableDateTimeProvider in E2E (AppTestFactory:29-30)
                  │      └─ DateOnly.FromDateTime(.UtcDateTime)      [D1 — identical to UpdateStore:97]
                  ▼
       Store.Create(name, ownerId, approved, tenantId, today, address, description)   [Store.cs:62]
                  ▼
            Store row: PaymentStartDate = today   ← the assertion target of tests 1-6

GET /api/v1/auth/me
   ▼
GetMeQueryHandler:70 ─► BillingService.GetStoreBillingSummaryAsync
                             ├─ IMemoryCache (5 min, singleton)  ← evicted by BillingConfigSeed  [D3]
                             │    └─ ISystemConfigurationRepository  1 / 5 / 5  ← pinned rows    [D2]
                             ├─ IDateTimeProvider.UtcNow → today  ← Clock.Pin                    [D7]
                             └─ StoreBillingUtils.GetNextDueDate / IsInTrial / GetStatus
                             ▼
                      StoreBillingSummary{ PlanType, NextDueDate, IsInTrial, Status }
                             ▼
   CurrentUserDto{ PaymentDueDate, IsInTrial, PaymentStatus, +PlanType }              [D4]
                             │
   FilterForBilling(storeModules, billing) ──► StoreModuleIds  ← test 14's assertion target

GET /api/v1/stores/to-collect                POST /api/v1/stores/{id}/payments
   ▼                                             ▼
GetStoresToCollectQuery:61-63                RegisterStorePaymentCommand:86
   └─ ISystemConfigurationRepository  ←── UNCACHED on both of these paths  [D3]
```

## File Changes

| File | Action | Description |
|---|---|---|
| `Application/Services/Stores/CreateStoreService.cs` | Modify | +`IDateTimeProvider` as 8th ctor param + field; `:36` `null` → `DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime)` |
| `Application/Dtos/Authentication/CurrentUserDto.cs` | Modify | +`public string PlanType { get; set; } = "Free";` after `:22` |
| `Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs` | Modify | +`PlanType = billing.PlanType,` in the initializer at `:101-103` |
| `Application/Services/Billing/BillingService.cs` | Modify | +`PlanType = "Free"` in the store-not-found early return `:49-50` (scope addition, D4) |
| `Application/Features/.../RegisterStorePayment/RegisterStorePaymentCommand.cs` | Modify | **Comment only** at `:67-69` |
| `SMCA.WebApi.E2ETests/Infrastructure/BillingConfigSeed.cs` | **Create** | `PinAsync` → `IAsyncDisposable`; upsert + cache-evict + full restore (D2, D3) |
| `SMCA.WebApi.E2ETests/Billing/StoreCreationTrialTests.cs` | **Create** | 18 tests, `[Collection("e2e")]`, shared anchor, try/finally throughout (D7-D10) |
| `Application.Tests/Services/Stores/CreateStoreServiceTests.cs` | Modify | +mock provider + default setup; `CreateService()` 8th arg; rewrite+rename `:143-160` (D11) |
| `SMCA.WebApi.E2ETests/Billing/StoreActivationTests.cs` | **Unchanged** | All three tests kept (D12) |
| `Infrastructure/Migrations/*` | **Unchanged** | No migration (D12) |

## Test Inventory → Design Mapping

| # | Test | Path (D8) | Clock | Config pin |
|---|---|---|---|---|
| 1 | `Create_sets_paymentStartDate_to_today` | admin `[7]` | `AnchorInstant` | not needed |
| 2 | `Create_with_paid_module_sets_paymentStartDate_to_today` | admin `[7,6]` | `AnchorInstant` | not needed |
| 3 | `Create_with_free_only_modules_also_sets_paymentStartDate` | admin `[7]` | `AnchorInstant` | not needed |
| 4 | `Create_ignores_client_supplied_paymentStartDate` | admin `[7]` + stray `paymentStartDate` | `AnchorInstant` | not needed |
| 5 | `Update_by_non_superadmin_cannot_seed_paymentStartDate` | admin create, OwnerAdmin `PUT` | **`AnchorCloseInstant`** (D6) | not needed |
| 6 | `Register_creates_store_with_paymentStartDate_today` | register | `AnchorInstant` | not needed |
| 7 | `Register_store_reports_trial_in_billing_summary` | register | `AnchorInstant` | **required** |
| 8-13 | trial / due / PorVencer / EnGracia / Vencido boundaries | register | anchor + travel (D7 table) | **required** |
| 14 | `Vencido_store_keeps_only_free_modules` | admin `[7,6]` + seeded `SelectedStoreId` | anchor + `due+6` | **required** |
| 15 | `New_store_absent_from_to_collect_during_trial` | register | `AnchorInstant` | **required** (uncached path) |
| 16 | `Free_plan_store_shows_zero_amount_in_to_collect` | admin `[7]` | anchor + `due-3` | **required** (uncached path) |
| 17 | `RegisterStorePayment_succeeds_for_a_brand_new_store` | register | `AnchorInstant` | **required** (uncached path) |
| 18 | `Legacy_stores_with_null_paymentStartDate_are_not_retro_activated` | direct DB seed | any | not needed |

Tests 1-6 and 18 assert a persisted `DateOnly` only and never consult `SystemConfiguration`, so the
config pin is optional there. Applying `BillingConfigSeed.PinAsync` uniformly to all 18 is
acceptable and arguably safer against a future assertion being added — the tasks phase should pick
one rule and state it, rather than leaving it per-test judgement.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Tests ship unexecuted; a compile error or bad assertion reaches the user | **High** | Every construct above is copied from an existing, passing test. User runs the filtered command first |
| The ⚠ amount correction (3000 vs 500) is itself wrong because the deployed `smca_test` predates a module seed change | Low | The E2E DB is built by `MigrateAsync` (`WebAppFixture.cs:28`) and the model snapshot is the post-all-migrations state. If test 17 reports a different number, **re-derive from the persisted `StoreModule` rows before editing the assertion** |
| Cache-key literals drift from `BillingService.cs:60-62` | Low | Documented in D3; the helper's failure mode is a stale read, which shows up as a wrong date — not a silent pass |
| `BillingConfigSeed` leaves the Id-4 row behind on a hard test-process kill | Low | Values equal the current effective defaults, so a leftover row is behaviourally inert until someone generates the pending migration; noted in D2 |
| Test 5 goes 403 instead of exercising the guard | Med | Assert `200 OK` first (D6); pin near wall-clock (`AnchorCloseInstant`) |
| Someone "fixes" the two-pin idiom into a nested `using` block and silently unpins to wall clock | Med | Called out in D7 and to be repeated as a header comment in the test file |
| Free-only stores now report `Vencido` while owing `$0` | **Certain** | Accepted by the user; documented in `proposal.md` §Consequence; no module access is lost (`FilterForBilling` keeps `PriceIncluded`) |
| `CreateStoreServiceTests` ctor ripple | Med | D11 makes it mechanical: one mock, one default setup, one argument |
| Adding `PlanType = "Free"` to `BillingService`'s early return is unwanted scope | Low | Flagged, not smuggled (D4); one-line revert with the handler-side coercion as the alternative |

## Open Questions for the user

1. **Test 17's expected amount is `3000f`, not `500f`** — the proposal's facts table is wrong on that
   row (evidence in the ⚠ section). Confirm before apply, since it changes an assertion that was
   presented as verified.
2. **`BillingService.cs:49-50` gains `PlanType = "Free"`** (D4) — a one-property scope addition
   outside the proposal's file list. Accept, or take the handler-side coercion instead?
