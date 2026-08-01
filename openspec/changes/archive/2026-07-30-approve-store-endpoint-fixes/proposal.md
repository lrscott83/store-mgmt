# Proposal: Approve / Disapprove Store Endpoint Fixes

## Intent

Fix 8 issues (double DB query, over-fetching, dead auth guard, missing null check, missing ProducesResponseType, missing XML doc, missing [FromBody], misleading test name) in BOTH ApproveStore and DisapproveStore endpoints, aligning with patterns established by 3 prior endpoint fix changes.

## Scope

### In Scope
- **Validator**: Remove `StoreExists` rule (double query) from both `ApproveStoreCommandValidator` and `DisapproveStoreCommandValidator`. Remove unused `_storeByIdService` dependency.
- **Handler**: Replace `GetStoreByIdIncludingModulesAsync` with lightweight `GetStoreByIdAsync`. Add null check → 404. Remove dead `IsSuperAdminOrOwnerAdmin` auth check. Remove unused constructor deps.
- **Controller**: Add `[FromBody]`, XML `<summary>`, and `[ProducesResponseType(400, 401, 403, 404)]` to both actions.
- **Tests**: Rename `Approve_already_approved_returns_succeeded_data_false` → `Approve_already_approved_returns_succeeded_true`.

### Out of Scope
- DisapproveStore tests (no test naming issues identified yet)
- Other controllers or endpoints not listed
- `ExistsAsync` changes on repository (already exists, no change needed)

## Approach

Approach A from exploration: Full fix on both endpoints, aligned with delete-store pattern. Validator removes existence check entirely (handler null check = only gate). Handler uses lightweight `GetStoreByIdAsync` with null check → 404. Dead auth code removed. Controller gets missing attributes. Mirror all fixes to DisapproveStore.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/Application/.../ApproveStore/ApproveStoreCommand.cs` | Modified | Lightweight load, null check, remove dead auth |
| `src/Application/.../ApproveStore/ApproveStoreCommandValidator.cs` | Modified | Remove StoreExists, remove unused deps |
| `src/Application/.../DisapproveStore/DisapproveStoreCommand.cs` | Modified | Same fixes as ApproveStore handler |
| `src/Application/.../DisapproveStore/DisapproveStoreCommandValidator.cs` | Modified | Same fix as ApproveStore validator |
| `src/SMCA.WebApi/Controllers/v1/StoresController.cs` | Modified | [FromBody], XML doc, ProducesResponseType on both actions |
| `src/SMCA.WebApi.E2ETests/Stores/StoreApproveTests.cs` | Modified | Fix test name |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Removing validator StoreExists returns 404 instead of 400 validation error | Low | Established pattern from 3 prior changes. Clients already handle 404. |
| Removing handler auth check removes defense-in-depth | Low | `[HasPermission]` attribute enforces. Pattern from update-store and delete-store. |
| Null check catches race condition but returns 404 (stale client) | Low | Correct HTTP semantics — resource doesn't exist at time of request. |

## Rollback Plan

Revert individual file changes via `git checkout -- <file>` on each modified file. All changes are surgical (no schema, config, or new files). A full revert is `git revert <commit-hash>`.

## Dependencies

- `IStoreRepository.GetStoreByIdAsync` — already exists
- `IStoreRepository.ExistsAsync` — already exists (not used in this approach)

## Success Criteria

- [ ] Both validators have no `StoreExists` rule, only `NotNull`/`NotEmpty`
- [ ] Both handlers use `GetStoreByIdAsync`, have null check → 404, no dead auth code
- [ ] Both controller actions have `[FromBody]`, XML doc, and `[ProducesResponseType(400, 401, 403, 404)]`
- [ ] Test name matches its assertion (`...returns_succeeded_true`)
- [ ] All existing tests pass (no behavioral change beyond race-condition 404)
