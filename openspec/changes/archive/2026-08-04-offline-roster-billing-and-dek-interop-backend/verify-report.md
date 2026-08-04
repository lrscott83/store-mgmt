```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:049a98d6bf00a7797d4bd5746f0bf2349dbbea81abf9705b5701c2e680551dc2
verdict: pass
blockers: 0
critical_findings: 0
requirements: 9/9
scenarios: 16/16
test_command: dotnet test backend/src/SMCA.sln
test_exit_code: 0
test_output_hash: sha256:7d2f8e03e69301f16037baf850d4225283862b83295954f35db57fccf944bd3f
build_command: dotnet build backend/src/SMCA.sln
build_exit_code: 0
build_output_hash: sha256:6d7fc945cbf145a75d46664998d51962be57d3c4090f4785ac4e8a0c0f96f68d
```

## Verification Report

**Change**: offline-roster-billing-and-dek-interop-backend
**Version**: draft (2026-08-04)
**Mode**: Strict TDD (unit) + Standard (E2E) — per init nuance; hybrid store (openspec + engram)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 23 |
| Tasks complete | 23 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: ✅ Passed — `dotnet build backend/src/SMCA.sln`, exit 0, 0 errors (8 pre-existing NU1902/NU1903 package-vulnerability warnings, unrelated to this change).

**Tests**: ✅ 619 passed / 0 failed / 0 skipped — `dotnet test backend/src/SMCA.sln`, exit 0:
- Domain.UnitTests: 22/22
- Application.Tests: 313/313 (includes 8 handler tests + 3 KAT interop tests for this change)
- SMCA.WebApi.E2ETests: 284/284 (includes 15 ExportOfflineRosterTests for this change, up from 14 — the new `OwnerAdmin_export_roster_matches_me_output_for_user` parity test closes R5 S1; requires local Postgres 127.0.0.1:5432 smca_test/postgres/postgres — verified running)

The ERR/WRN log lines are expected error-path logging from the in-process test host (400/401/403/404 assertions, negative crypto cases), not failures.

**Coverage**: ➖ Not available (no coverage threshold configured; coverlet present but not thresholded per init).

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R4 Bundle Metadata | Bundle structure correct (v3, GUID bundleId, TTL ms diff, storeId) | `Handle_ConfiguredTtlAndVersion3_AppliesConfiguredTtl` (pinned clock, 7*msPerDay, v3), `Handle_SuperAdmin_ReturnsFullRosterWithTwoUsers` (35*msPerDay, GUID, storeId), `SuperAdmin_export_roster_returns_full_bundle`, `SuperAdmin_export_configuredTtl7_applies7Days` | ✅ COMPLIANT |
| R5 Per-User Shape | Shape matches /me output (Roles, FeatureIds, StoreModuleIds, role booleans) | `OwnerAdmin_export_roster_matches_me_output_for_user` (ExportOfflineRosterTests.cs:379) — exports as OwnerAdmin (tenant-scoped, apples-to-apples), compares roster user against `/auth/me` for the same user+store: `Roles`/`FeatureIds`/`StoreModuleIds` via `BeEquivalentTo`, `IsSuperAdmin`/`IsOwnerAdmin`/`IsReSeller` via `Be` | ✅ COMPLIANT |
| R5 Per-User Shape | Wrap fields populated in version 3 | `SuperAdmin_export_roster_returns_full_bundle` (WrappedDek/WrapSalt/WrapIv non-empty, WrapIterations==210000), `Handle_SuperAdmin_ReturnsFullRosterWithTwoUsers` | ✅ COMPLIANT |
| R5 Per-User Shape | Billing snapshot populated per user | `Handle_SuperAdmin_ReturnsFullRosterWithTwoUsers` (AlDia + due date + IsInTrial false), `OwnerAdmin_export_vencidoStore_exportsOnlyPriceIncludedModules` (Vencido, due non-null, false), `OwnerAdmin_export_noAplicaStore_exportsAllModules` (NoAplica, due null, false) | ✅ COMPLIANT |
| R13 FormatVersion Bump | Version 3 bundle | Unit + E2E `FormatVersion.Should().Be(3)` (`Handle_SuperAdmin_ReturnsFullRosterWithTwoUsers`, `SuperAdmin_export_roster_returns_full_bundle`, stability test) | ✅ COMPLIANT |
| R14 Billing Gate | Vencido exports only PriceIncluded | `Handle_VencidoStore_ExportsOnlyPriceIncludedModules` (Equal(7)), `OwnerAdmin_export_vencidoStore_exportsOnlyPriceIncludedModules` (only ManagementModuleId) | ✅ COMPLIANT |
| R14 Billing Gate | AlDia exports all modules | `Handle_AlDiaStore_ExportsAllModules` (7,6), `OwnerAdmin_export_aldiaStore_exportsAllModules` (both modules) | ✅ COMPLIANT |
| R14 Billing Gate | NoAplica exports all modules | `Handle_NoAplicaStore_ExportsAllModules` (7,6), `OwnerAdmin_export_noAplicaStore_exportsAllModules` (both modules, PaymentStartDate null) | ✅ COMPLIANT |
| R14 Billing Gate | Single filtered assignment feeds roles+features | Static: `ExportOfflineRosterQuery.cs:89` `FilterForBilling` → `storeModuleIds` → `:98` roles + `:109` featureIds; no reimplementation | ✅ COMPLIANT (static) |
| R15 Configurable TTL | Configured TTL applied | `Handle_ConfiguredTtlAndVersion3_AppliesConfiguredTtl` (7*msPerDay, pinned), `SuperAdmin_export_configuredTtl7_applies7Days` (row=7 → 7*msPerDay) | ✅ COMPLIANT |
| R15 Configurable TTL | Default TTL when unset | `SystemConfigurationRepository.cs:49` fallback `: 35` (static), `SuperAdmin_export_deletedTtlRow_usesDefault35` (delete row → 35*msPerDay) | ✅ COMPLIANT |
| R16 WrapIterations | Handler emits service-reported iterations | Unit asserts WrapIterations==210_000 copied from `WrappedDekResult.Iterations`; E2E wire `wrapIterations==210000`; `UnwrapDek` parameterized with `user.WrapIterations` (no second constant) | ✅ COMPLIANT |
| R17 DEK Recoverability | Recovered DEK byte-equals GetDek | `SuperAdmin_export_unwrappedDek_byteEqualsGetDek` (unwrap wire fields → byte-equal `GetDek(storeId)`) | ✅ COMPLIANT |
| R17 DEK Recoverability | Raw password fails decryption | `SuperAdmin_export_rawPassword_throwsAuthenticationTagMismatch` (AesGcm → `AuthenticationTagMismatchException`) | ✅ COMPLIANT |
| R18 KAT Vector + Interop | Interop green from committed vector, no WrapDek | `StoreKeyWrapInteropTests > Unwrap_committed_vector_reproduces_expectedDek` (KEK from documented params only; no `WrapDek` call) | ✅ COMPLIANT |
| R18 KAT Vector + Interop | Iteration drift fails | `StoreKeyWrapInteropTests > Iteration_drift_210001_fails_unwrap` (expects `AuthenticationTagMismatchException`) | ✅ COMPLIANT |
| R19 Online Regression | Online auth suite stays green, zero edits | Full suite green (284 E2E incl. auth-session/auth-http, 313 Application.Tests); `git status` shows zero edits to login/me/session paths | ✅ COMPLIANT |

**Compliance summary**: 16/16 scenarios compliant.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| R4 expiresAt via IDateTimeProvider + TTL | ✅ Implemented | `now.AddDays(ttlDays).ToUnixTimeMilliseconds()` (`ExportOfflineRosterQuery.cs:153`) |
| R5 4 new DTO props | ✅ Implemented | `OfflineRosterUserDto.cs:22-25` PaymentDueDate/IsInTrial/PaymentStatus/WrapIterations |
| R13 FormatVersion=3 | ✅ Implemented | `ExportOfflineRosterQuery.cs:40` |
| R14 FilterForBilling single feed | ✅ Implemented | `:89` single `storeModuleIds` feeds `:98`+`:109` |
| R15 GetOfflineRosterTtlDaysAsync + fallback 35 | ✅ Implemented | Interface `ISystemConfigurationRepository.cs:13`; impl `SystemConfigurationRepository.cs:46-50` |
| R15 Enum + seed + migration | ✅ Implemented | `SystemConfigurationType.cs:19-20` (=5); `HasData` "35"; migration `20260804125006_Add-OfflineRosterTtlDays` InsertData Id5/"OfflineRosterTtlDays"/"35" |
| R16 WrapIterations from service | ✅ Implemented | `StoreKeyWrapService.cs:41` `Iterations: KekIterations`; DTO `WrapIterations = wrapped.Iterations` (`:143`) |
| D1 Include + sm.Module | ✅ Implemented | `StoreModuleRepository.cs:33` `.Include(sm => sm.Module)`; `UpdateStoreCommand` uses only `StoreModule` scalars (verified lines 114-156) |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 Gate input — Include + sm.Module mapping | ✅ Yes | Include added; handler maps `sm.Module`; UpdateStoreCommand unaffected (scalars only) |
| D2 TTL plumbing (interface/impl/enum/seed/migration/fallback) | ✅ Yes | Full chain; fallback `: 35`; E2E delete-row proof |
| D3 WrappedDekResult 4th positional param | ✅ Yes | `IStoreKeyWrapService.cs:3`; named arg at call site |
| D4 Stability test kept + UnwrapDek parameterized | ✅ Yes | `SuperAdmin_export_twice_DEK_stability` kept; `UnwrapDek(..., int iterations)` at `:523` |
| D5 KAT vector (provenance, HKDF pin, drift check) | ✅ Yes | `docs/contracts/offline-roster-dek-kat.json` with `_header{provenance: dotnet-backend, backendCommitSha: d784a048…, dotnetVersion: 8.0.204}`; commit SHA matches HEAD `d784a0481a63c6d3f0eeb257dc51b4de925d72df` |
| D6 TestDtos +4 props | ✅ Yes | `RosterUserData` lines 78-81 (camelCase wire) |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ⚠️ | No formal `apply-progress` artifact in openspec or Engram for this change; tasks.md carries inline RED/GREEN annotations (3.1/3.2 RED, 3.3–3.5 GREEN; Phase 4 Standard-mode) |
| All tasks have tests | ✅ | 23/23 tasks have test files (unit handler tests, KAT interop tests, E2E tests) |
| RED confirmed (tests exist) | ✅ | Gate/TTL tests exist in `ExportOfflineRosterQueryHandlerTests.cs`; KAT tests in `StoreKeyWrapInteropTests.cs` |
| GREEN confirmed (tests pass) | ✅ | 11/11 change-specific unit+interop tests pass; 15/15 E2E pass; full suite 619/619 |
| Triangulation adequate | ✅ | Vencido/AlDia/NoAplica each covered at unit AND E2E; TTL configured+default both covered; /me parity covered by dedicated E2E |
| Safety Net for modified files | ⚠️ | No apply-progress safety-net log; E2E suite green confirms no regressions to shared paths (`StoreModuleRepository` Include verified harmless to `UpdateStoreCommand`) |

**TDD Compliance**: 4/6 checks passed, 2 ⚠️ (documentation-gap only — RED tests exist and pass; no evidence of protocol violation).

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (Application.Tests) | 313 (8 change-specific handler tests) | `ExportOfflineRosterQueryHandlerTests.cs` | xUnit + Moq + FluentAssertions |
| Interop (Application.Tests) | 3 | `StoreKeyWrapInteropTests.cs` | xUnit + FluentAssertions + KAT JSON |
| E2E (WebApi.E2ETests) | 284 (15 change-specific) | `ExportOfflineRosterTests.cs` | WebApplicationFactory + Postgres |
| **Total** | **619** | | |

### Assertion Quality
**Assertion quality**: ✅ All assertions verify real behavior (value assertions on FormatVersion, StoreModuleIds, expiresAt deltas, byte-equality of DEK, exception types, direct /me parity; no tautologies, no ghost loops — stability loop indexes by `roster1.Users.Count` with `Id` equality guard).

### Issues Found
**CRITICAL**: None
**WARNING**:
- No `apply-progress` artifact persisted for this change (openspec or Engram). Strict-TDD RED/GREEN evidence exists in tasks.md annotations and all RED tests pass on execution, so this is a documentation gap, not an evidence gap; future changes should persist apply-progress.
**SUGGESTION**:
- `Migration` name follows precedent but the migration timestamp (20260804125006) is later than HEAD commit date — cosmetic only.
- Consider asserting `PaymentStatus == "AlDia"` exactly in the AlDia E2E (currently `BeOneOf("AlDia","PorVencer")` — permissive to clock edge, acceptable).

### Verdict
PASS — all 23 tasks complete, build exit 0 (0 errors, 8 pre-existing NU warnings), full suite 619/619 green (incl. change-specific 11 unit+interop and 15 E2E), 9/9 requirements and 16/16 scenarios compliant. R5 "Shape matches /me output" now has direct runtime parity evidence: `OwnerAdmin_export_roster_matches_me_output_for_user` (ExportOfflineRosterTests.cs:379) asserts roster `Roles`/`FeatureIds`/`StoreModuleIds`/`IsSuperAdmin`/`IsOwnerAdmin`/`IsReSeller` equal `/auth/me` output for the same user+store, exported as OwnerAdmin to keep both endpoints tenant-scoped. No CRITICAL or WARNING findings block archive.