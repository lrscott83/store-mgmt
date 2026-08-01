# Proposal: Activate User Endpoint Fixes

## Intent
Fix 6 review findings on `POST /api/v1/users/activate`: 400-masked 403, unreachable 404, ignored `IsActive`, validator double round-trip, missing Swagger metadata, namespace drift. Plus bonus guard fix on `ActivateStoreCommand`. Mirrors archived `delete-user-endpoint-fixes`.

## Scope
**In:**
- **F1-F3** `ActivateUserCommand.cs`: guard FIRST `DontHavePermission`+403; null→`UserNotFound`+404; `user.IsActive = request.IsActive`; KEEP `UpdateAsync`+`SaveChangesAsync(ct)` (NoTracking)
- **F4** `ActivateUserCommandValidator.cs`: remove `MustAsync(UserExists)`+method+`_userRepository`+`using`; structural `NotNull().NotEmpty()` only; drop ctor dep
- **F6** namespaces (command+validator) + `UsersController.cs:3` → `UserManagement.Users.Commands.ActivateUser` (grep: 3 refs only)
- **F5** `ActivateUserAsync` (:92-98): add `[ProducesResponseType]` 400/401/403/404 (mirror `DeleteUserAsync`; `[FromBody]` present)
- **Bonus** `ActivateStoreCommand.cs:46-47`: guard→`DontHavePermission`+403; ADD null check→`StoreNotFound`+404 (none today — NRE risk); validator: remove `StoreExists`+`_storeByIdService`
- **E2E** `UsersActivateTests.cs`: rewrite, 4 tests
- **Specs** deltas: users-e2e R5, command-handler, validation, api-controller; plan doc row 19→Done

**E2E (4):** (a) `Activate_false_deactivates` RED→GREEN, replaces bug test, asserts DB false; (b) `Activate_true_activates` happy path; (c) `Activate_nonexistent_returns_404` flip (mirror `UsersDeleteTests:46-60`); (d) `Activate_as_store_user_with_users_feature_returns_403` via `SeedStoreUserAsync((int)FeatureType.Users)` + `CleanupStoreGraphAsync` (mirror :70-88). Asserts: status + `Succeeded==false` + `Errors.NotBeEmpty()` — never localized Description.

**Out:**
- ActivateStore: no F1 (command `(Guid Id)` has no flag); no F5/E2E (dead code — zero callers, grep-verified; `ApproveStore` self-contained); over-fetch swap deferred
- 401 test; self-delete guard (not flagged)
- **Spec reversal** `users-e2e/spec.md:20`: fixes known bug #1 + 400-guard bug; flip line 81 (KNOWN BUG row), remove line 163 (bugs table), ADD R5 non-existent→404 row

## Risks
| Risk | Mitigation |
|---|---|
| Dirty tree — don't clobber uncommitted `UpdatedAsync` (:59-70) + `DeleteUserAsync` (:77-87) | Additive edits only |
| NoTracking: dropping `UpdateAsync` → silent no-op | Keep it |
| Culture-coupled asserts | Status+envelope only |
| F6 compile break | 3 refs, rename in batch |
| Bonus rule-removal w/o null-check → 500 | Same edit |

## Rollback
Restore validator rule, hardcoded true, 400 guards; namespace revert = 3 edits. Behavior-only, no data impact.

## Dependencies
None. `DontHavePermission` in both resx; `UserNotFound`/`StoreNotFound` already used.

## Success Criteria
- [ ] 4 E2E RED→GREEN; users suite GREEN (incl. UsersDeleteTests regression)
- [ ] Swagger 400/401/403/404 on activate
- [ ] ActivateStore builds
