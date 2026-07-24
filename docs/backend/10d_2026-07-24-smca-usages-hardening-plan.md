# 10d — SMCA.WebApi Usages — Production Hardening / Bug-Fix Plan (self-contained)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans.
> Steps use `- [ ]`. **This plan changes production code.** It fixes the dedup parameter transposition, adds
> input validation, hardens the inactive-store path, and **flips the e2e pins in plan `10` that currently
> encode the buggy behavior**. Production code + its tests land together (work-unit-commits).

**Goal:** Make `POST /api/v1/usages/store-daily-usage` behave correctly and defensively:
1. **Dedup works** — fix the transposed repository call so cross-request duplicate days are deduped, and
   dedup duplicates within a single request.
2. **Bad input → 400, not 500** — validate `ActiveDays` (not null) and each `Day` (a parseable date).
3. **Inactive store → 400** — reject usage against an inactive selected store (consistent with the GET
   counts, which already exclude inactive-store usage).

**Scope note:** `Saved` is intentionally ignored (client-side sync flag) — **not changed**. The GET
endpoints are **not changed**.

## Root causes (code-cited)

- **Dedup transposition (the real dedup bug).** `IStoreUsageRepository.GetStoreUsageByStoreIdAndUserId(Guid
  storeId, Guid userId)` filters `usage.StoreId == storeId && usage.UserId == userId`
  (`StoreUsageRepository.cs:25-30`). The handler calls it **swapped**:
  `GetStoreUsageByStoreIdAndUserId(userId, storeId)` (`UpdateStoreDailyUsageCommand.cs:54`) → the WHERE
  becomes `StoreId == userId && UserId == storeId` → never matches → `usageDays` is always empty → **every
  requested day is inserted on every request, even exact cross-request duplicates**. Masked in production
  only by the client's `saved` flag.
- **Intra-request duplicates** — `[D1, D1]` inserts two rows (the filter only compares against the DB set,
  not within the request) (`UpdateStoreDailyUsageCommand.cs:56-57`).
- **No input validation** — `DateTime.Parse(day.Day)` is unguarded and there is no validator, so a malformed
  / empty `Day` or a null `ActiveDays` throws → `500` (`ErrorHandlerMiddleware` default branch).
- **No active-store check** — `_storeRepository.GetByIdAsync(storeId)` has only a tenant query filter
  (`StoreEntityTypeConfiguration.cs:18`), so an inactive store is accepted (`UpdateStoreDailyUsageCommand.cs:50-52`).

## Global Constraints

- Validators auto-register (`Application/DependencyInjection.cs:32` `AddValidatorsFromAssembly` +
  `ValidationBehavior` pipeline) → a new `AbstractValidator<UpdateStoreDailyUsageCommand>` runs before the
  handler. Validation failure → `Application.Exceptions.ValidationException` → **400** with `Errors[].Code =
  the property name** (house contract, per `08` §2).
- Reuse the existing `StoreNotFound` resx key for the inactive-store rejection (no new key). Add one new key
  `InvalidDateFormat` to **both** `I18n.resx` and `I18n.en.resx`.
- Do NOT change the `Saved` handling or the GET handlers.
- Human runs ALL git and `dotnet test`. Every Checkpoint is a PAUSE.

## File Structure

- Modify: `backend/src/Application/Features/Management/Usages/Commands/UpdateStoreDailyUsage/UpdateStoreDailyUsageCommand.cs`
- Create: `backend/src/Application/Features/Management/Usages/Commands/UpdateStoreDailyUsage/UpdateStoreDailyUsageCommandValidator.cs`
- Modify: `backend/src/Resources/Localization/I18n.resx`, `backend/src/Resources/Localization/I18n.en.resx`
- Modify (test flips): `backend/src/SMCA.WebApi.E2ETests/Usages/StoreDailyUsageTests.cs`
- Modify (docs): `docs/backend/10_2026-07-24-smca-usages-e2e-{test,implementation}-plan.md`

---

## Task 1: Fix the dedup (transposition + intra-request Distinct)

**Files:** Modify `UpdateStoreDailyUsageCommand.cs`.

- [ ] **Step 1: Correct the transposed repository call** (`:54`)

```csharp
// before: GetStoreUsageByStoreIdAndUserId(userId, storeId)
IEnumerable<StoreUsage> usages = await _storeUsageRepository.GetStoreUsageByStoreIdAndUserId(storeId, userId);
```

- [ ] **Step 2: Dedup within the request** (`:56`) — add `.Distinct()`

```csharp
List<DateTime> days = request.ActiveDays
    .Select(day => DateTime.SpecifyKind(DateTime.Parse(day.Day), DateTimeKind.Utc))
    .Distinct()
    .ToList();
days = days.Where(day => !usageDays.Contains(day)).ToList();
```

- [ ] **Step 3: Flip the intra-request test** in `StoreDailyUsageTests.cs` — `[D1,D1,D2]` now inserts 2 rows

```csharp
[Fact] // (10d) intra-request duplicates are deduped -> [D1,D1,D2] inserts 2 rows
public async Task Post_duplicate_days_within_request_dedup_inserts_two()
{
    var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
    try
    {
        var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20", "2026-07-20", "2026-07-21"));
        r.StatusCode.Should().Be(HttpStatusCode.OK);
        (await CountUsagesAsync(store.StoreId)).Should().Be(2);
    }
    finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
}
```

> `Post_duplicate_day_returns_200_false_no_insert` and `Post_mixed_new_and_existing_days_inserts_only_new`
> (plan `10`) **already assert the correct post-fix behavior** — they were failing against the transposed
> code and start passing now. No edit needed; just re-run them.

- [ ] **Step 4: Run** — `dotnet test backend/src/SMCA.WebApi.E2ETests --filter ~StoreDailyUsageTests`.
  Expected: the 3 dedup tests (`..._duplicate_day...`, `..._mixed...`, `..._within_request_dedup_inserts_two`) PASS.
- [ ] **Step 5: Checkpoint** — `fix(usages): dedup store-daily-usage (repo arg transposition + intra-request Distinct)`.

---

## Task 2: Validate input → 400 instead of 500

**Files:** Create `UpdateStoreDailyUsageCommandValidator.cs`; modify both `I18n` resx files; flip 3 tests.

- [ ] **Step 1: Add the `InvalidDateFormat` key to both resx files**

`I18n.resx` (default / es), next to `StoreNotFound`:
```xml
<data name="InvalidDateFormat" xml:space="preserve">
  <value>El formato de fecha de {0} es inválido.</value>
</data>
```
`I18n.en.resx`:
```xml
<data name="InvalidDateFormat" xml:space="preserve">
  <value>{0} has an invalid date format.</value>
</data>
```

- [ ] **Step 2: Create the validator** (auto-registered by `AddValidatorsFromAssembly`)

```csharp
using Application.Dtos.Management.Usages;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.Management.Usages.Commands.UpdateStoreDailyUsage
{
    public class UpdateStoreDailyUsageCommandValidator : AbstractValidator<UpdateStoreDailyUsageCommand>
    {
        public UpdateStoreDailyUsageCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.ActiveDays)
                .NotNull().WithMessage(localizer["IsRequired", "{PropertyName}"]);

            RuleForEach(x => x.ActiveDays).ChildRules(day =>
            {
                day.RuleFor(d => d.Day)
                    .NotNull().WithMessage(localizer["IsRequired", "{PropertyName}"])
                    .NotEmpty().WithMessage(localizer["IsRequired", "{PropertyName}"])
                    .Must(BeParseableDate).WithMessage(localizer["InvalidDateFormat", "{PropertyName}"]);
            });
        }

        private static bool BeParseableDate(string day) => DateTime.TryParse(day, out _);
    }
}
```

- [ ] **Step 3: Flip the three 500-pins to 400** in `StoreDailyUsageTests.cs` (rename + assert `BadRequest`)

```csharp
[Fact] // (10d) malformed date -> validator -> 400
public async Task Post_malformed_date_returns_400()
{
    var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
    try
    {
        var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage",
            new { ActiveDays = new[] { new { Day = "not-a-date", Saved = true } } });
        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
    finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
}

[Fact] // (10d) empty Day -> validator -> 400
public async Task Post_empty_day_string_returns_400()
{
    var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
    try
    {
        var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage",
            new { ActiveDays = new[] { new { Day = "", Saved = true } } });
        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
    finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
}

[Fact] // (10d) null ActiveDays -> validator -> 400
public async Task Post_missing_activeDays_returns_400()
{
    var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
    try
    {
        var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", new { });
        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
    finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
}
```

> `Post_empty_activeDays_returns_200_false` (empty array, not null) is **unaffected** — `NotNull` passes and
> `RuleForEach` over an empty list raises nothing → handler runs → `200 { Data:false }`.

- [ ] **Step 4: Run** — `--filter ~StoreDailyUsageTests`. Expected: the 3 flipped tests PASS as 400; the
  empty-array test still PASS as 200.
- [ ] **Step 5: Checkpoint** — `fix(usages): validate store-daily-usage input (ActiveDays + Day) -> 400`.

---

## Task 3: Reject usage against an inactive store

**Files:** Modify `UpdateStoreDailyUsageCommand.cs`; flip 1 test.

- [ ] **Step 1: Add the active-store check** (`:50-52`) — reuse `StoreNotFound`

```csharp
Guid storeId = _httpContextService.StoreId.ToGuid();
var store = await _storeRepository.GetByIdAsync(storeId);
if (store == null || !store.IsActive)
    throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);
```

- [ ] **Step 2: Flip the inactive-store test** in `StoreDailyUsageTests.cs`

```csharp
[Fact] // (10d) usage against an inactive store is rejected
public async Task Post_against_inactive_store_returns_400()
{
    var (adminId, client, store) = await SeedAdminWithSelectedStoreAsync();
    await StoreSeed.DeactivateStoreAsync(_f, store.StoreId);
    try
    {
        var r = await client.PostAsJsonAsync("/api/v1/usages/store-daily-usage", Body("2026-07-20"));
        r.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
    finally { await CleanupUsagesAsync(store.StoreId); await StoreSeed.CleanupStoreFixtureAsync(_f, store); await DbTestHelpers.CleanupUserAsync(_f, adminId); }
}
```

- [ ] **Step 3: Run** — `--filter ~StoreDailyUsageTests`. Expected: PASS as 400.
- [ ] **Step 4: Checkpoint** — `fix(usages): reject store-daily-usage for an inactive selected store`.

---

## Task 4: Sync the plan `10` docs + full-suite green

**Files:** Modify `docs/backend/10_...-test-plan.md` and `10_...-implementation-plan.md`.

- [ ] **Step 1:** In both plan-`10` docs, update the affected test names/expectations to the post-fix
  behavior: `Post_duplicate_days_within_request_dedup_inserts_two` (2 rows), `Post_malformed_date_returns_400`,
  `Post_empty_day_string_returns_400`, `Post_missing_activeDays_returns_400`,
  `Post_against_inactive_store_returns_400`. Move these out of the "latent robustness pins" note (§5) — they
  are now **enforced behavior**, not pinned bugs. Keep the dedup transposition note as the root cause the
  suite now guards.
- [ ] **Step 2: Run the whole suite** — `dotnet test backend/src/SMCA.WebApi.E2ETests` **and**
  `dotnet test backend/src/Application.Tests` → PASS.
- [ ] **Step 3: Checkpoint** — `docs(usages): sync plan 10 with the hardening fixes`.

---

## Self-Review

- **Every chosen fix implemented:** dedup transposition + intra-request `Distinct` (Task 1), input validation
  → 400 (Task 2), inactive-store rejection (Task 3). `Saved` deliberately untouched (correct as-is).
- **Tests flipped, not left contradictory:** 5 pins updated to enforced behavior
  (`within_request_dedup_inserts_two`, 3× `...returns_400`, `inactive_store...returns_400`); 2 dedup tests
  (`duplicate_day`, `mixed`) start passing without edits.
- **No collateral change:** GET handlers, the `Saved` flag, and the empty-`ActiveDays` `200 false` path are
  untouched; `StoreNotFound` reused (only `InvalidDateFormat` added, to both cultures).
- **Type consistency:** validator uses `AbstractValidator<UpdateStoreDailyUsageCommand>` +
  `IStringLocalizer<I18n>` (matches `CreateOwnerCommandValidator`); `store.IsActive` per the `Store` entity;
  `GetStoreUsageByStoreIdAndUserId(storeId, userId)` per the interface signature.
- **Risk:** rejecting inactive-store usage changes runtime — a user whose selected store is deactivated will
  get `400` from `registerActivity`. Accepted per the scope decision (consistency with the GET exclusion).
