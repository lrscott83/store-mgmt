# Archive Report: users-e2e

**Archived**: 2026-07-24
**Mode**: hybrid (openspec + engram)
**Verdict**: PASS WITH WARNINGS (from verify-report)

---

## Executive Summary

Users and StoreUsers E2E test suite fully implemented and verified. 39 new test files across 9 files in `backend/src/SMCA.WebApi.E2ETests/Users/`, 1 new helper (`UserSeed.cs`), 3 source bugs found and fixed during implementation. Full suite: 123/123 tests pass. Spec merged to main at `openspec/specs/users-e2e/spec.md`.

---

## Artifacts

| Artifact | Filesystem | Status |
|----------|-----------|--------|
| Proposal | `openspec/changes/archive/2026-07-24-users-e2e/proposal.md` | ✅ |
| Spec (delta) | `openspec/changes/archive/2026-07-24-users-e2e/spec.md` | ✅ |
| Design | `openspec/changes/archive/2026-07-24-users-e2e/design.md` | ✅ |
| Tasks | `openspec/changes/archive/2026-07-24-users-e2e/tasks.md` | ✅ (10/10 complete) |
| Verify Report | `openspec/changes/archive/2026-07-24-users-e2e/verify-report.md` | ✅ |
| Archive Report | `openspec/changes/archive/2026-07-24-users-e2e/archive-report.md` | ✅ |
| Main Spec | `openspec/specs/users-e2e/spec.md` | ✅ Created (was no existing main spec) |

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| users-e2e | Created | Full spec copied from delta (no existing main spec). 11 requirement groups (R1–R11), 78 scenarios, 2 known bugs documented. |

---

## Implementation Summary

### Test Files Created (9 files, ~39 tests)
- `Users/UsersListTests.cs` — GetAllUsers happy path, auth matrix, includeInactive toggle, non-bool param, malformed token
- `Users/UsersGetByIdTests.cs` — GetById existing user, 403, 401, non-existent
- `Users/UsersUpdateTests.cs` — Update name, OwnerAdmin auth, 403, 401, empty body, non-existent
- `Users/UsersDeleteTests.cs` — Soft-delete with DB verification, 401, non-existent
- `Users/UsersActivateTests.cs` — Activate known bug (always sets IsActive=true), non-existent
- `Users/UsersRolesTests.cs` — Add/Delete roles, empty RoleIds, non-existent role, non-existent user
- `Users/UsersChangePasswordTests.cs` — Correct/wrong old password, 403, 401
- `Users/StoreUsersListTests.cs` — List SA, 403, 401, non-bool includeInactive, malformed token
- `Users/StoreUsersCrudTests.cs` — Create valid, GetById, duplicate login, 401

### Helper Created
- `Infrastructure/UserSeed.cs` — `SeedOwnerAdminWithStoreAsync`, `DeactivateUserAsync`, `UserWithRolesFixture` record

### Bugs Found & Fixed
| # | Bug | Fix |
|---|-----|-----|
| 1 | JWT OnChallenge handler: no-token returned 200 instead of 401 | Added `context.Response.StatusCode = 401` before `HandleResponse()` |
| 2 | ActivateUserCommandValidator: wrong base class type parameter | Changed to `AbstractValidator<ActivateUserCommand>` |
| 3 | ActivateUser/DeleteUser handlers: NRE on null user fetch | Added null check with `throw ApiException(400)` |

### Test Results
- **Total suite**: 123/123 passed
- **Users E2E**: 39 tests (subset of 123)
- **Build**: 0 errors, 0 warnings

---

## Verification Notes

- **Compliance**: 38/78 spec scenarios covered (49%) — by design per task scope, not a defect
- **Tasks**: 10/10 complete (all `[x]` checked)
- **Risks at archive time**: None critical. Documented warnings about spec coverage gaps and design deviations.
- **No commit or push performed** per archive instructions.

---

## Lineage

- Engram observation IDs: Not applicable (engram was not used during this change's lifecycle)
- Filesystem artifacts: All preserved in `openspec/changes/archive/2026-07-24-users-e2e/`
- Main spec: `openspec/specs/users-e2e/spec.md`
