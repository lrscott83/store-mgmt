# Archive Report: Offline Roster — Billing Gate, TTL & DEK Interop (Backend)

**Change**: offline-roster-billing-and-dek-interop-backend
**Archived**: 2026-08-04
**Mode**: hybrid (openspec + engram) — Engram MCP **not exposed** in the archiving session; archive artifact persisted on the openspec filesystem side only. The engram `sdd/offline-roster-billing-and-dek-interop-backend/archive-report` observation was NOT written; downstream engram consumers must treat this filesystem artifact as the terminal record.
**Verification verdict**: PASS — 9/9 requirements, 16/16 scenarios, 0 critical findings (per `verify-report.md`, evidence_revision `sha256:049a98d6…`, 2026-08-04).

## Summary

Archived the combined backend change that closed four offline-roster gaps: the paid-module licensing hole (billing gate), the missing re-derivable gate inputs (billing snapshot + `WrapIterations` on the DTO), the hardcoded 35-day bundle TTL (config-driven), and unproven DEK recoverability (E2E unwrap proof + committed KAT vector + interop test).

## Requirements Delivered (final state)

Delta merged into `openspec/specs/offline-auth/spec.md` (source of truth):

| Requirement | Action | Final state |
|---|---|---|
| R4 Bundle Metadata | MODIFIED | `expiresAt` = `issuedAt + TTL days` (TTL via `GetOfflineRosterTtlDaysAsync()`, default 35); `issuedAt` via `IDateTimeProvider`; `formatVersion` always 3 |
| R5 Per-User Data Shape | MODIFIED | DTO now carries `PaymentDueDate`, `IsInTrial`, `PaymentStatus`, `WrapIterations` (+4 props); wrap-fields scenario updated to version 3; billing-snapshot scenario added |
| R13 Bundle FormatVersion Bump | MODIFIED | `FormatVersion = 3` (up from 2) |
| R14 Billing Gate on Exported Modules | ADDED | `StoreBillingUtils.FilterForBilling` gates `storeModuleIds`; single filtered assignment feeds roles + features; Vencido → PriceIncluded only, AlDia/NoAplica → all |
| R15 Configurable Bundle TTL | ADDED | `ISystemConfigurationRepository.GetOfflineRosterTtlDaysAsync()` + enum (`OfflineRosterTtlDays = 5`) + seed row + fallback 35 |
| R16 WrapIterations Surfaced from Service | ADDED | `WrappedDekResult` 4th positional `int Iterations`; single constant `KekIterations`; no second copy |
| R17 DEK Recoverability — E2E Proof | ADDED | Wire-fields-only unwrap byte-equals `GetDek(storeId)`; raw password → `AuthenticationTagMismatchException` |
| R18 DEK KAT Vector + Interop Test | ADDED | `docs/contracts/offline-roster-dek-kat.json` (provenance: `dotnet-backend`, commit SHA `d784a048…`, .NET 8.0.204) + `StoreKeyWrapInteropTests` (no `WrapDek`); HKDF pin; iteration-drift red-check (210001 fails) |
| R19 Online Endpoints Regression | ADDED | `/auth/me`, `/login`, session logic untouched; online suites stay green |

All 19 requirements (R1–R19) preserved; only delta-touched requirements were modified.

## Verification Evidence (final state)

Per `verify-report.md` (intermediate snapshot, 2026-08-04) and the orchestrator's final-state facts (outrank snapshots for work completed after):

- Build: exit 0, 0 errors (8 pre-existing NU1902/NU1903 warnings, unrelated).
- Full suite: **619/619** passing — Domain 22, Application 313 (incl. 3 KAT interop), E2E 284 (incl. 15 roster tests).
- R5 S1 ("Shape matches /me output") closed by `OwnerAdmin_export_roster_matches_me_output_for_user` (ExportOfflineRosterTests.cs:379).
- Migration `20260804125006_Add-OfflineRosterTtlDays` applied to local DB `smca`; committed-style script at `backend/scripts/07-20260804-Add-OfflineRosterTtlDays.sql`.
- KAT vector committed-style at `docs/contracts/offline-roster-dek-kat.json`.
- Compliance: 16/16 scenarios compliant (Vencido/AlDia/NoAplica at unit + E2E; TTL configured + default; GetDek byte-equality; raw-password negative; KAT interop + drift).

## Task Completion

`tasks.md`: 23/23 implementation tasks checked `[x]` — no unchecked implementation tasks at archive time. Task Completion Gate passed without reconciliation. (The `proposal.md` success-criteria checkboxes and the delta spec's verification-criteria checkboxes remain unchecked as written during their phases; they are forward-looking checklists, not implementation tasks — the base spec's Verification Criteria section now records the checked final state.)

## Non-Goals Recorded (pending future work)

- **Frontend follow-up** (plan 2 Task 4 / plan 1 Task 4 doc): consuming `formatVersion: 3`, billing fields, and `wrapIterations` in the PWA. Recorded as a NON-GOAL of this change; **owner: `at-rest-encryption-frontend`**. PWA risk: v3 bundles are unreadable by the current frontend until that follow-up ships (forward-compatible contract break, per proposal risk table).

## Delivery State (working tree, uncommitted)

Per session constraint: **no commits, no PRs were made**. Implementation is complete in the working tree; HEAD remains `d784a0481a63c6d3f0eeb257dc51b4de925d72df`. Affected paths (modified + untracked) include:

- `backend/src/Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs`
- `backend/src/Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs`
- `backend/src/Application/Abstractions/Authentication/IStoreKeyWrapService.cs`, `backend/src/Application/Services/Authentication/StoreKeyWrapService.cs`
- `backend/src/Domain/Common/Enums/SystemConfigurationType.cs`, `backend/src/Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs`
- `backend/src/Infrastructure/Persistence/Repositories/{SystemConfigurationRepository,StoreModuleRepository}.cs`, `SystemConfigurationEntityTypeConfiguration.cs`
- `backend/src/Infrastructure/Migrations/20260804125006_Add-OfflineRosterTtlDays.*`
- `backend/scripts/07-20260804-Add-OfflineRosterTtlDays.sql`
- `backend/src/Application.Tests/.../ExportOfflineRosterQueryHandlerTests.cs`, `backend/src/Application.Tests/Services/Authentication/StoreKeyWrapInteropTests.cs`, `Application.Tests.csproj`
- `backend/src/SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs`, `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs`
- `docs/contracts/offline-roster-dek-kat.json`

Next step for the orchestrator: commit the working tree (conventional commit) and open the PR when the session allows.

## Observations / Notes

- Verify report WARNING (documentation gap, non-blocking): no `apply-progress` artifact was persisted for this change; RED/GREEN evidence lives in tasks.md annotations and test execution.
- Verify report SUGGESTION (cosmetic): migration timestamp (20260804125006) is later than HEAD commit date; permissive `BeOneOf("AlDia","PorVencer")` assertion acceptable.
- No CRITICAL findings — archive gate cleared without override.
- Archive naming follows convention `YYYY-MM-DD-{change-name}`; `openspec/changes/archive/` pre-existed.
- Engram side of the hybrid store could not be written (no mem tools exposed this session) — noted above.
