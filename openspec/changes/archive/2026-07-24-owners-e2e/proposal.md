# Proposal: Owners E2E Tests

## Intent

Cover all 5 OwnersController endpoints with exhaustive E2E tests — happy paths, validation errors, handler gates, and the confirmed delete-500 NRE bug. No application code changes.

## Scope

### In Scope
- 9 test files, 22 tests total in `SMCA.WebApi.E2ETests/Owners/`
- All 5 endpoints: List, GetById, Create, Update, Delete
- Per-endpoint handler gate assertions (ReSeller vs OwnerAdmin)
- All validators: empty fields, nonexistent refs, duplicate login
- Delete-500 bug-pin (documents the NRE at `DeleteOwnerCommandHandler.cs:74`)
- Scenario gaps: ReSeller create, includeInactive toggle, CellPhone/Cellphone asymmetry

### Out of Scope
- Fixing the delete-500 NRE bug (pin only)
- No application code changes
- FeatureType.Owners without [HasModule] — future work

## Approach

Reuse existing E2E infra (WebAppFixture, StoreSeed.SeedOwnerAsync, DbTestHelpers). One file per concern: list, get-by-id, create, create-validation, update, delete, plus gap files for uncovered scenarios. Run against real Postgres `smca_test`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/SMCA.WebApi.E2ETests/Owners/` | New | 9 test files (22 tests) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Delete-500 blocks delete happy path | High | Pin as expected 500; update when bug fixed |
| CellPhone vs Cellphone naming mismatch | Low | Match exact property casing per validator |
| ReSeller fixture seeding dependency | Low | Seed inline via StoreSeed.AuthzSeed |

## Rollback Plan

Delete `backend/src/SMCA.WebApi.E2ETests/Owners/` directory. Run `dotnet test` to confirm no breakage.

## Dependencies

- E2E infra (WebAppFixture, StoreSeed, DbTestHelpers) — proven from auth/stores/users e2e suites
- No code changes needed in application layer

## Success Criteria

- [ ] All 22 tests pass on `dotnet test --filter "FullyQualifiedName~Owners"`
- [ ] Delete-500 bug pinned with expected status code and issue reference
- [ ] Each handler gate asserted for its correct role
- [ ] CellPhone/Cellphone naming asymmetry covered
