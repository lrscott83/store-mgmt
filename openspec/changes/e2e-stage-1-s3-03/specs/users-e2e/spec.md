# Delta for users-e2e: Cross-Tenant / Cross-Store Isolation on PUT /v1/users/{id}

**Change**: `e2e-stage-1-s3-03`

## ADDED Requirements

### Requirement: E2E-I1 — Cross-Tenant PUT → Envelope 404 + No DB Write (RED, documented)

New test `Update_owner_admin_updates_user_in_other_tenant_returns_envelope_404` MUST assert the cross-tenant isolation invariant on `PUT /v1/users/{id}`: an OwnerAdmin caller from the default tenant updating a user whose `TenantId` differs from the caller's MUST receive HTTP 200 (controller always `Ok`) + envelope `Succeeded=false` + `ActionCode=404` + error code `User.NotFound` + NO DB write (target `FullName` unchanged). The test MUST be RED today — `UpdateUserCommand` resolves via `FindAsync` (`GenericRepository.cs:82-85`), which skips the tenant query filter, so current behavior is HTTP 200 + `Succeeded=true` + the write persists. This RED is user-approved and documented: the verify phase records a documented `fail` (AUTH-INV-01 precedent — the red is the defect, not the test) and the change is NOT blocked. Coupling: the future fix MUST mirror `UpdateUserPasswordCommand.cs:62-64` (TenantId-only guard) and MUST NOT block the legit same-tenant path (E2E-I2).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | RED today | OwnerAdmin caller in DefaultTenant; victim user with `TenantId` ≠ caller's | PUT victim id `{FullName}` | (Today) HTTP 200 + `Succeeded=true` + `FullName` written — invariant assertions fail (documented RED) |
| 1b | Invariant holds (post-fix) | Same setup; tenant guard shipped | PUT victim id `{FullName}` | HTTP 200; `Succeeded=false`; `ActionCode=404`; `Errors` contains `User.NotFound`; DB `FullName` unchanged |

### Requirement: E2E-I2 — Same-Tenant Cross-Store PUT → 200 + Write Persists (GREEN)

New test `Update_owner_admin_updates_user_in_other_store_returns_200` MUST assert that an OwnerAdmin caller CAN update a user in a DIFFERENT store of the SAME tenant: HTTP 200 + envelope `Succeeded=true` + the DB write persists (target `FullName` changed). Isolation on `PUT /v1/users/{id}` is tenant-only, NOT store-level — the handler MUST NOT inspect `StoreUser`/`StoreId`. GREEN today; pins the same-tenant path so a future tenant-scope guard does not over-block.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Cross-store same-tenant | OwnerAdmin caller (DefaultTenant, Store A); StoreUser target (same DefaultTenant, Store B ≠ A) | PUT target id `{FullName}` | HTTP 200; `Succeeded=true`; DB `FullName` changed |

## Assert Style

Status code + envelope structure + stable `Code` keys only. NEVER assert localized `Description` (culture coupling — delete-user Batch B regression). DB asserts via `DbTestHelpers.GetUserByLoginAsync` (`IgnoreQueryFilters`).

### Verification Criteria

- [ ] Test 2 GREEN; Test 1 fails exactly on the invariant (documented RED)
- [ ] Verify report records the documented fail; change not blocked
- [ ] Zero edits to existing E2E tests; zero production code changes
