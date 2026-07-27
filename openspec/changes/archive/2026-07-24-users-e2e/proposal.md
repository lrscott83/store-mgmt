# Proposal: Users E2E Tests

## Intent

Cover all Users and StoreUsers endpoints with comprehensive E2E tests, including happy paths, validation, auth matrix, and role-based access control.

## Scope

### In Scope
- UsersController: GetAllUsers, GetById, Update, Delete, Activate, AddUserRoles, DeleteUserRoles, ChangePassword
- StoreUsersController: List, GetById, Create
- Auth matrix for each endpoint (no token, wrong role, correct role)
- SuperAdmin bypass, OwnerAdmin with UsersAdmin feature, StoreUser denial
- UserSeed helper for test fixtures
- Gap tests: includeInactive toggle, non-bool route params, verb mismatches

### Out of Scope
- StoreUsers Update/Delete (no endpoints exist)
- Password complexity validation (handler doesn't enforce it)
- Fixing the 3 known bugs (document only)

## Approach

Extend existing E2ETests project. Create Users/ folder. UserSeed helper for creating users with specific roles and stores. Reuse AuthzSeed for OwnerAdmin fixtures. TDD: write test → run → pass.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `SMCA.WebApi.E2ETests/Users/` | New | Test files |
| `SMCA.WebApi.E2ETests/Infrastructure/` | New | UserSeed.cs helper |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ActivateHandler bug complicates tests | High | Test documents behavior, don't fight it |
| StoreName Guid bug breaks assertions | Med | Assert StoreName exists, not its value |

## Rollback Plan

Delete the Users/ test folder and UserSeed.cs. Revert any infra changes.

## Success Criteria

- [ ] All Users endpoints have at least one happy-path test
- [ ] Auth matrix covers 401/403 for each endpoint
- [ ] Gap tests for edge cases (includeInactive, verb mismatch, validation)
- [ ] All tests passing on `dotnet test`