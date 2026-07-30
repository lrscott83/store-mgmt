# Delta for Billing

> Delta spec for change `billing-debt-items-3-4-5`. Three independent debt items: configurable DueSoonDays, orphaned Domain.Tests folder, and `trialDays` rename.

## ADDED Requirements

### R3: Configurable DueSoonDays

The system MUST expose `DueSoonDays` as a configurable `SystemConfigurationType` entry with a database-backed repository accessor, replacing the current hardcoded `5`.

#### R3.1: SystemConfigurationType.DueSoonDays

`SystemConfigurationType` MUST add `DueSoonDays = 4`.

| Property | Value |
|----------|-------|
| Enum id | `4` |
| Default | `5` (returned when no row exists) |
| Accessor | `GetDueSoonDaysAsync()` returning `Task<int>` |

#### R3.2: ISystemConfigurationRepository.GetDueSoonDaysAsync()

`ISystemConfigurationRepository` MUST declare `Task<int> GetDueSoonDaysAsync()`.

#### R3.3: SystemConfigurationRepository.GetDueSoonDaysAsync()

`SystemConfigurationRepository` MUST implement `GetDueSoonDaysAsync()` returning `FirstOrDefaultAsync(c => c.Id == 4)?.Value ?? 5`.

#### R3.4: BillingService consumption

`BillingService.GetStoreBillingSummaryAsync()` MUST call `GetDueSoonDaysAsync()` instead of using the hardcoded literal `5` for the `dueSoonDays` parameter passed to `StoreBillingUtils.GetBillingStatus()`.

#### R3.5: GetStoresToCollectQueryHandler consumption

`GetStoresToCollectQueryHandler` MUST read `DueSoonDays` from the repository (via `ISystemConfigurationRepository`) instead of the hardcoded `5`.

#### Scenario: DueSoonDays=5 (default) — backward compatible

- GIVEN no `SystemConfiguration` row with `Id == 4` exists
- WHEN `GetDueSoonDaysAsync()` is called
- THEN it SHALL return `5`
- AND billing status computation behaves identically to today's hardcoded behavior

#### Scenario: DueSoonDays configured via database

- GIVEN a `SystemConfiguration` row with `Id == 4` and `Value == "7"`
- WHEN `GetDueSoonDaysAsync()` is called
- THEN it SHALL return `7`
- AND `PorVencer` window shifts accordingly (wider by 2 days)

#### Scenario: BillingService test uses mock

- GIVEN `BillingService` constructed with a mock `ISystemConfigurationRepository`
- WHEN `GetStoreBillingSummaryAsync` is invoked
- THEN the mock's `GetDueSoonDaysAsync()` SHALL be called and its return value used

#### Scenario: GetStoresToCollect test uses mock

- GIVEN `GetStoresToCollectQueryHandler` with a mock `ISystemConfigurationRepository`
- WHEN the handler filters stores by status
- THEN the mock's `GetDueSoonDaysAsync()` SHALL be called

## MODIFIED Requirements

### R1: Billing Status State Machine (DueSoonDays source)

(Previously: `dueSoonDays` was a hardcoded literal `5` in `BillingService` and `GetStoresToCollectQueryHandler`.)

The value of `dueSoonDays` MUST now come from `ISystemConfigurationRepository.GetDueSoonDaysAsync()` in both call sites. The behavioral logic of the state machine is unchanged.

#### Scenario: Full status progression — parameterized

- GIVEN `paymentStartDate = 2026-01-10`, `nextDueDate = 2026-03-10`, `dueSoonDays = 5` (from repo), `graceDays = 5`
- WHEN computing status for each `today`
- THEN results match original spec: AlDia at 03-04, PorVencer at 03-05/10, EnGracia at 03-11, Vencido at 03-16

### R5.1: BillingService — trialDays renamed to trialMonths

(Previously: variable named `trialDays` at `BillingService.cs:47`.)

The variable `trialDays` in `BillingService.GetStoreBillingSummaryAsync()` MUST be renamed to `trialMonths`. No behavioral change.

#### Scenario: Rename preserves semantics

- GIVEN the rename `trialDays` → `trialMonths` in `BillingService.cs`
- WHEN the solution is built and all tests run
- THEN build succeeds AND all tests pass
- AND all billing logic is unchanged

## REMOVED Requirements

### R4: Domain.Tests project folder

(Reason: orphaned duplicate of `Domain.UnitTests` — 3 stale files, no `.csproj`, no solution reference.)

The `backend/src/Domain.Tests/` directory MUST be deleted entirely. `SMCA.sln` MUST NOT reference `Domain.Tests` (verified absent).

#### Scenario: Folder deletion

- GIVEN `backend/src/Domain.Tests/` exists with 3 files
- WHEN the folder is deleted
- THEN the solution builds successfully
- AND no test is lost (all coverage lives in `Domain.UnitTests`)
