# Delta for users-e2e: GetUserById Body Coverage + Seed

**Domain**: `users-e2e` — `UserSeed.cs` + `UsersGetByIdTests.cs`
**Change**: `get-user-by-id-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## ADDED Requirements

### Requirement: E2E-G1 — StoreUser Row in `SeedOwnerAdminWithStoreAsync`

`UserSeed.SeedOwnerAdminWithStoreAsync` MUST add a `StoreUser.Create(user.Id, store.Id, tenantId)` row after the Store is created, completing the User → StoreUser → Store → Owner → User graph so `ownerName`/`storeName` resolve in GetUserById responses.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Graph seeded | `SeedOwnerAdminWithStoreAsync` runs | Seed completes | StoreUser row exists linking seeded user and store |
| 1b | Existing tests unaffected | UsersList/UsersUpdate tests seed the same fixture | Tests run | Additive row only — no assertions on absence of StoreUser break |

### Requirement: E2E-G2 — Body-Asserting GetUserById Test (RED → GREEN)

`UsersGetByIdTests` MUST add exactly ONE test where a SuperAdmin actor fetches the seeded OwnerAdmin target (actor ≠ target — self-lookup would let EF fixup mask the missing include). The test MUST assert HTTP 200 and response body: `Data.Id == target.Id`, `ownerName == "E2E OwnerAdmin"`, `storeName` not null, `roleNames` contains "OwnerAdmin". This test MUST FAIL (RED) before the include-chain fix (repository delta RR-G2) and PASS (GREEN) after.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | RED before fix | Seed graph present; `GetUserByIdIncludingStoreAndRoles` still missing `.ThenInclude(o => o.User)` | Test executes | `ownerName` is null; assertion fails (ownerName != "E2E OwnerAdmin") |
| 2b | GREEN after fix | Include chain fixed via `IncludeStoreAndRoles` helper | Test executes | 200; `Data.Id` matches; `ownerName == "E2E OwnerAdmin"`; `storeName` not null; `roleNames` contains "OwnerAdmin" |
| 2c | Fixup not masked | Actor (SuperAdmin) differs from target (OwnerAdmin) | Test executes | No EF identity-map fixup can supply `Owner.User` on the target — assertion is real |

## MODIFIED Requirements

### Requirement: E2E-G3 — Pending Archive Alignment: users-e2e R2 Non-Existent Id → 400

(Pending at ARCHIVE time, decision D7 — the main spec MUST NOT be changed in this change.)

The main `openspec/specs/users-e2e/spec.md` R2 row "Non-existent id | SuperAdmin | 404" contradicts the chosen contract (400 via validator, D1=A) and the existing test `Get_nonexistent_id_returns_400` (already asserts 400). At archive, that row MUST be aligned to 400. Documented here as pending alignment; the `Get_nonexistent_id_returns_400` test itself stays unchanged.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Contract holds | Non-existent id requested | Test `Get_nonexistent_id_returns_400` runs | Returns 400 Bad Request (unchanged) |
| 3b | Archive alignment | This change archived | users-e2e main spec updated | R2 "Non-existent id" row reads 400, matching test and contract |

## Verification Criteria

- [ ] New body test FAILS on pre-fix code, PASSES after fix (`ownerName == "E2E OwnerAdmin"`)
- [ ] `dotnet test`: UsersGetByIdTests, UsersListTests, UsersUpdateTests all pass post-fix
- [ ] Main users-e2e spec untouched during this change (R2:46 alignment deferred to archive)
