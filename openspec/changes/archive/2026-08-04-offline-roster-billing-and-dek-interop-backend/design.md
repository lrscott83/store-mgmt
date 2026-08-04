# Design: Offline Roster — Billing Gate, TTL & DEK Interop (Backend)

## Technical Approach

One combined change (explore Approach 1): the export handler mirrors `GetMeQuery` (billing summary → `StoreBillingUtils.FilterForBilling` → one `storeModuleIds` feeding roles + features), gains `IDateTimeProvider` + `ISystemConfigurationRepository` + `IBillingService`, bumps `FormatVersion` to 3, computes `expiresAt` from a configurable TTL, and copies the wrap service's reported iteration count onto the wire. DEK recoverability is pinned three ways: an E2E unwrap vs `GetDek` (plus raw-password negative case), a committed KAT vector consumed without re-wrapping, and `wrapIterations` on the wire killing the last drift channel. Wrap math and online endpoints are untouched (R19).

## Architecture Decisions

### D1: Gate input — Include + `sm.Module` mapping
| Option | Tradeoff | Decision |
|---|---|---|
| (a) `.Include(sm => sm.Module)` in `GetStoreModulesByIdAsync`, handler maps `sm.Module` | One query; second caller `UpdateStoreCommand.cs:110` reads only `StoreModule` scalars (harmless eager-load); unit mock `SetupStoreModules` must build real `Module` | **Selected** |
| (b) New repo method returning `Module` | Avoids touching shared method, but adds API surface and still forces the same mock rework | Rejected |
| `GetAvailableModulesByStoreIdAsync` | Availability-filtered semantics (`IsActive`, `Features.Any`, store/owner active) change the module set beyond billing | Rejected |

### D2: TTL plumbing
| Question | Answer |
|---|---|
| Interface | `Task<int> GetOfflineRosterTtlDaysAsync()` on `ISystemConfigurationRepository` (Domain), impl mirroring `GetDueSoonDaysAsync` (`:40-44`) with fallback `35` |
| Enum | `OfflineRosterTtlDays = 5` (next free value; `GetDisplayName()` = "OfflineRosterTtlDays") |
| Seed | `HasData` row in `SystemConfigurationEntityTypeConfiguration.cs` + **new migration** (`InsertData` Id 5 / Name / Value "35" — E2E runs `MigrateAsync`, precedent `20260727164714`) |
| Fallback | Repo ternary `: 35` (defense-in-depth; E2E delete-row test proves it end-to-end) |

### D3: `WrappedDekResult` shape
`record WrappedDekResult(string WrappedDek, string WrapSalt, string WrapIv, int Iterations)` — **append as 4th positional param** (named args at call sites). Break sites: `StoreKeyWrapService.cs:37` (use `Iterations: KekIterations` — single constant), unit mocks `ExportOfflineRosterQueryHandlerTests.cs:103,153`.

### D4: Stability test disposition
**Keep `SuperAdmin_export_twice_DEK_stability` as-is** (only coverage of salt/IV non-determinism per export) but parameterize `UnwrapDek` (`:266-285`) to take `iterations` and pass `user.WrapIterations` — otherwise the hardcoded `210_000` at `:273` survives as a second drift channel. The **new** GetDek-comparison test proves recoverability against the true DEK; different properties, both cheap.

### D5: KAT vector generation (once)
One-shot `[Fact]`/scratch program calling the **real** `StoreKeyWrapService.WrapDek` with fixed inputs, then deleted: `masterSecret` = committed test-only constant (explicitly not the production secret), `storeId` fixed Guid, `dek = HKDF.DeriveKey(SHA256, UTF8(masterSecret), 32, salt: null, info: UTF8(storeId.ToString("D")))` (exact `StoreDataKeyProvider` mirror), `storedPasswordHash = Base64(SHA256(UTF8("Password123")))`. Vector records `password`, `storedPasswordHash`, `wrapSalt`, `wrapIv`, `iterations` (from `result.Iterations`), `wrappedDek`, `expectedDek`, `storeId`, `masterSecret`, `_header{provenance: "dotnet-backend", backendCommitSha, dotnetVersion}`. Both pins need the salt/iv/iterations for unwrap; `masterSecret`+`storeId` enable the HKDF pin and TS reproducibility.

### D6: TestDtos
`RosterUserData` += `DateOnly? PaymentDueDate`, `bool IsInTrial`, `string PaymentStatus`, `int WrapIterations` (camelCase wire: `paymentDueDate`, `isInTrial`, `paymentStatus`, `wrapIterations`).

## Data Flow

```
ExportOfflineRosterQuery
  ├─ GetStoreModulesByIdAsync ──(Include Module)──► storeModules
  ├─ IBillingService.GetStoreBillingSummaryAsync ──► billing
  ├─ FilterForBilling(storeModules.Select(m=>m.Module), billing) ──► storeModuleIds
  │     └─ feeds GetStoreRoleFeaturesByUserIdAsync + GetAllowedFeatureIdsForUserAsync
  ├─ IDateTimeProvider.UtcNow + GetOfflineRosterTtlDaysAsync() ──► expiresAt
  ├─ WrapDek(...) ──► WrappedDek{WrappedDek, WrapSalt, WrapIv, Iterations} ──► WrapIterations
  └─ OfflineRosterDto{ FormatVersion=3, billing snapshot per user }
```

## File Changes

| File | Action | Description |
|---|---|---|
| `Application/Features/.../ExportOfflineRoster/ExportOfflineRosterQuery.cs` | Modify | +3 ctor deps; gate; v3; TTL via provider+config; 4 DTO props |
| `Application/Dtos/.../OfflineRosterUserDto.cs` | Modify | +`PaymentDueDate`/`IsInTrial`/`PaymentStatus`/`WrapIterations` |
| `Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs` | Modify | +`GetOfflineRosterTtlDaysAsync` |
| `Infrastructure/.../SystemConfigurationRepository.cs` | Modify | impl, fallback 35 |
| `Domain/Common/Enums/SystemConfigurationType.cs` | Modify | `OfflineRosterTtlDays = 5` |
| `Infrastructure/.../SystemConfigurationEntityTypeConfiguration.cs` | Modify | +HasData row "35" |
| `Infrastructure/Migrations/*Add-OfflineRosterTtlDays*` | Create | `InsertData` 5/"OfflineRosterTtlDays"/"35" + Down |
| `Infrastructure/.../StoreModuleRepository.cs` | Modify | `GetStoreModulesByIdAsync` + `.Include(sm => sm.Module)` |
| `Application/Abstractions/Authentication/IStoreKeyWrapService.cs` | Modify | `WrappedDekResult` +`int Iterations` |
| `Application/Services/Authentication/StoreKeyWrapService.cs` | Modify | `Iterations: KekIterations` |
| `Application.Tests/.../ExportOfflineRosterQueryHandlerTests.cs` | Modify | ctor deps; 4-arg results; v3; TTL; gate tests; `SetupStoreModules` builds `Module` |
| `Application.Tests/Services/Authentication/StoreKeyWrapInteropTests.cs` | Create | KAT consumption (no `WrapDek`); HKDF pin |
| `Application.Tests/Application.Tests.csproj` | Modify | link KAT JSON → output dir |
| `SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs` | Modify | v3; TTL configured+default; gate cases; parameterized `UnwrapDek`; GetDek test; negative case |
| `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` | Modify | `RosterUserData` +4 props |
| `docs/contracts/offline-roster-dek-kat.json` | Create | committed vector (new dir) |

## Interfaces / Contracts

```csharp
// IStoreKeyWrapService.cs
public sealed record WrappedDekResult(string WrappedDek, string WrapSalt, string WrapIv, int Iterations);
// ISystemConfigurationRepository.cs
Task<int> GetOfflineRosterTtlDaysAsync();
// OfflineRosterUserDto: + DateOnly? PaymentDueDate; bool IsInTrial; string PaymentStatus; int WrapIterations;
```

Handler assembly: `PaymentDueDate = billing.NextDueDate; IsInTrial = billing.IsInTrial; PaymentStatus = billing.Status.ToString(); WrapIterations = wrapped.Iterations;` — `expiresAt = _dateTimeProvider.UtcNow.AddDays(ttlDays).ToUnixTimeMilliseconds()`.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (strict TDD, RED first) | Gate (Vencido→PriceIncluded only; AlDia/NoAplica→all); TTL 7→`7*msPerDay`; v3; billing fields; `WrapIterations` from result | Handler tests with mocks; `SetupStoreModules` returns real `Module` objects |
| Interop (Application.Tests) | KAT: unwrap via documented params == `expectedDek`, no `WrapDek`; HKDF pin; iteration-drift red-check | Read linked JSON from output dir |
| E2E (Standard-mode, owners-* precedent) | Gate scenarios via `BillingSeed` (Vencido: `SeedPaidStoreAsync`+old start date+`Clock.Pin`; AlDia: +`SeedPaymentAsync`; NoAplica: `paymentStartDate:null`); TTL 7 (update row) + 35 (delete row); unwrap==`GetDek`; raw-password `AuthenticationTagMismatchException`; wire `wrapIterations` | `WebAppFixture`; row mutations in try/finally restore |
| Regression | `/auth/me`, `/login`, session (R19) | Zero edits; suite stays green |

## Ordering / Sequencing (compile-only-together groups)

1. **Atomic set A**: `WrappedDekResult` record + `StoreKeyWrapService` + unit mocks `:103,153` (record ctor break).
2. **Atomic set B**: enum + repo interface + impl + EF config + migration (enum must exist first).
3. **Atomic set C**: repo Include + handler + DTO + unit tests (ctor deps ↔ `CreateHandler`; `sm.Module` ↔ `SetupStoreModules`). Includes RED gate/TTL tests.
4. **Atomic set D**: TestDtos + E2E tests (v3/TTL/gate/GetDek/negative/UnwrapDek param).
5. **Atomic set E**: generate KAT (after A so `Iterations` is captured) → commit JSON + csproj link + interop tests.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Crypto parameters are pinned by tests instead (R17/R18).

## Migration / Rollout

New EF migration inserts the TTL row (Value "35"); no data rewrite. Existing deployed DBs gain the row on next migration — behavior unchanged (35). V3 bundle is a forward-compat contract break for the PWA; frontend follow-up is a recorded NON-GOAL (`at-rest-encryption-frontend`). Rollback: revert FormatVersion to 2, drop 4 DTO props + unfiltered list (one handler edit); TTL row removal falls back to 35 (same behavior); KAT/interop additive.

## Risks

| Risk | Mitigation |
|---|---|
| Test ripple (ctor break, `sm.Module` null-ref) | Atomic sets above; tasks list every call site |
| Shared-method Include affects `UpdateStoreCommand` | Verified: reads scalars only; E2E store suites guard |
| SystemConfiguration row mutation cross-test | Serialized `[Collection("e2e")]` + try/finally restore |
| Vector staleness / drift | Wire `wrapIterations` + interop red-check on 210001 |
| Diff > 400-line review budget | Tasks forecast; chained-PR decision = orchestrator |

## Spec Corrections

1. **R15 seed value**: migration seeds "35" explicitly (like PaymentGraceDays "5"); "no row" fallback still implemented and E2E-proven via row-delete — both spec scenarios remain true.
2. **R18 vector fields**: `masterSecret` is **included** (test-only constant) — required for the HKDF pin; production secret never committed.
3. Explore TTL "7-day recommendation" superseded by proposal fixed decision: **default 35** (connectivity-first).

## Open Questions

- None blocking. (`CreateHandler` param order for the +3 deps is cosmetic.)
