# Proposal: Offline Roster — Billing Gate, TTL & DEK Interop (Backend)

## Intent

Four gaps, one change:
- **Licensing hole**: export ships every module regardless of payment status — the paid-module lock does not exist offline.
- **No re-derivable gate**: DTO lacks billing snapshot fields, so the device cannot enforce the lock.
- **Bundle outlives billing**: `expiresAt = now + 35 days` hardcoded vs a monthly cycle.
- **Unproven DEK recoverability**: nothing proves a wrapped DEK is recoverable by a non-backend consumer; failure = unreadable data.

## Scope

### In Scope
- Combined change: plan 1 Tasks 1–3 + plan 2 Tasks 1–3 (Task 1 re-scoped: unwrap-vs-`GetDek`, raw-password negative case, wire `wrapIterations`).
- Gate via `StoreBillingUtils.FilterForBilling` — one filtered assignment feeds roles + features.
- Billing snapshot + `WrapIterations` on `OfflineRosterUserDto`; `FormatVersion` 2→3.
- TTL via `ISystemConfigurationRepository.GetOfflineRosterTtlDaysAsync`, default **35 days**; enum + seed.
- `IDateTimeProvider` injection; `WrappedDekResult.Iterations` surfaced (ctor break ripples).
- KAT `docs/contracts/offline-roster-dek-kat.json` + `StoreKeyWrapInteropTests.cs`; `TestDtos.cs` gains.
- One-pass merge of both plans' shared-file edits.

### Out of Scope (Non-Goals)
- Plan 2 Task 4 frontend follow-up — recorded, NOT implemented (owner: `at-rest-encryption-frontend`).
- Wrap math unchanged; `/auth/me`, `/login` untouched; no commits/PRs this session.

## Capabilities

### New Capabilities
None — all changes extend an existing capability.

### Modified Capabilities
- `offline-auth`: gate `storeModuleIds` via `FilterForBilling`; DTO gains billing snapshot + `WrapIterations`; `FormatVersion` 2→3; `expiresAt` from config TTL (default 35); iterations on wire; DEK recoverability pinned (GetDek comparison, negative case, KAT).

## Approach

- Mirror `GetMeQuery`: `IBillingService.GetStoreBillingSummaryAsync` → `FilterForBilling` (no `PriceIncluded` reimplementation).
- Config TTL follows `GetDueSoonDaysAsync` (`SystemConfigurationRepository.cs:40-44`) incl. fallback; repo home: `Domain/Interfaces/Repositories/`.
- `WrappedDekResult.Iterations` reports what the service used — no second constant copy.
- KAT: capture one real output; interop test reads the vector without re-wrapping; HKDF derivation pinned.
- Gate input: design picks Include + `sm.Module` mapping vs new repo method (NOT `GetAvailableModulesByStoreIdAsync`: different semantics).

## Alternatives Considered

- Two sequential changes — rejected (same files edited twice; rebase conflict).
- Availability-filtered repo method — rejected (changes module-set semantics).
- Hardcoded TTL — rejected (config needed for policy change without redeploy).

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `ExportOfflineRosterQuery.cs` | Modified | gate, billing fields, v3, config TTL, clock, wrapIterations |
| `OfflineRosterUserDto.cs` | Modified | +4 props |
| `IStoreKeyWrapService.cs` + `StoreKeyWrapService.cs` | Modified | `WrappedDekResult.Iterations` (ctor break) |
| `ISystemConfigurationRepository.cs` + impl | Modified | TTL accessor, enum +5, seed |
| `ExportOfflineRosterQueryHandlerTests.cs` | Modified | ctor deps, 4-arg result, v3, TTL, `SetupStoreModules` + Module |
| `ExportOfflineRosterTests.cs` (E2E) | Modified | gate cases, TTL, unwrap-vs-GetDek, negative case, wire iterations |
| `TestDtos.cs` (E2E) | Modified | RosterUserData + billing + WrapIterations |
| `StoreKeyWrapInteropTests.cs` | New | KAT consumption |
| `docs/contracts/offline-roster-dek-kat.json` | New | committed vector (dir new) |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| PWA breaking: v3 bundles unreadable until frontend ships | Med | forward-compatible per archived spec; frontend Task 4 queued |
| Test-file ripple (ctor break, `sm.Module` null-ref) | High | mechanical; in scope/tasks |
| Low-connectivity re-provisioning regressions | Low | 35-day default preserved |
| Combined diff > 400-line budget | Med | tasks forecast; delivery = orchestrator call |

## Rollback Plan

Revert = restore `FormatVersion` 2, drop 4 DTO props, unfiltered module list (one handler edit); TTL row removal reverts to 35 days (same behavior); KAT/interop additive/deletable; E2E gate blocks merge first.

## Dependencies

- Frontend follow-up (plan 1 Task 4 doc, plan 2 Task 4) queued as release order.
- `StoreBillingUtils.FilterForBilling` / wrap math — read-only references.

## Success Criteria

- [ ] `Vencido` export excludes non-`PriceIncluded` modules; `AlDia`/`NoAplica` unchanged.
- [ ] `formatVersion == 3`; billing fields + `wrapIterations` populated per user.
- [ ] `expiresAt == issuedAt + configured TTL` (35 default).
- [ ] E2E: recovered DEK byte-equals `GetDek(storeId)`; raw password throws `AuthenticationTagMismatchException`.
- [ ] KAT interop + HKDF pin green (no `WrapDek` re-wrap).
- [ ] `dotnet test backend/src/SMCA.sln` green.
