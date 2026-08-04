# Tasks: Offline Roster — Billing Gate, TTL & DEK Interop (Backend)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 600–900 authored (KAT JSON excluded) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single working-tree change (session override: no PRs) |
| Delivery strategy | single-pr (no commits/PRs this session) |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Focused test command | Runtime harness | Rollback boundary |
|------|------|----------------------|-----------------|-------------------|
| A | WrappedDekResult 4-arg break | `dotnet build backend/src/SMCA.sln` | N/A (compile-only) | revert record+service+mocks |
| B | TTL enum→repo→config→migration | `dotnet build backend/src/SMCA.sln` | N/A (schema seed) | drop migration + enum |
| C | Gate/TTL/v3/DTO + unit tests | `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~ExportOfflineRosterQueryHandlerTests"` | N/A (mocked) | revert handler/DTO/repo Include |
| D | TestDtos + E2E gate/TTL/DEK | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ExportOfflineRosterTests"` | WebAppFixture + `MigrateAsync` | revert TestDtos + E2E file |
| E | KAT capture→vector→interop | `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~StoreKeyWrapInteropTests"` | N/A (vector read-only) | delete KAT + interop tests |

Non-goals: no frontend work (plan 2 Task 4, owner `at-rest-encryption-frontend`); NO commits/PRs — implementation stays in the working tree.

## Phase 1: Group A — WrappedDekResult break (compile-together)

- [x] 1.1 `Application/Abstractions/Authentication/IStoreKeyWrapService.cs`: `WrappedDekResult` += 4th positional `int Iterations`.
- [x] 1.2 `Application/Services/Authentication/StoreKeyWrapService.cs:37`: construct with `Iterations: KekIterations` (single constant).
- [x] 1.3 `Application.Tests/.../ExportOfflineRosterQueryHandlerTests.cs:103,153`: both mocks → 4-arg `WrappedDekResult` (mechanical ripple).

## Phase 2: Group B — TTL config chain (enum→repo→config→migration)

- [x] 2.1 `Domain/Common/Enums/SystemConfigurationType.cs`: add `OfflineRosterTtlDays = 5`.
- [x] 2.2 `Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs`: add `Task<int> GetOfflineRosterTtlDaysAsync()`.
- [x] 2.3 `Infrastructure/.../SystemConfigurationRepository.cs`: impl mirroring `GetDueSoonDaysAsync` (:40-44), fallback `35`.
- [x] 2.4 `Infrastructure/.../SystemConfigurationEntityTypeConfiguration.cs`: `HasData` row "35".
- [x] 2.5 New migration `*Add-OfflineRosterTtlDays*` (precedent `20260727164714`): `InsertData` Id 5/"OfflineRosterTtlDays"/"35" + Down.

## Phase 3: Group C — Gate/TTL/v3/DTO + unit tests (STRICT TDD: RED first)

- [x] 3.1 RED `ExportOfflineRosterQueryHandlerTests.cs`: gate tests — Vencido → PriceIncluded only; AlDia/NoAplica → all; `SetupStoreModules` builds real `Module` (fix null-ref trap).
- [x] 3.2 RED same file: TTL 7 → `expiresAt == issuedAt + 7*msPerDay`; `FormatVersion == 3`; billing snapshot; `WrapIterations` from result.
- [x] 3.3 GREEN `Infrastructure/.../StoreModuleRepository.cs`: `GetStoreModulesByIdAsync` + `.Include(sm => sm.Module)`.
- [x] 3.4 GREEN `Application/.../ExportOfflineRosterQuery.cs`: +3 ctor deps (`IDateTimeProvider`, `ISystemConfigurationRepository`, `IBillingService`); `FilterForBilling` feeds roles+features; v3; `expiresAt = UtcNow.AddDays(ttl)`; populate 4 DTO props.
- [x] 3.5 GREEN `Application/Dtos/.../OfflineRosterUserDto.cs`: +`PaymentDueDate`/`IsInTrial`/`PaymentStatus`/`WrapIterations`.

## Phase 4: Group D — TestDtos + E2E (Standard-mode, owners-* precedent)

- [x] 4.1 `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs`: `RosterUserData` +4 props (`paymentDueDate`, `isInTrial`, `paymentStatus`, `wrapIterations`).
- [x] 4.2 `SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs`: v3 assertions; parameterize `UnwrapDek` (:266-285) with `iterations` ← `user.WrapIterations` (kills second 210_000 drift channel); keep stability test.
- [x] 4.3 Same file: gate E2E — Vencido (`SeedPaidStoreAsync`+old start+`Clock.Pin`) → only PriceIncluded; AlDia (+`SeedPaymentAsync`) / NoAplica (`paymentStartDate:null`) → all; try/finally restore.
- [x] 4.4 Same file: TTL E2E — row update 7 → `expiresAt == issuedAt + 7*86400*1000`; row delete → default 35.
- [x] 4.5 Same file: DEK recoverability — unwrap wire fields byte-equal `GetDek(storeId)`; raw password → `AuthenticationTagMismatchException`; wire `wrapIterations == 210000`.

## Phase 5: Group E — KAT capture → vector → interop (after A)

- [x] 5.1 One-shot: temp program/fact calls REAL `StoreKeyWrapService.WrapDek` (test-only `masterSecret`, fixed `storeId`, "Password123"; `dek = HKDF.DeriveKey(SHA256, UTF8(masterSecret), 32, null, UTF8(storeId))`); capture vector; DELETE generator.
- [x] 5.2 `docs/contracts/offline-roster-dek-kat.json`: D5 fields + `_header{provenance: "dotnet-backend", backendCommitSha, dotnetVersion}`.
- [x] 5.3 `Application.Tests/Application.Tests.csproj`: link KAT JSON → output dir.
- [x] 5.4 `Application.Tests/Services/Authentication/StoreKeyWrapInteropTests.cs`: read vector; unwrap via documented params only (NO `WrapDek`) == `expectedDek`; HKDF pin reproduces `expectedDek`.
- [x] 5.5 Same file: iteration-drift red-check — 210001 MUST fail (proves vector guards drift).
