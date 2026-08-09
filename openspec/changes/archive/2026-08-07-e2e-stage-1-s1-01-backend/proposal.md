# Proposal: S1-01 backend — close 6 register data-assertion gaps (ADD-ONLY E2E)

Change: `e2e-stage-1-s1-01-backend` · Branch: `feat/e2e-stage-1-s1-01-backend`

## Intent

`S1-01.md:53-59` marks 8 backend assertions `[x]`; only `PaymentStartDate`/`ExpiresIn` have E2E coverage. The other 6 describe `RegisterCommand.cs` behavior no E2E test asserts. Close the 6 gaps with one new ADD-ONLY test file. No existing test or production code is touched (CLAUDE.md rule).

## Scope

### In Scope
- New `Auth/AuthRegisterDataAssertionsTests.cs` (`SMCA.WebApi.E2ETests.Auth`), one `[Fact]` per fact:
  1. `user.SelectedStoreId == store.Id`
  2. `owner.Description == "Nombre de la tienda: " + storeName`
  3. `store.Description == "Tienda de prueba"` and `Approved == false`
  4. StoreModules set == runtime-derived `GetAvailableModulesToStore()` set, ≥1 paid (`PriceIncluded == false`) — H-1 regression
  5. `AuthDto.RefreshToken`/`RefreshTokenExpiresAt` null
  6. Matching `Code` creates `ReSellerOwner` (`ReSellerId`/`OwnerId`/discounts copied)
- Doc correction: `S1-01.md:53-59` 6 checkboxes `[x]`→`[ ]` + note "verified by code reading; covered by new tests after this change".

### Out of Scope
- Zero production-code changes; zero edits to existing E2E tests (`AuthRegisterSuccessTests.cs` untouched).
- No frontend/Playwright; no rate-limit 429 (unreachable under `Testing`).
- This phase writes ONLY the proposal.

## Capabilities

### New Capabilities
None — coverage closure, no new behavioral domain.

### Modified Capabilities
None — no requirement changes; coverage tracked in `docs/testing/`, not `openspec/specs/`. sdd-spec has no delta.

## Approach

Register → read-DB → cleanup per fact (mirrors `AuthRegisterSuccessTests.cs`):
1. `POST /api/v1/auth/register`; deserialize `ApiResponse<AuthDto>`.
2. Reads via scope + `IgnoreQueryFilters().AsNoTracking()`; scope by `GetUserByLoginAsync(...).TenantId`.
3. Fact 4 derives expected ids at runtime (replicate `ModuleRepository.cs:17-23` filter in the query; DB over auth-gated endpoint); set equality + ≥1 paid; never hardcode counts.
4. `CleanupTenantCascadeAsync`; fact 6 deletes ReSellerOwner explicitly first, then cleans seeded ReSeller in its tenant.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `E2ETests/Auth/AuthRegisterDataAssertionsTests.cs` | New | 6 `[Fact]`s; existing untouched |
| `docs/testing/e2e-stage-1/S1-01.md:53-59` | Modified | checkboxes `[x]`→`[ ]` + note (docs) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ReSellerOwner cleanup: `CleanupTenantCascadeAsync` misses it; FK Restrict; UNIQUE OwnerId | High | Delete before tenant cleanup; clean seeded ReSeller separately |
| Hardcoded module counts | Med | Runtime-derived set + set equality + ≥1 paid |
| Auth-gated module endpoint | Med | Prefer DB filter replication |
| Cross-tenant reads | Med | Scope by `user.TenantId` |
| NoTracking trap | Low | `AsNoTracking()` reads only |

## Rollback Plan

`git revert` the commit — one new test file + one doc edit; no schema/config/production code.

## Dependencies

PostgreSQL `smca_test` (`WebAppFixture` applies migrations); existing helpers only (`DbTestHelpers`, patterns in `StoreCreationTrialTests`, `RegisterStorePaymentTests`, `GetReSellerCommissionsTests`).

## Success Criteria

- [ ] 6 new `[Fact]`s pass on real DB (incl. ≥1 paid module).
- [ ] Full suite green: `dotnet test backend/src/SMCA.sln`.
- [ ] Grep finds `Nombre de la tienda`/`Tienda de prueba`; `S1-01.md` checkboxes corrected.

## Proposal question round

Scope settled in exploration: 6 facts, one new file, no existing test touched. Open assumptions: (a) doc note wording; (b) fact 4 uses DB filter, not endpoint. Confirm or correct.
