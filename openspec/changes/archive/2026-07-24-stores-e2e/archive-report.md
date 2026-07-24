# Archive Report: stores-e2e

## Summary
Implemented full e2e test suite for 6 StoresController endpoints: by-current-user, get-by-id, create, update, approve, disapprove. Includes full authorization matrix (SuperAdmin, OwnerAdmin, StoreUser, ReSeller) and validation coverage.

## Tests
- StoresHarnessSmokeTests: 1 test
- StoresByCurrentUserTests: 4 tests
- StoreGetByIdTests: 4 tests
- StoreCreateTests: 8 tests
- StoreUpdateTests: 10 tests
- StoreApproveTests: 5 tests
- StoreDisapproveTests: 5 tests
- StoreAuthorizationTests: 4 tests
- StoreRoleAccessTests: 2 tests
- Auth tests (existing): 28 tests
- **Total: 71 tests, all passing**

## Files Created
- Infrastructure/StoreSeed.cs
- Stores/StoresHarnessSmokeTests.cs
- Stores/StoresByCurrentUserTests.cs
- Stores/StoreGetByIdTests.cs
- Stores/StoreCreateTests.cs
- Stores/StoreUpdateTests.cs
- Stores/StoreApproveTests.cs
- Stores/StoreDisapproveTests.cs
- Stores/StoreAuthorizationTests.cs
- Stores/StoreRoleAccessTests.cs

## Files Modified
- Infrastructure/TestDtos.cs (added StoreData, ModuleData)
- Infrastructure/DbTestHelpers.cs (added SeedUserWithRoleAsync, AuthedClient)
- Infrastructure/StoreSeed.cs (fixed DeactivateStoreAsync with AsTracking)

## Known Bugs Pinned
1. Duplicate store names succeed (IsUniqueName checks User.Login)
2. SuperAdmin PUT without PaymentStartDate → misleading UserNotFound
3. OwnerAdmin PUT drops SuperAdmin-only fields
4. Approve/disapprove no-op returns data=true (no no-op detection in handlers)

## Artifacts
- proposal.md ✅
- spec.md ✅
- design.md ✅
- tasks.md ✅